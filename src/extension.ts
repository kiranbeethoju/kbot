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
    // enhancedFileManager = new EnhancedFileManager(exclusionManager, terminalManager);

    Logger.log('All managers initialized successfully');

    // Initialize credentials view provider
    credentialsViewProvider = new CredentialsViewProvider(
        context.extensionUri,
        credentialManager,
        workspaceManager
    );

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
}

export function deactivate() {
    Logger.log('=== KBot Deactivating ===');
    Logger.dispose();
}
