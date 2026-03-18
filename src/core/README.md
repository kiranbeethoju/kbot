# Context Orchestration Layer

A comprehensive orchestration layer for managing AI context, memory, and generation optimization in VS Code extensions.

## Features

### 1. Context Window Manager
- Model-specific context limit tracking
- Token estimation (lightweight: ~4 chars/token)
- Dynamic adaptation based on model capabilities
- Safety buffer enforcement (default 80%)

### 2. Smart Chunking
- Structure-aware code chunking
- Preserves function/class boundaries
- Configurable overlap between chunks
- Language-aware splitting

### 3. Hierarchical Summarization
- Recursive content compression
- Preserves key information
- Multi-level summarization
- Configurable compression targets

### 4. Memory Store (RAG-style Retrieval)
- Semantic embedding-based search
- Automatic importance scoring
- Context-aware retrieval
- File-based relevance boosting

### 5. Multi-Pass Generation
- Draft → Refine → Validate workflow
- Quality improvement through iteration
- Focus-area specific refinement
- Configurable pass count

### 6. Output Continuation Handler
- Automatic continuation on token limit
- Smart truncation detection
- Code block completion
- Redundancy removal

## Quick Start

### Basic Usage

```typescript
import { OrchestrationService } from './core/orchestrationService';

// Create an AI provider adapter
const provider = {
    chatCompletion: async (messages, onProgress, signal) => {
        // Your existing API call logic
        return response;
    }
};

// Initialize orchestration service
const orchestration = new OrchestrationService(provider);

// Use intelligent generation
const result = await orchestration.intelligentGenerate(
    userPrompt,
    fileContext,
    {
        modelName: 'gpt-4o',
        enableChunking: true,
        enableSummarization: true,
        enableMemory: true,
        enableRetrieval: true,
        enableMultiPass: false,
        enableContinuation: true,
        fileContext: ['src/file1.ts', 'src/file2.ts']
    }
);

console.log(result.content);
console.log(result.metadata);
```

### Individual Component Usage

#### Context Manager

```typescript
import { ContextManager } from './core/contextManager';

const contextManager = new ContextManager();

// Register custom model
contextManager.registerModel({
    name: 'custom-model',
    provider: ProviderType.Azure,
    limits: {
        maxContext: 32000,
        maxOutput: 4096,
        safeBuffer: 0.8
    }
});

// Check if content fits
const fits = contextManager.fitsInContext(largeFileContent, 'gpt-4o');

// Estimate tokens
const tokens = contextManager.estimateTokens(content);

// Get available context space
const available = contextManager.getAvailableContext(usedContent, 'gpt-4o');
```

#### Chunker

```typescript
import { Chunker } from './core/chunker';

const chunker = new Chunker(contextManager);

const chunks = chunker.chunkText(largeCode, {
    maxTokens: 4000,
    overlap: 200,
    preserveStructure: true
});

// chunks contains: content, tokenCount, startIndex, endIndex, metadata
```

#### Memory Store

```typescript
import { MemoryStore } from './core/memoryStore';

const memoryStore = new MemoryStore();

// Store different types of memories
memoryStore.storeMessage('user', 'How do I implement feature X?', ['file1.ts']);
memoryStore.storeCodeDecision(
    'Use React Query for state management',
    'Better caching and background updates',
    ['src/hooks/']
);
memoryStore.storeErrorFix(
    'Module not found error',
    'Need to install @types/node package',
    ['package.json']
);

// Search for relevant memories
const results = memoryStore.search('error fix', {
    limit: 5,
    minSimilarity: 0.3,
    typeFilter: ['error_fix']
});
```

#### Retrieval

```typescript
import { Retrieval } from './core/retrieval';

const retrieval = new Retrieval(contextManager, memoryStore);

// Get relevant context for query
const context = await retrieval.retrieveForQuery(
    'How to fix authentication bug?',
    ['src/auth.ts', 'src/api/'],
    {
        maxTokens: 2000,
        minRelevance: 0.3,
        includeRecent: 2
    }
);

// Get specific types of context
const errorFixes = retrieval.getErrorFixes(query);
const codeDecisions = retrieval.getCodeDecisions(query, fileContext);
```

#### Multi-Pass Engine

