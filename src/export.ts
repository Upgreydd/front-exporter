import fs from 'fs-extra';
import { FrontConnector } from './connector';
import { exportAttachment, exportComment, exportConversation, exportEMLMessage, exportInbox, exportMessage } from './helpers';
import { Logger } from "./logging";
import { Attachment, Comment, Conversation, ExportOptions, Inbox, Message } from './types';
const cliProgress = require('cli-progress');

var colors = require('@colors/colors');
const log = Logger.getLogger("E");

export class FrontExport {

    /**
    * Lists all inboxes for the company.
    *
    * @returns An array of inbox objects.
    */
    public static async listInboxes(): Promise<Inbox[]> {
        return FrontConnector.makePaginatedAPIRequest<Inbox>(`https://api2.frontapp.com/inboxes`);
    }

    /**
    * Exports all conversations for an inbox using memory-efficient streaming.
    *
    * @param inbox - The inbox object to export conversations from.
    * @param options - An optional object containing export options.
    * @param shouldResume - A boolean indicating whether to resume the export process from a previous state.
    * @returns A Promise that resolves to the total number of conversations processed.
    */
    public static async exportInboxConversations(inbox: Inbox, options?: ExportOptions, shouldResume?: boolean): Promise<number> {
        const inboxPath = `./export/${inbox.name.replace(/ /g, '_')}`;
        const outputFilePath = `${inboxPath}/${inbox.id}.json`;
        const progressFilePath = `${inboxPath}/progress.log`;

        // check if a directory for the inbox exists, if not, create it
        if (!exportInbox(inboxPath, inbox)) {
            throw new Error(`Unable to create directory for inbox: ${inbox.id}`);
        }

        // Load existing progress if resuming
        let processedConversations = new Set<string>();
        if (shouldResume && fs.existsSync(progressFilePath)) {
            const progressContent = fs.readFileSync(progressFilePath, 'utf8');
            processedConversations = new Set(progressContent.split('\n').map((id: string) => id.trim()).filter((id: string) => id));
            log.info(`Resuming export. Already processed: ${processedConversations.size} conversations`);
        }

        let totalConversations = 0;
        let processedCount = 0;
        let progressBar: any = null;
        let totalBatches = 0;
        let currentBatch = 0;

        // If we have a cached conversation list, validate and use it to get total count
        if (fs.existsSync(outputFilePath)) {
            if (this.isValidJsonFile(outputFilePath)) {
                console.log(colors.green(`Using existing conversation list: ${outputFilePath}`));
                const cachedData = JSON.parse(fs.readFileSync(outputFilePath, 'utf8'));
                totalConversations = cachedData.length;
            } else {
                console.log(colors.yellow(`⚠️  Cached conversation list is corrupted or incomplete`));
                console.log(colors.yellow(`🔄 Rebuilding conversation list from API...`));

                // Remove corrupted cache file to force rebuild
                fs.unlinkSync(outputFilePath);
                log.warn(`Removed corrupted cache file: ${outputFilePath}. Will rebuild from API.`);
            }
        }

        const inboxConversationsUrl = `https://api2.frontapp.com/inboxes/${inbox.id}/conversations`;
        console.log(colors.yellow(`📥 Processing conversations from inbox: ${inbox.name}`));

        // Show initial status
        if (processedConversations.size > 0) {
            console.log(colors.blue(`🔄 Resuming from ${processedConversations.size} already processed conversations`));
        }

        // Show rate limit information at start including burst capacity
        const initialRateLimit = FrontConnector.getCurrentRateLimit();
        if (initialRateLimit) {
            const regularRemaining = initialRateLimit.remaining || 0;
            const burstRemaining = initialRateLimit.burstRemaining ?? 0;
            const totalAvailable = regularRemaining + burstRemaining;

            if (burstRemaining > 0) {
                console.log(colors.cyan(`📊 API Rate Limit: ${regularRemaining}/${initialRateLimit.limit} regular + ${burstRemaining}/${initialRateLimit.burstLimit || 0} burst = ${totalAvailable} total available`));
            } else {
                console.log(colors.cyan(`📊 API Rate Limit: ${regularRemaining}/${initialRateLimit.limit} requests available`));
            }
        } await FrontConnector.processPaginatedAPIRequest<Conversation>(
            inboxConversationsUrl,
            async (conversations: Conversation[], isLastBatch: boolean) => {
                currentBatch++;

                // Initialize progress bar on first batch
                if (!progressBar) {
                    if (totalConversations > 0) {
                        // We know the total, show percentage progress
                        progressBar = new cliProgress.SingleBar({
                            format: 'Progress |' + colors.cyan('{bar}') + '| {percentage}% | {value}/{total} conversations',
                            barCompleteChar: '\u2588',
                            barIncompleteChar: '\u2591',
                            hideCursor: true
                        });
                        progressBar.start(totalConversations, processedConversations.size);
                    } else {
                        // We don't know the total, show simple counter
                        console.log(colors.blue(`📊 Processing conversations in batches...`));
                    }
                }

                // Cache conversations to file if this is first run
                if (!fs.existsSync(outputFilePath)) {
                    await this._appendConversationsToCache(outputFilePath, conversations, isLastBatch);

                    // If this was the first run and we just finished caching, update total
                    if (isLastBatch && !totalConversations) {
                        const cachedData = JSON.parse(fs.readFileSync(outputFilePath, 'utf8'));
                        totalConversations = cachedData.length;
                        console.log(colors.green(`📊 Total conversations found: ${totalConversations}`));
                    }
                }

                // Process conversations in parallel with intelligent rate limiting
                const conversationsToProcess = conversations.filter(conv => !processedConversations.has(conv.id));
                let batchProcessedCount = 0;

                console.log(colors.gray(`🔄 Processing batch ${currentBatch} (${conversationsToProcess.length} new conversations)...`));

                // Determine optimal concurrency based on rate limits
                const currentRateLimit = FrontConnector.getCurrentRateLimit();
                let concurrency = this._calculateOptimalConcurrency(currentRateLimit);

                if (currentRateLimit) {
                    const regularRemaining = currentRateLimit.remaining || 0;
                    const burstRemaining = currentRateLimit.burstRemaining ?? 0;
                    const totalAvailable = regularRemaining + burstRemaining;

                    if (totalAvailable < 15) { // Warn when total available is low
                        if (burstRemaining > 0) {
                            console.log(colors.yellow(`⚠️  Low total API capacity: ${regularRemaining}/${currentRateLimit.limit} regular + ${burstRemaining}/${currentRateLimit.burstLimit || 0} burst = ${totalAvailable} remaining`));
                        } else {
                            console.log(colors.yellow(`⚠️  Low API requests: ${regularRemaining}/${currentRateLimit.limit} remaining`));
                        }
                    }
                }

                console.log(colors.blue(`⚡ Using ${concurrency} parallel workers for optimal speed`));

                // Process conversations in parallel chunks
                await this._processConversationsInParallel(
                    conversationsToProcess,
                    inboxPath,
                    options,
                    concurrency,
                    (completedConv) => {
                        // Progress callback for each completed conversation
                        processedConversations.add(completedConv.id);
                        processedCount++;
                        batchProcessedCount++;

                        if (progressBar) {
                            progressBar.increment();
                        } else if (batchProcessedCount % Math.max(1, Math.floor(conversationsToProcess.length / 10)) === 0) {
                            const rateLimitStatus = FrontConnector.getCurrentRateLimit();
                            const rateLimitText = rateLimitStatus ? ` [${rateLimitStatus.remaining}/${rateLimitStatus.limit} API calls left]` : '';
                            console.log(`${colors.cyan('▶')} Processed: ${processedCount} conversations${rateLimitText}`);
                        }
                    }
                );

                if (!progressBar) {
                    console.log(colors.green(`\n✅ Batch ${currentBatch} completed: ${batchProcessedCount} conversations processed in parallel`));
                }

                log.debug(`Processed batch ${currentBatch} of ${conversations.length} conversations. Total processed: ${processedCount}`);
            }
        );

        if (progressBar) {
            progressBar.stop();
        } else {
            console.log(); // New line after the progress counter
        }

        console.log(colors.green.bold(`🎉 Export completed for ${inbox.name}!`));
        console.log(colors.cyan(`📈 Total conversations processed: ${processedCount}`));
        if (totalConversations > 0) {
            console.log(colors.cyan(`📊 Total conversations in inbox: ${totalConversations}`));
            const completionPercentage = ((processedCount / totalConversations) * 100).toFixed(1);
            console.log(colors.cyan(`📊 Completion rate: ${completionPercentage}%`));
        }

        // Show final rate limit status and session statistics
        const rateLimitSummary = FrontConnector.getRateLimitSummary();
        console.log(colors.gray(`📊 API Usage: ${rateLimitSummary}`));

        log.info(`Export completed. Total conversations processed: ${processedCount}. ${totalConversations > 0 ? `Completion: ${((processedCount / totalConversations) * 100).toFixed(1)}%` : ''}`);
        return processedCount;
    }

