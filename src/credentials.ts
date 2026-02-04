/**
 * Credential Manager
 * Handles secure storage of Azure OpenAI and NVIDIA credentials
 */

import * as vscode from 'vscode';
import { Logger } from './logger';
import { ProviderType, AzureCredentials, NvidiaCredentials } from './types';

export interface StoredCredentials {
    provider: ProviderType;
    azure?: AzureCredentials;
    nvidia?: NvidiaCredentials[];
}

export class CredentialManager {
    // Azure credentials keys
    private static readonly AZURE_CREDENTIALS_KEY = 'azure.credentials';
    private static readonly AZURE_API_KEY_SECRET = 'azure.apiKey';

    // NVIDIA credentials key
    private static readonly NVIDIA_CREDENTIALS_KEY = 'nvidia.credentials';
    private static readonly SELECTED_PROVIDER_KEY = 'selected.provider';

    // System prompt key
    private static readonly SYSTEM_PROMPT_KEY = 'custom.system.prompt';
    private static readonly DEFAULT_SYSTEM_PROMPT = `You are an advanced coding assistant with shell command execution capabilities.

## CONTEXT PROVIDED
- File(s) automatically collected from the CURRENT WORKING DIRECTORY
- All relevant source files from the workspace are included
- Only common exclusions apply (node_modules, .git, dist, build, binaries, etc.)
- Current working directory: {workspacePath}

## YOUR CAPABILITIES
1. **Code Analysis**: Read, understand, and modify code from provided context
2. **Shell Commands**: You can execute shell commands by including them in your response using this format:
   \`\`\`shell
   <command here>
   \`\`\`

   Examples of commands you can run:
   - \`ls -la\` - list files
   - \`pwd\` - show current directory
   - \`ps aux | grep node\` - check processes
   - \`curl https://api.example.com\` - make HTTP requests
   - \`npm install <package>\` - install dependencies
   - \`python script.py\` - run scripts
   - \`make build\` - run build commands

3. **File Operations**: Return JSON for code changes:
\`\`\`json
{
  "explanation": "What you did and why",
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "action": "update|create|delete",
      "content": "full file content here"
    }
  ],
  "shell": "optional command to execute"
}
\`\`\`

## IMPORTANT RULES
1. **NEVER hallucinate files** - only work with provided file context
2. **Use EXACT file paths** as provided in the context
3. **For shell commands**: Always explain what the command does before showing it
4. **For code changes**: Always show the complete file content, not snippets
5. **For simple questions**: Just explain, don't generate code
6. **Security**: Consider security implications of any command or code change
7. **Best practices**: Follow language-specific best practices and patterns

## WORKSPACE INFORMATION
- Current workspace: {workspacePath}
- Total files available: {fileCount}
{includeGitDiff}
{includeTerminal}

When the user asks to run tests, build, install packages, check status, or any other terminal operation, USE SHELL COMMANDS!`;

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Get selected provider
     */
    async getSelectedProvider(): Promise<ProviderType> {
        const provider = this.context.globalState.get<ProviderType>(
            CredentialManager.SELECTED_PROVIDER_KEY
        );
        return provider || ProviderType.Azure;
    }

    /**
     * Set selected provider
     */
    async setSelectedProvider(provider: ProviderType): Promise<void> {
        await this.context.globalState.update(
            CredentialManager.SELECTED_PROVIDER_KEY,
            provider
        );
        Logger.log(`Provider switched to: ${provider}`);
    }

    /**
     * Get Azure credentials
     */
    async getAzureCredentials(): Promise<AzureCredentials | null> {
        const stored = this.context.globalState.get<AzureCredentials>(
            CredentialManager.AZURE_CREDENTIALS_KEY
        );

        if (!stored) {
            return null;
        }

        // API key is stored separately in secret storage
        const apiKey = await this.context.secrets.get(
            CredentialManager.AZURE_API_KEY_SECRET
        );

        if (!apiKey) {
            return null;
        }

        return {
            ...stored,
            apiKey
        };
    }

    /**
     * Get NVIDIA credentials
     */
    async getNvidiaCredentials(): Promise<NvidiaCredentials | null> {
        const selectedModel = this.context.globalState.get<string>('nvidia.selected.model');

        if (!selectedModel) {
            return null;
        }

        const allNvidia = this.context.globalState.get<NvidiaCredentials[]>(
            CredentialManager.NVIDIA_CREDENTIALS_KEY
        );

        if (!allNvidia) {
            return null;
        }

        return allNvidia.find(m => m.providerName === selectedModel) || allNvidia[0] || null;
    }

    /**
     * Get all NVIDIA credentials
     */
    async getAllNvidiaCredentials(): Promise<NvidiaCredentials[]> {
        return this.context.globalState.get<NvidiaCredentials[]>(
            CredentialManager.NVIDIA_CREDENTIALS_KEY
        ) || [];
    }

