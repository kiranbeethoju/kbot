/**
 * Multi-Pass Generation Engine
 * Improves output quality through iterative refinement
 */

import { ChatMessage } from '../types';
import { Logger } from '../logger';

export interface MultiPassOptions {
    enabled?: boolean;
    passes?: number;
    refinementPrompt?: string;
    validationEnabled?: boolean;
}

export interface GenerationResult {
    content: string;
    passes: number;
    improvements: string[];
    metadata: {
        draftTokens: number;
        finalTokens: number;
        timeTaken: number;
    };
}

/**
 * Provider service interface for multi-pass generation
 */
export interface GenerationProvider {
    chatCompletion(messages: ChatMessage[], onProgress?: (delta: string) => void, signal?: AbortSignal): Promise<string>;
}

export class MultiPassEngine {
    constructor(private provider: GenerationProvider) {}

    /**
     * Generate with multi-pass refinement
     */
    async generateWithRefinement(
        prompt: string,
        options: MultiPassOptions = {}
    ): Promise<GenerationResult> {
        const {
            enabled = true,
            passes = 2,
            refinementPrompt = 'Refine and improve the following response for clarity, accuracy, and completeness:',
            validationEnabled = false
        } = options;

        const startTime = Date.now();
        const improvements: string[] = [];

        if (!enabled || passes < 2) {
            // Single-pass generation
            const content = await this.singlePass(prompt);
            return {
                content,
                passes: 1,
                improvements,
                metadata: {
                    draftTokens: this.estimateTokens(content),
                    finalTokens: this.estimateTokens(content),
                    timeTaken: Date.now() - startTime
                }
            };
        }

        Logger.debug(`Starting multi-pass generation with ${passes} passes`);

        // Pass 1: Initial draft
        Logger.debug('Pass 1: Generating initial draft');
        let currentContent = await this.singlePass(prompt);
        const draftTokens = this.estimateTokens(currentContent);
        improvements.push('Initial draft generated');

        // Pass 2+: Refinement
        for (let i = 2; i <= passes; i++) {
            Logger.debug(`Pass ${i}: Refining output`);

            const refinementPrompt = this.buildRefinementPrompt(
                currentContent,
                i,
                passes,
                refinementPrompt
            );

            try {
                const refined = await this.singlePass(refinementPrompt);

                // Check if refinement actually improved things
                if (refined.length > currentContent.length * 0.8) {
                    currentContent = refined;
                    improvements.push(`Pass ${i} refined for clarity and completeness`);
                } else {
                    improvements.push(`Pass ${i} skipped (refinement too short)`);
                }
            } catch (error) {
                Logger.warn(`Pass ${i} failed, using previous output:`, error);
                improvements.push(`Pass ${i} failed, using previous output`);
            }
        }

        // Optional validation pass
        if (validationEnabled) {
            Logger.debug('Validation pass: Checking for issues');
            const validated = await this.validateAndFix(currentContent);
            if (validated !== currentContent) {
                currentContent = validated;
                improvements.push('Validation fixes applied');
            }
        }

        return {
            content: currentContent,
            passes,
            improvements,
            metadata: {
                draftTokens,
                finalTokens: this.estimateTokens(currentContent),
                timeTaken: Date.now() - startTime
            }
        };
    }

    /**
     * Single-pass generation
     */
    private async singlePass(prompt: string): Promise<string> {
        return this.provider.chatCompletion([
            {
                role: 'system',
                content: 'You are an expert AI assistant. Provide clear, accurate, and well-structured responses.'
            },
            {
                role: 'user',
                content: prompt
            }
        ]);
    }

    /**
     * Build refinement prompt for each pass
     */
    private buildRefinementPrompt(
        currentContent: string,
        currentPass: number,
        totalPasses: number,
        basePrompt: string
    ): string {
        let instructions = basePrompt;

        // Adjust instructions based on pass number
        if (currentPass === 2) {
            instructions += '\n\nFocus on:\n- Clarity and structure\n- Completeness of the response\n- Proper formatting';
        } else if (currentPass === totalPasses) {
            instructions += '\n\nFinal polish:\n- Ensure all points are addressed\n- Check for consistency\n- Optimize for readability';
        } else {
            instructions += '\n\nContinue improving:\n- Add missing details\n- Enhance explanations\n- Improve organization';
        }

        return `${instructions}\n\nOriginal response:\n${currentContent}\n\nRefined response:`;
    }

