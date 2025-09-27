import { FrontConnector } from "./connector";
import { FrontExport } from "./export";
import { Logger } from "./logging";
import { ExportOptions } from './types';

var colors = require('@colors/colors');
const log = Logger.getLogger("M");

/**
* The export options specify whether to include messages, comments, and attachments in the export process, and whether to export messages as EML files.
*/
import 'dotenv/config';
import * as env from 'env-var';
const options: ExportOptions = {
    includeMessages: env.get('INCLUDEMESSAGES').default('true').required().asBool(),
    exportAsEML: env.get('EXPORTASEML').default('true').required().asBool(),
    includeAttachments: env.get('INCLUDEATTACHMENTS').default('false').required().asBool(),
    includeComments: env.get('INCLUDECOMMENTS').default('false').required().asBool(),
}

// List all inboxes available to the API key
export function listInboxes() {
    log.info(`Listing Inboxes...`);
    FrontExport.listInboxes()
        .then(inboxes => {
            console.log(colors.yellow.underline("ID"), "\t\t", colors.blue.underline("Name"));
            for (const inbox of inboxes) {
                console.log(colors.yellow(inbox.id), "\t", colors.blue(inbox.name));
                log.debug(`${inbox.id} \t ${inbox.name}`);
            }
        })
        .catch(error => {
            log.error("Error listing inboxes:", error.message);
            console.log(colors.red(`Failed to list inboxes: ${error.message}`));
            process.exit(1);
        });
}

// Export ALL conversations from ALL inboxes available to the API key
export async function exportAll(shouldResume: any) {
    // Warning: May take a very long time to complete!
    try {
        const inboxes = await FrontExport.listInboxes();

        console.log(colors.magenta.bold(`\n📦 Starting export for ${inboxes.length} inboxes`));
        console.log(colors.gray('='.repeat(60)));

        let totalProcessedAcrossAllInboxes = 0;
        let successfulInboxes = 0;
        let failedInboxes = 0;

        for (let i = 0; i < inboxes.length; i++) {
            const inbox = inboxes[i];
            const inboxNumber = i + 1;

            console.log(colors.blue.bold(`\n[${inboxNumber}/${inboxes.length}] 📥 ${inbox.name}`));
            console.log(colors.gray(`Inbox ID: ${inbox.id}`));
            console.log(colors.gray('-'.repeat(50)));

            try {
                const totalProcessed = await FrontExport.exportInboxConversations(inbox, options, shouldResume);
                totalProcessedAcrossAllInboxes += totalProcessed;
                successfulInboxes++;

                console.log(colors.green(`✅ [${inboxNumber}/${inboxes.length}] Completed: ${inbox.name} (${totalProcessed} conversations)`));
            } catch (inboxError: any) {
                failedInboxes++;
                console.log(colors.red(`❌ [${inboxNumber}/${inboxes.length}] Failed: ${inbox.name} - ${inboxError.message}`));
                log.error(`Error exporting inbox ${inbox.id}:`, inboxError);
            }
        }

        // Final summary
        console.log(colors.gray('\n' + '='.repeat(60)));
        console.log(colors.green.bold('🎉 EXPORT SUMMARY'));
        console.log(colors.cyan(`📊 Total inboxes processed: ${inboxes.length}`));
        console.log(colors.green(`✅ Successful: ${successfulInboxes}`));
        if (failedInboxes > 0) {
            console.log(colors.red(`❌ Failed: ${failedInboxes}`));
        }
        console.log(colors.magenta(`📈 Total conversations exported: ${totalProcessedAcrossAllInboxes}`));
        console.log(colors.gray('='.repeat(60)));

    } catch (error: any) {
        log.error("Error exporting conversations:", error.message);
        console.log(colors.red(`Failed to export: ${error.message}`));
        process.exit(1);
    }
}

// Export all conversations from a specific inbox, for example, an inbox with ID 'inb_abc'
export async function exportFromInbox(inboxID: string, shouldResume: any) {
    try {
        const inboxes = await FrontExport.listInboxes();
        const inboxToExport = inboxes.find(inbox => inbox.id === inboxID);

        if (inboxToExport) {
            console.log(colors.blue(`\nStarting export for inbox: ${inboxToExport.name} (${inboxToExport.id})`));
            const totalProcessed = await FrontExport.exportInboxConversations(inboxToExport, options, shouldResume);
            console.log(colors.green(`✅ Export completed! Total processed: ${totalProcessed}`));
            log.info(`Total Exported: ${totalProcessed}`);
        } else {
            throw new Error(`Inbox with ID ${inboxID} not found.`);
        }
    } catch (error: any) {
        log.error("Error exporting conversations:", error.message);
        console.log(colors.red(`Failed to export: ${error.message}`));
        process.exit(1);
    }
}

