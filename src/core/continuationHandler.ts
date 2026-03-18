/**
 * Continuation Handler
 * Handles output continuation when model hits max_tokens limit
 */

import { ChatMessage } from '../types';
import { Logger } from '../logger';

export interface ContinuationOptions {
    maxContinuations?: number;
    minChunkSize?: number;
    overlapTokens?: number;
}

export interface ContinuationResult {
    content: string;
    continuations: number;
    finishReason: string;
    metadata: {
        totalTokens: number;
        chunks: number[];
    };
}

/**
 * Provider service interface for continuation
 */
export interface ContinuationProvider {
    chatCompletion(messages: ChatMessage[], onProgress?: (delta: string) => void, signal?: AbortSignal): Promise<string>;
}

export class ContinuationHandler {
    constructor(private provider: ContinuationProvider) {}

    /**
     * Generate with automatic continuation when hitting token limit
     */
    async generateWithContinuation(
        prompt: string,
        options: ContinuationOptions = {}
    ): Promise<ContinuationResult> {
        const {
            maxContinuations = 5,
            minChunkSize = 50,
            overlapTokens = 200
        } = options;

        Logger.debug('Starting generation with continuation handler');

        let fullContent = '';
        let currentPrompt = prompt;
        let continuations = 0;
        const chunks: number[] = [];

        // First generation
        let response = await this.singleGeneration(currentPrompt);
        fullContent += response.text;
        chunks.push(response.text.length);
        continuations++;

        // Check if we need continuation
        while (response.finishReason === 'length' && continuations <= maxContinuations) {
            Logger.debug(`Continuation ${continuations}: previous output was truncated`);

            // Build continuation prompt with context
            const overlapText = this.getLastTokens(fullContent, overlapTokens);
            currentPrompt = this.buildContinuationPrompt(fullContent, overlapText);

            response = await this.singleGeneration(currentPrompt);

            // Remove any redundant prefix that the model might have repeated
            const cleaned = this.removeRedundancy(response.text, fullContent);

            fullContent += cleaned;
            chunks.push(cleaned.length);
            continuations++;
        }

        Logger.debug(`Generation complete. ${continuations} chunk(s), total length: ${fullContent.length}`);

        return {
            content: fullContent,
            continuations: continuations - 1,
            finishReason: response.finishReason,
            metadata: {
                totalTokens: fullContent.length,
                chunks
            }
        };
    }

    /**
     * Single generation attempt
     */
    private async singleGeneration(prompt: string): Promise<{ text: string; finishReason: string }> {
        try {
            const text = await this.provider.chatCompletion([
                {
                    role: 'system',
                    content: 'You are a helpful AI assistant. When continuing a previous response, start exactly where you left off without repeating content.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ]);

            // In real implementation, you'd get finish_reason from the API response
            // For now, we'll detect truncation heuristically
            const finishReason = this.detectTruncation(text) ? 'length' : 'stop';

            return { text, finishReason };
        } catch (error) {
            Logger.error('Generation failed:', error);
            return { text: '', finishReason: 'error' };
        }
    }

    /**
     * Detect if text was likely truncated
     */
    private detectTruncation(text: string): boolean {
        // Heuristics for detecting truncation
        const truncationIndicators = [
            /\.\.\.$/, // Ends with ellipsis
            /[^.!?]$/, // Doesn't end with sentence terminator
            /```[a-z]*$/, // Unclosed code block
            /<[^>]*$/, // Unclosed tag
            /\{[^}]*$/, // Unclosed brace
            /\[[^\]]*$/, // Unclosed bracket
        ];

        // Check for code blocks
        const codeBlockCount = (text.match(/```/g) || []).length;
        if (codeBlockCount % 2 !== 0) {
            return true; // Unclosed code block
        }

        // Check other indicators
        for (const indicator of truncationIndicators) {
            if (indicator.test(text.trim())) {
                return true;
            }
        }

        return false;
    }

    /**
     * Build continuation prompt
     */
    private buildContinuationPrompt(fullContent: string, overlapText: string): string {
        return `Continue exactly from where you stopped in the previous response. Do NOT repeat any content.

Previous context (last part):
${overlapText}

Continue from here:`;
    }

    /**
     * Get last N tokens from content
     */
    private getLastTokens(content: string, tokenCount: number): string {
        const approxChars = tokenCount * 4;
        if (content.length <= approxChars) {
            return content;
        }

        // Try to break at a sentence boundary
        let end = content.length - approxChars;
        const lastPeriod = content.lastIndexOf('.', end);
        const lastNewline = content.lastIndexOf('\n', end);
        const breakPoint = Math.max(lastPeriod, lastNewline);

        return content.slice(Math.max(0, breakPoint + 1));
    }

    /**
     * Remove redundancy when model repeats content
     */
    private removeRedundancy(newContent: string, existingContent: string): string {
        if (!newContent || !existingContent) {
            return newContent;
        }

        // Check if new content starts with repetition of existing content
        const existingEnd = existingContent.slice(-500);
        const newStart = newContent.slice(0, 500);

        // Find longest common prefix
        let overlap = 0;
        const maxOverlap = Math.min(existingEnd.length, newStart.length);

        for (let i = 1; i <= maxOverlap; i++) {
            if (existingEnd.slice(-i) === newStart.slice(0, i)) {
                overlap = i;
            }
        }

        if (overlap > 20) {
            Logger.debug(`Found ${overlap} character overlap, removing redundancy`);
            return newContent.slice(overlap);
        }

        return newContent;
    }

    /**
     * Generate with explicit continuation prompt
     */
    async continueFrom(content: string, continuationPrompt: string = ''): Promise<string> {
        const prompt = continuationPrompt || `Continue the following text:

${content.slice(-1000)}

Continue from here:`;

        const result = await this.singleGeneration(prompt);
        const cleaned = this.removeRedundancy(result.text, content);

        return content + cleaned;
    }

    /**
     * Complete incomplete code blocks
     */
    async completeCodeBlocks(content: string): Promise<string> {
        const codeBlockPattern = /```(\w*)\n([\s\S]*?)$/g;
        const matches = Array.from(content.matchAll(codeBlockPattern));

        if (matches.length === 0) {
            return content;
        }

        let completed = content;

        for (const match of matches) {
            const language = match[1] || '';
            const blockStart = match[0];
            const prompt = `Complete this incomplete ${language || 'code'} block:

${blockStart}

Complete the code block:`;

            try {
                const completion = await this.singleGeneration(prompt);
                // Extract just the code block part
                const codeCompletion = this.extractCodeBlock(completion.text);
                if (codeCompletion) {
                    completed = completed.slice(0, -blockStart.length) + blockStart + codeCompletion + '\n```';
                }
            } catch (error) {
                Logger.warn('Failed to complete code block:', error);
            }
        }

