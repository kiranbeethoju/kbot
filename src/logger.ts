/**
 * Logger Utility
 * Provides a centralized OutputChannel for logging extension activity
 */

import * as vscode from 'vscode';

export class Logger {
    private static channel: vscode.OutputChannel;

    static initialize() {
        this.channel = vscode.window.createOutputChannel('Prime DevBot');
        this.log('Logger initialized');
    }

    static log(message: string, data?: any) {
        const timestamp = new Date().toLocaleTimeString();
        this.logToChannel(`[INFO ${timestamp}] ${message}`, data);
    }

    static error(message: string, error?: any, showToUser: boolean = false) {
        const timestamp = new Date().toLocaleTimeString();
        this.logToChannel(`[ERROR ${timestamp}] ${message}`, error);

        // Only show to user if explicitly requested (to avoid duplicates with chat panel)
        if (showToUser) {
            vscode.window.showErrorMessage(`Prime DevBot: ${message}`);
        }
    }

    static warn(message: string, data?: any) {
        const timestamp = new Date().toLocaleTimeString();
        this.logToChannel(`[WARN ${timestamp}] ${message}`, data);
    }

    static debug(message: string, data?: any) {
        const timestamp = new Date().toLocaleTimeString();
        this.logToChannel(`[DEBUG ${timestamp}] ${message}`, data);
    }

    private static logToChannel(message: string, data?: any) {
        this.channel.appendLine(message);
        if (data !== undefined) {
            if (typeof data === 'object') {
                this.channel.appendLine(JSON.stringify(data, null, 2));
            } else {
                this.channel.appendLine(String(data));
            }
        }
    }

    static show() {
        this.channel.show();
    }

    static dispose() {
        this.channel.dispose();
    }
}
