/**
 * Structured Edit Manager
 * Handles Cursor/Windsurf-style precise code editing with line-level patches
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

/**
 * Represents a single line-level edit
 */
export interface LineEdit {
    startLine: number;        // 0-based line number
    endLine: number;          // 0-based, exclusive
    oldContent?: string;      // Optional: original content for verification
    newContent: string;       // New content to insert
}

/**
 * Represents a file edit with multiple line-level changes
 */
export interface FileStructuredEdit {
    filePath: string;         // Relative path from workspace root
    description?: string;      // Description of changes
    edits: LineEdit[];         // Line-level edits
}

/**
 * Represents the structured response from LLM
 */
export interface StructuredEditResponse {
    explanation: string;      // High-level explanation
    files: FileStructuredEdit[]; // File edits
}

/**
 * Manages structured, line-level code editing
 */
export class StructuredEditManager {
    constructor(private workspaceRoot: string) {}

    /**
     * Apply structured edits to files
     */
    async applyStructuredEdits(
        edits: FileStructuredEdit[],
        progressCallback?: (message: string) => void
    ): Promise<{ success: boolean; applied: number; failed: number }> {
        let applied = 0;
        let failed = 0;

        for (const fileEdit of edits) {
            try {
                progressCallback?.(`Editing ${fileEdit.filePath}...`);

                const result = await this.applyFileEdit(fileEdit);
                if (result) {
                    applied++;
                    Logger.log(`✓ Applied edits to ${fileEdit.filePath}`);
                } else {
                    failed++;
                    Logger.warn(`✗ Failed to apply edits to ${fileEdit.filePath}`);
                }
            } catch (error: any) {
                failed++;
                Logger.error(`✗ Error editing ${fileEdit.filePath}:`, error);
            }
        }

        return { success: failed === 0, applied, failed };
    }

    /**
     * Apply edits to a single file using VS Code WorkspaceEdit
     */
    private async applyFileEdit(fileEdit: FileStructuredEdit): Promise<boolean> {
        const filePath = path.join(this.workspaceRoot, fileEdit.filePath);
        const uri = vscode.Uri.file(filePath);

        try {
            // Read current file content
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.split('\n');

            // Validate old content if provided
            for (const edit of fileEdit.edits) {
                if (edit.oldContent !== undefined) {
                    const currentLines = lines.slice(edit.startLine, edit.endLine);
                    const currentContent = currentLines.join('\n');
                    if (currentContent !== edit.oldContent) {
                        Logger.warn(`Content mismatch at lines ${edit.startLine}-${edit.endLine} in ${fileEdit.filePath}`);
                        // Continue anyway - user may have made changes
                    }
                }
            }

            // Create WorkspaceEdit for each edit
            const edit = new vscode.WorkspaceEdit();
            const document = await vscode.workspace.openTextDocument(uri);

            // Apply each line edit
            // Sort in reverse order to maintain line numbers
            const sortedEdits = [...fileEdit.edits].sort((a, b) => b.startLine - a.startLine);

            for (const lineEdit of sortedEdits) {
                // When startLine === endLine, AI means "replace this line", not "insert at position"
                // So we need to extend endLine to include the entire line
                const endLineNumber = lineEdit.endLine > lineEdit.startLine
                    ? lineEdit.endLine
                    : lineEdit.startLine + 1; // +1 to include the entire line when start==end

                const range = new vscode.Range(
                    new vscode.Position(lineEdit.startLine, 0),
                    new vscode.Position(endLineNumber, 0)
                );

                // Get text to delete (for verification)
                const textToDelete = document.getText(range);

                edit.replace(uri, range, lineEdit.newContent);
                Logger.log(`Edit: Line ${lineEdit.startLine} → "${lineEdit.newContent.substring(0, 50)}..."`);
            }

            // Apply the edit
            const success = await vscode.workspace.applyEdit(edit);

            if (success) {
                // Save the document
                const textDocument = await vscode.workspace.openTextDocument(uri);
                await textDocument.save();
                return true;
            }

            return false;
        } catch (error: any) {
            Logger.error(`Failed to apply edits to ${fileEdit.filePath}:`, error);
            return false;
        }
    }

