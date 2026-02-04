/**
 * File Manager
 * Handles file reading and context collection
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExclusionManager } from './exclusionManager';
import { Logger } from './logger';

export interface FileContext {
    path: string;
    content: string;
    language: string;
}

export class FileManager {
    private workspaceRoot: string;

    constructor(private exclusionManager?: ExclusionManager) {
        // Get current working directory as workspace root
        this.workspaceRoot = this.getCurrentWorkingDirectory();
        Logger.log(`FileManager initialized with workspace root: ${this.workspaceRoot}`);
    }

    /**
     * Get the current working directory
     */
    private getCurrentWorkingDirectory(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.fsPath;
        }

        // Fallback to current process working directory
        return process.cwd();
    }

    /**
     * Get workspace root path
     */
    getWorkspaceRoot(): string {
        return this.workspaceRoot;
    }

    /**
     * Get current file context
     */
    async getCurrentFile(): Promise<FileContext | null> {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            return null;
        }

        const uri = editor.document.uri;
        const content = editor.document.getText();
        const language = editor.document.languageId;

        return {
            path: this.getRelativePath(uri),
            content,
            language
        };
    }

    /**
     * Get selected files context
     */
    async getSelectedFiles(uris: vscode.Uri[]): Promise<FileContext[]> {
        const contexts: FileContext[] = [];

        for (const uri of uris) {
            try {
                // Check if file should be excluded
                if (this.exclusionManager && await this.exclusionManager.shouldExcludeFile(uri.fsPath)) {
                    console.log(`Excluding file: ${uri.fsPath}`);
                    continue;
                }

                const content = await vscode.workspace.fs.readFile(uri);
                const decoder = new TextDecoder();
                const text = decoder.decode(content);

                const language = this.getLanguageFromPath(uri.fsPath);

                contexts.push({
                    path: this.getRelativePath(uri),
                    content: text,
                    language
                });
            } catch (error) {
                console.error(`Failed to read file: ${uri.fsPath}`, error);
            }
        }

        return contexts;
    }

    /**
     * Get all workspace files automatically
     * This is the main method that collects all relevant files from the workspace
     */
    async getWorkspaceFiles(): Promise<FileContext[]> {
        Logger.log(`=== Collecting workspace files from: ${this.workspaceRoot} ===`);
        const contexts: FileContext[] = [];

        try {
            // Check if workspace root exists and is accessible
            try {
                await fs.promises.access(this.workspaceRoot, fs.constants.R_OK);
                Logger.log(`✓ Workspace root is accessible: ${this.workspaceRoot}`);
            } catch (accessError) {
                Logger.error(`✗ Workspace root not accessible: ${this.workspaceRoot}`, accessError);
                return contexts; // Return empty array, don't throw
            }

            // Recursively get all files from workspace root
            Logger.log(`Scanning directory recursively...`);
            const allFiles = await this.getAllFilesRecursive(this.workspaceRoot);
            Logger.log(`Found ${allFiles.length} total files (before filtering)`);

            // Get exclusions
            const excludedPatterns = await this.getExcludedPatterns();
            Logger.log(`Excluded patterns: ${excludedPatterns.join(', ')}`);

            let skippedCount = 0;
            let binaryCount = 0;
            let largeCount = 0;
            let extensionFiltered = 0;

            for (const filePath of allFiles) {
                // Skip excluded files
                if (this.shouldExcludeFile(filePath, excludedPatterns)) {
                    skippedCount++;
                    Logger.debug(`Skipping excluded file: ${filePath}`);
                    continue;
                }

                try {
                    const stats = await fs.promises.stat(filePath);

                    // Skip directories
                    if (stats.isDirectory()) {
                        continue;
                    }

                    // Skip very large files (>1MB)
                    if (stats.size > 1024 * 1024) {
                        largeCount++;
                        Logger.debug(`Skipping large file (${Math.round(stats.size / 1024)}KB): ${filePath}`);
                        continue;
                    }

                    // Read file content
                    const content = await fs.promises.readFile(filePath, 'utf-8');

                    // Skip binary files
                    if (this.isBinaryContent(content)) {
                        binaryCount++;
                        Logger.debug(`Skipping binary file: ${filePath}`);
                        continue;
                    }

                    // Get relative path from workspace root
                    const relativePath = path.relative(this.workspaceRoot, filePath);
                    const language = this.getLanguageFromPath(filePath);

                    contexts.push({
                        path: relativePath,
                        content,
                        language
                    });
                } catch (error) {
                    Logger.debug(`Skipping unreadable file: ${filePath} - ${error}`);
                }
            }

            Logger.log(`=== File Collection Summary ===`);
            Logger.log(`Total files found: ${allFiles.length}`);
            Logger.log(`Excluded by pattern: ${skippedCount}`);
            Logger.log(`Binary files: ${binaryCount}`);
            Logger.log(`Large files (>1MB): ${largeCount}`);
            Logger.log(`✓ Final usable files: ${contexts.length}`);
            Logger.log(`File list: ${contexts.map(f => f.path).slice(0, 10).join(', ')}${contexts.length > 10 ? '...' : ''}`);

            return contexts;
        } catch (error) {
            Logger.error('Failed to collect workspace files', error);
            return contexts;
        }
    }

    /**
     * Recursively get all files from a directory
     */
    private async getAllFilesRecursive(dir: string): Promise<string[]> {
        const files: string[] = [];

        try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Only skip .git and node_modules (allow hidden dirs like .vscode, .idea, etc.)
                    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '__pycache__') {
                        continue;
                    }
                    // Recursively read subdirectory
                    const subFiles = await this.getAllFilesRecursive(fullPath);
                    files.push(...subFiles);
                } else {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Skip directories we can't read
        }

        return files;
    }

    /**
     * Get excluded patterns from ExclusionManager
     */
    private async getExcludedPatterns(): Promise<string[]> {
        // Only exclude essential directories, let user configure others
        const patterns: string[] = ['node_modules', '.git', '__pycache__', '.venv', 'venv', 'env'];

        if (this.exclusionManager) {
            // Get custom exclusions
            const customExcludes = await this.exclusionManager.getExcludedPatterns();
            patterns.push(...customExcludes);
        }

        return patterns;
    }

    /**
     * Check if a file should be excluded
     */
    private shouldExcludeFile(filePath: string, excludedPatterns: string[]): boolean {
        const relativePath = path.relative(this.workspaceRoot, filePath);

        // Check against patterns
        for (const pattern of excludedPatterns) {
            if (relativePath.includes(pattern) || filePath.includes(pattern)) {
                return true;
            }
        }

        // Check file extensions that should be excluded (binaries only)
        const excludedExtensions = [
            '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot',
            '.mp3', '.mp4', '.avi', '.mov', '.zip', '.tar', '.gz', '.rar', '.7z',
            '.exe', '.dll', '.so', '.dylib', '.bin',
            '.pyc', '.pyo', '.pyd'
        ];

        for (const ext of excludedExtensions) {
            if (filePath.endsWith(ext)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get git diff
     */
    async getGitDiff(): Promise<string> {
        try {
            const diff = await vscode.env.clipboard.readText();
            // This is a placeholder - actual git diff would use VS Code's Git API
            return 'Git diff not yet implemented';
        } catch (error) {
            return '';
        }
    }

    /**
     * Format files for GPT context
     */
    formatFilesForContext(files: FileContext[]): string {
        if (files.length === 0) {
            return 'No files provided.';
        }

        return files
            .map(
                (file) => `
--- FILE: ${file.path} (Language: ${file.language}) ---
${file.content}

--- END FILE ---
`
            )
            .join('\n');
    }

    /**
     * Get relative path from workspace
     */
    private getRelativePath(uri: vscode.Uri): string {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

        if (workspaceFolder) {
            return path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
        }

        return uri.fsPath;
    }

    /**
     * Get language from file path
     */
    private getLanguageFromPath(filePath: string): string {
        const ext = path.extname(filePath);
        const languageMap: { [key: string]: string } = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.py': 'python',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.cs': 'csharp',
            '.go': 'go',
            '.rs': 'rust',
            '.php': 'php',
            '.rb': 'ruby',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.sass': 'sass',
            '.less': 'less',
            '.json': 'json',
            '.xml': 'xml',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.md': 'markdown',
            '.sh': 'shellscript',
            '.bash': 'shellscript',
            '.zsh': 'shellscript',
            '.fish': 'fish',
            '.sql': 'sql',
            '.dart': 'dart',
            '.lua': 'lua',
            '.r': 'r',
            '.toml': 'toml',
            '.ini': 'ini',
            '.cfg': 'ini'
        };

        return languageMap[ext] || 'text';
    }

    /**
     * Check if content is binary
     */
    private isBinaryContent(content: string): boolean {
        // Check for null bytes (common in binary files)
        if (content.includes('\0')) {
            return true;
        }

        // Check ratio of non-text characters
        const sample = content.slice(0, 1000);
        let nonTextChars = 0;

        for (let i = 0; i < sample.length; i++) {
            const code = sample.charCodeAt(i);
            // Non-printable ASCII and high bytes suggest binary
            if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code > 126) {
                nonTextChars++;
            }
        }

        // If more than 30% non-text chars, consider it binary
        return nonTextChars / sample.length > 0.3;
    }

    /**
     * Apply file changes
     */
    async applyFileChanges(
        changes: Array<{ path: string; action: string; content: string }>
    ): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            throw new Error('No workspace folder open');
        }

        for (const change of changes) {
            const filePath = path.join(workspaceFolders[0].uri.fsPath, change.path);
            const uri = vscode.Uri.file(filePath);

            if (change.action === 'delete') {
                await vscode.workspace.fs.delete(uri);
            } else {
                const encoder = new TextEncoder();
                const content = encoder.encode(change.content);
                await vscode.workspace.fs.writeFile(uri, content);
            }
        }
    }
}
