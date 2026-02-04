/**
 * Enhanced File Manager
 * Provides file operations with bash script support and user permissions
 */

import * as vscode from 'vscode';
import { ExclusionManager } from './exclusionManager';
import { TerminalManager } from './terminalManager';
import { Logger } from './logger';

export interface FileOperation {
    type: 'read' | 'write' | 'delete' | 'move' | 'bash';
    path?: string;
    content?: string;
    destination?: string;
    command?: string;
    requiresPermission?: boolean;
}

export interface FileOperationResult {
    success: boolean;
    output?: string;
    error?: string;
    operation: FileOperation;
}

export class EnhancedFileManager {
    constructor(
        private exclusionManager: ExclusionManager,
        private terminalManager: TerminalManager
    ) {}

    /**
     * Execute file operation with user permission for destructive actions
     */
    async executeOperation(operation: FileOperation): Promise<FileOperationResult> {
        try {
            // Check if operation requires user permission
            if (operation.requiresPermission !== false && this.isDestructiveOperation(operation)) {
                const confirmed = await this.requestUserPermission(operation);
                if (!confirmed) {
                    return {
                        success: false,
                        error: 'Operation cancelled by user',
                        operation
                    };
                }
            }

            // Check exclusions
            if (operation.path && await this.exclusionManager.shouldExcludeFile(operation.path)) {
                return {
                    success: false,
                    error: `File ${operation.path} is excluded from operations`,
                    operation
                };
            }

            switch (operation.type) {
                case 'read':
                    if (!operation.path) {
                        return { success: false, error: 'Path is required for read operation', operation };
                    }
                    return await this.readFile(operation.path);
                case 'write':
                    if (!operation.path) {
                        return { success: false, error: 'Path is required for write operation', operation };
                    }
                    return await this.writeFile(operation.path, operation.content || '');
                case 'delete':
                    if (!operation.path) {
                        return { success: false, error: 'Path is required for delete operation', operation };
                    }
                    return await this.deleteFile(operation.path);
                case 'move':
                    if (!operation.path || !operation.destination) {
                        return { success: false, error: 'Path and destination are required for move operation', operation };
                    }
                    return await this.moveFile(operation.path, operation.destination);
                case 'bash':
                    if (!operation.command) {
                        return { success: false, error: 'Command is required for bash operation', operation };
                    }
                    return await this.executeBashCommand(operation.command);
                default:
                    return {
                        success: false,
                        error: `Unknown operation type: ${operation.type}`,
                        operation
                    };
            }
        } catch (error: any) {
            Logger.error('File operation failed', error);
            return {
                success: false,
                error: error.message,
                operation
            };
        }
    }

    /**
     * Read file content
     */
    private async readFile(filePath: string): Promise<FileOperationResult> {
        try {
            const uri = vscode.Uri.file(filePath);
            const content = await vscode.workspace.fs.readFile(uri);
            const text = Buffer.from(content).toString('utf8');
            
            return {
                success: true,
                output: text,
                operation: { type: 'read', path: filePath }
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to read file ${filePath}: ${error.message}`,
                operation: { type: 'read', path: filePath }
            };
        }
    }

    /**
     * Write file content
     */
    private async writeFile(filePath: string, content: string): Promise<FileOperationResult> {
        try {
            const uri = vscode.Uri.file(filePath);
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
            
            return {
                success: true,
                output: `File ${filePath} written successfully`,
                operation: { type: 'write', path: filePath, content }
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to write file ${filePath}: ${error.message}`,
                operation: { type: 'write', path: filePath, content }
            };
        }
    }

    /**
     * Delete file with user permission
     */
    private async deleteFile(filePath: string): Promise<FileOperationResult> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.delete(uri);
            