// Check current API rate limit status
export async function checkRateLimit() {
    try {
        console.log(colors.blue.bold('🔍 Checking Front API Rate Limit Status...'));
        console.log(colors.gray('='.repeat(50)));

        // Make a simple API request to get current rate limit info
        const inboxes = await FrontExport.listInboxes();

        const rateLimitInfo = FrontConnector.getCurrentRateLimit();

        if (rateLimitInfo) {
            const usedRequests = rateLimitInfo.limit - rateLimitInfo.remaining;
            const usagePercentage = (usedRequests / rateLimitInfo.limit * 100).toFixed(1);

            // Determine status color based on usage
            const statusColor = rateLimitInfo.remaining > rateLimitInfo.limit * 0.5 ? colors.green :
                rateLimitInfo.remaining > rateLimitInfo.limit * 0.25 ? colors.yellow : colors.red;

            console.log(statusColor.bold('📊 RATE LIMIT STATUS'));
            console.log(colors.cyan(`   Plan Limit: ${rateLimitInfo.limit} requests/minute`));
            console.log(statusColor(`   Used: ${usedRequests}/${rateLimitInfo.limit} (${usagePercentage}%)`));
            console.log(statusColor(`   Remaining: ${rateLimitInfo.remaining} requests`));

            // Show time until reset
            if (rateLimitInfo.reset) {
                const resetTime = new Date(rateLimitInfo.reset * 1000);
                const timeUntilReset = Math.max(0, rateLimitInfo.reset * 1000 - Date.now());
                const minutesUntilReset = Math.ceil(timeUntilReset / 60000);

                console.log(colors.blue(`   Resets: ${resetTime.toLocaleTimeString()} (in ${minutesUntilReset} min)`));
            }

            // Show burst information if available
            if (rateLimitInfo.burstLimit && rateLimitInfo.burstRemaining !== undefined) {
                const burstUsed = rateLimitInfo.burstLimit - rateLimitInfo.burstRemaining;
                const burstPercentage = (burstUsed / rateLimitInfo.burstLimit * 100).toFixed(1);

                console.log(colors.magenta('\\n🚀 BURST ALLOWANCE'));
                console.log(colors.cyan(`   Burst Limit: ${rateLimitInfo.burstLimit} additional requests`));
                console.log(colors.magenta(`   Used: ${burstUsed}/${rateLimitInfo.burstLimit} (${burstPercentage}%)`));
                console.log(colors.magenta(`   Remaining: ${rateLimitInfo.burstRemaining} burst requests`));
            }

            // Usage recommendations
            console.log(colors.gray('\\n' + '='.repeat(50)));
            console.log(colors.white.bold('💡 RECOMMENDATIONS'));

            if (rateLimitInfo.remaining < rateLimitInfo.limit * 0.1) {
                console.log(colors.red('   ⚠️  Very low on requests - consider waiting before large exports'));
            } else if (rateLimitInfo.remaining < rateLimitInfo.limit * 0.25) {
                console.log(colors.yellow('   ⚠️  Getting low on requests - monitor usage during exports'));
            } else {
                console.log(colors.green('   ✅ Good API quota available for exports'));
            }

            // Estimate conversations that can be exported
            const estimatedConversations = Math.floor(rateLimitInfo.remaining / 3); // Rough estimate: 3 API calls per conversation
            console.log(colors.cyan(`   📊 Estimated conversations exportable: ~${estimatedConversations}`));

        } else {
            console.log(colors.yellow('⚠️  No rate limit information available yet'));
            console.log(colors.gray('   Run an export command to populate rate limit data'));
        }

        console.log(colors.gray('\\n' + '='.repeat(50)));
        console.log(colors.blue(`✅ Found ${inboxes.length} inboxes available for export`));

    } catch (error: any) {
        log.error("Error checking rate limit:", error.message);
        console.log(colors.red(`Failed to check rate limit: ${error.message}`));
        process.exit(1);
    }
}
