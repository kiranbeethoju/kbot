/**
 * Orchestration Service
 * Main orchestrator that combines all context management features
 */

import { ChatMessage } from '../types';
import { ContextManager } from './contextManager';
import { Chunker, TextChunk } from './chunker';
import { Summarizer, SummarizerOptions, SummaryResult } from './summarizer';
import { MemoryStore } from './memoryStore';
import { Retrieval, RetrievalOptions, RetrievedContext } from './retrieval';
import { MultiPassEngine, MultiPassOptions, GenerationResult } from './multiPassEngine';
import { ContinuationHandler, ContinuationOptions, ContinuationResult } from './continuationHandler';
import { Logger } from '../logger';
import { CodeReviewService, CodeReviewOptions, ReviewResult } from './codeReviewService';

/**
 * Provider interface for all AI operations
 */
export interface AIProvider {
    chatCompletion(messages: ChatMessage[], onProgress?: (delta: string) => void, signal?: AbortSignal): Promise<string>;
}

export interface OrchestrationOptions {
    modelName?: string;
    enableChunking?: boolean;
    enableSummarization?: boolean;
    enableMemory?: boolean;
    enableRetrieval?: boolean;
    enableMultiPass?: boolean;
    enableContinuation?: boolean;
    maxTokens?: number;
    fileContext?: string[];
}

export interface OrchestrationResult {
    content: string;
    metadata: {
        originalTokens: number;
        finalTokens: number;
        processingSteps: ProcessingStep[];
        summarization?: SummaryResult;
        retrieval?: RetrievedContext;
        multiPass?: GenerationResult;
        continuation?: ContinuationResult;
    };
}

export interface ProcessingStep {
    step: string;
    description: string;
    tokensIn: number;
    tokensOut: number;
    duration: number;
}

/**
 * Telemetry data for monitoring and optimization
 */
export interface TelemetryData {
    timestamp: number;
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    processingSteps: string[];
    summarizationTriggered: boolean;
    continuationCount: number;
    memoryHits: number;
    totalDuration: number;
}

export class OrchestrationService {
    private contextManager: ContextManager;
    private chunker: Chunker;
    private summarizer: Summarizer;
    private memoryStore: MemoryStore;
    private retrieval: Retrieval;
    private multiPassEngine: MultiPassEngine;
    private continuationHandler: ContinuationHandler;
    private telemetry: TelemetryData[] = [];

    constructor(private provider: AIProvider) {
        this.contextManager = new ContextManager();
        this.chunker = new Chunker(this.contextManager);
        this.summarizer = new Summarizer(this.contextManager, provider);
        this.memoryStore = new MemoryStore();
        this.retrieval = new Retrieval(this.contextManager, this.memoryStore);
        this.multiPassEngine = new MultiPassEngine(provider);
        this.continuationHandler = new ContinuationHandler(provider);
    }

