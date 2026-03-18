/**
 * Memory Store
 * Stores and retrieves conversation history using semantic embeddings
 */

import { Logger } from '../logger';

export interface MemoryItem {
    id: string;
    content: string;
    embedding?: number[];
    metadata: {
        timestamp: number;
        type: 'conversation' | 'code_decision' | 'error_fix' | 'summary' | 'context';
        fileContext?: string[];
        relatedMessages?: string[];
        importance?: number; // 0-1 score
    };
}

export interface SearchOptions {
    limit?: number;
    minSimilarity?: number;
    typeFilter?: MemoryItem['metadata']['type'][];
    timeWindow?: {
        start: number;
        end: number;
    };
}

export interface SearchResult extends MemoryItem {
    similarity: number;
}

/**
 * Simple embedding generator using TF-IDF-like approach
 * In production, you'd use a proper embedding model
 */
export class SimpleEmbedder {
    private vocabulary: Map<string, number> = new Map();
    private documentCount = 0;

    /**
     * Generate a simple embedding from text
     * Uses word frequency and character n-grams
     */
    generateEmbedding(text: string): number[] {
        const words = this.tokenize(text);
        const dimension = 384; // Typical embedding dimension
        const embedding = new Array(dimension).fill(0);

        // Simple hash-based embedding
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const hash = this.hashString(word);
            const index = Math.abs(hash) % dimension;
            embedding[index] += 1 / (i + 1); // Position weighting
        }

        // Normalize
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        if (magnitude > 0) {
            for (let i = 0; i < embedding.length; i++) {
                embedding[i] /= magnitude;
            }
        }

        return embedding;
    }

    /**
     * Simple tokenization
     */
    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2);
    }

    /**
     * Simple string hash
     */
    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }
}

export class MemoryStore {
    private memories: Map<string, MemoryItem> = new Map();
    private embedder: SimpleEmbedder;
    private maxMemories = 1000; // Prevent unbounded growth

    constructor() {
        this.embedder = new SimpleEmbedder();
    }

    /**
     * Add a memory item
     */
    addMemory(content: string, metadata: MemoryItem['metadata']): string {
        const id = this.generateId();

        // Generate embedding for the content
        const embedding = this.embedder.generateEmbedding(content);

        const memory: MemoryItem = {
            id,
            content,
            embedding,
            metadata: {
                ...metadata,
                timestamp: metadata.timestamp || Date.now()
            }
        };

        this.memories.set(id, memory);

        // Enforce max memory limit
        if (this.memories.size > this.maxMemories) {
            this.evictOldest();
        }

        Logger.debug(`Added memory ${id}: ${metadata.type}`);
        return id;
    }

    /**
     * Store conversation message
     */
    storeMessage(
        role: string,
        content: string,
        fileContext?: string[]
    ): string {
        return this.addMemory(content, {
            type: 'conversation',
            timestamp: Date.now(),
            fileContext,
            importance: 0.5
        });
    }

    /**
     * Store code decision
     */
    storeCodeDecision(
        decision: string,
        reasoning: string,
        fileContext?: string[]
    ): string {
        const content = `Decision: ${decision}\nReasoning: ${reasoning}`;
        return this.addMemory(content, {
            type: 'code_decision',
            timestamp: Date.now(),
            fileContext,
            importance: 0.8
        });
    }

    /**
     * Store error fix
     */
    storeErrorFix(
        error: string,
        solution: string,
        fileContext?: string[]
    ): string {
        const content = `Error: ${error}\nSolution: ${solution}`;
        return this.addMemory(content, {
            type: 'error_fix',
            timestamp: Date.now(),
            fileContext,
            importance: 0.9 // High importance
        });
    }

    /**
     * Store summary
     */
    storeSummary(
        summary: string,
        originalLength: number,
        fileContext?: string[]
    ): string {
        return this.addMemory(summary, {
            type: 'summary',
            timestamp: Date.now(),
            fileContext,
            importance: Math.min(1, originalLength / 10000)
        });
    }

