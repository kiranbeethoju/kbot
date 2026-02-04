/**
 * Azure GPT Service
 * Handles communication with Azure OpenAI API
 */

import * as vscode from 'vscode';
import { CredentialManager } from './credentials';
import { Logger } from './logger';
import { AzureCredentials, ChatMessage, ProviderType } from './types';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface GPTResponse {
    explanation: string;
    files: Array<{
        path: string;
        action: 'update' | 'create' | 'delete';
        content: string;
    }>;
}

export class AzureGPTService {
    private credentials: AzureCredentials | null = null;

    constructor(private credentialManager: CredentialManager) {}

    /**
     * Ensure credentials are loaded
     */
    private async ensureCredentials(): Promise<void> {
        if (!this.credentials) {
            Logger.debug('Loading credentials from storage...');
            this.credentials = await this.credentialManager.getAzureCredentials();
        }

        if (!this.credentials) {
            Logger.error('Credentials not configured');
            throw new Error('Azure credentials not configured. Please configure them first.');
        }

        Logger.debug('Credentials loaded successfully');
    }

    /**
     * Send chat completion request to Azure OpenAI
     */
    async chatCompletion(
        messages: ChatMessage[],
        onProgress?: (delta: string) => void,
        signal?: AbortSignal
    ): Promise<string> {
        await this.ensureCredentials();

        const { endpoint, apiKey, deploymentName, apiVersion } = this.credentials!;

        const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

        Logger.log(`Sending request to Azure OpenAI: ${deploymentName}`);
        Logger.debug(`Request URL: ${url.replace(apiKey, '***')}`);
        Logger.debug(`Message count: ${messages.length}`);

        try {
            // Build request body - only include max_tokens and temperature if configured
            // Transform messages to handle image content
            const transformedMessages = messages.map(msg => {
                if (msg.image) {
                    // For vision models, content should be an array with text and image
                    return {
                        role: msg.role,
                        content: [
                            {
                                type: 'text',
                                text: msg.content
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${msg.image.mimeType};base64,${msg.image.data}`
                                }
                            }
                        ]
                    };
                }
                return msg;
            });

            const requestBody: any = {
                messages: transformedMessages,
                stream: !!onProgress
            };

            // Only add max_tokens if configured in credentials
            if (this.credentials.maxTokens !== undefined) {
                requestBody.max_tokens = this.credentials.maxTokens;
            }

            // Only add temperature if configured in credentials, otherwise use default
            if (this.credentials.temperature !== undefined) {
                requestBody.temperature = this.credentials.temperature;
            }

            Logger.debug(`Request body: ${JSON.stringify({ ...requestBody, messages: `[${requestBody.messages.length} messages]` })}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                },
                body: JSON.stringify(requestBody),
                signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                Logger.error(`Azure API error: ${response.status}`, errorText);
                throw new Error(`Azure API error: ${response.status} - ${errorText}`);
            }

            if (onProgress && response.body) {
                // Handle streaming response
                return this.handleStreamingResponse(response.body, onProgress);
            }

            const data = await response.json();
            Logger.log('Received response from Azure OpenAI');
            return data.choices[0]?.message?.content || '';
        } catch (error: any) {
            Logger.error('Failed to call Azure OpenAI', error);
            throw new Error(`Failed to call Azure OpenAI: ${error.message}`);
        }
    }

    /**
     * Handle streaming response from Azure OpenAI
     */
    private async handleStreamingResponse(
        body: ReadableStream<Uint8Array>,
        onProgress: (delta: string) => void
    ): Promise<string> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);

                    if (data === '[DONE]') {
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices[0]?.delta?.content;

                        if (delta) {
                            fullContent += delta;
                            onProgress(delta);
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }

        return fullContent;
    }

    /**
     * Parse structured response from GPT
     */
    parseStructuredResponse(content: string): GPTResponse {
        try {
            // Try to extract JSON from the response
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
                             content.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                const parsed = JSON.parse(jsonStr);

                return {
                    explanation: parsed.explanation || '',
                    files: parsed.files || []
                };
            }
        } catch (e) {
            // If parsing fails, return raw content as explanation
        }

        // Return as plain text response
        return {
            explanation: content,
            files: []
        };
    }

    /**
     * Generate system prompt based on context
     */
    async generateSystemPrompt(context: {
        fileCount: number;
        includeGitDiff: boolean;
        includeTerminal: boolean;
    }): Promise<string> {
        // Get custom system prompt from storage
        const customPrompt = await this.credentialManager.getSystemPrompt();

        // Get workspace path for the prompt
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

        // Replace placeholders in custom prompt with actual context
        let prompt = customPrompt
            .replace(/\{fileCount\}/g, context.fileCount.toString())
            .replace(/\{workspacePath\}/g, workspacePath)
            .replace(/\{includeGitDiff\}/g, context.includeGitDiff ?
                '- Git diff showing recent changes' : '')
            .replace(/\{includeTerminal\}/g, context.includeTerminal ?
                '- Terminal output' : '');

        return prompt;
    }
}
