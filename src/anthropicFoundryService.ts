/**
 * Anthropic Foundry Service
 * Handles API calls to Anthropic Foundry (Azure-hosted Claude models)
 */

import { Logger } from './logger';
import { ChatMessage, AnthropicFoundryCredentials } from './types';
import { CredentialManager } from './credentials';

export class AnthropicFoundryService {
    private credentials: AnthropicFoundryCredentials | null = null;

    constructor(private credentialManager: CredentialManager) {}

    /**
     * Set credentials for Anthropic Foundry
     */
    setCredentials(credentials: AnthropicFoundryCredentials): void {
        this.credentials = credentials;
        Logger.log('Anthropic Foundry credentials set');
    }

    /**
     * Check if credentials are configured
     */
    isConfigured(): boolean {
        return this.credentials !== null;
    }

    /**
     * Generate system prompt with structured editing instructions
     */
    async generateSystemPrompt(context: {
        fileCount: number;
        includeGitDiff?: boolean;
        includeTerminal?: boolean;
    }): Promise<string> {
        const basePrompt = await this.credentialManager.getSystemPrompt();

        // Replace placeholders in the prompt
        let prompt = basePrompt
            .replace('{fileCount}', context.fileCount.toString())
            .replace('{includeGitDiff}', context.includeGitDiff ? '\n\nGit diff context is included.' : '')
            .replace('{includeTerminal}', context.includeTerminal ? '\n\nTerminal output is included.' : '');

        return prompt;
    }

    /**
     * Send a chat completion request to Anthropic Foundry
     */
    async sendMessage(
        messages: ChatMessage[],
        onProgress?: (delta: string) => void
    ): Promise<string> {
        if (!this.credentials) {
            throw new Error('Anthropic Foundry credentials not configured');
        }

        try {
            Logger.log(`Sending request to Anthropic Foundry: ${this.credentials.endpoint}`);

            // Build the request body according to Anthropic's API format
            const requestBody = {
                model: this.credentials.deploymentName,
                messages: messages
                    .filter(m => m.role !== 'system')
                    .map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                max_tokens: this.credentials.maxTokens || 4096,
                temperature: this.credentials.temperature || 0.7
            };

            // Add system message if present
            const systemMessage = messages.find(m => m.role === 'system');
            if (systemMessage) {
                (requestBody as any).system = systemMessage.content;
            }

            const response = await fetch(`${this.credentials.endpoint}/v1/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.credentials.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                Logger.error(`Anthropic Foundry API error: ${response.status} ${errorText}`);
                throw new Error(`Anthropic Foundry API error: ${response.status} - ${errorText}`);
            }

            // Check if response is streaming
            const contentType = response.headers.get('content-type') || '';

            if (contentType.includes('text/event-stream') || onProgress) {
                // Handle streaming response
                return await this.handleStreamingResponse(response, onProgress);
            } else {
                // Handle non-streaming response
                const data = await response.json();
                Logger.log('Anthropic Foundry response received');

                if (data.content && data.content.length > 0) {
                    return data.content[0].text;
                }

                throw new Error('Unexpected response format from Anthropic Foundry');
            }
        } catch (error: any) {
            Logger.error('Anthropic Foundry request failed', error);
            throw error;
        }
    }

    /**
     * Handle streaming response from Anthropic Foundry
     */
    private async handleStreamingResponse(
        response: Response,
        onProgress?: (delta: string) => void
    ): Promise<string> {
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body reader available');
        }

        const decoder = new TextDecoder();
        let fullContent = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);

                    if (data === '[DONE]') {
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(data);

                        // Handle Anthropic's streaming format
                        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                            const text = parsed.delta.text;
                            fullContent += text;

                            if (onProgress) {
                                onProgress(text);
                            }
                        }
                    } catch (e) {
                        // Skip invalid JSON
                        Logger.warn('Failed to parse streaming chunk', e);
                    }
                }
            }
        }

        return fullContent;
    }

    /**
     * Send message with file context
     */
    async sendMessageWithContext(
        messages: ChatMessage[],
        fileContext: string,
        onProgress?: (delta: string) => void
    ): Promise<string> {
        // Create a new message array with file context prepended
        const messagesWithContext: ChatMessage[] = [
            {
                role: 'user',
                content: `${fileContext}\n\n${messages[messages.length - 1].content}`
            }
        ];

        return this.sendMessage(messagesWithContext, onProgress);
    }
}
