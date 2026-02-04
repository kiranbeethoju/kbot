/**
 * Credentials View Provider
 * Provides a webview panel for managing Azure OpenAI and NVIDIA credentials in the sidebar
 */

import * as vscode from 'vscode';
import { CredentialManager } from './credentials';
import { Logger } from './logger';
import { ProviderType, NvidiaCredentials } from './types';

export class CredentialsViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    constructor(
        private extensionUri: vscode.Uri,
        private credentialManager: CredentialManager
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
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspacePath = workspaceFolders && workspaceFolders.length > 0
            ? workspaceFolders[0].uri.fsPath
            : process.cwd();

        this.sendMessage({
            type: 'workspaceInfo',
            workspacePath
        });
    }

    /**
     * Load and send current state to webview
     */
    private async loadState(): Promise<void> {
        const provider = await this.credentialManager.getSelectedProvider();
        const azureCreds = await this.credentialManager.getAzureCredentials();
        const nvidiaCreds = await this.credentialManager.getAllNvidiaCredentials();
        const selectedNvidiaModel = await this.credentialManager.getSelectedNvidiaModel();

        this.sendMessage({
            type: 'stateLoaded',
            state: {
                provider,
                azure: azureCreds ? {
                    ...azureCreds,
                    apiKey: azureCreds.apiKey ? '••••••••' : ''
                } : null,
                nvidia: nvidiaCreds,
                selectedNvidiaModel
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

            // If API key is masked/unchanged, use existing
            if (creds.apiKey === '••••••••' || !creds.apiKey) {
                if (existing) {
                    apiKeyToSave = existing.apiKey;
                } else {
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
                // Update existing
                updated = [...existing];
                updated[data.editIndex] = {
                    endpoint: data.endpoint,
                    modelName: data.modelName,
                    providerName: data.providerName,
                    maxTokens: data.maxTokens,
                    temperature: data.temperature
                };
            } else {
                // Add new
                updated = [...existing, {
                    endpoint: data.endpoint,
                    modelName: data.modelName,
                    providerName: data.providerName,
                    maxTokens: data.maxTokens,
                    temperature: data.temperature
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
        }
    </style>
</head>
<body>
    <h2>AI Provider Credentials</h2>

    <div class="workspace-info">
        <div class="workspace-info-label">WORKSPACE DIRECTORY</div>
        <div class="workspace-info-path" id="workspacePath">Loading...</div>
    </div>

    <div class="provider-switch">
        <button id="azureProviderBtn" class="provider-button">Azure OpenAI</button>
        <button id="nvidiaProviderBtn" class="provider-button">NVIDIA (Local)</button>
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
            <input type="password" id="azureApiKey" placeholder="Enter API key">
            <div class="input-hint">Leave unchanged to keep existing key</div>
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
                <input type="text" id="nvidiaProviderName" placeholder="e.g., Nemotron, OCR Model">
                <div class="input-hint">A friendly name to identify this model</div>
            </div>

            <div class="form-group">
                <label for="nvidiaEndpoint">Endpoint URL</label>
                <input type="text" id="nvidiaEndpoint" placeholder="http://10.33.11.12:8012/v1">
                <div class="input-hint">The API endpoint (will append /chat/completions if needed)</div>
            </div>

            <div class="form-group">
                <label for="nvidiaModelName">Model Name</label>
                <input type="text" id="nvidiaModelName" placeholder="e.g., nemotron-3-nano-30b">
                <div class="input-hint">The model identifier</div>
            </div>

            <div class="form-group">
                <label for="nvidiaMaxTokens">Max Tokens (Optional)</label>
                <input type="number" id="nvidiaMaxTokens" placeholder="Leave empty for backend default">
                <div class="input-hint">Maximum tokens in response. Leave empty for model default</div>
            </div>

            <div class="form-group">
                <label for="nvidiaTemperature">Temperature (Optional)</label>
                <input type="number" id="nvidiaTemperature" step="0.1" min="0" max="2" placeholder="Leave empty for backend default">
                <div class="input-hint">Response randomness (0.0 - 2.0). Leave empty for model default</div>
            </div>

            <div class="button-group">
                <button id="addNvidiaButton">Add NVIDIA Model</button>
            </div>
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
            selectedNvidiaModel: null
        };

        // Provider switching
        document.getElementById('azureProviderBtn').addEventListener('click', () => {
            switchProvider('azure');
        });

        document.getElementById('nvidiaProviderBtn').addEventListener('click', () => {
            switchProvider('nvidia');
        });

        function switchProvider(provider) {
            vscode.postMessage({ type: 'switchProvider', provider });
        }

        // Save Azure credentials
        document.getElementById('saveAzureButton').addEventListener('click', () => {
            const credentials = {
                endpoint: document.getElementById('azureEndpoint').value.trim(),
                apiKey: document.getElementById('azureApiKey').value.trim(),
                deploymentName: document.getElementById('azureDeploymentName').value.trim(),
                apiVersion: document.getElementById('azureApiVersion').value.trim(),
                modelName: document.getElementById('azureModelName').value.trim()
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

            if (!credentials.providerName || !credentials.endpoint || !credentials.modelName) {
                alert('All fields are required');
                return;
            }

            vscode.postMessage({
                type: 'saveNvidiaCredentials',
                credentials
            });

            // Clear form
            document.getElementById('nvidiaProviderName').value = '';
            document.getElementById('nvidiaEndpoint').value = '';
            document.getElementById('nvidiaModelName').value = '';
            document.getElementById('nvidiaMaxTokens').value = '';
            document.getElementById('nvidiaTemperature').value = '';
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

            // Update status
            const statusEl = document.getElementById('status');
            const isConfigured = currentState.provider === 'azure'
                ? currentState.azure !== null
                : currentState.nvidia.length > 0;

            if (isConfigured) {
                statusEl.textContent = '✓ ' + (currentState.provider === 'azure' ? 'Azure Configured' : currentState.nvidia.length + ' NVIDIA Model(s)');
                statusEl.className = 'status configured';
            } else {
                statusEl.textContent = '✗ Not Configured';
                statusEl.className = 'status not-configured';
            }

            // Show/hide forms
            document.getElementById('azureForm').classList.toggle('hidden', currentState.provider !== 'azure');
            document.getElementById('nvidiaForm').classList.toggle('hidden', currentState.provider !== 'nvidia');

            // Populate Azure form
            if (currentState.azure) {
                document.getElementById('azureEndpoint').value = currentState.azure.endpoint || '';
                document.getElementById('azureApiKey').value = currentState.azure.apiKey || '';
                document.getElementById('azureDeploymentName').value = currentState.azure.deploymentName || '';
                document.getElementById('azureApiVersion').value = currentState.azure.apiVersion || '';
                document.getElementById('azureModelName').value = currentState.azure.modelName || '';
                document.getElementById('azureMaxTokens').value = currentState.azure.maxTokens || '';
                document.getElementById('azureTemperature').value = currentState.azure.temperature || '';
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
                        \${model.maxTokens ? '<div>Max Tokens: ' + escapeHtml(model.maxTokens) + '</div>' : ''}
                        \${model.temperature ? '<div>Temperature: ' + escapeHtml(model.temperature) + '</div>' : ''}
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

        // Request initial state
        vscode.postMessage({ type: 'loadState' });
        vscode.postMessage({ type: 'getWorkspaceInfo' });
    </script>
</body>
</html>`;
    }
}
