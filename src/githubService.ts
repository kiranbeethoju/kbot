/**
 * GitHub Service
 * Handles GitHub API integration for PR status checks and comments
 */

import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import { Logger } from './logger';
import { GitHubCredentials, GitHubRepository, GitHubPullRequest, GitHubStatusCheck } from './types';
import { CredentialManager } from './credentials';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitHubService {
    private octokit: Octokit | null = null;
    private repository: GitHubRepository | null = null;

    constructor(
        private context: vscode.ExtensionContext,
        private credentialManager: CredentialManager
    ) {
        this.loadCredentials();
    }

    /**
     * Load GitHub credentials from secure storage
     */
    private async loadCredentials(): Promise<void> {
        try {
            const token = await this.context.secrets.get('github.token');
            if (token) {
                this.octokit = new Octokit({ auth: token });
                Logger.log('GitHub credentials loaded');
            }
        } catch (error: any) {
            Logger.warn('Failed to load GitHub credentials', error);
        }
    }

    /**
     * Save GitHub credentials to secure storage
     */
    async saveCredentials(token: string): Promise<void> {
        try {
            await this.context.secrets.store('github.token', token);
            this.octokit = new Octokit({ auth: token });
            Logger.log('GitHub credentials saved successfully');
            vscode.window.showInformationMessage('GitHub credentials saved!');
        } catch (error: any) {
            Logger.error('Failed to save GitHub credentials', error);
            throw new Error(`Failed to save credentials: ${error.message}`);
        }
    }

    /**
     * Get stored GitHub token (masked)
     */
    async getToken(): Promise<string | null> {
        const token = await this.context.secrets.get('github.token');
        return token ? '••••••••' : null;
    }

    /**
     * Clear GitHub credentials
     */
    async clearCredentials(): Promise<void> {
        try {
            await this.context.secrets.delete('github.token');
            this.octokit = null;
            Logger.log('GitHub credentials cleared');
            vscode.window.showInformationMessage('GitHub credentials cleared!');
        } catch (error: any) {
            Logger.error('Failed to clear GitHub credentials', error);
            throw new Error(`Failed to clear credentials: ${error.message}`);
        }
    }

    /**
     * Check if GitHub is configured
     */
    isConfigured(): boolean {
        return this.octokit !== null;
    }

    /**
     * Test GitHub credentials
     */
    async testCredentials(): Promise<boolean> {
        if (!this.octokit) {
            return false;
        }

        try {
            await this.octokit.rest.users.getAuthenticated();
            Logger.log('GitHub credentials test successful');
            return true;
        } catch (error: any) {
            Logger.error('GitHub credentials test failed', error);
            vscode.window.showErrorMessage(`GitHub authentication failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Detect repository from git config
     */
    async detectRepository(): Promise<GitHubRepository | null> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return null;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            // Get remote URL from git config
            const { stdout } = await execAsync('git remote get-url origin', { cwd: workspaceRoot });
            const remoteUrl = stdout.trim();

            // Parse GitHub URL
            // Supports: https://github.com/owner/repo.git or git@github.com:owner/repo.git
            let match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
            if (match) {
                this.repository = {
                    owner: match[1],
                    repo: match[2].replace('.git', '')
                };
                Logger.log(`Detected GitHub repository: ${this.repository.owner}/${this.repository.repo}`);
                return this.repository;
            }

            return null;
        } catch (error: any) {
            Logger.warn('Failed to detect GitHub repository', error);
            return null;
        }
    }

    /**
     * Get current repository
     */
    getRepository(): GitHubRepository | null {
        return this.repository;
    }

    /**
     * Get current PR number from git branch
     */
    async getCurrentPullRequest(): Promise<GitHubPullRequest | null> {
        if (!this.octokit || !this.repository) {
            return null;
        }

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return null;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: workspaceRoot });
            const branchName = stdout.trim();

            // Find PR for this branch
            const { data: pulls } = await this.octokit.rest.pulls.list({
                owner: this.repository.owner,
                repo: this.repository.repo,
                head: `${this.repository.owner}:${branchName}`,
                state: 'open'
            });

            if (pulls.length > 0) {
                const pr = pulls[0];
                Logger.log(`Found PR #${pr.number}: ${pr.title}`);
                return pr as GitHubPullRequest;
            }

            return null;
        } catch (error: any) {
            Logger.warn('Failed to get current PR', error);
            return null;
        }
    }

    /**
     * Create or update a status check on a commit
     */
    async createStatusCheck(
        sha: string,
        status: GitHubStatusCheck
    ): Promise<void> {
        if (!this.octokit || !this.repository) {
            throw new Error('GitHub not configured or no repository detected');
        }

        try {
            Logger.log(`Creating status check: ${status.state} - ${status.description}`);

            await this.octokit.rest.repos.createCommitStatus({
                owner: this.repository.owner,
                repo: this.repository.repo,
                commit_sha: sha,
                state: status.state,
                description: status.description,
                context: status.context,
                target_url: status.targetUrl
            });

            Logger.log(`Status check created successfully`);
        } catch (error: any) {
            Logger.error('Failed to create status check', error);
            throw new Error(`Failed to create status check: ${error.message}`);
        }
    }

    /**
     * Create a review comment on a PR
     */
    async createReviewComment(
        pullNumber: number,
        body: string,
        commitId: string,
        path: string,
        line: number
    ): Promise<void> {
        if (!this.octokit || !this.repository) {
            throw new Error('GitHub not configured or no repository detected');
        }

        try {
            Logger.log(`Creating review comment on ${path}:${line}`);

            await this.octokit.rest.pulls.createReviewComment({
                owner: this.repository.owner,
                repo: this.repository.repo,
                pull_number: pullNumber,
                body,
                commit_id: commitId,
                path,
                line,
                position: line
            });

            Logger.log(`Review comment created successfully`);
        } catch (error: any) {
            Logger.error('Failed to create review comment', error);
            throw new Error(`Failed to create review comment: ${error.message}`);
        }
    }

    /**
     * Update a review comment
     */
    async updateReviewComment(
        commentId: number,
        body: string
    ): Promise<void> {
        if (!this.octokit || !this.repository) {
            throw new Error('GitHub not configured or no repository detected');
        }

        try {
            Logger.log(`Updating review comment ${commentId}`);

            await this.octokit.rest.pulls.updateReviewComment({
                owner: this.repository.owner,
                repo: this.repository.repo,
                comment_id: commentId,
                body
            });

            Logger.log(`Review comment updated successfully`);
        } catch (error: any) {
            Logger.error('Failed to update review comment', error);
            throw new Error(`Failed to update review comment: ${error.message}`);
        }
    }

    /**
     * Create a pull request review
     */
    async createPullRequestReview(
        pullNumber: number,
        body: string,
        comments: Array<{
            path: string;
            line: number;
            body: string;
        }>,
        event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' = 'COMMENT'
    ): Promise<void> {
        if (!this.octokit || !this.repository) {
            throw new Error('GitHub not configured or no repository detected');
        }

        try {
            Logger.log(`Creating PR review: ${event} with ${comments.length} comments`);

            // Get the HEAD commit
            const { data: pull } = await this.octokit.rest.pulls.get({
                owner: this.repository.owner,
                repo: this.repository.repo,
                pull_number: pullNumber
            });

            await this.octokit.rest.pulls.createReview({
                owner: this.repository.owner,
                repo: this.repository.repo,
                pull_number: pullNumber,
                commit_id: pull.head.sha,
                body,
                comments,
                event
            });

            Logger.log(`PR review created successfully`);
        } catch (error: any) {
            Logger.error('Failed to create PR review', error);
            throw new Error(`Failed to create PR review: ${error.message}`);
        }
    }

    /**
     * Get authenticated user info
     */
    async getAuthenticatedUser(): Promise<{ login: string; name: string | null } | null> {
        if (!this.octokit) {
            return null;
        }

        try {
            const { data } = await this.octokit.rest.users.getAuthenticated();
            return {
                login: data.login,
                name: data.name
            };
        } catch (error: any) {
            Logger.warn('Failed to get authenticated user', error);
            return null;
        }
    }
}