            return {
                success: true,
                output: `File ${filePath} deleted successfully`,
                operation: { type: 'delete', path: filePath }
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to delete file ${filePath}: ${error.message}`,
                operation: { type: 'delete', path: filePath }
            };
        }
    }

    /**
     * Move file
     */
    private async moveFile(sourcePath: string, destinationPath: string): Promise<FileOperationResult> {
        try {
            const sourceUri = vscode.Uri.file(sourcePath);
            const destinationUri = vscode.Uri.file(destinationPath);
            await vscode.workspace.fs.rename(sourceUri, destinationUri);
            
            return {
                success: true,
                output: `File moved from ${sourcePath} to ${destinationPath}`,
                operation: { type: 'move', path: sourcePath, destination: destinationPath }
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to move file from ${sourcePath} to ${destinationPath}: ${error.message}`,
                operation: { type: 'move', path: sourcePath, destination: destinationPath }
            };
        }
    }

    /**
     * Execute bash command with safety checks
     */
    private async executeBashCommand(command: string): Promise<FileOperationResult> {
        try {
            // Safety check for dangerous commands
            if (this.isDangerousCommand(command)) {
                const confirmed = await this.requestUserPermission({
                    type: 'bash',
                    command,
                    requiresPermission: true
                });
                
                if (!confirmed) {
                    return {
                        success: false,
                        error: 'Dangerous command cancelled by user',
                        operation: { type: 'bash', command }
                    };
                }
            }

            const result = await this.terminalManager.executeCommand(command);
            
            return {
                success: true,
                output: result.output,
                error: result.error,
                operation: { type: 'bash', command }
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to execute bash command: ${error.message}`,
                operation: { type: 'bash', command }
            };
        }
    }

    /**
     * Check if operation is destructive
     */
    private isDestructiveOperation(operation: FileOperation): boolean {
        switch (operation.type) {
            case 'delete':
                return true;
            case 'write':
                // Check if file exists (overwriting)
                try {
                    const uri = vscode.Uri.file(operation.path);
                    vscode.workspace.fs.stat(uri);
                    return true; // File exists, so this is an overwrite
                } catch {
                    return false; // File doesn't exist, safe to create
                }
            case 'move':
                return true;
            case 'bash':
                return this.isDangerousCommand(operation.command || '');
            default:
                return false;
        }
    }

    /**
     * Check if bash command is dangerous
     */
    private isDangerousCommand(command: string): boolean {
        const dangerousPatterns = [
            /rm\s+-rf/i,           // Recursive force delete
            /rm\s+/i,              // Any delete command
            /dd\s+if=/i,           // Disk imaging
            /mkfs/i,               // Filesystem formatting
            /fdisk/i,              // Disk partitioning
            /format/i,             // Format commands
            /del\s+/i,             // Windows delete
            /rmdir/i,              // Remove directory
            />\s*\/dev/i,          // Writing to devices
            /shutdown/i,           // Shutdown commands
            /reboot/i,             // Reboot commands
            /halt/i,               // Halt commands
            /poweroff/i,           // Power off commands
        ];

        return dangerousPatterns.some(pattern => pattern.test(command));
    }

    /**
     * Request user permission for destructive operations
     */
    private async requestUserPermission(operation: FileOperation): Promise<boolean> {
        let message = '';
        
        switch (operation.type) {
            case 'delete':
                message = `Delete file: ${operation.path}?`;
                break;
            case 'write':
                message = `Overwrite file: ${operation.path}?`;
                break;
            case 'move':
                message = `Move file from ${operation.path} to ${operation.destination}?`;
                break;
            case 'bash':
                message = `Execute command: ${operation.command}?`;
                break;
            default:
                message = `Execute operation: ${operation.type} on ${operation.path}?`;
        }

        const result = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Yes',
            'No'
        );

        return result === 'Yes';
    }

    /**
     * Search files using grep-like functionality
     */
    async searchFiles(pattern: string, path?: string, options?: {
        caseSensitive?: boolean;
        wholeWord?: boolean;
        recursive?: boolean;
        filePattern?: string;
    }): Promise<FileOperationResult> {
        try {
            let command = `grep -n`;
            
            if (!options?.caseSensitive) {
                command += ' -i';
            }
            
            if (options?.wholeWord) {
                command += ' -w';
            }
            
            if (options?.recursive) {
                command += ' -r';
            }
            
            if (options?.filePattern) {
                command += ` --include=${options.filePattern}`;
            }
            
            command += ` "${pattern}" ${path || '.'}`;
            
            return await this.executeBashCommand(command);
        } catch (error: any) {
            return {
                success: false,
                error: `Search failed: ${error.message}`,
                operation: { type: 'bash', command: `grep ${pattern}` }
            };
        }
    }

    /**
     * Edit file using sed
     */
    async editFileWithSed(filePath: string, sedCommand: string): Promise<FileOperationResult> {
        try {
            const command = `sed -i.bak '${sedCommand}' "${filePath}"`;
            const result = await this.executeBashCommand(command);
            
            if (result.success) {
                // Show what changed
                const diffCommand = `diff "${filePath}.bak" "${filePath}"`;
                const diffResult = await this.executeBashCommand(diffCommand);
                
                return {
                    success: true,
                    output: `File edited successfully.\n\nChanges:\n${diffResult.output}`,
                    operation: { type: 'bash', command }
                };
            }
            
            return result;
        } catch (error: any) {
            return {
                success: false,
                error: `Sed edit failed: ${error.message}`,
                operation: { type: 'bash', command: `sed ${sedCommand} ${filePath}` }
            };
        }
    }

    /**
     * Execute bash script
     */
    async executeBashScript(scriptContent: string): Promise<FileOperationResult> {
        try {
            // Create temporary script file
            const tempScriptPath = `/tmp/devbot_script_${Date.now()}.sh`;
            await this.writeFile(tempScriptPath, scriptContent);
            
            // Make executable and run
            const chmodCommand = `chmod +x "${tempScriptPath}"`;
            await this.executeBashCommand(chmodCommand);
            
            const executeCommand = `"${tempScriptPath}"`;
            const result = await this.executeBashCommand(executeCommand);
            
            // Cleanup
            await this.deleteFile(tempScriptPath);
            
            return result;
        } catch (error: any) {
            return {
                success: false,
                error: `Script execution failed: ${error.message}`,
                operation: { type: 'bash', command: 'bash script' }
            };
        }
    }

    /**
     * Get file information
     */
    async getFileInfo(filePath: string): Promise<FileOperationResult> {
        try {
            const command = `ls -la "${filePath}"`;
            return await this.executeBashCommand(command);
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to get file info: ${error.message}`,
                operation: { type: 'bash', command: `ls -la ${filePath}` }
            };
        }
    }

    /**
     * List directory contents
     */
    async listDirectory(path: string): Promise<FileOperationResult> {
        try {
            const command = `ls -la "${path}"`;
            return await this.executeBashCommand(command);
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to list directory: ${error.message}`,
                operation: { type: 'bash', command: `ls -la ${path}` }
            };
        }
    }
}
