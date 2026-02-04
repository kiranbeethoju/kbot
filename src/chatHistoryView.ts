/**
 * Chat History View Provider
 * Provides a webview panel for managing and viewing chat history
 */

import * as vscode from 'vscode';
import { ChatHistoryManager, ChatSession } from './chatHistory';
import { Logger } from './logger';

export class ChatHistoryViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    constructor(
        private extensionUri: vscode.Uri,
        private chatHistoryManager: ChatHistoryManager
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'loadSessions':
                    await this.loadSessions();
                    break;
                case 'switchSession':
                    await this.switchSession(data.sessionId);
                    break;
                case 'deleteSession':
                    await this.deleteSession(data.sessionId);
                    break;
                case 'updateSessionTitle':
                    await this.updateSessionTitle(data.sessionId, data.title);
                    break;
                case 'newSession':
                    await this.createNewSession();
                    break;
                case 'exportSession':
                    await this.exportSession(data.sessionId);
                    break;
            }
        });

        // Load sessions when view is shown
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.loadSessions();
            }
        });
    }

    /**
     * Load and send sessions to webview
     */
    private async loadSessions(): Promise<void> {
        try {
            const sessions = await this.chatHistoryManager.getAllSessions();
            const activeSessionId = await this.chatHistoryManager.getActiveSessionId();

            this.sendMessage({
                type: 'sessionsLoaded',
                sessions,
                activeSessionId
            });
        } catch (error: any) {
            Logger.error('Failed to load sessions', error);
            this.sendMessage({
                type: 'error',
                message: `Failed to load sessions: ${error.message}`
            });
        }
    }

    /**
     * Switch to a specific session
     */
    private async switchSession(sessionId: string): Promise<void> {
        try {
            await this.chatHistoryManager.setActiveSession(sessionId);
            
            // Focus the chat view
            await vscode.commands.executeCommand('azureGPTChatView.focus');
            
            this.sendMessage({
                type: 'sessionSwitched',
                sessionId
            });
        } catch (error: any) {
            Logger.error('Failed to switch session', error);
            this.sendMessage({
                type: 'error',
                message: `Failed to switch session: ${error.message}`
            });
        }
    }

    /**
     * Delete a session
     */
    private async deleteSession(sessionId: string): Promise<void> {
        try {
            const confirmed = await vscode.window.showWarningMessage(
                'Delete this chat session?',
                'Yes',
                'No'
            );

            if (confirmed === 'Yes') {
                await this.chatHistoryManager.deleteSession(sessionId);
                await this.loadSessions();
                
                this.sendMessage({
                    type: 'sessionDeleted',
                    sessionId
                });
            }
        } catch (error: any) {
            Logger.error('Failed to delete session', error);
            this.sendMessage({
                type: 'error',
                message: `Failed to delete session: ${error.message}`
            });
        }
    }

    /**
     * Update session title
     */
    private async updateSessionTitle(sessionId: string, title: string): Promise<void> {
        try {
            await this.chatHistoryManager.updateSessionTitle(sessionId, title);
            await this.loadSessions();
            
            this.sendMessage({
                type: 'sessionTitleUpdated',
                sessionId,
                title
            });
        } catch (error: any) {
            Logger.error('Failed to update session title', error);
            this.sendMessage({
                type: 'error',
                message: `Failed to update title: ${error.message}`
            });
        }
    }

    /**
     * Create new session
     */
    private async createNewSession(): Promise<void> {
        try {
            await this.chatHistoryManager.createSession();
            await this.loadSessions();
            
            // Focus the chat view
            await vscode.commands.executeCommand('azureGPTChatView.focus');
            
            this.sendMessage({
                type: 'newSessionCreated'
            });
        } catch (error: any) {
            Logger.error('Failed to create new session', error);
            this.sendMessage({
                type: 'error',
                message: `Failed to create session: ${error.message}`
            });
        }
    }

    /**
     * Export session to file
     */
    private async exportSession(sessionId: string): Promise<void> {
        try {
            const session = await this.chatHistoryManager.getSession(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder open');
            }

            const exportPath = `${workspaceFolders[0].uri.fsPath}/chat-session-${session.id}.json`;
            const uri = vscode.Uri.file(exportPath);

            const encoder = new TextEncoder();
            const content = encoder.encode(JSON.stringify(session, null, 2));

            await vscode.workspace.fs.writeFile(uri, content);
            vscode.window.showInformationMessage(`Chat session exported to ${exportPath}`);
        } catch (error: any) {
            Logger.error('Failed to export session', error);
            this.sendMessage({
                type: 'error',
                message: `Failed to export session: ${error.message}`
            });
        }
    }

    /**
     * Send message to webview
     */
    private sendMessage(message: any): void {
        if (this.view) {
            this.view.webview.postMessage(message);
        }
    }

    /**
     * Get HTML for webview
     */
    private getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chat History</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 16px;
            line-height: 1.5;
            max-height: 100vh;
            overflow-y: auto;
        }

        h2 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--vscode-foreground);
        }

        .header-actions {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
        }

        .new-chat-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            flex: 1;
        }

        .new-chat-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .session-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .session-item {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .session-item:hover {
            border-color: var(--vscode-button-background);
        }

        .session-item.active {
            border-color: var(--vscode-button-background);
            background: var(--vscode-button-secondaryBackground);
        }

        .session-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .session-title {
            font-weight: 600;
            font-size: 13px;
            flex: 1;
            cursor: text;
            background: transparent;
            border: 1px solid transparent;
            padding: 2px 4px;
            border-radius: 2px;
            color: var(--vscode-foreground);
        }

        .session-title:hover {
            background: var(--vscode-input-background);
        }

        .session-title:focus {
            outline: 1px solid var(--vscode-focusBorder);
            background: var(--vscode-input-background);
        }

        .session-actions {
            display: flex;
            gap: 4px;
        }

        .session-action-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 2px;
            font-size: 12px;
            opacity: 0.7;
            transition: opacity 0.2s;
        }

        .session-action-btn:hover {
            opacity: 1;
            background: var(--vscode-toolbar-hoverBackground);
        }

        .session-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .session-message-count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 500;
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state h3 {
            font-size: 14px;
            margin-bottom: 8px;
        }

        .empty-state p {
            font-size: 12px;
            margin-bottom: 16px;
        }

        .loading {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
        }

        .error {
            background: var(--vscode-errorBackground);
            color: var(--vscode-errorForeground);
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 16px;
            font-size: 12px;
        }

        .hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    <h2>Chat History</h2>
    
    <div class="header-actions">
        <button id="newChatBtn" class="new-chat-btn">+ New Chat</button>
    </div>

    <div id="sessionList" class="session-list">
        <div class="loading">Loading chat sessions...</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // New chat button
        document.getElementById('newChatBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'newSession' });
        });

        // Handle messages from extension
        window.addEventListener('message', (event) => {
            const message = event.data;

            switch (message.type) {
                case 'sessionsLoaded':
                    renderSessions(message.sessions, message.activeSessionId);
                    break;
                case 'error':
                    showError(message.message);
                    break;
            }
        });

        // Render sessions list
        function renderSessions(sessions, activeSessionId) {
            const container = document.getElementById('sessionList');
            
            if (sessions.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <h3>No chat history yet</h3>
                        <p>Start a new conversation to see it here!</p>
                    </div>
                \`;
                return;
            }

            container.innerHTML = sessions.map(session => \`
                <div class="session-item \${session.id === activeSessionId ? 'active' : ''}" data-session-id="\${session.id}">
                    <div class="session-header">
                        <input 
                            type="text" 
                            class="session-title" 
                            value="\${escapeHtml(session.title)}"
                            data-session-id="\${session.id}"
                        />
                        <div class="session-actions">
                            <button class="session-action-btn" onclick="exportSession('\${session.id}')" title="Export">
                                📥
                            </button>
                            <button class="session-action-btn" onclick="deleteSession('\${session.id}')" title="Delete">
                                🗑️
                            </button>
                        </div>
                    </div>
                    <div class="session-meta">
                        <span>\${formatDate(session.updatedAt)}</span>
                        <span class="session-message-count">\${session.messages.length} messages</span>
                    </div>
                </div>
            \`).join('');

            // Add click handlers for session items
            container.querySelectorAll('.session-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    // Don't switch session if clicking on input or buttons
                    if (e.target.classList.contains('session-title') || 
                        e.target.classList.contains('session-action-btn')) {
                        return;
                    }
                    
                    const sessionId = item.dataset.sessionId;
                    vscode.postMessage({ type: 'switchSession', sessionId });
                });
            });

            // Add title edit handlers
            container.querySelectorAll('.session-title').forEach(input => {
                input.addEventListener('blur', () => {
                    const sessionId = input.dataset.sessionId;
                    const title = input.value.trim() || 'Untitled Chat';
                    vscode.postMessage({ type: 'updateSessionTitle', sessionId, title });
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();
                    }
                });
            });
        }

        // Export session
        function exportSession(sessionId) {
            vscode.postMessage({ type: 'exportSession', sessionId });
        }

        // Delete session
        function deleteSession(sessionId) {
            vscode.postMessage({ type: 'deleteSession', sessionId });
        }

        // Show error message
        function showError(message) {
            const container = document.getElementById('sessionList');
            container.innerHTML = \`<div class="error">Error: \${escapeHtml(message)}</div>\`;
        }

        // Utility functions
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function formatDate(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (diffDays === 1) {
                return 'Yesterday';
            } else if (diffDays < 7) {
                return date.toLocaleDateString([], { weekday: 'short' });
            } else {
                return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }
        }

        // Load initial sessions
        vscode.postMessage({ type: 'loadSessions' });
    </script>
</body>
</html>`;
    }
}
