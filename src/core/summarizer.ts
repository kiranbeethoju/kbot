/**
 * Hierarchical Summarizer
 * Summarizes large content by recursively compressing it
 */

import { ContextManager } from './contextManager';
import { ChatMessage } from '../types';
import { Logger } from '../logger';

export interface SummarizerOptions {
    targetTokens?: number; // Target token count for final summary
    preserveKeyPoints?: boolean; // Try to preserve important information
    modelName?: string;
}

export interface SummaryResult {
    summary: string;
    originalTokens: number;
    summaryTokens: number;
    compressionRatio: number;
    levels: number; // How many levels of summarization were applied
}

/**
 * Provider service interface for summarization
 */
export interface SummarizationProvider {
    chatCompletion(messages: ChatMessage[], onProgress?: (delta: string) => void, signal?: AbortSignal): Promise<string>;
}

export class Summarizer {
    constructor(
        private contextManager: ContextManager,
        private provider: SummarizationProvider
    ) {}

    /**
     * Hierarchically summarize large text
     * If text is too large, chunks it, summarizes each chunk, then summarizes the summaries
     */
    async hierarchicalSummarize(
        text: string,
        options: SummarizerOptions = {}
    ): Promise<SummaryResult> {
        const {
            targetTokens,
            preserveKeyPoints = true,
            modelName = 'gpt-4o'
        } = options;

        const originalTokens = this.contextManager.estimateTokens(text);
        Logger.debug(`Starting hierarchical summarization. Original tokens: ${originalTokens}`);

        // If text is already small enough, return as-is
        const safeTarget = targetTokens || this.contextManager.getSafeChunkSize(modelName);
        if (originalTokens <= safeTarget) {
            return {
                summary: text,
                originalTokens,
                summaryTokens: originalTokens,
                compressionRatio: 1,
                levels: 0
            };
        }

        let currentContent = text;
        let currentTokens = originalTokens;
        let levels = 0;
        const maxLevels = 3; // Prevent infinite loops

        // Iteratively summarize until we hit target size
        while (currentTokens > safeTarget && levels < maxLevels) {
            Logger.debug(`Summarization level ${levels + 1}: ${currentTokens} tokens -> target ${safeTarget}`);

            // Check if we need chunking
            if (this.contextManager.fitsInContext(currentContent, modelName)) {
                // Single-pass summarization
                currentContent = await this.summarizeDirectly(currentContent, preserveKeyPoints);
            } else {
                // Multi-pass with chunking
                currentContent = await this.summarizeWithChunking(currentContent, modelName, preserveKeyPoints);
            }

            currentTokens = this.contextManager.estimateTokens(currentContent);
            levels++;
        }

        const summaryTokens = this.contextManager.estimateTokens(currentContent);
        const compressionRatio = originalTokens / summaryTokens;

        Logger.debug(`Summarization complete. ${originalTokens} -> ${summaryTokens} tokens (${compressionRatio.toFixed(2)}x compression, ${levels} levels)`);

        return {
            summary: currentContent,
            originalTokens,
            summaryTokens,
            compressionRatio,
            levels
        };
    }

    /**
     * Summarize text in one pass (when it fits in context)
     */
    private async summarizeDirectly(text: string, preserveKeyPoints: boolean): Promise<string> {
        const prompt = preserveKeyPoints
            ? `Summarize the following code/text while preserving:
1. Key logic and algorithms
2. Important functions and their purposes
3. Critical implementation details
4. Error handling and edge cases

Content to summarize:
${text}

Summary:`
            : `Provide a concise summary of the following:

${text}

Summary:`;

        try {
            const summary = await this.provider.chatCompletion([
                { role: 'system', content: 'You are a expert at summarizing technical content accurately and concisely.' },
                { role: 'user', content: prompt }
            ]);

            return summary.trim();
        } catch (error) {
            Logger.error('Direct summarization failed:', error);
            // Fall back to simple truncation
            return this.smartTruncate(text, 0.5);
        }
    }

    /**
     * Summarize by chunking, summarizing each chunk, then merging
     */
    private async summarizeWithChunking(text: string, modelName: string, preserveKeyPoints: boolean): Promise<string> {
        const chunkSize = Math.floor(this.contextManager.getSafeChunkSize(modelName) * 0.7);
        const chunks = this.splitIntoChunks(text, chunkSize);

        Logger.debug(`Chunking into ${chunks.length} pieces for summarization`);

        // Summarize each chunk
        const summaries: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
            Logger.debug(`Summarizing chunk ${i + 1}/${chunks.length}`);

            const chunkSummary = await this.summarizeDirectly(chunks[i], preserveKeyPoints);
            summaries.push(`[Part ${i + 1}]\n${chunkSummary}`);
        }

        const combined = summaries.join('\n\n');

        // If combined summaries are still too large, summarize again
        if (!this.contextManager.fitsInContext(combined, modelName)) {
            Logger.debug('Combined summaries still too large, summarizing again');
            return this.summarizeDirectly(combined, preserveKeyPoints);
        }

        return combined;
    }

    /**
     * Split text into roughly equal-sized chunks
     */
    private splitIntoChunks(text: string, maxTokens: number): string[] {
        const chunks: string[] = [];
        const approxChars = maxTokens * 4;

        for (let i = 0; i < text.length; i += approxChars) {
            chunks.push(text.slice(i, i + approxChars));
        }

        return chunks;
    }

    /**
     * Smart truncation - keeps beginning and end, adds summary marker in middle
     */
    private smartTruncate(text: string, keepRatio: number = 0.5): string {
        const targetLength = Math.floor(text.length * keepRatio);
        const keepStart = Math.floor(targetLength * 0.6);
        const keepEnd = Math.floor(targetLength * 0.4);

        const start = text.slice(0, keepStart);
        const end = text.slice(-keepEnd);

        return `${start}\n\n[... ${Math.round((1 - keepRatio) * 100)}% omitted ...]\n\n${end}`;
    }

    /**
     * Summarize multiple messages (e.g., conversation history)
     */
    async summarizeMessages(messages: ChatMessage[], targetTokens?: number): Promise<SummaryResult> {
        // Combine messages into a single text
        const combined = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
        return this.hierarchicalSummarize(combined, { targetTokens });
    }

    /**
     * Create a condensed version of conversation history
     */
    async condenseHistory(messages: ChatMessage[], keepRecent: number = 5): Promise<ChatMessage[]> {
        if (messages.length <= keepRecent) {
            return messages;
        }

        const recent = messages.slice(-keepRecent);
        const toSummarize = messages.slice(0, -keepRecent);

        const result = await this.summarizeMessages(toSummarize);

        // Create a summary message
        const summaryMessage: ChatMessage = {
            role: 'system',
            content: `[Previous conversation summary]\n${result.summary}`
        };

        return [summaryMessage, ...recent];
    }
}