    /**
    * Retrieves the list of conversation IDs that are still pending in the export process.
    *
    * @param inboxPath - The path to the inbox directory.
    * @param outputFilePath - The path to the output file containing all conversation IDs.
    * @param shouldResume - A boolean indicating whether to resume the export process from a previous state.
    * @return An array of conversation IDs that are still pending in the export process.
    */
    private static getCurrentProgress(inboxPath: string, outputFilePath: string, shouldResume?: boolean): string[] {
        const allRequired = JSON.parse(fs.readFileSync(outputFilePath, "utf8"));
        const allConversationIDs = allRequired.map((item: any) => item.id);
        const progressFilePath = `${inboxPath}/progress.log`;
        let conversationsLeft: string[];
        if (fs.existsSync(progressFilePath) && shouldResume) {
            const progressFile = fs.readFileSync(progressFilePath, "utf8")
                .toString()
                .split("\n")
                .map((id: string) => id.trim());
            conversationsLeft = allConversationIDs.filter((id: string) => !progressFile.includes(id));
        } else {
            conversationsLeft = allConversationIDs;
        }
        return conversationsLeft;
    }



    // ==============================================
    /**
    * Exports all messages for a conversation in parallel.
    *
    * @param path - The path where the conversation is located.
    * @param conversation - The conversation from which to export messages.
    * @returns A Promise that resolves to an array of Message objects.
    */
    private static async _exportConversationMessages(path: string, conversation: Conversation): Promise<Message[]> {
        const messages = await this._listConversationMessages(conversation);

        // Export messages in parallel (file I/O operations)
        await Promise.all(messages.map(async (message) => {
            const messagePath = `${path}/${message.created_at}-message-${message.id}.json`;
            exportMessage(messagePath, message);
        }));

        return messages;
    }