        return completed;
    }

    /**
     * Extract code block from markdown
     */
    private extractCodeBlock(text: string): string | null {
        const match = text.match(/```[\w]*\n([\s\S]*?)\n```/);
        return match ? match[1] : null;
    }

    /**
     * Smart continuation that detects and fixes various truncation patterns
     */
    async smartContinue(content: string, maxAttempts: number = 3): Promise<string> {
        let result = content;
        let attempts = 0;

        while (attempts < maxAttempts) {
            const issues = this.detectIssues(result);

            if (issues.length === 0) {
                break;
            }

            Logger.debug(`Smart continuation attempt ${attempts + 1}: fixing ${issues.join(', ')}`);

            for (const issue of issues) {
                switch (issue) {
                    case 'unclosed_code_block':
                        result = await this.completeCodeBlocks(result);
                        break;
                    case 'incomplete_sentence':
                        result = await this.continueFrom(result, 'Complete the last sentence:');
                        break;
                    case 'unclosed_bracket':
                        result = await this.continueFrom(result, 'Complete the code (close brackets/braces):');
                        break;
                    default:
                        result = await this.continueFrom(result);
                }
            }

            attempts++;
        }

        return result;
    }

    /**
     * Detect various issues with content
     */
    private detectIssues(content: string): string[] {
        const issues: string[] = [];

        // Check for unclosed code blocks
        const codeBlocks = (content.match(/```/g) || []).length;
        if (codeBlocks % 2 !== 0) {
            issues.push('unclosed_code_block');
        }

        // Check for unclosed brackets
        const openBraces = (content.match(/\{/g) || []).length;
        const closeBraces = (content.match(/\}/g) || []).length;
        if (openBraces !== closeBraces) {
            issues.push('unclosed_bracket');
        }

        const openBrackets = (content.match(/\[/g) || []).length;
        const closeBrackets = (content.match(/\]/g) || []).length;
        if (openBrackets !== closeBrackets) {
            issues.push('unclosed_bracket');
        }

        // Check for incomplete sentence
        if (content.trim() && !/[.!?]$/.test(content.trim())) {
            issues.push('incomplete_sentence');
        }

        return issues;
    }

    /**
     * Get continuation statistics
     */
    getStats(result: ContinuationResult): {
        averageChunkSize: number;
        totalContinuations: number;
        estimatedTokens: number;
    } {
        return {
            averageChunkSize: result.metadata.chunks.length > 0
                ? result.metadata.totalTokens / result.metadata.chunks.length
                : 0,
            totalContinuations: result.continuations,
            estimatedTokens: Math.ceil(result.metadata.totalTokens / 4)
        };
    }
}
