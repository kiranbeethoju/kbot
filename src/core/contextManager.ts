/**
 * Context Manager
 * Handles context window limits, token estimation, and model-specific configurations
 */

import { Logger } from '../logger';
import { ProviderType } from '../types';

export interface ModelLimits {
    maxContext: number;
    maxOutput: number;
    safeBuffer: number; // Percentage to keep as safety buffer (e.g., 0.8 for 80%)
}

export interface ModelConfig {
    name: string;
    provider: ProviderType;
    limits: ModelLimits;
}

/**
 * Model-specific context limits
 */
const MODEL_LIMITS: Record<string, ModelLimits> = {
    // Azure OpenAI GPT-5 Models (Latest)
    'gpt-5': { maxContext: 1000000, maxOutput: 8192, safeBuffer: 0.85 },
    'gpt-5.1': { maxContext: 1000000, maxOutput: 8192, safeBuffer: 0.85 },
    'gpt-5.2': { maxContext: 1000000, maxOutput: 8192, safeBuffer: 0.85 },
    'gpt-5-turbo': { maxContext: 1000000, maxOutput: 8192, safeBuffer: 0.85 },

    // Azure OpenAI GPT-4 Models
    'gpt-4': { maxContext: 8192, maxOutput: 2048, safeBuffer: 0.8 },
    'gpt-4-32k': { maxContext: 32768, maxOutput: 4096, safeBuffer: 0.8 },
    'gpt-4-turbo': { maxContext: 128000, maxOutput: 4096, safeBuffer: 0.8 },
    'gpt-4o': { maxContext: 128000, maxOutput: 4096, safeBuffer: 0.8 },
    'gpt-4o-mini': { maxContext: 128000, maxOutput: 16384, safeBuffer: 0.8 },
    'gpt-35-turbo': { maxContext: 4096, maxOutput: 1024, safeBuffer: 0.8 },
    'gpt-35-turbo-16k': { maxContext: 16384, maxOutput: 2048, safeBuffer: 0.8 },

    // NVIDIA Models
    'nemotron-4-340b': { maxContext: 4096, maxOutput: 1024, safeBuffer: 0.8 },
    'mixtral-8x7b': { maxContext: 32768, maxOutput: 4096, safeBuffer: 0.8 },
    'llama-3-70b': { maxContext: 8192, maxOutput: 2048, safeBuffer: 0.8 },

    // Anthropic Models
    'claude-opus-4_5': { maxContext: 200000, maxOutput: 4096, safeBuffer: 0.8 },
    'claude-sonnet-4_5': { maxContext: 200000, maxOutput: 8192, safeBuffer: 0.8 },
    'claude-3-5-sonnet': { maxContext: 200000, maxOutput: 8192, safeBuffer: 0.8 },
    'claude-3-opus': { maxContext: 200000, maxOutput: 4096, safeBuffer: 0.8 },

    // Z.AI Models
    'glm-4-plus': { maxContext: 128000, maxOutput: 4096, safeBuffer: 0.8 },
    'glm-4-7': { maxContext: 128000, maxOutput: 8192, safeBuffer: 0.8 },
};

/**
 * Default limits for unknown models
 */
const DEFAULT_LIMITS: ModelLimits = {
    maxContext: 8192,
    maxOutput: 2048,
    safeBuffer: 0.8
};

export class ContextManager {
    private modelConfigs: Map<string, ModelConfig> = new Map();

    /**
     * Register or update a model configuration
     */
    registerModel(config: ModelConfig): void {
        this.modelConfigs.set(config.name, config);
        Logger.debug(`Registered model config: ${config.name}`);
    }

    /**
     * Get limits for a specific model
     */
    getModelLimits(modelName: string): ModelLimits {
        // Check registered models first
        const registered = this.modelConfigs.get(modelName);
        if (registered) {
            return registered.limits;
        }

        // Check predefined limits
        const limits = MODEL_LIMITS[modelName];
        if (limits) {
            return limits;
        }

        // Try to match partial model names
        for (const [key, value] of Object.entries(MODEL_LIMITS)) {
            if (modelName.includes(key) || key.includes(modelName)) {
                Logger.debug(`Using limits for similar model: ${key} for ${modelName}`);
                return value;
            }
        }

        Logger.warn(`Unknown model: ${modelName}, using default limits`);
        return DEFAULT_LIMITS;
    }

    /**
     * Estimate token count for text
     * Uses a lightweight approximation: ~4 characters per token
     * This is conservative and works well for most code
     */
    estimateTokens(text: string): number {
        if (!text) return 0;

        // For better accuracy, count words and special characters
        const words = text.split(/\s+/).length;
        const chars = text.length;

        // Approximate: 1 token ≈ 4 chars for code, 1 token ≈ 3 chars for English
        // We use a weighted average
        return Math.ceil((chars / 3.5) + (words * 0.3));
    }

    /**
     * Check if content fits within model's context window
     */
    fitsInContext(content: string, modelName: string): boolean {
        const tokens = this.estimateTokens(content);
        const limits = this.getModelLimits(modelName);
        const safeLimit = limits.maxContext * limits.safeBuffer;

        return tokens < safeLimit;
    }

    /**
     * Get available context space (in tokens)
     */
    getAvailableContext(usedContent: string, modelName: string): number {
        const usedTokens = this.estimateTokens(usedContent);
        const limits = this.getModelLimits(modelName);
        const safeLimit = limits.maxContext * limits.safeBuffer;

        return Math.max(0, Math.floor(safeLimit - usedTokens));
    }

    /**
     * Calculate how much we need to reduce content
     */
    calculateReduction(content: string, modelName: string): number {
        const tokens = this.estimateTokens(content);
        const limits = this.getModelLimits(modelName);
        const safeLimit = limits.maxContext * limits.safeBuffer;

        if (tokens <= safeLimit) {
            return 0;
        }

        return Math.ceil(tokens - safeLimit);
    }

    /**
     * Get safe chunk size for a model
     */
    getSafeChunkSize(modelName: string): number {
        const limits = this.getModelLimits(modelName);
        // Use 60% of context for chunks to allow room for prompt template
        return Math.floor((limits.maxContext * 0.6));
    }

    /**
     * Calculate token usage statistics
     */
    calculateUsageStats(input: string, output: string, modelName: string): {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        percentageUsed: number;
    } {
        const inputTokens = this.estimateTokens(input);
        const outputTokens = this.estimateTokens(output);
        const totalTokens = inputTokens + outputTokens;
        const limits = this.getModelLimits(modelName);
        const percentageUsed = (totalTokens / limits.maxContext) * 100;

        return {
            inputTokens,
            outputTokens,
            totalTokens,
            percentageUsed
        };
    }
}
