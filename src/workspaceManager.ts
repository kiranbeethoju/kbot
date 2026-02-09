/**
 * Workspace Manager
 * Manages manual workspace directory configuration
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Logger } from './logger';

export interface WorkspaceConfig {
    customWorkspacePath?: string;
    useAutoDetect: boolean;
}

export class WorkspaceManager {
    private static readonly CONFIG_KEY = 'kbot.workspace';
    private static readonly DEFAULT_CONFIG: WorkspaceConfig = {
        useAutoDetect: true
    };

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Get workspace configuration
     */
    async getWorkspaceConfig(): Promise<WorkspaceConfig> {
        const stored = this.context.globalState.get<WorkspaceConfig>(
            WorkspaceManager.CONFIG_KEY
        );

        return { ...WorkspaceManager.DEFAULT_CONFIG, ...stored };
    }

    /**
     * Save workspace configuration
     */
    async saveWorkspaceConfig(config: WorkspaceConfig): Promise<void> {
        await this.context.globalState.update(
            WorkspaceManager.CONFIG_KEY,
            config
        );
    }

    /**
     * Set custom workspace path
     */
    async setCustomWorkspacePath(workspacePath: string): Promise<void> {
        const config = await this.getWorkspaceConfig();

        // Validate the path exists
        try {
            await fs.promises.access(workspacePath, fs.constants.R_OK);
        } catch (error) {
            throw new Error(`Cannot access workspace directory: ${workspacePath}`);
        }

        config.customWorkspacePath = workspacePath;
        config.useAutoDetect = false;
        await this.saveWorkspaceConfig(config);

        Logger.log(`Custom workspace set to: ${workspacePath}`);
    }

    /**
     * Clear custom workspace and revert to auto-detect
     */
    async clearCustomWorkspace(): Promise<void> {
        const config = await this.getWorkspaceConfig();
        config.customWorkspacePath = undefined;
        config.useAutoDetect = true;
        await this.saveWorkspaceConfig(config);

        Logger.log('Cleared custom workspace, reverted to auto-detect');
    }

    /**
     * Get the workspace root path
     * Returns custom path if configured, otherwise returns null to let caller use auto-detect
     */
    async getWorkspaceRoot(): Promise<string | null> {
        const config = await this.getWorkspaceConfig();

        if (config.useAutoDetect) {
            return null; // Signal to use auto-detection
        }

        if (config.customWorkspacePath) {
            return config.customWorkspacePath;
        }

        return null;
    }

    /**
     * Show workspace configuration UI
     */
    async showConfigurationUI(): Promise<void> {
        const config = await this.getWorkspaceConfig();

        const currentWorkspace = config.useAutoDetect
            ? 'Auto-detect (VS Code workspace)'
            : config.customWorkspacePath || 'Not configured';

        const action = await vscode.window.showQuickPick(
            [
                {
                    label: '$(folder-open) Set Custom Workspace',
                    description: 'Manually specify a workspace directory',
                    value: 'set-custom'
                },
                {
                    label: '$(sync) Use Auto-Detect',
                    description: 'Automatically use VS Code workspace folder',
                    value: 'auto-detect'
                },
                {
                    label: '$(eye) View Current Workspace',
                    description: `Current: ${currentWorkspace}`,
                    value: 'view'
                }
            ],
            {
                placeHolder: 'Configure workspace directory'
            }
        );

        if (!action) {
            return;
        }

        switch (action.value) {
            case 'set-custom':
                await this.setCustomWorkspace();
                break;

            case 'auto-detect':
                await this.clearCustomWorkspace();
                vscode.window.showInformationMessage('Workspace set to auto-detect mode');
                break;

            case 'view':
                await this.showCurrentWorkspace(config);
                break;
        }
    }

    /**
     * Set custom workspace path via UI
     */
    private async setCustomWorkspace(): Promise<void> {
        const workspacePath = await vscode.window.showInputBox({
            placeHolder: '/path/to/workspace',
            prompt: 'Enter the full path to your workspace directory',
            value: process.cwd(),
            validateInput: (value: string) => {
                if (!value || value.trim() === '') {
                    return 'Path cannot be empty';
                }
                return null;
            }
        });

        if (!workspacePath) {
            return;
        }

        const expandedPath = this.expandPath(workspacePath);

        try {
            await this.setCustomWorkspacePath(expandedPath);
            vscode.window.showInformationMessage(`Workspace set to: ${expandedPath}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to set workspace: ${error.message}`);
        }
    }

    /**
     * Show current workspace information
     */
    private async showCurrentWorkspace(config: WorkspaceConfig): Promise<void> {
        const content = `
# Prime DevBot Workspace Configuration

## Current Mode: ${config.useAutoDetect ? 'Auto-Detect' : 'Custom'}

${config.useAutoDetect
    ? `The workspace is automatically detected from VS Code's workspace folders.\n\nCurrent VS Code workspace: ${this.getCurrentVSCodeWorkspace()}`
    : `Custom workspace path: ${config.customWorkspacePath}`
}

---

Configure via command palette: "Prime DevBot: Configure Workspace"
        `.trim();

        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(doc);
    }

    /**
     * Get current VS Code workspace
     */
    private getCurrentVSCodeWorkspace(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.fsPath;
        }
        return 'No workspace folder open';
    }

    /**
     * Expand path with home directory support
     */
    private expandPath(filePath: string): string {
        if (filePath.startsWith('~')) {
            return path.join(os.homedir(), filePath.slice(1));
        }
        return filePath;
    }
}
