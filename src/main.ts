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
export function exportAll(shouldResume: any) {
    // Warning: May take a very long time to complete!
    FrontExport.listInboxes()
        .then(inboxes => {
            for (const inbox of inboxes) {
                FrontExport.exportInboxConversations(inbox, options, shouldResume)
                    .then(conversations => {
                        log.info(`Total: ${conversations.length}`);
                    });
            }
        })
        .catch(error => {
            log.error("Error exporting conversations:", error);
        });
}

// Export all conversations from a specific inbox, for example, an inbox with ID 'inb_abc'
export function exportFromInbox(inboxID: string, shouldResume: any) {
    FrontExport.listInboxes()
        .then(inboxes => {
            const inboxToExport = inboxes.find(inbox => inbox.id === inboxID); // Export from a specific Inbox
            if (inboxToExport) {
                return FrontExport.exportInboxConversations(inboxToExport, options, shouldResume)
                    .then(conversations => {
                        log.info(`Total Exported: ${conversations.length}`);
                    });
            } else {
                throw new Error(`Inbox with ID ${inboxID} not found.`);
            }
        })
        .catch(error => {
            log.error("Error exporting conversations:", error);
        });
}
