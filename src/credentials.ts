/**
 * Credential Manager
 * Handles secure storage of Azure OpenAI, NVIDIA, Anthropic Foundry, and Z.AI credentials
 */

import * as vscode from 'vscode';
import { Logger } from './logger';
import { ProviderType, AzureCredentials, NvidiaCredentials, AnthropicFoundryCredentials, ZaiCredentials } from './types';

export interface StoredCredentials {
    provider: ProviderType;
    azure?: AzureCredentials;
    nvidia?: NvidiaCredentials[];
    anthropicFoundry?: AnthropicFoundryCredentials;
    zai?: ZaiCredentials;
}

export class CredentialManager {
    // Azure credentials keys
    private static readonly AZURE_CREDENTIALS_KEY = 'azure.credentials';
    private static readonly AZURE_API_KEY_SECRET = 'azure.apiKey';

    // NVIDIA credentials key
    private static readonly NVIDIA_CREDENTIALS_KEY = 'nvidia.credentials';
    private static readonly SELECTED_PROVIDER_KEY = 'selected.provider';

    // Anthropic Foundry credentials keys
    private static readonly ANTHROPIC_FOUNDRY_CREDENTIALS_KEY = 'anthropic-foundry.credentials';
    private static readonly ANTHROPIC_FOUNDRY_API_KEY_SECRET = 'anthropic-foundry.apiKey';

    // Z.AI credentials keys
    private static readonly ZAI_CREDENTIALS_KEY = 'zai.credentials';
    private static readonly ZAI_API_KEY_SECRET = 'zai.apiKey';

