#!/usr/bin/env node

/**
 * Utility script to check and clean up corrupted JSON cache files
 * Run this if you're getting "Unexpected end of JSON input" errors
 */

const fs = require('fs-extra');
const path = require('path');
const colors = require('@colors/colors');

async function checkAndCleanCache() {
    const exportDir = './export';

    if (!fs.existsSync(exportDir)) {
        console.log(colors.yellow('No export directory found. Nothing to check.'));
        return;
    }

    console.log(colors.blue.bold('🔍 Checking cached conversation files for corruption...'));
    console.log(colors.gray('='.repeat(60)));

    let totalFiles = 0;
    let corruptedFiles = 0;
    let cleanedFiles = 0;

    // Get all inbox directories
    const inboxDirs = fs.readdirSync(exportDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const inboxDir of inboxDirs) {
        const inboxPath = path.join(exportDir, inboxDir);

        // Look for JSON files that match the pattern inb_*.json
        const files = fs.readdirSync(inboxPath)
            .filter(file => file.startsWith('inb_') && file.endsWith('.json'));

        for (const file of files) {
            totalFiles++;
            const filePath = path.join(inboxPath, file);

            try {
                const content = fs.readFileSync(filePath, 'utf8').trim();

                // Check basic structure
                if (!content.startsWith('[') || !content.endsWith(']')) {
                    console.log(colors.red(`❌ ${inboxDir}/${file} - Missing brackets`));
                    corruptedFiles++;
                    continue;
                }

                // Try to parse
                const parsed = JSON.parse(content);

                if (!Array.isArray(parsed)) {
                    console.log(colors.red(`❌ ${inboxDir}/${file} - Not an array`));
                    corruptedFiles++;
                    continue;
                }

                console.log(colors.green(`✅ ${inboxDir}/${file} - Valid (${parsed.length} conversations)`));

            } catch (error) {
                console.log(colors.red(`❌ ${inboxDir}/${file} - ${error.message}`));
                corruptedFiles++;

                // Option to clean up corrupted files
                if (process.argv.includes('--clean')) {
                    try {
                        fs.unlinkSync(filePath);
                        console.log(colors.yellow(`   🧹 Cleaned up corrupted file`));
                        cleanedFiles++;
                    } catch (cleanError) {
                        console.log(colors.red(`   ❌ Failed to clean: ${cleanError.message}`));
                    }
                }
            }
        }
    }

    console.log(colors.gray('='.repeat(60)));
    console.log(colors.blue.bold('📊 SUMMARY'));
    console.log(colors.cyan(`Total files checked: ${totalFiles}`));
    console.log(colors.green(`Valid files: ${totalFiles - corruptedFiles}`));

    if (corruptedFiles > 0) {
        console.log(colors.red(`Corrupted files: ${corruptedFiles}`));

        if (process.argv.includes('--clean')) {
            console.log(colors.yellow(`Files cleaned: ${cleanedFiles}`));
        } else {
            console.log(colors.yellow(`\n💡 Run with --clean to automatically remove corrupted files:`));
            console.log(colors.white(`   node scripts/check-cache.js --clean`));
        }
    } else {
        console.log(colors.green.bold('🎉 All cache files are valid!'));
    }
}

// Run the check
checkAndCleanCache().catch(error => {
    console.error(colors.red('Error checking cache:'), error.message);
    process.exit(1);
});
