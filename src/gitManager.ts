/**
 * Git Manager
 * Handles git operations for tracking AI-generated changes
 */

import * as vscode from 'vscode';
import { Logger } from './logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitChange {
    path: string;
    action: 'update' | 'create' | 'delete';
    content: string;
    originalContent?: string;
}

export class GitManager {
    private workspaceRoot: string;

    constructor() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder open');
        }
        this.workspaceRoot = workspaceFolders[0].uri.fsPath;
    }

    /**
     * Check if git is initialized
     */
    async isGitInitialized(): Promise<boolean> {
        try {
            const gitDir = `${this.workspaceRoot}/.git`;
            await vscode.workspace.fs.stat(vscode.Uri.file(gitDir));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Initialize git repository
     */
    async initializeGit(): Promise<void> {
        try {
            Logger.log('Initializing git repository...');

            await execAsync('git init', { cwd: this.workspaceRoot });
            await execAsync('git config user.name "Prime DevBot"', { cwd: this.workspaceRoot });
            await execAsync('git config user.email "azure-gpt@vscode"', { cwd: this.workspaceRoot });

            // Create initial commit
            await this.createCommit('chore: initial commit - AI assistant tracking', true);

            Logger.log('Git repository initialized successfully');
            vscode.window.showInformationMessage('Git initialized - AI changes will be tracked');
        } catch (error: any) {
            Logger.error('Failed to initialize git', error);
            throw new Error(`Failed to initialize git: ${error.message}`);
        }
    }

    /**
     * Ensure git is initialized
     */
    async ensureGitInitialized(): Promise<void> {
        if (!await this.isGitInitialized()) {
            const init = await vscode.window.showWarningMessage(
                'Git is not initialized in this workspace. Would you like to initialize it to track AI changes?',
                'Initialize',
                'Cancel'
            );

            if (init === 'Initialize') {
                await this.initializeGit();
            } else {
                throw new Error('Git not initialized - cannot track changes');
            }
        }
    }

    /**
     * Get file status
     */
    async getFileStatus(filePath: string): Promise<'modified' | 'created' | 'deleted' | 'none'> {
        try {
            const relativePath = this.getRelativePath(filePath);
            const { stdout } = await execAsync(`git status --porcelain "${relativePath}"`, { cwd: this.workspaceRoot });

            if (stdout.startsWith(' M') || stdout.startsWith('M')) {
                return 'modified';
            } else if (stdout.startsWith('??')) {
                return 'created';
            } else if (stdout.startsWith(' D') || stdout.startsWith('D')) {
                return 'deleted';
            }
            return 'none';
        } catch {
            return 'none';
        }
    }

    /**
     * Get original file content before changes
     */
    async getOriginalContent(filePath: string): Promise<string | null> {
        try {
            const relativePath = this.getRelativePath(filePath);
            const { stdout } = await execAsync(`git show HEAD:"${relativePath}"`, { cwd: this.workspaceRoot });
            return stdout;
        } catch {
            // File might not exist in git yet
            return null;
        }
    }

    /**
     * Create a commit with AI-generated changes
     */
    async createCommit(message: string, isInitial = false): Promise<void> {
        try {
            Logger.log(`Creating git commit: ${message}`);

            if (!isInitial) {
                // Stage all changes
                await execAsync('git add -A', { cwd: this.workspaceRoot });
            }

            // Create commit
            await execAsync(`git commit -m "${message}"`, { cwd: this.workspaceRoot });

            Logger.log(`Git commit created successfully`);
        } catch (error: any) {
            // If nothing to commit, that's okay for initial commit
            if (!error.message.includes('nothing to commit')) {
                Logger.error('Failed to create git commit', error);
            }
        }
    }

    /**
     * Commit AI-generated changes with meaningful message
     */
    async commitAIChanges(changes: GitChange[], userMessage: string): Promise<void> {
        try {
            await this.ensureGitInitialized();

            const created = changes.filter(c => c.action === 'create');
            const modified = changes.filter(c => c.action === 'update');
            const deleted = changes.filter(c => c.action === 'delete');

            let commitMessage = `AI: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}\n\n`;

            if (created.length > 0) {
                commitMessage += `\nCreated:\n${created.map(c => `  - ${c.path}`).join('\n')}`;
            }
            if (modified.length > 0) {
                commitMessage += `\nModified:\n${modified.map(c => `  - ${c.path}`).join('\n')}`;
            }
            if (deleted.length > 0) {
                commitMessage += `\nDeleted:\n${deleted.map(c => `  - ${c.path}`).join('\n')}`;
            }

            await this.createCommit(commitMessage);
            vscode.window.showInformationMessage(`Changes committed: ${changes.length} file(s)`);
        } catch (error: any) {
            Logger.error('Failed to commit AI changes', error);
            vscode.window.showWarningMessage(`Could not commit changes: ${error.message}`);
        }
    }

    /**
     * Get commit history
     */
    async getCommitHistory(limit = 10): Promise<Array<{ hash: string; message: string; date: string }>> {
        try {
            const { stdout } = await execAsync(`git log -${limit} --pretty=format:"%H|%s|%ad" --date=iso`, { cwd: this.workspaceRoot });

            return stdout.split('\n').filter(Boolean).map(line => {
                const [hash, message, date] = line.split('|');
                return { hash, message, date };
            });
        } catch {
            return [];
        }
    }

    /**
     * Get diff for a file
     */
    async getFileDiff(filePath: string): Promise<string> {
        try {
            const relativePath = this.getRelativePath(filePath);
            const { stdout } = await execAsync(`git diff "${relativePath}"`, { cwd: this.workspaceRoot });
            return stdout;
        } catch {
            return '';
        }
    }

    /**
     * Get relative path from workspace root
     */
    private getRelativePath(filePath: string): string {
        return filePath.replace(this.workspaceRoot + '/', '').replace(this.workspaceRoot, '');
    }

    /**
     * Show git log output channel
     */
    async showGitLog(): Promise<void> {
        const commits = await this.getCommitHistory(20);

        if (commits.length === 0) {
            vscode.window.showInformationMessage('No git history found');
            return;
        }

        Logger.log('=== Git Commit History ===');
        commits.forEach(commit => {
            Logger.log(`${commit.hash.substring(0, 8)} - ${commit.message} (${commit.date})`);
        });
        Logger.show();
    }
}