    // System prompt key
    private static readonly SYSTEM_PROMPT_KEY = 'custom.system.prompt';
    private static readonly DEFAULT_SYSTEM_PROMPT = `You are KBot, an expert coding assistant.

## CRITICAL: LINE NUMBERING (ZERO-INDEXED)

**Line numbers start at 0, NOT 1!**
- Line 0 = first line
- Line 1 = second line
- Line 2 = third line
- etc.

Example:
\`\`\`
print('Hello, World!')    ← Line 0
                           ← Line 1 (empty)
for i in range(10):       ← Line 2
    print(i)              ← Line 3
\`\`\`

When replacing "range(10)" with "range(20)", you would target **line 2**, not line 3!

## CRITICAL: HOW TO MAKE CODE CHANGES

When the user asks you to modify, create, or change ANY file, you MUST respond with JSON format:

\`\`\`json
{
  "explanation": "Brief description of what you're doing",
  "files": [
    {
      "path": "filename.ext",
      "edits": [
        {
          "startLine": 0,
          "endLine": 0,
          "newContent": "new code here"
        }
      ]
    }
  ]
}
\`\`\`

If the user asks a question that doesn't require file changes, just answer normally as plain text.

## EXAMPLES

**User:** "replace 10 with 20 in hello.py"
**You:**
\`\`\`json
{
  "explanation": "Changed range from 10 to 20 in the for loop (line 2)",
  "files": [
    {
      "path": "hello.py",
      "edits": [
        {
          "startLine": 2,
          "endLine": 2,
          "newContent": "for i in range(20):"
        }
      ]
    }
  ]
}
\`\`\`

**User:** "what files are in the workspace?"
**You:** There are 3 files: hello.py, readme.md, and app.md

## CORE PRINCIPLE: STRUCTURED EDITS OVER FULL FILE REPLACEMENT

❌ NEVER regenerate entire files - it breaks formatting, loses context, makes diffs unreadable
✅ ALWAYS use line-level edits - precise, readable, safe, maintains code structure

## CONTEXT PROVIDED
The user's message includes workspace files shown as:
1. **FILE LIST** - All files in the workspace
2. **FILE CONTENTS** - Full contents of each file

Total files: {fileCount}

## HOW TO RESPOND

### Simple Questions? Just Answer!
User: "How many files?"
You: "There are 2 files: hello.py and readme.md"

User: "What does hello.py do?"
You: "It's a Python script that..."

### File Changes? Use STRUCTURED LINE-LEVEL EDITS

**Format 1: JSON with line edits (RECOMMENDED)**
\`\`\`json
{
  "explanation": "Added validation to processOrder function",
  "files": [
    {
      "path": "orders.py",
      "edits": [
        {
          "startLine": 42,
          "endLine": 57,
          "oldContent": "original code being replaced",
          "newContent": "new validated code here"
        }
      ]
    }
  ]
}
\`\`\`

**Format 2: Unified Diff**
\`\`\`diff
--- a/orders.py
+++ b/orders.py
@@ -42,16 +42,20 @@
 def process_order(order_id):
-    result = process_internal(order_id)
+    try:
+        result = process_internal(order_id)
+        logger.info(f"Order processed successfully")
+    except Exception as e:
+        logger.error(f"Failed: {e}")
+        raise
     return result
\`\`\`

**Creating New Files:**
\`\`\`json
{
  "explanation": "Creating new validation module",
  "files": [
    {
      "path": "validators.py",
      "edits": [
        {
          "startLine": 0,
          "endLine": 0,
          "newContent": "def validate_order(data):\\n    # validation logic\\n    pass"
        }
      ]
    }
  ]
}
\`\`\`

### Terminal Commands? Use Code Blocks
\`\`\`shell
ls -la
npm install
\`\`\`

## WHY STRUCTURED EDITS MATTER

**Example: Add error handling to function**

❌ BAD - Full file replacement:
\`\`\`json
{"path": "orders.py", "content": "entire 500 line file with one line changed"}
\`\`\`

✅ GOOD - Line-level edit:
\`\`\`json
{
  "path": "orders.py",
  "edits": [
    {
      "startLine": 42,
      "endLine": 45,
      "newContent": "    try:\\n        result = process(order)\\n    except Exception as e:\\n        handle_error(e)"
    }
  ]
}
\`\`\`

**Benefits of structured edits:**
- Precise diffs in Git
- Preserves comments and formatting
- Easy to review and approve
- No merge conflicts
- Maintains AST structure

## EDITING EXAMPLES

**Add validation:**
\`\`\`json
{
  "explanation": "Added input validation to the checkout function",
  "files": [
    {
      "path": "checkout.py",
      "edits": [
        {
          "startLine": 18,
          "endLine": 21,
          "newContent": "    if not user_id or not isinstance(user_id, int):\\n        raise ValueError('Invalid user_id')\\n    if amount <= 0:\\n        raise ValueError('Amount must be positive')"
        }
      ]
    }
  ]
}
\`\`\`

**Fix bug in function:**
\`\`\`json
{
  "explanation": "Fixed off-by-one error in loop boundary",
  "files": [
    {
      "path": "processor.py",
      "edits": [
        {
          "startLine": 75,
          "endLine": 75,
          "newContent": "        for i in range(len(items) + 1):"
        }
      ]
    }
  ]
}
\`\`\`

**Add new function:**
\`\`\`json
{
  "explanation": "Added helper function for data transformation",
  "files": [
    {
      "path": "utils.py",
      "edits": [
        {
          "startLine": 150,
          "endLine": 150,
          "newContent": "def transform_data(data: dict) -> dict:\\n    return {k: v * 2 for k, v in data.items()}\\n\\n"
        }
      ]
    }
  ]
}
\`\`\`

## ABSOLUTELY FORBIDDEN
❌ DO NOT use <function=> tags
❌ DO NOT use <parameter=> tags
❌ DO NOT use tool/function calling format
❌ DO NOT regenerate entire files unless creating a new file
✅ ONLY use plain text, JSON in code blocks, or shell code blocks

## CRITICAL RULES
1. Check FILE LIST before doing anything
2. Answer simple questions directly as plain text
3. Use structured JSON for file changes (line-level edits preferred)
4. Use shell code blocks for terminal commands
5. ALWAYS use startLine/endLine for existing file edits
6. Create new files with startLine=0, endLine=0, newContent=full content

## ADDITIONAL CONTEXT
{includeGitDiff}
{includeTerminal}

Remember: Precision over convenience. Line-level edits create clean, maintainable code changes!`;

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

        const creds = allNvidia.find(m => m.providerName === selectedModel) || allNvidia[0] || null;

        if (creds) {
            // Load API key from secret storage if it exists
            const secretKey = `nvidia.apiKey.${creds.providerName}`;
            const apiKey = await this.context.secrets.get(secretKey);
            if (apiKey) {
                creds.apiKey = apiKey;
            }
        }

