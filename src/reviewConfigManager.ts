/**
 * Review Config Manager
 * Manages code review configuration from .kbot/checks/*.md files
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';
import { ReviewConfig, ReviewRule, ReviewSeverity } from './types';

export class ReviewConfigManager {
    private configCache: Map<string, ReviewConfig[]> = new Map();
    private kbotDir: string;

    constructor(private workspaceRoot: string) {
        this.kbotDir = path.join(workspaceRoot, '.kbot');
    }

    /**
     * Initialize review config directory
     */
    async initialize(): Promise<void> {
        try {
            // Create .kbot directory if it doesn't exist
            if (!fs.existsSync(this.kbotDir)) {
                fs.mkdirSync(this.kbotDir, { recursive: true });
                Logger.log('Created .kbot directory');
            }

            // Create checks directory if it doesn't exist
            const checksDir = path.join(this.kbotDir, 'checks');
            if (!fs.existsSync(checksDir)) {
                fs.mkdirSync(checks, { recursive: true });
                Logger.log('Created .kbot/checks directory');

                // Create default check configurations
                await this.createDefaultChecks();
            }
        } catch (error: any) {
            Logger.warn('Failed to initialize review config', error);
        }
    }

    /**
     * Create default check configurations
     */
    private async createDefaultChecks(): Promise<void> {
        const checksDir = path.join(this.kbotDir, 'checks');

        const defaultChecks: Array<{ name: string; content: string }> = [
            {
                name: 'security.md',
                content: `# Security Review Checks

Automated security review for code changes.

## Rules

1. **SQL Injection Prevention**
   - Check for user input concatenated directly into SQL queries
   - Suggest using parameterized queries or prepared statements

2. **XSS Prevention**
   - Identify unsanitized user input being rendered in HTML
   - Recommend proper escaping and sanitization

3. **Authentication & Authorization**
   - Verify proper authentication checks on sensitive endpoints
   - Ensure authorization is checked before resource access

4. **Sensitive Data Exposure**
   - Check for hardcoded credentials, API keys, or tokens
   - Identify logging of sensitive information

5. **Input Validation**
   - Ensure user input is validated and sanitized
   - Check for proper type and range checking
`
            },
            {
                name: 'code-quality.md',
                content: `# Code Quality Review Checks

Automated code quality review for maintainability and best practices.

## Rules

1. **Error Handling**
   - Ensure all async operations have try-catch blocks
   - Verify proper error messages and logging

2. **Code Duplication**
   - Identify repeated code patterns
   - Suggest extracting to functions or classes

3. **Naming Conventions**
   - Check for consistent naming (camelCase, PascalCase, etc.)
   - Verify descriptive and meaningful variable/function names

4. **Code Complexity**
   - Flag overly complex functions (high cyclomatic complexity)
   - Suggest breaking down into smaller functions

5. **Documentation**
   - Check for missing JSDoc comments on public APIs
   - Ensure inline comments for complex logic
`
            },
            {
                name: 'performance.md',
                content: `# Performance Review Checks

Automated performance review for optimization opportunities.

## Rules

1. **Database Queries**
   - Check for N+1 query problems
   - Identify missing database indexes
   - Suggest query optimization

2. **Memory Management**
   - Identify potential memory leaks
   - Check for unnecessary object retention

3. **Algorithmic Complexity**
   - Flag O(n²) or worse algorithms where better alternatives exist
   - Suggest more efficient data structures

4. **Caching**
   - Identify repeated expensive operations
   - Suggest caching strategies

5. **Async Operations**
   - Check for blocking operations in async contexts
   - Ensure proper async/await usage
`
            }
        ];

        for (const check of defaultChecks) {
            const filePath = path.join(checksDir, check.name);
            try {
                fs.writeFileSync(filePath, check.content, 'utf-8');
                Logger.log(`Created default check: ${check.name}`);
            } catch (error: any) {
                Logger.warn(`Failed to create default check ${check.name}`, error);
            }
        }
    }

    /**
     * Load all review configurations
     */
    async loadConfigs(): Promise<ReviewConfig[]> {
        const cacheKey = this.workspaceRoot;
        if (this.configCache.has(cacheKey)) {
            return this.configCache.get(cacheKey)!;
        }

        const configs: ReviewConfig[] = [];
        const checksDir = path.join(this.kbotDir, 'checks');

        if (!fs.existsSync(checksDir)) {
            await this.initialize();
        }

        try {
            const files = fs.readdirSync(checksDir);
            const markdownFiles = files.filter(f => f.endsWith('.md'));

            for (const file of markdownFiles) {
                const filePath = path.join(checksDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                const config = this.parseConfigFile(file, content);
                if (config) {
                    configs.push(config);
                }
            }

            this.configCache.set(cacheKey, configs);
            Logger.log(`Loaded ${configs.length} review configurations`);
        } catch (error: any) {
            Logger.error('Failed to load review configurations', error);
        }

        return configs;
    }

    /**
     * Parse a review configuration file
     */
    private parseConfigFile(fileName: string, content: string): ReviewConfig | null {
        try {
            const name = fileName.replace('.md', '');
            const rules: ReviewRule[] = [];

            // Parse rules from markdown sections
            const ruleRegex = /(\d+)\.\s+\*\*([^*]+)\*\*\s*\n\s*-\s*([^\n]+)/g;
            let match;
            let ruleId = 0;

            while ((match = ruleRegex.exec(content)) !== null) {
                ruleId++;
                rules.push({
                    id: `${name}-${ruleId}`,
                    name: match[2].trim(),
                    severity: this.inferSeverity(match[3]),
                    description: match[3].trim(),
                    enabled: true
                });
            }

            return {
                name: this.formatName(name),
                rules,
                enabled: true
            };
        } catch (error) {
            Logger.warn(`Failed to parse config file: ${fileName}`, error);
            return null;
        }
    }

    /**
     * Infer severity from rule description
     */
    private inferSeverity(description: string): ReviewSeverity {
        const lowerDesc = description.toLowerCase();

        if (lowerDesc.includes('critical') || lowerDesc.includes('security') || lowerDesc.includes('vulnerability') || lowerDesc.includes('sql injection') || lowerDesc.includes('xss')) {
            return ReviewSeverity.Error;
        }

        if (lowerDesc.includes('error') || lowerDesc.includes('exception') || lowerDesc.includes('crash')) {
            return ReviewSeverity.Error;
        }

        if (lowerDesc.includes('warning') || lowerDesc.includes('potential') || lowerDesc.includes('should') || lowerDesc.includes('recommend')) {
            return ReviewSeverity.Warning;
        }

        if (lowerDesc.includes('consider') || lowerDesc.includes('optimize') || lowerDesc.includes('improve') || lowerDesc.includes('suggest')) {
            return ReviewSeverity.Suggestion;
        }

        return ReviewSeverity.Info;
    }

    /**
     * Format config name for display
     */
    private formatName(fileName: string): string {
        return fileName
            .split(/[-_]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Get enabled review rules
     */
    async getEnabledRules(): Promise<ReviewRule[]> {
        const configs = await this.loadConfigs();
        const rules: ReviewRule[] = [];

        for (const config of configs) {
            if (config.enabled) {
                rules.push(...config.rules.filter(r => r.enabled));
            }
        }

        return rules;
    }

    /**
     * Get custom review prompt based on enabled rules
     */
    async getCustomReviewPrompt(): Promise<string> {
        const rules = await this.getEnabledRules();
        if (rules.length === 0) {
            return '';
        }

        let prompt = '\n\n## Custom Review Rules:\n';
        for (const rule of rules) {
            prompt += `### ${rule.name} (${rule.severity})\n${rule.description}\n\n`;
        }

        return prompt;
    }

    /**
     * Create a new review configuration
     */
    async createConfig(name: string, content: string): Promise<void> {
        try {
            const checksDir = path.join(this.kbotDir, 'checks');
            const fileName = `${name.replace(/\s+/g, '-').toLowerCase()}.md`;
            const filePath = path.join(checksDir, fileName);

            fs.writeFileSync(filePath, content, 'utf-8');
            this.configCache.clear(); // Invalidate cache
            Logger.log(`Created review config: ${fileName}`);
            vscode.window.showInformationMessage(`Review config created: ${name}`);
        } catch (error: any) {
            Logger.error('Failed to create review config', error);
            throw new Error(`Failed to create config: ${error.message}`);
        }
    }

    /**
     * Update a review configuration
     */
    async updateConfig(fileName: string, content: string): Promise<void> {
        try {
            const checksDir = path.join(this.kbotDir, 'checks');
            const filePath = path.join(checksDir, fileName);

            if (!fs.existsSync(filePath)) {
                throw new Error(`Config file not found: ${fileName}`);
            }

            fs.writeFileSync(filePath, content, 'utf-8');
            this.configCache.clear(); // Invalidate cache
            Logger.log(`Updated review config: ${fileName}`);
            vscode.window.showInformationMessage(`Review config updated: ${fileName}`);
        } catch (error: any) {
            Logger.error('Failed to update review config', error);
            throw new Error(`Failed to update config: ${error.message}`);
        }
    }

    /**
     * Delete a review configuration
     */
    async deleteConfig(fileName: string): Promise<void> {
        try {
            const checksDir = path.join(this.kbotDir, 'checks');
            const filePath = path.join(checksDir, fileName);

            if (!fs.existsSync(filePath)) {
                throw new Error(`Config file not found: ${fileName}`);
            }

            fs.unlinkSync(filePath);
            this.configCache.clear(); // Invalidate cache
            Logger.log(`Deleted review config: ${fileName}`);
            vscode.window.showInformationMessage(`Review config deleted: ${fileName}`);
        } catch (error: any) {
            Logger.error('Failed to delete review config', error);
            throw new Error(`Failed to delete config: ${error.message}`);
        }
    }

    /**
     * List all review configurations
     */
    async listConfigs(): Promise<Array<{ fileName: string; name: string; ruleCount: number }>> {
        const configs = await this.loadConfigs();
        const checksDir = path.join(this.kbotDir, 'checks');

        if (!fs.existsSync(checksDir)) {
            return [];
        }

        const files = fs.readdirSync(checksDir);
        const markdownFiles = files.filter(f => f.endsWith('.md'));

        return markdownFiles.map(fileName => {
            const config = configs.find(c => fileName.includes(c.name.toLowerCase().replace(/\s+/g, '-')));
            return {
                fileName,
                name: config?.name || this.formatName(fileName.replace('.md', '')),
                ruleCount: config?.rules.length || 0
            };
        });
    }

    /**
     * Read a review configuration file
     */
    async readConfig(fileName: string): Promise<string> {
        try {
            const checksDir = path.join(this.kbotDir, 'checks');
            const filePath = path.join(checksDir, fileName);
            return fs.readFileSync(filePath, 'utf-8');
        } catch (error: any) {
            Logger.error('Failed to read review config', error);
            throw new Error(`Failed to read config: ${error.message}`);
        }
    }

    /**
     * Clear configuration cache
     */
    clearCache(): void {
        this.configCache.clear();
    }
}