    /**
    * Exports all comments for a conversation in parallel.
    *
    * @param path - The path where the conversation is located.
    * @param conversation - The conversation from which to export comments.
    * @returns A Promise that resolves to an array of Comment objects.
    */
    private static async _exportConversationComments(path: string, conversation: Conversation): Promise<Comment[]> {
        const comments = await this._listConversationComments(conversation);

        // Export comments in parallel (file I/O operations)
        await Promise.all(comments.map(async (comment) => {
            const commentPath = `${path}/${comment.posted_at}-comment-${comment.id}.json`;
            exportComment(commentPath, comment);
        }));

        return comments;
    }

    /**
    * Exports all attachments for a message with parallel processing.
    *
    * @param path - The path where the conversation is located.
    * @param message - The message from which to export attachments.
    * @returns A Promise that resolves to an array of Attachment objects.
    */
    private static async _exportMessageAttachments(path: string, message: Message): Promise<Attachment[]> {
        const attachments = message.attachments || [];
        if (attachments.length === 0) {
            return attachments;
        }

        // Process attachments in parallel (limited concurrency to respect rate limits)
        const concurrency = Math.min(3, attachments.length);
        const semaphore = new Array(concurrency).fill(null);
        let currentIndex = 0;

        const processNext = async (): Promise<void> => {
            while (currentIndex < attachments.length) {
                const attachment = attachments[currentIndex++];
                const attachmentPath = `${path}/attachments/${message.id}`;

                try {
                    log.debug(`Request: ${attachment.url}`);
                    const attachmentBuffer = await FrontConnector.getAttachmentFromURL(attachment.url);
                    exportAttachment(attachmentPath, attachment, attachmentBuffer);
                } catch (error: any) {
                    log.error(`Failed to export attachment ${attachment.filename}: ${error.message}`);
                }
            }
        };

        // Start parallel workers for attachment export
        const workers = semaphore.map(() => processNext());
        await Promise.all(workers);

        return attachments;
    }