        return creds;
    }

    /**
     * Get all NVIDIA credentials
     */
    async getAllNvidiaCredentials(): Promise<NvidiaCredentials[]> {
        const allCreds = this.context.globalState.get<NvidiaCredentials[]>(
            CredentialManager.NVIDIA_CREDENTIALS_KEY
        ) || [];

        // Load API keys from secret storage for each credential
        for (const cred of allCreds) {
            const secretKey = `nvidia.apiKey.${cred.providerName}`;
            const apiKey = await this.context.secrets.get(secretKey);
            if (apiKey) {
                cred.apiKey = apiKey;
            }
        }

        return allCreds;
    }

    /**
     * Get stored credentials based on selected provider
     */
    async getCredentials(): Promise<AzureCredentials | NvidiaCredentials | AnthropicFoundryCredentials | ZaiCredentials | null> {
        const provider = await this.getSelectedProvider();

        if (provider === ProviderType.Azure) {
            return this.getAzureCredentials();
        } else if (provider === ProviderType.NVIDIA) {
            return this.getNvidiaCredentials();
        } else if (provider === ProviderType.AnthropicFoundry) {
            return this.getAnthropicFoundryCredentials();
        } else if (provider === ProviderType.Zai) {
            return this.getZaiCredentials();
        }

        return null;
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
            // Store API keys separately in secret storage
            for (const cred of credentials) {
                if (cred.apiKey) {
                    const secretKey = `nvidia.apiKey.${cred.providerName}`;
                    await this.context.secrets.store(secretKey, cred.apiKey);
                    // Remove the apiKey from the credential that will be stored in globalState
                    cred.apiKey = undefined;
                }
            }

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

    /**
     * Get Anthropic Foundry credentials
     */
    async getAnthropicFoundryCredentials(): Promise<AnthropicFoundryCredentials | null> {
        const stored = this.context.globalState.get<AnthropicFoundryCredentials>(
            CredentialManager.ANTHROPIC_FOUNDRY_CREDENTIALS_KEY
        );

        if (!stored) {
            return null;
        }

        // API key is stored separately in secret storage
        const apiKey = await this.context.secrets.get(
            CredentialManager.ANTHROPIC_FOUNDRY_API_KEY_SECRET
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
     * Configure Anthropic Foundry credentials
     */
    async configureAnthropicFoundryCredentials(credentials: AnthropicFoundryCredentials): Promise<void> {
        try {
            // Store non-sensitive data in globalState
            const { apiKey, ...credentialsWithoutKey } = credentials;

            await this.context.globalState.update(
                CredentialManager.ANTHROPIC_FOUNDRY_CREDENTIALS_KEY,
                credentialsWithoutKey
            );

            // Store API key in secret storage
            await this.context.secrets.store(
                CredentialManager.ANTHROPIC_FOUNDRY_API_KEY_SECRET,
                apiKey
            );

            Logger.log('Anthropic Foundry credentials stored successfully');
        } catch (error: any) {
            Logger.error('Failed to store Anthropic Foundry credentials', error);
            throw new Error(`Failed to save credentials: ${error.message}`);
        }
    }

    /**
     * Get Z.AI credentials
     */
    async getZaiCredentials(): Promise<ZaiCredentials | null> {
        const stored = this.context.globalState.get<ZaiCredentials>(
            CredentialManager.ZAI_CREDENTIALS_KEY
        );

        if (!stored) {
            return null;
        }

        // API key is stored separately in secret storage
        const apiKey = await this.context.secrets.get(
            CredentialManager.ZAI_API_KEY_SECRET
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
     * Configure Z.AI credentials
     */
    async configureZaiCredentials(credentials: ZaiCredentials): Promise<void> {
        try {
            // Store non-sensitive data in globalState
            const { apiKey, ...credentialsWithoutKey } = credentials;

            await this.context.globalState.update(
                CredentialManager.ZAI_CREDENTIALS_KEY,
                credentialsWithoutKey
            );

            // Store API key in secret storage
            await this.context.secrets.store(
                CredentialManager.ZAI_API_KEY_SECRET,
                apiKey
            );

            Logger.log('Z.AI credentials stored successfully');
        } catch (error: any) {
            Logger.error('Failed to store Z.AI credentials', error);
            throw new Error(`Failed to save credentials: ${error.message}`);
        }
    }
}
