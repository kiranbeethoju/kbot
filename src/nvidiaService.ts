/**
 * NVIDIA API Service
 * Handles communication with local NVIDIA API endpoints
 */

import * as vscode from 'vscode';
import { NvidiaCredentials, ChatMessage } from './types';
import { Logger } from './logger';

export class NvidiaService {
    private credentials: NvidiaCredentials | null = null;

    constructor(private credentialManager: any) {}

    /**
     * Set credentials
     */
    setCredentials(credentials: NvidiaCredentials): void {
        this.credentials = credentials;
        Logger.log(`NVIDIA credentials set for: ${credentials.providerName}`, {
            endpoint: credentials.endpoint,
            modelName: credentials.modelName
        });
    }

    /**
     * Ensure credentials are loaded
     */
    private async ensureCredentials(): Promise<void> {
        if (!this.credentials) {
            Logger.debug('Loading NVIDIA credentials from storage...');
            this.credentials = await this.credentialManager.getNvidiaCredentials();
        }

        if (!this.credentials) {
            throw new Error('NVIDIA credentials not configured. Please configure them first.');
        }

        Logger.debug('NVIDIA credentials loaded successfully');
    }

    /**
     * Send chat completion request to NVIDIA API
     */
    async chatCompletion(
        messages: ChatMessage[],
        onProgress?: (delta: string) => void,
        signal?: AbortSignal
    ): Promise<string> {
        await this.ensureCredentials();

        const { endpoint, modelName, apiKey } = this.credentials!;

        // NVIDIA uses OpenAI-compatible API format
        const url = endpoint.endsWith('/chat/completions')
            ? endpoint
            : `${endpoint}/chat/completions`;

        Logger.log(`Sending request to NVIDIA API: ${this.credentials!.providerName}`);
        Logger.debug(`Request URL: ${url}`);
        Logger.debug(`Model: ${modelName}`);
        Logger.debug(`Message count: ${messages.length}`);

        try {
            // Build request body - only include max_tokens and temperature if configured
            // Transform messages to handle image content (for vision-compatible models)
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
                model: modelName,
                messages: transformedMessages,
                stream: !!onProgress
            };

            // Only add max_tokens if configured in credentials
            if (this.credentials.maxTokens !== undefined) {
                requestBody.max_tokens = this.credentials.maxTokens;
            }

            // Only add temperature if configured in credentials
            if (this.credentials.temperature !== undefined) {
                requestBody.temperature = this.credentials.temperature;
            }

            // Only add top_p if configured in credentials
            if (this.credentials.topP !== undefined) {
                requestBody.top_p = this.credentials.topP;
            }

            Logger.debug(`Request body: ${JSON.stringify({ ...requestBody, messages: `[${requestBody.messages.length} messages]` })}`);

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            // Add Authorization header if apiKey is provided (for online NVIDIA API)
            if (this.credentials.apiKey) {
                headers['Authorization'] = `Bearer ${this.credentials.apiKey}`;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
                signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                Logger.error(`NVIDIA API error: ${response.status}`, errorText);
                throw new Error(`NVIDIA API error: ${response.status} - ${errorText}`);
            }

            if (onProgress && response.body) {
                // Handle streaming response
                return this.handleStreamingResponse(response.body, onProgress);
            }

            const data = await response.json();
            Logger.log('Received response from NVIDIA API');
            return data.choices[0]?.message?.content || '';
        } catch (error: any) {
            Logger.error('Failed to call NVIDIA API', error);
            throw new Error(`Failed to call NVIDIA API: ${error.message}`);
        }
    }

    /**
     * Handle streaming response from NVIDIA API
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
     * Generate system prompt for NVIDIA
     */
    async generateSystemPrompt(context: {
        fileCount: number;
        includeGitDiff: boolean;
        includeTerminal: boolean;
    }): Promise<string> {
        // Get custom system prompt from storage (same for both providers)
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

    /**
     * Clear credentials
     */
    clearCredentials(): void {
        this.credentials = null;
        Logger.log('NVIDIA credentials cleared');
    }
}
