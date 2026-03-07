![Hackathon Logo](docs/images/hackathon.png?raw=true "Hackathon Logo")
# Sitecore Hackathon 2026

## Team name
NaN

## Category
Best Marketplace App

## Description

### Module Purpose
**AEO Helper** (Answer Engine Optimization, also known as Generative Engine Optimization) is a Sitecore Marketplace extension that leverages artificial intelligence to automatically convert Sitecore pages' HTML content into clean, structured Markdown, and to generate LLMs.txt file. This tool enables content teams to prepare their Sitecore content for AI-powered applications, documentation generation, and LLM training by providing streamlined content transformation capabilities.

### Problem Solved
Modern content management increasingly requires content to be available in machine-readable formats for AI applications, documentation systems, and large language model (LLM) training. However, Sitecore's native content is stored as rich HTML, which is difficult for AI systems to process effectively. Content teams face several challenges:

1. **Manual conversion bottleneck**: Converting HTML to Markdown for multiple pages is time-consuming and error-prone
2. **Inconsistent formatting**: Manual conversions lead to inconsistent output quality
3. **Scalability issues**: Large content libraries require automated processing
4. **Lack of AI integration**: No native Sitecore tooling for AI-ready content preparation
5. **Multi language support**: Support all available website languages in Sitecore

### How This Module Solves It
AEO Helper addresses these challenges through three integrated extension points:

1. **Fullscreen Batch Processing Dashboard**: Provides a comprehensive interface to select sites and languages, view all pages with their processing status, and batch-process hundreds of pages with a single click. Includes progress tracking, error handling, and retry capabilities.

2. **AI-Powered Custom Field Editor**: An intelligent markdown editor that can automatically generate Markdown from page HTML content on-demand. Editors can review, edit, and save the generated content directly within Sitecore.

3. **LLMs.TXT Generation**: Automatically generates `llms.txt` files that aggregate processed Markdown content for AI model consumption, with streaming output for real-time feedback.

### Key Features

- **Native Conversion Algorithms**: Aumotically convert HTML to clean Markdown (one AI is required)
- **Batch Processing**: Process hundreds of pages with progress tracking and cancellation support
- **Real-Time Status Tracking**: Visual indicators showing processed, pending, error, and no-version states
- **Language Support**: Process content in multiple languages with per-language configuration
- **Configuration Persistence**: Store API keys and field mappings as Sitecore content items
- **Streaming Output**: Watch AI generation in real-time with live streaming updates
- **Seamless Integration**: Runs as an embedded iframe within Sitecore XM Cloud