    /**
     * Main orchestration method - processes prompt with all optimizations
     */
    async intelligentGenerate(
        prompt: string,
        context: string = '',
        options: OrchestrationOptions = {}
    ): Promise<OrchestrationResult> {
        const startTime = Date.now();
        const processingSteps: ProcessingStep[] = [];

        const {
            modelName = 'gpt-4o',
            enableChunking = true,
            enableSummarization = true,
            enableMemory = true,
            enableRetrieval = true,
            enableMultiPass = false, // Disabled by default for speed
            enableContinuation = true,
            fileContext = []
        } = options;

        Logger.log(`🚀 Starting intelligent generation with model: ${modelName}`);
        Logger.log(`   Options: chunking=${enableChunking}, summarization=${enableSummarization}, memory=${enableMemory}, retrieval=${enableRetrieval}, multiPass=${enableMultiPass}, continuation=${enableContinuation}`);

        // Track original token count
        const originalTokens = this.contextManager.estimateTokens(prompt + context);
        Logger.log(`📊 Original token count: ${originalTokens} (prompt: ${this.contextManager.estimateTokens(prompt)}, context: ${this.contextManager.estimateTokens(context)})`);

        let workingPrompt = prompt;
        let workingContext = context;

        // Step 1: Check if context fits, chunk/summarize if needed
        const contextStep = await this.processContext(workingContext, modelName, {
            enableChunking,
            enableSummarization
        });
        processingSteps.push(contextStep);
        workingContext = contextStep.output;

        // Step 2: Retrieve relevant memory
        let retrievalResult: RetrievedContext | undefined;
        if (enableRetrieval) {
            const retrievalStep = await this.performRetrieval(workingPrompt, fileContext);
            processingSteps.push(retrievalStep);
            retrievalResult = retrievalStep.result;
            if (retrievalResult) {
                workingContext += '\n\n' + retrievalResult.content;
            }
        }

        // Step 3: Build final prompt
        const finalPrompt = this.buildFinalPrompt(workingPrompt, workingContext);

        // Step 4: Generate (with multi-pass if enabled)
        let generationResult: GenerationResult | undefined;
        if (enableMultiPass) {
            const multiPassStep = await this.performMultiPass(finalPrompt);
            processingSteps.push(multiPassStep);
            generationResult = multiPassStep.result;
        } else {
            const simpleStep = await this.performSimpleGeneration(finalPrompt);
            processingSteps.push(simpleStep);
        }

        let content = generationResult?.content || processingSteps[processingSteps.length - 1].output;

        // Step 5: Handle continuation if needed
        let continuationResult: ContinuationResult | undefined;
        if (enableContinuation) {
            const continuationStep = await this.performContinuation(content);
            processingSteps.push(continuationStep);
            continuationResult = continuationStep.result;
            if (continuationResult) {
                content = continuationResult.content;
            }
        }

        // Step 6: Store in memory
        if (enableMemory) {
            this.storeInteraction(prompt, content, fileContext);
        }

        const finalTokens = this.contextManager.estimateTokens(content);
        const totalDuration = Date.now() - startTime;

        // Collect telemetry
        this.collectTelemetry({
            timestamp: Date.now(),
            modelName,
            inputTokens: originalTokens,
            outputTokens: finalTokens,
            processingSteps: processingSteps.map(s => s.step),
            summarizationTriggered: !!processingSteps.find(s => s.step === 'summarization'),
            continuationCount: continuationResult?.continuations || 0,
            memoryHits: retrievalResult?.sources.length || 0,
            totalDuration
        });

        Logger.debug(`Intelligent generation complete. ${originalTokens} -> ${finalTokens} tokens in ${totalDuration}ms`);

        return {
            content,
            metadata: {
                originalTokens,
                finalTokens,
                processingSteps,
                summarization: processingSteps.find(s => s.step === 'summarization')?.result as SummaryResult,
                retrieval: retrievalResult,
                multiPass: generationResult,
                continuation: continuationResult
            }
        };
    }

    /**
     * Process context (chunk/summarize if needed)
     */
    private async processContext(
        context: string,
        modelName: string,
        options: { enableChunking: boolean; enableSummarization: boolean }
    ): Promise<ProcessingStep & { result?: SummaryResult }> {
        const startTime = Date.now();
        const tokensIn = this.contextManager.estimateTokens(context);

        Logger.log(`🔍 Context Check: ${tokensIn} tokens (model: ${modelName})`);

        // Check if context fits
        if (this.contextManager.fitsInContext(context, modelName)) {
            Logger.log(`   ✅ Context fits within model limit`);
            return {
                step: 'context_check',
                description: 'Context fits within model limit',
                tokensIn,
                tokensOut: tokensIn,
                duration: Date.now() - startTime,
                output: context
            };
        }

        // Need to reduce context
        let output = context;
        let result: SummaryResult | undefined;

        if (options.enableSummarization) {
            Logger.log(`   ⚠️  Context too large, applying hierarchical summarization...`);
            result = await this.summarizer.hierarchicalSummarize(context, {
                targetTokens: this.contextManager.getSafeChunkSize(modelName),
                preserveKeyPoints: true,
                modelName
            });
            output = result.summary;
            Logger.log(`   ✅ Summarized: ${tokensIn} → ${result.summaryTokens} tokens (${result.compressionRatio.toFixed(2)}x compression, ${result.levels} levels)`);
        } else if (options.enableChunking) {
            Logger.log(`   ⚠️  Context too large, applying smart chunking...`);
            const chunks = this.chunker.chunkText(context, {
                maxTokens: this.contextManager.getSafeChunkSize(modelName),
                overlap: 100,
                preserveStructure: true
            });
            output = this.chunker.mergeChunks(chunks, this.contextManager.getSafeChunkSize(modelName));
            Logger.log(`   ✅ Chunked: ${chunks.length} chunks created`);
        }

        return {
            step: 'summarization',
            description: 'Applied hierarchical summarization',
            tokensIn,
            tokensOut: this.contextManager.estimateTokens(output),
            duration: Date.now() - startTime,
            output,
            result
        };
    }

