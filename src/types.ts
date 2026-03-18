/**
 * Type definitions for the extension
 */

export enum ProviderType {
    Azure = 'azure',
    NVIDIA = 'nvidia',
    AnthropicFoundry = 'anthropic-foundry',
    Zai = 'zai'
}

// GitHub-related types
export interface GitHubCredentials {
    token: string;
}

export interface GitHubRepository {
    owner: string;
    repo: string;
}

export interface GitHubPullRequest {
    number: number;
    title: string;
    head: {
        sha: string;
        ref: string;
    };
    base: {
        sha: string;
        ref: string;
    };
}

export interface GitHubStatusCheck {
    state: 'success' | 'failure' | 'pending' | 'error';
    description: string;
    context: string;
    targetUrl?: string;
}

// Code review types
export enum ReviewSeverity {
    Error = 'error',
    Warning = 'warning',
    Suggestion = 'suggestion',
    Info = 'info'
}

export interface ReviewComment {
    filePath: string;
    line: number;
    severity: ReviewSeverity;
    message: string;
    suggestion?: string;
    code?: string;
}

export interface ReviewResult {
    summary: string;
    comments: ReviewComment[];
    passedChecks: string[];
    failedChecks: string[];
}

export interface ReviewConfig {
    name: string;
    rules: ReviewRule[];
    enabled: boolean;
}

export interface ReviewRule {
    id: string;
    name: string;
    severity: ReviewSeverity;
    description: string;
    enabled: boolean;
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
