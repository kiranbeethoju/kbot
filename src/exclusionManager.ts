/**
 * Exclusion Manager
 * Manages files and directories to exclude from context collection
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface ExclusionConfig {
    excludePatterns: string[];      // Glob patterns like "**/*.secret", ".env"
    excludeDirectories: string[];    // Directory names like "node_modules", ".git"
    excludeFiles: string[];          // Specific file paths like "config/keys.json"
}

export class ExclusionManager {
    private static readonly CONFIG_KEY = 'azure.gpt.exclusions';
    private static readonly DEFAULT_CONFIG: ExclusionConfig = {
        excludePatterns: [
            '**/*.secret',
            '**/*.key',
            '**/*.pem',
            '**/.env*',
            '**/credentials.json',
            '**/secrets.*',
            '**/*password*',
            '**/*.min.js',
            '**/*.min.css',
            '**/package-lock.json',
            '**/yarn.lock',
            '**/pnpm-lock.yaml'
        ],
        excludeDirectories: [
            'node_modules',
            '.git',
            'dist',
            'build',
            'out',
            'target',
            'bin',
            'obj',
            '.next',
            '.nuxt',
            'coverage',
            '.vscode-test',
            '__pycache__',
            'venv',
            '.venv',
            'env'
        ],
        excludeFiles: []
    };

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Get exclusion configuration
     */
    async getExclusions(): Promise<ExclusionConfig> {
        const stored =
            this.context.workspaceState.get<ExclusionConfig>(
                ExclusionManager.CONFIG_KEY
            );

        return stored || { ...ExclusionManager.DEFAULT_CONFIG };
    }

    /**
     * Save exclusion configuration
     */
    async saveExclusions(config: ExclusionConfig): Promise<void> {
        await this.context.workspaceState.update(
            ExclusionManager.CONFIG_KEY,
            config
        );
    }

    /**
     * Reset to defaults
     */
    async resetToDefaults(): Promise<void> {
        await this.context.workspaceState.update(
            ExclusionManager.CONFIG_KEY,
            undefined
        );
    }

