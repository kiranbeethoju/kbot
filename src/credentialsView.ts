/**
 * Credentials View Provider
 * Provides a webview panel for managing Azure OpenAI and NVIDIA credentials in the sidebar
 */

import * as vscode from 'vscode';
import { CredentialManager } from './credentials';
import { Logger } from './logger';
import { ProviderType, NvidiaCredentials } from './types';
import { WorkspaceManager } from './workspaceManager';

export class CredentialsViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    constructor(
        private extensionUri: vscode.Uri,
        private credentialManager: CredentialManager,
        private workspaceManager?: WorkspaceManager
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'loadState':
                    await this.loadState();
                    break;
                case 'getWorkspaceInfo':
                    await this.sendWorkspaceInfo();
                    break;
                case 'getWorkspaceConfig':
                    await this.sendWorkspaceConfig();
                    break;
                case 'setCustomWorkspace':
                    await this.setCustomWorkspace(data.path);
                    break;
                case 'clearCustomWorkspace':
                    await this.clearCustomWorkspace();
                    break;
                case 'switchProvider':
                    await this.switchProvider(data.provider);
                    break;
                case 'saveAzureCredentials':
                    await this.saveAzureCredentials(data.credentials);
                    break;
                case 'saveNvidiaCredentials':
                    await this.saveNvidiaCredentials(data.credentials);
                    break;
                case 'selectNvidiaModel':
                    await this.selectNvidiaModel(data.modelName);
                    break;
                case 'deleteNvidiaModel':
                    await this.deleteNvidiaModel(data.modelName);
                    break;
                case 'openLogs':
                    Logger.show();
                    break;
                case 'loadSystemPrompt':
                    await this.loadSystemPrompt();
                    break;
                case 'saveSystemPrompt':
                    await this.saveSystemPrompt(data.prompt);
                    break;
                case 'resetSystemPrompt':
                    await this.resetSystemPrompt();
                    break;
                case 'saveAnthropicCredentials':
                    await this.saveAnthropicCredentials(data.credentials);
                    break;
                case 'saveZaiCredentials':
                    await this.saveZaiCredentials(data.credentials);
                    break;
            }
        });

        // Load state when view is shown
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.loadState();
            }
        });
    }

    /**
     * Send workspace information to webview
     */
    private async sendWorkspaceInfo(): Promise<void> {
        let workspacePath: string;

        // Check if custom workspace is configured
        if (this.workspaceManager) {
            const customWorkspace = await this.workspaceManager.getWorkspaceRoot();
            if (customWorkspace) {
                workspacePath = customWorkspace;
            } else {
                // Use auto-detect: Always prefer VS Code workspace folder when available
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && workspaceFolders.length > 0) {
                    workspacePath = workspaceFolders[0].uri.fsPath;
                } else {
                    // No workspace open, use process.cwd() as fallback
                    workspacePath = process.cwd();
                }
            }
        } else {
            // Fallback if no workspace manager - prefer VS Code workspace
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                workspacePath = workspaceFolders[0].uri.fsPath;
            } else {
                workspacePath = process.cwd();
            }
        }

        this.sendMessage({
            type: 'workspaceInfo',
            workspacePath
        });
    }

    /**
     * Send workspace configuration to webview
     */
    private async sendWorkspaceConfig(): Promise<void> {
        if (!this.workspaceManager) {
            return;
        }

        const config = await this.workspaceManager.getWorkspaceConfig();
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const vsCodeWorkspace = workspaceFolders && workspaceFolders.length > 0
            ? workspaceFolders[0].uri.fsPath
            : process.cwd();

        // Get the actual workspace path being used
        let actualWorkspacePath: string;
        if (config.useAutoDetect) {
            // In auto-detect mode, use VS Code workspace folder
            actualWorkspacePath = vsCodeWorkspace;
        } else {
            // In custom mode, use custom workspace path if set, otherwise fall back
            actualWorkspacePath = config.customWorkspacePath || vsCodeWorkspace;
        }

        this.sendMessage({
            type: 'workspaceConfigLoaded',
            config: {
                useAutoDetect: config.useAutoDetect,
                customWorkspacePath: config.customWorkspacePath || '',
                vsCodeWorkspace,
                actualWorkspacePath
            }
        });
    }

    /**
     * Set custom workspace path
     */
    private async setCustomWorkspace(path: string): Promise<void> {
        if (!this.workspaceManager) {
            return;
        }

        try {
            await this.workspaceManager.setCustomWorkspacePath(path);
            vscode.window.showInformationMessage(`Custom workspace set to: ${path}`);
            this.sendMessage({
                type: 'workspaceSaved',
                success: true
            });
            await this.sendWorkspaceConfig();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to set workspace: ${error.message}`);
            this.sendMessage({
                type: 'workspaceSaved',
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Clear custom workspace
     */
    private async clearCustomWorkspace(): Promise<void> {
        if (!this.workspaceManager) {
            return;
        }

        try {
            await this.workspaceManager.clearCustomWorkspace();
            vscode.window.showInformationMessage('Workspace reverted to auto-detect mode');
            this.sendMessage({
                type: 'workspaceSaved',
                success: true
            });
            await this.sendWorkspaceConfig();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to clear workspace: ${error.message}`);
            this.sendMessage({
                type: 'workspaceSaved',
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Load and send current state to webview
     */
    private async loadState(): Promise<void> {
        const provider = await this.credentialManager.getSelectedProvider();
        const azureCreds = await this.credentialManager.getAzureCredentials();
        const nvidiaCreds = await this.credentialManager.getAllNvidiaCredentials();
        const selectedNvidiaModel = await this.credentialManager.getSelectedNvidiaModel();
        const anthropicCreds = await this.credentialManager.getAnthropicFoundryCredentials();
        const zaiCreds = await this.credentialManager.getZaiCredentials();

        // Mask NVIDIA API keys for security
        const maskedNvidiaCreds = nvidiaCreds.map(cred => ({
            ...cred,
            apiKey: cred.apiKey ? '••••••••' : undefined
        }));

        this.sendMessage({
            type: 'stateLoaded',
            state: {
                provider,
                azure: azureCreds ? {
                    ...azureCreds,
                    apiKey: azureCreds.apiKey ? '••••••••' : ''
                } : null,
                nvidia: maskedNvidiaCreds,
                selectedNvidiaModel,
                anthropic: anthropicCreds ? {
                    ...anthropicCreds,
                    apiKey: anthropicCreds.apiKey ? '••••••••' : ''
                } : null,
                zai: zaiCreds ? {
                    ...zaiCreds,
                    apiKey: zaiCreds.apiKey ? '••••••••' : ''
                } : null
            }
        });

        // Also load system prompt
        await this.loadSystemPrompt();
    }

    /**
     * Switch provider
     */
    private async switchProvider(provider: ProviderType): Promise<void> {
        await this.credentialManager.setSelectedProvider(provider);
        Logger.log(`Provider switched to: ${provider}`);
        vscode.window.showInformationMessage(`Switched to ${provider === ProviderType.Azure ? 'Azure OpenAI' : 'NVIDIA'} provider`);
        await this.loadState();
    }

    /**
     * Save Azure credentials
     */
    private async saveAzureCredentials(creds: any): Promise<void> {
        try {
            Logger.log('Saving Azure credentials from webview...');

            // Get existing credentials to preserve API key if not changed
            const existing = await this.credentialManager.getAzureCredentials();
            let apiKeyToSave = creds.apiKey;

            // Only preserve existing API key if changeApiKey is false
            if (!creds.changeApiKey) {
                if (existing) {
                    apiKeyToSave = existing.apiKey;
                } else if (creds.apiKey === '••••••••' || !creds.apiKey) {
                    throw new Error('API Key is required');
                }
            }

            // Manually store credentials
            await this.manualStoreAzureCredentials({
                endpoint: creds.endpoint,
                apiKey: apiKeyToSave,
                deploymentName: creds.deploymentName,
                apiVersion: creds.apiVersion,
                modelName: creds.modelName,
                maxTokens: creds.maxTokens,
                temperature: creds.temperature
            });

            this.sendMessage({
                type: 'credentialsSaved',
                success: true,
                provider: 'azure'
            });

            vscode.window.showInformationMessage('Azure credentials saved successfully!');
            await this.loadState();
        } catch (error: any) {
            Logger.error('Failed to save Azure credentials', error);
            this.sendMessage({
                type: 'credentialsSaved',
                success: false,
                error: error.message,
                provider: 'azure'
            });
            vscode.window.showErrorMessage(`Failed to save credentials: ${error.message}`);
        }
    }

    /**
     * Save NVIDIA credentials
     */
    private async saveNvidiaCredentials(data: any): Promise<void> {
        try {
            Logger.log('Saving NVIDIA credentials from webview...');

            const existing = await this.credentialManager.getAllNvidiaCredentials();

            let updated: NvidiaCredentials[];
            if (data.isEdit && data.editIndex >= 0) {
                // Update existing - preserve API key if not changed
                updated = [...existing];
                const existingApiKey = updated[data.editIndex].apiKey;

                // Preserve existing API key if the user didn't change it (masked value or empty)
                let apiKeyToSave = data.apiKey;
                if (!apiKeyToSave || apiKeyToSave === '••••••••') {
                    apiKeyToSave = existingApiKey || '';
                }

                updated[data.editIndex] = {
                    endpoint: data.endpoint,
                    modelName: data.modelName,
                    providerName: data.providerName,
                    apiKey: apiKeyToSave,
                    maxTokens: data.maxTokens,
                    temperature: data.temperature,
                    topP: data.topP
                };
            } else {
                // Add new
                updated = [...existing, {
                    endpoint: data.endpoint,
                    modelName: data.modelName,
                    providerName: data.providerName,
                    apiKey: data.apiKey,
                    maxTokens: data.maxTokens,
                    temperature: data.temperature,
                    topP: data.topP
                }];
            }

            await this.credentialManager.configureNvidiaCredentials(updated);

            this.sendMessage({
                type: 'credentialsSaved',
                success: true,
                provider: 'nvidia'
            });

            vscode.window.showInformationMessage('NVIDIA credentials saved successfully!');
            await this.loadState();
        } catch (error: any) {
            Logger.error('Failed to save NVIDIA credentials', error);
            this.sendMessage({
                type: 'credentialsSaved',
                success: false,
                error: error.message,
                provider: 'nvidia'
            });
            vscode.window.showErrorMessage(`Failed to save credentials: ${error.message}`);
        }
    }

    /**
     * Select NVIDIA model
     */
    private async selectNvidiaModel(modelName: string): Promise<void> {
        await this.credentialManager.setSelectedNvidiaModel(modelName);
        Logger.log(`Selected NVIDIA model: ${modelName}`);
        vscode.window.showInformationMessage(`Selected NVIDIA model: ${modelName}`);
        await this.loadState();
    }

    /**
     * Delete NVIDIA model
     */
    private async deleteNvidiaModel(modelName: string): Promise<void> {
        const confirmed = await vscode.window.showWarningMessage(
            `Delete NVIDIA model "${modelName}"?`,
            'Yes',
            'No'
        );

        if (confirmed === 'Yes') {
            const existing = await this.credentialManager.getAllNvidiaCredentials();
            const updated = existing.filter(m => m.providerName !== modelName);
            await this.credentialManager.configureNvidiaCredentials(updated);
            Logger.log(`Deleted NVIDIA model: ${modelName}`);
            vscode.window.showInformationMessage(`Deleted NVIDIA model: ${modelName}`);
            await this.loadState();
        }
    }

    /**
     * Manually store Azure credentials
     */
    private async manualStoreAzureCredentials(creds: any): Promise<void> {
        const context = (this.credentialManager as any).context;

        // Store non-sensitive data in globalState
        await context.globalState.update('azure.credentials', {
            endpoint: creds.endpoint.trim(),
            deploymentName: creds.deploymentName.trim(),
            apiVersion: creds.apiVersion.trim(),
            modelName: creds.modelName.trim()
        });

        // Store API key in secret storage
        await context.secrets.store('azure.apiKey', creds.apiKey.trim());

        Logger.log('Azure credentials stored from webview successfully');
    }

    /**
     * Load system prompt
     */
    private async loadSystemPrompt(): Promise<void> {
        const prompt = await this.credentialManager.getSystemPrompt();
        this.sendMessage({
            type: 'systemPromptLoaded',
            prompt
        });
    }

    /**
     * Save system prompt
     */
    private async saveSystemPrompt(prompt: string): Promise<void> {
        try {
            await this.credentialManager.setSystemPrompt(prompt);
            vscode.window.showInformationMessage('System prompt saved successfully!');
            this.sendMessage({
                type: 'systemPromptSaved',
                success: true
            });
        } catch (error: any) {
            Logger.error('Failed to save system prompt', error);
            this.sendMessage({
                type: 'systemPromptSaved',
                success: false,
                error: error.message
            });
            vscode.window.showErrorMessage(`Failed to save system prompt: ${error.message}`);
        }
    }

    /**
     * Reset system prompt to default
     */
    private async resetSystemPrompt(): Promise<void> {
        try {
            await this.credentialManager.resetSystemPrompt();
            vscode.window.showInformationMessage('System prompt reset to default!');
            // Reload the default prompt
            await this.loadSystemPrompt();
        } catch (error: any) {
            Logger.error('Failed to reset system prompt', error);
            vscode.window.showErrorMessage(`Failed to reset system prompt: ${error.message}`);
        }
    }

    /**
     * Save Anthropic Foundry credentials
     */
    private async saveAnthropicCredentials(creds: any): Promise<void> {
        try {
            Logger.log('Saving Anthropic Foundry credentials from webview...');

            // Get existing credentials to preserve API key if not changed
            const existing = await this.credentialManager.getAnthropicFoundryCredentials();
            let apiKeyToSave = creds.apiKey;

            // Only preserve existing API key if changeApiKey is false
            if (!creds.changeApiKey) {
                if (existing) {
                    apiKeyToSave = existing.apiKey;
                } else if (creds.apiKey === '••••••••' || !creds.apiKey) {
                    throw new Error('API Key is required');
                }
            }

            // Store credentials
            await this.credentialManager.configureAnthropicFoundryCredentials({
                endpoint: creds.endpoint,
                apiKey: apiKeyToSave,
                deploymentName: creds.deploymentName,
                maxTokens: creds.maxTokens,
                temperature: creds.temperature
            });

            this.sendMessage({
                type: 'credentialsSaved',
                success: true,
                provider: 'anthropic-foundry'
            });

            vscode.window.showInformationMessage('Anthropic Foundry credentials saved successfully!');
            await this.loadState();
        } catch (error: any) {
            Logger.error('Failed to save Anthropic Foundry credentials', error);
            this.sendMessage({
                type: 'credentialsSaved',
                success: false,
                error: error.message,
                provider: 'anthropic-foundry'
            });
            vscode.window.showErrorMessage(`Failed to save credentials: ${error.message}`);
        }
    }

    /**
     * Save Z.AI credentials
     */
    private async saveZaiCredentials(creds: any): Promise<void> {
        try {
            Logger.log('Saving Z.AI credentials from webview...');

            // Get existing credentials to preserve API key if not changed
            const existing = await this.credentialManager.getZaiCredentials();
            let apiKeyToSave = creds.apiKey;

            // Only preserve existing API key if changeApiKey is false
            if (!creds.changeApiKey) {
                if (existing) {
                    apiKeyToSave = existing.apiKey;
                } else if (creds.apiKey === '••••••••' || !creds.apiKey) {
                    throw new Error('API Key is required');
                }
            }

            // Store credentials
            await this.credentialManager.configureZaiCredentials({
                apiKey: apiKeyToSave,
                modelName: creds.modelName,
                maxTokens: creds.maxTokens,
                temperature: creds.temperature
            });

            this.sendMessage({
                type: 'credentialsSaved',
                success: true,
                provider: 'zai'
            });

            vscode.window.showInformationMessage('Z.AI credentials saved successfully!');
            await this.loadState();
        } catch (error: any) {
            Logger.error('Failed to save Z.AI credentials', error);
            this.sendMessage({
                type: 'credentialsSaved',
                success: false,
                error: error.message,
                provider: 'zai'
            });
            vscode.window.showErrorMessage(`Failed to save credentials: ${error.message}`);
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
     * Get HTML for webview
     */
    private getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Provider Credentials</title>
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
            background-color: var(--vscode-sideBar-background);
            padding: 16px;
            line-height: 1.5;
            max-height: 100vh;
            overflow-y: auto;
        }

        h2 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--vscode-foreground);
        }

        .provider-switch {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
            background: var(--vscode-editor-background);
            padding: 4px;
            border-radius: 8px;
        }

        .provider-button {
            flex: 1;
            padding: 8px;
            background: transparent;
            color: var(--vscode-foreground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
        }

        .provider-button:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .provider-button.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .status {
            padding: 8px 12px;
            border-radius: 4px;
            margin-bottom: 16px;
            font-size: 13px;
        }

        .status.configured {
            background-color: var(--vscode-testing-iconPassed);
            color: #000;
        }

        .status.not-configured {
            background-color: var(--vscode-errorBackground);
            color: var(--vscode-errorForeground);
        }

        .form-group {
            margin-bottom: 16px;
        }

        label {
            display: block;
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 6px;
            color: var(--vscode-foreground);
        }

        input {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            box-sizing: border-box;
        }

        input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .input-hint {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }

        .button-group {
            display: flex;
            gap: 8px;
            margin-top: 20px;
        }

        button {
            flex: 1;
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .nvidia-models-list {
            margin-bottom: 16px;
        }

        .nvidia-model-item {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 8px;
        }

        .nvidia-model-item.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-button-secondaryBackground);
        }

        .nvidia-model-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .nvidia-model-name {
            font-weight: 600;
            font-size: 13px;
        }

        .nvidia-model-actions {
            display: flex;
            gap: 4px;
        }

        .nvidia-model-actions button {
            padding: 4px 8px;
            font-size: 11px;
        }

        .nvidia-model-details {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .hidden {
            display: none !important;
        }

        .loading {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
        }

        .workspace-info {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 16px;
        }

        .workspace-info-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }

        .workspace-info-path {
            font-size: 12px;
            color: var(--vscode-foreground);
            word-break: break-all;
            font-family: var(--vscode-editor-font-family);
            margin-bottom: 8px;
        }

        .workspace-mode-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            margin-bottom: 8px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .workspace-input-group {
            margin-top: 8px;
        }

        .workspace-input {
            width: 100%;
            padding: 6px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            margin-bottom: 6px;
            box-sizing: border-box;
        }

        .workspace-actions {
            display: flex;
            gap: 6px;
            margin-top: 6px;
        }

        .workspace-actions button {
            flex: 1;
            padding: 6px 12px;
            font-size: 11px;
        }

        .hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    <h2>AI Provider Credentials</h2>

    <div class="workspace-info">
        <div class="workspace-info-label">WORKSPACE DIRECTORY</div>
        <div class="workspace-mode-badge" id="workspaceMode">Detecting...</div>
        <div class="workspace-info-path" id="workspacePath">Loading...</div>

        <div class="workspace-input-group">
            <input type="text" id="customWorkspaceInput" class="workspace-input hidden" placeholder="/path/to/workspace or ~/path/to/workspace">
            <div class="workspace-actions">
                <button id="setCustomWorkspaceBtn" class="secondary hidden">Set Custom Workspace</button>
                <button id="clearCustomWorkspaceBtn" class="secondary hidden">Use Auto-Detect</button>
            </div>
        </div>
    </div>

    <div class="provider-switch">
        <button id="azureProviderBtn" class="provider-button">Azure OpenAI</button>
        <button id="nvidiaProviderBtn" class="provider-button">NVIDIA (Local)</button>
        <button id="anthropicProviderBtn" class="provider-button">Anthropic Foundry</button>
        <button id="zaiProviderBtn" class="provider-button">Z.AI (GLM)</button>
    </div>

    <div id="status" class="status not-configured">
        Checking status...
    </div>

    <!-- Azure Credentials Form -->
    <div id="azureForm" class="hidden">
        <div class="form-group">
            <label for="azureEndpoint">Endpoint URL</label>
            <input type="text" id="azureEndpoint" placeholder="https://your-resource.openai.azure.com/">
            <div class="input-hint">Your Azure OpenAI resource endpoint</div>
        </div>

        <div class="form-group">
            <label for="azureApiKey">API Key</label>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
                <input type="checkbox" id="azureChangeApiKey" style="width: auto; margin: 0;">
                <label for="azureChangeApiKey" style="margin: 0; font-size: 12px;">Change API Key</label>
            </div>
            <input type="password" id="azureApiKey" placeholder="Enter API key" disabled>
            <div class="input-hint">Check "Change API Key" to enter a new key</div>
        </div>

        <div class="form-group">
            <label for="azureDeploymentName">Deployment Name</label>
            <input type="text" id="azureDeploymentName" placeholder="e.g., gpt-4">
            <div class="input-hint">The name of your model deployment</div>
        </div>

        <div class="form-group">
            <label for="azureApiVersion">API Version</label>
            <input type="text" id="azureApiVersion" placeholder="2024-02-15-preview" value="2024-02-15-preview">
            <div class="input-hint">Azure OpenAI API version</div>
        </div>

        <div class="form-group">
            <label for="azureModelName">Model Name</label>
            <input type="text" id="azureModelName" placeholder="e.g., gpt-4">
            <div class="input-hint">The underlying model name</div>
        </div>

        <div class="form-group">
            <label for="azureMaxTokens">Max Tokens (Optional)</label>
            <input type="number" id="azureMaxTokens" placeholder="Leave empty for backend default">
            <div class="input-hint">Maximum tokens in response. Leave empty for model default (supports GPT-5.x verbosity)</div>
        </div>

        <div class="form-group">
            <label for="azureTemperature">Temperature (Optional)</label>
            <input type="number" id="azureTemperature" step="0.1" min="0" max="2" placeholder="Leave empty for backend default">
            <div class="input-hint">Response randomness (0.0 - 2.0). Leave empty for model default</div>
        </div>

        <div class="button-group">
            <button id="saveAzureButton">Save Azure Credentials</button>
        </div>
    </div>

    <!-- NVIDIA Credentials Form -->
    <div id="nvidiaForm" class="hidden">
        <div id="nvidiaModelsList" class="nvidia-models-list"></div>

        <div style="border-top: 1px solid var(--vscode-panel-border); padding-top: 16px; margin-top: 16px;">
            <h3 style="font-size: 14px; margin-bottom: 12px;">Add NVIDIA Model</h3>

            <div class="form-group">
                <label for="nvidiaProviderName">Model Name (Label)</label>
                <input type="text" id="nvidiaProviderName" placeholder="e.g., Nemotron, OCR Model, Online NVIDIA">
                <div class="input-hint">A friendly name to identify this model</div>
            </div>

            <div class="form-group">
                <label for="nvidiaEndpoint">Endpoint URL</label>
                <input type="text" id="nvidiaEndpoint" placeholder="e.g., http://10.33.11.12:8012/v1 or https://integrate.api.nvidia.com/v1">
                <div class="input-hint">The API endpoint (will append /chat/completions if needed)</div>
            </div>

            <div class="form-group">
                <label for="nvidiaApiKey">API Key (Optional - for online NVIDIA API)</label>
                <input type="password" id="nvidiaApiKey" placeholder="nvapi-...">
                <div class="input-hint">Required for https://integrate.api.nvidia.com, leave empty for local endpoints</div>
            </div>

            <div class="form-group">
                <label for="nvidiaModelName">Model Name</label>
                <input type="text" id="nvidiaModelName" placeholder="e.g., nemotron-3-nano-30b, stepfun-ai/step-3.5-flash">
                <div class="input-hint">The model identifier</div>
            </div>

            <div class="form-group">
                <label for="nvidiaMaxTokens">Max Tokens (Optional)</label>
                <input type="number" id="nvidiaMaxTokens" placeholder="e.g., 16384">
                <div class="input-hint">Maximum tokens in response. Leave empty for model default</div>
            </div>

            <div class="form-group">
                <label for="nvidiaTemperature">Temperature (Optional)</label>
                <input type="number" id="nvidiaTemperature" step="0.1" min="0" max="2" placeholder="e.g., 1.0">
                <div class="input-hint">Response randomness (0.0 - 2.0). Leave empty for model default</div>
            </div>

            <div class="form-group">
                <label for="nvidiaTopP">Top P (Optional)</label>
                <input type="number" id="nvidiaTopP" step="0.05" min="0" max="1" placeholder="e.g., 0.9">
                <div class="input-hint">Nucleus sampling (0.0 - 1.0). Leave empty for model default</div>
            </div>

            <div class="button-group">
                <button id="addNvidiaButton">Add NVIDIA Model</button>
            </div>
        </div>
    </div>

    <!-- Anthropic Foundry Credentials Form -->
    <div id="anthropicForm" class="hidden">
        <div class="form-group">
            <label for="anthropicEndpoint">Endpoint URL</label>
            <input type="text" id="anthropicEndpoint" placeholder="https://<your-resource>.openai.azure.com/anthropic">
            <div class="input-hint">Your Anthropic Foundry endpoint (Azure-hosted Claude)</div>
        </div>

        <div class="form-group">
            <label for="anthropicApiKey">API Key</label>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
                <input type="checkbox" id="anthropicChangeApiKey" style="width: auto; margin: 0;">
                <label for="anthropicChangeApiKey" style="margin: 0; font-size: 12px;">Change API Key</label>
            </div>
            <input type="password" id="anthropicApiKey" placeholder="Enter API key" disabled>
            <div class="input-hint">Check "Change API Key" to enter a new key</div>
        </div>

        <div class="form-group">
            <label for="anthropicDeploymentName">Deployment Name</label>
            <input type="text" id="anthropicDeploymentName" placeholder="e.g., claude-opus-4_5-dev">
            <div class="input-hint">The name of your Claude deployment</div>
        </div>

        <div class="form-group">
            <label for="anthropicMaxTokens">Max Tokens (Optional)</label>
            <input type="number" id="anthropicMaxTokens" placeholder="4096">
            <div class="input-hint">Maximum tokens in response. Leave empty for default</div>
        </div>

        <div class="form-group">
            <label for="anthropicTemperature">Temperature (Optional)</label>
            <input type="number" id="anthropicTemperature" step="0.1" min="0" max="2" placeholder="0.7">
            <div class="input-hint">Response randomness (0.0 - 2.0). Leave empty for default</div>
        </div>

        <div class="button-group">
            <button id="saveAnthropicButton">Save Anthropic Credentials</button>
        </div>
    </div>

    <!-- Z.AI Credentials Form -->
    <div id="zaiForm" class="hidden">
        <div class="form-group">
            <label for="zaiApiKey">API Key</label>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
                <input type="checkbox" id="zaiChangeApiKey" style="width: auto; margin: 0;">
                <label for="zaiChangeApiKey" style="margin: 0; font-size: 12px;">Change API Key</label>
            </div>
            <input type="password" id="zaiApiKey" placeholder="Enter API key" disabled>
            <div class="input-hint">Check "Change API Key" to enter a new key</div>
        </div>

        <div class="form-group">
            <label for="zaiModelName">Model Name</label>
            <input type="text" id="zaiModelName" placeholder="e.g., glm-4.7, glm-4-plus">
            <div class="input-hint">The Z.AI model identifier</div>
        </div>

        <div class="form-group">
            <label for="zaiMaxTokens">Max Tokens (Optional)</label>
            <input type="number" id="zaiMaxTokens" placeholder="4096">
            <div class="input-hint">Maximum tokens in response. Leave empty for default</div>
        </div>

        <div class="form-group">
            <label for="zaiTemperature">Temperature (Optional)</label>
            <input type="number" id="zaiTemperature" step="0.1" min="0" max="2" placeholder="1.0">
            <div class="input-hint">Response randomness (0.0 - 2.0). Leave empty for default</div>
        </div>

        <div class="button-group">
            <button id="saveZaiButton">Save Z.AI Credentials</button>
        </div>
    </div>

    <div style="border-top: 1px solid var(--vscode-panel-border); padding-top: 16px; margin-top: 16px;">
        <h3 style="font-size: 14px; margin-bottom: 12px;">System Prompt Editor</h3>
        <p style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 12px;">Customize the system prompt used for AI interactions. Use placeholders: {fileCount}, {includeGitDiff}, {includeTerminal}</p>

        <textarea id="systemPromptEditor" style="
            width: 100%;
            min-height: 200px;
            max-height: 400px;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            resize: vertical;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            white-space: pre;
            overflow-x: auto;
        "></textarea>

        <div class="button-group" style="margin-top: 12px;">
            <button id="saveSystemPrompt">Save System Prompt</button>
            <button id="resetSystemPrompt" class="secondary">Reset to Default</button>
        </div>
    </div>

    <div class="button-group">
        <button id="logsButton" class="secondary">View Logs</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentState = {
            provider: 'azure',
            azure: null,
            nvidia: [],
            selectedNvidiaModel: null,
            anthropic: null,
            zai: null
        };

        // Provider switching
        document.getElementById('azureProviderBtn').addEventListener('click', () => {
            switchProvider('azure');
        });

        document.getElementById('nvidiaProviderBtn').addEventListener('click', () => {
            switchProvider('nvidia');
        });

        document.getElementById('anthropicProviderBtn').addEventListener('click', () => {
            switchProvider('anthropic-foundry');
        });

        document.getElementById('zaiProviderBtn').addEventListener('click', () => {
            switchProvider('zai');
        });

        function switchProvider(provider) {
            vscode.postMessage({ type: 'switchProvider', provider });
        }

        // Azure API Key checkbox handler
        document.getElementById('azureChangeApiKey').addEventListener('change', (e) => {
            const apiKeyInput = document.getElementById('azureApiKey');
            const checkbox = e.target;
            apiKeyInput.disabled = !checkbox.checked;
            if (checkbox.checked) {
                apiKeyInput.placeholder = 'Enter new API key';
                apiKeyInput.value = '';
            } else {
                apiKeyInput.placeholder = 'Enter API key';
                apiKeyInput.value = '••••••••';
            }
        });

        // Save Azure credentials
        document.getElementById('saveAzureButton').addEventListener('click', () => {
            const changeApiKey = document.getElementById('azureChangeApiKey').checked;
            const credentials = {
                endpoint: document.getElementById('azureEndpoint').value.trim(),
                apiKey: changeApiKey ? document.getElementById('azureApiKey').value.trim() : '••••••••',
                deploymentName: document.getElementById('azureDeploymentName').value.trim(),
                apiVersion: document.getElementById('azureApiVersion').value.trim(),
                modelName: document.getElementById('azureModelName').value.trim(),
                changeApiKey: changeApiKey
            };

            // Add optional fields if provided
            const maxTokens = document.getElementById('azureMaxTokens').value.trim();
            if (maxTokens) {
                credentials.maxTokens = parseInt(maxTokens, 10);
            }

            const temperature = document.getElementById('azureTemperature').value.trim();
            if (temperature) {
                credentials.temperature = parseFloat(temperature);
            }

            if (!credentials.endpoint || !credentials.deploymentName) {
                alert('Endpoint and Deployment Name are required');
                return;
            }

            if (changeApiKey && !credentials.apiKey) {
                alert('Please enter a new API Key or uncheck "Change API Key"');
                return;
            }

            vscode.postMessage({
                type: 'saveAzureCredentials',
                credentials
            });
        });

        // Add NVIDIA model
        document.getElementById('addNvidiaButton').addEventListener('click', () => {
            const credentials = {
                providerName: document.getElementById('nvidiaProviderName').value.trim(),
                endpoint: document.getElementById('nvidiaEndpoint').value.trim(),
                modelName: document.getElementById('nvidiaModelName').value.trim(),
                apiKey: document.getElementById('nvidiaApiKey').value.trim(),
                isEdit: false,
                editIndex: -1
            };

            // Add optional fields if provided
            const maxTokens = document.getElementById('nvidiaMaxTokens').value.trim();
            if (maxTokens) {
                credentials.maxTokens = parseInt(maxTokens, 10);
            }

            const temperature = document.getElementById('nvidiaTemperature').value.trim();
            if (temperature) {
                credentials.temperature = parseFloat(temperature);
            }

            const topP = document.getElementById('nvidiaTopP').value.trim();
            if (topP) {
                credentials.topP = parseFloat(topP);
            }

            if (!credentials.providerName || !credentials.endpoint || !credentials.modelName) {
                alert('Model Name (Label), Endpoint URL, and Model Name are required');
                return;
            }

            vscode.postMessage({
                type: 'saveNvidiaCredentials',
                credentials
            });

            // Clear form
            document.getElementById('nvidiaProviderName').value = '';
            document.getElementById('nvidiaEndpoint').value = '';
            document.getElementById('nvidiaApiKey').value = '';
            document.getElementById('nvidiaModelName').value = '';
            document.getElementById('nvidiaMaxTokens').value = '';
            document.getElementById('nvidiaTemperature').value = '';
            document.getElementById('nvidiaTopP').value = '';
        });

        // Anthropic API Key checkbox handler
        document.getElementById('anthropicChangeApiKey').addEventListener('change', (e) => {
            const apiKeyInput = document.getElementById('anthropicApiKey');
            const checkbox = e.target;
            apiKeyInput.disabled = !checkbox.checked;
            if (checkbox.checked) {
                apiKeyInput.placeholder = 'Enter new API key';
                apiKeyInput.value = '';
            } else {
                apiKeyInput.placeholder = 'Enter API key';
                apiKeyInput.value = '••••••••';
            }
        });

        // Save Anthropic Foundry credentials
        document.getElementById('saveAnthropicButton').addEventListener('click', () => {
            const changeApiKey = document.getElementById('anthropicChangeApiKey').checked;
            const credentials = {
                endpoint: document.getElementById('anthropicEndpoint').value.trim(),
                apiKey: changeApiKey ? document.getElementById('anthropicApiKey').value.trim() : '••••••••',
                deploymentName: document.getElementById('anthropicDeploymentName').value.trim(),
                changeApiKey: changeApiKey
            };

            // Add optional fields if provided
            const maxTokens = document.getElementById('anthropicMaxTokens').value.trim();
            if (maxTokens) {
                credentials.maxTokens = parseInt(maxTokens, 10);
            }

            const temperature = document.getElementById('anthropicTemperature').value.trim();
            if (temperature) {
                credentials.temperature = parseFloat(temperature);
            }

            if (!credentials.endpoint || !credentials.deploymentName) {
                alert('Endpoint and Deployment Name are required');
                return;
            }

            if (changeApiKey && !credentials.apiKey) {
                alert('Please enter a new API Key or uncheck "Change API Key"');
                return;
            }

            vscode.postMessage({
                type: 'saveAnthropicCredentials',
                credentials
            });
        });

        // Z.AI API Key checkbox handler
        document.getElementById('zaiChangeApiKey').addEventListener('change', (e) => {
            const apiKeyInput = document.getElementById('zaiApiKey');
            const checkbox = e.target;
            apiKeyInput.disabled = !checkbox.checked;
            if (checkbox.checked) {
                apiKeyInput.placeholder = 'Enter new API key';
                apiKeyInput.value = '';
            } else {
                apiKeyInput.placeholder = 'Enter API key';
                apiKeyInput.value = '••••••••';
            }
        });

        // Save Z.AI credentials
        document.getElementById('saveZaiButton').addEventListener('click', () => {
            const changeApiKey = document.getElementById('zaiChangeApiKey').checked;
            const credentials = {
                apiKey: changeApiKey ? document.getElementById('zaiApiKey').value.trim() : '••••••••',
                modelName: document.getElementById('zaiModelName').value.trim(),
                changeApiKey: changeApiKey
            };

            // Add optional fields if provided
            const maxTokens = document.getElementById('zaiMaxTokens').value.trim();
            if (maxTokens) {
                credentials.maxTokens = parseInt(maxTokens, 10);
            }

            const temperature = document.getElementById('zaiTemperature').value.trim();
            if (temperature) {
                credentials.temperature = parseFloat(temperature);
            }

            if (!credentials.modelName) {
                alert('Model Name is required');
                return;
            }

            if (changeApiKey && !credentials.apiKey) {
                alert('Please enter a new API Key or uncheck "Change API Key"');
                return;
            }

            vscode.postMessage({
                type: 'saveZaiCredentials',
                credentials
            });
        });

        // View logs
        document.getElementById('logsButton').addEventListener('click', () => {
            vscode.postMessage({ type: 'openLogs' });
        });

        // System prompt editor
        document.getElementById('saveSystemPrompt').addEventListener('click', () => {
            const prompt = document.getElementById('systemPromptEditor').value.trim();
            vscode.postMessage({
                type: 'saveSystemPrompt',
                prompt
            });
        });

        document.getElementById('resetSystemPrompt').addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the system prompt to the default?')) {
                vscode.postMessage({ type: 'resetSystemPrompt' });
            }
        });

        // Workspace configuration
        document.getElementById('setCustomWorkspaceBtn').addEventListener('click', () => {
            const path = document.getElementById('customWorkspaceInput').value.trim();
            if (!path) {
                alert('Please enter a workspace path');
                return;
            }
            vscode.postMessage({ type: 'setCustomWorkspace', path });
        });

        document.getElementById('clearCustomWorkspaceBtn').addEventListener('click', () => {
            if (confirm('Switch back to auto-detect mode? The custom workspace path will be cleared.')) {
                vscode.postMessage({ type: 'clearCustomWorkspace' });
            }
        });

        // Handle messages from extension
        window.addEventListener('message', (event) => {
            const message = event.data;

            switch (message.type) {
                case 'stateLoaded':
                    currentState = message.state;
                    renderState();
                    break;
                case 'workspaceInfo':
                    document.getElementById('workspacePath').textContent = message.workspacePath;
                    break;
                case 'workspaceConfigLoaded':
                    renderWorkspaceConfig(message.config);
                    break;
                case 'workspaceSaved':
                    if (message.success) {
                        // Refresh workspace config after save
                        vscode.postMessage({ type: 'getWorkspaceConfig' });
                    } else {
                        alert('Failed to save workspace: ' + message.error);
                    }
                    break;
                case 'credentialsSaved':
                    if (message.success) {
                        // Clear Azure API key input for security
                        document.getElementById('azureApiKey').value = '••••••••';
                    }
                    break;
                case 'systemPromptLoaded':
                    document.getElementById('systemPromptEditor').value = message.prompt || '';
                    break;
                case 'systemPromptSaved':
                    if (message.success) {
                        alert('System prompt saved successfully!');
                    } else {
                        alert('Failed to save system prompt: ' + message.error);
                    }
                    break;
            }
        });

        function renderState() {
            // Update provider buttons
            document.getElementById('azureProviderBtn').classList.toggle('active', currentState.provider === 'azure');
            document.getElementById('nvidiaProviderBtn').classList.toggle('active', currentState.provider === 'nvidia');
            document.getElementById('anthropicProviderBtn').classList.toggle('active', currentState.provider === 'anthropic-foundry');
            document.getElementById('zaiProviderBtn').classList.toggle('active', currentState.provider === 'zai');

            // Update status
            const statusEl = document.getElementById('status');
            const isConfigured = currentState.provider === 'azure'
                ? currentState.azure !== null
                : currentState.provider === 'nvidia'
                ? currentState.nvidia.length > 0
                : currentState.provider === 'anthropic-foundry'
                ? currentState.anthropic !== null
                : currentState.zai !== null;

            if (isConfigured) {
                const providerName = currentState.provider === 'azure' ? 'Azure' :
                                   currentState.provider === 'nvidia' ? currentState.nvidia.length + ' NVIDIA Model(s)' :
                                   currentState.provider === 'anthropic-foundry' ? 'Anthropic Foundry' : 'Z.AI';
                statusEl.textContent = '✓ ' + providerName + ' Configured';
                statusEl.className = 'status configured';
            } else {
                statusEl.textContent = '✗ Not Configured';
                statusEl.className = 'status not-configured';
            }

            // Show/hide forms
            document.getElementById('azureForm').classList.toggle('hidden', currentState.provider !== 'azure');
            document.getElementById('nvidiaForm').classList.toggle('hidden', currentState.provider !== 'nvidia');
            document.getElementById('anthropicForm').classList.toggle('hidden', currentState.provider !== 'anthropic-foundry');
            document.getElementById('zaiForm').classList.toggle('hidden', currentState.provider !== 'zai');

            // Populate Azure form
            if (currentState.azure) {
                document.getElementById('azureEndpoint').value = currentState.azure.endpoint || '';
                document.getElementById('azureApiKey').value = currentState.azure.apiKey || '••••••••';
                document.getElementById('azureDeploymentName').value = currentState.azure.deploymentName || '';
                document.getElementById('azureApiVersion').value = currentState.azure.apiVersion || '';
                document.getElementById('azureModelName').value = currentState.azure.modelName || '';
                document.getElementById('azureMaxTokens').value = currentState.azure.maxTokens || '';
                document.getElementById('azureTemperature').value = currentState.azure.temperature || '';
                // Initialize checkbox - unchecked by default (keep existing key)
                document.getElementById('azureChangeApiKey').checked = false;
                document.getElementById('azureApiKey').disabled = true;
            }

            // Populate Anthropic Foundry form
            if (currentState.anthropic) {
                document.getElementById('anthropicEndpoint').value = currentState.anthropic.endpoint || '';
                document.getElementById('anthropicApiKey').value = currentState.anthropic.apiKey || '••••••••';
                document.getElementById('anthropicDeploymentName').value = currentState.anthropic.deploymentName || '';
                document.getElementById('anthropicMaxTokens').value = currentState.anthropic.maxTokens || '';
                document.getElementById('anthropicTemperature').value = currentState.anthropic.temperature || '';
                // Initialize checkbox - unchecked by default (keep existing key)
                document.getElementById('anthropicChangeApiKey').checked = false;
                document.getElementById('anthropicApiKey').disabled = true;
            }

            // Populate Z.AI form
            if (currentState.zai) {
                document.getElementById('zaiApiKey').value = currentState.zai.apiKey || '••••••••';
                document.getElementById('zaiModelName').value = currentState.zai.modelName || '';
                document.getElementById('zaiMaxTokens').value = currentState.zai.maxTokens || '';
                document.getElementById('zaiTemperature').value = currentState.zai.temperature || '';
                // Initialize checkbox - unchecked by default (keep existing key)
                document.getElementById('zaiChangeApiKey').checked = false;
                document.getElementById('zaiApiKey').disabled = true;
            }

            // Render NVIDIA models list
            renderNvidiaModels();
        }

        function renderNvidiaModels() {
            const container = document.getElementById('nvidiaModelsList');
            container.innerHTML = '';

            currentState.nvidia.forEach((model, index) => {
                const isSelected = model.providerName === currentState.selectedNvidiaModel;

                const div = document.createElement('div');
                div.className = 'nvidia-model-item' + (isSelected ? ' selected' : '');
                div.innerHTML = \`
                    <div class="nvidia-model-header">
                        <div class="nvidia-model-name">\${escapeHtml(model.providerName)}</div>
                        <div class="nvidia-model-actions">
                            <button class="secondary" onclick="selectModel('\${escapeHtml(model.providerName)}')">Select</button>
                            <button class="secondary" onclick="deleteModel('\${escapeHtml(model.providerName)}')">Delete</button>
                        </div>
                    </div>
                    <div class="nvidia-model-details">
                        <div>Endpoint: \${escapeHtml(model.endpoint)}</div>
                        <div>Model: \${escapeHtml(model.modelName)}</div>
                        \${model.apiKey ? '<div>API Key: ••••••••</div>' : ''}
                        \${model.maxTokens !== undefined && model.maxTokens !== '' ? '<div>Max Tokens: ' + escapeHtml(model.maxTokens) + '</div>' : ''}
                        \${model.temperature !== undefined && model.temperature !== '' ? '<div>Temperature: ' + escapeHtml(model.temperature) + '</div>' : ''}
                        \${model.topP !== undefined && model.topP !== '' ? '<div>Top P: ' + escapeHtml(model.topP) + '</div>' : ''}
                    </div>
                \`;
                container.appendChild(div);
            });

            if (currentState.nvidia.length === 0) {
                container.innerHTML = '<p style="color: var(--vscode-descriptionForeground); font-size: 12px;">No NVIDIA models configured. Add one below.</p>';
            }
        }

        function selectModel(modelName) {
            vscode.postMessage({ type: 'selectNvidiaModel', modelName });
        }

        function deleteModel(modelName) {
            vscode.postMessage({ type: 'deleteNvidiaModel', modelName });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function renderWorkspaceConfig(config) {
            const modeBadge = document.getElementById('workspaceMode');
            const customInput = document.getElementById('customWorkspaceInput');
            const setBtn = document.getElementById('setCustomWorkspaceBtn');
            const clearBtn = document.getElementById('clearCustomWorkspaceBtn');

            // Always show the actual workspace path being used
            document.getElementById('workspacePath').textContent = config.actualWorkspacePath || 'Unknown';

            if (config.useAutoDetect) {
                modeBadge.textContent = 'Auto-Detect';
                customInput.classList.add('hidden');
                setBtn.classList.add('hidden');
                clearBtn.classList.add('hidden');
            } else {
                modeBadge.textContent = 'Custom Workspace';
                customInput.classList.remove('hidden');
                setBtn.classList.remove('hidden');
                clearBtn.classList.remove('hidden');
                customInput.value = config.customWorkspacePath || '';
            }
        }

        // Request initial state
        vscode.postMessage({ type: 'loadState' });
        vscode.postMessage({ type: 'getWorkspaceInfo' });
        vscode.postMessage({ type: 'getWorkspaceConfig' });
    </script>
</body>
</html>`;
    }
}
