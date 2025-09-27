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

        // If we have a cached conversation list, use it to get total count
        if (fs.existsSync(outputFilePath)) {
            console.log(colors.green(`Using existing conversation list: ${outputFilePath}`));
            const cachedData = JSON.parse(fs.readFileSync(outputFilePath, 'utf8'));
            totalConversations = cachedData.length;
        }

        const inboxConversationsUrl = `https://api2.frontapp.com/inboxes/${inbox.id}/conversations`;
        log.warn(`Processing conversations from API...`);

        await FrontConnector.processPaginatedAPIRequest<Conversation>(
            inboxConversationsUrl,
            async (conversations: Conversation[], isLastBatch: boolean) => {
                // Initialize progress bar on first batch if we know total
                if (!progressBar && totalConversations > 0) {
                    progressBar = new cliProgress.SingleBar({
                        format: 'Progress |' + colors.cyan('{bar}') + '| {percentage}% | {value}/{total}',
                        barCompleteChar: '\u2588',
                        barIncompleteChar: '\u2591',
                        hideCursor: true
                    });
                    progressBar.start(totalConversations, processedConversations.size);
                }

                // Cache conversations to file if this is first run
                if (!fs.existsSync(outputFilePath)) {
                    await this._appendConversationsToCache(outputFilePath, conversations, isLastBatch);
                }

                // Process each conversation in this batch
                for (const conversation of conversations) {
                    if (!processedConversations.has(conversation.id)) {
                        await this._processConversation(conversation, inboxPath, options);
                        await FrontExport.updateProgress(inboxPath, conversation.id);
                        processedConversations.add(conversation.id);
                        processedCount++;

                        if (progressBar) {
                            progressBar.increment();
                        }
                    }
                }

                log.debug(`Processed batch of ${conversations.length} conversations. Total processed: ${processedCount}`);
            }
        );

        if (progressBar) {
            progressBar.stop();
        }

        log.info(`Export completed. Total conversations processed: ${processedCount}`);
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
    * Exports all messages for a conversation.
    *
    * @param path - The path where the conversation is located.
    * @param conversation - The conversation from which to export messages.
    * @returns A Promise that resolves to an array of Message objects.
    */
    private static async _exportConversationMessages(path: string, conversation: Conversation): Promise<Message[]> {
        const messages = await this._listConversationMessages(conversation);
        for (const message of messages) {
            const messagePath = `${path}/${message.created_at}-message-${message.id}.json`;
            exportMessage(messagePath, message);
        }
        return messages;
    }

    /**
    * Exports all comments for a conversation.
    *
    * @param path - The path where the conversation is located.
    * @param conversation - The conversation from which to export comments.
    * @returns A Promise that resolves to an array of Comment objects.
    */
    private static async _exportConversationComments(path: string, conversation: Conversation): Promise<Comment[]> {
        const comments = await this._listConversationComments(conversation);
        for (const comment of comments) {
            const commentPath = `${path}/${comment.posted_at}-comment-${comment.id}.json`;
            exportComment(commentPath, comment);
        }
        return comments;
    }

    /**
    * Exports all attachments for a message.
    *
    * @param path - The path where the conversation is located.
    * @param message - The message from which to export attachments.
    * @returns A Promise that resolves to an array of Attachment objects.
    */
    private static async _exportMessageAttachments(path: string, message: Message): Promise<Attachment[]> {
        for (const attachment of message.attachments) {
            const attachmentPath = `${path}/attachments/${message.id}`;
            const attachmentBuffer = await FrontConnector.getAttachmentFromURL(attachment.url);
            log.debug(`Request: ${attachment.url}`);
            exportAttachment(attachmentPath, attachment, attachmentBuffer);
        }
        return message.attachments;
    }

    /**
    * Exports all messages for a conversation as .eml files.
    *
    * @param path - The path where the conversation is located.
    * @param conversation - The conversation from which to export messages.
    * @returns A Promise that resolves to an array of Message objects.
    */
    private static async _exportMessagesAsEML(path: string, conversation: Conversation): Promise<Message[]> {
        const messages = await this._listConversationMessages(conversation);
        for (const message of messages) {
            const messagePath = `${path}/${message.created_at}-${message.id}.eml`;
            const messageUrl = `https://api2.frontapp.com/messages/${message.id}`;
            log.debug(`Request: ${messageUrl}`);
            const messageBuffer = await FrontConnector.getMessageFromURL(messageUrl);
            exportEMLMessage(messagePath, messageBuffer);
        }
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
        const isFirstWrite = !fs.existsSync(outputFilePath);

        if (isFirstWrite) {
            // Write opening bracket
            await fs.writeFile(outputFilePath, '[\n');
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
            console.log(colors.green(`Conversations have been saved to: ${outputFilePath}`));
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
    * Updates the progress file for the given conversation id.
    * @param path the path to the progress file
    * @param conversationId the conversation id to update the progress for
    */
    private static async updateProgress(path: string, conversationId: any): Promise<void> {
        await fs.outputFile(`${path}/progress.log`, `${conversationId}\n`, { flag: 'a' });
    }

}