    /**
    * Exports all messages for a conversation as .eml files with controlled parallelism.
    *
    * @param path - The path where the conversation is located.
    * @param conversation - The conversation from which to export messages.
    * @returns A Promise that resolves to an array of Message objects.
    */
    private static async _exportMessagesAsEML(path: string, conversation: Conversation): Promise<Message[]> {
        const messages = await this._listConversationMessages(conversation);

        // Limit concurrency for EML exports to respect rate limits (2 concurrent requests)
        const concurrency = 2;
        const semaphore = new Array(concurrency).fill(null);
        let currentIndex = 0;

        const processNext = async (): Promise<void> => {
            while (currentIndex < messages.length) {
                const message = messages[currentIndex++];
                const messagePath = `${path}/${message.created_at}-${message.id}.eml`;
                const messageUrl = `https://api2.frontapp.com/messages/${message.id}`;

                try {
                    log.debug(`Request: ${messageUrl}`);
                    const messageBuffer = await FrontConnector.getMessageFromURL(messageUrl);
                    exportEMLMessage(messagePath, messageBuffer);
                } catch (error: any) {
                    log.error(`Failed to export EML for message ${message.id}: ${error.message}`);
                }
            }
        };

        // Start parallel workers for EML export
        const workers = semaphore.map(() => processNext());
        await Promise.all(workers);

        return messages;
    }

    /**
    * Lists all messages for a conversation.
    *
    * @param conversationId - The ID of the conversation to fetch messages for.
    * @returns A Promise that resolves to an array of Message objects.
    */
    private static async _listConversationMessages(conversation: Conversation): Promise<Message[]> {
        const url = `https://api2.frontapp.com/conversations/${conversation.id}/messages`;
        return FrontConnector.makePaginatedAPIRequest<Message>(url);
    }

    /**
    * Lists all comments for a conversation.
    *
    * @param conversationId - The ID of the conversation to fetch comments for.
    * @returns A Promise that resolves to an array of Comment objects.
    */
    private static async _listConversationComments(conversation: Conversation): Promise<Comment[]> {
        const url = `https://api2.frontapp.com/conversations/${conversation.id}/comments`;
        return FrontConnector.makePaginatedAPIRequest<Comment>(url);
    }

    /**
    * Appends conversations to cache file in streaming fashion to avoid memory issues.
    */
    private static async _appendConversationsToCache(
        outputFilePath: string,
        conversations: Conversation[],
        isLastBatch: boolean
    ): Promise<void> {
        try {
            const isFirstWrite = !fs.existsSync(outputFilePath);

            if (isFirstWrite) {
                // Write opening bracket
                await fs.writeFile(outputFilePath, '[\n');
                log.debug(`Started new cache file: ${outputFilePath}`);
            }

            for (let i = 0; i < conversations.length; i++) {
                const conversation = conversations[i];
                const jsonLine = JSON.stringify(conversation, null, 2);
                const separator = (!isFirstWrite || i > 0) ? ',\n' : '';
                await fs.appendFile(outputFilePath, separator + jsonLine);
            }

            if (isLastBatch) {
                // Write closing bracket
                await fs.appendFile(outputFilePath, '\n]');
                console.log(colors.green(`✅ Conversations cached: ${outputFilePath}`));
                log.info(`Completed conversation cache file: ${outputFilePath}`);
            } else {
                log.debug(`Appended ${conversations.length} conversations to cache (batch continuing...)`);
            }
        } catch (error: any) {
            log.error(`Failed to write to cache file ${outputFilePath}: ${error.message}`);
            // If writing fails, remove the partial file to avoid corruption
            if (fs.existsSync(outputFilePath)) {
                try {
                    fs.unlinkSync(outputFilePath);
                    log.warn(`Removed partial cache file due to write error: ${outputFilePath}`);
                } catch (unlinkError: any) {
                    log.error(`Could not remove partial cache file: ${unlinkError.message}`);
                }
            }
            throw error;
        }
    }

    /**
    * Process a single conversation with all its messages, comments, and attachments.
    */
    private static async _processConversation(
        conversation: Conversation,
        inboxPath: string,
        options?: ExportOptions
    ): Promise<void> {
        log.debug(`Processing conversation: ${conversation.id}`);

        const conversationPath = `${inboxPath}/${conversation.id}`;
        exportConversation(conversationPath, conversation);

        if (options?.includeMessages) {
            if (options?.exportAsEML) {
                const messages = await this._exportMessagesAsEML(conversationPath, conversation);
                if (options?.includeAttachments) {
                    for (const message of messages) {
                        await this._exportMessageAttachments(conversationPath, message);
                    }
                }
            } else {
                const messages = await this._exportConversationMessages(conversationPath, conversation);
                if (options?.includeAttachments) {
                    for (const message of messages) {
                        await this._exportMessageAttachments(conversationPath, message);
                    }
                }
            }
        }

        if (options?.includeComments) {
            await this._exportConversationComments(conversationPath, conversation);
        }
    }

