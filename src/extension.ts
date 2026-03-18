/**
 * KBot - AI Coding Assistant
 * Author: Kiran Beethoju
 * License: MIT
 *
 * A Cursor-like AI coding assistant powered by Azure OpenAI, NVIDIA, Anthropic Foundry, and Z.AI.
 * 100% local - no telemetry, no cloud storage.
 * Your code never leaves your machine except for AI provider API calls.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ChatPanelProvider } from './chatPanel';
import { CredentialManager } from './credentials';
import { AzureGPTService } from './azureGPT';
import { NvidiaService } from './nvidiaService';
import { AnthropicFoundryService } from './anthropicFoundryService';
import { ZaiService } from './zaiService';
import { FileManager } from './fileManager';
import { BackupManager } from './backupManager';
import { ExclusionManager } from './exclusionManager';
import { WorkspaceManager } from './workspaceManager';
import { GitManager, GitChange } from './gitManager';
import { ChatHistoryManager, ChatSession } from './chatHistory';
import { TerminalManager } from './terminalManager';
import { ChatMessage, ProviderType } from './types';
import { Logger } from './logger';
import { CredentialsViewProvider } from './credentialsView';
import { ChatHistoryViewProvider } from './chatHistoryView';
import { SystemPromptManager } from './systemPromptManager';
import { StructuredEditManager } from './structuredEditManager';
import { GitHubService } from './githubService';
import { CodeReviewService } from './core/codeReviewService';
import { ReviewConfigManager } from './reviewConfigManager';
// import { EnhancedFileManager } from './enhancedFileManager';

let chatPanelProvider: ChatPanelProvider;
let credentialManager: CredentialManager;
let azureGPTService: AzureGPTService;
let nvidiaService: NvidiaService;
let anthropicFoundryService: AnthropicFoundryService;
let zaiService: ZaiService;
let fileManager: FileManager;
let backupManager: BackupManager;
let exclusionManager: ExclusionManager;
let workspaceManager: WorkspaceManager;
let credentialsViewProvider: CredentialsViewProvider;
let chatHistoryViewProvider: ChatHistoryViewProvider;
let chatHistoryManager: ChatHistoryManager;
let terminalManager: TerminalManager;
let systemPromptManager: SystemPromptManager;
let githubService: GitHubService;
let codeReviewService: CodeReviewService | null = null;
let reviewConfigManager: ReviewConfigManager | null = null;
// let enhancedFileManager: EnhancedFileManager;

// Note: StructuredEditManager is created per-session in ChatPanelProvider

export function activate(context: vscode.ExtensionContext) {
    Logger.initialize();
    Logger.log('=== KBot Activating ===');

    // Initialize managers
    credentialManager = new CredentialManager(context);
    exclusionManager = new ExclusionManager(context);
    workspaceManager = new WorkspaceManager(context);
    fileManager = new FileManager(exclusionManager, workspaceManager);
    backupManager = new BackupManager(context);
    azureGPTService = new AzureGPTService(credentialManager);
    nvidiaService = new NvidiaService(credentialManager);
    anthropicFoundryService = new AnthropicFoundryService(credentialManager);
    zaiService = new ZaiService(credentialManager);
    terminalManager = new TerminalManager();
    chatHistoryManager = new ChatHistoryManager(context);
    systemPromptManager = new SystemPromptManager(context);
    githubService = new GitHubService(context, credentialManager);
    // enhancedFileManager = new EnhancedFileManager(exclusionManager, terminalManager);

    Logger.log('All managers initialized successfully');

    // Initialize chat history view provider
    chatHistoryViewProvider = new ChatHistoryViewProvider(
        context.extensionUri,
        chatHistoryManager
    );

    // Initialize chat panel provider
    chatPanelProvider = new ChatPanelProvider(
        context.extensionUri,
        credentialManager,
        azureGPTService,
        nvidiaService,
        anthropicFoundryService,
        zaiService,
        fileManager,
        backupManager,
        exclusionManager,
        context,
        terminalManager,
        chatHistoryManager
    );

    // Initialize credentials view provider (after chatPanelProvider is created)
    credentialsViewProvider = new CredentialsViewProvider(
        context.extensionUri,
        credentialManager,
        workspaceManager,
        azureGPTService,
        nvidiaService,
        anthropicFoundryService,
        zaiService,
        chatPanelProvider,
        githubService
    );

    // Initialize code review service with default provider (will update when provider switches)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders ? workspaceFolders[0].uri.fsPath : '';

    if (workspaceRoot) {
        // Initialize with default provider, will update when user switches
        codeReviewService = new CodeReviewService(azureGPTService, workspaceRoot);
        Logger.log('Code review service initialized with Azure provider');
    }

    // Register webview panels
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'kbotChatView',
            chatPanelProvider
        )
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'kbotCredentialsView',
            credentialsViewProvider
        )
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'kbotHistoryView',
            chatHistoryViewProvider
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.openChat', () => {
            vscode.commands.executeCommand('kbot-sidebar.kbotChatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.configureCredentials', async () => {
            try {
                vscode.commands.executeCommand('kbot-sidebar.kbotCredentialsView.focus');
            } catch (error: any) {
                Logger.error('Failed to open credentials configuration', error, true);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.showLogs', async () => {
            Logger.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.showCredentialStatus', async () => {
            await credentialManager.showCredentialStatus();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.manageExclusions', async () => {
            await exclusionManager.showConfigurationUI();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.clearHistory', async () => {
            const confirmed = await vscode.window.showWarningMessage(
                'Are you sure you want to clear all chat history?',
                'Yes',
                'No'
            );
            if (confirmed === 'Yes') {
                await chatPanelProvider.clearHistory();
                vscode.window.showInformationMessage('Chat history cleared!');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.exportHistory', async () => {
            await chatPanelProvider.exportHistory();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.rollbackChanges', async () => {
            await backupManager.rollback();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.configureSystemPrompts', async () => {
            try {
                await systemPromptManager.showConfigurationUI();
            } catch (error: any) {
                Logger.error('Failed to open system prompts configuration', error, true);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.configureWorkspace', async () => {
            try {
                await workspaceManager.showConfigurationUI();
            } catch (error: any) {
                Logger.error('Failed to open workspace configuration', error, true);
            }
        })
    );

    // GitHub commands
    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.configureGitHub', async () => {
            try {
                vscode.commands.executeCommand('kbot-sidebar.kbotCredentialsView.focus');
            } catch (error: any) {
                Logger.error('Failed to open GitHub configuration', error, true);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.detectGitHubRepo', async () => {
            try {
                await githubService.detectRepository();
                const repo = githubService.getRepository();
                if (repo) {
                    vscode.window.showInformationMessage(`Detected GitHub repository: ${repo.owner}/${repo.repo}`);
                } else {
                    vscode.window.showWarningMessage('Could not detect GitHub repository. Make sure you have a remote named "origin" pointing to GitHub.');
                }
            } catch (error: any) {
                Logger.error('Failed to detect GitHub repository', error, true);
            }
        })
    );

    // Code review commands
    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.runCodeReview', async () => {
            try {
                if (!codeReviewService) {
                    vscode.window.showErrorMessage('Please configure AI credentials first');
                    return;
                }

                // Show progress indicator
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Running AI Code Review...',
                    cancellable: false
                }, async () => {
                    const result = await codeReviewService.reviewGitChanges();
                    Logger.log(`Code review complete: ${result.comments.length} issues found`);
                });
            } catch (error: any) {
                Logger.error('Failed to run code review', error, true);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.applyReviewSuggestion', async (filePath: string, line: number, suggestion: string) => {
            try {
                if (!codeReviewService) {
                    return;
                }
                await codeReviewService.applySuggestion(filePath, line, suggestion);
            } catch (error: any) {
                Logger.error('Failed to apply review suggestion', error, true);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.rejectReviewSuggestion', async (filePath: string, line: number) => {
            try {
                if (!codeReviewService) {
                    return;
                }
                await codeReviewService.rejectSuggestion(filePath, line);
            } catch (error: any) {
                Logger.error('Failed to reject review suggestion', error, true);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.clearReviewDecorations', async () => {
            try {
                if (codeReviewService) {
                    codeReviewService.clearDecorations();
                    vscode.window.showInformationMessage('Review decorations cleared');
                }
            } catch (error: any) {
                Logger.error('Failed to clear review decorations', error, true);
            }
        })
    );

    // Review config management
    context.subscriptions.push(
        vscode.commands.registerCommand('kbot.manageReviewConfigs', async () => {
            try {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }

                if (!reviewConfigManager) {
                    reviewConfigManager = new ReviewConfigManager(workspaceFolders[0].uri.fsPath);
                    await reviewConfigManager.initialize();
                }

                const configs = await reviewConfigManager.listConfigs();

                if (configs.length === 0) {
                    vscode.window.showInformationMessage('No review configurations found. Default configs will be created in .kbot/checks/');
                    return;
                }

                // Show quick pick to select a config
                const selected = await vscode.window.showQuickPick(
                    configs.map(c => ({
                        label: `${c.name} (${c.ruleCount} rules)`,
                        description: c.fileName,
                        value: c
                    })),
                    {
                        placeHolder: 'Select a review configuration'
                    }
                );

                if (selected) {
                    const action = await vscode.window.showQuickPick(
                        [
                            { label: 'Open File', value: 'open' },
                            { label: 'Delete', value: 'delete' }
                        ],
                        { placeHolder: 'What would you like to do?' }
                    );

                    if (action?.value === 'open') {
                        const uri = vscode.Uri.file(
                            path.join(workspaceFolders[0].uri.fsPath, '.kbot', 'checks', selected.value.fileName)
                        );
                        await vscode.commands.executeCommand('vscode.open', uri);
                    } else if (action?.value === 'delete') {
                        const confirmed = await vscode.window.showWarningMessage(
                            `Delete review configuration "${selected.value.name}"?`,
                            'Delete',
                            'Cancel'
                        );

                        if (confirmed === 'Delete') {
                            await reviewConfigManager.deleteConfig(selected.value.fileName);
                        }
                    }
                }
            } catch (error: any) {
                Logger.error('Failed to manage review configs', error, true);
            }
        })
    );
}

export function deactivate() {
    Logger.log('=== KBot Deactivating ===');
    Logger.dispose();
}
