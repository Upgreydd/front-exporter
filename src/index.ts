import yargs from 'yargs';
import { Logger } from "./logging";
import { exportAll, exportFromInbox, listInboxes } from "./main";

var colors = require('@colors/colors');
const log = Logger.getLogger("I");

console.log(colors.magenta.bold(`Welcome to Front Exporter`));
log.debug(`Starting Front Exporter...`);

// Define the command line options
// if there are no arguments, display the help message
if (process.argv.length <= 2) {
    yargs.showHelp();
    process.exit(0);
}

const cmdOptions = yargs
    .command('list-inboxes', 'List all inboxes available to the API key', {}, () => {
        listInboxes();
    })
    .command('export-all [resume]', 'Export all conversations from all inboxes', {}, (argv) => {
        const shouldResume = argv.resume !== undefined ? argv.resume : false;
        exportAll(shouldResume);
    })
    .command('export-from <inboxID> [resume]', 'Export all conversations from a specific inbox', (yargs) => {
        yargs.positional('inboxID', {
            describe: 'The ID of the inbox',
            type: 'string'
        });
    }, (argv) => {
        const inboxID: string = argv.inboxID as string;
        const shouldResume = argv.resume ? argv.resume : false;
        exportFromInbox(inboxID, shouldResume);
    })
    .example('$0 list-inboxes', 'List all available inboxes')
    .example('$0 export-from inb_abc123 resume', 'Export specific inbox with resume')
    .example('$0 export-all resume', 'Export all inboxes with resume')
    .help('h')
    .alias('h', 'help')
    .alias('help', 'h')
    .alias('v', 'version')
    .alias('version', 'v')
    .wrap(100)
    .argv;
