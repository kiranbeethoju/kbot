/**
 * Retrieval Module
 * Handles semantic search and retrieval of relevant context
 */

import { ContextManager } from './contextManager';
import { MemoryStore, MemoryItem } from './memoryStore';
import { Logger } from '../logger';

export interface RetrievalOptions {
    maxTokens?: number;
    minRelevance?: number;
    includeRecent?: number;
    contextBoost?: boolean; // Boost relevance based on file context
}

export interface RetrievedContext {
    content: string;
    sources: Array<{
        type: string;
        id: string;
        relevance: number;
        preview: string;
    }>;
    totalTokens: number;
}

export class Retrieval {
    constructor(
        private contextManager: ContextManager,
        private memoryStore: MemoryStore
    ) {}

    /**
     * Retrieve relevant context for a query
     */
    async retrieveForQuery(
        query: string,
        fileContext: string[] = [],
        options: RetrievalOptions = {}
    ): Promise<RetrievedContext> {
        const {
            maxTokens = 4000,
            minRelevance = 0.3,
            includeRecent = 2,
            contextBoost = true
        } = options;

        Logger.debug(`Retrieving context for query: "${query.substring(0, 50)}..."`);

        // Search for semantically similar memories
        const semanticResults = this.memoryStore.search(query, {
            limit: 10,
            minSimilarity: minRelevance
        });

        // Get recent messages for continuity
        const recentMemories = this.memoryStore.getRecent(includeRecent, 'conversation');

        // Combine and deduplicate
        const allMemories = this.deduplicateMemories([
            ...semanticResults,
            ...recentMemories
        ]);

        // Filter by file context if specified
        let filteredMemories = allMemories;
        if (contextBoost && fileContext.length > 0) {
            filteredMemories = allMemories.map(memory => ({
                ...memory,
                similarity: this.calculateContextBoost(memory, fileContext)
            })).sort((a, b) => b.similarity - a.similarity);
        }

        // Build context within token limit
        return this.buildContext(filteredMemories, maxTokens);
    }

    /**
     * Get relevant error fixes for a query
     */
    getErrorFixes(query: string, limit: number = 3): RetrievedContext {
        const errorFixes = this.memoryStore.search(query, {
            limit,
            minSimilarity: 0.2,
            typeFilter: ['error_fix']
        });

        const content = this.formatMemories(errorFixes);
        const totalTokens = this.contextManager.estimateTokens(content);

        return {
            content,
            sources: errorFixes.map(m => ({
                type: m.metadata.type,
                id: m.id,
                relevance: m.similarity,
                preview: m.content.slice(0, 100) + '...'
            })),
            totalTokens
        };
    }

    /**
     * Get relevant code decisions for a query
     */
    getCodeDecisions(query: string, fileContext: string[] = [], limit: number = 5): RetrievedContext {
        const decisions = this.memoryStore.search(query, {
            limit,
            minSimilarity: 0.2,
            typeFilter: ['code_decision']
        });

        // Boost relevance based on file context
        const boosted = decisions.map(d => ({
            ...d,
            similarity: this.calculateContextBoost(d, fileContext)
        })).sort((a, b) => b.similarity - a.similarity);

        const content = this.formatMemories(boosted);
        const totalTokens = this.contextManager.estimateTokens(content);

        return {
            content,
            sources: boosted.map(m => ({
                type: m.metadata.type,
                id: m.id,
                relevance: m.similarity,
                preview: m.content.slice(0, 100) + '...'
            })),
            totalTokens
        };
    }

    /**
     * Get conversation history summary
     */
    getConversationSummary(tokenLimit: number = 2000): RetrievedContext {
        const recent = this.memoryStore.getRecent(20, 'conversation');
        const content = this.formatMemories(recent);
        const totalTokens = this.contextManager.estimateTokens(content);

        let finalContent = content;
        if (totalTokens > tokenLimit) {
            // Truncate to fit
            const ratio = tokenLimit / totalTokens;
            finalContent = this.smartTruncate(content, ratio);
        }

        return {
            content: finalContent,
            sources: recent.map(m => ({
                type: m.metadata.type,
                id: m.id,
                relevance: 1.0,
                preview: m.content.slice(0, 100) + '...'
            })),
            totalTokens: this.contextManager.estimateTokens(finalContent)
        };
    }

