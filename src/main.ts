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

        for (const inbox of inboxes) {
            console.log(colors.blue(`\nStarting export for inbox: ${inbox.name} (${inbox.id})`));
            try {
                const totalProcessed = await FrontExport.exportInboxConversations(inbox, options, shouldResume);
                console.log(colors.green(`✅ Completed export for ${inbox.name}. Total processed: ${totalProcessed}`));
            } catch (inboxError: any) {
                console.log(colors.red(`❌ Failed to export inbox ${inbox.name}: ${inboxError.message}`));
                log.error(`Error exporting inbox ${inbox.id}:`, inboxError);
            }
        }

        console.log(colors.green.bold('\n🎉 Export process completed for all inboxes!'));
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