    /**
     * Perform retrieval from memory
     */
    private async performRetrieval(
        prompt: string,
        fileContext: string[]
    ): Promise<ProcessingStep & { result?: RetrievedContext }> {
        const startTime = Date.now();

        Logger.log(`💾 Memory Retrieval: "${prompt.substring(0, 50)}..."`);

        try {
            const result = await this.retrieval.retrieveForQuery(prompt, fileContext, {
                maxTokens: 2000,
                minRelevance: 0.3,
                includeRecent: 2
            });

            Logger.log(`   ✅ Retrieved ${result.sources.length} memories:`);
            result.sources.forEach((src, i) => {
                Logger.log(`      ${i + 1}. ${src.type} (relevance: ${src.relevance.toFixed(2)})`);
            });

            return {
                step: 'retrieval',
                description: `Retrieved ${result.sources.length} relevant memories`,
                tokensIn: this.contextManager.estimateTokens(prompt),
                tokensOut: result.totalTokens,
                duration: Date.now() - startTime,
                output: result.content,
                result
            };
        } catch (error) {
            Logger.warn('Retrieval failed:', error);
            return {
                step: 'retrieval',
                description: 'Retrieval failed, continuing without',
                tokensIn: 0,
                tokensOut: 0,
                duration: Date.now() - startTime,
                output: ''
            };
        }
    }

    /**
     * Perform simple generation
     */
    private async performSimpleGeneration(prompt: string): Promise<ProcessingStep> {
        const startTime = Date.now();
        const tokensIn = this.contextManager.estimateTokens(prompt);

        try {
            const content = await this.provider.chatCompletion([
                { role: 'system', content: 'You are a helpful AI assistant.' },
                { role: 'user', content: prompt }
            ]);

            return {
                step: 'generation',
                description: 'Generated response',
                tokensIn,
                tokensOut: this.contextManager.estimateTokens(content),
                duration: Date.now() - startTime,
                output: content
            };
        } catch (error) {
            Logger.error('Generation failed:', error);
            throw error;
        }
    }

    /**
     * Perform multi-pass generation
     */
    private async performMultiPass(prompt: string): Promise<ProcessingStep & { result?: GenerationResult }> {
        const startTime = Date.now();
        const tokensIn = this.contextManager.estimateTokens(prompt);

        try {
            const result = await this.multiPassEngine.generateWithRefinement(prompt, {
                enabled: true,
                passes: 2,
                validationEnabled: false
            });

            return {
                step: 'multi_pass',
                description: `Multi-pass generation (${result.passes} passes)`,
                tokensIn,
                tokensOut: result.metadata.finalTokens,
                duration: Date.now() - startTime,
                output: result.content,
                result
            };
        } catch (error) {
            Logger.warn('Multi-pass failed, falling back to simple generation:', error);
            return this.performSimpleGeneration(prompt);
        }
    }

    /**
     * Perform continuation if needed
     */
    private async performContinuation(content: string): Promise<ProcessingStep & { result?: ContinuationResult }> {
        const startTime = Date.now();
        const tokensIn = this.contextManager.estimateTokens(content);

        // Check if continuation is needed
        if (!this.needsContinuation(content)) {
            Logger.log(`🔄 Continuation Check: Not needed (response complete)`);
            return {
                step: 'continuation_check',
                description: 'No continuation needed',
                tokensIn,
                tokensOut: tokensIn,
                duration: Date.now() - startTime,
                output: content
            };
        }

        Logger.log(`🔄 Continuation Check: Needed (incomplete response detected)`);

        try {
            const result = await this.continuationHandler.smartContinue(content);
            const tokensOut = this.contextManager.estimateTokens(result);

            Logger.log(`   ✅ Continuation applied: ${tokensIn} → ${tokensOut} tokens (+${tokensOut - tokensIn} tokens)`);

            return {
                step: 'continuation',
                description: `Applied continuation (${result.length > content.length ? 'extended' : 'completed'})`,
                tokensIn,
                tokensOut,
                duration: Date.now() - startTime,
                output: result,
                result: {
                    content: result,
                    continuations: result.length > content.length ? 1 : 0,
                    finishReason: 'stop',
                    metadata: {
                        totalTokens: result.length,
                        chunks: [result.length]
                    }
                }
            };
        } catch (error) {
            Logger.warn('Continuation failed:', error);
            return {
                step: 'continuation_check',
                description: 'Continuation failed',
                tokensIn,
                tokensOut: tokensIn,
                duration: Date.now() - startTime,
                output: content
            };
        }
    }