    /**
     * Build context from memories while respecting token limit
     */
    private buildContext(memories: Array<MemoryItem & { similarity?: number }>, maxTokens: number): RetrievedContext {
        const sources: RetrievedContext['sources'] = [];
        const parts: string[] = [];
        let usedTokens = 0;

        for (const memory of memories) {
            const memoryTokens = this.contextManager.estimateTokens(memory.content);
            const preview = memory.content.slice(0, 100) + '...';

            if (usedTokens + memoryTokens > maxTokens) {
                // Try to add a truncated version
                const remaining = maxTokens - usedTokens;
                if (remaining > 100) {
                    const truncated = this.truncateToTokens(memory.content, remaining);
                    parts.push(`[${memory.metadata.type}] ${truncated}`);
                    sources.push({
                        type: memory.metadata.type,
                        id: memory.id,
                        relevance: memory.similarity || 0.5,
                        preview
                    });
                }
                break;
            }

            parts.push(`[${memory.metadata.type}] ${memory.content}`);
            sources.push({
                type: memory.metadata.type,
                id: memory.id,
                relevance: memory.similarity || 0.5,
                preview
            });
            usedTokens += memoryTokens;
        }

        const content = parts.length > 0 ? parts.join('\n\n') : 'No relevant context found.';

        return {
            content,
            sources,
            totalTokens: usedTokens
        };
    }

    /**
     * Calculate context boost based on file overlap
     */
    private calculateContextBoost(memory: MemoryItem & { similarity?: number }, fileContext: string[]): number {
        let boost = 1.0;
        const baseSimilarity = memory.similarity || 0.5;

        if (!memory.metadata.fileContext || memory.metadata.fileContext.length === 0) {
            return baseSimilarity;
        }

        // Check for file overlap
        const overlap = memory.metadata.fileContext.filter(f =>
            fileContext.some(fc => fc.includes(f) || f.includes(fc))
        ).length;

        if (overlap > 0) {
            boost = 1 + (overlap * 0.2); // 20% boost per overlapping file
        }

        return Math.min(1.0, baseSimilarity * boost);
    }

    /**
     * Format memories into readable text
     */
    private formatMemories(memories: Array<MemoryItem & { similarity?: number }>): string {
        return memories.map(m => {
            const timestamp = new Date(m.metadata.timestamp).toLocaleTimeString();
            const relevance = m.similarity ? ` (relevance: ${m.similarity.toFixed(2)})` : '';
            return `[${timestamp} - ${m.metadata.type}${relevance}]\n${m.content}`;
        }).join('\n\n---\n\n');
    }

    /**
     * Truncate text to fit within token limit
     */
    private truncateToTokens(text: string, maxTokens: number): string {
        const approxChars = maxTokens * 4;
        if (text.length <= approxChars) {
            return text;
        }
        return text.slice(0, approxChars) + '...';
    }

    /**
     * Smart truncation keeping beginning and end
     */
    private smartTruncate(text: string, ratio: number): string {
        const targetLength = Math.floor(text.length * ratio);
        const keepStart = Math.floor(targetLength * 0.6);
        const keepEnd = Math.floor(targetLength * 0.4);

        const start = text.slice(0, keepStart);
        const end = text.slice(-keepEnd);

        return `${start}\n\n[... content omitted ...]\n\n${end}`;
    }

    /**
     * Remove duplicate memories
     */
    private deduplicateMemories(memories: Array<MemoryItem & { similarity?: number }>): Array<MemoryItem & { similarity?: number }> {
        const seen = new Set<string>();
        const result: Array<MemoryItem & { similarity?: number }> = [];

        for (const memory of memories) {
            const key = `${memory.metadata.type}_${memory.content.slice(0, 50)}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push(memory);
            }
        }

        return result;
    }

    /**
     * Get contextual hints for query understanding
     */
    getQueryContext(query: string): {
        hasErrorReference: boolean;
        hasFileReference: boolean;
        hasCodeReference: boolean;
        likelyIntent: string;
    } {
        const hasErrorReference = /error|exception|bug|fix|issue|fail/i.test(query);
        const hasFileReference = /file|document|code|source/i.test(query);
        const hasCodeReference = /function|class|variable|import|export/i.test(query);

        let likelyIntent = 'general';
        if (hasErrorReference) likelyIntent = 'error_fix';
        else if (hasFileReference) likelyIntent = 'code_explanation';
        else if (hasCodeReference) likelyIntent = 'code_understanding';

        return {
            hasErrorReference,
            hasFileReference,
            hasCodeReference,
            likelyIntent
        };
    }
}
