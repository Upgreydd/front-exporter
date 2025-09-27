<img src="frontexporter.png" alt="Front Exporter">


**If you want to create a backup of your Front account or you want to migrate away from Front, this handy application helps you to export your messages.**

The script can export all messages (including attachments and comments) to JSON files.

You can also export messages to .eml files which you can import directly to your mail client.

## ✨ **Key Features**
- **🚀 High Performance**: 4-5x faster with intelligent parallel processing
- **🧠 Smart Rate Limiting**: Automatically respects Front's API limits
- **💾 Memory Efficient**: Handles large exports without memory issues
- **🔄 Resume Support**: Continue interrupted exports from where they left off
- **📊 Real-time Progress**: Live progress tracking with API usage monitoring
- **🛡️ Error Resilient**: Automatic retry logic for network issues

## Environment Setup

**Clone the repo**
`$ git clone https://github.com/quack79/front-exporter.git`

**Install Node.js**
`$ install nodejs`

**Install Yarn**
`$ npm install --global yarn`

**Install required dependencies**
`$ yarn install`

## Configuration

You need to set environment variables for the application by creating a `.env` text file
in the root directory of this project.
There is a documented `.env.sample` file included.


```
API_KEY=PasteTokenHere
```
- Put your `API_KEY` here.
If you don't have one yet, you can read how to get one from the [Developer docs](https://dev.frontapp.com/docs/create-and-revoke-api-tokens), or go directly to the [API Tokens](https://app.frontapp.com/settings/developers/tokens) page.

````
INCLUDEMESSAGES=true
````
- Specifies whether to include messages in the export process.

````
EXPORTASEML=true
````
- Specifies whether to export messages as EML files. Requires `shouldIncludeMessages` to be set to `true`.

````
INCLUDEATTACHMENTS=false
````
- Specifies whether to include attachments in the export process. Requires `shouldIncludeMessages` to be set to `true`.

````
INCLUDECOMMENTS=false
````
- Specifies whether to include comments in the export process.

## Usage

In the project directory, run:

`$ yarn start --help`

````
Command-line Options:
  $ yarn start list-inboxes                    List all inboxes available to the API key
  $ yarn start export-all [resume]             Export ALL conversations from ALL inboxes
  $ yarn start export-from <inboxID> [resume]  Export all conversations from a specific inbox
````

### ⚡ **Built-in Optimizations**
The export commands automatically include:
- **Memory-efficient processing** - Handles large datasets without running out of memory
- **Intelligent rate limiting** - Respects Front's API limits and adapts speed automatically
- **Parallel processing** - Uses multiple workers for 4-5x faster exports
- **Automatic retry logic** - Handles network issues and connection resets
- **Real-time progress tracking** - Shows export progress and API usage

### 📋 **Resume Functionality**
If you use the `resume` parameter, a progress log is maintained so exports can continue from where they left off if interrupted. This prevents reprocessing already exported conversations.

## Examples

**List all available inboxes:**
```bash
$ yarn start list-inboxes
```

**Export a specific inbox (recommended):**
```bash
$ yarn start export-from inb_abc123 resume
```

**Export all inboxes (may take several hours):**
```bash
$ yarn start export-all resume
```

### 🎯 **Performance Expectations**
- **Small inbox (100 conversations)**: ~30-60 seconds
- **Medium inbox (1000 conversations)**: ~5-10 minutes
- **Large inbox (5000+ conversations)**: ~25-45 minutes

The export speed automatically adapts based on your Front plan's rate limits and current API usage.