    /**
    * Calculate optimal concurrency based on current rate limits
    */
    private static _calculateOptimalConcurrency(rateLimitInfo: any): number {
        if (!rateLimitInfo) {
            return 3; // Conservative default
        }

        // Calculate total available requests including burst capacity
        const regularRemaining = rateLimitInfo.remaining || 0;
        const burstRemaining = rateLimitInfo.burstRemaining ?? 0;
        const totalAvailable = regularRemaining + burstRemaining;

        // Calculate total capacity including burst
        const regularLimit = rateLimitInfo.limit || 50;
        const burstLimit = rateLimitInfo.burstLimit ?? 0;
        const totalCapacity = regularLimit + burstLimit;

        // Calculate percentage based on TOTAL available requests (regular + burst)
        const totalAvailablePercentage = totalCapacity > 0 ? (totalAvailable / totalCapacity) * 100 : 0;

        log.debug(`Rate limit calculation: Regular ${regularRemaining}/${regularLimit}, Burst ${burstRemaining}/${burstLimit}, Total ${totalAvailable}/${totalCapacity} (${totalAvailablePercentage.toFixed(1)}%)`);

        // Adaptive concurrency based on TOTAL available capacity (including burst)
        if (totalAvailablePercentage > 75) {
            return 8; // High concurrency when plenty of total requests available
        } else if (totalAvailablePercentage > 50) {
            return 6; // Medium-high concurrency
        } else if (totalAvailablePercentage > 25) {
            return 4; // Medium concurrency
        } else if (totalAvailablePercentage > 10) {
            return 2; // Conservative concurrency
        } else {
            return 1; // Sequential processing when very low on total requests
        }
    }

    /**
    * Process conversations in parallel with controlled concurrency
    */
    private static async _processConversationsInParallel(
        conversations: Conversation[],
        inboxPath: string,
        options: ExportOptions | undefined,
        concurrency: number,
        onProgress: (conversation: Conversation) => void
    ): Promise<void> {
        const semaphore = new Array(concurrency).fill(null);
        let currentIndex = 0;

        const processNext = async (): Promise<void> => {
            while (currentIndex < conversations.length) {
                const conversation = conversations[currentIndex++];

                try {
                    await this._processConversation(conversation, inboxPath, options);
                    await FrontExport.updateProgress(inboxPath, conversation.id);
                    onProgress(conversation);
                } catch (error: any) {
                    log.error(`Error processing conversation ${conversation.id}: ${error.message}`);
                    // Continue with other conversations even if one fails
                }
            }
        };

        // Start parallel workers
        const workers = semaphore.map(() => processNext());
        await Promise.all(workers);
    }

    /**
    * Updates the progress file for the given conversation id.
    * @param path the path to the progress file
    * @param conversationId the conversation id to update the progress for
    */
    private static async updateProgress(path: string, conversationId: any): Promise<void> {
        await fs.outputFile(`${path}/progress.log`, `${conversationId}\n`, { flag: 'a' });
    }

    /**
    * Validates if a JSON file is properly formed and complete
    * @param filePath - Path to the JSON file to validate
    * @returns true if valid, false if corrupted
    */
    private static isValidJsonFile(filePath: string): boolean {
        try {
            if (!fs.existsSync(filePath)) {
                return false;
            }

            const content = fs.readFileSync(filePath, 'utf8').trim();

            // Check if it starts with '[' and ends with ']'
            if (!content.startsWith('[') || !content.endsWith(']')) {
                log.warn(`JSON file ${filePath} has invalid structure (missing brackets)`);
                return false;
            }

            // Try to parse it
            const parsed = JSON.parse(content);

            // Verify it's an array
            if (!Array.isArray(parsed)) {
                log.warn(`JSON file ${filePath} does not contain an array`);
                return false;
            }

            return true;
        } catch (error: any) {
            log.warn(`JSON file ${filePath} validation failed: ${error.message}`);
            return false;
        }
    }

}