    /**
     * Generate a unified diff for a file edit
     */
    generateUnifiedDiff(fileEdit: FileStructuredEdit): string {
        const filePath = path.join(this.workspaceRoot, fileEdit.filePath);
        const diff = [];

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            diff.push(`--- a/${fileEdit.filePath}`);
            diff.push(`+++ b/${fileEdit.filePath}`);

            // Sort edits by line number for proper diff generation
            const sortedEdits = [...fileEdit.edits].sort((a, b) => a.startLine - b.startLine);

            for (const edit of sortedEdits) {
                const oldLines = lines.slice(edit.startLine, edit.endLine);
                const newLines = edit.newContent.split('\n');

                // Unified diff header
                diff.push(`@@ -${edit.startLine + 1},${oldLines.length} +${edit.startLine + 1},${newLines.length} @@`);

                // Remove lines
                for (const line of oldLines) {
                    diff.push(`-${line}`);
                }

                // Add lines
                for (const line of newLines) {
                    diff.push(`+${line}`);
                }
            }

            return diff.join('\n');
        } catch (error) {
            return `Error generating diff: ${error}`;
        }
    }

    /**
     * Parse structured edit response from LLM
     * Handles multiple formats:
     * - JSON with "files" array
     * - Unified diff format
     * - Line-based patch format
     */
    parseStructuredEditResponse(response: string): StructuredEditResponse | null {
        // Try JSON format first
        const jsonMatch = response.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                return this.parseJsonStructuredEdit(parsed);
            } catch (error) {
                Logger.warn('Failed to parse JSON structured edit', error);
            }
        }

        // Try JSON without code block
        try {
            const parsed = JSON.parse(response);
            return this.parseJsonStructuredEdit(parsed);
        } catch (error) {
            // Not JSON, try other formats
        }

        // Try unified diff format
        const parsed = this.parseUnifiedDiff(response);
        if (parsed) {
            return parsed;
        }

        // Fallback: treat as explanation with potential file operations
        return {
            explanation: response,
            files: []
        };
    }

    /**
     * Parse JSON structured edit format
     */
    private parseJsonStructuredEdit(data: any): StructuredEditResponse | null {
        if (!data || typeof data !== 'object') {
            return null;
        }

        // Support multiple formats
        // Format 1: { explanation: "...", files: [...] }
        if (data.files && Array.isArray(data.files)) {
            return {
                explanation: data.explanation || '',
                files: data.files.map((f: any) => ({
                    filePath: f.path || f.file,
                    description: f.description,
                    edits: this.parseEdits(f.edits || f.changes || [])
                }))
            };
        }

        // Format 2: { explanation: "...", changes: [{ file, edits }] }
        if (data.changes && Array.isArray(data.changes)) {
            return {
                explanation: data.explanation || '',
                files: data.changes.map((c: any) => ({
                    filePath: c.file || c.path,
                    description: c.description,
                    edits: this.parseEdits(c.edits || c.changes)
                }))
            };
        }

        return null;
    }

    /**
     * Parse edits from various formats
     */
    private parseEdits(edits: any[]): LineEdit[] {
        const result: LineEdit[] = [];

        for (const edit of edits) {
            if (edit.startLine !== undefined && edit.endLine !== undefined) {
                // Standard format: { startLine, endLine, newContent }
                result.push({
                    startLine: edit.startLine,
                    endLine: edit.endLine,
                    oldContent: edit.oldContent,
                    newContent: edit.newContent || edit.content || edit.text || ''
                });
            } else if (edit.range) {
                // Range format: { range: [start, end], content }
                result.push({
                    startLine: edit.range[0],
                    endLine: edit.range[1],
                    oldContent: edit.oldContent,
                    newContent: edit.content || edit.text || ''
                });
            } else if (edit.line !== undefined) {
                // Single line format: { line, content }
                result.push({
                    startLine: edit.line,
                    endLine: edit.line + 1,
                    oldContent: edit.oldContent,
                    newContent: edit.content || edit.text || ''
                });
            }
        }

        return result;
    }

    /**
     * Parse unified diff format
     */
    private parseUnifiedDiff(diff: string): StructuredEditResponse | null {
        const lines = diff.split('\n');
        const files: FileStructuredEdit[] = [];
        let currentFile: FileStructuredEdit | null = null;
        let currentEdits: LineEdit[] = [];
        let oldStart = -1;
        let oldCount = 0;
        let newStart = -1;
        let newCount = 0;
        let oldLines: string[] = [];
        let newLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // File header
            const fileMatch = line.match(/^\+\+\+\s+(.*)/);
            if (fileMatch) {
                if (currentFile && currentEdits.length > 0) {
                    currentFile.edits = currentEdits;
                    files.push(currentFile);
                }
                currentFile = {
                    filePath: fileMatch[1],
                    edits: []
                };
                currentEdits = [];
                continue;
            }

            // Hunk header
            const hunkMatch = line.match(/^@@\s+-(\d+),?(\d+)?\s+\+(\d+),?(\d+)?\s+@@/);
            if (hunkMatch) {
                oldStart = parseInt(hunkMatch[1]) - 1;
                oldCount = parseInt(hunkMatch[2] || '1');
                newStart = parseInt(hunkMatch[3]) - 1;
                newCount = parseInt(hunkMatch[4] || '1');
                oldLines = [];
                newLines = [];
                continue;
            }

            // Removed line
            if (line.startsWith('-') && !line.startsWith('---')) {
                oldLines.push(line.substring(1));
            }

            // Added line
            if (line.startsWith('+') && !line.startsWith('+++')) {
                newLines.push(line.substring(1));
            }

            // Context line or end of hunk
            if (line.startsWith(' ') || line.match(/\\ No newline at end/)) {
                // End of hunk - create edit
                if (oldLines.length > 0 || newLines.length > 0) {
                    currentEdits.push({
                        startLine: oldStart,
                        endLine: oldStart + oldCount,
                        newContent: newLines.join('\n')
                    });
                }
                oldLines = [];
                newLines = [];
            }
        }

        // Don't forget the last file
        if (currentFile && currentEdits.length > 0) {
            currentFile.edits = currentEdits;
            files.push(currentFile);
        }

        if (files.length > 0) {
            return {
                explanation: diff,
                files
            };
        }

        return null;
    }

    /**
     * Generate a prompt for structured edits
     */
    generateStructuredEditPrompt(context: {
        fileCount: number;
        fileList: string;
        userQuery: string;
        currentFile?: string;
    }): string {
        return `You are an expert coding assistant. When making code changes, use STRUCTURED, LINE-LEVEL EDITS instead of regenerating entire files.

## IMPORTANT: HOW TO MAKE CODE CHANGES

Use ONE of these formats:

### Option 1: JSON Format (Recommended)
\`\`\`json
{
  "explanation": "Brief explanation of changes",
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "edits": [
        {
          "startLine": 42,        // 0-based line number where edit starts
          "endLine": 57,          // 0-based line number where edit ends (exclusive)
          "oldContent": "original code to replace (optional, for verification)",
          "newContent": "new code to insert"
        }
      ]
    }
  ]
}
\`\`\`

### Option 2: Unified Diff Format
\`\`\`diff
--- a/path/to/file.ext
+++ b/path/to/file.ext
@@ -42,16 +42,20 @@
 old line 1
 old line 2
+new line 1
+new line 2
 remaining context
\`\`\`

## WHY STRUCTURED EDITS?

❌ Don't regenerate entire files - it loses context, breaks formatting, makes diffs unreadable
✅ Use line-level edits - precise, readable, safe
✅ Edit only what needs to change
✅ Preserve imports, comments, formatting

## EXAMPLE

User asks: "Add error handling to the processOrder function"

❌ Wrong:
\`\`\`json
{"file": "orders.py", "content": "entire file with error handling added"}
\`\`\`

✅ Correct:
\`\`\`json
{
  "explanation": "Added try-catch block and error logging to processOrder function",
  "files": [
    {
      "path": "orders.py",
      "edits": [
        {
          "startLine": 15,
          "endLine": 22,
          "newContent": "    try:\\n        result = process_order_internal(order)\\n        logger.info(f\"Order {order_id} processed successfully\")\\n    except Exception as e:\\n        logger.error(f\"Failed to process order {order_id}: {e}\")\\n        raise"
        }
      ]
    }
  ]
}
\`\`\`

## CURRENT CONTEXT

Files in workspace: ${context.fileCount}
File list:
${context.fileList}

${context.currentFile ? `Current file: ${context.currentFile}` : ''}

User request: ${context.userQuery}

Remember: Use structured edits for cleaner, more maintainable code changes!`;
    }
}
