# Change Log

All notable changes to the "KBot" extension will be documented in this file.

## [1.6.0] - 2025-02-10

### Fixes
- Fixed AI line numbering with explicit zero-indexed explanation in system prompt
- File contents now show line numbers (000|content) for better AI understanding
- Added validation to prevent full file replacement (rejects >80% or >50 lines changes)
- Fixed duplicate "Accept" buttons for same file
- Improved diff preview with +/- markers and 2 lines of context before/after

### Improvements
- Better diff preview shows exact changes with context
- Deduplication prevents same file appearing multiple times
- Clearer line numbering examples in system prompt

## [1.5.0] - 2025-02-08

### NEW: Cursor/Windsurf-Style Structured Editing
- Implemented precise line-level code editing instead of full file replacement
- AI now uses structured edits with `startLine`, `endLine`, `newContent` format
- Supports both JSON structured edits and unified diff format
- Cleaner Git diffs with surgical changes instead of full file rewrites
- Maintains code structure, formatting, and comments
- Backward compatible with legacy file change format

### Improvements
- Updated system prompt to emphasize structured edits over full file replacement
- Enhanced `StructuredEditManager` for precise code patching
- Better code review experience with minimal, focused diffs

## [1.4.0] - 2025-02-08

### NEW: Z.AI (GLM) Support
- Added support for Z.AI GLM models (glm-4.7, glm-4-plus, etc.)
- New provider option for Z.AI API
- Full credential management for Z.AI

### NEW: Anthropic Foundry Support
- Added support for Anthropic Foundry (Azure-hosted Claude models)
- Configure Anthropic Foundry endpoints and deployments
- Support for claude-opus-4_5-dev and other Claude models

### NEW: Manual Workspace Configuration
- Configure custom workspace directory
- Option to use auto-detect or set specific path
- Workspace configuration persists across sessions

### Improvements
- Fixed credential update bug (now can properly change API keys)
- Backup files now excluded from context
- Better UX with "Change API Key" checkbox for all providers
- Improved workspace detection - now uses current opened project
- Renamed extension from "Prime DevBot" to "KBot"

## [1.3.0] - 2025-02-08

### Improvements
- Enhanced workspace file detection
- Better context collection
- Improved file exclusion handling

## [1.2.0] - 2025-02-08

### NEW: Workspace Directory Configuration
- Configure workspace directory from UI
- Set custom workspace or use auto-detect
- Workspace settings shown in Credentials panel

### Improvements
- Fixed workspace path to use current working directory by default
- Better workspace detection when opening projects

## [1.1.8] - 2025-02-04

### NEW: Shell Command Execution
- AI can now execute shell commands automatically
- Commands run in workspace directory
- Full output logging and display
- Security: All commands logged and visible

### Other Improvements
- Enhanced workspace file detection (dynamic path resolution)
- Improved file collection logging
- Better context from workspace files

## [1.1.7] - 2025-02-04

### Bug Fixes
- Fixed workspace path detection
- Made workspace root detection dynamic
- Improved path resolution

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
- `KBot: Open KBot Chat` - Open the chat panel
- `KBot: Configure KBot Credentials` - Set up Azure OpenAI credentials
- `KBot: Clear Chat History` - Clear all conversation history
- `KBot: Export Chat History` - Export chat to JSON file
- `KBot: Rollback Last Changes` - Undo last applied changes

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
