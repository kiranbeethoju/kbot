/**
 * Local Prime DevBot
 * Author: Kiran Beethoju
 * License: MIT
 *
 * A Cursor-like AI coding assistant powered by Azure OpenAI.
 * 100% local - no telemetry, no cloud storage.
 * Your code never leaves your machine except for Azure GPT calls.
 */

import * as vscode from 'vscode';
import { ChatPanelProvider } from './chatPanel';
import { CredentialManager } from './credentials';
import { AzureGPTService } from './azureGPT';
import { NvidiaService } from './nvidiaService';
import { FileManager } from './fileManager';
import { BackupManager } from './backupManager';
import { ExclusionManager } from './exclusionManager';
import { GitManager, GitChange } from './gitManager';
import { ChatHistoryManager, ChatSession } from './chatHistory';
import { TerminalManager } from './terminalManager';
import { ChatMessage, ProviderType } from './types';
import { Logger } from './logger';
import { CredentialsViewProvider } from './credentialsView';
import { ChatHistoryViewProvider } from './chatHistoryView';
import { SystemPromptManager } from './systemPromptManager';
// import { EnhancedFileManager } from './enhancedFileManager';

let chatPanelProvider: ChatPanelProvider;
let credentialManager: CredentialManager;
let azureGPTService: AzureGPTService;
let nvidiaService: NvidiaService;
let fileManager: FileManager;
let backupManager: BackupManager;
let exclusionManager: ExclusionManager;
let credentialsViewProvider: CredentialsViewProvider;
let chatHistoryViewProvider: ChatHistoryViewProvider;
let chatHistoryManager: ChatHistoryManager;
let terminalManager: TerminalManager;
let systemPromptManager: SystemPromptManager;
// let enhancedFileManager: EnhancedFileManager;

export function activate(context: vscode.ExtensionContext) {
    Logger.initialize();
    Logger.log('=== Local Prime DevBot Activating ===');

    // Initialize managers
    credentialManager = new CredentialManager(context);
    exclusionManager = new ExclusionManager(context);
    fileManager = new FileManager(exclusionManager);
    backupManager = new BackupManager(context);
    azureGPTService = new AzureGPTService(credentialManager);
    nvidiaService = new NvidiaService(credentialManager);
    terminalManager = new TerminalManager();
    chatHistoryManager = new ChatHistoryManager(context);
    systemPromptManager = new SystemPromptManager(context);
    // enhancedFileManager = new EnhancedFileManager(exclusionManager, terminalManager);

    Logger.log('All managers initialized successfully');

    // Initialize credentials view provider
    credentialsViewProvider = new CredentialsViewProvider(
        context.extensionUri,
        credentialManager
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
            'azureGPTChatView',
            chatPanelProvider
        )
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'azureGPTCredentialsView',
            credentialsViewProvider
        )
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'azureGPTHistoryView',
            chatHistoryViewProvider
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('localAzureGPT.openChat', () => {
            vscode.commands.executeCommand('prime-devbot-sidebar.azureGPTChatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('localAzureGPT.configureCredentials', async () => {
            try {
                vscode.commands.executeCommand('prime-devbot-sidebar.azureGPTCredentialsView.focus');
            } catch (error: any) {
                Logger.error('Failed to open credentials configuration', error, true);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('localAzureGPT.showLogs', async () => {
            Logger.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('localAzureGPT.showCredentialStatus', async () => {
            await credentialManager.showCredentialStatus();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('localAzureGPT.configureExclusions', async () => {
            await exclusionManager.showConfigurationUI();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('localAzureGPT.clearHistory', async () => {
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
        vscode.commands.registerCommand('localAzureGPT.exportHistory', async () => {
            await chatPanelProvider.exportHistory();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('localAzureGPT.rollbackChanges', async () => {
            await backupManager.rollback();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('localAzureGPT.configureSystemPrompts', async () => {
            try {
                await systemPromptManager.showConfigurationUI();
            } catch (error: any) {
                Logger.error('Failed to open system prompts configuration', error, true);
            }
        })
    );
}

export function deactivate() {
    Logger.log('=== DevBot Assistant Deactivating ===');
    Logger.dispose();
}
