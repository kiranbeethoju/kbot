/**
 * System Prompt Manager
 * Manages custom system prompts and coding guidelines
 */

import * as vscode from 'vscode';
import { Logger } from './logger';

export interface SystemPromptRule {
    id: string;
    name: string;
    description: string;
    content: string;
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
}

export class SystemPromptManager {
    private static readonly RULES_KEY = 'systemPromptRules';
    private static readonly DEFAULT_RULES_KEY = 'defaultSystemPrompt';

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Get all system prompt rules
     */
    async getAllRules(): Promise<SystemPromptRule[]> {
        const rules = this.context.globalState.get<SystemPromptRule[]>(
            SystemPromptManager.RULES_KEY,
            []
        );
        return rules.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    /**
     * Get enabled system prompt rules
     */
    async getEnabledRules(): Promise<SystemPromptRule[]> {
        const rules = await this.getAllRules();
        return rules.filter(rule => rule.enabled);
    }

    /**
     * Get default system prompt
     */
    async getDefaultSystemPrompt(): Promise<string> {
        return this.context.globalState.get<string>(
            SystemPromptManager.DEFAULT_RULES_KEY,
            this.getDefaultPrompt()
        );
    }

    /**
     * Set default system prompt
     */
    async setDefaultSystemPrompt(prompt: string): Promise<void> {
        await this.context.globalState.update(
            SystemPromptManager.DEFAULT_RULES_KEY,
            prompt
        );
        Logger.log('Default system prompt updated');
    }

    /**
     * Get complete system prompt with all enabled rules
     */
    async getCompleteSystemPrompt(): Promise<string> {
        const defaultPrompt = await this.getDefaultSystemPrompt();
        const enabledRules = await this.getEnabledRules();
        
        if (enabledRules.length === 0) {
            return defaultPrompt;
        }

        const rulesPrompt = enabledRules
            .map(rule => `### ${rule.name}\n${rule.content}`)
            .join('\n\n');

        return `${defaultPrompt}\n\n${rulesPrompt}`;
    }

    /**
     * Add or update a system prompt rule
     */
    async saveRule(rule: Omit<SystemPromptRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<SystemPromptRule> {
        const rules = await this.getAllRules();
        const existingIndex = rules.findIndex(r => r.name === rule.name);

        const newRule: SystemPromptRule = {
            ...rule,
            id: existingIndex >= 0 ? rules[existingIndex].id : this.generateId(),
            createdAt: existingIndex >= 0 ? rules[existingIndex].createdAt : Date.now(),
            updatedAt: Date.now()
        };

        if (existingIndex >= 0) {
            rules[existingIndex] = newRule;
        } else {
            rules.push(newRule);
        }

        await this.context.globalState.update(SystemPromptManager.RULES_KEY, rules);
        Logger.log(`System prompt rule saved: ${newRule.name}`);
        return newRule;
    }

    /**
     * Delete a system prompt rule
     */
    async deleteRule(ruleId: string): Promise<void> {
        const confirmed = await vscode.window.showWarningMessage(
            'Delete this system prompt rule?',
            'Yes',
            'No'
        );

        if (confirmed === 'Yes') {
            const rules = await this.getAllRules();
            const filtered = rules.filter(r => r.id !== ruleId);
            await this.context.globalState.update(SystemPromptManager.RULES_KEY, filtered);
            Logger.log(`System prompt rule deleted: ${ruleId}`);
        }
    }

    /**
     * Toggle rule enabled status
     */
    async toggleRule(ruleId: string): Promise<void> {
        const rules = await this.getAllRules();
        const rule = rules.find(r => r.id === ruleId);
        
        if (rule) {
            rule.enabled = !rule.enabled;
            rule.updatedAt = Date.now();
            await this.context.globalState.update(SystemPromptManager.RULES_KEY, rules);
            Logger.log(`System prompt rule ${ruleId} ${rule.enabled ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Get default prompt
     */
    private getDefaultPrompt(): string {
        return `You are DevBot, an AI coding assistant. You help developers write, debug, and improve code.

## Core Principles:
- Write clean, maintainable, and efficient code
- Follow best practices and coding standards
- Provide clear explanations for your solutions
- Consider security implications and edge cases
- Use appropriate design patterns

## File Operations:
You have access to file system operations including:
- Reading files with cat
- Searching with grep
- Editing with sed
- Running bash scripts
- Creating and modifying files

## Guidelines:
- Always ask for user permission before deleting files or making destructive changes
- Provide clear explanations for code changes
- Suggest improvements when you see opportunities
- Follow the user's coding guidelines and preferences
- Be helpful, accurate, and concise`;
    }

    /**
     * Generate unique ID
     */
    private generateId(): string {
        return `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Show system prompt configuration UI
     */
    async showConfigurationUI(): Promise<void> {
        const action = await vscode.window.showQuickPick([
            'View/Edit Default Prompt',
            'Manage Custom Rules',
            'Add New Rule'
        ], {
            placeHolder: 'What would you like to configure?'
        });

        switch (action) {
            case 'View/Edit Default Prompt':
                await this.editDefaultPrompt();
                break;
            case 'Manage Custom Rules':
                await this.manageRules();
                break;
            case 'Add New Rule':
                await this.addNewRule();
                break;
        }
    }

    /**
     * Edit default system prompt
     */
    private async editDefaultPrompt(): Promise<void> {
        const currentPrompt = await this.getDefaultSystemPrompt();
        
        // Create a new document with the current prompt
        const document = await vscode.workspace.openTextDocument({
            content: currentPrompt,
            language: 'plaintext'
        });
        
        await vscode.window.showTextDocument(document);
        
        // Show save prompt when user is done
        const result = await vscode.window.showInformationMessage(
            'Edit the prompt in the opened document. Click "Save" when done.',
            'Save',
            'Cancel'
        );

        if (result === 'Save') {
            const updatedPrompt = document.getText();
            await this.setDefaultSystemPrompt(updatedPrompt);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            vscode.window.showInformationMessage('Default system prompt updated');
        }
    }

    /**
     * Manage existing rules
     */
    private async manageRules(): Promise<void> {
        const rules = await this.getAllRules();
        
        if (rules.length === 0) {
            vscode.window.showInformationMessage('No custom rules found. Add a new rule to get started.');
            return;
        }

        const ruleItems = rules.map(rule => ({
            label: `${rule.enabled ? '✅' : '❌'} ${rule.name}`,
            description: rule.description,
            rule
        }));

        const selected = await vscode.window.showQuickPick(ruleItems, {
            placeHolder: 'Select a rule to manage'
        });

        if (selected) {
            const actions = ['Edit', 'Toggle', 'Delete'];
            const action = await vscode.window.showQuickPick(actions, {
                placeHolder: `What would you like to do with "${selected.rule.name}"?`
            });

            switch (action) {
                case 'Edit':
                    await this.editRule(selected.rule);
                    break;
                case 'Toggle':
                    await this.toggleRule(selected.rule.id);
                    vscode.window.showInformationMessage(`Rule "${selected.rule.name}" ${selected.rule.enabled ? 'disabled' : 'enabled'}`);
                    break;
                case 'Delete':
                    await this.deleteRule(selected.rule.id);
                    break;
            }
        }
    }

    /**
     * Add new rule
     */
    private async addNewRule(): Promise<void> {
        const name = await vscode.window.showInputBox({
            prompt: 'Rule name',
            placeHolder: 'e.g., TypeScript Guidelines'
        });

        if (!name) return;

        const description = await vscode.window.showInputBox({
            prompt: 'Rule description',
            placeHolder: 'Brief description of what this rule does'
        });

        if (!description) return;

        // Create a new document for content editing
        const document = await vscode.workspace.openTextDocument({
            content: `# ${name}

${description}

## Guidelines:
`,
            language: 'markdown'
        });
        
        await vscode.window.showTextDocument(document);
        
        const result = await vscode.window.showInformationMessage(
            'Edit the rule content in the opened document. Click "Save" when done.',
            'Save',
            'Cancel'
        );

        if (result === 'Save') {
            const content = document.getText();
            await this.saveRule({
                name,
                description,
                content,
                enabled: true
            });
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            vscode.window.showInformationMessage(`Rule "${name}" added successfully`);
        }
    }

    /**
     * Edit existing rule
     */
    private async editRule(rule: SystemPromptRule): Promise<void> {
        const name = await vscode.window.showInputBox({
            prompt: 'Rule name',
            value: rule.name
        });

        if (!name) return;

        const description = await vscode.window.showInputBox({
            prompt: 'Rule description',
            value: rule.description
        });

        if (!description) return;

        // Create a new document for content editing
        const document = await vscode.workspace.openTextDocument({
            content: rule.content,
            language: 'markdown'
        });
        
        await vscode.window.showTextDocument(document);
        
        const result = await vscode.window.showInformationMessage(
            'Edit the rule content in the opened document. Click "Save" when done.',
            'Save',
            'Cancel'
        );

        if (result === 'Save') {
            const content = document.getText();
            await this.saveRule({
                name,
                description,
                content,
                enabled: rule.enabled
            });
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            vscode.window.showInformationMessage(`Rule "${name}" updated successfully`);
        }
    }
}
