# Local Prime DevBot

**Author:** Kiran Beethoju
**License:** MIT
**Version:** 1.0.0

A Cursor-like AI coding assistant powered by Azure OpenAI. Built for developers who want intelligent code assistance without compromising privacy.

## Features

✅ **100% Local** - No telemetry, no cloud storage, no data tracking
✅ **Azure OpenAI Integration** - Use your own Azure OpenAI endpoint
✅ **Context-Aware** - Understands your entire codebase
✅ **File Operations** - Preview and apply code changes safely
✅ **Backup & Rollback** - Automatic backups before any modifications
✅ **Chat History** - Save and export your conversations
✅ **Streaming Responses** - Watch the AI think in real-time

## Privacy First

This extension is designed with privacy as the top priority:

- ❌ **No telemetry** - We don't track your usage
- ❌ **No cloud storage** - Your data stays on your machine
- ❌ **No external connections** - Only connects to your Azure endpoint
- ✅ **Local credentials** - Stored securely in VS Code's secret storage
- ✅ **Transparent** - Open source, inspect all code

Your code never leaves your machine except for Azure GPT API calls.

## Installation

### From VSIX

1. Download the latest `.vsix` file
2. In VS Code, go to **Extensions** → **Install from VSIX...**
3. Select the downloaded file

### From Source

```bash
npm install
npm run compile
npm run package
```

## Setup

### First Time Configuration

1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run `Azure GPT: Configure Azure Credentials`
3. Enter your Azure OpenAI details:
   - **Endpoint**: Your Azure OpenAI endpoint URL
   - **API Key**: Your Azure OpenAI API key
   - **Deployment Name**: Your deployment name (e.g., `gpt-4`)
   - **API Version**: API version (default: `2024-02-15-preview`)
   - **Model Name**: Model name (e.g., `gpt-4`)

### Azure OpenAI Prerequisites

You need:
- An Azure account with OpenAI access
- An Azure OpenAI resource created
- A model deployed (GPT-4 or GPT-3.5-Turbo recommended)

Get started with Azure OpenAI: [Azure OpenAI Service](https://azure.microsoft.com/en-us/products/ai-services/openai-service)

## Usage

### Opening the Chat

- Command Palette: `Azure GPT: Open Azure GPT Chat`
- Or click the Azure GPT icon in the activity bar

### Context Options

Before sending a message, choose what context to include:

- ✅ **Current File** - Include the active editor file
- ✅ **Selected Files** - Include files selected in explorer
- ✅ **Git Diff** - Include recent git changes
- ✅ **Terminal** - Include terminal output

### Example Prompts

```
"Refactor this function to be more readable"
"Add error handling to this code"
"Explain how this function works"
"Convert this to TypeScript"
"Add unit tests for this class"
"Find security vulnerabilities in this code"
```

### Applying Changes

When the AI suggests code changes:

1. Review the proposed changes in the chat
2. Click **Apply** on each file change
3. Changes are backed up automatically
4. Use `Azure GPT: Rollback Last Changes` to undo

## Commands

| Command | Description |
|---------|-------------|
| `Azure GPT: Open Azure GPT Chat` | Open the chat panel |
| `Azure GPT: Configure Azure Credentials` | Set up Azure OpenAI credentials |
| `Azure GPT: Clear Chat History` | Clear all conversation history |
| `Azure GPT: Export Chat History` | Export chat to JSON file |
| `Azure GPT: Rollback Last Changes` | Undo last applied changes |

## Data Storage

All data is stored locally on your machine:

| Data | Location |
|------|----------|
| API Key | VS Code SecretStorage (encrypted) |
| Credentials | VS Code GlobalState (local) |
| Chat History | Optional export to workspace |
| File Backups | `.local-azure-gpt-backup/` in workspace |

## Troubleshooting

### "Credentials not configured"

Run `Azure GPT: Configure Azure Credentials` and enter your Azure OpenAI details.

### "Failed to call Azure OpenAI"

Check:
- Your endpoint URL is correct
- Your API key is valid
- Your deployment name exists
- Your Azure subscription has quota

### Streaming not working

Make sure your Azure OpenAI deployment supports streaming (most do).

## Compatibility

- **VS Code**: 1.75.0 and higher
- **Platforms**: Windows, macOS, Linux
- **Azure OpenAI**: GPT-4, GPT-3.5-Turbo, GPT-4o

## Architecture

```
local-azure-gpt/
├── src/
│   ├── extension.ts      # Main entry point
│   ├── chatPanel.ts      # Chat UI (webview)
│   ├── credentials.ts    # Credential management
│   ├── azureGPT.ts       # Azure OpenAI API client
│   ├── fileManager.ts    # File operations
│   └── backupManager.ts  # Backup & rollback
├── resources/
│   └── icon.svg          # Extension icon
├── package.json          # Extension manifest
├── tsconfig.json         # TypeScript config
└── README.md             # This file
```

## Security

- API keys stored in VS Code's encrypted SecretStorage
- No credentials in plain text or logs
- File backups isolated to workspace
- No code execution without user approval
- All file changes previewed before applying

## Development

```bash
# Install dependencies
npm install

# Watch mode for development
npm run watch

# Compile
npm run compile

# Package VSIX
npm run package
```

## License

MIT License - See LICENSE file for details

## Author

**Kiran Beethoju**

- GitHub: [@kiranbeethoju](https://github.com/kiranbeethoju)

## Changelog

### 1.0.0 (2026-02-02)

- Initial release
- Azure OpenAI integration
- Chat interface with streaming
- File operations with backup
- Context-aware code assistance
- Privacy-first design

## Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Check existing discussions
- Read the code - it's open source!

## Acknowledgments

Built with:
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Azure OpenAI Service](https://azure.microsoft.com/en-us/products/ai-services/openai-service)
- [TypeScript](https://www.typescriptlang.org/)

---

**Note**: This extension is not affiliated with Cursor or Microsoft. It's an independent project designed to bring Cursor-like functionality to VS Code using Azure OpenAI.
