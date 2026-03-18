/**
 * Smart Chunker
 * Intelligently chunks text while preserving code structure and logical boundaries
 */

import { ContextManager } from './contextManager';
import { Logger } from '../logger';

export interface ChunkOptions {
    maxTokens: number;
    overlap?: number; // Overlap between chunks (in tokens)
    preserveStructure?: boolean; // Try to keep code blocks intact
}

export interface TextChunk {
    content: string;
    tokenCount: number;
    startIndex: number;
    endIndex: number;
    metadata?: {
        language?: string;
        containsCodeBlock?: boolean;
        isFunction?: boolean;
        isClass?: boolean;
    };
}

/**
 * Code structure patterns for intelligent splitting
 */
const CODE_PATTERNS = {
    // Language-specific block delimiters
    functionStart: /^\s*(function|def|func|class|interface|type)\s+/m,
    blockStart: /^\s*(if|for|while|switch|try|case)\s+/m,
    blockEnd: /^\s*(}\]|end|fi|done)\s*$/m,

    // Markdown/code fence boundaries
    codeFence: /```[\w]*\n?/g,

    // Section headers
    sectionHeader: /^#{1,6}\s+/m,
};

export class Chunker {
    constructor(private contextManager: ContextManager) {}

    /**
     * Chunk text into manageable pieces
     */
    chunkText(text: string, options: ChunkOptions): TextChunk[] {
        const {
            maxTokens,
            overlap = 0,
            preserveStructure = true
        } = options;

        Logger.debug(`Chunking text with maxTokens: ${maxTokens}, overlap: ${overlap}`);

        // If text is small enough, return as single chunk
        if (this.contextManager.fitsInContext(text, 'gpt-4o')) {
            const tokens = this.contextManager.estimateTokens(text);
            return [{
                content: text,
                tokenCount: tokens,
                startIndex: 0,
                endIndex: text.length
            }];
        }

        // Use structure-preserving chunking if enabled
        if (preserveStructure && this.looksLikeCode(text)) {
            return this.chunkByStructure(text, maxTokens, overlap);
        }

        // Fall back to simple chunking
        return this.chunkSimple(text, maxTokens, overlap);
    }

    /**
     * Check if text looks like code
     */
    private looksLikeCode(text: string): boolean {
        const codeIndicators = [
            /function\s+\w+\s*\(/,
            /def\s+\w+\s*\(/,
            /class\s+\w+/,
            /import\s+/,
            /from\s+.*\s+import/,
            /\/\/.*|\/\*[\s\S]*?\*\//, // Comments
            /#.*$/m, // Python comments
            /=>\s*{/, // Arrow functions
            /^\s*(public|private|protected)\s+/m,
        ];

        const matchCount = codeIndicators.reduce((count, pattern) => {
            return count + (pattern.test(text) ? 1 : 0);
        }, 0);

        return matchCount >= 2;
    }

    /**
     * Chunk by code structure (functions, classes, etc.)
     */
    private chunkByStructure(text: string, maxTokens: number, overlap: number): TextChunk[] {
        const chunks: TextChunk[] = [];
        const lines = text.split('\n');
        let currentChunk: string[] = [];
        let currentTokens = 0;
        let chunkStartIndex = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineTokens = this.contextManager.estimateTokens(line);
            const wouldExceed = currentTokens + lineTokens > maxTokens;

            // Check for natural break points
            const isNaturalBreak = this.isNaturalBreakPoint(line);
            const isStartOfBlock = this.isStartOfBlock(line);

            // If we should start a new chunk
            if (wouldExceed && isNaturalBreak && currentChunk.length > 0) {
                // Save current chunk
                const chunkContent = currentChunk.join('\n');
                chunks.push({
                    content: chunkContent,
                    tokenCount: currentTokens,
                    startIndex: chunkStartIndex,
                    endIndex: chunkStartIndex + chunkContent.length,
                    metadata: this.analyzeChunkMetadata(chunkContent)
                });

                // Start new chunk with overlap if specified
                if (overlap > 0) {
                    const overlapLines = this.getOverlapLines(currentChunk, overlap);
                    currentChunk = [...overlapLines, line];
                    currentTokens = this.contextManager.estimateTokens(currentChunk.join('\n'));
                } else {
                    currentChunk = [line];
                    currentTokens = lineTokens;
                }
                chunkStartIndex = i - (overlap > 0 ? this.getOverlapLineCount(currentChunk, overlap) : 0);
            } else {
                currentChunk.push(line);
                currentTokens += lineTokens;
            }
        }

        // Add final chunk
        if (currentChunk.length > 0) {
            const chunkContent = currentChunk.join('\n');
            chunks.push({
                content: chunkContent,
                tokenCount: currentTokens,
                startIndex: chunkStartIndex,
                endIndex: chunkStartIndex + chunkContent.length,
                metadata: this.analyzeChunkMetadata(chunkContent)
            });
        }

        Logger.debug(`Created ${chunks.length} structure-aware chunks`);
        return chunks;
    }

    /**
     * Simple chunking by character count
     */
    private chunkSimple(text: string, maxTokens: number, overlap: number): TextChunk[] {
        const chunks: TextChunk[] = [];
        const approxChars = maxTokens * 4; // Approximate 4 chars per token
        const overlapChars = Math.floor(overlap * 4);

        for (let i = 0; i < text.length; i += approxChars - overlapChars) {
            const end = Math.min(i + approxChars, text.length);
            const content = text.slice(i, end);

            chunks.push({
                content,
                tokenCount: this.contextManager.estimateTokens(content),
                startIndex: i,
                endIndex: end
            });
        }

        Logger.debug(`Created ${chunks.length} simple chunks`);
        return chunks;
    }

    /**
     * Check if line is a natural break point
     */
    private isNaturalBreakPoint(line: string): boolean {
        return (
            CODE_PATTERNS.blockEnd.test(line) ||
            CODE_PATTERNS.functionStart.test(line) ||
            CODE_PATTERNS.sectionHeader.test(line) ||
            line.trim() === '' // Empty line
        );
    }

    /**
     * Check if line starts a code block
     */
    private isStartOfBlock(line: string): boolean {
        return (
            CODE_PATTERNS.functionStart.test(line) ||
            CODE_PATTERNS.blockStart.test(line) ||
            CODE_PATTERNS.sectionHeader.test(line)
        );
    }

    /**
     * Get overlap lines from previous chunk
     */
    private getOverlapLines(lines: string[], overlapTokens: number): string[] {
        const result: string[] = [];
        let tokens = 0;

        for (let i = lines.length - 1; i >= 0; i--) {
            const lineTokens = this.contextManager.estimateTokens(lines[i]);
            if (tokens + lineTokens > overlapTokens) break;
            result.unshift(lines[i]);
            tokens += lineTokens;
        }

        return result;
    }

    /**
     * Get count of lines to use for overlap
     */
    private getOverlapLineCount(lines: string[], overlapTokens: number): number {
        let tokens = 0;
        for (let i = lines.length - 1; i >= 0; i--) {
            tokens += this.contextManager.estimateTokens(lines[i]);
            if (tokens > overlapTokens) return lines.length - i - 1;
        }
        return lines.length;
    }

    /**
     * Analyze chunk for metadata
     */
    private analyzeChunkMetadata(content: string): TextChunk['metadata'] {
        const metadata: TextChunk['metadata'] = {};

        // Detect language
        const languageMatch = content.match(/```(\w+)/);
        if (languageMatch) {
            metadata.language = languageMatch[1];
        } else if (content.includes('function ') || content.includes('=>')) {
            metadata.language = 'javascript';
        } else if (content.includes('def ')) {
            metadata.language = 'python';
        }

        // Detect code blocks
        metadata.containsCodeBlock = CODE_PATTERNS.codeFence.test(content);

        // Detect functions
        metadata.isFunction = CODE_PATTERNS.functionStart.test(content);

        // Detect classes
        metadata.isClass = /^\s*class\s+\w+/.test(content);

        return metadata;
    }

    /**
     * Merge chunks intelligently
     */
    mergeChunks(chunks: TextChunk[], maxTokens: number): string {
        if (chunks.length === 0) return '';
        if (chunks.length === 1) return chunks[0].content;

        // Merge with overlap consideration
        let result = chunks[0].content;
        let currentTokens = chunks[0].tokenCount;

        for (let i = 1; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (currentTokens + chunk.tokenCount <= maxTokens) {
                result += '\n\n' + chunk.content;
                currentTokens += chunk.tokenCount;
            } else {
                // Add truncated version
                const remainingTokens = maxTokens - currentTokens;
                const remainingChars = Math.floor(remainingTokens * 3.5);
                result += '\n\n' + chunk.content.slice(0, remainingChars) + '...';
                break;
            }
        }

        return result;
    }
}
