/**
 * Z.AI Service
 * Handles API calls to Z.AI (GLM models)
 */

import { Logger } from './logger';
import { ChatMessage, ZaiCredentials } from './types';
import { CredentialManager } from './credentials';

export class ZaiService {
    private credentials: ZaiCredentials | null = null;
    private readonly endpoint = 'https://api.z.ai/api/paas/v4/chat/completions';

    constructor(private credentialManager: CredentialManager) {}

    /**
     * Set credentials for Z.AI
     */
    setCredentials(credentials: ZaiCredentials): void {
        this.credentials = credentials;
        Logger.log('Z.AI credentials set');
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
     * Send a chat completion request to Z.AI
     */
    async sendMessage(
        messages: ChatMessage[],
        onProgress?: (delta: string) => void
    ): Promise<string> {
        if (!this.credentials) {
            throw new Error('Z.AI credentials not configured');
        }

        try {
            Logger.log(`Sending request to Z.AI: ${this.endpoint}`);

            // Build the request body according to Z.AI's API format
            const requestBody = {
                model: this.credentials.modelName,
                messages: messages
                    .filter(m => m.role !== 'system')
                    .map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                thinking: {
                    type: 'enabled'
                },
                max_tokens: this.credentials.maxTokens || 4096,
                temperature: this.credentials.temperature || 1.0
            };

            // Add system message if present - prepend to first user message
            const systemMessage = messages.find(m => m.role === 'system');
            if (systemMessage && requestBody.messages.length > 0) {
                requestBody.messages[0].content = `${systemMessage.content}\n\n${requestBody.messages[0].content}`;
            }

            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.credentials.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                Logger.error(`Z.AI API error: ${response.status} ${errorText}`);
                throw new Error(`Z.AI API error: ${response.status} - ${errorText}`);
            }

            // Parse response
            const data = await response.json();
            Logger.log('Z.AI response received');

            // Z.AI returns choices array
            if (data.choices && data.choices.length > 0) {
                const content = data.choices[0].message?.content || '';

                // Handle streaming if supported in future
                if (onProgress && content) {
                    // Simulate streaming for non-streaming response
                    const words = content.split(' ');
                    for (let i = 0; i < words.length; i++) {
                        onProgress(words[i] + (i < words.length - 1 ? ' ' : ''));
                    }
                }

                return content;
            }

            throw new Error('Unexpected response format from Z.AI');
        } catch (error: any) {
            Logger.error('Z.AI request failed', error);
            throw error;
        }
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
