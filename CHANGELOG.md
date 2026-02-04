# Change Log

All notable changes to the "Local Prime DevBot" extension will be documented in this file.

## [1.0.0] - 2026-02-02

### Initial Release

#### Features
- Azure OpenAI integration for AI-powered code assistance
- Interactive chat interface with streaming responses
- Context-aware code understanding:
  - Include current file
  - Include selected files
  - Include workspace files
  - Include git diff
  - Include terminal output
- File operations with preview and apply functionality
- Automatic backup before file modifications
- Rollback functionality for undoing changes
- Chat history with export capability
- Secure credential storage using VS Code SecretStorage
- Privacy-first design: no telemetry, no cloud storage
- Full offline support (except for Azure GPT API calls)

#### Commands
- `Azure GPT: Open Azure GPT Chat` - Open the chat panel
- `Azure GPT: Configure Azure Credentials` - Set up Azure OpenAI credentials
- `Azure GPT: Clear Chat History` - Clear all conversation history
- `Azure GPT: Export Chat History` - Export chat to JSON file
- `Azure GPT: Rollback Last Changes` - Undo last applied changes

#### Technical Details
- Built with TypeScript
- Uses VS Code Extension API
- Supports VS Code 1.75.0 and higher
- Compatible with Windows, macOS, and Linux
- MIT License

#### Privacy & Security
- No telemetry or analytics
- No external connections except to user's Azure endpoint
- API keys stored in encrypted SecretStorage
- All data stored locally on user's machine
- File backups isolated to workspace directory
- No code execution without user approval

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