    /**
     * Validate and fix common issues
     */
    private async validateAndFix(content: string): Promise<string> {
        const validationPrompt = `Review the following content for:
1. Incomplete sentences or thoughts
2. Missing code blocks or formatting
3. Contradictions or inconsistencies
4. Truncated output

If issues are found, return the corrected version. If no issues, return the original content unchanged.

Content to validate:
${content}

Validated content:`;

        try {
            const validated = await this.singlePass(validationPrompt);
            // Only use if it's similar in length (not a complete rewrite)
            if (validated.length >= content.length * 0.8) {
                return validated;
            }
        } catch (error) {
            Logger.warn('Validation failed, returning original:', error);
        }

        return content;
    }

    /**
     * Generate with specific focus areas
     */
    async generateWithFocus(
        prompt: string,
        focusAreas: string[]
    ): Promise<GenerationResult> {
        const startTime = Date.now();
        const improvements: string[] = [];

        // Initial generation
        let content = await this.singlePass(prompt);
        improvements.push('Initial draft generated');

        // Refine for each focus area
        for (const focus of focusAreas) {
            const focusPrompt = `Improve the following response focusing on: ${focus}

Original response:
${content}

Improved response:`;

            try {
                content = await this.singlePass(focusPrompt);
                improvements.push(`Refined for ${focus}`);
            } catch (error) {
                Logger.warn(`Focus refinement failed for ${focus}:`, error);
            }
        }

        return {
            content,
            passes: 1 + focusAreas.length,
            improvements,
            metadata: {
                draftTokens: this.estimateTokens(prompt),
                finalTokens: this.estimateTokens(content),
                timeTaken: Date.now() - startTime
            }
        };
    }

    /**
     * Generate with iterative improvement based on feedback
     */
    async generateWithFeedback(
        prompt: string,
        feedbackFn: (content: string) => Promise<string>
    ): Promise<GenerationResult> {
        const startTime = Date.now();
        const improvements: string[] = [];
        const maxIterations = 3;

        let content = await this.singlePass(prompt);
        improvements.push('Initial draft generated');

        for (let i = 0; i < maxIterations; i++) {
            try {
                const feedback = await feedbackFn(content);

                if (feedback.toLowerCase().includes('good') ||
                    feedback.toLowerCase().includes('excellent') ||
                    feedback.toLowerCase().includes('no changes')) {
                    improvements.push(`Iteration ${i + 1}: Output approved`);
                    break;
                }

                content = await this.singlePass(
                    `Improve the following based on this feedback:\n${feedback}\n\nOriginal:\n${content}\n\nImproved:`
                );
                improvements.push(`Iteration ${i + 1}: Applied feedback`);
            } catch (error) {
                Logger.warn(`Feedback iteration ${i + 1} failed:`, error);
                break;
            }
        }

        return {
            content,
            passes: 1 + improvements.length - 1,
            improvements,
            metadata: {
                draftTokens: this.estimateTokens(prompt),
                finalTokens: this.estimateTokens(content),
                timeTaken: Date.now() - startTime
            }
        };
    }

    /**
     * Simple token estimation
     */
    private estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Get quality metrics for generated content
     */
    analyzeQuality(content: string): {
        hasCodeBlocks: boolean;
        hasStructure: boolean;
        averageLineLength: number;
        completeness: number;
    } {
        const lines = content.split('\n');
        const hasCodeBlocks = /```/.test(content);
        const hasStructure = /^(#{1,6}|-|\*|\d+\.)\s/m.test(content);
        const averageLineLength = content.length / lines.length;

        // Simple completeness heuristic
        let completeness = 0.5;
        if (hasCodeBlocks) completeness += 0.2;
        if (hasStructure) completeness += 0.2;
        if (content.length > 500) completeness += 0.1;

        return {
            hasCodeBlocks,
            hasStructure,
            averageLineLength,
            completeness: Math.min(1, completeness)
        };
    }
}
