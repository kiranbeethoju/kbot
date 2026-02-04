/**
 * Backup Manager
 * Handles file backups and rollback functionality
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface BackupEntry {
    originalPath: string;
    backupPath: string;
    timestamp: number;
}

export class BackupManager {
    private readonly BACKUP_DIR = '.local-azure-gpt-backup';
    private backups: BackupEntry[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.loadBackups();
    }

    /**
     * Create backup of a file before modification
     */
    async backupFile(filePath: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            return;
        }

        try {
            const fullPath = path.join(workspaceFolders[0].uri.fsPath, filePath);
            const uri = vscode.Uri.file(fullPath);

            const content = await vscode.workspace.fs.readFile(uri);
            const backupDir = path.join(workspaceFolders[0].uri.fsPath, this.BACKUP_DIR);

            // Create backup directory if it doesn't exist
            try {
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(backupDir));
            } catch (error) {
                // Directory might already exist
            }

            const timestamp = Date.now();
            const backupFileName = `${path.basename(filePath)}.${timestamp}.bak`;
            const backupPath = path.join(backupDir, backupFileName);
            const backupUri = vscode.Uri.file(backupPath);

            await vscode.workspace.fs.writeFile(backupUri, content);

            this.backups.push({
                originalPath: filePath,
                backupPath: backupPath,
                timestamp
            });

            await this.saveBackups();
        } catch (error) {
            console.error(`Failed to backup file: ${filePath}`, error);
        }
    }

    /**
     * Backup multiple files
     */
    async backupFiles(filePaths: string[]): Promise<void> {
        for (const filePath of filePaths) {
            await this.backupFile(filePath);
        }
    }

    /**
     * Rollback last backup
     */
    async rollback(): Promise<void> {
        if (this.backups.length === 0) {
            vscode.window.showInformationMessage('No backups to rollback');
            return;
        }

        const lastBackup = this.backups[this.backups.length - 1];

        const confirmed = await vscode.window.showWarningMessage(
            `Rollback changes to ${lastBackup.originalPath}?`,
            'Yes',
            'No'
        );

        if (confirmed !== 'Yes') {
            return;
        }

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;

            if (!workspaceFolders) {
                throw new Error('No workspace folder open');
            }

            const backupUri = vscode.Uri.file(lastBackup.backupPath);
            const backupContent = await vscode.workspace.fs.readFile(backupUri);

            const originalUri = vscode.Uri.file(
                path.join(workspaceFolders[0].uri.fsPath, lastBackup.originalPath)
            );

            await vscode.workspace.fs.writeFile(originalUri, backupContent);

            vscode.window.showInformationMessage(
                `Successfully rolled back ${lastBackup.originalPath}`
            );
        } catch (error: any) {
            vscode.window.showErrorMessage(
                `Failed to rollback: ${error.message}`
            );
        }
    }

    /**
     * Clear all backups
     */
    async clearBackups(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            return;
        }

        try {
            const backupDir = path.join(
                workspaceFolders[0].uri.fsPath,
                this.BACKUP_DIR
            );
            const backupUri = vscode.Uri.file(backupDir);

            await vscode.workspace.fs.delete(backupUri, { recursive: true });

            this.backups = [];
            await this.saveBackups();
        } catch (error) {
            console.error('Failed to clear backups', error);
        }
    }

    /**
     * Load backups from storage
     */
    private loadBackups(): void {
        this.backups =
            this.context.globalState.get<BackupEntry[]>('azure.gpt.backups') || [];
    }

    /**
     * Save backups to storage
     */
    private async saveBackups(): Promise<void> {
        await this.context.globalState.update('azure.gpt.backups', this.backups);
    }
}