## Video link
[in progress](#video-link)

## Pre-requisites and Dependencies

### Required

- **Sitecore XM Cloud**: A Sitecore XM Cloud tenant with administrator access
- **Sitecore Marketplace**: Access to install marketplace applications
- **Node.js**: Version 18 or higher for local development
- **npm**: For package management

### Required Sitecore Modules

- **@sitecore-marketplace-sdk/client** (v0.3.2): Provides iframe communication with Sitecore host
- **@sitecore-marketplace-sdk/xmc** (v0.4.0): Server-side XMC API access
- **@auth0/auth0-react** (v2.11.0): Authentication provider

### External Dependencies

- **Vercel AI SDK** (v6.0.78): Core AI processing capabilities
- **Next.js** (v16.1.6): Application framework
- **React 19**: UI library
- **Tailwind CSS v4**: Styling

### Services Required

- **AI Gateway API Key**: Required for AI-powered content conversion. Configured via the settings modal and stored in Sitecore.
- **SSL Certificates**: For local development, self-signed certificates at `./certificates/aeo.local-key.pem` and `./certificates/aeo.local.pem` are required for HTTPS.

## Installation instructions

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd 2026-NaN/src
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Local Development SSL

Create self-signed certificates for HTTPS development:

```bash
# Create certificates directory if it doesn't exist
mkdir -p certificates

# Generate self-signed certificate (using openssl):
openssl req -x509 -newkey rsa:2048 -nodes -keyout certificates/aeo.local-key.pem -out certificates/aeo.local.pem -days 365 -subj "/CN=aeo.local"

or using makecert:
mkcert -key-file ./certificates/aeo.local-key.pem -cert-file ./certificates/aeo.local.pem aeo.local 127.0.0.1
```

### Step 4: Add Local Hosts Entry

Add `aeo.local` to your system's hosts file:

**Windows** (`C:\Windows\System32\drivers\etc\hosts`):
```
127.0.0.1 aeo.local
```

**macOS/Linux** (`/etc/hosts`):
```
127.0.0.1 aeo.local
```

### Step 5: Start Development Server

```bash
npm run dev
```

The application will be available at `https://aeo.local` with hot reloading enabled.

### Step 6: Deploy to Sitecore Marketplace

1. Build the production bundle:
   ```bash
   npm run build
   ```

2. Follow Sitecore Marketplace documentation to upload and configure your app:
   - Set the iframe URL to your deployed application
   - Configure the extension points (fullscreen, custom-field, pages-context-panel)
   - Set appropriate CSP frame-ancestors in `next.config.ts`

3. Install the app in your Sitecore XM Cloud tenant

### Configuration

#### AI Gateway Configuration

1. Open the AEO Helper application in Sitecore
2. Click the Settings icon in the top-right corner
3. Enter your AI Gateway API Key
4. Configure target field names (default: `AiMarkdown`, `AiMarkdownMeta`)
5. Save your configuration

#### Field Name Configuration

By default, the application uses the following field names:
- **Target Field**: `AiMarkdown` - Stores the generated Markdown content
- **Meta Field**: `AiMarkdownMeta` - Stores processing metadata (word count, timestamp)

These can be customized via the Settings modal.

## Usage instructions

### Fullscreen Dashboard (Batch Processing)

The fullscreen extension provides a comprehensive interface for bulk content conversion:

#### Interface Overview

![Fullscreen Dashboard](docs/images/dashboard-screenshot.png?raw=true "Fullscreen Dashboard")

1. **Header Section**: Shows total pages, processed count, and error statistics
2. **Site Selector**: Choose which Sitecore site to process
3. **Language Selector**: Filter pages by language version
4. **Generate Button**: Start batch processing of all pages
5. **LLM.TXT Button**: Generate aggregated AI-ready documentation
6. **Pages Table**: View individual page status and process individually

#### Processing Workflow

1. **Select Site and Language**: Use the dropdowns to choose your target content
2. **Review Page List**: The table shows all pages with their current status:
   - **Pending**: Page not yet processed
   - **Processed**: Successfully converted to Markdown
   - **Error**: Processing failed (click to retry)
   - **No Version**: Page has no version in selected language
3. **Generate**: Click "Generate" to batch-process all pages
   - Progress bar shows completion percentage
   - Individual pages update in real-time
   - Cancel button available to stop processing
4. **Generate LLM.TXT**: Click to create an aggregated Markdown file for AI consumption
   - Watch the streaming output in real-time
   - Result is automatically saved to the Site Grouping item

#### Status Indicators

- **Green Badge**: Page successfully processed
- **Yellow Badge**: Page awaiting processing
- **Red Badge**: Processing failed (view error in console)
- **Gray Badge**: No version exists for selected language

### Custom Field Editor (Single Page)

The custom-field extension allows individual page content conversion:

#### Using the AI Markdown Editor

1. **Open Field**: Click the custom field in Sitecore Pages editor
2. **Generate from Page**: Click "Generate from page" to convert HTML to Markdown
3. **Review and Edit**: Modify the generated Markdown as needed
4. **Word/Char Count**: View statistics at the bottom of the editor
5. **Save**: Click "Save" to persist changes back to Sitecore
6. **Cancel**: Close without saving changes

![Custom Field Editor](docs/images/custom-field-screenshot.png?raw=true "Custom Field Editor")

### Error Handling

- **Batch Errors**: Pages that fail are marked with error status and can be retried individually
- **API Key Errors**: Configure your AI Gateway key via the Settings modal
- **Version Not Found**: Select a different language or create the missing version in Sitecore

## Comments

### Technical Highlights

- **Provider Architecture**: Three-tier provider hierarchy (Marketplace → Auth → AppSettings) ensures clean separation of concerns
- **Stream Processing**: Uses Vercel AI SDK streaming capabilities for real-time AI output for LLMs.txt
- **Storage Layer**: Configuration stored as Sitecore content items for persistence across sessions
- **Type Safety**: Full TypeScript implementation with strict typing
- **Modern UI**: Built with React 19, Tailwind v4, and Radix UI components

### Known Limitations

- Processing time varies based on page complexity and AI provider response times

### Future Enhancements

- Support for custom AI model selection
- Advanced content quality metrics
- Content version comparison and diff viewer

### Support

For issues or questions during the hackathon, please contact the team via the repository issues page.
