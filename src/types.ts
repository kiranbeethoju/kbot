/**
 * Type definitions for the extension
 */

export enum ProviderType {
    Azure = 'azure',
    NVIDIA = 'nvidia'
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
    providerName: string; // e.g., "Nemotron", "OCR Model"
    maxTokens?: number; // Optional - if not set, backend uses default
    temperature?: number; // Optional - if not set, backend uses default
}

export type Credentials = AzureCredentials | NvidiaCredentials;

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
