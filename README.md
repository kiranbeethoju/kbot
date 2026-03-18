# KBot

**Author:** Kiran Beethoju
**License:** MIT
**Version:** 1.9.1

A Cursor-like AI coding assistant powered by Azure OpenAI (GPT-5, GPT-4, GPT-4o), NVIDIA, Anthropic Foundry (Claude), and Z.AI (GLM). Built for developers who want intelligent code assistance with shell command execution capabilities without compromising privacy.

## Features

✅ **100% Local** - No telemetry, no cloud storage, no data tracking
✅ **Multiple Provider Support** - Azure OpenAI, NVIDIA, Anthropic Foundry, Z.AI (GLM)
✅ **Intelligent Orchestration** - Advanced context management for large codebases
✅ **Smart Memory Retrieval** - Semantic search across conversation history
✅ **Hierarchical Summarization** - Automatically compress large context while preserving key information
✅ **Output Continuation** - Extends responses beyond model token limits
✅ **Shell Command Execution** - AI can run terminal commands automatically
✅ **Context-Aware** - Understands your entire codebase
✅ **Git Integration** - Auto-commit changes with AI attribution
✅ **File Operations** - Preview and apply code changes safely
✅ **Backup & Rollback** - Automatic backups before any modifications
✅ **Chat History** - Save, export, and manage conversations
✅ **Streaming Responses** - Watch the AI think in real-time
✅ **Custom System Prompts** - Edit and customize AI behavior
✅ **File Exclusions** - Manage which files to exclude from context
✅ **Multi-Provider Support** - Switch between Azure, NVIDIA, Anthropic Foundry, and Z.AI
✅ **Manual Workspace Configuration** - Set custom workspace directory
✅ **AI Code Review** - Automated code review with GitHub PR integration
✅ **GitHub Integration** - PR status checks and comments
✅ **Custom Review Rules** - Configure review criteria per repository

## Privacy First

This extension is designed with privacy as the top priority:

- ❌ **No telemetry** - We don't track your usage
- ❌ **No cloud storage** - Your data stays on your machine
- ❌ **No external connections** - Only connects to your configured endpoint
- ✅ **Local credentials** - Stored securely in VS Code's secret storage
- ✅ **Transparent** - Open source, inspect all code

Your code never leaves your machine except for API calls to your configured provider.

## 🆕 Intelligent Orchestration Layer (v1.8.0)

KBot now includes an advanced orchestration layer that provides Cursor-level intelligence for handling large codebases and long conversations.

### Key Features

#### 🧠 Smart Context Management
- **Automatic Token Tracking**: Monitors context window limits for each model
- **Dynamic Adaptation**: Adjusts content based on model capabilities (GPT-4, Claude, GLM, etc.)
- **Safety Buffers**: Uses 80% of context window to prevent truncation

#### 📦 Hierarchical Summarization
- **Large File Handling**: Automatically summarizes files that exceed context limits
- **Key Information Preservation**: Maintains critical logic, functions, and implementation details
- **Multi-level Compression**: Recursively summarizes until content fits

#### 💾 Semantic Memory Retrieval
- **RAG-style Search**: Finds relevant past conversations using semantic similarity
- **Context Boosting**: Prioritizes memories related to current files
- **Automatic Storage**: Saves code decisions, error fixes, and summaries

#### 🔄 Output Continuation
- **Beyond Token Limits**: Automatically continues responses when truncated
- **Smart Code Completion**: Completes unclosed code blocks
- **Redundancy Removal**: Removes repeated content from continuations

#### ⚡ Multi-Pass Generation (Optional)
- **Draft → Refine → Validate**: Improves output quality through iteration
- **Focus Areas**: Refine for clarity, code quality, error handling
- **Quality Validation**: Checks for completeness before returning

### Configuration

Enable orchestration in your VS Code settings (`settings.json`):

```json
{
  "azureGpt.enableOrchestration": true,
  "azureGpt.maxFileContextTokens": 8000,
  "azureGpt.enableMemoryRetrieval": true
}
```

Or via VS Code UI:
1. Open Settings (`Cmd/Ctrl + ,`)
2. Search for "KBot" or "azureGpt"
3. Toggle "Enable Orchestration: true"

### When to Use Orchestration