```typescript
import { MultiPassEngine } from './core/multiPassEngine';

const engine = new MultiPassEngine(provider);

// Basic multi-pass generation
const result = await engine.generateWithRefinement(prompt, {
    enabled: true,
    passes: 3,
    validationEnabled: true
});

// Focus-specific generation
const focused = await engine.generateWithFocus(prompt, [
    'clarity',
    'code quality',
    'error handling'
]);
```

#### Continuation Handler

```typescript
import { ContinuationHandler } from './core/continuationHandler';

const handler = new ContinuationHandler(provider);

// Auto-continue on truncation
const result = await handler.generateWithContinuation(longPrompt, {
    maxContinuations: 3,
    overlapTokens: 200
});

// Smart continuation with issue detection
const completed = await handler.smartContinue(incompleteContent);

// Complete specific code blocks
const withCode = await handler.completeCodeBlocks(contentWithUnclosedBlock);
```

## Configuration

### VS Code Settings

Add to your `settings.json` or configure through VS Code UI:

```json
{
  "azureGpt.enableOrchestration": true,
  "azureGpt.maxFileContextTokens": 8000,
  "azureGpt.enableMemoryRetrieval": true
}
```

### Orchestration Options

```typescript
interface OrchestrationOptions {
    modelName?: string;              // Default: 'gpt-4o'
    enableChunking?: boolean;         // Default: true
    enableSummarization?: boolean;    // Default: true
    enableMemory?: boolean;           // Default: true
    enableRetrieval?: boolean;        // Default: true
    enableMultiPass?: boolean;        // Default: false (for speed)
    enableContinuation?: boolean;     // Default: true
    maxTokens?: number;               // Override model limit
    fileContext?: string[];           // Relevant file paths
}
```

## Architecture

```
User Input
    ↓
Context Manager (check limits)
    ↓
Chunker (split if needed)
    ↓
Summarizer (compress if needed)
    ↓
Retrieval (fetch relevant memory)
    ↓
Multi-Pass Engine (refine if enabled)
    ↓
Continuation Handler (extend if needed)
    ↓
Memory Store (save interaction)
    ↓
Final Output
```

## Telemetry

The orchestration layer collects telemetry for optimization:

```typescript
const stats = orchestration.getTelemetryStats();
console.log({
    totalRequests: stats.totalRequests,
    averageInputTokens: stats.averageInputTokens,
    averageOutputTokens: stats.averageOutputTokens,
    summarizationRate: stats.summarizationRate,
    averageContinuations: stats.averageContinuations,
    averageMemoryHits: stats.averageMemoryHits
});
```

## Model Limits

Pre-configured models include:

- Azure: gpt-4, gpt-4-32k, gpt-4-turbo, gpt-4o, gpt-35-turbo
- NVIDIA: nemotron-4-340b, mixtral-8x7b, llama-3-70b
- Anthropic: claude-opus-4_5, claude-sonnet-4_5, claude-3-5-sonnet
- Z.AI: glm-4-plus, glm-4-7

Unknown models use sensible defaults (8K context, 2K output).

## Best Practices

1. **Enable orchestration selectively** - It adds processing overhead
2. **Use retrieval for long conversations** - Keeps context relevant
3. **Enable summarization for large files** - Prevents token limit errors
4. **Disable multi-pass for real-time** - Use for quality-critical tasks only
5. **Monitor telemetry** - Understand your usage patterns

## Performance Impact

- **Chunking**: ~10-50ms depending on content size
- **Summarization**: +1 API call per level (usually 1-2 levels)
- **Retrieval**: ~5-20ms (in-memory search)
- **Multi-pass**: +N API calls where N = passes
- **Continuation**: +M API calls where M = continuations

## Troubleshooting

### Orchestration not working
1. Check `"azureGpt.enableOrchestration"` is `true`
2. View Output logs for "Orchestration complete" message

### Slow responses
1. Disable multi-pass generation
2. Reduce retrieval memory count
3. Adjust `maxFileContextTokens` lower

### Memory issues
1. Clear old memories: `memoryStore.clearOlderThan(timestamp)`
2. Reduce max memories limit (default: 1000)
3. Export telemetry and analyze patterns

## License

MIT - Part of KBot VS Code Extension