    /**
     * Check if a file should be excluded
     */
    async shouldExcludeFile(filePath: string): Promise<boolean> {
        const config = await this.getExclusions();
        const relativePath = this.getRelativePath(filePath);

        // Check specific file exclusions
        if (config.excludeFiles.some((excl) => relativePath.includes(excl) || excl.includes(relativePath))) {
            return true;
        }

        // Check directory exclusions
        const pathParts = relativePath.split(path.sep);
        for (const part of pathParts) {
            if (config.excludeDirectories.includes(part)) {
                return true;
            }
        }

        // Check pattern exclusions (simple glob matching)
        for (const pattern of config.excludePatterns) {
            if (this.matchesPattern(relativePath, pattern)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if a directory should be excluded
     */
    async shouldExcludeDirectory(dirName: string): Promise<boolean> {
        const config = await this.getExclusions();
        return config.excludeDirectories.includes(dirName);
    }

    /**
     * Filter out excluded files from a list
     */
    async filterExcludedFiles(files: vscode.Uri[]): Promise<vscode.Uri[]> {
        const filtered: vscode.Uri[] = [];

        for (const file of files) {
            if (!(await this.shouldExcludeFile(file.fsPath))) {
                filtered.push(file);
            }
        }

        return filtered;
    }

    /**
     * Build exclude pattern for vscode.workspace.findFiles
     */
    async buildExcludePattern(): Promise<string> {
        const config = await this.getExclusions();
        const patterns: string[] = [];

        // Add directories
        for (const dir of config.excludeDirectories) {
            patterns.push(`**/${dir}/**`);
        }

        // Add glob patterns
        patterns.push(...config.excludePatterns);

        // Join with |
        return patterns.join('|');
    }

    /**
     * Simple glob pattern matching
     */
    private matchesPattern(filePath: string, pattern: string): boolean {
        // Convert glob pattern to regex
        let regexPattern = pattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '.');

        regexPattern = `^${regexPattern}$`;

        const regex = new RegExp(regexPattern, 'i');
        return regex.test(filePath);
    }

    /**
     * Get relative path from workspace
     */
    private getRelativePath(filePath: string): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        if (workspaceFolder) {
            return path.relative(workspaceFolder.uri.fsPath, filePath);
        }

        return filePath;
    }

    /**
     * Add exclusion pattern
     */
    async addExclusion(type: 'pattern' | 'directory' | 'file', value: string): Promise<void> {
        const config = await this.getExclusions();

        switch (type) {
            case 'pattern':
                if (!config.excludePatterns.includes(value)) {
                    config.excludePatterns.push(value);
                }
                break;
            case 'directory':
                if (!config.excludeDirectories.includes(value)) {
                    config.excludeDirectories.push(value);
                }
                break;
            case 'file':
                if (!config.excludeFiles.includes(value)) {
                    config.excludeFiles.push(value);
                }
                break;
        }

        await this.saveExclusions(config);
    }

    /**
     * Remove exclusion
     */
    async removeExclusion(type: 'pattern' | 'directory' | 'file', value: string): Promise<void> {
        const config = await this.getExclusions();

        switch (type) {
            case 'pattern':
                config.excludePatterns = config.excludePatterns.filter((p) => p !== value);
                break;
            case 'directory':
                config.excludeDirectories = config.excludeDirectories.filter((d) => d !== value);
                break;
            case 'file':
                config.excludeFiles = config.excludeFiles.filter((f) => f !== value);
                break;
        }

        await this.saveExclusions(config);
    }

    /**
     * Show exclusion configuration UI
     */
    async showConfigurationUI(): Promise<void> {
        const config = await this.getExclusions();

        const action = await vscode.window.showQuickPick(
            [
                {
                    label: '$(plus) Add Pattern',
                    description: 'Add glob pattern (e.g., "**/*.secret")',
                    value: 'add-pattern'
                },
                {
                    label: '$(plus) Add Directory',
                    description: 'Add directory to exclude (e.g., "node_modules")',
                    value: 'add-directory'
                },
                {
                    label: '$(plus) Add File',
                    description: 'Add specific file to exclude',
                    value: 'add-file'
                },
                {
                    label: '$(remove) Remove Pattern',
                    description: `Remove pattern (${config.excludePatterns.length} configured)`,
                    value: 'remove-pattern'
                },
                {
                    label: '$(remove) Remove Directory',
                    description: `Remove directory (${config.excludeDirectories.length} configured)`,
                    value: 'remove-directory'
                },
                {
                    label: '$(remove) Remove File',
                    description: `Remove file (${config.excludeFiles.length} configured)`,
                    value: 'remove-file'
                },
                {
                    label: '$(refresh) Reset to Defaults',
                    description: 'Reset all exclusions to default values',
                    value: 'reset'
                },
                {
                    label: '$(list) View All Exclusions',
                    description: 'Show all configured exclusions',
                    value: 'view'
                }
            ],
            {
                placeHolder: 'Manage exclusion rules'
            }
        );

        if (!action) {
            return;
        }

        switch (action.value) {
            case 'add-pattern':
                const pattern = await vscode.window.showInputBox({
                    placeHolder: '**/*.secret',
                    prompt: 'Enter glob pattern to exclude (supports * and **)'
                });
                if (pattern) {
                    await this.addExclusion('pattern', pattern);
                    vscode.window.showInformationMessage(`Pattern "${pattern}" added`);
                }
                break;

            case 'add-directory':
                const directory = await vscode.window.showInputBox({
                    placeHolder: 'node_modules',
                    prompt: 'Enter directory name to exclude'
                });
                if (directory) {
                    await this.addExclusion('directory', directory);
                    vscode.window.showInformationMessage(`Directory "${directory}" added`);
                }
                break;

            case 'add-file':
                const file = await vscode.window.showInputBox({
                    placeHolder: 'config/keys.json',
                    prompt: 'Enter file path to exclude (relative to workspace)'
                });
                if (file) {
                    await this.addExclusion('file', file);
                    vscode.window.showInformationMessage(`File "${file}" added`);
                }
                break;

            case 'remove-pattern':
                const patternToRemove = await vscode.window.showQuickPick(
                    config.excludePatterns.map((p) => ({ label: p, value: p })),
                    { placeHolder: 'Select pattern to remove' }
                );
                if (patternToRemove) {
                    await this.removeExclusion('pattern', patternToRemove.value);
                    vscode.window.showInformationMessage(`Pattern "${patternToRemove.value}" removed`);
                }
                break;

            case 'remove-directory':
                const dirToRemove = await vscode.window.showQuickPick(
                    config.excludeDirectories.map((d) => ({ label: d, value: d })),
                    { placeHolder: 'Select directory to remove' }
                );
                if (dirToRemove) {
                    await this.removeExclusion('directory', dirToRemove.value);
                    vscode.window.showInformationMessage(`Directory "${dirToRemove.value}" removed`);
                }
                break;

            case 'remove-file':
                const fileToRemove = await vscode.window.showQuickPick(
                    config.excludeFiles.map((f) => ({ label: f, value: f })),
                    { placeHolder: 'Select file to remove' }
                );
                if (fileToRemove) {
                    await this.removeExclusion('file', fileToRemove.value);
                    vscode.window.showInformationMessage(`File "${fileToRemove.value}" removed`);
                }
                break;

            case 'reset':
                const confirmed = await vscode.window.showWarningMessage(
                    'Reset all exclusions to defaults?',
                    'Yes',
                    'No'
                );
                if (confirmed === 'Yes') {
                    await this.resetToDefaults();
                    vscode.window.showInformationMessage('Exclusions reset to defaults');
                }
                break;

            case 'view':
                await this.showAllExclusions(config);
                break;
        }
    }

    /**
     * Show all exclusions in a new document
     */
    private async showAllExclusions(config: ExclusionConfig): Promise<void> {
        const content = `
# Azure GPT Exclusions Configuration

## Glob Patterns (${config.excludePatterns.length})
${config.excludePatterns.map((p) => `- ${p}`).join('\n')}

## Directories (${config.excludeDirectories.length})
${config.excludeDirectories.map((d) => `- ${d}`).join('\n')}

## Files (${config.excludeFiles.length})
${config.excludeFiles.map((f) => `- ${f}`).join('\n')}

---

These files and directories will be excluded from context sent to Azure GPT.
Configure via command palette: "Azure GPT: Configure Exclusions"
        `.trim();

        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(doc);
    }
}