Enable orchestration when:
- Working with large codebases (10K+ lines)
- Having long conversations (20+ messages)
- Getting truncated responses
- Need relevant context from past conversations
- Working with models having smaller context windows

Disable orchestration when:
- Need fastest possible responses
- Working with small files
- Short conversations
- Limited API quota

### Performance Impact

| Feature | Overhead | When Used |
|---------|----------|-----------|
| Context Check | ~5ms | Every request |
| Chunking | 10-50ms | Large files only |
| Summarization | +1 API call | Context exceeds limit |
| Memory Retrieval | ~5-20ms | Every request (if enabled) |
| Multi-Pass | +N API calls | Optional, disabled by default |
| Continuation | +M API calls | Truncated responses only |

## Installation

### From VSIX

1. Download the latest `.vsix` file from [Releases](https://github.com/kiranbeethoju/kbot/releases)
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
2. Run `KBot: Configure KBot Credentials`
3. Choose your provider (Azure, NVIDIA, Anthropic Foundry, or Z.AI)
4. Enter your credentials:

#### Azure OpenAI
- **Endpoint**: Your Azure OpenAI endpoint URL
- **API Key**: Your Azure OpenAI API key
- **Deployment Name**: Your deployment name (e.g., `gpt-4`)
- **API Version**: API version (default: `2024-02-15-preview`)
- **Model Name**: Model name (e.g., `gpt-4`)

#### NVIDIA API
- **Endpoint**: Your NVIDIA API endpoint URL
- **Model Name**: Model name (e.g., `nemotron-4-340b-instruct`)
- **Provider Name**: Custom name for this configuration

#### Anthropic Foundry (Azure-hosted Claude)
- **Endpoint**: Your Anthropic Foundry endpoint (e.g., `https://<resource>.openai.azure.com/anthropic`)
- **API Key**: Your Anthropic API key
- **Deployment Name**: Deployment name (e.g., `claude-opus-4_5-dev`)

#### Z.AI (GLM Models)
- **API Key**: Your Z.AI API key
- **Model Name**: Model name (e.g., `glm-4.7`, `glm-4-plus`)

### Azure OpenAI Prerequisites

You need:
- An Azure account with OpenAI access
- An Azure OpenAI resource created
- A model deployed (GPT-4, GPT-4o, or GPT-3.5-Turbo recommended)

Get started with Azure OpenAI: [Azure OpenAI Service](https://azure.microsoft.com/en-us/products/ai-services/openai-service)

### NVIDIA API Prerequisites

You need:
- Access to NVIDIA API endpoints
- Valid API endpoint URL
- Model name for deployment

## Usage

### Opening the Chat

- Click the **KBot** icon in the activity bar
- Or use the sidebar panel to switch between **Chat**, **Credentials**, and **History**

### Shell Command Execution

The AI can automatically execute shell commands when you request file system operations:

**Examples:**
```
"List all files in the current directory"
"Show me running Node.js processes"
"Install the lodash package"
"Check git status"
"Run the test suite"
"Build the project"
```

The AI will:
1. Execute the command in your workspace directory
2. Display the output in the chat
3. Use the results for follow-up actions

**Security:** Commands are executed in your workspace directory. You can review all commands before they run in the logs.

### Context Options

The AI automatically includes all workspace files (excluding common patterns like `node_modules`, `.git`, `.kbot-backup`, etc.):

- ✅ **Auto-included**: All source files from workspace
- ✅ **Current File**: Active editor file
- ✅ **Git Diff**: Recent git changes (when available)
- ✅ **Terminal**: Terminal output (when available)

### Example Prompts

```
"List all TypeScript files in the src directory"
"Find all files containing 'TODO' comments"
"Show me the git diff for package.json"
"Install the axios package"
"Run the development server"
"Check for running processes on port 3000"
"Refactor this function to be more readable"
"Add error handling to this code"
"Convert this to TypeScript"
"Add unit tests for this class"
```

### Applying Changes

When the AI suggests code changes:

1. Review the proposed changes in the chat
2. Click **Apply** on each file change
3. Changes are backed up automatically
4. Git commits are created automatically (if enabled)

### Custom System Prompts

Customize how the AI behaves:

1. Go to the **Credentials** tab
2. Use the **System Prompt Editor** section
3. Edit the prompt and click **Save System Prompt**
4. Use placeholders like `{fileCount}`, `{includeGitDiff}`, `{includeTerminal}`

### File Exclusions

Manage which files are excluded from AI context:

1. Command Palette: `KBot: Manage File Exclusions`
2. Add glob patterns (e.g., `*.log`, `dist/`, `coverage/`)
3. Save to apply

### Workspace Configuration

Configure a custom workspace directory:

1. Command Palette: `KBot: Configure Workspace Directory`
2. Choose to set a custom path or use auto-detect
3. Custom workspace persists across sessions

## Commands

| Command | Description |
|---------|-------------|
| `KBot: Open KBot Chat` | Open the chat panel |
| `KBot: Configure KBot Credentials` | Set up API credentials |
| `KBot: Show KBot Logs` | View extension logs |
| `KBot: Manage File Exclusions` | Manage excluded file patterns |
| `KBot: Configure System Prompts` | Customize AI behavior |
| `KBot: Configure Workspace Directory` | Set custom workspace path |
| `KBot: Configure GitHub` | Set up GitHub integration for PR reviews |
| `KBot: Detect GitHub Repository` | Auto-detect GitHub repo from git config |
| `KBot: Run AI Code Review` | Run automated code review on current changes |
| `KBot: Manage Review Configurations` | Manage custom review rules |
| `KBot: Clear Review Annotations` | Clear review decorations from editor |

## AI Code Review

KBot now includes AI-powered code review with GitHub integration!

### Features

- **Automated Code Review**: AI analyzes your git changes for bugs, security issues, and quality problems
- **Inline Annotations**: Review comments appear directly in your editor with severity indicators
- **Quick Actions**: Apply or reject suggestions with one click
- **GitHub Integration**: Create PR status checks and review comments
- **Custom Rules**: Define review criteria in `.kbot/checks/*.md` files
- **Severity Levels**: error, warning, suggestion, info

### Running a Code Review

1. Make changes to your code (or open a repository with uncommitted changes)
2. Run `KBot: Run AI Code Review` from Command Palette
3. Wait for AI to analyze changes
4. Review annotations in your editor
5. Click on suggestions to:
   - **Apply** - Apply the suggested change
   - **Reject** - Dismiss the suggestion

### GitHub Integration

Set up GitHub for PR reviews:

1. Run `KBot: Configure GitHub`
2. Enter your GitHub Personal Access Token
3. Run `KBot: Detect GitHub Repository` (optional)
4. When reviewing code, status checks will be posted to GitHub

**Token Permissions**: Your token needs `repo` and `pull_request` scopes.

### Custom Review Rules

Create custom review rules for your repository:

1. Create `.kbot/checks/` directory in your repository
2. Add markdown files with review rules (e.g., `security.md`, `code-quality.md`)
3. Each rule follows this format:

```markdown
# Review Name

## Rules

1. **Rule Name**
   - Description of what to check
   - Suggestions for how to fix

2. **Another Rule**
   - Description of what to check
   - Suggestions for how to fix
```

Default rules are automatically created:
- `security.md` - Security vulnerability checks
- `code-quality.md` - Code quality and maintainability checks
- `performance.md` - Performance optimization checks

### Managing Review Configs

1. Run `KBot: Manage Review Configurations`
2. Select a configuration to view, edit, or delete
3. Rules are read from `.kbot/checks/*.md` files

### Configuration

Enable custom review rules in VS Code settings:

```json
{
  "kbot.codeReview.useCustomConfig": true,
  "kbot.codeReview.reviewAllFiles": false,
  "kbot.codeReview.includeContext": 3
}
```

**Settings**:
- `useCustomConfig`: Use rules from `.kbot/checks/*.md` files
- `reviewAllFiles`: Review all files vs. only staged changes
- `includeContext`: Lines of context to include in review comments

## Features in Detail

### Shell Command Execution

The AI can execute shell commands for:
- File listing and directory navigation (`ls`, `pwd`, `find`)
- Process management (`ps`, `kill`, `lsof`)
- Package management (`npm install`, `pip install`)
- Git operations (`git status`, `git log`, `git diff`)
- Build and test commands (`npm test`, `make build`)
- HTTP requests (`curl`)

All commands are logged with visual indicators:
- 🔧 Executing command
- ✓ Command succeeded with output
- ✗ Command failed with error

### Git Integration

When Git is enabled:
- Changes are automatically committed with AI attribution
- Commit messages reference your original request
- Original file content is preserved for diffs
- View history in the History tab

### Provider Switching

Switch between providers:
1. Go to **Credentials** tab
2. Select Azure, NVIDIA, Anthropic Foundry, or Z.AI from dropdown
3. Configure credentials for each provider
4. Switch anytime without re-entering credentials

### Chat History

- All conversations saved automatically
- Export sessions to JSON
- Search and filter history
- Delete old sessions
- View detailed message history

## Data Storage

All data is stored locally on your machine:

| Data | Location |
|------|----------|
| API Keys | VS Code SecretStorage (encrypted) |
| Credentials | VS Code GlobalState (local) |
| Chat History | VS Code GlobalState (local) |
| File Backups | `.kbot-backup/` in workspace |
| Git Commits | Your local git repository |

## Troubleshooting

### "Credentials not configured"

Run `KBot: Configure KBot Credentials` and enter your API details.

### "Failed to call API"

Check:
- Your endpoint URL is correct
- Your API key is valid
- Your deployment/model name exists
- Your subscription has quota available

### Shell commands not executing

Check:
- Command syntax is valid for your OS
- Required tools are installed (e.g., `git`, `node`, `python`)
- Workspace directory is accessible
- View logs: `KBot: Show KBot Logs`

### "No files available in workspace"

- Ensure you have a workspace folder open
- Check file exclusion patterns
- Verify files are not in excluded directories (node_modules, .git, etc.)
- Backup files (.kbot-backup) are automatically excluded

### Streaming not working

Make sure your API deployment supports streaming (most do).

## Compatibility

- **VS Code**: 1.75.0 and higher
- **Platforms**: Windows, macOS, Linux
- **Providers**:
  - Azure OpenAI: **GPT-5, GPT-5.1, GPT-5.2** (1M token context), GPT-4, GPT-4o, GPT-4-turbo, GPT-3.5-Turbo
  - NVIDIA: Nemotron, LLMs hosted on NVIDIA endpoints
  - Anthropic Foundry: Claude models on Azure
  - Z.AI: GLM-4.7, GLM-4-Plus, and other GLM models

## Architecture

```
kbot/
├── src/
│   ├── extension.ts                  # Main entry point
│   ├── chatPanel.ts                  # Chat UI (webview)
│   ├── credentials.ts                # Credential management
│   ├── azureGPT.ts                   # Azure OpenAI API client
│   ├── nvidiaService.ts              # NVIDIA API client
│   ├── anthropicFoundryService.ts    # Anthropic Foundry API client
│   ├── zaiService.ts                 # Z.AI API client
│   ├── fileManager.ts                # File operations & workspace scanning
│   ├── terminalManager.ts            # Shell command execution
│   ├── gitManager.ts                 # Git integration
│   ├── backupManager.ts              # Backup & rollback
│   ├── workspaceManager.ts           # Workspace configuration
│   ├── chatHistoryManager.ts         # Chat history persistence
│   ├── exclusionManager.ts           # File exclusion patterns
│   ├── credentialsView.ts            # Credentials UI (webview)
│   ├── chatHistoryView.ts            # History UI (webview)
│   ├── logger.ts                     # Logging utilities
│   ├── githubService.ts              # GitHub API integration
│   ├── reviewConfigManager.ts        # Review configuration management
│   └── core/
│       ├── codeReviewService.ts       # Code review orchestration
│       ├── orchestrationService.ts    # Main orchestrator
│       ├── contextManager.ts         # Model limits & token estimation
│       ├── chunker.ts                # Smart text chunking
│       ├── summarizer.ts             # Hierarchical summarization
│       ├── memoryStore.ts            # Semantic memory with embeddings
│       ├── retrieval.ts              # RAG-style context retrieval
│       ├── multiPassEngine.ts        # Multi-pass refinement
│       └── continuationHandler.ts    # Output continuation
├── resources/
│   └── icon.svg                      # Extension icon
├── package.json                      # Extension manifest
├── tsconfig.json                     # TypeScript config
└── README.md                         # This file
```

## Security

- API keys stored in VS Code's encrypted SecretStorage
- No credentials in plain text or logs
- File backups isolated to workspace
- Shell commands executed with user notification
- All file changes previewed before applying
- Open source - inspect all code

## Contributing

We welcome contributions from external developers! This project is open source and community-driven.

### How to Contribute

#### For External Developers

If you're an external developer wanting to contribute:

1. **Fork the Repository**
   ```bash
   # Fork https://github.com/kiranbeethoju/kbot on GitHub
   # Then clone your fork
   git clone https://github.com/YOUR_USERNAME/kbot.git
   cd kbot
   ```

2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or for bug fixes
   git checkout -b fix/your-bug-fix
   ```

3. **Make Your Changes**
   - Write clean, documented code
   - Follow TypeScript best practices
   - Test your changes thoroughly
   - Update documentation if needed

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: descriptive message about your feature"
   ```

   Commit message format:
   - `feat:` - New features
   - `fix:` - Bug fixes
   - `docs:` - Documentation changes
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

5. **Push to Your Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**
   - Go to https://github.com/kiranbeethoju/kbot
   - Click "Pull Requests" → "New Pull Request"
   - Select your feature branch
   - Fill in the PR template
   - Submit your PR for review

#### For Maintainers

Pushing new features to the beta branch:

```bash
# Make your changes
git checkout -b feature/your-feature
# ... make changes ...
git add .
git commit -m "feat: description"

# Push to beta branch
git push origin feature/your-feature:beta
```

### Development Setup

```bash
# Install dependencies
npm install

# Watch mode for development
npm run watch

# Compile
npm run compile

# Package VSIX
npm run package

# Install locally for testing
code --install-extension kbot-1.6.7.vsix
```

### Code Style Guidelines

- Use TypeScript for all new code
- Follow existing code patterns and structure
- Add JSDoc comments for public functions
- Use meaningful variable and function names
- Keep functions focused and concise
- Add error handling for user-facing features

### Testing Your Changes

1. Test in a clean VS Code environment
2. Test with different AI providers (Azure, NVIDIA, Anthropic, Z.AI)
3. Test file operations (create, edit, delete)
4. Test shell command execution
5. Test with various file types and sizes

### Pull Request Guidelines

- **One PR per feature/fix** - Keep PRs focused
- **Clear description** - Explain what and why
- **Tests included** - Add tests for new functionality
- **Documentation updated** - Update README if needed
- **No merge commits** - Use rebase to keep history clean

### Getting Your PR Merged

1. Ensure all CI checks pass
2. Respond to review comments promptly
3. Make requested changes or discuss alternatives
4. Keep PRs up to date with main branch
5. Be patient - maintainers review as time allows

## License

MIT License - See LICENSE file for details

## Author

**Kiran Beethoju**

- GitHub: [@kiranbeethoju](https://github.com/kiranbeethoju)

## Upcoming Features (TODO)

### High Priority

- [ ] **Multi-file Edit Support** - Apply changes across multiple files simultaneously
- [ ] **Streaming File Preview** - Show file changes in real-time as they're generated
- [ ] **Git Branch Integration** - Show current branch and allow switching from chat
- [ ] **Enhanced Diff View** - Side-by-side comparison for file changes
- [ ] **Syntax Highlighting** - Proper code syntax highlighting in chat responses
- [ ] **Context Window Management** - Better handling of large codebases with smart context selection
- [ ] **Code Review Mode** - Automated code review with suggestions for improvements
- [ ] **Refactoring Assistant** - AI-powered refactoring with safety checks

### Medium Priority

- [ ] **Workspace Templates** - Predefined prompts for common tasks
- [ ] **Chat Export to Markdown** - Export conversations as formatted markdown
- [ ] **Multi-language Support** - Internationalization for non-English users
- [ ] **Custom Keybindings** - Allow users to configure keyboard shortcuts
- [ ] **Performance Metrics** - Show token usage and costs per session
- [ ] **Session Persistence** - Save and restore chat sessions across VS Code restarts
- [ ] **Code Snippet Library** - Save and reuse code snippets
- [ ] **Integrated Terminal** - Dedicated terminal panel in the chat view

### Low Priority

- [ ] **Dark/Light Theme Sync** - Automatic theme matching with VS Code
- [ ] **Voice Input** - Dictate prompts instead of typing
- [ ] **Collaboration Mode** - Share chat sessions with team members
- [ ] **Analytics Dashboard** - Usage statistics and insights
- [ ] **Plugin System** - Allow third-party extensions to KBot
- [ ] **Desktop Notifications** - Notify on long-running operations
- [ ] **Custom Model Parameters** - Fine-tune temperature, max tokens, etc.
- [ ] **Batch Operations** - Apply same change to multiple files at once

### Under Consideration

- [ ] **Local Model Support** - Integration with local LLMs (Ollama, LM Studio)
- [ ] **Multi-cloud Support** - AWS Bedrock, Google Cloud Vertex AI
- [ ] **Team Edition** - Shared credentials and configurations for teams
- [ ] **Enterprise Features** - SSO, audit logs, compliance features
- [ ] **Mobile App** - Companion mobile application
- [ ] **VS Code Fork** - Standalone editor with KBot built-in

---

## Changelog

### 1.9.1 (2025-03-18)

**⚡ FIX: Performance - Credentials View Loading Time**
- Reduced credentials view initial render time by ~50-70%
- Implemented two-stage loading system (loading spinner → full interface)
- Added loading HTML with CSS spinner animation
- Deferred credential loading until webview is ready
- User sees immediate feedback instead of blank screen for 3-5 seconds

**Technical Details:**
- Added `getLoadingHtml()` method for fast initial render
- Modified `resolveWebviewView()` to show loading screen first
- Added `readyForState` handshake between webview and extension
- Reduced total time-to-usable from ~3-5s to ~1.5s

### 1.9.0 (2025-03-17)

**🚀 NEW: AI Code Review Features**
- Added automated code review powered by AI
- Inline editor decorations showing review annotations
- Apply/Reject suggestions with quick actions
- Severity levels: error, warning, suggestion, info

**🔗 NEW: GitHub Integration**
- GitHub token management in credentials panel
- Auto-detect GitHub repository from git config
- Create PR status checks (success/failure/pending)
- Post review comments to pull requests
- Test GitHub connection with one click

**⚙️ NEW: Custom Review Rules**
- Per-repository review configuration in `.kbot/checks/*.md`
- Default templates: security.md, code-quality.md, performance.md
- Manage review configs via Command Palette
- Enable/disable custom rules in settings

**New Commands:**
- `KBot: Configure GitHub` - Set up GitHub credentials
- `KBot: Detect GitHub Repository` - Auto-detect repo
- `KBot: Run AI Code Review` - Run review on current changes
- `KBot: Manage Review Configurations` - Manage custom rules
- `KBot: Clear Review Annotations` - Clear decorations

**New Settings:**
- `kbot.codeReview.useCustomConfig` - Use .kbot/checks rules
- `kbot.codeReview.reviewAllFiles` - Review all vs. staged changes
- `kbot.codeReview.includeContext` - Lines of context in comments

**Technical Details:**
- New service: `GitHubService` for API integration
- New service: `CodeReviewService` for review orchestration
- New service: `ReviewConfigManager` for config management
- Added `@octokit/rest` dependency for GitHub API
- Uses existing AI providers (Azure/NVIDIA/Anthropic/Zai)
- Structured review results with JSON parsing

### 1.8.1 (2025-02-22)

**FIX: Session Switch Error**
- Fixed "command 'azureGPTChatView.focus' not found" error when switching chat sessions
- Updated to use correct view ID `kbotChatView.focus`
- Added error handling for focus command failures

### 1.8.0 (2025-02-22)

**🚀 NEW: Intelligent Orchestration Layer**
- Added comprehensive context orchestration for Cursor-level intelligence
- **Context Window Manager**: Model-specific token tracking and safety buffers
- **Smart Chunking**: Structure-aware code splitting that preserves functions/classes
- **Hierarchical Summarization**: Recursive content compression with key point preservation
- **Semantic Memory Store**: RAG-style retrieval using embedding-based search
- **Output Continuation**: Automatic extension of truncated responses
- **Multi-Pass Generation**: Draft → Refine → Validate workflow (optional)

**Configuration:**
- Add `"azureGpt.enableOrchestration": true` to settings
- Configure max file context tokens
- Toggle memory retrieval on/off

**Benefits:**
- Handle files larger than model context windows
- Retrieve relevant context from conversation history
- Generate outputs longer than max_tokens limit
- Scale intelligently across different models

**Architecture:**
```
src/core/
├── contextManager.ts      # Model limits & token estimation
├── chunker.ts             # Smart text chunking
├── summarizer.ts          # Hierarchical summarization
├── memoryStore.ts         # Semantic memory with embeddings
├── retrieval.ts           # RAG-style context retrieval
├── multiPassEngine.ts     # Multi-pass refinement
├── continuationHandler.ts # Output continuation
└── orchestrationService.ts # Main orchestrator
```

### 1.6.8 (2025-02-13)

**FIX: Critical - Diff Markers Written to Files**
- Fixed issue where diff preview markers (+/-) were being written to actual Python files
- Enhanced validation in `applyChanges` and `applySingleChange` functions
- Added checks to ensure only valid structured edits (edits array) are applied
- Added early return with warning if no valid edits found
- Improved error messages for invalid structured edits

**Technical Details:**
- Root cause: The `content` field contained diff preview for UI display
- Fix: Ensure only `edits` array is used for structured edits, never `content` field
- Added validation: Check `edits` is a non-empty array before processing
- Added comments explaining the separation between display content and actual edits

### 1.6.7 (2025-02-13)

**NEW: Revert to Checkpoint**
- Added ability to revert all changes made after a specific user message
- One-click rollback to any point in conversation history
- Preserves conversation context while undoing file changes
- Safe restoration using stored original content

**Improvements:**
- Enhanced file change tracking with original content storage
- Better backup management for rollbacks
- Improved state management for undo operations

### 1.4.0 (2025-02-08)

**NEW: Z.AI (GLM) Support**
- Added support for Z.AI GLM models (glm-4.7, glm-4-plus, etc.)
- New provider option for Z.AI API
- Full credential management for Z.AI

**NEW: Anthropic Foundry Support**
- Added support for Anthropic Foundry (Azure-hosted Claude models)
- Configure Anthropic Foundry endpoints and deployments
- Support for claude-opus-4_5-dev and other Claude models

**NEW: Manual Workspace Configuration**
- Configure custom workspace directory
- Option to use auto-detect or set specific path
- Workspace configuration persists across sessions

**Improvements:**
- Fixed credential update bug (now can properly change API keys)
- Backup files (.kbot-backup) now excluded from context
- Better UX with "Change API Key" checkbox for all providers
- Improved workspace detection - now uses current opened project

### 1.3.0 (2025-02-08)

**Improvements:**
- Enhanced workspace file detection
- Better context collection
- Improved file exclusion handling

### 1.2.0 (2025-02-08)

**NEW: Workspace Directory Configuration**
- Configure workspace directory from UI
- Set custom workspace or use auto-detect
- Workspace settings shown in Credentials panel

**Improvements:**
- Fixed workspace path to use current working directory by default
- Better workspace detection when opening projects

### 1.1.8 (2025-02-04)

**NEW: Shell Command Execution**
- AI can now execute shell commands automatically
- Commands run in workspace directory
- Full output logging and display
- Security: All commands logged and visible

**Other Improvements:**
- Enhanced workspace file detection (dynamic path resolution)
- Improved file collection logging
- Better context from workspace files

### 1.1.7 (2025-02-04)

**Bug Fixes:**
- Fixed workspace path detection
- Made workspace root detection dynamic
- Improved path resolution

## Support

For issues, questions, or contributions:
- Open an issue on [GitHub](https://github.com/kiranbeethoju/kbot/issues)
- Check existing [discussions](https://github.com/kiranbeethoju/kbot/discussions)
- Read the code - it's open source!

## Acknowledgments

Built with:
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Azure OpenAI Service](https://azure.microsoft.com/en-us/products/ai-services/openai-service)
- [NVIDIA API](https://www.nvidia.com/en-us/data-center/products/)
- [Anthropic](https://www.anthropic.com/)
- [Z.AI](https://www.z.ai/)
- [TypeScript](https://www.typescriptlang.org/)

---

**Note**: This extension is not affiliated with Cursor or Microsoft. It's an independent project designed to bring Cursor-like functionality to VS Code using your preferred AI provider.
