/**
 * Chat History Manager
 * Manages persistent storage of chat conversations
 */

import * as vscode from 'vscode';
import { ChatMessageEntry } from './chatPanel';
import { Logger } from './logger';

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessageEntry[];
    createdAt: number;
    updatedAt: number;
}

export class ChatHistoryManager {
    private static readonly SESSIONS_KEY = 'chat.sessions';
    private static readonly ACTIVE_SESSION_KEY = 'chat.activeSession';
    private static readonly MAX_SESSIONS = 50;

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Get all chat sessions
     */
    async getAllSessions(): Promise<ChatSession[]> {
        const sessions = this.context.globalState.get<ChatSession[]>(
            ChatHistoryManager.SESSIONS_KEY,
            []
        );
        return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    /**
     * Get active session ID
     */
    async getActiveSessionId(): Promise<string | null> {
        return this.context.globalState.get<string>(ChatHistoryManager.ACTIVE_SESSION_KEY) || null;
    }

    /**
     * Set active session
     */
    async setActiveSession(sessionId: string): Promise<void> {
        await this.context.globalState.update(ChatHistoryManager.ACTIVE_SESSION_KEY, sessionId);
        Logger.log(`Active session set to: ${sessionId}`);
    }

    /**
     * Get a session by ID
     */
    async getSession(sessionId: string): Promise<ChatSession | null> {
        const sessions = await this.getAllSessions();
        return sessions.find(s => s.id === sessionId) || null;
    }

    /**
     * Get active session
     */
    async getActiveSession(): Promise<ChatSession | null> {
        const activeId = await this.getActiveSessionId();
        if (activeId) {
            return this.getSession(activeId);
        }
        return null;
    }

    /**
     * Create a new session
     */
    async createSession(): Promise<ChatSession> {
        const sessions = await this.getAllSessions();
        const newSession: ChatSession = {
            id: this.generateId(),
            title: 'New Chat',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        sessions.unshift(newSession);

        // Limit number of sessions
        if (sessions.length > ChatHistoryManager.MAX_SESSIONS) {
            sessions.splice(ChatHistoryManager.MAX_SESSIONS);
        }

        await this.context.globalState.update(ChatHistoryManager.SESSIONS_KEY, sessions);
        await this.setActiveSession(newSession.id);

        Logger.log(`Created new session: ${newSession.id}`);
        return newSession;
    }

    /**
     * Add message to active session
     */
    async addMessage(message: ChatMessageEntry): Promise<void> {
        const activeId = await this.getActiveSessionId();
        if (!activeId) {
            // Create new session if none exists
            await this.createSession();
            return this.addMessage(message);
        }

        const sessions = await this.getAllSessions();
        const sessionIndex = sessions.findIndex(s => s.id === activeId);

        if (sessionIndex === -1) {
            Logger.warn(`Active session ${activeId} not found, creating new session`);
            return this.addMessage(message);
        }

        const session = sessions[sessionIndex];
        session.messages.push(message);
        session.updatedAt = Date.now();

        // Auto-generate title from first user message
        if (session.messages.filter(m => m.role === 'user').length === 1 && message.role === 'user') {
            session.title = this.generateTitle(message.content);
        }

        // Move session to top
        sessions.splice(sessionIndex, 1);
        sessions.unshift(session);

        await this.context.globalState.update(ChatHistoryManager.SESSIONS_KEY, sessions);
        Logger.debug(`Added message to session ${activeId}`);
    }

    /**
     * Update session messages
     */
    async updateSession(sessionId: string, messages: ChatMessageEntry[]): Promise<void> {
        const sessions = await this.getAllSessions();
        const sessionIndex = sessions.findIndex(s => s.id === sessionId);

        if (sessionIndex !== -1) {
            sessions[sessionIndex].messages = messages;
            sessions[sessionIndex].updatedAt = Date.now();

            // Move session to top
            const session = sessions.splice(sessionIndex, 1)[0];
            sessions.unshift(session);

            await this.context.globalState.update(ChatHistoryManager.SESSIONS_KEY, sessions);
        }
    }

    /**
     * Delete a session
     */
    async deleteSession(sessionId: string): Promise<void> {
        const sessions = await this.getAllSessions();
        const filtered = sessions.filter(s => s.id !== sessionId);

        await this.context.globalState.update(ChatHistoryManager.SESSIONS_KEY, filtered);

        // If deleted session was active, set a new active session
        const activeId = await this.getActiveSessionId();
        if (activeId === sessionId) {
            if (filtered.length > 0) {
                await this.setActiveSession(filtered[0].id);
            } else {
                await this.createSession();
            }
        }

        Logger.log(`Deleted session: ${sessionId}`);
    }

    /**
     * Clear all sessions
     */
    async clearAllSessions(): Promise<void> {
        await this.context.globalState.update(ChatHistoryManager.SESSIONS_KEY, []);
        await this.createSession();
        Logger.log('All chat sessions cleared');
    }

    /**
     * Generate a short title from message content
     */
    private generateTitle(content: string): string {
        const maxLength = 40;
        const cleaned = content
            .replace(/```[\s\S]*?```/g, '[code]')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned.length > maxLength
            ? cleaned.substring(0, maxLength) + '...'
            : cleaned;
    }

    /**
     * Update session title
     */
    async updateSessionTitle(sessionId: string, title: string): Promise<void> {
        const sessions = await this.getAllSessions();
        const session = sessions.find(s => s.id === sessionId);

        if (session) {
            session.title = title;
            session.updatedAt = Date.now();
            await this.context.globalState.update(ChatHistoryManager.SESSIONS_KEY, sessions);
            Logger.log(`Updated session title: ${sessionId} -> ${title}`);
        }
    }

    private generateId(): string {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