    /**
     * Get stored credentials based on selected provider
     */
    async getCredentials(): Promise<AzureCredentials | NvidiaCredentials | null> {
        const provider = await this.getSelectedProvider();

        if (provider === ProviderType.Azure) {
            return this.getAzureCredentials();
        } else {
            return this.getNvidiaCredentials();
        }
    }

    /**
     * Configure Azure credentials through user input
     */
    async configureAzureCredentials(): Promise<void> {
        Logger.log('Starting Azure credential configuration...');

        const endpoint = await vscode.window.showInputBox({
            prompt: 'Enter your Azure OpenAI Endpoint',
            placeHolder: 'https://your-resource.openai.azure.com/',
            ignoreFocusOut: true
        });

        if (!endpoint) {
            throw new Error('Endpoint is required');
        }

        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Azure OpenAI API Key',
            password: true,
            ignoreFocusOut: true
        });

        if (!apiKey) {
            throw new Error('API Key is required');
        }

        const deploymentName = await vscode.window.showInputBox({
            prompt: 'Enter your Deployment Name',
            placeHolder: 'e.g., gpt-4',
            ignoreFocusOut: true
        });

        if (!deploymentName) {
            throw new Error('Deployment Name is required');
        }

        const apiVersion = await vscode.window.showInputBox({
            prompt: 'Enter API Version',
            placeHolder: '2024-02-15-preview',
            ignoreFocusOut: true,
            value: '2024-02-15-preview'
        });

        if (!apiVersion) {
            throw new Error('API Version is required');
        }

        const modelName = await vscode.window.showInputBox({
            prompt: 'Enter Model Name',
            placeHolder: 'e.g., gpt-4',
            ignoreFocusOut: true,
            value: deploymentName
        });

        if (!modelName) {
            throw new Error('Model Name is required');
        }

        // Store non-sensitive data in globalState
        const credentials: Omit<AzureCredentials, 'apiKey'> = {
            endpoint: endpoint.trim(),
            deploymentName: deploymentName.trim(),
            apiVersion: apiVersion.trim(),
            modelName: modelName.trim()
        };

        try {
            await this.context.globalState.update(
                CredentialManager.AZURE_CREDENTIALS_KEY,
                credentials
            );
            Logger.log('Azure credentials stored in globalState successfully');
        } catch (error: any) {
            Logger.error('Failed to store Azure credentials in globalState', error);
            throw new Error(`Failed to save credentials: ${error.message}`);
        }

        try {
            // Store API key in secret storage
            await this.context.secrets.store(
                CredentialManager.AZURE_API_KEY_SECRET,
                apiKey.trim()
            );
            Logger.log('Azure API key stored in secret storage successfully');
        } catch (error: any) {
            Logger.error('Failed to store API key in secret storage', error);
            throw new Error(`Failed to save API key: ${error.message}`);
        }

        Logger.log('Azure credential configuration completed successfully!');
    }

    /**
     * Configure NVIDIA credentials
     */
    async configureNvidiaCredentials(credentials: NvidiaCredentials[]): Promise<void> {
        try {
            await this.context.globalState.update(
                CredentialManager.NVIDIA_CREDENTIALS_KEY,
                credentials
            );
            Logger.log('NVIDIA credentials stored successfully', credentials);

            // Set first model as selected if none selected
            const selectedModel = this.context.globalState.get<string>('nvidia.selected.model');
            if (!selectedModel && credentials.length > 0) {
                await this.context.globalState.update('nvidia.selected.model', credentials[0].providerName);
                Logger.log(`Selected NVIDIA model: ${credentials[0].providerName}`);
            }
        } catch (error: any) {
            Logger.error('Failed to store NVIDIA credentials', error);
            throw new Error(`Failed to save NVIDIA credentials: ${error.message}`);
        }
    }

    /**
     * Set selected NVIDIA model
     */
    async setSelectedNvidiaModel(modelName: string): Promise<void> {
        await this.context.globalState.update('nvidia.selected.model', modelName);
        Logger.log(`Selected NVIDIA model: ${modelName}`);
    }

    /**
     * Get selected NVIDIA model name
     */
    async getSelectedNvidiaModel(): Promise<string | null> {
        return this.context.globalState.get<string>('nvidia.selected.model') || null;
    }

    /**
     * Configure credentials through user input (legacy - for Azure)
     */
    async configureCredentials(): Promise<void> {
        await this.configureAzureCredentials();
    }

    /**
     * Check if credentials are configured
     */
    async isConfigured(): Promise<boolean> {
        const provider = await this.getSelectedProvider();
        const creds = await this.getCredentials();
        const configured = creds !== null;
        Logger.debug(`Credentials configured status for ${provider}: ${configured}`);
        return configured;
    }

    /**
     * Check if any provider is configured
     */
    async isAnyProviderConfigured(): Promise<boolean> {
        const azureCreds = await this.getAzureCredentials();
        const nvidiaCreds = await this.getAllNvidiaCredentials();
        return (azureCreds !== null) || (nvidiaCreds.length > 0);
    }

    /**
     * Show current credential status
     */
    async showCredentialStatus(): Promise<void> {
        const provider = await this.getSelectedProvider();
        const selectedModel = provider === ProviderType.NVIDIA
            ? await this.getSelectedNvidiaModel()
            : null;

        Logger.log('=== Credential Status ===');
        Logger.log(`Provider: ${provider}${selectedModel ? ` (${selectedModel})` : ''}`);

        if (provider === ProviderType.Azure) {
            const stored = this.context.globalState.get<AzureCredentials>(
                CredentialManager.AZURE_CREDENTIALS_KEY
            );

            if (stored) {
                const apiKeyExists = await this.context.secrets.get(CredentialManager.AZURE_API_KEY_SECRET);
                Logger.log(`Endpoint: ${stored.endpoint}`);
                Logger.log(`Deployment: ${stored.deploymentName}`);
                Logger.log(`API Version: ${stored.apiVersion}`);
                Logger.log(`Model: ${stored.modelName}`);
                Logger.log(`API Key: ${apiKeyExists ? '✓ Configured' : '✗ Missing'}`);
            } else {
                Logger.warn('Azure credentials not configured');
            }
        } else {
            const nvidiaCreds = await this.getAllNvidiaCredentials();
            if (nvidiaCreds.length > 0) {
                Logger.log(`NVIDIA Models Configured: ${nvidiaCreds.length}`);
                nvidiaCreds.forEach(cred => {
                    const isSelected = cred.providerName === selectedModel;
                    Logger.log(`  ${isSelected ? '→' : ' '} ${cred.providerName}: ${cred.endpoint} (${cred.modelName})`);
                });
            } else {
                Logger.warn('NVIDIA credentials not configured');
            }
        }

        Logger.log('=== Credential Status ===');
        Logger.log(`Provider: ${provider}${selectedModel ? ` (${selectedModel})` : ''}`);

        if (provider === ProviderType.Azure) {
            const stored = this.context.globalState.get<AzureCredentials>(
                CredentialManager.AZURE_CREDENTIALS_KEY
            );

            if (stored) {
                const apiKeyExists = await this.context.secrets.get(CredentialManager.AZURE_API_KEY_SECRET);
                Logger.log(`Endpoint: ${stored.endpoint}`);
                Logger.log(`Deployment: ${stored.deploymentName}`);
                Logger.log(`API Version: ${stored.apiVersion}`);
                Logger.log(`Model: ${stored.modelName}`);
                Logger.log(`API Key: ${apiKeyExists ? '✓ Configured' : '✗ Missing'}`);
            } else {
                Logger.warn('Azure credentials not configured');
            }
        } else {
            const nvidiaCreds = await this.getAllNvidiaCredentials();
            if (nvidiaCreds.length > 0) {
                Logger.log(`NVIDIA Models Configured: ${nvidiaCreds.length}`);
                nvidiaCreds.forEach(cred => {
                    const isSelected = cred.providerName === selectedModel;
                    Logger.log(`  ${isSelected ? '→' : ' '} ${cred.providerName}: ${cred.endpoint} (${cred.modelName})`);
                });
            } else {
                Logger.warn('NVIDIA credentials not configured');
            }
        }

        Logger.show();
    }

    /**
     * Get custom system prompt
     */
    async getSystemPrompt(): Promise<string> {
        const customPrompt = this.context.globalState.get<string>(
            CredentialManager.SYSTEM_PROMPT_KEY
        );
        return customPrompt || CredentialManager.DEFAULT_SYSTEM_PROMPT;
    }

    /**
     * Set custom system prompt
     */
    async setSystemPrompt(prompt: string): Promise<void> {
        await this.context.globalState.update(
            CredentialManager.SYSTEM_PROMPT_KEY,
            prompt
        );
        Logger.log('Custom system prompt updated');
    }

    /**
     * Reset system prompt to default
     */
    async resetSystemPrompt(): Promise<void> {
        await this.context.globalState.update(
            CredentialManager.SYSTEM_PROMPT_KEY,
            undefined
        );
        Logger.log('System prompt reset to default');
    }

    /**
     * Get default system prompt
     */
    getDefaultSystemPrompt(): string {
        return CredentialManager.DEFAULT_SYSTEM_PROMPT;
    }
}
