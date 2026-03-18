/**
 * Code Review Service
 * Orchestrates AI-powered code review using configured providers
 */

import * as vscode from 'vscode';
import { Logger } from '../logger';
import { ReviewSeverity, ReviewComment, ReviewResult, ReviewConfig, ChatMessage } from '../types';
import { ReviewConfigManager } from '../reviewConfigManager';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface AIProvider {
    chatCompletion(messages: ChatMessage[], onProgress?: (delta: string) => void, signal?: AbortSignal): Promise<string>;
}

export interface CodeReviewOptions {
    reviewAllFiles?: boolean;
    includeContext?: number;
    severity?: ReviewSeverity[];
    customRules?: string[];
    useCustomConfig?: boolean;
}

export class CodeReviewService {
    private decorationType: vscode.TextEditorDecorationType;
    private reviewConfigManager: ReviewConfigManager;

    constructor(private provider: AIProvider, private workspaceRoot: string) {
        this.reviewConfigManager = new ReviewConfigManager(workspaceRoot);
        // Initialize config directory on first use
        this.reviewConfigManager.initialize();
        // Create decoration type for review annotations
        this.decorationType = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: 'rgba(255, 165, 0, 0.8)',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            light: {
                backgroundColor: 'rgba(255, 165, 0, 0.15)',
                color: '#000000'
            },
            dark: {
                backgroundColor: 'rgba(255, 165, 0, 0.15)',
                color: '#ffffff'
            }
        });
    }

    /**
     * Run a code review on current git changes
     */
    async reviewGitChanges(options: CodeReviewOptions = {}): Promise<ReviewResult> {
        Logger.log('Starting code review on git changes...');

        try {
            // Get git diff
            const diff = await this.getGitDiff(options.reviewAllFiles);
            if (!diff) {
                vscode.window.showInformationMessage('No changes to review');
                return this.createEmptyResult();
            }

            Logger.log(`Git diff retrieved: ${diff.length} characters`);

            // Get custom review rules if enabled
            let customRulesPrompt = '';
            if (options.useCustomConfig) {
                customRulesPrompt = await this.reviewConfigManager.getCustomReviewPrompt();
                Logger.log(`Loaded ${customRulesPrompt.length} characters of custom review rules`);
            }

            // Build review prompt
            const prompt = this.buildReviewPrompt(diff, options, customRulesPrompt);

            // Call AI provider
            const response = await this.provider.chatCompletion([
                { role: 'system', content: this.getSystemPrompt() },
                { role: 'user', content: prompt }
            ]);

            // Parse AI response
            const reviewResult = this.parseReviewResponse(response);
            Logger.log(`Review complete: ${reviewResult.comments.length} comments found`);

            // Display results
            await this.displayReviewResults(reviewResult);

            return reviewResult;
        } catch (error: any) {
            Logger.error('Code review failed', error);
            vscode.window.showErrorMessage(`Code review failed: ${error.message}`);
            return this.createEmptyResult();
        }
    }

    /**
     * Get git diff for review
     */
    private async getGitDiff(allFiles = false): Promise<string> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder open');
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            let command = allFiles ? 'git diff HEAD' : 'git diff';
            const { stdout } = await execAsync(command, { cwd: workspaceRoot });

            return stdout;
        } catch (error: any) {
            if (error.message.includes('not a git repository')) {
                throw new Error('Not a git repository');
            }
            throw error;
        }
    }

    /**
     * Build review prompt with git diff
     */
    private buildReviewPrompt(diff: string, options: CodeReviewOptions, customRulesPrompt: string = ''): string {
        let prompt = `Please review the following code changes and provide constructive feedback.

## Instructions:
1. Analyze the code for bugs, security issues, and potential problems
2. Suggest improvements for code quality, readability, and maintainability
3. Identify any missing error handling or edge cases
4. Provide specific, actionable suggestions with code examples
${customRulesPrompt}

## Git Diff:
${diff}

## Please provide your review in the following JSON format:
\`\`\`json
{
  "summary": "Brief summary of the review (max 2-3 sentences)",
  "comments": [
    {
      "filePath": "relative/path/to/file.ts",
      "line": 42,
      "severity": "error|warning|suggestion|info",
      "message": "Clear description of the issue",
      "suggestion": "Code suggestion to fix the issue (optional)",
      "code": "Relevant code snippet (optional)"
    }
  ],
  "passedChecks": ["Check 1", "Check 2"],
  "failedChecks": ["Check 1", "Check 2"]
}
\`\`\`
`;

        if (options.severity && options.severity.length > 0) {
            prompt += `\n\n## Focus on these severity levels: ${options.severity.join(', ')}`;
        }

        if (options.customRules && options.customRules.length > 0) {
            prompt += `\n\n## Custom Review Rules:\n${options.customRules.map(r => `- ${r}`).join('\n')}`;
        }

        return prompt;
    }

    /**
     * Get system prompt for code review
     */
    private getSystemPrompt(): string {
        return `You are an expert code reviewer with deep knowledge of software engineering best practices, security principles, and design patterns.

Your role is to:
1. Identify potential bugs, security vulnerabilities, and logic errors
2. Suggest improvements for code quality, performance, and maintainability
3. Check for proper error handling and edge cases
4. Ensure code follows language-specific best practices
5. Provide constructive, actionable feedback

Be specific and helpful in your feedback. Provide code examples when suggesting changes.
Use severity levels appropriately:
- error: Critical bugs, security issues, or crashes
- warning: Potential problems or bad practices
- suggestion: Improvements or optimizations
- info: Notes or observations`;
    }

    /**
     * Parse AI response into structured review result
     */
    private parseReviewResponse(response: string): ReviewResult {
        try {
            // Try to extract JSON from markdown code block
            const jsonMatch = response.match(/```json\s*(\{[\s\S]*?\})\s*```/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[1]);
                return {
                    summary: parsed.summary || 'Code review completed',
                    comments: this.validateComments(parsed.comments || []),
                    passedChecks: parsed.passedChecks || [],
                    failedChecks: parsed.failedChecks || []
                };
            }

            // Try direct JSON parsing
            const parsed = JSON.parse(response);
            return {
                summary: parsed.summary || 'Code review completed',
                comments: this.validateComments(parsed.comments || []),
                passedChecks: parsed.passedChecks || [],
                failedChecks: parsed.failedChecks || []
            };
        } catch (error) {
            Logger.warn('Failed to parse review response as JSON, treating as summary', error);
            // Return the response as a summary with no structured comments
            return {
                summary: response.substring(0, 500),
                comments: [],
                passedChecks: [],
                failedChecks: []
            };
        }
    }

    /**
     * Validate and normalize review comments
     */
    private validateComments(comments: any[]): ReviewComment[] {
        return comments
            .filter(c => c && c.filePath && c.line !== undefined && c.message)
            .map(c => ({
                filePath: c.filePath,
                line: c.line,
                severity: this.validateSeverity(c.severity),
                message: c.message,
                suggestion: c.suggestion,
                code: c.code
            }));
    }

    /**
     * Validate severity value
     */
    private validateSeverity(severity: any): ReviewSeverity {
        const validSeverities = [ReviewSeverity.Error, ReviewSeverity.Warning, ReviewSeverity.Suggestion, ReviewSeverity.Info];
        if (validSeverities.includes(severity)) {
            return severity;
        }
        return ReviewSeverity.Suggestion;
    }

    /**
     * Create empty review result
     */
    private createEmptyResult(): ReviewResult {
        return {
            summary: 'No changes to review',
            comments: [],
            passedChecks: [],
            failedChecks: []
        };
    }

    /**
     * Display review results in the editor
     */
    private async displayReviewResults(result: ReviewResult): Promise<void> {
        if (result.comments.length === 0) {
            vscode.window.showInformationMessage('Code review completed: No issues found! ✓');
            return;
        }

        // Group comments by file
        const commentsByFile = new Map<string, ReviewComment[]>();
        for (const comment of result.comments) {
            if (!commentsByFile.has(comment.filePath)) {
                commentsByFile.set(comment.filePath, []);
            }
            commentsByFile.get(comment.filePath)!.push(comment);
        }

        // Create decorations for each file
        for (const [filePath, comments] of commentsByFile.entries()) {
            const fileUri = vscode.Uri.file(path.join(this.workspaceRoot, filePath));

            try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                const editor = await vscode.window.showTextDocument(document);

                // Create decorations for each comment
                const decorations: vscode.DecorationOptions[] = comments.map(comment => {
                    const range = new vscode.Range(
                        new vscode.Position(Math.max(0, comment.line - 1), 0),
                        new vscode.Position(Math.min(document.lineCount - 1, comment.line), 0)
                    );

                    return {
                        range,
                        hoverMessage: new vscode.MarkdownString(
                            `**${comment.severity.toUpperCase()}**\n\n${comment.message}\n\n` +
                            (comment.suggestion ? `**Suggestion:**\n\`\`\`\n${comment.suggestion}\n\`\`\`` : '')
                        )
                    };
                });

                // Apply decorations
                editor.setDecorations(this.decorationType, decorations);

                // Add code actions
                for (const comment of comments) {
                    this.addCodeActions(editor, comment);
                }
            } catch (error: any) {
                Logger.warn(`Failed to open file for review: ${filePath}`, error);
            }
        }

        // Show summary
        const errorCount = result.comments.filter(c => c.severity === ReviewSeverity.Error).length;
        const warningCount = result.comments.filter(c => c.severity === ReviewSeverity.Warning).length;
        const suggestionCount = result.comments.filter(c => c.severity === ReviewSeverity.Suggestion).length;

        vscode.window.showInformationMessage(
            `Code review complete: ${result.comments.length} issues (${errorCount} errors, ${warningCount} warnings, ${suggestionCount} suggestions)`
        );
    }

    /**
     * Add code actions for review comments
     */
    private addCodeActions(editor: vscode.TextEditor, comment: ReviewComment): void {
        const disposable = vscode.languages.registerCodeActionsProvider(
            editor.document.uri,
            {
                provideCodeActions: (document, range) => {
                    const line = document.lineAt(comment.line - 1);
                    if (!range.contains(line.range)) {
                        return [];
                    }

                    const actions: vscode.CodeAction[] = [];

                    // Apply suggestion action
                    if (comment.suggestion) {
                        const applyAction = new vscode.CodeAction(
                            `Apply: ${comment.message.substring(0, 50)}...`,
                            vscode.CodeActionKind.QuickFix
                        );
                        applyAction.command = {
                            title: 'Apply Suggestion',
                            command: 'kbot.applyReviewSuggestion',
                            arguments: [comment.filePath, comment.line, comment.suggestion]
                        };
                        actions.push(applyAction);
                    }

                    // Reject action
                    const rejectAction = new vscode.CodeAction(
                        'Reject this suggestion',
                        vscode.CodeActionKind.QuickFix
                    );
                    rejectAction.command = {
                        title: 'Reject Suggestion',
                        command: 'kbot.rejectReviewSuggestion',
                        arguments: [comment.filePath, comment.line]
                    };
                    actions.push(rejectAction);

                    return actions;
                }
            }
        );

        // Store disposable for cleanup
        (editor as any)._codeReviewDisposables = (editor as any)._codeReviewDisposables || [];
        (editor as any)._codeReviewDisposables.push(disposable);
    }

    /**
     * Clear all review decorations
     */
    clearDecorations(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.decorationType, []);
            // Clean up code action providers
            if ((editor as any)._codeReviewDisposables) {
                (editor as any)._codeReviewDisposables.forEach((d: vscode.Disposable) => d.dispose());
                (editor as any)._codeReviewDisposables = [];
            }
        }
    }

    /**
     * Apply a review suggestion
     */
    async applySuggestion(filePath: string, line: number, suggestion: string): Promise<void> {
        const fileUri = vscode.Uri.file(path.join(this.workspaceRoot, filePath));

        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            const editor = await vscode.window.showTextDocument(document);

            const range = new vscode.Range(
                new vscode.Position(Math.max(0, line - 1), 0),
                new vscode.Position(line, 0)
            );

            const edit = new vscode.WorkspaceEdit();
            edit.replace(fileUri, range, suggestion);

            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
                await document.save();
                vscode.window.showInformationMessage('Suggestion applied!');
                this.clearDecorations();
            } else {
                vscode.window.showErrorMessage('Failed to apply suggestion');
            }
        } catch (error: any) {
            Logger.error('Failed to apply suggestion', error);
            vscode.window.showErrorMessage(`Failed to apply suggestion: ${error.message}`);
        }
    }

    /**
     * Reject a review suggestion
     */
    async rejectSuggestion(filePath: string, line: number): Promise<void> {
        const fileUri = vscode.Uri.file(path.join(this.workspaceRoot, filePath));

        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            const editor = await vscode.window.showTextDocument(document);

            // Remove decoration for this line
            const currentDecorations = editor.getDecorations(this.decorationType);
            const filteredDecorations = currentDecorations.filter(d => {
                const lineNum = d.range.start.line + 1;
                return lineNum !== line;
            });
            editor.setDecorations(this.decorationType, filteredDecorations);

            vscode.window.showInformationMessage('Suggestion rejected');
        } catch (error: any) {
            Logger.error('Failed to reject suggestion', error);
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.decorationType.dispose();
        this.clearDecorations();
    }
}
