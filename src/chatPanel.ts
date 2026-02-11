/**
 * Chat Panel Provider
 * Main UI for the Azure GPT chat interface
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CredentialManager } from './credentials';
import { AzureGPTService } from './azureGPT';
import { NvidiaService } from './nvidiaService';
import { AnthropicFoundryService } from './anthropicFoundryService';
import { ZaiService } from './zaiService';
import { StructuredEditManager, FileStructuredEdit } from './structuredEditManager';
import { FileManager } from './fileManager';
import { BackupManager } from './backupManager';
import { ExclusionManager } from './exclusionManager';
import { GitManager, GitChange } from './gitManager';
import { ChatHistoryManager, ChatSession } from './chatHistory';
import { TerminalManager } from './terminalManager';
import { ChatMessage, ProviderType } from './types';
import { Logger } from './logger';

export interface ChatMessageEntry {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    files?: Array<{ path: string; action: string; content: string; originalContent?: string }>;
    gitCommitted?: boolean;
    shell?: string;  // Shell command that was executed
    shellOutput?: string;  // Output from shell command
}

export class ChatPanelProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private gitManager?: GitManager;
    private chatHistoryManager: ChatHistoryManager;
    private terminalManager: TerminalManager;
    private currentSession: ChatSession | null = null;
    private abortController: AbortController | null = null;
    private structuredEditManager?: StructuredEditManager;
    private previewOriginalContent?: Map<string, string>;  // Store original content for preview revert

    constructor(
        private extensionUri: vscode.Uri,
        private credentialManager: CredentialManager,
        private azureGPTService: AzureGPTService,
        private nvidiaService: NvidiaService,
        private anthropicFoundryService: AnthropicFoundryService,
        private zaiService: ZaiService,
        private fileManager: FileManager,
        private backupManager: BackupManager,
        private exclusionManager: ExclusionManager,
        private context: vscode.ExtensionContext,
        terminalManager: TerminalManager,
        chatHistoryManager: ChatHistoryManager
    ) {
        this.chatHistoryManager = chatHistoryManager;
        this.terminalManager = terminalManager;

        // Initialize structured edit manager with workspace root
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.structuredEditManager = new StructuredEditManager(workspaceFolders[0].uri.fsPath);
        }
    }

    /**
     * Initialize git manager
     */
    private async ensureGitManager(): Promise<void> {
        if (!this.gitManager) {
            try {
                this.gitManager = new GitManager();
                await this.gitManager.ensureGitInitialized();
            } catch (error) {
                Logger.warn('Git manager not available:', error);
            }
        }
    }

    /**
     * Initialize chat session
     */
    private async initializeSession(): Promise<void> {
        const activeSession = await this.chatHistoryManager.getActiveSession();
        if (activeSession) {
            this.currentSession = activeSession;
        } else {
            this.currentSession = await this.chatHistoryManager.createSession();
        }
    }

    /**
     * Resolve webview view
     */
    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): Promise<void> {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            Logger.log(`Received message from webview: ${data.type}`, data);
            try {
                switch (data.type) {
                    case 'ping':
                        Logger.log('Ping received from webview, responding with pong');
                        this.sendMessage({ type: 'pong', timestamp: data.timestamp });
                        break;
                    case 'sendMessage':
                        Logger.log(`Processing sendMessage: ${data.message?.substring(0, 50)}`);
                        await this.handleSendMessage(data.message, data.context, data.image);
                        break;
                    case 'clearHistory':
                        await this.clearHistory();
                        break;
                    case 'exportHistory':
                        await this.exportHistory();
                        break;
                    case 'applyChanges':
                        await this.applyChanges(data.files);
                        break;
                    case 'applySingleChange':
                        await this.applySingleChange(data.file, data.userMessage);
                        break;
                    case 'previewChange':
                        await this.previewChange(data.file);
                        break;
                    case 'revertPreview':
                        await this.revertPreview(data.path);
                        break;
                    case 'openFile':
                        await this.openFile(data.path);
                        break;
                    case 'configureCredentials':
                        await this.credentialManager.configureCredentials();
                        this.sendMessage({
                            type: 'credentialsConfigured'
                        });
                        break;
                    case 'configureExclusions':
                        await this.exclusionManager.showConfigurationUI();
                        break;
                    case 'newChat':
                        await this.createNewChat();
                        break;
                    case 'switchSession':
                        await this.switchSession(data.sessionId);
                        break;
                    case 'deleteSession':
                        await this.deleteSession(data.sessionId);
                        break;
                    case 'loadSessions':
                        await this.loadSessions();
                        break;
                    case 'updateSessionTitle':
                        await this.updateSessionTitle(data.sessionId, data.title);
                        break;
                    case 'executeTerminalCommand':
                        await this.executeTerminalCommand(data.command);
                        break;
                    case 'killProcessOnPort':
                        await this.killProcessOnPort(data.port);
                        break;
                    case 'killProcessByName':
                        await this.killProcessByName(data.name);
                        break;
                    case 'checkPortInUse':
                        await this.checkPortInUse(data.port);
                        break;
                    case 'stopRequest':
                        // Abort the current API request
                        if (this.abortController) {
                            this.abortController.abort();
                            this.abortController = null;
                            this.sendMessage({
                                type: 'requestStopped'
                            });
                        }
                        break;
                }
            } catch (error: any) {
                Logger.log('Error handling webview message:', error);
                this.sendMessage({
                    type: 'error',
                    message: `Internal Error: ${error.message}`
                });
            }
        });

        // Initialize and load chat session
        await this.initializeSession();
        await this.loadSessions();

        // Handle visibility changes to maintain chat state
        webviewView.onDidChangeVisibility(async () => {
            if (webviewView.visible) {
                // Reload session and messages when becoming visible
                await this.initializeSession();
                await this.loadSessions();
                await this.loadChatMessages();
            }
        });
    }

    private messagesLoaded = false;

    /**
     * Load chat messages from current session
     */
    private async loadChatMessages(): Promise<void> {
        if (!this.currentSession || this.currentSession.messages.length === 0 || this.messagesLoaded) {
            return;
        }

        // Clear existing messages first to prevent duplicates
        this.sendMessage({ type: 'clearChat' });

        // Send all existing messages to restore the chat
        for (const message of this.currentSession.messages) {
            this.sendMessage({
                type: 'messageAdded',
                message
            });
        }

        this.messagesLoaded = true;
    }

    /**
     * Handle sending a message
     */
    private async handleSendMessage(
        userMessage: string,
        context: any,
        image?: { data: string; mimeType: string; name: string }
    ): Promise<void> {
        Logger.log(`handleSendMessage called with message: ${userMessage.substring(0, 50)}...`);

        // Ensure git is initialized
        await this.ensureGitManager();

        // Get the selected provider
        const provider = await this.credentialManager.getSelectedProvider();

        // Check if credentials are configured
        const isConfigured = await this.credentialManager.isConfigured();

        if (!isConfigured) {
            const providerName = provider === ProviderType.Azure ? 'Azure' :
                                provider === ProviderType.NVIDIA ? 'NVIDIA' :
                                provider === ProviderType.AnthropicFoundry ? 'Anthropic Foundry' : 'Z.AI';
            this.sendMessage({
                type: 'error',
                message: `${providerName} credentials not configured. Please configure them first.`
            });
            return;
        }

        // Add user message to history
        const userEntry: ChatMessageEntry = {
            id: this.generateId(),
            role: 'user',
            content: userMessage,
            timestamp: Date.now()
        };

        if (this.currentSession) {
            this.currentSession.messages.push(userEntry);
            await this.chatHistoryManager.addMessage(userEntry);
        }

        this.sendMessage({
            type: 'messageAdded',
            message: userEntry
        });

        // Show loading indicator
        const providerShortName = provider === ProviderType.Azure ? 'Azure' :
                                provider === ProviderType.NVIDIA ? 'NVIDIA' :
                                provider === ProviderType.AnthropicFoundry ? 'Claude' : 'Z.AI';
        this.sendMessage({
            type: 'loadingStarted',
            message: `Thinking with ${providerShortName}...`
        });

        try {
            // Create abort controller for this request
            this.abortController = new AbortController();

            // Send progress update
            this.sendMessage({
                type: 'loadingUpdate',
                message: 'Collecting workspace files...'
            });

            // Collect file context - ALWAYS include workspace files automatically
            let fileContexts: any[] = [];

            // 1. Always include current file if available
            if (context.includeCurrentFile) {
                const currentFile = await this.fileManager.getCurrentFile();
                if (currentFile) {
                    fileContexts.push(currentFile);
                }
            }

            // 2. Always include ALL workspace files automatically (this is the key change)
            // Get all relevant files from current working directory
            let workspaceFiles: any[] = [];
            try {
                workspaceFiles = await this.fileManager.getWorkspaceFiles();

                // Log workspace file count for debugging
                if (workspaceFiles.length > 0) {
                    Logger.log(`Auto-including ${workspaceFiles.length} workspace files from ${this.fileManager.getWorkspaceRoot()}`);

                    // Send progress update
                    this.sendMessage({
                        type: 'loadingUpdate',
                        message: `Found ${workspaceFiles.length} workspace files...`
                    });

                    fileContexts.push(...workspaceFiles);
                } else {
                    Logger.log(`No workspace files found in ${this.fileManager.getWorkspaceRoot()}, will continue with current file only`);
                }
            } catch (error: any) {
                Logger.warn('Failed to collect workspace files, continuing with current file only:', error);
                // Don't show error to user, just continue without workspace files
                this.sendMessage({
                    type: 'loadingUpdate',
                    message: 'Continuing with current file only...'
                });
            }

            // 3. Additional selected files if any
            if (context.selectedFiles && context.selectedFiles.length > 0) {
                const selected = await this.fileManager.getSelectedFiles(
                    context.selectedFiles.map((f: any) => vscode.Uri.parse(f))
                );
                fileContexts.push(...selected);
            }

            // 4. Add git diff if requested
            let gitDiffContent = '';
            if (context.includeGitDiff) {
                const gitDiff = await this.fileManager.getGitDiff();
                if (gitDiff) {
                    gitDiffContent = `\n\n--- GIT DIFF ---\n${gitDiff}\n--- END GIT DIFF ---\n`;
                }
            }

            // 5. Add terminal output if requested
            let terminalContent = '';
            if (context.includeTerminal) {
                terminalContent = '\n\n[Terminal output would be included here]';
            }

            // Build messages array
            let systemPrompt: string;
            switch (provider) {
                case ProviderType.Azure:
                    systemPrompt = await this.azureGPTService.generateSystemPrompt({
                        fileCount: fileContexts.length,
                        includeGitDiff: context.includeGitDiff || false,
                        includeTerminal: context.includeTerminal || false
                    });
                    break;
                case ProviderType.NVIDIA:
                    systemPrompt = await this.nvidiaService.generateSystemPrompt({
                        fileCount: fileContexts.length,
                        includeGitDiff: context.includeGitDiff || false,
                        includeTerminal: context.includeTerminal || false
                    });
                    break;
                case ProviderType.AnthropicFoundry:
                    systemPrompt = await this.anthropicFoundryService.generateSystemPrompt({
                        fileCount: fileContexts.length,
                        includeGitDiff: context.includeGitDiff || false,
                        includeTerminal: context.includeTerminal || false
                    });
                    break;
                case ProviderType.Zai:
                    systemPrompt = await this.zaiService.generateSystemPrompt({
                        fileCount: fileContexts.length,
                        includeGitDiff: context.includeGitDiff || false,
                        includeTerminal: context.includeTerminal || false
                    });
                    break;
                default:
                    systemPrompt = await this.credentialManager.getSystemPrompt();
            }

            const messages: ChatMessage[] = [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: `${userMessage}

=== WORKSPACE CONTEXT ===
Working Directory: ${this.fileManager.getWorkspaceRoot()}
Files Included: ${fileContexts.length} files
${this.fileManager.formatFilesForContext(fileContexts)}
${gitDiffContent}${terminalContent}
=======================`,
                    ...(image && {
                        image: {
                            data: image.data,
                            mimeType: image.mimeType
                        }
                    })
                }
            ];

            // Add conversation history from current session
            const historyMessages = this.currentSession?.messages || [];
            for (const entry of historyMessages.slice(-10)) {
                if (entry.role !== 'system') {
                    messages.push({
                        role: entry.role,
                        content: entry.content
                    });
                }
            }

            // Calculate input tokens (rough estimation: 1 token ≈ 4 characters)
            let totalInputChars = 0;
            for (const msg of messages) {
                totalInputChars += msg.content.length;
                if (msg.image) {
                    // Images add significant tokens - roughly estimate based on size
                    // A typical 512x512 image is ~1100 tokens in GPT-4 Vision
                    totalInputChars += 4400; // ~1100 tokens * 4
                }
            }
            const estimatedInputTokens = Math.ceil(totalInputChars / 4);

            // Get context window size (default to 128K for GPT-4)
            let contextWindow = 128000;
            if (provider === ProviderType.Azure) {
                const azureCreds = await this.credentialManager.getAzureCredentials();
                if (azureCreds?.modelName) {
                    // Adjust context window based on model
                    if (azureCreds.modelName.includes('gpt-4')) {
                        contextWindow = 128000;
                    } else if (azureCreds.modelName.includes('gpt-3.5')) {
                        contextWindow = 16000;
                    }
                }
            }

            // Send token update to frontend
            this.sendMessage({
                type: 'tokenUpdate',
                inputTokens: estimatedInputTokens,
                contextWindow: contextWindow
            });

            // Call the appropriate service based on provider
            let response: string;

            // Send progress update
            const providerName = provider === ProviderType.Azure ? 'Azure OpenAI' :
                                provider === ProviderType.NVIDIA ? 'NVIDIA' :
                                provider === ProviderType.AnthropicFoundry ? 'Anthropic Foundry' : 'Z.AI';
            this.sendMessage({
                type: 'loadingUpdate',
                message: `Sending request to ${providerName}...`
            });

            if (provider === ProviderType.Azure) {
                // Set credentials for Azure service
                const azureCreds = await this.credentialManager.getAzureCredentials();
                if (!azureCreds) {
                    throw new Error('Azure credentials not found');
                }
                response = await this.azureGPTService.chatCompletion(
                    messages,
                    (delta) => {
                        this.sendMessage({
                            type: 'messageDelta',
                            delta
                        });
                    },
                    this.abortController.signal
                );
            } else if (provider === ProviderType.NVIDIA) {
                // Set credentials for NVIDIA service
                const nvidiaCreds = await this.credentialManager.getNvidiaCredentials();
                if (!nvidiaCreds) {
                    throw new Error('NVIDIA credentials not found');
                }
                this.nvidiaService.setCredentials(nvidiaCreds);
                response = await this.nvidiaService.chatCompletion(
                    messages,
                    (delta) => {
                        this.sendMessage({
                            type: 'messageDelta',
                            delta
                        });
                    },
                    this.abortController.signal
                );
            } else if (provider === ProviderType.AnthropicFoundry) {
                // Set credentials for Anthropic Foundry service
                const anthropicCreds = await this.credentialManager.getAnthropicFoundryCredentials();
                if (!anthropicCreds) {
                    throw new Error('Anthropic Foundry credentials not found');
                }
                this.anthropicFoundryService.setCredentials(anthropicCreds);
                response = await this.anthropicFoundryService.sendMessage(
                    messages,
                    (delta) => {
                        this.sendMessage({
                            type: 'messageDelta',
                            delta
                        });
                    }
                );
            } else if (provider === ProviderType.Zai) {
                // Set credentials for Z.AI service
                const zaiCreds = await this.credentialManager.getZaiCredentials();
                if (!zaiCreds) {
                    throw new Error('Z.AI credentials not found');
                }
                this.zaiService.setCredentials(zaiCreds);
                response = await this.zaiService.sendMessage(
                    messages,
                    (delta) => {
                        this.sendMessage({
                            type: 'messageDelta',
                            delta
                        });
                    }
                );
            } else {
                throw new Error(`Unknown provider: ${provider}`);
            }

            // Hide loading indicator
            this.sendMessage({
                type: 'loadingStopped'
            });

            // Debug: Log the raw response
            Logger.log(`=== AI Response (first 500 chars) ===`);
            Logger.log(response.substring(0, 500));
            Logger.log(`=== End AI Response ===`);

            // Parse response - try structured edit format first
            let structuredResponse;
            let fileChangesToApply: any[] = [];

            if (this.structuredEditManager) {
                structuredResponse = this.structuredEditManager.parseStructuredEditResponse(response);
                if (structuredResponse && structuredResponse.files.length > 0) {
                    // Use structured edits
                    fileChangesToApply = structuredResponse.files;
                    Logger.log(`Applying ${structuredResponse.files.length} structured file edits`);
                }
            }

            // Fallback to legacy parsing if no structured edits found
            if (fileChangesToApply.length === 0) {
                structuredResponse = this.azureGPTService.parseStructuredResponse(response);
                if (structuredResponse && structuredResponse.files) {
                    fileChangesToApply = structuredResponse.files;
                    Logger.log(`Applying ${structuredResponse.files.length} legacy file changes`);
                }
            }

            // Variables to store shell command execution results
            let shellCommand: string | undefined;
            let shellOutput: string | undefined;

            // Execute shell command if present
            if (structuredResponse.shell) {
                shellCommand = structuredResponse.shell;
                Logger.log(`🔧 Executing shell command: ${shellCommand}`);
                this.sendMessage({
                    type: 'info',
                    message: `🔧 Executing: ${shellCommand}`
                });

                try {
                    const { stdout, stderr } = await this.terminalManager.executeCommandSync(
                        shellCommand,
                        this.fileManager.getWorkspaceRoot()
                    );

                    // Log the output
                    shellOutput = stdout.trim() || (stderr.trim() || 'Command executed with no output');
                    Logger.log(`✓ Shell command output:\n${shellOutput}`);

                    // Send output to UI
                    this.sendMessage({
                        type: 'shellOutput',
                        command: shellCommand,
                        output: shellOutput
                    });

                    // Add command output to AI context so it can use the results
                    if (structuredResponse.explanation) {
                        structuredResponse.explanation += `\n\n**Shell Command Executed:**\n\`${shellCommand}\`\n\n**Output:**\n\`\`\`\n${shellOutput}\n\`\`\``;
                    }
                } catch (error: any) {
                    const errorMsg = error.message || 'Unknown error';
                    shellOutput = `Error: ${errorMsg}`;
                    Logger.error(`✗ Shell command failed: ${errorMsg}`);
                    this.sendMessage({
                        type: 'error',
                        message: `Command failed: ${errorMsg}`
                    });

                    // Still let AI know about the error
                    if (structuredResponse.explanation) {
                        structuredResponse.explanation += `\n\n**Shell Command Failed:**\n\`${shellCommand}\`\n\n**Error:**\n${errorMsg}`;
                    }
                }
            }

            // Enrich file changes with git status
            if (fileChangesToApply.length > 0) {
                for (const file of fileChangesToApply) {
                    if (this.gitManager) {
                        const filePath = (file as any).path || (file as any).filePath;
                        const originalContent = await this.gitManager.getOriginalContent(filePath);
                        (file as any).originalContent = originalContent || undefined;
                    }
                }
            }

            // Transform structured edits to legacy format for UI compatibility
            const filesForUI = await this.transformFilesForUI(fileChangesToApply);

            // Signal streaming complete (this finalizes the accumulated streamed content)
            this.sendMessage({
                type: 'streamingComplete'
            });

            // Add assistant message to history and send to UI
            const assistantEntry: ChatMessageEntry = {
                id: this.generateId(),
                role: 'assistant',
                content: structuredResponse.explanation,
                timestamp: Date.now(),
                files: filesForUI,
                shell: shellCommand,
                shellOutput: shellOutput
            };

            if (this.currentSession) {
                this.currentSession.messages.push(assistantEntry);
                await this.chatHistoryManager.addMessage(assistantEntry);
            }

            // Send the complete assistant message with files to the frontend
            this.sendMessage({
                type: 'messageAdded',
                message: assistantEntry
            });

            // Auto-commit changes if git is enabled
            if (this.gitManager && fileChangesToApply.length > 0) {
                // Commit will happen after user applies changes
                Logger.log(`Prepared ${fileChangesToApply.length} file changes for git commit after user approval`);
            }

            // Clean up abort controller
            this.abortController = null;
        } catch (error: any) {
            // Clean up abort controller
            this.abortController = null;

            // Check if error is due to abort
            if (error.name === 'AbortError') {
                // Request was cancelled by user, already handled
                return;
            }

            this.sendMessage({
                type: 'loadingStopped'
            });
            this.sendMessage({
                type: 'error',
                message: error.message || `Failed to get response from ${provider === ProviderType.Azure ? 'Azure GPT' : 'NVIDIA'}`
            });
        }
    }

    /**
     * Transform structured edits to legacy format for UI compatibility
     */
    private async transformFilesForUI(
        files: any[]
    ): Promise<Array<{ path: string; action: string; content: string; originalContent?: string }>> {
        const result: Array<{ path: string; action: string; content: string; originalContent?: string }> = [];
        const seenFiles = new Set<string>();  // Track unique files

        for (const file of files) {
            // Check if this is structured edit format (has 'edits' property)
            if ((file.edits && Array.isArray(file.edits)) || (file.filePath && file.edits)) {
                // Structured edit format - transform to legacy
                const filePath = file.path || file.filePath;

                // Skip duplicate files
                if (seenFiles.has(filePath)) {
                    Logger.warn(`Skipping duplicate file: ${filePath}`);
                    continue;
                }
                seenFiles.add(filePath);

                const edits = file.edits || [];

                // Generate a diff preview with +/- markers and context
                const diffPreview = await this.generateDiffPreview(filePath, edits, file.originalContent);

                // For structured edits, we need to keep the edits array format
                // so the applyChanges method can recognize it as structured format
                result.push({
                    path: filePath,
                    action: 'update',
                    content: diffPreview,  // Use diff preview instead of empty string
                    originalContent: file.originalContent,
                    edits: edits,  // Preserve the edits array
                    isStructured: true  // Mark as structured edit format
                });
            } else {
                // Legacy format - keep as is
                const filePath = file.path;
                if (filePath && seenFiles.has(filePath)) {
                    Logger.warn(`Skipping duplicate file: ${filePath}`);
                    continue;
                }
                if (filePath) seenFiles.add(filePath);
                result.push(file);
            }
        }

        return result;
    }

    /**
     * Generate a diff preview with +/- markers and context
     */
    private async generateDiffPreview(
        filePath: string,
        edits: any[],
        originalContent?: string
    ): Promise<string> {
        try {
            let preview = '';

            for (const edit of edits) {
                const startLine = edit.startLine;
                const endLine = edit.endLine;

                // Read the file to get context
                const workspaceRoot = await this.fileManager.getWorkspaceRoot();
                const fullPath = path.join(workspaceRoot, filePath);

                let content: string;
                let lines: string[];

                try {
                    // Try to read the file
                    if (originalContent) {
                        content = originalContent;
                    } else {
                        content = fs.readFileSync(fullPath, 'utf-8');
                    }
                    lines = content.split('\n');
                } catch (fileError: any) {
                    // File might not exist or can't be read
                    Logger.warn(`Could not read file ${filePath}: ${fileError.message}`);

                    // Show preview without context
                    preview += `${filePath} (new file):\n`;
                    const newLines = edit.newContent.split('\n');
                    for (const newLine of newLines) {
                        preview += `+ ${newLine}\n`;
                    }
                    preview += '\n';
                    continue;
                }

                // Validate line numbers
                if (startLine < 0 || startLine >= lines.length) {
                    Logger.warn(`Invalid startLine ${startLine} for file ${filePath} with ${lines.length} lines`);
                    preview += `${filePath}: Line ${startLine}\n+ ${edit.newContent}\n\n`;
                    continue;
                }

                // Context: show 2 lines before and after
                const contextBefore = Math.max(0, startLine - 2);
                const contextAfter = Math.min(lines.length, endLine + 3);

                preview += `${filePath} Line ${startLine}${startLine !== endLine ? `-${endLine}` : ''}:\n`;

                // Show context before (2 lines)
                for (let i = contextBefore; i < startLine; i++) {
                    if (i >= 0 && i < lines.length) {
                        preview += `  ${lines[i]}\n`;
                    }
                }

                // Show lines being removed with -
                for (let i = startLine; i < endLine; i++) {
                    if (i >= 0 && i < lines.length) {
                        preview += `- ${lines[i]}\n`;
                    }
                }

                // Show new content with +
                const newLines = edit.newContent.split('\n');
                for (const newLine of newLines) {
                    preview += `+ ${newLine}\n`;
                }

                // Show context after (2 lines)
                for (let i = endLine; i < contextAfter && i < endLine + 3; i++) {
                    if (i >= 0 && i < lines.length) {
                        preview += `  ${lines[i]}\n`;
                    }
                }

                preview += '\n';
            }

            return preview || 'No changes preview available';
        } catch (error: any) {
            Logger.error('Error generating diff preview:', error);
            return `Error: ${error.message}`;
        }
    }

    /**
     * Apply file changes (supports both legacy and structured format)
     */
    private async applyChanges(
        files: Array<{ path: string; action: string; content: string; edits?: any[]; isStructured?: boolean }>
    ): Promise<void> {
        try {
            // Check if this is the new structured format (has edits array or isStructured flag)
            const isStructured = files.length > 0 && ((files[0] as any).isStructured || 'edits' in (files[0] as any));

            if (isStructured) {
                // Transform to FileStructuredEdit format
                const structuredEdits: FileStructuredEdit[] = files
                    .filter(f => f.isStructured || f.edits)
                    .map(f => ({
                        filePath: f.path,
                        edits: f.edits || []
                    }));

                // Apply structured edits
                await this.applyStructuredEdits(structuredEdits);
            } else {
                // Legacy format - apply old method
                await this.applyLegacyFileChanges(files as Array<{ path: string; action: string; content: string }>);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to apply changes: ${error.message}`);
        }
    }

    /**
     * Apply structured edits using StructuredEditManager
     */
    private async applyStructuredEdits(fileEdits: FileStructuredEdit[]): Promise<void> {
        try {
            if (!this.structuredEditManager) {
                throw new Error('Structured edit manager not initialized');
            }

            // Create backups for files being modified
            const filesToBackup = fileEdits.map(f => f.filePath);

            await this.backupManager.backupFiles(filesToBackup);

            // Apply structured edits
            const result = await this.structuredEditManager.applyStructuredEdits(fileEdits, (msg) => {
                this.sendMessage({
                    type: 'info',
                    message: msg
                });
            });

            if (result.success) {
                vscode.window.showInformationMessage(
                    `Successfully applied ${result.applied} file edit(s)${result.failed > 0 ? ` (${result.failed} failed)` : ''}`
                );

                this.sendMessage({
                    type: 'changesApplied',
                    files: fileEdits
                });

                // Commit to git
                if (this.gitManager) {
                    const gitChanges: GitChange[] = [];
                    const messages = this.currentSession?.messages || [];
                    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');

                    for (const fileEdit of fileEdits) {
                        for (const edit of fileEdit.edits) {
                            gitChanges.push({
                                path: fileEdit.filePath,
                                action: 'update' as const,
                                content: edit.newContent
                            });
                        }
                    }

                    await this.gitManager.commitAIChanges(gitChanges, lastUserMessage?.content || 'AI changes');
                }
            } else {
                vscode.window.showErrorMessage(`Failed to apply some changes (${result.failed} failed, ${result.applied} succeeded)`);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to apply structured edits: ${error.message}`);
        }
    }

    /**
     * Apply legacy format file changes (backward compatibility)
     */
    private async applyLegacyFileChanges(
        files: Array<{ path: string; action: string; content: string }>
    ): Promise<void> {
        // Create backups
        const filesToBackup = files
            .filter((f) => f.action === 'update')
            .map((f) => f.path);

        await this.backupManager.backupFiles(filesToBackup);

        // Apply changes
        await this.fileManager.applyFileChanges(files);

        vscode.window.showInformationMessage(
            `Successfully applied changes to ${files.length} file(s)`
        );

        this.sendMessage({
            type: 'changesApplied',
            files
        });

        // Commit to git
        if (this.gitManager) {
            const gitChanges: GitChange[] = files.map(f => ({
                path: f.path,
                action: f.action as 'update' | 'create' | 'delete',
                content: f.content
            }));

            const messages = this.currentSession?.messages || [];
            const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
            await this.gitManager.commitAIChanges(gitChanges, lastUserMessage?.content || 'AI changes');
        }
    }

    /**
     * Apply single file change
     */
    private async applySingleChange(
        file: { path: string; action: string; content: string; edits?: any[]; isStructured?: boolean },
        userMessage: string
    ): Promise<void> {
        try {
            // Check if this is a structured edit
            if (file.isStructured && file.edits && this.structuredEditManager) {
                // Apply structured edit
                const structuredFile: FileStructuredEdit = {
                    filePath: file.path,
                    edits: file.edits
                };

                const result = await this.structuredEditManager.applyStructuredEdits([structuredFile]);

                if (result.success) {
                    vscode.window.showInformationMessage(
                        `Applied ${result.applied} edit(s) to ${file.path}`
                    );

                    // Commit to git
                    if (this.gitManager) {
                        const gitChanges: GitChange[] = [];
                        for (const edit of file.edits) {
                            gitChanges.push({
                                path: file.path,
                                action: 'update' as const,
                                content: edit.newContent
                            });
                        }
                        await this.gitManager.commitAIChanges(gitChanges, userMessage);
                    }
                } else {
                    throw new Error(`${result.failed} edit(s) failed`);
                }
            } else {
                // Legacy format
                // Create backup if updating
                if (file.action === 'update') {
                    await this.backupManager.backupFiles([file.path]);
                }

                // Apply change
                await this.fileManager.applyFileChanges([file]);

                // Commit to git
                if (this.gitManager) {
                    const gitChange: GitChange = {
                        path: file.path,
                        action: file.action as 'update' | 'create' | 'delete',
                        content: file.content
                    };
                    await this.gitManager.commitAIChanges([gitChange], userMessage);
                }

                vscode.window.showInformationMessage(`Applied change to ${file.path}`);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to apply change to ${file.path}: ${error.message}`);
        }
    }

    /**
     * Preview a file change (Cursor-style - show in editor, don't save yet)
     */
    private async previewChange(file: { path: string; edits?: any[]; isStructured?: boolean }): Promise<void> {
        try {
            if (!file.isStructured || !file.edits || !this.structuredEditManager) {
                vscode.window.showWarningMessage('Preview only available for structured edits');
                return;
            }

            // Store original content for revert
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder found');
            }

            const fullPath = path.join(workspaceFolders[0].uri.fsPath, file.path);
            const uri = vscode.Uri.file(fullPath);

            // Read and store original content
            const originalContent = await vscode.workspace.fs.readFile(uri);
            const originalText = Buffer.from(originalContent).toString('utf-8');

            // Store in a map for revert
            if (!this.previewOriginalContent) {
                this.previewOriginalContent = new Map<string, string>();
            }
            this.previewOriginalContent.set(file.path, originalText);

            // Open the file in editor
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc);

            // Apply edits to the document (NOT saved to disk yet)
            const edit = new vscode.WorkspaceEdit();

            for (const lineEdit of file.edits) {
                const endLineNumber = lineEdit.endLine > lineEdit.startLine
                    ? lineEdit.endLine
                    : lineEdit.startLine + 1;

                const range = new vscode.Range(
                    new vscode.Position(lineEdit.startLine, 0),
                    new vscode.Position(endLineNumber, 0)
                );

                edit.replace(uri, range, lineEdit.newContent);
            }

            await vscode.workspace.applyEdit(edit);

            vscode.window.showInformationMessage(`Preview: Changes shown in ${file.path} (not saved yet). Click Accept to save, or Revert to undo.`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to preview ${file.path}: ${error.message}`);
        }
    }

    /**
     * Revert preview (restore original content without saving)
     */
    private async revertPreview(filePath: string): Promise<void> {
        try {
            if (!this.previewOriginalContent || !this.previewOriginalContent.has(filePath)) {
                vscode.window.showWarningMessage('No preview to revert for this file');
                return;
            }

            const originalContent = this.previewOriginalContent.get(filePath);
            if (!originalContent) {
                return;
            }

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder found');
            }

            const fullPath = path.join(workspaceFolders[0].uri.fsPath, filePath);
            const uri = vscode.Uri.file(fullPath);

            // Write original content back
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(uri, encoder.encode(originalContent));

            // Reload the document if it's open
            const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === fullPath);
            if (doc) {
                await vscode.commands.executeCommand('workbench.action.files.revert');
            }

            this.previewOriginalContent.delete(filePath);

            vscode.window.showInformationMessage(`Reverted changes to ${filePath}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to revert ${filePath}: ${error.message}`);
        }
    }

    /**
     * Open a file in the editor
     */
    private async openFile(filePath: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            return;
        }

        const fullPath = `${workspaceFolders[0].uri.fsPath}/${filePath}`;
        const uri = vscode.Uri.file(fullPath);

        await vscode.window.showTextDocument(uri);
    }

    /**
     * Clear chat history
     */
    async clearHistory(): Promise<void> {
        if (this.currentSession) {
            this.currentSession.messages = [];
            await this.chatHistoryManager.updateSession(this.currentSession.id, []);
            this.messagesLoaded = false; // Reset the flag
            this.sendMessage({ type: 'historyCleared' });
        }
    }

    /**
     * Export chat history
     */
    async exportHistory(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const exportPath = `${workspaceFolders[0].uri.fsPath}/azure-gpt-chat-export-${Date.now()}.json`;
        const uri = vscode.Uri.file(exportPath);

        const encoder = new TextEncoder();
        const messages = this.currentSession?.messages || [];
        const content = encoder.encode(JSON.stringify(messages, null, 2));

        await vscode.workspace.fs.writeFile(uri, content);

        vscode.window.showInformationMessage(`Chat history exported to ${exportPath}`);
    }

    /**
     * Load chat history from storage
     */
    private async loadChatHistory(): Promise<void> {
        if (!this.currentSession) {
            await this.initializeSession();
        }

        if (this.currentSession) {
            this.sendMessage({
                type: 'sessionLoaded',
                session: this.currentSession
            });
        }
    }

    /**
     * Save chat history to storage
     */
    private async saveChatHistory(): Promise<void> {
        if (this.currentSession) {
            await this.chatHistoryManager.updateSession(
                this.currentSession.id,
                this.currentSession.messages
            );
        }
    }

    /**
     * Create a new chat
     */
    private async createNewChat(): Promise<void> {
        const newSession = await this.chatHistoryManager.createSession();
        this.currentSession = newSession;
        this.messagesLoaded = false; // Reset the flag
        this.sendMessage({ type: 'sessionChanged', session: newSession });
        Logger.log(`Created new chat session: ${newSession.id}`);
    }

    /**
     * Switch to a different session
     */
    private async switchSession(sessionId: string): Promise<void> {
        await this.chatHistoryManager.setActiveSession(sessionId);
        const session = await this.chatHistoryManager.getSession(sessionId);

        if (session) {
            this.currentSession = session;
            this.messagesLoaded = false; // Reset the flag
            this.sendMessage({ type: 'sessionChanged', session });
            Logger.log(`Switched to chat session: ${sessionId}`);
        }
    }

    /**
     * Delete a session
     */
    private async deleteSession(sessionId: string): Promise<void> {
        await this.chatHistoryManager.deleteSession(sessionId);

        // Reload current session
        await this.initializeSession();
        if (this.currentSession) {
            this.sendMessage({
                type: 'sessionChanged',
                session: this.currentSession
            });
        }

        Logger.log(`Deleted session: ${sessionId}`);
    }

    /**
     * Load all sessions for the sidebar
     */
    private async loadSessions(): Promise<void> {
        const sessions = await this.chatHistoryManager.getAllSessions();
        const activeSessionId = await this.chatHistoryManager.getActiveSessionId();

        this.sendMessage({
            type: 'sessionsList',
            sessions: sessions,
            activeSessionId: activeSessionId
        });
    }

    /**
     * Update session title
     */
    private async updateSessionTitle(sessionId: string, title: string): Promise<void> {
        await this.chatHistoryManager.updateSessionTitle(sessionId, title);
        await this.loadSessions();
    }

    /**
     * Execute terminal command
     */
    private async executeTerminalCommand(command: string): Promise<void> {
        try {
            const cmd = await this.terminalManager.executeCommand(command);
            this.sendMessage({
                type: 'terminalCommandExecuted',
                command: cmd
            });
        } catch (error: any) {
            this.sendMessage({
                type: 'error',
                message: `Failed to execute command: ${error.message}`
            });
        }
    }

    /**
     * Kill process on port
     */
    private async killProcessOnPort(port: number): Promise<void> {
        try {
            const success = await this.terminalManager.killProcessOnPort(port);
            if (success) {
                this.sendMessage({
                    type: 'info',
                    message: `Successfully killed process on port ${port}`
                });
            } else {
                this.sendMessage({
                    type: 'error',
                    message: `No process found on port ${port}`
                });
            }
        } catch (error: any) {
            this.sendMessage({
                type: 'error',
                message: `Failed to kill process: ${error.message}`
            });
        }
    }

    /**
     * Kill process by name
     */
    private async killProcessByName(name: string): Promise<void> {
        try {
            const success = await this.terminalManager.killProcessByName(name);
            if (success) {
                this.sendMessage({
                    type: 'info',
                    message: `Successfully killed process: ${name}`
                });
            } else {
                this.sendMessage({
                    type: 'error',
                    message: `No process found with name: ${name}`
                });
            }
        } catch (error: any) {
            this.sendMessage({
                type: 'error',
                message: `Failed to kill process: ${error.message}`
            });
        }
    }

    /**
     * Check if port is in use
     */
    private async checkPortInUse(port: number): Promise<void> {
        try {
            const inUse = await this.terminalManager.isPortInUse(port);
            this.sendMessage({
                type: 'portCheckResult',
                port: port,
                inUse: inUse
            });
        } catch (error: any) {
            this.sendMessage({
                type: 'error',
                message: `Failed to check port: ${error.message}`
            });
        }
    }

    /**
     * Send message to webview
     */
    private sendMessage(message: any): void {
        if (this.view) {
            this.view.webview.postMessage(message);
        }
    }

    /**
     * Generate unique ID
     */
    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get HTML for webview
     */
    private getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Azure GPT Chat</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .header h1 {
            font-size: 16px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .header-actions {
            display: flex;
            gap: 8px;
        }

        .header-actions button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }

        .header-actions button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 16px;
        }

        .message {
            padding: 12px;
            border-radius: 8px;
            max-width: 85%;
            word-wrap: break-word;
        }

        .message.user {
            align-self: flex-end;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .message.assistant {
            align-self: flex-start;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            color: var(--vscode-foreground);
        }

        .message.system {
            align-self: center;
            background-color: var(--vscode-editorInfo-background);
            color: var(--vscode-editorInfo-foreground);
            font-size: 12px;
            max-width: 100%;
        }

        .message-content {
            white-space: pre-wrap;
            overflow-x: auto;
        }

        .message-content p {
            margin: 8px 0;
        }

        .message-content h1,
        .message-content h2,
        .message-content h3,
        .message-content h4 {
            margin: 12px 0 8px 0;
            font-weight: 600;
        }

        .message-content h1 { font-size: 1.5em; }
        .message-content h2 { font-size: 1.3em; }
        .message-content h3 { font-size: 1.1em; }

        .message-content ul,
        .message-content ol {
            margin: 8px 0;
            padding-left: 24px;
        }

        .message-content li {
            margin: 4px 0;
        }

        .message-content pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
            border: 1px solid var(--vscode-panel-border);
        }

        .message-content code {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
        }

        .message-content :not(pre) > code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
        }

        .message-content a {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
        }

        .message-content strong {
            font-weight: 600;
        }

        .message-content em {
            font-style: italic;
        }

        .message-content blockquote {
            border-left: 3px solid var(--vscode-textLink-foreground);
            padding-left: 12px;
            margin: 8px 0;
            color: var(--vscode-descriptionForeground);
        }

        .message-content table {
            border-collapse: collapse;
            margin: 8px 0;
        }

        .message-content th,
        .message-content td {
            border: 1px solid var(--vscode-panel-border);
            padding: 6px 12px;
        }

        .message-content th {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }

        .file-changes {
            margin-top: 12px;
            padding: 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
        }

        .file-changes h3 {
            font-size: 14px;
            margin-bottom: 12px;
        }

        .file-changes-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .accept-all-button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }

        .accept-all-button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .file-change {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            background-color: var(--vscode-editor-background);
            margin: 6px 0;
            border-radius: 4px;
            border-left: 3px solid transparent;
        }

        .file-change.create {
            border-left-color: #4ec9b0;
        }

        .file-change.update {
            border-left-color: #dcdcaa;
        }

        .file-change.delete {
            border-left-color: #f14c4c;
        }

        .file-change-info {
            flex: 1;
        }

        .file-change-path {
            font-size: 13px;
            font-weight: 500;
        }

        .file-change-badge {
            display: inline-block;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            margin-left: 8px;
            text-transform: uppercase;
            font-weight: 600;
        }

        .file-change-badge.create {
            background-color: #4ec9b0;
            color: #000;
        }

        .file-change-badge.update {
            background-color: #dcdcaa;
            color: #000;
        }

        .file-change-badge.delete {
            background-color: #f14c4c;
            color: #fff;
        }

        .file-change-actions {
            display: flex;
            gap: 6px;
        }

        .file-change-actions button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 10px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }

        .file-change-actions button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .file-change-preview {
            margin-top: 8px;
            padding: 12px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            font-size: 12px;
            display: none;
        }

        .file-change-preview.show {
            display: block;
        }

        .file-change-preview-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .file-change-preview-content {
            background-color: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow-x: auto;
        }

        .file-change-preview-content pre {
            margin: 0;
            padding: 12px;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            white-space: pre;
            overflow-x: auto;
        }

        .file-change-preview-content code {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
        }

        .loading-indicator {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            margin-bottom: 12px;
        }

        .loading-indicator.hidden {
            display: none;
        }

        .stop-button {
            background: var(--vscode-errorBackground);
            color: var(--vscode-errorForeground);
            border: none;
            padding: 6px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            display: none;
        }

        .stop-button:not(.hidden) {
            display: block;
        }

        .stop-button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .loading-content {
            display: none;
            flex: 1;
            font-size: 13px;
            line-height: 1.5;
            color: var(--vscode-foreground);
            white-space: pre-wrap;
            word-wrap: break-word;
            margin-top: 8px;
        }

        .loading-content:not(.hidden) {
            display: block;
        }

        .token-usage {
            display: none;
            margin-top: 12px;
            padding: 12px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            font-size: 11px;
        }

        .token-usage:not(.hidden) {
            display: block;
        }

        .token-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
        }

        .token-row:last-child {
            margin-bottom: 0;
        }

        .token-label {
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }

        .token-value {
            color: var(--vscode-foreground);
            font-weight: 600;
            font-family: var(--vscode-editor-font-family);
        }

        .token-context-window {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-panel-border);
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            text-align: center;
        }

        #contextUsage.warning {
            color: var(--vscode-errorForeground);
        }

        #contextUsage.high {
            color: var(--vscode-warningForeground);
        }

        .loading-indicator {
            flex-direction: column;
            align-items: flex-start;
        }

        .input-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .context-options {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .context-option {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
        }

        .context-option input[type="checkbox"] {
            cursor: pointer;
        }

        .context-option {
            cursor: help;
            position: relative;
        }

        .input-row {
            display: flex;
            gap: 8px;
        }

        .input-row textarea {
            flex: 1;
            min-height: 60px;
            max-height: 200px;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            resize: vertical;
            font-family: var(--vscode-font-family);
        }

        .input-row button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        }

        .input-row button:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground);
        }

        .input-row button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .image-attachment-container {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-bottom: 8px;
        }

        .image-upload-button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .image-upload-button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .image-preview {
            display: none;
            align-items: center;
            gap: 8px;
            padding: 6px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }

        .image-preview:not(.hidden) {
            display: flex;
        }

        .image-preview img {
            max-width: 60px;
            max-height: 60px;
            border-radius: 4px;
            object-fit: cover;
            display: none;
        }

        .image-preview:not(.hidden) img {
            display: block;
        }

        .image-preview-info {
            display: flex;
            flex-direction: column;
            font-size: 11px;
        }

        .image-preview-name {
            color: var(--vscode-foreground);
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .image-preview-remove {
            background: var(--vscode-errorBackground);
            color: var(--vscode-errorForeground);
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }

        .image-preview-remove:hover {
            opacity: 0.8;
        }

        #imageInput {
            display: none;
        }

        .loading {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid var(--vscode-foreground);
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state h2 {
            font-size: 18px;
            margin-bottom: 8px;
        }

        .empty-state p {
            font-size: 14px;
        }

        .empty-state button {
            margin-top: 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }

        .loading-content::after {
            content: '▋';
            display: inline-block;
            margin-left: 4px;
            animation: blink 1s infinite;
        }

        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>KBot</h1>
        <div class="header-actions">
            <button id="newChatBtn">New Chat</button>
            <button id="clearHistory">Clear History</button>
            <button id="exportHistory">Export</button>
            <button id="configureExclusions">Exclusions</button>
            <button id="configureCredentials">Configure</button>
        </div>
    </div>

    <div class="chat-container" id="chatContainer">
        <div class="empty-state">
            <h2>Welcome to DevBot Assistant</h2>
            <p>Ask me anything about your code!</p>
            <button id="configureNow">Configure Azure Credentials</button>
        </div>
    </div>

    <div class="loading-indicator hidden" id="loadingIndicator">
        <div class="spinner"></div>
        <span id="loadingMessage">Thinking...</span>
        <button id="stopButton" class="stop-button hidden">Stop</button>
        <div id="loadingContent" class="loading-content hidden"></div>

        <!-- Token Usage Display -->
        <div class="token-usage" id="tokenUsage">
            <div class="token-row">
                <span class="token-label">Input Tokens:</span>
                <span class="token-value" id="inputTokens">0</span>
            </div>
            <div class="token-row">
                <span class="token-label">Output Tokens:</span>
                <span class="token-value" id="outputTokens">0</span>
            </div>
            <div class="token-row">
                <span class="token-label">Total Tokens:</span>
                <span class="token-value" id="totalTokens">0</span>
            </div>
            <div class="token-row">
                <span class="token-label">Context Usage:</span>
                <span class="token-value" id="contextUsage">0%</span>
            </div>
            <div class="token-context-window">
                Context Window: <span id="contextWindow">128K</span>
            </div>
        </div>
    </div>

    <div class="input-container">
        <div class="context-options">
            <label class="context-option" title="Include the currently open file in context">
                <input type="checkbox" id="includeCurrentFile" checked>
                Active File
            </label>
            <label class="context-option" title="Include git diff of recent changes">
                <input type="checkbox" id="includeGitDiff">
                Git Diff
            </label>
            <label class="context-option" title="Include terminal output">
                <input type="checkbox" id="includeTerminal">
                Terminal
            </label>
        </div>

        <div class="image-attachment-container">
            <input type="file" id="imageInput" accept="image/png,image/jpeg,image/gif,image/webp">
            <button id="imageUploadButton" class="image-upload-button">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8.75 2.75a.75.75 0 00-1.5 0v5.5h-5.5a.75.75 0 000 1.5h5.5v5.5a.75.75 0 001.5 0v-5.5h5.5a.75.75 0 000-1.5h-5.5v-5.5z"/>
                </svg>
                Add Image
            </button>
            <div id="imagePreview" class="image-preview hidden">
                <img id="previewImage" alt="Preview">
                <div class="image-preview-info">
                    <span id="imageName" class="image-preview-name"></span>
                </div>
                <button id="removeImage" class="image-preview-remove">Remove</button>
            </div>
        </div>

        <div class="input-row">
            <textarea id="messageInput" placeholder="Ask me anything about your code..."></textarea>
            <button id="sendButton">Send</button>
        </div>
    </div>

    <script>
        console.log('Chat panel script loading...');
        const vscode = acquireVsCodeApi();
        let isLoading = false;
        let attachedImage = null; // Store base64 encoded image

        // Wait for DOM to be ready before accessing elements
        function initializeDOMElements() {
            console.log('DOM ready state:', document.readyState);
            console.log('Initializing DOM elements...');
            
            // Get all DOM elements
            const chatContainer = document.getElementById('chatContainer');
            const messageInput = document.getElementById('messageInput');
            const sendButton = document.getElementById('sendButton');
            const newChatBtn = document.getElementById('newChatBtn');
            const clearHistoryBtn = document.getElementById('clearHistory');
            const exportHistoryBtn = document.getElementById('exportHistory');
            const exclusionsBtn = document.getElementById('configureExclusions');
            const configureBtn = document.getElementById('configureCredentials');
            const configureNowBtn = document.getElementById('configureNow');
            const imageInput = document.getElementById('imageInput');
            const imageUploadButton = document.getElementById('imageUploadButton');
            const imagePreview = document.getElementById('imagePreview');
            const previewImage = document.getElementById('previewImage');
            const imageName = document.getElementById('imageName');
            const removeImageBtn = document.getElementById('removeImage');

            console.log('DOM elements found:', {
                chatContainer: !!chatContainer,
                messageInput: !!messageInput,
                sendButton: !!sendButton,
                newChatBtn: !!newChatBtn,
                clearHistoryBtn: !!clearHistoryBtn,
                exportHistoryBtn: !!exportHistoryBtn,
                exclusionsBtn: !!exclusionsBtn,
                configureBtn: !!configureBtn,
                configureNowBtn: !!configureNowBtn,
                imageUploadButton: !!imageUploadButton,
                imageInput: !!imageInput
            });

            // Test message channel
            console.log('Testing message channel...');
            vscode.postMessage({ type: 'ping', timestamp: Date.now() });
            console.log('Ping message sent');

            // Attach event listeners
            attachEventListeners();
        }

        // Attach all event listeners
        function attachEventListeners() {
            console.log('=== Attaching event listeners ===');

            // Get DOM elements again to ensure they're accessible in this scope
            const chatContainer = document.getElementById('chatContainer');
            const messageInput = document.getElementById('messageInput');
            const sendButton = document.getElementById('sendButton');
            const newChatBtn = document.getElementById('newChatBtn');
            const clearHistoryBtn = document.getElementById('clearHistory');
            const exportHistoryBtn = document.getElementById('exportHistory');
            const exclusionsBtn = document.getElementById('configureExclusions');
            const configureBtn = document.getElementById('configureCredentials');
            const configureNowBtn = document.getElementById('configureNow');
            const imageInput = document.getElementById('imageInput');
            const imageUploadButton = document.getElementById('imageUploadButton');
            const imagePreview = document.getElementById('imagePreview');
            const previewImage = document.getElementById('previewImage');
            const imageName = document.getElementById('imageName');
            const removeImageBtn = document.getElementById('removeImage');

            // Log all button elements for debugging
            console.log('DOM elements status:', {
                sendButton: !!sendButton,
                messageInput: !!messageInput,
                newChatBtn: !!newChatBtn,
                clearHistoryBtn: !!clearHistoryBtn,
                exportHistoryBtn: !!exportHistoryBtn,
                exclusionsBtn: !!exclusionsBtn,
                configureBtn: !!configureBtn,
                configureNowBtn: !!configureNowBtn,
                imageUploadButton: !!imageUploadButton,
                imageInput: !!imageInput
            });

            // Send button
            if (sendButton && !sendButton.hasAttribute('data-initialized')) {
                sendButton.addEventListener('click', () => {
                    console.log('✓ Send button clicked!');
                    sendMessage();
                });
                sendButton.setAttribute('data-initialized', 'true');
                console.log('✓ Send button event listener attached');
            } else if (sendButton) {
                console.log('✓ Send button already initialized');
            } else {
                console.error('✗ Send button element NOT FOUND!');
            }

            // Message input - Enter key
            if (messageInput && !messageInput.hasAttribute('data-initialized')) {
                messageInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        console.log('✓ Enter key pressed, sending message');
                        sendMessage();
                    }
                });
                messageInput.setAttribute('data-initialized', 'true');
                console.log('✓ Message input event listener attached');
            } else if (messageInput) {
                console.log('✓ Message input already initialized');
            } else {
                console.error('✗ Message input element NOT FOUND!');
            }

            // New chat button
            if (newChatBtn && !newChatBtn.hasAttribute('data-initialized')) {
                newChatBtn.addEventListener('click', () => {
                    console.log('✓ New chat button clicked');
                    vscode.postMessage({ type: 'newChat' });
                });
                newChatBtn.setAttribute('data-initialized', 'true');
                console.log('✓ New chat button event listener attached');
            } else if (newChatBtn) {
                console.log('✓ New chat button already initialized');
            } else {
                console.error('✗ New chat button element NOT FOUND!');
            }

            // Clear history button
            if (clearHistoryBtn && !clearHistoryBtn.hasAttribute('data-initialized')) {
                clearHistoryBtn.addEventListener('click', () => {
                    console.log('✓ Clear history button clicked');
                    vscode.postMessage({ type: 'clearHistory' });
                });
                clearHistoryBtn.setAttribute('data-initialized', 'true');
                console.log('✓ Clear history button event listener attached');
            } else if (clearHistoryBtn) {
                console.log('✓ Clear history button already initialized');
            } else {
                console.error('✗ Clear history button element NOT FOUND!');
            }

            // Export history button
            if (exportHistoryBtn && !exportHistoryBtn.hasAttribute('data-initialized')) {
                exportHistoryBtn.addEventListener('click', () => {
                    console.log('✓ Export history button clicked');
                    vscode.postMessage({ type: 'exportHistory' });
                });
                exportHistoryBtn.setAttribute('data-initialized', 'true');
                console.log('✓ Export history button event listener attached');
            } else if (exportHistoryBtn) {
                console.log('✓ Export history button already initialized');
            } else {
                console.error('✗ Export history button element NOT FOUND!');
            }

            // Exclusions button
            if (exclusionsBtn && !exclusionsBtn.hasAttribute('data-initialized')) {
                exclusionsBtn.addEventListener('click', () => {
                    console.log('✓ Exclusions button clicked');
                    vscode.postMessage({ type: 'configureExclusions' });
                });
                exclusionsBtn.setAttribute('data-initialized', 'true');
                console.log('✓ Exclusions button event listener attached');
            } else if (exclusionsBtn) {
                console.log('✓ Exclusions button already initialized');
            } else {
                console.error('✗ Exclusions button element NOT FOUND!');
            }

            // Configure button
            if (configureBtn && !configureBtn.hasAttribute('data-initialized')) {
                configureBtn.addEventListener('click', () => {
                    console.log('✓ Configure button clicked');
                    vscode.postMessage({ type: 'configureCredentials' });
                });
                configureBtn.setAttribute('data-initialized', 'true');
                console.log('✓ Configure button event listener attached');
            } else if (configureBtn) {
                console.log('✓ Configure button already initialized');
            } else {
                console.error('✗ Configure button element NOT FOUND!');
            }

            // Configure now button
            if (configureNowBtn && !configureNowBtn.hasAttribute('data-initialized')) {
                configureNowBtn.addEventListener('click', () => {
                    console.log('✓ Configure now button clicked');
                    vscode.postMessage({ type: 'configureCredentials' });
                });
                configureNowBtn.setAttribute('data-initialized', 'true');
                console.log('✓ Configure now button event listener attached');
            } else if (configureNowBtn) {
                console.log('✓ Configure now button already initialized');
            } else {
                console.error('✗ Configure now button element NOT FOUND!');
            }

            console.log('=== Event listeners attachment complete ===');

            // Stop button - cancel in-progress request
            const stopButton = document.getElementById('stopButton');
            if (stopButton) {
                stopButton.addEventListener('click', () => {
                    console.log('✓ Stop button clicked');
                    vscode.postMessage({ type: 'stopRequest' });
                });
                console.log('✓ Stop button event listener attached');
            } else {
                console.warn('⚠ Stop button element not found (optional, may not be present yet)');
            }

            // Image upload handling - with null checks
            if (imageUploadButton && imageInput) {
                imageUploadButton.addEventListener('click', () => {
                    console.log('✓ Image upload button clicked');
                    imageInput.click();
                });
                console.log('✓ Image upload button event listener attached');

                imageInput.addEventListener('change', (e) => {
                    console.log('✓ Image input changed');
                    const file = e.target.files[0];
                    if (file) {
                        // Check file size (max 10MB)
                        if (file.size > 10 * 1024 * 1024) {
                            alert('Image size must be less than 10MB');
                            imageInput.value = '';
                            return;
                        }

                        // Check file type
                        if (!file.type.startsWith('image/')) {
                            alert('Please select an image file');
                            imageInput.value = '';
                            return;
                        }

                        // Read and encode the image
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const base64 = event.target.result.split(',')[1]; // Remove data URL prefix
                            attachedImage = {
                                data: base64,
                                mimeType: file.type,
                                name: file.name
                            };

                            // Show preview
                            if (previewImage && imageName && imagePreview) {
                                previewImage.src = event.target.result;
                                imageName.textContent = file.name;
                                imagePreview.classList.remove('hidden');
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }

            // Remove image button
            if (removeImageBtn) {
                removeImageBtn.addEventListener('click', () => {
                    attachedImage = null;
                    if (imageInput) imageInput.value = '';
                    if (imagePreview) imagePreview.classList.add('hidden');
                });
            }
        }

        // Send message function
        function sendMessage() {
            try {
                const messageInput = document.getElementById('messageInput');
                console.log('sendMessage called, message:', messageInput?.value);
                if (!messageInput) {
                    console.error('messageInput not found!');
                    return;
                }
                const message = messageInput.value.trim();

                if (!message || isLoading) {
                    console.log('Message empty or loading, returning');
                    return;
                }

                const includeCurrentFile = document.getElementById('includeCurrentFile');
                const includeGitDiff = document.getElementById('includeGitDiff');
                const includeTerminal = document.getElementById('includeTerminal');

                const context = {
                    includeCurrentFile: includeCurrentFile ? includeCurrentFile.checked : false,
                    includeGitDiff: includeGitDiff ? includeGitDiff.checked : false,
                    includeTerminal: includeTerminal ? includeTerminal.checked : false
                };

                // Clear input and reset image attachment
                messageInput.value = '';
                const imageToSend = attachedImage;
                attachedImage = null;
                imageInput.value = '';
                if (imagePreview) imagePreview.classList.add('hidden');
                
                setLoading(true);

                const messageData = {
                    type: 'sendMessage',
                    message,
                    context,
                    image: imageToSend
                };
                console.log('Sending message to extension:', messageData);
                vscode.postMessage(messageData);
            } catch (error) {
                console.error('Error in sendMessage:', error);
                const chatContainer = document.getElementById('chatContainer');
                if (chatContainer) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'message system';
                    errorDiv.innerHTML = \`<div class="message-content">Error sending message: \${error.message}</div>\`;
                    chatContainer.appendChild(errorDiv);
                }
                setLoading(false);
            }
        }

// Set loading state
function setLoading(loading, message = 'Thinking...') {
    isLoading = loading;
    sendButton.disabled = loading;
    sendButton.textContent = loading ? 'Sending...' : 'Send';

    const loadingIndicator = document.getElementById('loadingIndicator');
    const loadingMessage = document.getElementById('loadingMessage');
    const loadingContent = document.getElementById('loadingContent');
    const stopButton = document.getElementById('stopButton');

    if (loading) {
        loadingIndicator.classList.remove('hidden');
        loadingMessage.textContent = message;
        if (loadingContent) {
            loadingContent.textContent = '';
            loadingContent.classList.add('hidden');
        }
        if (stopButton) {
            stopButton.classList.remove('hidden');
        }
    } else {
        loadingIndicator.classList.add('hidden');
        if (stopButton) {
            stopButton.classList.add('hidden');
        }
    }
}

// Update loading message without changing loading state
function updateLoadingMessage(message) {
    const loadingMessage = document.getElementById('loadingMessage');
    if (loadingMessage) {
        loadingMessage.textContent = message;
    }
}

// Token counting - rough estimation (1 token ≈ 4 characters for English)
function estimateTokens(text) {
    if (!text) return 0;
    // Rough estimation: ~4 characters per token for English text
    // This is not exact but gives a reasonable approximation
    return Math.ceil(text.length / 4);
}

// Update token display
function updateTokenDisplay(inputTokens, outputTokens, contextWindow = 128000) {
    const inputEl = document.getElementById('inputTokens');
    const outputEl = document.getElementById('outputTokens');
    const totalEl = document.getElementById('totalTokens');
    const usageEl = document.getElementById('contextUsage');

    if (inputEl) inputEl.textContent = inputTokens.toLocaleString();
    if (outputEl) outputEl.textContent = outputTokens.toLocaleString();

    const total = inputTokens + outputTokens;
    if (totalEl) totalEl.textContent = total.toLocaleString();

    if (usageEl) {
        const usage = ((total / contextWindow) * 100).toFixed(1);
        usageEl.textContent = usage + '%';

        // Update color based on usage
        usageEl.className = 'token-value';
        if (parseFloat(usage) > 90) {
            usageEl.classList.add('warning');
        } else if (parseFloat(usage) > 75) {
            usageEl.classList.add('high');
        }
    }
}

// Reset token display
function resetTokenDisplay() {
    updateTokenDisplay(0, 0);
}

// Streaming message handling - shows in loader like Cursor
let streamingContent = '';
let isStreaming = false;
let currentInputTokens = 0;
let currentOutputTokens = 0;

function appendStreamingContent(delta) {
    isStreaming = true;

    // Show streaming content in the loading indicator
    const loadingIndicator = document.getElementById('loadingIndicator');
    const loadingMessage = document.getElementById('loadingMessage');
    const loadingContent = document.getElementById('loadingContent');

    if (loadingContent) {
        loadingContent.classList.remove('hidden');
        loadingMessage.classList.add('hidden');

        // Append the delta and show it
        streamingContent += delta;
        loadingContent.textContent = streamingContent;

        // Update output token count in real-time
        currentOutputTokens = estimateTokens(streamingContent);
        updateTokenDisplay(currentInputTokens, currentOutputTokens);

        // Auto-scroll chat container to show latest
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

function setInputTokens(tokens) {
    currentInputTokens = tokens;
    updateTokenDisplay(currentInputTokens, currentOutputTokens);
}

function finalizeStreamingMessage() {
    isStreaming = false;
    streamingContent = '';

    // Hide loading indicator and content
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.classList.add('hidden');
    }

    const loadingContent = document.getElementById('loadingContent');
    if (loadingContent) {
        loadingContent.classList.add('hidden');
        loadingContent.textContent = '';
    }

    const loadingMessage = document.getElementById('loadingMessage');
    if (loadingMessage) {
        loadingMessage.classList.remove('hidden');
    }

    // Note: The actual message will be sent by the backend via 'messageAdded' event
    // after parsing the structured response and extracting file changes
}

// Store current files for accept all
let currentFiles = [];
let currentUserMessage = '';

// Add file changes
function addFileChanges(files, userMessage) {
    currentFiles = files;
    currentUserMessage = userMessage;

    const changesDiv = document.createElement('div');
    changesDiv.className = 'file-changes';

    const created = files.filter(f => f.action === 'create').length;
    const modified = files.filter(f => f.action === 'update').length;
    const deleted = files.filter(f => f.action === 'delete').length;

    let summary = 'Proposed Changes';
    if (created > 0 || modified > 0 || deleted > 0) {
        summary += ' (';
        if (created > 0) summary += created + ' new';
        if (created > 0 && modified > 0) summary += ', ';
        if (modified > 0) summary += modified + ' modified';
        if ((created > 0 || modified > 0) && deleted > 0) summary += ', ';
        if (deleted > 0) summary += deleted + ' deleted';
        summary += ')';
    }

    const acceptAllButton = document.createElement('button');
    acceptAllButton.className = 'accept-all-button';
    acceptAllButton.textContent = 'Accept All';
    acceptAllButton.onclick = () => acceptAllChanges();

    const headerDiv = document.createElement('div');
    headerDiv.className = 'file-changes-header';
    const h3 = document.createElement('h3');
    h3.textContent = summary;
    headerDiv.appendChild(h3);
    headerDiv.appendChild(acceptAllButton);
    changesDiv.appendChild(headerDiv);

    files.forEach((file, index) => {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-change ' + file.action;

        const badgeLabels = {
            'create': 'NEW',
            'update': 'MODIFIED',
            'delete': 'DELETED'
        };

        // Info section
        const infoDiv = document.createElement('div');
        infoDiv.className = 'file-change-info';
        const pathDiv = document.createElement('div');
        pathDiv.className = 'file-change-path';
        pathDiv.textContent = file.path;

        const badge = document.createElement('span');
        badge.className = 'file-change-badge ' + file.action;
        badge.textContent = badgeLabels[file.action] || file.action.toUpperCase();

        pathDiv.appendChild(badge);
        infoDiv.appendChild(pathDiv);

        // Actions section
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'file-change-actions';

        // Preview button (Cursor-style - show in editor, don't save)
        const previewBtn = document.createElement('button');
        previewBtn.textContent = 'Preview';
        previewBtn.onclick = () => {
            previewSingleChange(file.path);
        };

        // Revert button (undo preview without saving)
        const revertBtn = document.createElement('button');
        revertBtn.textContent = 'Revert';
        revertBtn.onclick = () => {
            revertPreview(file.path);
        };

        // View button
        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'View';
        viewBtn.onclick = () => {
            openFile(file.path);
        };

        // Accept button
        const acceptBtn = document.createElement('button');
        acceptBtn.textContent = 'Accept';
        acceptBtn.onclick = () => {
            acceptSingleChange(file.path, file.action);
        };

        actionsDiv.appendChild(previewBtn);
        actionsDiv.appendChild(revertBtn);
        actionsDiv.appendChild(viewBtn);
        actionsDiv.appendChild(acceptBtn);

        // Preview section
        const previewDiv = document.createElement('div');
        previewDiv.className = 'file-change-preview';
        previewDiv.id = 'preview-' + index;

        const previewHeader = document.createElement('div');
        previewHeader.className = 'file-change-preview-header';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = 'Preview: ' + file.path;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.onclick = () => {
            previewDiv.classList.remove('show');
        };

        previewHeader.appendChild(titleSpan);
        previewHeader.appendChild(closeBtn);

        const previewContent = document.createElement('div');
        previewContent.className = 'file-change-preview-content';
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = file.content || '';
        pre.appendChild(code);
        previewContent.appendChild(pre);

        previewDiv.appendChild(previewHeader);
        previewDiv.appendChild(previewContent);

        fileDiv.appendChild(infoDiv);
        fileDiv.appendChild(actionsDiv);
        fileDiv.appendChild(previewDiv);

        changesDiv.appendChild(fileDiv);
    });

    chatContainer.appendChild(changesDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Toggle code preview
function togglePreview(filePath, index) {
    const previewDiv = document.getElementById('preview-' + index);
    if (previewDiv) {
        previewDiv.classList.toggle('show');
    }
}

// Add message to chat
function addMessage(message) {
    try {
        // Check for duplicate messages by ID
        if (message.id) {
            const existingMessage = chatContainer.querySelector('[data-message-id="' + message.id + '"]');
            if (existingMessage) {
                console.log('Duplicate message detected, skipping:', message.id);
                return;
            }
        }

        // Remove empty state
        const emptyState = chatContainer.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + message.role;
        if (message.id) {
            messageDiv.setAttribute('data-message-id', message.id);
        }

        // Render markdown for assistant messages, plain text for user
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (message.role === 'assistant') {
            contentDiv.innerHTML = renderMarkdown(message.content);
        } else {
            contentDiv.textContent = message.content;
        }

        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Add file changes if present
        if (message.files && message.files.length > 0) {
            addFileChanges(message.files, message.content);
        }
    } catch (error) {
        console.error('Error in addMessage:', error);
    }
}
        // Open file
        function openFile(path) {
            vscode.postMessage({
                type: 'openFile',
                path
            });
        }

        // Accept a single file change
        function acceptSingleChange(path, action) {
            // Find the file from currentFiles to get content
            const file = currentFiles.find(f => f.path === path);
            if (file) {
                // Send the complete file object including edits and isStructured flag
                vscode.postMessage({
                    type: 'applySingleChange',
                    file: {
                        path: file.path,
                        action: file.action,
                        content: file.content,
                        edits: file.edits,           // Include edits array
                        isStructured: file.isStructured  // Include structured flag
                    },
                    userMessage: currentUserMessage
                });
            } else {
                console.error('File not found in currentFiles:', path);
            }
        }

        // Preview a single file change (Cursor-style - show in editor, don't save yet)
        function previewSingleChange(path) {
            const file = currentFiles.find(f => f.path === path);
            if (file) {
                vscode.postMessage({
                    type: 'previewChange',
                    file: {
                        path: file.path,
                        edits: file.edits,
                        isStructured: file.isStructured
                    }
                });
            } else {
                console.error('File not found in currentFiles:', path);
            }
        }

        // Revert preview (undo unsaved changes)
        function revertPreview(path) {
            vscode.postMessage({
                type: 'revertPreview',
                path: path
            });
        }

        // Accept all file changes
        function acceptAllChanges() {
            vscode.postMessage({
                type: 'applyChanges',
                files: currentFiles,
                userMessage: currentUserMessage
            });
        }

        // Escape HTML
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Simple markdown renderer - FIXED version
        function renderMarkdown(text) {
            if (!text) return '';

            // Escape HTML first
            let html = escapeHtml(text);

            // Code blocks - use char code for backtick
            const bt = String.fromCharCode(96);
            const codeParts = html.split(bt + bt + bt);
            for (let i = 1; i < codeParts.length; i += 2) {
                const codeBlock = codeParts[i];
                const lines = codeBlock.split('\\n');
                const lang = (lines[0] || '').trim() || 'text';
                const code = lines.slice(1).join('\\n').trim();
                codeParts[i] = '<pre><code class="language-' + lang + '">' + code + '</code></pre>';
            }
            html = codeParts.join('');

            // Inline code
            html = html.replace(new RegExp(bt + '([^' + bt + ']+' + bt + ')', 'g'), '<code>$1</code>');

            // Headers - use regex literals directly
            html = html.replace(/^#### (.*)$/gm, '<h4>$1</h4>');
            html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
            html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
            html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');

            // Bold and italic - regex literals work fine
            html = html.replace(/\\*\\*\\*([^*]+)\\*\\*\\*/g, '<strong><em>$1</em></strong>');
            html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
            html = html.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
            html = html.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');
            html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
            html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

            // Blockquotes
            html = html.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');

            // Lists
            html = html.replace(/^\\* (.*)$/gm, '<li>$1</li>');
            html = html.replace(/^- (.*)$/gm, '<li>$1</li>');
            html = html.replace(/^\\d+\\. (.*)$/gm, '<li>$1</li>');
            html = html.replace(/(<li>.*<\\/li>\\n?)+/g, '<ul>$&</ul>');

            // Links
            html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');

            // Line breaks and paragraphs
            html = html.replace(/\\n\\n/g, '</p><p>');
            html = html.replace(/\\n/g, '<br>');

            return '<p>' + html + '</p>';
        }

        // Initialize when DOM is ready
        function initializeChat() {
            // Prevent multiple event listener attachments
            if (window.chatPanelInitialized) {
                console.log('Chat panel already initialized, skipping...');
                return;
            }
            window.chatPanelInitialized = true;

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initializeDOMElements);
            } else {
                // DOM is already ready, initialize immediately
                initializeDOMElements();
            }

            // Fallback: Try initialization after a short delay in case DOM is not ready
            setTimeout(() => {
                const sendButton = document.getElementById('sendButton');
                if (!sendButton || !sendButton.hasAttribute('data-initialized')) {
                    console.log('Fallback initialization triggered');
                    initializeDOMElements();
                }
            }, 1000);
        }

        // Start initialization
        initializeChat();

        // Handle messages from extension
        window.addEventListener('message', (event) => {
            const message = event.data;
            console.log('← Received message from extension:', message.type);

            switch (message.type) {
                case 'pong':
                    console.log('✓ Communication channel working! Pong received');
                    break;
                case 'clearChat':
                    chatContainer.innerHTML = '';
                    break;
                case 'messageAdded':
                    addMessage(message.message);
                    break;
                case 'messageDelta':
                    // Handle streaming response - append chunks in real-time
                    appendStreamingContent(message.delta);
                    break;
                case 'streamingComplete':
                    // Streaming finished, finalize the message
                    finalizeStreamingMessage();
                    break;
                case 'loadingStarted':
                    setLoading(true, message.message);
                    resetTokenDisplay();
                    // Show token usage display
                    const tokenUsageEl = document.getElementById('tokenUsage');
                    if (tokenUsageEl) {
                        tokenUsageEl.classList.remove('hidden');
                    }
                    break;
                case 'loadingUpdate':
                    updateLoadingMessage(message.message);
                    break;
                case 'tokenUpdate':
                    if (message.inputTokens !== undefined) {
                        setInputTokens(message.inputTokens);
                    }
                    if (message.contextWindow !== undefined) {
                        const contextEl = document.getElementById('contextWindow');
                        if (contextEl) {
                            const context = message.contextWindow >= 1000
                                ? (message.contextWindow / 1000).toFixed(0) + 'K'
                                : message.contextWindow;
                            contextEl.textContent = context;
                        }
                    }
                    break;
                case 'loadingStopped':
                    setLoading(false);
                    // Hide token usage display
                    const tokenUsageEl2 = document.getElementById('tokenUsage');
                    if (tokenUsageEl2) {
                        tokenUsageEl2.classList.add('hidden');
                    }
                    // Also finalize streaming if active
                    if (isStreaming) {
                        finalizeStreamingMessage();
                    }
                    break;
                case 'error':
                    if (isStreaming) {
                        finalizeStreamingMessage();
                    }
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: 'Error: ' + message.message,
                        timestamp: Date.now()
                    });
                    setLoading(false);
                    break;
                case 'historyCleared':
                    chatContainer.innerHTML = \`
                        <div class="empty-state">
                            <h2>Chat Cleared</h2>
                            <p>Start a new conversation!</p>
                        </div>
                    \`;
                    break;
                case 'changesApplied':
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: 'Changes applied successfully!',
                        timestamp: Date.now()
                    });
                    break;
                case 'requestStopped':
                    // Request was cancelled by user
                    setLoading(false);
                    if (isStreaming) {
                        finalizeStreamingMessage();
                    }
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: 'Request cancelled by user.',
                        timestamp: Date.now()
                    });
                    break;
                case 'sessionsList':
                    console.log('Sessions list received:', message.sessions);
                    // Could update a session selector UI here if needed
                    break;
                case 'sessionLoaded':
                    console.log('Session loaded:', message.session);
                    // Load session messages
                    if (message.session && message.session.messages) {
                        message.session.messages.forEach(msg => addMessage(msg));
                    }
                    break;
                case 'terminalCommandExecuted':
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: \`Terminal command executed: \${message.command.command}\nOutput: \${message.command.output}\`,
                        timestamp: Date.now()
                    });
                    break;
                case 'shellOutput':
                    const shellCommandText = message.command || '';
                    const shellOutputText = message.output || '';
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: '🔧 Shell command executed:\\n\\n' + shellCommandText + '\\n\\n**Output:**\\n\\n' + shellOutputText,
                        timestamp: Date.now()
                    });
                    break;
                case 'info':
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: message.message,
                        timestamp: Date.now()
                    });
                    break;
                case 'portCheckResult':
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: \`Port \${message.port} is \${message.inUse ? 'in use' : 'available'}\`,
                        timestamp: Date.now()
                    });
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
