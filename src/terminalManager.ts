/**
 * Terminal Manager
 * Handles terminal operations, command execution, and process management
 */

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TerminalCommand {
    id: string;
    command: string;
    status: 'running' | 'completed' | 'failed';
    output?: string;
    error?: string;
    pid?: number;
}

export class TerminalManager {
    private terminals: Map<string, vscode.Terminal> = new Map();
    private runningProcesses: Map<string, TerminalCommand> = new Map();

    /**
     * Execute a command in the terminal
     */
    async executeCommand(command: string, cwd?: string): Promise<TerminalCommand> {
        const commandId = `cmd-${Date.now()}`;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        const terminal = vscode.window.createTerminal({
            name: 'AI Assistant Terminal',
            cwd: cwd || workspaceFolder?.uri.fsPath
        });

        this.terminals.set(commandId, terminal);

        const cmd: TerminalCommand = {
            id: commandId,
            command,
            status: 'running'
        };

        this.runningProcesses.set(commandId, cmd);

        terminal.sendText(command);

        return cmd;
    }

    /**
     * Execute a command and get output
     */
    async executeCommandSync(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workingDir = cwd || workspaceFolder?.uri.fsPath;

        try {
            return await execAsync(command, { cwd: workingDir });
        } catch (error: any) {
            return {
                stdout: error.stdout || '',
                stderr: error.stderr || error.message || 'Unknown error'
            };
        }
    }

    /**
     * Execute a curl request
     */
    async executeCurl(curlCommand: string): Promise<{ stdout: string; stderr: string }> {
        // Validate it's a curl command
        const trimmed = curlCommand.trim();
        if (!trimmed.startsWith('curl')) {
            throw new Error('Only curl commands are supported');
        }

        return this.executeCommandSync(trimmed);
    }

    /**
     * Kill a running process
     */
    async killProcess(commandId: string): Promise<boolean> {
        const terminal = this.terminals.get(commandId);
        if (terminal) {
            terminal.dispose();
            this.terminals.delete(commandId);

            const cmd = this.runningProcesses.get(commandId);
            if (cmd) {
                cmd.status = 'completed';
                this.runningProcesses.delete(commandId);
                return true;
            }
        }
        return false;
    }

    /**
     * Kill a process by port
     */
    async killProcessOnPort(port: number): Promise<boolean> {
        const platform = process.platform;
        let killCommand: string;

        if (platform === 'darwin' || platform === 'linux') {
            killCommand = `lsof -ti:${port} | xargs kill -9`;
        } else if (platform === 'win32') {
            killCommand = `netstat -ano | findstr :${port} | for /f "tokens=5" %a in ('more') do taskkill /F /PID %a`;
        } else {
            throw new Error('Unsupported platform');
        }

        try {
            await this.executeCommandSync(killCommand);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Kill a process by name
     */
    async killProcessByName(name: string): Promise<boolean> {
        const platform = process.platform;
        let killCommand: string;

        if (platform === 'darwin' || platform === 'linux') {
            killCommand = `pkill -f "${name}"`;
        } else if (platform === 'win32') {
            killCommand = `taskkill /F /IM "${name}.exe"`;
        } else {
            throw new Error('Unsupported platform');
        }

        try {
            await this.executeCommandSync(killCommand);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get list of running processes
     */
    async getRunningProcesses(): Promise<string[]> {
        const platform = process.platform;
        let command: string;

        if (platform === 'darwin' || platform === 'linux') {
            command = 'ps aux';
        } else if (platform === 'win32') {
            command = 'tasklist';
        } else {
            return [];
        }

        try {
            const { stdout } = await this.executeCommandSync(command);
            return stdout.split('\n').filter(Boolean);
        } catch {
            return [];
        }
    }

    /**
     * Check if a port is in use
     */
    async isPortInUse(port: number): Promise<boolean> {
        const platform = process.platform;
        let command: string;

        if (platform === 'darwin' || platform === 'linux') {
            command = `lsof -i:${port} | grep LISTEN`;
        } else if (platform === 'win32') {
            command = `netstat -ano | findstr :${port}`;
        } else {
            return false;
        }

        try {
            const { stdout } = await this.executeCommandSync(command);
            return stdout.trim().length > 0;
        } catch {
            return false;
        }
    }

    /**
     * Send text to a terminal
     */
    sendToTerminal(terminalId: string, text: string): boolean {
        const terminal = this.terminals.get(terminalId);
        if (terminal) {
            terminal.sendText(text);
            return true;
        }
        return false;
    }

    /**
     * Create a new terminal
     */
    createTerminal(name?: string): vscode.Terminal {
        const terminal = vscode.window.createTerminal({
            name: name || 'AI Assistant Terminal'
        });

        const terminalId = `term-${Date.now()}`;
        this.terminals.set(terminalId, terminal);

        return terminal;
    }

    /**
     * Dispose all terminals
     */
    disposeAll(): void {
        for (const [id, terminal] of this.terminals) {
            terminal.dispose();
        }
        this.terminals.clear();
        this.runningProcesses.clear();
    }

    /**
     * Parse curl command from text
     */
    parseCurlCommand(text: string): string | null {
        // Find curl commands in the text
        const curlRegex = /curl\s+['"][^'"]+['"]|\bcurl\s+[^\n]+/gi;
        const matches = text.match(curlRegex);

        if (matches && matches.length > 0) {
            return matches[0].trim();
        }

        return null;
    }

    /**
     * Extract and execute all curl commands from AI response
     */
    async extractAndExecuteCurlCommands(response: string): Promise<Array<{ command: string; result: string }>> {
        const curlCommands = this.parseCurlCommands(response);
        const results: Array<{ command: string; result: string }> = [];

        for (const cmd of curlCommands) {
            try {
                const { stdout, stderr } = await this.executeCurl(cmd);
                results.push({
                    command: cmd,
                    result: stdout || stderr
                });
            } catch (error: any) {
                results.push({
                    command: cmd,
                    result: `Error: ${error.message}`
                });
            }
        }

        return results;
    }

    /**
     * Parse multiple curl commands from text
     */
    private parseCurlCommands(text: string): string[] {
        const commands: string[] = [];
        const lines = text.split('\n');
        let currentCommand = '';
        let inCurlCommand = false;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.toLowerCase().startsWith('curl')) {
                inCurlCommand = true;
                currentCommand = trimmed;
            } else if (inCurlCommand) {
                // Continue multi-line command
                currentCommand += ' ' + trimmed;

                // Check if command ends (no backslash continuation)
                if (!trimmed.endsWith('\\') && !trimmed.endsWith("'") && !trimmed.endsWith('"')) {
                    inCurlCommand = false;
                    commands.push(currentCommand.trim());
                    currentCommand = '';
                }
            }
        }

        // Handle single-line curl commands
        const singleLineRegex = /curl\s+[^\n]+/gi;
        const singleLineMatches = text.match(singleLineRegex);
        if (singleLineMatches) {
            commands.push(...singleLineMatches.map(m => m.trim()));
        }

        return commands;
    }
}
