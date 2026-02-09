/**
 * File Manager
 * Handles file reading and context collection
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExclusionManager } from './exclusionManager';
import { WorkspaceManager } from './workspaceManager';
import { Logger } from './logger';

export interface FileContext {
    path: string;
    content: string;
    language: string;
}

export class FileManager {
    private workspaceManager?: WorkspaceManager;

    constructor(
        private exclusionManager?: ExclusionManager,
        workspaceManager?: WorkspaceManager
    ) {
        this.workspaceManager = workspaceManager;
    }

    /**
     * Get the current working directory
     */
    private async getCurrentWorkingDirectory(): Promise<string> {
        // Check if custom workspace is configured
        if (this.workspaceManager) {
            const customWorkspace = await this.workspaceManager.getWorkspaceRoot();
            if (customWorkspace) {
                return customWorkspace;
            }
        }

        // Always prefer VS Code workspace folder when available
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const wsPath = workspaceFolders[0].uri.fsPath;
            Logger.log(`Using VS Code workspace folder: ${wsPath}`);
            return wsPath;
        }

        // If no workspace folder is open, use process.cwd() but validate it
        const cwd = process.cwd();
        Logger.log(`No workspace folder open, using process.cwd(): ${cwd}`);

        // If cwd is root or invalid, try to get a better fallback
        if (cwd === '/' || cwd === '' || !cwd) {
            // Try to get the path from the active editor
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const editorPath = activeEditor.document.uri.fsPath;
                if (editorPath) {
                    const dir = path.dirname(editorPath);
                    Logger.log(`Using active editor directory as fallback: ${dir}`);
                    return dir;
                }
            }
        }

        return cwd;
    }

    /**
     * Get workspace root path (dynamic, not cached)
     */
    async getWorkspaceRoot(): Promise<string> {
        // Always get the current workspace, don't use cached value
        return this.getCurrentWorkingDirectory();
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
        // Get workspace root dynamically
        const workspaceRoot = await this.getWorkspaceRoot();
        Logger.log(`=== Collecting workspace files ===`);
        Logger.log(`Workspace root: ${workspaceRoot}`);
        Logger.log(`Checking if directory exists and is readable...`);

        const contexts: FileContext[] = [];

        try {
            // Check if workspace root exists and is accessible
            try {
                await fs.promises.access(workspaceRoot, fs.constants.R_OK);
                Logger.log(`✓ Workspace root is accessible: ${workspaceRoot}`);
            } catch (accessError) {
                Logger.error(`✗ Workspace root not accessible: ${workspaceRoot}`, accessError);
                return contexts; // Return empty array, don't throw
            }

            // Recursively get all files from workspace root
            Logger.log(`Scanning directory recursively...`);
            const allFiles = await this.getAllFilesRecursive(workspaceRoot);
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
                if (await this.shouldExcludeFile(filePath, excludedPatterns)) {
                    skippedCount++;
                    const relativePath = path.relative(workspaceRoot, filePath);
                    Logger.log(`⚠️  Skipping excluded file: ${relativePath}`);
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
                        Logger.log(`⚠️  Skipping large file (${Math.round(stats.size / 1024)}KB): ${path.relative(workspaceRoot, filePath)}`);
                        continue;
                    }

                    // Read file content
                    const content = await fs.promises.readFile(filePath, 'utf-8');

                    // Skip binary files
                    if (this.isBinaryContent(content)) {
                        binaryCount++;
                        Logger.log(`⚠️  Skipping binary file: ${path.relative(workspaceRoot, filePath)}`);
                        continue;
                    }

                    // Get relative path from workspace root
                    const relativePath = path.relative(workspaceRoot, filePath);
                    const language = this.getLanguageFromPath(filePath);

                    contexts.push({
                        path: relativePath,
                        content,
                        language
                    });
                } catch (error: any) {
                    Logger.log(`⚠️  Skipping unreadable file: ${path.relative(workspaceRoot, filePath)} - ${error.message || error}`);
                }
            }

            Logger.log(`=== File Collection Summary ===`);
            Logger.log(`Total files found: ${allFiles.length}`);
            Logger.log(`Excluded by pattern: ${skippedCount}`);
            Logger.log(`Binary files: ${binaryCount}`);
            Logger.log(`Large files (>1MB): ${largeCount}`);
            Logger.log(`✓ Final usable files: ${contexts.length}`);
            Logger.log(`File list (first 15): ${contexts.map(f => f.path).slice(0, 15).join(', ')}${contexts.length > 15 ? '...' : ''}`);
            Logger.log(`All files:\n${contexts.map(f => `  - ${f.path}`).join('\n')}`);
            Logger.show();

            return contexts;
        } catch (error: any) {
            Logger.error('Failed to collect workspace files', error?.message || error?.toString() || error);
            Logger.error('Error details:', error);
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
                    // Skip specific directories that shouldn't be included in context
                    const skipDirs = ['.git', 'node_modules', '__pycache__', '.kbot-backup', '.local-azure-gpt-backup'];
                    if (skipDirs.includes(entry.name)) {
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
        const patterns: string[] = [
            'node_modules',
            '.git',
            '__pycache__',
            '.venv',
            'venv',
            'env',
            'dist',
            'build',
            '.kbot-backup',  // Exclude backup directory
            '.local-azure-gpt-backup'  // Exclude old backup directory
        ];

        if (this.exclusionManager) {
            try {
                // Get custom exclusions - fixed to use getExclusions() instead of getExcludedPatterns()
                const config = await this.exclusionManager.getExclusions();
                // Add directory exclusions
                patterns.push(...config.excludeDirectories);
                // Add pattern exclusions
                for (const pattern of config.excludePatterns) {
                    // Extract simple directory names from glob patterns
                    const match = pattern.match(/\*\*\/([^/]+)\//);
                    if (match) {
                        patterns.push(match[1]);
                    }
                }
            } catch (error) {
                Logger.warn('Failed to get custom exclusions, using defaults:', error);
            }
        }

        return patterns;
    }

    /**
     * Check if a file should be excluded
     */
    private async shouldExcludeFile(filePath: string, excludedPatterns: string[]): Promise<boolean> {
        const workspaceRoot = await this.getWorkspaceRoot();
        const relativePath = path.relative(workspaceRoot, filePath);

        // Check against patterns (directories only)
        for (const pattern of excludedPatterns) {
            // Only match if the path contains this pattern as a directory component
            const pathParts = relativePath.split(path.sep);
            if (pathParts.includes(pattern)) {
                return true;
            }
        }

        // Check file extensions that should be excluded (only truly binary files)
        const excludedExtensions = [
            '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot',
            '.mp3', '.mp4', '.avi', '.mov', '.zip', '.tar', '.gz', '.rar', '.7z',
            '.exe', '.dll', '.so', '.dylib', '.bin'
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

        // First, show a simple file list for quick reference
        let result = `\n## FILE LIST\n`;
        result += files.map(f => `- ${f.path} (${f.language})`).join('\n');
        result += `\n\n## FILE CONTENTS\n\n`;

        // Then show full contents with line numbers
        result += files
            .map(
                (file) => {
                    const lines = file.content.split('\n');
                    const numberedContent = lines
                        .map((line, idx) => `${idx.toString().padStart(3, ' ')}|${line}`)
                        .join('\n');

                    return `### FILE: ${file.path} (Language: ${file.language})
\`\`\`${file.language}
${numberedContent}
\`\`\`
`;
                }
            )
            .join('\n');

        return result;
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
     * Only returns true for truly binary files (images, executables, etc.)
     */
    private isBinaryContent(content: string): boolean {
        // Check for null bytes (definitive sign of binary file)
        if (content.includes('\0')) {
            return true;
        }

        // Check ratio of non-text characters in first 1000 chars
        const sample = content.slice(0, 1000);
        if (sample.length === 0) {
            return false;
        }

        let nonTextChars = 0;

        for (let i = 0; i < sample.length; i++) {
            const code = sample.charCodeAt(i);
            // Only ASCII control characters (0-8, 11-12, 14-31) are truly binary
            // Exclude: 9 (tab), 10 (LF), 13 (CR)
            // Everything else (including UTF-8 bytes 127+) is considered text
            if ((code >= 0 && code <= 8) || (code >= 11 && code <= 12) || (code >= 14 && code <= 31)) {
                nonTextChars++;
            }
        }

        // Only consider binary if more than 50% are non-text characters
        // This threshold is high to avoid false positives on files with special characters
        return nonTextChars / sample.length > 0.5;
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
