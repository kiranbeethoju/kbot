/**
 * Type definitions for the extension
 */

export enum ProviderType {
    Azure = 'azure',
    NVIDIA = 'nvidia',
    AnthropicFoundry = 'anthropic-foundry',
    Zai = 'zai'
}

export interface ProviderConfig {
    type: ProviderType;
    name: string;
}

export interface AzureCredentials {
    endpoint: string;
    apiKey: string;
    deploymentName: string;
    apiVersion: string;
    modelName: string;
    maxTokens?: number; // Optional - if not set, backend uses default
    temperature?: number; // Optional - if not set, backend uses default
}

export interface NvidiaCredentials {
    endpoint: string;
    modelName: string;
    providerName: string; // e.g., "Nemotron", "OCR Model", "Online NVIDIA"
    apiKey?: string; // Optional - for online NVIDIA API (https://integrate.api.nvidia.com)
    maxTokens?: number; // Optional - if not set, backend uses default
    temperature?: number; // Optional - if not set, backend uses default
    topP?: number; // Optional - if not set, backend uses default
}

export interface AnthropicFoundryCredentials {
    endpoint: string; // e.g., "https://<your-resource-name>.openai.azure.com/anthropic"
    apiKey: string;
    deploymentName: string; // e.g., "claude-opus-4_5-dev"
    maxTokens?: number; // Optional - if not set, backend uses default
    temperature?: number; // Optional - if not set, backend uses default
}

export interface ZaiCredentials {
    apiKey: string;
    modelName: string; // e.g., "glm-4.7", "glm-4-plus"
    maxTokens?: number; // Optional - if not set, backend uses default
    temperature?: number; // Optional - if not set, backend uses default
}

export type Credentials = AzureCredentials | NvidiaCredentials | AnthropicFoundryCredentials | ZaiCredentials;

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    image?: {
        data: string; // base64 encoded image
        mimeType: string; // e.g., "image/png", "image/jpeg"
    };
}

export interface Model {
    id: string;
    name: string;
    provider: ProviderType;
    endpoint?: string;
}