    /**
     * Check if content needs continuation
     */
    private needsContinuation(content: string): boolean {
        const codeBlocks = (content.match(/```/g) || []).length;
        if (codeBlocks % 2 !== 0) return true;

        const openBraces = (content.match(/\{/g) || []).length;
        const closeBraces = (content.match(/\}/g) || []).length;
        if (openBraces !== closeBraces) return true;

        return false;
    }

    /**
     * Build final prompt with context
     */
    private buildFinalPrompt(prompt: string, context: string): string {
        if (!context) {
            return prompt;
        }

        return `Context:
${context}

User Request:
${prompt}`;
    }

    /**
     * Store interaction in memory
     */
    private storeInteraction(userPrompt: string, assistantResponse: string, fileContext: string[]): void {
        // Store user message
        this.memoryStore.storeMessage('user', userPrompt, fileContext);

        // Store assistant response
        this.memoryStore.storeMessage('assistant', assistantResponse, fileContext);

        // Store as summary if long
        if (assistantResponse.length > 1000) {
            this.memoryStore.storeSummary(
                assistantResponse.slice(0, 500) + '...',
                assistantResponse.length,
                fileContext
            );
        }
    }

    /**
     * Collect telemetry data
     */
    private collectTelemetry(data: TelemetryData): void {
        this.telemetry.push(data);

        // Keep only last 100 entries
        if (this.telemetry.length > 100) {
            this.telemetry.shift();
        }
    }

    /**
     * Get telemetry statistics
     */
    getTelemetryStats(): {
        totalRequests: number;
        averageInputTokens: number;
        averageOutputTokens: number;
        averageDuration: number;
        summarizationRate: number;
        averageContinuations: number;
        averageMemoryHits: number;
    } {
        if (this.telemetry.length === 0) {
            return {
                totalRequests: 0,
                averageInputTokens: 0,
                averageOutputTokens: 0,
                averageDuration: 0,
                summarizationRate: 0,
                averageContinuations: 0,
                averageMemoryHits: 0
            };
        }

        return {
            totalRequests: this.telemetry.length,
            averageInputTokens: this.telemetry.reduce((sum, t) => sum + t.inputTokens, 0) / this.telemetry.length,
            averageOutputTokens: this.telemetry.reduce((sum, t) => sum + t.outputTokens, 0) / this.telemetry.length,
            averageDuration: this.telemetry.reduce((sum, t) => sum + t.totalDuration, 0) / this.telemetry.length,
            summarizationRate: this.telemetry.filter(t => t.summarizationTriggered).length / this.telemetry.length,
            averageContinuations: this.telemetry.reduce((sum, t) => sum + t.continuationCount, 0) / this.telemetry.length,
            averageMemoryHits: this.telemetry.reduce((sum, t) => sum + t.memoryHits, 0) / this.telemetry.length
        };
    }

    /**
     * Get memory store instance for direct access
     */
    getMemoryStore(): MemoryStore {
        return this.memoryStore;
    }

    /**
     * Get context manager instance
     */
    getContextManager(): ContextManager {
        return this.contextManager;
    }

    /**
     * Clear all telemetry data
     */
    clearTelemetry(): void {
        this.telemetry = [];
    }

    /**
     * Export telemetry data
     */
    exportTelemetry(): TelemetryData[] {
        return [...this.telemetry];
    }

    /**
     * Create a code review service instance
     */
    createCodeReviewService(workspaceRoot: string): CodeReviewService {
        return new CodeReviewService(this.provider, workspaceRoot);
    }

    /**
     * Run a code review on git changes
     */
    async reviewCode(workspaceRoot: string, options: CodeReviewOptions = {}): Promise<ReviewResult> {
        const codeReviewService = this.createCodeReviewService(workspaceRoot);
        return codeReviewService.reviewGitChanges(options);
    }
}