    /**
     * Semantic search for relevant memories
     */
    search(query: string, options: SearchOptions = {}): SearchResult[] {
        const {
            limit = 5,
            minSimilarity = 0.3,
            typeFilter,
            timeWindow
        } = options;

        const queryEmbedding = this.embedder.generateEmbedding(query);
        const results: SearchResult[] = [];

        for (const memory of this.memories.values()) {
            // Apply filters
            if (typeFilter && !typeFilter.includes(memory.metadata.type)) {
                continue;
            }

            if (timeWindow) {
                if (memory.metadata.timestamp < timeWindow.start ||
                    memory.metadata.timestamp > timeWindow.end) {
                    continue;
                }
            }

            // Calculate similarity
            const similarity = this.cosineSimilarity(queryEmbedding, memory.embedding || []);

            if (similarity >= minSimilarity) {
                results.push({
                    ...memory,
                    similarity
                });
            }
        }

        // Sort by similarity and importance
        results.sort((a, b) => {
            const scoreA = a.similarity * (1 + (a.metadata.importance || 0));
            const scoreB = b.similarity * (1 + (b.metadata.importance || 0));
            return scoreB - scoreA;
        });

        return results.slice(0, limit);
    }

    /**
     * Get recent memories
     */
    getRecent(count: number, type?: MemoryItem['metadata']['type']): MemoryItem[] {
        const memories = Array.from(this.memories.values())
            .filter(m => !type || m.metadata.type === type)
            .sort((a, b) => b.metadata.timestamp - a.metadata.timestamp);

        return memories.slice(0, count);
    }

    /**
     * Get memory by ID
     */
    getMemory(id: string): MemoryItem | undefined {
        return this.memories.get(id);
    }

    /**
     * Update memory importance
     */
    updateImportance(id: string, importance: number): void {
        const memory = this.memories.get(id);
        if (memory) {
            memory.metadata.importance = Math.max(0, Math.min(1, importance));
        }
    }

    /**
     * Clear old memories
     */
    clearOlderThan(timestamp: number): void {
        for (const [id, memory] of this.memories.entries()) {
            if (memory.metadata.timestamp < timestamp) {
                this.memories.delete(id);
            }
        }
        Logger.debug(`Cleared memories older than ${new Date(timestamp).toISOString()}`);
    }

    /**
     * Get memory statistics
     */
    getStats(): {
        totalMemories: number;
        byType: Record<string, number>;
        oldestMemory: number | null;
        newestMemory: number | null;
    } {
        const byType: Record<string, number> = {};
        let oldest = null as number | null;
        let newest = null as number | null;

        for (const memory of this.memories.values()) {
            byType[memory.metadata.type] = (byType[memory.metadata.type] || 0) + 1;
            if (oldest === null || memory.metadata.timestamp < oldest) {
                oldest = memory.metadata.timestamp;
            }
            if (newest === null || memory.metadata.timestamp > newest) {
                newest = memory.metadata.timestamp;
            }
        }

        return {
            totalMemories: this.memories.size,
            byType,
            oldestMemory: oldest,
            newestMemory: newest
        };
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    private cosineSimilarity(vec1: number[], vec2: number[]): number {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) {
            return 0;
        }

        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            magnitude1 += vec1[i] * vec1[i];
            magnitude2 += vec2[i] * vec2[i];
        }

        magnitude1 = Math.sqrt(magnitude1);
        magnitude2 = Math.sqrt(magnitude2);

        if (magnitude1 === 0 || magnitude2 === 0) {
            return 0;
        }

        return dotProduct / (magnitude1 * magnitude2);
    }

    /**
     * Generate unique ID
     */
    private generateId(): string {
        return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Evict oldest memory when limit is reached
     */
    private evictOldest(): void {
        let oldest: string | null = null;
        let oldestTime = Infinity;

        for (const [id, memory] of this.memories.entries()) {
            // Prioritize keeping high-importance memories
            const adjustedTime = memory.metadata.timestamp - (memory.metadata.importance || 0) * 86400000;
            if (adjustedTime < oldestTime) {
                oldestTime = adjustedTime;
                oldest = id;
            }
        }

        if (oldest) {
            this.memories.delete(oldest);
            Logger.debug(`Evicted oldest memory: ${oldest}`);
        }
    }

    /**
     * Export memories for persistence
     */
    export(): Array<{ id: string } & Omit<MemoryItem, 'embedding'>> {
        return Array.from(this.memories.values()).map(({ embedding, ...rest }) => rest);
    }

    /**
     * Clear all memories
     */
    clear(): void {
        this.memories.clear();
        Logger.debug('Cleared all memories');
    }
}
