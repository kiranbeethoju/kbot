"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode14 = __toESM(require("vscode"));

// src/chatPanel.ts
var vscode3 = __toESM(require("vscode"));

// src/gitManager.ts
var vscode2 = __toESM(require("vscode"));

// src/logger.ts
var vscode = __toESM(require("vscode"));
var Logger = class {
  static initialize() {
    this.channel = vscode.window.createOutputChannel("Prime DevBot");
    this.log("Logger initialized");
  }
  static log(message, data) {
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    this.logToChannel(`[INFO ${timestamp}] ${message}`, data);
  }
  static error(message, error, showToUser = false) {
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    this.logToChannel(`[ERROR ${timestamp}] ${message}`, error);
    if (showToUser) {
      vscode.window.showErrorMessage(`Prime DevBot: ${message}`);
    }
  }
  static warn(message, data) {
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    this.logToChannel(`[WARN ${timestamp}] ${message}`, data);
  }
  static debug(message, data) {
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    this.logToChannel(`[DEBUG ${timestamp}] ${message}`, data);
  }
  static logToChannel(message, data) {
    this.channel.appendLine(message);
    if (data !== void 0) {
      if (typeof data === "object") {
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
};

// src/gitManager.ts
var import_child_process = require("child_process");
var import_util = require("util");
var execAsync = (0, import_util.promisify)(import_child_process.exec);
var GitManager = class {
  constructor() {
    const workspaceFolders = vscode2.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error("No workspace folder open");
    }
    this.workspaceRoot = workspaceFolders[0].uri.fsPath;
  }
  /**
   * Check if git is initialized
   */
  async isGitInitialized() {
    try {
      const gitDir = `${this.workspaceRoot}/.git`;
      await vscode2.workspace.fs.stat(vscode2.Uri.file(gitDir));
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Initialize git repository
   */
  async initializeGit() {
    try {
      Logger.log("Initializing git repository...");
      await execAsync("git init", { cwd: this.workspaceRoot });
      await execAsync('git config user.name "Prime DevBot"', { cwd: this.workspaceRoot });
      await execAsync('git config user.email "azure-gpt@vscode"', { cwd: this.workspaceRoot });
      await this.createCommit("chore: initial commit - AI assistant tracking", true);
      Logger.log("Git repository initialized successfully");
      vscode2.window.showInformationMessage("Git initialized - AI changes will be tracked");
    } catch (error) {
      Logger.error("Failed to initialize git", error);
      throw new Error(`Failed to initialize git: ${error.message}`);
    }
  }
  /**
   * Ensure git is initialized
   */
  async ensureGitInitialized() {
    if (!await this.isGitInitialized()) {
      const init = await vscode2.window.showWarningMessage(
        "Git is not initialized in this workspace. Would you like to initialize it to track AI changes?",
        "Initialize",
        "Cancel"
      );
      if (init === "Initialize") {
        await this.initializeGit();
      } else {
        throw new Error("Git not initialized - cannot track changes");
      }
    }
  }
  /**
   * Get file status
   */
  async getFileStatus(filePath) {
    try {
      const relativePath = this.getRelativePath(filePath);
      const { stdout } = await execAsync(`git status --porcelain "${relativePath}"`, { cwd: this.workspaceRoot });
      if (stdout.startsWith(" M") || stdout.startsWith("M")) {
        return "modified";
      } else if (stdout.startsWith("??")) {
        return "created";
      } else if (stdout.startsWith(" D") || stdout.startsWith("D")) {
        return "deleted";
      }
      return "none";
    } catch {
      return "none";
    }
  }
  /**
   * Get original file content before changes
   */
  async getOriginalContent(filePath) {
    try {
      const relativePath = this.getRelativePath(filePath);
      const { stdout } = await execAsync(`git show HEAD:"${relativePath}"`, { cwd: this.workspaceRoot });
      return stdout;
    } catch {
      return null;
    }
  }
  /**
   * Create a commit with AI-generated changes
   */
  async createCommit(message, isInitial = false) {
    try {
      Logger.log(`Creating git commit: ${message}`);
      if (!isInitial) {
        await execAsync("git add -A", { cwd: this.workspaceRoot });
      }
      await execAsync(`git commit -m "${message}"`, { cwd: this.workspaceRoot });
      Logger.log(`Git commit created successfully`);
    } catch (error) {
      if (!error.message.includes("nothing to commit")) {
        Logger.error("Failed to create git commit", error);
      }
    }
  }
  /**
   * Commit AI-generated changes with meaningful message
   */
  async commitAIChanges(changes, userMessage) {
    try {
      await this.ensureGitInitialized();
      const created = changes.filter((c) => c.action === "create");
      const modified = changes.filter((c) => c.action === "update");
      const deleted = changes.filter((c) => c.action === "delete");
      let commitMessage = `AI: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? "..." : ""}

`;
      if (created.length > 0) {
        commitMessage += `
Created:
${created.map((c) => `  - ${c.path}`).join("\n")}`;
      }
      if (modified.length > 0) {
        commitMessage += `
Modified:
${modified.map((c) => `  - ${c.path}`).join("\n")}`;
      }
      if (deleted.length > 0) {
        commitMessage += `
Deleted:
${deleted.map((c) => `  - ${c.path}`).join("\n")}`;
      }
      await this.createCommit(commitMessage);
      vscode2.window.showInformationMessage(`Changes committed: ${changes.length} file(s)`);
    } catch (error) {
      Logger.error("Failed to commit AI changes", error);
      vscode2.window.showWarningMessage(`Could not commit changes: ${error.message}`);
    }
  }
  /**
   * Get commit history
   */
  async getCommitHistory(limit = 10) {
    try {
      const { stdout } = await execAsync(`git log -${limit} --pretty=format:"%H|%s|%ad" --date=iso`, { cwd: this.workspaceRoot });
      return stdout.split("\n").filter(Boolean).map((line) => {
        const [hash, message, date] = line.split("|");
        return { hash, message, date };
      });
    } catch {
      return [];
    }
  }
  /**
   * Get diff for a file
   */
  async getFileDiff(filePath) {
    try {
      const relativePath = this.getRelativePath(filePath);
      const { stdout } = await execAsync(`git diff "${relativePath}"`, { cwd: this.workspaceRoot });
      return stdout;
    } catch {
      return "";
    }
  }
  /**
   * Get relative path from workspace root
   */
  getRelativePath(filePath) {
    return filePath.replace(this.workspaceRoot + "/", "").replace(this.workspaceRoot, "");
  }
  /**
   * Show git log output channel
   */
  async showGitLog() {
    const commits = await this.getCommitHistory(20);
    if (commits.length === 0) {
      vscode2.window.showInformationMessage("No git history found");
      return;
    }
    Logger.log("=== Git Commit History ===");
    commits.forEach((commit) => {
      Logger.log(`${commit.hash.substring(0, 8)} - ${commit.message} (${commit.date})`);
    });
    Logger.show();
  }
};

// src/chatPanel.ts
var ChatPanelProvider = class {
  constructor(extensionUri, credentialManager2, azureGPTService2, nvidiaService2, fileManager2, backupManager2, exclusionManager2, context, terminalManager2, chatHistoryManager2) {
    this.extensionUri = extensionUri;
    this.credentialManager = credentialManager2;
    this.azureGPTService = azureGPTService2;
    this.nvidiaService = nvidiaService2;
    this.fileManager = fileManager2;
    this.backupManager = backupManager2;
    this.exclusionManager = exclusionManager2;
    this.context = context;
    this.currentSession = null;
    this.abortController = null;
    this.messagesLoaded = false;
    this.chatHistoryManager = chatHistoryManager2;
    this.terminalManager = terminalManager2;
  }
  /**
   * Initialize git manager
   */
  async ensureGitManager() {
    if (!this.gitManager) {
      try {
        this.gitManager = new GitManager();
        await this.gitManager.ensureGitInitialized();
      } catch (error) {
        Logger.warn("Git manager not available:", error);
      }
    }
  }
  /**
   * Initialize chat session
   */
  async initializeSession() {
    const activeSession = await this.chatHistoryManager.getActiveSession();
    if (activeSession) {
      this.currentSession = activeSession;
    } else {
      this.currentSession = await this.chatHistoryManager.createSession();
    }
  }
  /**
   * Resolve webview view
   */
  async resolveWebviewView(webviewView, context, _token) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (data) => {
      Logger.log(`Received message from webview: ${data.type}`, data);
      try {
        switch (data.type) {
          case "ping":
            Logger.log("Ping received from webview, responding with pong");
            this.sendMessage({ type: "pong", timestamp: data.timestamp });
            break;
          case "sendMessage":
            Logger.log(`Processing sendMessage: ${data.message?.substring(0, 50)}`);
            await this.handleSendMessage(data.message, data.context, data.image);
            break;
          case "clearHistory":
            await this.clearHistory();
            break;
          case "exportHistory":
            await this.exportHistory();
            break;
          case "applyChanges":
            await this.applyChanges(data.files);
            break;
          case "applySingleChange":
            await this.applySingleChange(data.file, data.userMessage);
            break;
          case "openFile":
            await this.openFile(data.path);
            break;
          case "configureCredentials":
            await this.credentialManager.configureCredentials();
            this.sendMessage({
              type: "credentialsConfigured"
            });
            break;
          case "configureExclusions":
            await this.exclusionManager.showConfigurationUI();
            break;
          case "newChat":
            await this.createNewChat();
            break;
          case "switchSession":
            await this.switchSession(data.sessionId);
            break;
          case "deleteSession":
            await this.deleteSession(data.sessionId);
            break;
          case "loadSessions":
            await this.loadSessions();
            break;
          case "updateSessionTitle":
            await this.updateSessionTitle(data.sessionId, data.title);
            break;
          case "executeTerminalCommand":
            await this.executeTerminalCommand(data.command);
            break;
          case "killProcessOnPort":
            await this.killProcessOnPort(data.port);
            break;
          case "killProcessByName":
            await this.killProcessByName(data.name);
            break;
          case "checkPortInUse":
            await this.checkPortInUse(data.port);
            break;
          case "stopRequest":
            if (this.abortController) {
              this.abortController.abort();
              this.abortController = null;
              this.sendMessage({
                type: "requestStopped"
              });
            }
            break;
        }
      } catch (error) {
        Logger.log("Error handling webview message:", error);
        this.sendMessage({
          type: "error",
          message: `Internal Error: ${error.message}`
        });
      }
    });
    await this.initializeSession();
    await this.loadSessions();
    webviewView.onDidChangeVisibility(async () => {
      if (webviewView.visible) {
        await this.initializeSession();
        await this.loadSessions();
        await this.loadChatMessages();
      }
    });
  }
  /**
   * Load chat messages from current session
   */
  async loadChatMessages() {
    if (!this.currentSession || this.currentSession.messages.length === 0 || this.messagesLoaded) {
      return;
    }
    this.sendMessage({ type: "clearChat" });
    for (const message of this.currentSession.messages) {
      this.sendMessage({
        type: "messageAdded",
        message
      });
    }
    this.messagesLoaded = true;
  }
  /**
   * Handle sending a message
   */
  async handleSendMessage(userMessage, context, image) {
    Logger.log(`handleSendMessage called with message: ${userMessage.substring(0, 50)}...`);
    await this.ensureGitManager();
    const provider = await this.credentialManager.getSelectedProvider();
    const isConfigured = await this.credentialManager.isConfigured();
    if (!isConfigured) {
      const providerName = provider === "azure" /* Azure */ ? "Azure" : "NVIDIA";
      this.sendMessage({
        type: "error",
        message: `${providerName} credentials not configured. Please configure them first.`
      });
      return;
    }
    const userEntry = {
      id: this.generateId(),
      role: "user",
      content: userMessage,
      timestamp: Date.now()
    };
    if (this.currentSession) {
      this.currentSession.messages.push(userEntry);
      await this.chatHistoryManager.addMessage(userEntry);
    }
    this.sendMessage({
      type: "messageAdded",
      message: userEntry
    });
    this.sendMessage({
      type: "loadingStarted",
      message: `Thinking with ${provider === "azure" /* Azure */ ? "Azure" : "NVIDIA"}...`
    });
    try {
      this.abortController = new AbortController();
      this.sendMessage({
        type: "loadingUpdate",
        message: "Collecting workspace files..."
      });
      let fileContexts = [];
      if (context.includeCurrentFile) {
        const currentFile = await this.fileManager.getCurrentFile();
        if (currentFile) {
          fileContexts.push(currentFile);
        }
      }
      let workspaceFiles = [];
      try {
        workspaceFiles = await this.fileManager.getWorkspaceFiles();
        if (workspaceFiles.length > 0) {
          Logger.log(`Auto-including ${workspaceFiles.length} workspace files from ${this.fileManager.getWorkspaceRoot()}`);
          this.sendMessage({
            type: "loadingUpdate",
            message: `Found ${workspaceFiles.length} workspace files...`
          });
          fileContexts.push(...workspaceFiles);
        } else {
          Logger.log(`No workspace files found in ${this.fileManager.getWorkspaceRoot()}, will continue with current file only`);
        }
      } catch (error) {
        Logger.warn("Failed to collect workspace files, continuing with current file only:", error);
        this.sendMessage({
          type: "loadingUpdate",
          message: "Continuing with current file only..."
        });
      }
      if (context.selectedFiles && context.selectedFiles.length > 0) {
        const selected = await this.fileManager.getSelectedFiles(
          context.selectedFiles.map((f) => vscode3.Uri.parse(f))
        );
        fileContexts.push(...selected);
      }
      let gitDiffContent = "";
      if (context.includeGitDiff) {
        const gitDiff = await this.fileManager.getGitDiff();
        if (gitDiff) {
          gitDiffContent = `

--- GIT DIFF ---
${gitDiff}
--- END GIT DIFF ---
`;
        }
      }
      let terminalContent = "";
      if (context.includeTerminal) {
        terminalContent = "\n\n[Terminal output would be included here]";
      }
      const systemPrompt = provider === "azure" /* Azure */ ? await this.azureGPTService.generateSystemPrompt({
        fileCount: fileContexts.length,
        includeGitDiff: context.includeGitDiff || false,
        includeTerminal: context.includeTerminal || false
      }) : await this.nvidiaService.generateSystemPrompt({
        fileCount: fileContexts.length,
        includeGitDiff: context.includeGitDiff || false,
        includeTerminal: context.includeTerminal || false
      });
      const messages = [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `${userMessage}

=== WORKSPACE CONTEXT ===
Working Directory: ${this.fileManager.getWorkspaceRoot()}
Files Included: ${fileContexts.length} files
${this.fileManager.formatFilesForContext(fileContexts)}
${gitDiffContent}${terminalContent}
=======================`,
          ...image && {
            image: {
              data: image.data,
              mimeType: image.mimeType
            }
          }
        }
      ];
      const historyMessages = this.currentSession?.messages || [];
      for (const entry of historyMessages.slice(-10)) {
        if (entry.role !== "system") {
          messages.push({
            role: entry.role,
            content: entry.content
          });
        }
      }
      let totalInputChars = 0;
      for (const msg of messages) {
        totalInputChars += msg.content.length;
        if (msg.image) {
          totalInputChars += 4400;
        }
      }
      const estimatedInputTokens = Math.ceil(totalInputChars / 4);
      let contextWindow = 128e3;
      if (provider === "azure" /* Azure */) {
        const azureCreds = await this.credentialManager.getAzureCredentials();
        if (azureCreds?.modelName) {
          if (azureCreds.modelName.includes("gpt-4")) {
            contextWindow = 128e3;
          } else if (azureCreds.modelName.includes("gpt-3.5")) {
            contextWindow = 16e3;
          }
        }
      }
      this.sendMessage({
        type: "tokenUpdate",
        inputTokens: estimatedInputTokens,
        contextWindow
      });
      let response;
      this.sendMessage({
        type: "loadingUpdate",
        message: `Sending request to ${provider === "azure" /* Azure */ ? "Azure OpenAI" : "NVIDIA"}...`
      });
      if (provider === "azure" /* Azure */) {
        const azureCreds = await this.credentialManager.getAzureCredentials();
        if (!azureCreds) {
          throw new Error("Azure credentials not found");
        }
        response = await this.azureGPTService.chatCompletion(
          messages,
          (delta) => {
            this.sendMessage({
              type: "messageDelta",
              delta
            });
          },
          this.abortController.signal
        );
      } else {
        const nvidiaCreds = await this.credentialManager.getNvidiaCredentials();
        if (!nvidiaCreds) {
          throw new Error("NVIDIA credentials not found");
        }
        this.nvidiaService.setCredentials(nvidiaCreds);
        response = await this.nvidiaService.chatCompletion(
          messages,
          (delta) => {
            this.sendMessage({
              type: "messageDelta",
              delta
            });
          },
          this.abortController.signal
        );
      }
      this.sendMessage({
        type: "loadingStopped"
      });
      this.sendMessage({
        type: "streamingComplete"
      });
      const structuredResponse = this.azureGPTService.parseStructuredResponse(response);
      if (structuredResponse.files && structuredResponse.files.length > 0) {
        for (const file of structuredResponse.files) {
          if (this.gitManager) {
            const originalContent = await this.gitManager.getOriginalContent(file.path);
            file.originalContent = originalContent || void 0;
          }
        }
      }
      this.sendMessage({
        type: "streamingComplete"
      });
      const assistantEntry = {
        id: this.generateId(),
        role: "assistant",
        content: structuredResponse.explanation,
        timestamp: Date.now(),
        files: structuredResponse.files
      };
      if (this.currentSession) {
        this.currentSession.messages.push(assistantEntry);
        await this.chatHistoryManager.addMessage(assistantEntry);
      }
      if (this.gitManager && structuredResponse.files && structuredResponse.files.length > 0) {
        Logger.log(`Prepared ${structuredResponse.files.length} file changes for git commit after user approval`);
      }
      this.abortController = null;
    } catch (error) {
      this.abortController = null;
      if (error.name === "AbortError") {
        return;
      }
      this.sendMessage({
        type: "loadingStopped"
      });
      this.sendMessage({
        type: "error",
        message: error.message || `Failed to get response from ${provider === "azure" /* Azure */ ? "Azure GPT" : "NVIDIA"}`
      });
    }
  }
  /**
   * Apply file changes
   */
  async applyChanges(files) {
    try {
      const filesToBackup = files.filter((f) => f.action === "update").map((f) => f.path);
      await this.backupManager.backupFiles(filesToBackup);
      await this.fileManager.applyFileChanges(files);
      vscode3.window.showInformationMessage(
        `Successfully applied changes to ${files.length} file(s)`
      );
      this.sendMessage({
        type: "changesApplied",
        files
      });
      if (this.gitManager) {
        const gitChanges = files.map((f) => ({
          path: f.path,
          action: f.action,
          content: f.content
        }));
        const messages = this.currentSession?.messages || [];
        const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
        await this.gitManager.commitAIChanges(gitChanges, lastUserMessage?.content || "AI changes");
      }
    } catch (error) {
      vscode3.window.showErrorMessage(`Failed to apply changes: ${error.message}`);
    }
  }
  /**
   * Apply single file change
   */
  async applySingleChange(file, userMessage) {
    try {
      if (file.action === "update") {
        await this.backupManager.backupFiles([file.path]);
      }
      await this.fileManager.applyFileChanges([file]);
      if (this.gitManager) {
        const gitChange = {
          path: file.path,
          action: file.action,
          content: file.content
        };
        await this.gitManager.commitAIChanges([gitChange], userMessage);
      }
      vscode3.window.showInformationMessage(`Applied change to ${file.path}`);
    } catch (error) {
      vscode3.window.showErrorMessage(`Failed to apply change to ${file.path}: ${error.message}`);
    }
  }
  /**
   * Open a file in the editor
   */
  async openFile(filePath) {
    const workspaceFolders = vscode3.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }
    const fullPath = `${workspaceFolders[0].uri.fsPath}/${filePath}`;
    const uri = vscode3.Uri.file(fullPath);
    await vscode3.window.showTextDocument(uri);
  }
  /**
   * Clear chat history
   */
  async clearHistory() {
    if (this.currentSession) {
      this.currentSession.messages = [];
      await this.chatHistoryManager.updateSession(this.currentSession.id, []);
      this.messagesLoaded = false;
      this.sendMessage({ type: "historyCleared" });
    }
  }
  /**
   * Export chat history
   */
  async exportHistory() {
    const workspaceFolders = vscode3.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode3.window.showErrorMessage("No workspace folder open");
      return;
    }
    const exportPath = `${workspaceFolders[0].uri.fsPath}/azure-gpt-chat-export-${Date.now()}.json`;
    const uri = vscode3.Uri.file(exportPath);
    const encoder = new TextEncoder();
    const messages = this.currentSession?.messages || [];
    const content = encoder.encode(JSON.stringify(messages, null, 2));
    await vscode3.workspace.fs.writeFile(uri, content);
    vscode3.window.showInformationMessage(`Chat history exported to ${exportPath}`);
  }
  /**
   * Load chat history from storage
   */
  async loadChatHistory() {
    if (!this.currentSession) {
      await this.initializeSession();
    }
    if (this.currentSession) {
      this.sendMessage({
        type: "sessionLoaded",
        session: this.currentSession
      });
    }
  }
  /**
   * Save chat history to storage
   */
  async saveChatHistory() {
    if (this.currentSession) {
      await this.chatHistoryManager.updateSession(
        this.currentSession.id,
        this.currentSession.messages
      );
    }
  }
  /**
   * Create a new chat
   */
  async createNewChat() {
    const newSession = await this.chatHistoryManager.createSession();
    this.currentSession = newSession;
    this.messagesLoaded = false;
    this.sendMessage({ type: "sessionChanged", session: newSession });
    Logger.log(`Created new chat session: ${newSession.id}`);
  }
  /**
   * Switch to a different session
   */
  async switchSession(sessionId) {
    await this.chatHistoryManager.setActiveSession(sessionId);
    const session = await this.chatHistoryManager.getSession(sessionId);
    if (session) {
      this.currentSession = session;
      this.messagesLoaded = false;
      this.sendMessage({ type: "sessionChanged", session });
      Logger.log(`Switched to chat session: ${sessionId}`);
    }
  }
  /**
   * Delete a session
   */
  async deleteSession(sessionId) {
    await this.chatHistoryManager.deleteSession(sessionId);
    await this.initializeSession();
    if (this.currentSession) {
      this.sendMessage({
        type: "sessionChanged",
        session: this.currentSession
      });
    }
    Logger.log(`Deleted session: ${sessionId}`);
  }
  /**
   * Load all sessions for the sidebar
   */
  async loadSessions() {
    const sessions = await this.chatHistoryManager.getAllSessions();
    const activeSessionId = await this.chatHistoryManager.getActiveSessionId();
    this.sendMessage({
      type: "sessionsList",
      sessions,
      activeSessionId
    });
  }
  /**
   * Update session title
   */
  async updateSessionTitle(sessionId, title) {
    await this.chatHistoryManager.updateSessionTitle(sessionId, title);
    await this.loadSessions();
  }
  /**
   * Execute terminal command
   */
  async executeTerminalCommand(command) {
    try {
      const cmd = await this.terminalManager.executeCommand(command);
      this.sendMessage({
        type: "terminalCommandExecuted",
        command: cmd
      });
    } catch (error) {
      this.sendMessage({
        type: "error",
        message: `Failed to execute command: ${error.message}`
      });
    }
  }
  /**
   * Kill process on port
   */
  async killProcessOnPort(port) {
    try {
      const success = await this.terminalManager.killProcessOnPort(port);
      if (success) {
        this.sendMessage({
          type: "info",
          message: `Successfully killed process on port ${port}`
        });
      } else {
        this.sendMessage({
          type: "error",
          message: `No process found on port ${port}`
        });
      }
    } catch (error) {
      this.sendMessage({
        type: "error",
        message: `Failed to kill process: ${error.message}`
      });
    }
  }
  /**
   * Kill process by name
   */
  async killProcessByName(name) {
    try {
      const success = await this.terminalManager.killProcessByName(name);
      if (success) {
        this.sendMessage({
          type: "info",
          message: `Successfully killed process: ${name}`
        });
      } else {
        this.sendMessage({
          type: "error",
          message: `No process found with name: ${name}`
        });
      }
    } catch (error) {
      this.sendMessage({
        type: "error",
        message: `Failed to kill process: ${error.message}`
      });
    }
  }
  /**
   * Check if port is in use
   */
  async checkPortInUse(port) {
    try {
      const inUse = await this.terminalManager.isPortInUse(port);
      this.sendMessage({
        type: "portCheckResult",
        port,
        inUse
      });
    } catch (error) {
      this.sendMessage({
        type: "error",
        message: `Failed to check port: ${error.message}`
      });
    }
  }
  /**
   * Send message to webview
   */
  sendMessage(message) {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }
  /**
   * Generate unique ID
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  /**
   * Get HTML for webview
   */
  getHtmlForWebview(webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Azure GPT Chat</title>
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
            background-color: var(--vscode-editor-background);
            padding: 16px;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .header h1 {
            font-size: 16px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .header-actions {
            display: flex;
            gap: 8px;
        }

        .header-actions button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }

        .header-actions button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 16px;
        }

        .message {
            padding: 12px;
            border-radius: 8px;
            max-width: 85%;
            word-wrap: break-word;
        }

        .message.user {
            align-self: flex-end;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .message.assistant {
            align-self: flex-start;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            color: var(--vscode-foreground);
        }

        .message.system {
            align-self: center;
            background-color: var(--vscode-editorInfo-background);
            color: var(--vscode-editorInfo-foreground);
            font-size: 12px;
            max-width: 100%;
        }

        .message-content {
            white-space: pre-wrap;
        }

        .message-content pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 8px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
        }

        .message-content code {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
        }

        .file-changes {
            margin-top: 12px;
            padding: 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
        }

        .file-changes h3 {
            font-size: 14px;
            margin-bottom: 12px;
        }

        .file-changes-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .accept-all-button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }

        .accept-all-button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .file-change {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            background-color: var(--vscode-editor-background);
            margin: 6px 0;
            border-radius: 4px;
            border-left: 3px solid transparent;
        }

        .file-change.create {
            border-left-color: #4ec9b0;
        }

        .file-change.update {
            border-left-color: #dcdcaa;
        }

        .file-change.delete {
            border-left-color: #f14c4c;
        }

        .file-change-info {
            flex: 1;
        }

        .file-change-path {
            font-size: 13px;
            font-weight: 500;
        }

        .file-change-badge {
            display: inline-block;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            margin-left: 8px;
            text-transform: uppercase;
            font-weight: 600;
        }

        .file-change-badge.create {
            background-color: #4ec9b0;
            color: #000;
        }

        .file-change-badge.update {
            background-color: #dcdcaa;
            color: #000;
        }

        .file-change-badge.delete {
            background-color: #f14c4c;
            color: #fff;
        }

        .file-change-actions {
            display: flex;
            gap: 6px;
        }

        .file-change-actions button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 10px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }

        .file-change-actions button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .loading-indicator {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            margin-bottom: 12px;
        }

        .loading-indicator.hidden {
            display: none;
        }

        .stop-button {
            background: var(--vscode-errorBackground);
            color: var(--vscode-errorForeground);
            border: none;
            padding: 6px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            display: none;
        }

        .stop-button:not(.hidden) {
            display: block;
        }

        .stop-button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .loading-content {
            display: none;
            flex: 1;
            font-size: 13px;
            line-height: 1.5;
            color: var(--vscode-foreground);
            white-space: pre-wrap;
            word-wrap: break-word;
            margin-top: 8px;
        }

        .loading-content:not(.hidden) {
            display: block;
        }

        .token-usage {
            display: none;
            margin-top: 12px;
            padding: 12px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            font-size: 11px;
        }

        .token-usage:not(.hidden) {
            display: block;
        }

        .token-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
        }

        .token-row:last-child {
            margin-bottom: 0;
        }

        .token-label {
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }

        .token-value {
            color: var(--vscode-foreground);
            font-weight: 600;
            font-family: var(--vscode-editor-font-family);
        }

        .token-context-window {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-panel-border);
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            text-align: center;
        }

        #contextUsage.warning {
            color: var(--vscode-errorForeground);
        }

        #contextUsage.high {
            color: var(--vscode-warningForeground);
        }

        .loading-indicator {
            flex-direction: column;
            align-items: flex-start;
        }

        .input-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .context-options {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .context-option {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
        }

        .context-option input[type="checkbox"] {
            cursor: pointer;
        }

        .context-option {
            cursor: help;
            position: relative;
        }

        .input-row {
            display: flex;
            gap: 8px;
        }

        .input-row textarea {
            flex: 1;
            min-height: 60px;
            max-height: 200px;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            resize: vertical;
            font-family: var(--vscode-font-family);
        }

        .input-row button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        }

        .input-row button:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground);
        }

        .input-row button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .image-attachment-container {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-bottom: 8px;
        }

        .image-upload-button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .image-upload-button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .image-preview {
            display: none;
            align-items: center;
            gap: 8px;
            padding: 6px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }

        .image-preview:not(.hidden) {
            display: flex;
        }

        .image-preview img {
            max-width: 60px;
            max-height: 60px;
            border-radius: 4px;
            object-fit: cover;
            display: none;
        }

        .image-preview:not(.hidden) img {
            display: block;
        }

        .image-preview-info {
            display: flex;
            flex-direction: column;
            font-size: 11px;
        }

        .image-preview-name {
            color: var(--vscode-foreground);
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .image-preview-remove {
            background: var(--vscode-errorBackground);
            color: var(--vscode-errorForeground);
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }

        .image-preview-remove:hover {
            opacity: 0.8;
        }

        #imageInput {
            display: none;
        }

        .loading {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid var(--vscode-foreground);
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state h2 {
            font-size: 18px;
            margin-bottom: 8px;
        }

        .empty-state p {
            font-size: 14px;
        }

        .empty-state button {
            margin-top: 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }

        .loading-content::after {
            content: '\u258B';
            display: inline-block;
            margin-left: 4px;
            animation: blink 1s infinite;
        }

        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Prime DevBot</h1>
        <div class="header-actions">
            <button id="newChatBtn">New Chat</button>
            <button id="clearHistory">Clear History</button>
            <button id="exportHistory">Export</button>
            <button id="configureExclusions">Exclusions</button>
            <button id="configureCredentials">Configure</button>
        </div>
    </div>

    <div class="chat-container" id="chatContainer">
        <div class="empty-state">
            <h2>Welcome to DevBot Assistant</h2>
            <p>Ask me anything about your code!</p>
            <button id="configureNow">Configure Azure Credentials</button>
        </div>
    </div>

    <div class="loading-indicator hidden" id="loadingIndicator">
        <div class="spinner"></div>
        <span id="loadingMessage">Thinking...</span>
        <button id="stopButton" class="stop-button hidden">Stop</button>
        <div id="loadingContent" class="loading-content hidden"></div>

        <!-- Token Usage Display -->
        <div class="token-usage" id="tokenUsage">
            <div class="token-row">
                <span class="token-label">Input Tokens:</span>
                <span class="token-value" id="inputTokens">0</span>
            </div>
            <div class="token-row">
                <span class="token-label">Output Tokens:</span>
                <span class="token-value" id="outputTokens">0</span>
            </div>
            <div class="token-row">
                <span class="token-label">Total Tokens:</span>
                <span class="token-value" id="totalTokens">0</span>
            </div>
            <div class="token-row">
                <span class="token-label">Context Usage:</span>
                <span class="token-value" id="contextUsage">0%</span>
            </div>
            <div class="token-context-window">
                Context Window: <span id="contextWindow">128K</span>
            </div>
        </div>
    </div>

    <div class="input-container">
        <div class="context-options">
            <label class="context-option" title="Include the currently open file in context">
                <input type="checkbox" id="includeCurrentFile" checked>
                Active File
            </label>
            <label class="context-option" title="Include git diff of recent changes">
                <input type="checkbox" id="includeGitDiff">
                Git Diff
            </label>
            <label class="context-option" title="Include terminal output">
                <input type="checkbox" id="includeTerminal">
                Terminal
            </label>
        </div>

        <div class="image-attachment-container">
            <input type="file" id="imageInput" accept="image/png,image/jpeg,image/gif,image/webp">
            <button id="imageUploadButton" class="image-upload-button">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8.75 2.75a.75.75 0 00-1.5 0v5.5h-5.5a.75.75 0 000 1.5h5.5v5.5a.75.75 0 001.5 0v-5.5h5.5a.75.75 0 000-1.5h-5.5v-5.5z"/>
                </svg>
                Add Image
            </button>
            <div id="imagePreview" class="image-preview hidden">
                <img id="previewImage" alt="Preview">
                <div class="image-preview-info">
                    <span id="imageName" class="image-preview-name"></span>
                </div>
                <button id="removeImage" class="image-preview-remove">Remove</button>
            </div>
        </div>

        <div class="input-row">
            <textarea id="messageInput" placeholder="Ask me anything about your code..."></textarea>
            <button id="sendButton">Send</button>
        </div>
    </div>

    <script>
        console.log('Chat panel script loading...');
        const vscode = acquireVsCodeApi();
        let isLoading = false;
        let attachedImage = null; // Store base64 encoded image

        // Wait for DOM to be ready before accessing elements
        function initializeDOMElements() {
            console.log('DOM ready state:', document.readyState);
            console.log('Initializing DOM elements...');
            
            // Get all DOM elements
            const chatContainer = document.getElementById('chatContainer');
            const messageInput = document.getElementById('messageInput');
            const sendButton = document.getElementById('sendButton');
            const newChatBtn = document.getElementById('newChatBtn');
            const clearHistoryBtn = document.getElementById('clearHistory');
            const exportHistoryBtn = document.getElementById('exportHistory');
            const exclusionsBtn = document.getElementById('configureExclusions');
            const configureBtn = document.getElementById('configureCredentials');
            const configureNowBtn = document.getElementById('configureNow');
            const imageInput = document.getElementById('imageInput');
            const imageUploadButton = document.getElementById('imageUploadButton');
            const imagePreview = document.getElementById('imagePreview');
            const previewImage = document.getElementById('previewImage');
            const imageName = document.getElementById('imageName');
            const removeImageBtn = document.getElementById('removeImage');

            console.log('DOM elements found:', {
                chatContainer: !!chatContainer,
                messageInput: !!messageInput,
                sendButton: !!sendButton,
                newChatBtn: !!newChatBtn,
                clearHistoryBtn: !!clearHistoryBtn,
                exportHistoryBtn: !!exportHistoryBtn,
                exclusionsBtn: !!exclusionsBtn,
                configureBtn: !!configureBtn,
                configureNowBtn: !!configureNowBtn,
                imageUploadButton: !!imageUploadButton,
                imageInput: !!imageInput
            });

            // Test message channel
            console.log('Testing message channel...');
            vscode.postMessage({ type: 'ping', timestamp: Date.now() });
            console.log('Ping message sent');

            // Attach event listeners
            attachEventListeners();
        }

        // Attach all event listeners
        function attachEventListeners() {
            console.log('=== Attaching event listeners ===');

            // Get DOM elements again to ensure they're accessible in this scope
            const chatContainer = document.getElementById('chatContainer');
            const messageInput = document.getElementById('messageInput');
            const sendButton = document.getElementById('sendButton');
            const newChatBtn = document.getElementById('newChatBtn');
            const clearHistoryBtn = document.getElementById('clearHistory');
            const exportHistoryBtn = document.getElementById('exportHistory');
            const exclusionsBtn = document.getElementById('configureExclusions');
            const configureBtn = document.getElementById('configureCredentials');
            const configureNowBtn = document.getElementById('configureNow');
            const imageInput = document.getElementById('imageInput');
            const imageUploadButton = document.getElementById('imageUploadButton');
            const imagePreview = document.getElementById('imagePreview');
            const previewImage = document.getElementById('previewImage');
            const imageName = document.getElementById('imageName');
            const removeImageBtn = document.getElementById('removeImage');

            // Log all button elements for debugging
            console.log('DOM elements status:', {
                sendButton: !!sendButton,
                messageInput: !!messageInput,
                newChatBtn: !!newChatBtn,
                clearHistoryBtn: !!clearHistoryBtn,
                exportHistoryBtn: !!exportHistoryBtn,
                exclusionsBtn: !!exclusionsBtn,
                configureBtn: !!configureBtn,
                configureNowBtn: !!configureNowBtn,
                imageUploadButton: !!imageUploadButton,
                imageInput: !!imageInput
            });

            // Send button
            if (sendButton && !sendButton.hasAttribute('data-initialized')) {
                sendButton.addEventListener('click', () => {
                    console.log('\u2713 Send button clicked!');
                    sendMessage();
                });
                sendButton.setAttribute('data-initialized', 'true');
                console.log('\u2713 Send button event listener attached');
            } else if (sendButton) {
                console.log('\u2713 Send button already initialized');
            } else {
                console.error('\u2717 Send button element NOT FOUND!');
            }

            // Message input - Enter key
            if (messageInput && !messageInput.hasAttribute('data-initialized')) {
                messageInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        console.log('\u2713 Enter key pressed, sending message');
                        sendMessage();
                    }
                });
                messageInput.setAttribute('data-initialized', 'true');
                console.log('\u2713 Message input event listener attached');
            } else if (messageInput) {
                console.log('\u2713 Message input already initialized');
            } else {
                console.error('\u2717 Message input element NOT FOUND!');
            }

            // New chat button
            if (newChatBtn && !newChatBtn.hasAttribute('data-initialized')) {
                newChatBtn.addEventListener('click', () => {
                    console.log('\u2713 New chat button clicked');
                    vscode.postMessage({ type: 'newChat' });
                });
                newChatBtn.setAttribute('data-initialized', 'true');
                console.log('\u2713 New chat button event listener attached');
            } else if (newChatBtn) {
                console.log('\u2713 New chat button already initialized');
            } else {
                console.error('\u2717 New chat button element NOT FOUND!');
            }

            // Clear history button
            if (clearHistoryBtn && !clearHistoryBtn.hasAttribute('data-initialized')) {
                clearHistoryBtn.addEventListener('click', () => {
                    console.log('\u2713 Clear history button clicked');
                    vscode.postMessage({ type: 'clearHistory' });
                });
                clearHistoryBtn.setAttribute('data-initialized', 'true');
                console.log('\u2713 Clear history button event listener attached');
            } else if (clearHistoryBtn) {
                console.log('\u2713 Clear history button already initialized');
            } else {
                console.error('\u2717 Clear history button element NOT FOUND!');
            }

            // Export history button
            if (exportHistoryBtn && !exportHistoryBtn.hasAttribute('data-initialized')) {
                exportHistoryBtn.addEventListener('click', () => {
                    console.log('\u2713 Export history button clicked');
                    vscode.postMessage({ type: 'exportHistory' });
                });
                exportHistoryBtn.setAttribute('data-initialized', 'true');
                console.log('\u2713 Export history button event listener attached');
            } else if (exportHistoryBtn) {
                console.log('\u2713 Export history button already initialized');
            } else {
                console.error('\u2717 Export history button element NOT FOUND!');
            }

            // Exclusions button
            if (exclusionsBtn && !exclusionsBtn.hasAttribute('data-initialized')) {
                exclusionsBtn.addEventListener('click', () => {
                    console.log('\u2713 Exclusions button clicked');
                    vscode.postMessage({ type: 'configureExclusions' });
                });
                exclusionsBtn.setAttribute('data-initialized', 'true');
                console.log('\u2713 Exclusions button event listener attached');
            } else if (exclusionsBtn) {
                console.log('\u2713 Exclusions button already initialized');
            } else {
                console.error('\u2717 Exclusions button element NOT FOUND!');
            }

            // Configure button
            if (configureBtn && !configureBtn.hasAttribute('data-initialized')) {
                configureBtn.addEventListener('click', () => {
                    console.log('\u2713 Configure button clicked');
                    vscode.postMessage({ type: 'configureCredentials' });
                });
                configureBtn.setAttribute('data-initialized', 'true');
                console.log('\u2713 Configure button event listener attached');
            } else if (configureBtn) {
                console.log('\u2713 Configure button already initialized');
            } else {
                console.error('\u2717 Configure button element NOT FOUND!');
            }

            // Configure now button
            if (configureNowBtn && !configureNowBtn.hasAttribute('data-initialized')) {
                configureNowBtn.addEventListener('click', () => {
                    console.log('\u2713 Configure now button clicked');
                    vscode.postMessage({ type: 'configureCredentials' });
                });
                configureNowBtn.setAttribute('data-initialized', 'true');
                console.log('\u2713 Configure now button event listener attached');
            } else if (configureNowBtn) {
                console.log('\u2713 Configure now button already initialized');
            } else {
                console.error('\u2717 Configure now button element NOT FOUND!');
            }

            console.log('=== Event listeners attachment complete ===');

            // Stop button - cancel in-progress request
            const stopButton = document.getElementById('stopButton');
            if (stopButton) {
                stopButton.addEventListener('click', () => {
                    console.log('\u2713 Stop button clicked');
                    vscode.postMessage({ type: 'stopRequest' });
                });
                console.log('\u2713 Stop button event listener attached');
            } else {
                console.warn('\u26A0 Stop button element not found (optional, may not be present yet)');
            }

            // Image upload handling - with null checks
            if (imageUploadButton && imageInput) {
                imageUploadButton.addEventListener('click', () => {
                    console.log('\u2713 Image upload button clicked');
                    imageInput.click();
                });
                console.log('\u2713 Image upload button event listener attached');

                imageInput.addEventListener('change', (e) => {
                    console.log('\u2713 Image input changed');
                    const file = e.target.files[0];
                    if (file) {
                        // Check file size (max 10MB)
                        if (file.size > 10 * 1024 * 1024) {
                            alert('Image size must be less than 10MB');
                            imageInput.value = '';
                            return;
                        }

                        // Check file type
                        if (!file.type.startsWith('image/')) {
                            alert('Please select an image file');
                            imageInput.value = '';
                            return;
                        }

                        // Read and encode the image
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const base64 = event.target.result.split(',')[1]; // Remove data URL prefix
                            attachedImage = {
                                data: base64,
                                mimeType: file.type,
                                name: file.name
                            };

                            // Show preview
                            if (previewImage && imageName && imagePreview) {
                                previewImage.src = event.target.result;
                                imageName.textContent = file.name;
                                imagePreview.classList.remove('hidden');
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }

            // Remove image button
            if (removeImageBtn) {
                removeImageBtn.addEventListener('click', () => {
                    attachedImage = null;
                    if (imageInput) imageInput.value = '';
                    if (imagePreview) imagePreview.classList.add('hidden');
                });
            }
        }

        // Send message function
        function sendMessage() {
            try {
                const messageInput = document.getElementById('messageInput');
                console.log('sendMessage called, message:', messageInput?.value);
                if (!messageInput) {
                    console.error('messageInput not found!');
                    return;
                }
                const message = messageInput.value.trim();

                if (!message || isLoading) {
                    console.log('Message empty or loading, returning');
                    return;
                }

                const includeCurrentFile = document.getElementById('includeCurrentFile');
                const includeGitDiff = document.getElementById('includeGitDiff');
                const includeTerminal = document.getElementById('includeTerminal');

                const context = {
                    includeCurrentFile: includeCurrentFile ? includeCurrentFile.checked : false,
                    includeGitDiff: includeGitDiff ? includeGitDiff.checked : false,
                    includeTerminal: includeTerminal ? includeTerminal.checked : false
                };

                // Clear input and reset image attachment
                messageInput.value = '';
                const imageToSend = attachedImage;
                attachedImage = null;
                imageInput.value = '';
                if (imagePreview) imagePreview.classList.add('hidden');
                
                setLoading(true);

                const messageData = {
                    type: 'sendMessage',
                    message,
                    context,
                    image: imageToSend
                };
                console.log('Sending message to extension:', messageData);
                vscode.postMessage(messageData);
            } catch (error) {
                console.error('Error in sendMessage:', error);
                const chatContainer = document.getElementById('chatContainer');
                if (chatContainer) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'message system';
                    errorDiv.innerHTML = \`<div class="message-content">Error sending message: \${error.message}</div>\`;
                    chatContainer.appendChild(errorDiv);
                }
                setLoading(false);
            }
        }

// Set loading state
function setLoading(loading, message = 'Thinking...') {
    isLoading = loading;
    sendButton.disabled = loading;
    sendButton.textContent = loading ? 'Sending...' : 'Send';

    const loadingIndicator = document.getElementById('loadingIndicator');
    const loadingMessage = document.getElementById('loadingMessage');
    const loadingContent = document.getElementById('loadingContent');
    const stopButton = document.getElementById('stopButton');

    if (loading) {
        loadingIndicator.classList.remove('hidden');
        loadingMessage.textContent = message;
        if (loadingContent) {
            loadingContent.textContent = '';
            loadingContent.classList.add('hidden');
        }
        if (stopButton) {
            stopButton.classList.remove('hidden');
        }
    } else {
        loadingIndicator.classList.add('hidden');
        if (stopButton) {
            stopButton.classList.add('hidden');
        }
    }
}

// Update loading message without changing loading state
function updateLoadingMessage(message) {
    const loadingMessage = document.getElementById('loadingMessage');
    if (loadingMessage) {
        loadingMessage.textContent = message;
    }
}

// Token counting - rough estimation (1 token \u2248 4 characters for English)
function estimateTokens(text) {
    if (!text) return 0;
    // Rough estimation: ~4 characters per token for English text
    // This is not exact but gives a reasonable approximation
    return Math.ceil(text.length / 4);
}

// Update token display
function updateTokenDisplay(inputTokens, outputTokens, contextWindow = 128000) {
    const inputEl = document.getElementById('inputTokens');
    const outputEl = document.getElementById('outputTokens');
    const totalEl = document.getElementById('totalTokens');
    const usageEl = document.getElementById('contextUsage');

    if (inputEl) inputEl.textContent = inputTokens.toLocaleString();
    if (outputEl) outputEl.textContent = outputTokens.toLocaleString();

    const total = inputTokens + outputTokens;
    if (totalEl) totalEl.textContent = total.toLocaleString();

    if (usageEl) {
        const usage = ((total / contextWindow) * 100).toFixed(1);
        usageEl.textContent = usage + '%';

        // Update color based on usage
        usageEl.className = 'token-value';
        if (parseFloat(usage) > 90) {
            usageEl.classList.add('warning');
        } else if (parseFloat(usage) > 75) {
            usageEl.classList.add('high');
        }
    }
}

// Reset token display
function resetTokenDisplay() {
    updateTokenDisplay(0, 0);
}

// Streaming message handling - shows in loader like Cursor
let streamingContent = '';
let isStreaming = false;
let currentInputTokens = 0;
let currentOutputTokens = 0;

function appendStreamingContent(delta) {
    isStreaming = true;

    // Show streaming content in the loading indicator
    const loadingIndicator = document.getElementById('loadingIndicator');
    const loadingMessage = document.getElementById('loadingMessage');
    const loadingContent = document.getElementById('loadingContent');

    if (loadingContent) {
        loadingContent.classList.remove('hidden');
        loadingMessage.classList.add('hidden');

        // Append the delta and show it
        streamingContent += delta;
        loadingContent.textContent = streamingContent;

        // Update output token count in real-time
        currentOutputTokens = estimateTokens(streamingContent);
        updateTokenDisplay(currentInputTokens, currentOutputTokens);

        // Auto-scroll chat container to show latest
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

function setInputTokens(tokens) {
    currentInputTokens = tokens;
    updateTokenDisplay(currentInputTokens, currentOutputTokens);
}

function finalizeStreamingMessage() {
    isStreaming = false;
    const finalContent = streamingContent;
    streamingContent = '';

    // Hide loading indicator
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.classList.add('hidden');
    }

    // Create the actual assistant message bubble with the complete content
    if (finalContent) {
        addMessage({
            id: Date.now(),
            role: 'assistant',
            content: finalContent,
            timestamp: Date.now()
        });
    }
}

// Store current files for accept all
let currentFiles = [];
let currentUserMessage = '';

// Add file changes
function addFileChanges(files, userMessage) {
    currentFiles = files;
    currentUserMessage = userMessage;

    const changesDiv = document.createElement('div');
    changesDiv.className = 'file-changes';

    const created = files.filter(f => f.action === 'create').length;
    const modified = files.filter(f => f.action === 'update').length;
    const deleted = files.filter(f => f.action === 'delete').length;

    let summary = 'Proposed Changes';
    if (created > 0 || modified > 0 || deleted > 0) {
        summary += ' (';
        if (created > 0) summary += \`\${created} new\`;
        if (created > 0 && modified > 0) summary += ', ';
        if (modified > 0) summary += \`\${modified} modified\`;
        if ((created > 0 || modified > 0) && deleted > 0) summary += ', ';
        if (deleted > 0) summary += \`\${deleted} deleted\`;
        summary += ')';
    }

    changesDiv.innerHTML = \`
        <div class="file-changes-header">
            <h3>\${escapeHtml(summary)}</h3>
            <button class="accept-all-button" onclick="acceptAllChanges()">Accept All</button>
        </div>
    \`;

    files.forEach(file => {
        const fileDiv = document.createElement('div');
        fileDiv.className = \`file-change \${file.action}\`;

        const badgeLabels = {
            'create': 'NEW',
            'update': 'MODIFIED',
            'delete': 'DELETED'
        };

        fileDiv.innerHTML = \`
            <div class="file-change-info">
                <div class="file-change-path">
                    \${escapeHtml(file.path)}
                    <span class="file-change-badge \${file.action}">\${badgeLabels[file.action] || file.action.toUpperCase()}</span>
                </div>
            </div>
            <div class="file-change-actions">
                <button onclick="openFile('\${escapeHtml(file.path)}')">View</button>
                <button onclick="acceptSingleChange('\${escapeHtml(file.path)}', '\${escapeHtml(file.action)}')">Accept</button>
            </div>
        \`;
        changesDiv.appendChild(fileDiv);
    });

    chatContainer.appendChild(changesDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Add message to chat
function addMessage(message) {
    try {
        // Check for duplicate messages by ID
        if (message.id) {
            const existingMessage = chatContainer.querySelector(\`[data-message-id="\${message.id}"]\`);
            if (existingMessage) {
                console.log('Duplicate message detected, skipping:', message.id);
                return;
            }
        }

        // Remove empty state
        const emptyState = chatContainer.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = \`message \${message.role}\`;
        if (message.id) {
            messageDiv.setAttribute('data-message-id', message.id);
        }
        messageDiv.innerHTML = \`<div class="message-content">\${escapeHtml(message.content)}</div>\`;

        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Add file changes if present
        if (message.files && message.files.length > 0) {
            addFileChanges(message.files, message.content);
        }
    } catch (error) {
        console.error('Error in addMessage:', error);
    }
}
        // Open file
        function openFile(path) {
            vscode.postMessage({
                type: 'openFile',
                path
            });
        }

        // Escape HTML
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Initialize when DOM is ready
        function initializeChat() {
            // Prevent multiple event listener attachments
            if (window.chatPanelInitialized) {
                console.log('Chat panel already initialized, skipping...');
                return;
            }
            window.chatPanelInitialized = true;

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initializeDOMElements);
            } else {
                // DOM is already ready, initialize immediately
                initializeDOMElements();
            }

            // Fallback: Try initialization after a short delay in case DOM is not ready
            setTimeout(() => {
                const sendButton = document.getElementById('sendButton');
                if (!sendButton || !sendButton.hasAttribute('data-initialized')) {
                    console.log('Fallback initialization triggered');
                    initializeDOMElements();
                }
            }, 1000);
        }

        // Start initialization
        initializeChat();

        // Handle messages from extension
        window.addEventListener('message', (event) => {
            const message = event.data;
            console.log('\u2190 Received message from extension:', message.type);

            switch (message.type) {
                case 'pong':
                    console.log('\u2713 Communication channel working! Pong received');
                    break;
                case 'clearChat':
                    chatContainer.innerHTML = '';
                    break;
                case 'messageAdded':
                    addMessage(message.message);
                    break;
                case 'messageDelta':
                    // Handle streaming response - append chunks in real-time
                    appendStreamingContent(message.delta);
                    break;
                case 'streamingComplete':
                    // Streaming finished, finalize the message
                    finalizeStreamingMessage();
                    break;
                case 'loadingStarted':
                    setLoading(true, message.message);
                    resetTokenDisplay();
                    // Show token usage display
                    const tokenUsageEl = document.getElementById('tokenUsage');
                    if (tokenUsageEl) {
                        tokenUsageEl.classList.remove('hidden');
                    }
                    break;
                case 'loadingUpdate':
                    updateLoadingMessage(message.message);
                    break;
                case 'tokenUpdate':
                    if (message.inputTokens !== undefined) {
                        setInputTokens(message.inputTokens);
                    }
                    if (message.contextWindow !== undefined) {
                        const contextEl = document.getElementById('contextWindow');
                        if (contextEl) {
                            const context = message.contextWindow >= 1000
                                ? (message.contextWindow / 1000).toFixed(0) + 'K'
                                : message.contextWindow;
                            contextEl.textContent = context;
                        }
                    }
                    break;
                case 'loadingStopped':
                    setLoading(false);
                    // Hide token usage display
                    const tokenUsageEl2 = document.getElementById('tokenUsage');
                    if (tokenUsageEl2) {
                        tokenUsageEl2.classList.add('hidden');
                    }
                    // Also finalize streaming if active
                    if (isStreaming) {
                        finalizeStreamingMessage();
                    }
                    break;
                case 'error':
                    if (isStreaming) {
                        finalizeStreamingMessage();
                    }
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: 'Error: ' + message.message,
                        timestamp: Date.now()
                    });
                    setLoading(false);
                    break;
                case 'historyCleared':
                    chatContainer.innerHTML = \`
                        <div class="empty-state">
                            <h2>Chat Cleared</h2>
                            <p>Start a new conversation!</p>
                        </div>
                    \`;
                    break;
                case 'changesApplied':
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: 'Changes applied successfully!',
                        timestamp: Date.now()
                    });
                    break;
                case 'requestStopped':
                    // Request was cancelled by user
                    setLoading(false);
                    if (isStreaming) {
                        finalizeStreamingMessage();
                    }
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: 'Request cancelled by user.',
                        timestamp: Date.now()
                    });
                    break;
                case 'sessionsList':
                    console.log('Sessions list received:', message.sessions);
                    // Could update a session selector UI here if needed
                    break;
                case 'sessionLoaded':
                    console.log('Session loaded:', message.session);
                    // Load session messages
                    if (message.session && message.session.messages) {
                        message.session.messages.forEach(msg => addMessage(msg));
                    }
                    break;
                case 'terminalCommandExecuted':
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: \`Terminal command executed: \${message.command.command}
Output: \${message.command.output}\`,
                        timestamp: Date.now()
                    });
                    break;
                case 'info':
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: message.message,
                        timestamp: Date.now()
                    });
                    break;
                case 'portCheckResult':
                    addMessage({
                        id: Date.now(),
                        role: 'system',
                        content: \`Port \${message.port} is \${message.inUse ? 'in use' : 'available'}\`,
                        timestamp: Date.now()
                    });
                    break;
            }
        });
    </script>
</body>
</html>`;
  }
};

// src/credentials.ts
var vscode4 = __toESM(require("vscode"));
var CredentialManager = class _CredentialManager {
  constructor(context) {
    this.context = context;
  }
  static {
    // Azure credentials keys
    this.AZURE_CREDENTIALS_KEY = "azure.credentials";
  }
  static {
    this.AZURE_API_KEY_SECRET = "azure.apiKey";
  }
  static {
    // NVIDIA credentials key
    this.NVIDIA_CREDENTIALS_KEY = "nvidia.credentials";
  }
  static {
    this.SELECTED_PROVIDER_KEY = "selected.provider";
  }
  static {
    // System prompt key
    this.SYSTEM_PROMPT_KEY = "custom.system.prompt";
  }
  static {
    this.DEFAULT_SYSTEM_PROMPT = `You are an advanced coding assistant with shell command execution capabilities.

## CONTEXT PROVIDED
- File(s) automatically collected from the CURRENT WORKING DIRECTORY
- All relevant source files from the workspace are included
- Only common exclusions apply (node_modules, .git, dist, build, binaries, etc.)
- Current working directory: {workspacePath}

## YOUR CAPABILITIES
1. **Code Analysis**: Read, understand, and modify code from provided context
2. **Shell Commands**: You can execute shell commands by including them in your response using this format:
   \`\`\`shell
   <command here>
   \`\`\`

   Examples of commands you can run:
   - \`ls -la\` - list files
   - \`pwd\` - show current directory
   - \`ps aux | grep node\` - check processes
   - \`curl https://api.example.com\` - make HTTP requests
   - \`npm install <package>\` - install dependencies
   - \`python script.py\` - run scripts
   - \`make build\` - run build commands

3. **File Operations**: Return JSON for code changes:
\`\`\`json
{
  "explanation": "What you did and why",
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "action": "update|create|delete",
      "content": "full file content here"
    }
  ],
  "shell": "optional command to execute"
}
\`\`\`

## IMPORTANT RULES
1. **NEVER hallucinate files** - only work with provided file context
2. **Use EXACT file paths** as provided in the context
3. **For shell commands**: Always explain what the command does before showing it
4. **For code changes**: Always show the complete file content, not snippets
5. **For simple questions**: Just explain, don't generate code
6. **Security**: Consider security implications of any command or code change
7. **Best practices**: Follow language-specific best practices and patterns

## WORKSPACE INFORMATION
- Current workspace: {workspacePath}
- Total files available: {fileCount}
{includeGitDiff}
{includeTerminal}

When the user asks to run tests, build, install packages, check status, or any other terminal operation, USE SHELL COMMANDS!`;
  }
  /**
   * Get selected provider
   */
  async getSelectedProvider() {
    const provider = this.context.globalState.get(
      _CredentialManager.SELECTED_PROVIDER_KEY
    );
    return provider || "azure" /* Azure */;
  }
  /**
   * Set selected provider
   */
  async setSelectedProvider(provider) {
    await this.context.globalState.update(
      _CredentialManager.SELECTED_PROVIDER_KEY,
      provider
    );
    Logger.log(`Provider switched to: ${provider}`);
  }
  /**
   * Get Azure credentials
   */
  async getAzureCredentials() {
    const stored = this.context.globalState.get(
      _CredentialManager.AZURE_CREDENTIALS_KEY
    );
    if (!stored) {
      return null;
    }
    const apiKey = await this.context.secrets.get(
      _CredentialManager.AZURE_API_KEY_SECRET
    );
    if (!apiKey) {
      return null;
    }
    return {
      ...stored,
      apiKey
    };
  }
  /**
   * Get NVIDIA credentials
   */
  async getNvidiaCredentials() {
    const selectedModel = this.context.globalState.get("nvidia.selected.model");
    if (!selectedModel) {
      return null;
    }
    const allNvidia = this.context.globalState.get(
      _CredentialManager.NVIDIA_CREDENTIALS_KEY
    );
    if (!allNvidia) {
      return null;
    }
    return allNvidia.find((m) => m.providerName === selectedModel) || allNvidia[0] || null;
  }
  /**
   * Get all NVIDIA credentials
   */
  async getAllNvidiaCredentials() {
    return this.context.globalState.get(
      _CredentialManager.NVIDIA_CREDENTIALS_KEY
    ) || [];
  }
  /**
   * Get stored credentials based on selected provider
   */
  async getCredentials() {
    const provider = await this.getSelectedProvider();
    if (provider === "azure" /* Azure */) {
      return this.getAzureCredentials();
    } else {
      return this.getNvidiaCredentials();
    }
  }
  /**
   * Configure Azure credentials through user input
   */
  async configureAzureCredentials() {
    Logger.log("Starting Azure credential configuration...");
    const endpoint = await vscode4.window.showInputBox({
      prompt: "Enter your Azure OpenAI Endpoint",
      placeHolder: "https://your-resource.openai.azure.com/",
      ignoreFocusOut: true
    });
    if (!endpoint) {
      throw new Error("Endpoint is required");
    }
    const apiKey = await vscode4.window.showInputBox({
      prompt: "Enter your Azure OpenAI API Key",
      password: true,
      ignoreFocusOut: true
    });
    if (!apiKey) {
      throw new Error("API Key is required");
    }
    const deploymentName = await vscode4.window.showInputBox({
      prompt: "Enter your Deployment Name",
      placeHolder: "e.g., gpt-4",
      ignoreFocusOut: true
    });
    if (!deploymentName) {
      throw new Error("Deployment Name is required");
    }
    const apiVersion = await vscode4.window.showInputBox({
      prompt: "Enter API Version",
      placeHolder: "2024-02-15-preview",
      ignoreFocusOut: true,
      value: "2024-02-15-preview"
    });
    if (!apiVersion) {
      throw new Error("API Version is required");
    }
    const modelName = await vscode4.window.showInputBox({
      prompt: "Enter Model Name",
      placeHolder: "e.g., gpt-4",
      ignoreFocusOut: true,
      value: deploymentName
    });
    if (!modelName) {
      throw new Error("Model Name is required");
    }
    const credentials = {
      endpoint: endpoint.trim(),
      deploymentName: deploymentName.trim(),
      apiVersion: apiVersion.trim(),
      modelName: modelName.trim()
    };
    try {
      await this.context.globalState.update(
        _CredentialManager.AZURE_CREDENTIALS_KEY,
        credentials
      );
      Logger.log("Azure credentials stored in globalState successfully");
    } catch (error) {
      Logger.error("Failed to store Azure credentials in globalState", error);
      throw new Error(`Failed to save credentials: ${error.message}`);
    }
    try {
      await this.context.secrets.store(
        _CredentialManager.AZURE_API_KEY_SECRET,
        apiKey.trim()
      );
      Logger.log("Azure API key stored in secret storage successfully");
    } catch (error) {
      Logger.error("Failed to store API key in secret storage", error);
      throw new Error(`Failed to save API key: ${error.message}`);
    }
    Logger.log("Azure credential configuration completed successfully!");
  }
  /**
   * Configure NVIDIA credentials
   */
  async configureNvidiaCredentials(credentials) {
    try {
      await this.context.globalState.update(
        _CredentialManager.NVIDIA_CREDENTIALS_KEY,
        credentials
      );
      Logger.log("NVIDIA credentials stored successfully", credentials);
      const selectedModel = this.context.globalState.get("nvidia.selected.model");
      if (!selectedModel && credentials.length > 0) {
        await this.context.globalState.update("nvidia.selected.model", credentials[0].providerName);
        Logger.log(`Selected NVIDIA model: ${credentials[0].providerName}`);
      }
    } catch (error) {
      Logger.error("Failed to store NVIDIA credentials", error);
      throw new Error(`Failed to save NVIDIA credentials: ${error.message}`);
    }
  }
  /**
   * Set selected NVIDIA model
   */
  async setSelectedNvidiaModel(modelName) {
    await this.context.globalState.update("nvidia.selected.model", modelName);
    Logger.log(`Selected NVIDIA model: ${modelName}`);
  }
  /**
   * Get selected NVIDIA model name
   */
  async getSelectedNvidiaModel() {
    return this.context.globalState.get("nvidia.selected.model") || null;
  }
  /**
   * Configure credentials through user input (legacy - for Azure)
   */
  async configureCredentials() {
    await this.configureAzureCredentials();
  }
  /**
   * Check if credentials are configured
   */
  async isConfigured() {
    const provider = await this.getSelectedProvider();
    const creds = await this.getCredentials();
    const configured = creds !== null;
    Logger.debug(`Credentials configured status for ${provider}: ${configured}`);
    return configured;
  }
  /**
   * Check if any provider is configured
   */
  async isAnyProviderConfigured() {
    const azureCreds = await this.getAzureCredentials();
    const nvidiaCreds = await this.getAllNvidiaCredentials();
    return azureCreds !== null || nvidiaCreds.length > 0;
  }
  /**
   * Show current credential status
   */
  async showCredentialStatus() {
    const provider = await this.getSelectedProvider();
    const selectedModel = provider === "nvidia" /* NVIDIA */ ? await this.getSelectedNvidiaModel() : null;
    Logger.log("=== Credential Status ===");
    Logger.log(`Provider: ${provider}${selectedModel ? ` (${selectedModel})` : ""}`);
    if (provider === "azure" /* Azure */) {
      const stored = this.context.globalState.get(
        _CredentialManager.AZURE_CREDENTIALS_KEY
      );
      if (stored) {
        const apiKeyExists = await this.context.secrets.get(_CredentialManager.AZURE_API_KEY_SECRET);
        Logger.log(`Endpoint: ${stored.endpoint}`);
        Logger.log(`Deployment: ${stored.deploymentName}`);
        Logger.log(`API Version: ${stored.apiVersion}`);
        Logger.log(`Model: ${stored.modelName}`);
        Logger.log(`API Key: ${apiKeyExists ? "\u2713 Configured" : "\u2717 Missing"}`);
      } else {
        Logger.warn("Azure credentials not configured");
      }
    } else {
      const nvidiaCreds = await this.getAllNvidiaCredentials();
      if (nvidiaCreds.length > 0) {
        Logger.log(`NVIDIA Models Configured: ${nvidiaCreds.length}`);
        nvidiaCreds.forEach((cred) => {
          const isSelected = cred.providerName === selectedModel;
          Logger.log(`  ${isSelected ? "\u2192" : " "} ${cred.providerName}: ${cred.endpoint} (${cred.modelName})`);
        });
      } else {
        Logger.warn("NVIDIA credentials not configured");
      }
    }
    Logger.log("=== Credential Status ===");
    Logger.log(`Provider: ${provider}${selectedModel ? ` (${selectedModel})` : ""}`);
    if (provider === "azure" /* Azure */) {
      const stored = this.context.globalState.get(
        _CredentialManager.AZURE_CREDENTIALS_KEY
      );
      if (stored) {
        const apiKeyExists = await this.context.secrets.get(_CredentialManager.AZURE_API_KEY_SECRET);
        Logger.log(`Endpoint: ${stored.endpoint}`);
        Logger.log(`Deployment: ${stored.deploymentName}`);
        Logger.log(`API Version: ${stored.apiVersion}`);
        Logger.log(`Model: ${stored.modelName}`);
        Logger.log(`API Key: ${apiKeyExists ? "\u2713 Configured" : "\u2717 Missing"}`);
      } else {
        Logger.warn("Azure credentials not configured");
      }
    } else {
      const nvidiaCreds = await this.getAllNvidiaCredentials();
      if (nvidiaCreds.length > 0) {
        Logger.log(`NVIDIA Models Configured: ${nvidiaCreds.length}`);
        nvidiaCreds.forEach((cred) => {
          const isSelected = cred.providerName === selectedModel;
          Logger.log(`  ${isSelected ? "\u2192" : " "} ${cred.providerName}: ${cred.endpoint} (${cred.modelName})`);
        });
      } else {
        Logger.warn("NVIDIA credentials not configured");
      }
    }
    Logger.show();
  }
  /**
   * Get custom system prompt
   */
  async getSystemPrompt() {
    const customPrompt = this.context.globalState.get(
      _CredentialManager.SYSTEM_PROMPT_KEY
    );
    return customPrompt || _CredentialManager.DEFAULT_SYSTEM_PROMPT;
  }
  /**
   * Set custom system prompt
   */
  async setSystemPrompt(prompt) {
    await this.context.globalState.update(
      _CredentialManager.SYSTEM_PROMPT_KEY,
      prompt
    );
    Logger.log("Custom system prompt updated");
  }
  /**
   * Reset system prompt to default
   */
  async resetSystemPrompt() {
    await this.context.globalState.update(
      _CredentialManager.SYSTEM_PROMPT_KEY,
      void 0
    );
    Logger.log("System prompt reset to default");
  }
  /**
   * Get default system prompt
   */
  getDefaultSystemPrompt() {
    return _CredentialManager.DEFAULT_SYSTEM_PROMPT;
  }
};

// src/azureGPT.ts
var vscode5 = __toESM(require("vscode"));
var AzureGPTService = class {
  constructor(credentialManager2) {
    this.credentialManager = credentialManager2;
    this.credentials = null;
  }
  /**
   * Ensure credentials are loaded
   */
  async ensureCredentials() {
    if (!this.credentials) {
      Logger.debug("Loading credentials from storage...");
      this.credentials = await this.credentialManager.getAzureCredentials();
    }
    if (!this.credentials) {
      Logger.error("Credentials not configured");
      throw new Error("Azure credentials not configured. Please configure them first.");
    }
    Logger.debug("Credentials loaded successfully");
  }
  /**
   * Send chat completion request to Azure OpenAI
   */
  async chatCompletion(messages, onProgress, signal) {
    await this.ensureCredentials();
    const { endpoint, apiKey, deploymentName, apiVersion } = this.credentials;
    const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;
    Logger.log(`Sending request to Azure OpenAI: ${deploymentName}`);
    Logger.debug(`Request URL: ${url.replace(apiKey, "***")}`);
    Logger.debug(`Message count: ${messages.length}`);
    try {
      const transformedMessages = messages.map((msg) => {
        if (msg.image) {
          return {
            role: msg.role,
            content: [
              {
                type: "text",
                text: msg.content
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${msg.image.mimeType};base64,${msg.image.data}`
                }
              }
            ]
          };
        }
        return msg;
      });
      const requestBody = {
        messages: transformedMessages,
        stream: !!onProgress
      };
      if (this.credentials.maxTokens !== void 0) {
        requestBody.max_tokens = this.credentials.maxTokens;
      }
      if (this.credentials.temperature !== void 0) {
        requestBody.temperature = this.credentials.temperature;
      }
      Logger.debug(`Request body: ${JSON.stringify({ ...requestBody, messages: `[${requestBody.messages.length} messages]` })}`);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey
        },
        body: JSON.stringify(requestBody),
        signal
      });
      if (!response.ok) {
        const errorText = await response.text();
        Logger.error(`Azure API error: ${response.status}`, errorText);
        throw new Error(`Azure API error: ${response.status} - ${errorText}`);
      }
      if (onProgress && response.body) {
        return this.handleStreamingResponse(response.body, onProgress);
      }
      const data = await response.json();
      Logger.log("Received response from Azure OpenAI");
      return data.choices[0]?.message?.content || "";
    } catch (error) {
      Logger.error("Failed to call Azure OpenAI", error);
      throw new Error(`Failed to call Azure OpenAI: ${error.message}`);
    }
  }
  /**
   * Handle streaming response from Azure OpenAI
   */
  async handleStreamingResponse(body, onProgress) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              onProgress(delta);
            }
          } catch (e) {
          }
        }
      }
    }
    return fullContent;
  }
  /**
   * Parse structured response from GPT
   */
  parseStructuredResponse(content) {
    try {
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        return {
          explanation: parsed.explanation || "",
          files: parsed.files || []
        };
      }
    } catch (e) {
    }
    return {
      explanation: content,
      files: []
    };
  }
  /**
   * Generate system prompt based on context
   */
  async generateSystemPrompt(context) {
    const customPrompt = await this.credentialManager.getSystemPrompt();
    const workspacePath = vscode5.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    let prompt = customPrompt.replace(/\{fileCount\}/g, context.fileCount.toString()).replace(/\{workspacePath\}/g, workspacePath).replace(/\{includeGitDiff\}/g, context.includeGitDiff ? "- Git diff showing recent changes" : "").replace(/\{includeTerminal\}/g, context.includeTerminal ? "- Terminal output" : "");
    return prompt;
  }
};

// src/nvidiaService.ts
var vscode6 = __toESM(require("vscode"));
var NvidiaService = class {
  constructor(credentialManager2) {
    this.credentialManager = credentialManager2;
    this.credentials = null;
  }
  /**
   * Set credentials
   */
  setCredentials(credentials) {
    this.credentials = credentials;
    Logger.log(`NVIDIA credentials set for: ${credentials.providerName}`, {
      endpoint: credentials.endpoint,
      modelName: credentials.modelName
    });
  }
  /**
   * Ensure credentials are loaded
   */
  async ensureCredentials() {
    if (!this.credentials) {
      Logger.debug("Loading NVIDIA credentials from storage...");
      this.credentials = await this.credentialManager.getNvidiaCredentials();
    }
    if (!this.credentials) {
      throw new Error("NVIDIA credentials not configured. Please configure them first.");
    }
    Logger.debug("NVIDIA credentials loaded successfully");
  }
  /**
   * Send chat completion request to NVIDIA API
   */
  async chatCompletion(messages, onProgress, signal) {
    await this.ensureCredentials();
    const { endpoint, modelName } = this.credentials;
    const url = endpoint.endsWith("/chat/completions") ? endpoint : `${endpoint}/chat/completions`;
    Logger.log(`Sending request to NVIDIA API: ${this.credentials.providerName}`);
    Logger.debug(`Request URL: ${url}`);
    Logger.debug(`Model: ${modelName}`);
    Logger.debug(`Message count: ${messages.length}`);
    try {
      const transformedMessages = messages.map((msg) => {
        if (msg.image) {
          return {
            role: msg.role,
            content: [
              {
                type: "text",
                text: msg.content
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${msg.image.mimeType};base64,${msg.image.data}`
                }
              }
            ]
          };
        }
        return msg;
      });
      const requestBody = {
        model: modelName,
        messages: transformedMessages,
        stream: !!onProgress
      };
      if (this.credentials.maxTokens !== void 0) {
        requestBody.max_tokens = this.credentials.maxTokens;
      }
      if (this.credentials.temperature !== void 0) {
        requestBody.temperature = this.credentials.temperature;
      }
      Logger.debug(`Request body: ${JSON.stringify({ ...requestBody, messages: `[${requestBody.messages.length} messages]` })}`);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal
      });
      if (!response.ok) {
        const errorText = await response.text();
        Logger.error(`NVIDIA API error: ${response.status}`, errorText);
        throw new Error(`NVIDIA API error: ${response.status} - ${errorText}`);
      }
      if (onProgress && response.body) {
        return this.handleStreamingResponse(response.body, onProgress);
      }
      const data = await response.json();
      Logger.log("Received response from NVIDIA API");
      return data.choices[0]?.message?.content || "";
    } catch (error) {
      Logger.error("Failed to call NVIDIA API", error);
      throw new Error(`Failed to call NVIDIA API: ${error.message}`);
    }
  }
  /**
   * Handle streaming response from NVIDIA API
   */
  async handleStreamingResponse(body, onProgress) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              onProgress(delta);
            }
          } catch (e) {
          }
        }
      }
    }
    return fullContent;
  }
  /**
   * Generate system prompt for NVIDIA
   */
  async generateSystemPrompt(context) {
    const customPrompt = await this.credentialManager.getSystemPrompt();
    const workspacePath = vscode6.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    let prompt = customPrompt.replace(/\{fileCount\}/g, context.fileCount.toString()).replace(/\{workspacePath\}/g, workspacePath).replace(/\{includeGitDiff\}/g, context.includeGitDiff ? "- Git diff showing recent changes" : "").replace(/\{includeTerminal\}/g, context.includeTerminal ? "- Terminal output" : "");
    return prompt;
  }
  /**
   * Clear credentials
   */
  clearCredentials() {
    this.credentials = null;
    Logger.log("NVIDIA credentials cleared");
  }
};

// src/fileManager.ts
var vscode7 = __toESM(require("vscode"));
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var FileManager = class {
  constructor(exclusionManager2) {
    this.exclusionManager = exclusionManager2;
    this.workspaceRoot = this.getCurrentWorkingDirectory();
    Logger.log(`FileManager initialized with workspace root: ${this.workspaceRoot}`);
  }
  /**
   * Get the current working directory
   */
  getCurrentWorkingDirectory() {
    const workspaceFolders = vscode7.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0].uri.fsPath;
    }
    return process.cwd();
  }
  /**
   * Get workspace root path
   */
  getWorkspaceRoot() {
    return this.workspaceRoot;
  }
  /**
   * Get current file context
   */
  async getCurrentFile() {
    const editor = vscode7.window.activeTextEditor;
    if (!editor) {
      return null;
    }
    const uri = editor.document.uri;
    const content = editor.document.getText();
    const language = editor.document.languageId;
    return {
      path: this.getRelativePath(uri),
      content,
      language
    };
  }
  /**
   * Get selected files context
   */
  async getSelectedFiles(uris) {
    const contexts = [];
    for (const uri of uris) {
      try {
        if (this.exclusionManager && await this.exclusionManager.shouldExcludeFile(uri.fsPath)) {
          console.log(`Excluding file: ${uri.fsPath}`);
          continue;
        }
        const content = await vscode7.workspace.fs.readFile(uri);
        const decoder = new TextDecoder();
        const text = decoder.decode(content);
        const language = this.getLanguageFromPath(uri.fsPath);
        contexts.push({
          path: this.getRelativePath(uri),
          content: text,
          language
        });
      } catch (error) {
        console.error(`Failed to read file: ${uri.fsPath}`, error);
      }
    }
    return contexts;
  }
  /**
   * Get all workspace files automatically
   * This is the main method that collects all relevant files from the workspace
   */
  async getWorkspaceFiles() {
    Logger.log(`=== Collecting workspace files from: ${this.workspaceRoot} ===`);
    const contexts = [];
    try {
      try {
        await fs.promises.access(this.workspaceRoot, fs.constants.R_OK);
        Logger.log(`\u2713 Workspace root is accessible: ${this.workspaceRoot}`);
      } catch (accessError) {
        Logger.error(`\u2717 Workspace root not accessible: ${this.workspaceRoot}`, accessError);
        return contexts;
      }
      Logger.log(`Scanning directory recursively...`);
      const allFiles = await this.getAllFilesRecursive(this.workspaceRoot);
      Logger.log(`Found ${allFiles.length} total files (before filtering)`);
      const excludedPatterns = await this.getExcludedPatterns();
      Logger.log(`Excluded patterns: ${excludedPatterns.join(", ")}`);
      let skippedCount = 0;
      let binaryCount = 0;
      let largeCount = 0;
      let extensionFiltered = 0;
      for (const filePath of allFiles) {
        if (this.shouldExcludeFile(filePath, excludedPatterns)) {
          skippedCount++;
          Logger.debug(`Skipping excluded file: ${filePath}`);
          continue;
        }
        try {
          const stats = await fs.promises.stat(filePath);
          if (stats.isDirectory()) {
            continue;
          }
          if (stats.size > 1024 * 1024) {
            largeCount++;
            Logger.debug(`Skipping large file (${Math.round(stats.size / 1024)}KB): ${filePath}`);
            continue;
          }
          const content = await fs.promises.readFile(filePath, "utf-8");
          if (this.isBinaryContent(content)) {
            binaryCount++;
            Logger.debug(`Skipping binary file: ${filePath}`);
            continue;
          }
          const relativePath = path.relative(this.workspaceRoot, filePath);
          const language = this.getLanguageFromPath(filePath);
          contexts.push({
            path: relativePath,
            content,
            language
          });
        } catch (error) {
          Logger.debug(`Skipping unreadable file: ${filePath} - ${error}`);
        }
      }
      Logger.log(`=== File Collection Summary ===`);
      Logger.log(`Total files found: ${allFiles.length}`);
      Logger.log(`Excluded by pattern: ${skippedCount}`);
      Logger.log(`Binary files: ${binaryCount}`);
      Logger.log(`Large files (>1MB): ${largeCount}`);
      Logger.log(`\u2713 Final usable files: ${contexts.length}`);
      Logger.log(`File list: ${contexts.map((f) => f.path).slice(0, 10).join(", ")}${contexts.length > 10 ? "..." : ""}`);
      return contexts;
    } catch (error) {
      Logger.error("Failed to collect workspace files", error);
      return contexts;
    }
  }
  /**
   * Recursively get all files from a directory
   */
  async getAllFilesRecursive(dir) {
    const files = [];
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "__pycache__") {
            continue;
          }
          const subFiles = await this.getAllFilesRecursive(fullPath);
          files.push(...subFiles);
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
    }
    return files;
  }
  /**
   * Get excluded patterns from ExclusionManager
   */
  async getExcludedPatterns() {
    const patterns = ["node_modules", ".git", "__pycache__", ".venv", "venv", "env"];
    if (this.exclusionManager) {
      const customExcludes = await this.exclusionManager.getExcludedPatterns();
      patterns.push(...customExcludes);
    }
    return patterns;
  }
  /**
   * Check if a file should be excluded
   */
  shouldExcludeFile(filePath, excludedPatterns) {
    const relativePath = path.relative(this.workspaceRoot, filePath);
    for (const pattern of excludedPatterns) {
      if (relativePath.includes(pattern) || filePath.includes(pattern)) {
        return true;
      }
    }
    const excludedExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".ico",
      ".svg",
      ".woff",
      ".woff2",
      ".ttf",
      ".eot",
      ".mp3",
      ".mp4",
      ".avi",
      ".mov",
      ".zip",
      ".tar",
      ".gz",
      ".rar",
      ".7z",
      ".exe",
      ".dll",
      ".so",
      ".dylib",
      ".bin",
      ".pyc",
      ".pyo",
      ".pyd"
    ];
    for (const ext of excludedExtensions) {
      if (filePath.endsWith(ext)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Get git diff
   */
  async getGitDiff() {
    try {
      const diff = await vscode7.env.clipboard.readText();
      return "Git diff not yet implemented";
    } catch (error) {
      return "";
    }
  }
  /**
   * Format files for GPT context
   */
  formatFilesForContext(files) {
    if (files.length === 0) {
      return "No files provided.";
    }
    return files.map(
      (file) => `
--- FILE: ${file.path} (Language: ${file.language}) ---
${file.content}

--- END FILE ---
`
    ).join("\n");
  }
  /**
   * Get relative path from workspace
   */
  getRelativePath(uri) {
    const workspaceFolder = vscode7.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      return path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    }
    return uri.fsPath;
  }
  /**
   * Get language from file path
   */
  getLanguageFromPath(filePath) {
    const ext = path.extname(filePath);
    const languageMap = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".py": "python",
      ".java": "java",
      ".cpp": "cpp",
      ".c": "c",
      ".cs": "csharp",
      ".go": "go",
      ".rs": "rust",
      ".php": "php",
      ".rb": "ruby",
      ".swift": "swift",
      ".kt": "kotlin",
      ".html": "html",
      ".css": "css",
      ".scss": "scss",
      ".sass": "sass",
      ".less": "less",
      ".json": "json",
      ".xml": "xml",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".md": "markdown",
      ".sh": "shellscript",
      ".bash": "shellscript",
      ".zsh": "shellscript",
      ".fish": "fish",
      ".sql": "sql",
      ".dart": "dart",
      ".lua": "lua",
      ".r": "r",
      ".toml": "toml",
      ".ini": "ini",
      ".cfg": "ini"
    };
    return languageMap[ext] || "text";
  }
  /**
   * Check if content is binary
   */
  isBinaryContent(content) {
    if (content.includes("\0")) {
      return true;
    }
    const sample = content.slice(0, 1e3);
    let nonTextChars = 0;
    for (let i = 0; i < sample.length; i++) {
      const code = sample.charCodeAt(i);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13 || code > 126) {
        nonTextChars++;
      }
    }
    return nonTextChars / sample.length > 0.3;
  }
  /**
   * Apply file changes
   */
  async applyFileChanges(changes) {
    const workspaceFolders = vscode7.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error("No workspace folder open");
    }
    for (const change of changes) {
      const filePath = path.join(workspaceFolders[0].uri.fsPath, change.path);
      const uri = vscode7.Uri.file(filePath);
      if (change.action === "delete") {
        await vscode7.workspace.fs.delete(uri);
      } else {
        const encoder = new TextEncoder();
        const content = encoder.encode(change.content);
        await vscode7.workspace.fs.writeFile(uri, content);
      }
    }
  }
};

// src/backupManager.ts
var vscode8 = __toESM(require("vscode"));
var path2 = __toESM(require("path"));
var BackupManager = class {
  constructor(context) {
    this.context = context;
    this.BACKUP_DIR = ".local-azure-gpt-backup";
    this.backups = [];
    this.loadBackups();
  }
  /**
   * Create backup of a file before modification
   */
  async backupFile(filePath) {
    const workspaceFolders = vscode8.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }
    try {
      const fullPath = path2.join(workspaceFolders[0].uri.fsPath, filePath);
      const uri = vscode8.Uri.file(fullPath);
      const content = await vscode8.workspace.fs.readFile(uri);
      const backupDir = path2.join(workspaceFolders[0].uri.fsPath, this.BACKUP_DIR);
      try {
        await vscode8.workspace.fs.createDirectory(vscode8.Uri.file(backupDir));
      } catch (error) {
      }
      const timestamp = Date.now();
      const backupFileName = `${path2.basename(filePath)}.${timestamp}.bak`;
      const backupPath = path2.join(backupDir, backupFileName);
      const backupUri = vscode8.Uri.file(backupPath);
      await vscode8.workspace.fs.writeFile(backupUri, content);
      this.backups.push({
        originalPath: filePath,
        backupPath,
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
  async backupFiles(filePaths) {
    for (const filePath of filePaths) {
      await this.backupFile(filePath);
    }
  }
  /**
   * Rollback last backup
   */
  async rollback() {
    if (this.backups.length === 0) {
      vscode8.window.showInformationMessage("No backups to rollback");
      return;
    }
    const lastBackup = this.backups[this.backups.length - 1];
    const confirmed = await vscode8.window.showWarningMessage(
      `Rollback changes to ${lastBackup.originalPath}?`,
      "Yes",
      "No"
    );
    if (confirmed !== "Yes") {
      return;
    }
    try {
      const workspaceFolders = vscode8.workspace.workspaceFolders;
      if (!workspaceFolders) {
        throw new Error("No workspace folder open");
      }
      const backupUri = vscode8.Uri.file(lastBackup.backupPath);
      const backupContent = await vscode8.workspace.fs.readFile(backupUri);
      const originalUri = vscode8.Uri.file(
        path2.join(workspaceFolders[0].uri.fsPath, lastBackup.originalPath)
      );
      await vscode8.workspace.fs.writeFile(originalUri, backupContent);
      vscode8.window.showInformationMessage(
        `Successfully rolled back ${lastBackup.originalPath}`
      );
    } catch (error) {
      vscode8.window.showErrorMessage(
        `Failed to rollback: ${error.message}`
      );
    }
  }
  /**
   * Clear all backups
   */
  async clearBackups() {
    const workspaceFolders = vscode8.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }
    try {
      const backupDir = path2.join(
        workspaceFolders[0].uri.fsPath,
        this.BACKUP_DIR
      );
      const backupUri = vscode8.Uri.file(backupDir);
      await vscode8.workspace.fs.delete(backupUri, { recursive: true });
      this.backups = [];
      await this.saveBackups();
    } catch (error) {
      console.error("Failed to clear backups", error);
    }
  }
  /**
   * Load backups from storage
   */
  loadBackups() {
    this.backups = this.context.globalState.get("azure.gpt.backups") || [];
  }
  /**
   * Save backups to storage
   */
  async saveBackups() {
    await this.context.globalState.update("azure.gpt.backups", this.backups);
  }
};

// src/exclusionManager.ts
var vscode9 = __toESM(require("vscode"));
var path3 = __toESM(require("path"));
var ExclusionManager = class _ExclusionManager {
  constructor(context) {
    this.context = context;
  }
  static {
    this.CONFIG_KEY = "azure.gpt.exclusions";
  }
  static {
    this.DEFAULT_CONFIG = {
      excludePatterns: [
        "**/*.secret",
        "**/*.key",
        "**/*.pem",
        "**/.env*",
        "**/credentials.json",
        "**/secrets.*",
        "**/*password*",
        "**/*.min.js",
        "**/*.min.css",
        "**/package-lock.json",
        "**/yarn.lock",
        "**/pnpm-lock.yaml"
      ],
      excludeDirectories: [
        "node_modules",
        ".git",
        "dist",
        "build",
        "out",
        "target",
        "bin",
        "obj",
        ".next",
        ".nuxt",
        "coverage",
        ".vscode-test",
        "__pycache__",
        "venv",
        ".venv",
        "env"
      ],
      excludeFiles: []
    };
  }
  /**
   * Get exclusion configuration
   */
  async getExclusions() {
    const stored = this.context.workspaceState.get(
      _ExclusionManager.CONFIG_KEY
    );
    return stored || { ..._ExclusionManager.DEFAULT_CONFIG };
  }
  /**
   * Save exclusion configuration
   */
  async saveExclusions(config) {
    await this.context.workspaceState.update(
      _ExclusionManager.CONFIG_KEY,
      config
    );
  }
  /**
   * Reset to defaults
   */
  async resetToDefaults() {
    await this.context.workspaceState.update(
      _ExclusionManager.CONFIG_KEY,
      void 0
    );
  }
  /**
   * Check if a file should be excluded
   */
  async shouldExcludeFile(filePath) {
    const config = await this.getExclusions();
    const relativePath = this.getRelativePath(filePath);
    if (config.excludeFiles.some((excl) => relativePath.includes(excl) || excl.includes(relativePath))) {
      return true;
    }
    const pathParts = relativePath.split(path3.sep);
    for (const part of pathParts) {
      if (config.excludeDirectories.includes(part)) {
        return true;
      }
    }
    for (const pattern of config.excludePatterns) {
      if (this.matchesPattern(relativePath, pattern)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Check if a directory should be excluded
   */
  async shouldExcludeDirectory(dirName) {
    const config = await this.getExclusions();
    return config.excludeDirectories.includes(dirName);
  }
  /**
   * Filter out excluded files from a list
   */
  async filterExcludedFiles(files) {
    const filtered = [];
    for (const file of files) {
      if (!await this.shouldExcludeFile(file.fsPath)) {
        filtered.push(file);
      }
    }
    return filtered;
  }
  /**
   * Build exclude pattern for vscode.workspace.findFiles
   */
  async buildExcludePattern() {
    const config = await this.getExclusions();
    const patterns = [];
    for (const dir of config.excludeDirectories) {
      patterns.push(`**/${dir}/**`);
    }
    patterns.push(...config.excludePatterns);
    return patterns.join("|");
  }
  /**
   * Simple glob pattern matching
   */
  matchesPattern(filePath, pattern) {
    let regexPattern = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".");
    regexPattern = `^${regexPattern}$`;
    const regex = new RegExp(regexPattern, "i");
    return regex.test(filePath);
  }
  /**
   * Get relative path from workspace
   */
  getRelativePath(filePath) {
    const workspaceFolder = vscode9.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return path3.relative(workspaceFolder.uri.fsPath, filePath);
    }
    return filePath;
  }
  /**
   * Add exclusion pattern
   */
  async addExclusion(type, value) {
    const config = await this.getExclusions();
    switch (type) {
      case "pattern":
        if (!config.excludePatterns.includes(value)) {
          config.excludePatterns.push(value);
        }
        break;
      case "directory":
        if (!config.excludeDirectories.includes(value)) {
          config.excludeDirectories.push(value);
        }
        break;
      case "file":
        if (!config.excludeFiles.includes(value)) {
          config.excludeFiles.push(value);
        }
        break;
    }
    await this.saveExclusions(config);
  }
  /**
   * Remove exclusion
   */
  async removeExclusion(type, value) {
    const config = await this.getExclusions();
    switch (type) {
      case "pattern":
        config.excludePatterns = config.excludePatterns.filter((p) => p !== value);
        break;
      case "directory":
        config.excludeDirectories = config.excludeDirectories.filter((d) => d !== value);
        break;
      case "file":
        config.excludeFiles = config.excludeFiles.filter((f) => f !== value);
        break;
    }
    await this.saveExclusions(config);
  }
  /**
   * Show exclusion configuration UI
   */
  async showConfigurationUI() {
    const config = await this.getExclusions();
    const action = await vscode9.window.showQuickPick(
      [
        {
          label: "$(plus) Add Pattern",
          description: 'Add glob pattern (e.g., "**/*.secret")',
          value: "add-pattern"
        },
        {
          label: "$(plus) Add Directory",
          description: 'Add directory to exclude (e.g., "node_modules")',
          value: "add-directory"
        },
        {
          label: "$(plus) Add File",
          description: "Add specific file to exclude",
          value: "add-file"
        },
        {
          label: "$(remove) Remove Pattern",
          description: `Remove pattern (${config.excludePatterns.length} configured)`,
          value: "remove-pattern"
        },
        {
          label: "$(remove) Remove Directory",
          description: `Remove directory (${config.excludeDirectories.length} configured)`,
          value: "remove-directory"
        },
        {
          label: "$(remove) Remove File",
          description: `Remove file (${config.excludeFiles.length} configured)`,
          value: "remove-file"
        },
        {
          label: "$(refresh) Reset to Defaults",
          description: "Reset all exclusions to default values",
          value: "reset"
        },
        {
          label: "$(list) View All Exclusions",
          description: "Show all configured exclusions",
          value: "view"
        }
      ],
      {
        placeHolder: "Manage exclusion rules"
      }
    );
    if (!action) {
      return;
    }
    switch (action.value) {
      case "add-pattern":
        const pattern = await vscode9.window.showInputBox({
          placeHolder: "**/*.secret",
          prompt: "Enter glob pattern to exclude (supports * and **)"
        });
        if (pattern) {
          await this.addExclusion("pattern", pattern);
          vscode9.window.showInformationMessage(`Pattern "${pattern}" added`);
        }
        break;
      case "add-directory":
        const directory = await vscode9.window.showInputBox({
          placeHolder: "node_modules",
          prompt: "Enter directory name to exclude"
        });
        if (directory) {
          await this.addExclusion("directory", directory);
          vscode9.window.showInformationMessage(`Directory "${directory}" added`);
        }
        break;
      case "add-file":
        const file = await vscode9.window.showInputBox({
          placeHolder: "config/keys.json",
          prompt: "Enter file path to exclude (relative to workspace)"
        });
        if (file) {
          await this.addExclusion("file", file);
          vscode9.window.showInformationMessage(`File "${file}" added`);
        }
        break;
      case "remove-pattern":
        const patternToRemove = await vscode9.window.showQuickPick(
          config.excludePatterns.map((p) => ({ label: p, value: p })),
          { placeHolder: "Select pattern to remove" }
        );
        if (patternToRemove) {
          await this.removeExclusion("pattern", patternToRemove.value);
          vscode9.window.showInformationMessage(`Pattern "${patternToRemove.value}" removed`);
        }
        break;
      case "remove-directory":
        const dirToRemove = await vscode9.window.showQuickPick(
          config.excludeDirectories.map((d) => ({ label: d, value: d })),
          { placeHolder: "Select directory to remove" }
        );
        if (dirToRemove) {
          await this.removeExclusion("directory", dirToRemove.value);
          vscode9.window.showInformationMessage(`Directory "${dirToRemove.value}" removed`);
        }
        break;
      case "remove-file":
        const fileToRemove = await vscode9.window.showQuickPick(
          config.excludeFiles.map((f) => ({ label: f, value: f })),
          { placeHolder: "Select file to remove" }
        );
        if (fileToRemove) {
          await this.removeExclusion("file", fileToRemove.value);
          vscode9.window.showInformationMessage(`File "${fileToRemove.value}" removed`);
        }
        break;
      case "reset":
        const confirmed = await vscode9.window.showWarningMessage(
          "Reset all exclusions to defaults?",
          "Yes",
          "No"
        );
        if (confirmed === "Yes") {
          await this.resetToDefaults();
          vscode9.window.showInformationMessage("Exclusions reset to defaults");
        }
        break;
      case "view":
        await this.showAllExclusions(config);
        break;
    }
  }
  /**
   * Show all exclusions in a new document
   */
  async showAllExclusions(config) {
    const content = `
# Azure GPT Exclusions Configuration

## Glob Patterns (${config.excludePatterns.length})
${config.excludePatterns.map((p) => `- ${p}`).join("\n")}

## Directories (${config.excludeDirectories.length})
${config.excludeDirectories.map((d) => `- ${d}`).join("\n")}

## Files (${config.excludeFiles.length})
${config.excludeFiles.map((f) => `- ${f}`).join("\n")}

---

These files and directories will be excluded from context sent to Azure GPT.
Configure via command palette: "Azure GPT: Configure Exclusions"
        `.trim();
    const doc = await vscode9.workspace.openTextDocument({
      content,
      language: "markdown"
    });
    await vscode9.window.showTextDocument(doc);
  }
};

// src/chatHistory.ts
var ChatHistoryManager = class _ChatHistoryManager {
  constructor(context) {
    this.context = context;
  }
  static {
    this.SESSIONS_KEY = "chat.sessions";
  }
  static {
    this.ACTIVE_SESSION_KEY = "chat.activeSession";
  }
  static {
    this.MAX_SESSIONS = 50;
  }
  /**
   * Get all chat sessions
   */
  async getAllSessions() {
    const sessions = this.context.globalState.get(
      _ChatHistoryManager.SESSIONS_KEY,
      []
    );
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  /**
   * Get active session ID
   */
  async getActiveSessionId() {
    return this.context.globalState.get(_ChatHistoryManager.ACTIVE_SESSION_KEY) || null;
  }
  /**
   * Set active session
   */
  async setActiveSession(sessionId) {
    await this.context.globalState.update(_ChatHistoryManager.ACTIVE_SESSION_KEY, sessionId);
    Logger.log(`Active session set to: ${sessionId}`);
  }
  /**
   * Get a session by ID
   */
  async getSession(sessionId) {
    const sessions = await this.getAllSessions();
    return sessions.find((s) => s.id === sessionId) || null;
  }
  /**
   * Get active session
   */
  async getActiveSession() {
    const activeId = await this.getActiveSessionId();
    if (activeId) {
      return this.getSession(activeId);
    }
    return null;
  }
  /**
   * Create a new session
   */
  async createSession() {
    const sessions = await this.getAllSessions();
    const newSession = {
      id: this.generateId(),
      title: "New Chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    sessions.unshift(newSession);
    if (sessions.length > _ChatHistoryManager.MAX_SESSIONS) {
      sessions.splice(_ChatHistoryManager.MAX_SESSIONS);
    }
    await this.context.globalState.update(_ChatHistoryManager.SESSIONS_KEY, sessions);
    await this.setActiveSession(newSession.id);
    Logger.log(`Created new session: ${newSession.id}`);
    return newSession;
  }
  /**
   * Add message to active session
   */
  async addMessage(message) {
    const activeId = await this.getActiveSessionId();
    if (!activeId) {
      await this.createSession();
      return this.addMessage(message);
    }
    const sessions = await this.getAllSessions();
    const sessionIndex = sessions.findIndex((s) => s.id === activeId);
    if (sessionIndex === -1) {
      Logger.warn(`Active session ${activeId} not found, creating new session`);
      return this.addMessage(message);
    }
    const session = sessions[sessionIndex];
    session.messages.push(message);
    session.updatedAt = Date.now();
    if (session.messages.filter((m) => m.role === "user").length === 1 && message.role === "user") {
      session.title = this.generateTitle(message.content);
    }
    sessions.splice(sessionIndex, 1);
    sessions.unshift(session);
    await this.context.globalState.update(_ChatHistoryManager.SESSIONS_KEY, sessions);
    Logger.debug(`Added message to session ${activeId}`);
  }
  /**
   * Update session messages
   */
  async updateSession(sessionId, messages) {
    const sessions = await this.getAllSessions();
    const sessionIndex = sessions.findIndex((s) => s.id === sessionId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].messages = messages;
      sessions[sessionIndex].updatedAt = Date.now();
      const session = sessions.splice(sessionIndex, 1)[0];
      sessions.unshift(session);
      await this.context.globalState.update(_ChatHistoryManager.SESSIONS_KEY, sessions);
    }
  }
  /**
   * Delete a session
   */
  async deleteSession(sessionId) {
    const sessions = await this.getAllSessions();
    const filtered = sessions.filter((s) => s.id !== sessionId);
    await this.context.globalState.update(_ChatHistoryManager.SESSIONS_KEY, filtered);
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
  async clearAllSessions() {
    await this.context.globalState.update(_ChatHistoryManager.SESSIONS_KEY, []);
    await this.createSession();
    Logger.log("All chat sessions cleared");
  }
  /**
   * Generate a short title from message content
   */
  generateTitle(content) {
    const maxLength = 40;
    const cleaned = content.replace(/```[\s\S]*?```/g, "[code]").replace(/\s+/g, " ").trim();
    return cleaned.length > maxLength ? cleaned.substring(0, maxLength) + "..." : cleaned;
  }
  /**
   * Update session title
   */
  async updateSessionTitle(sessionId, title) {
    const sessions = await this.getAllSessions();
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      session.title = title;
      session.updatedAt = Date.now();
      await this.context.globalState.update(_ChatHistoryManager.SESSIONS_KEY, sessions);
      Logger.log(`Updated session title: ${sessionId} -> ${title}`);
    }
  }
  generateId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
};

// src/terminalManager.ts
var vscode10 = __toESM(require("vscode"));
var import_child_process2 = require("child_process");
var import_util2 = require("util");
var execAsync2 = (0, import_util2.promisify)(import_child_process2.exec);
var TerminalManager = class {
  constructor() {
    this.terminals = /* @__PURE__ */ new Map();
    this.runningProcesses = /* @__PURE__ */ new Map();
  }
  /**
   * Execute a command in the terminal
   */
  async executeCommand(command, cwd) {
    const commandId = `cmd-${Date.now()}`;
    const workspaceFolder = vscode10.workspace.workspaceFolders?.[0];
    const terminal = vscode10.window.createTerminal({
      name: "AI Assistant Terminal",
      cwd: cwd || workspaceFolder?.uri.fsPath
    });
    this.terminals.set(commandId, terminal);
    const cmd = {
      id: commandId,
      command,
      status: "running"
    };
    this.runningProcesses.set(commandId, cmd);
    terminal.sendText(command);
    return cmd;
  }
  /**
   * Execute a command and get output
   */
  async executeCommandSync(command, cwd) {
    const workspaceFolder = vscode10.workspace.workspaceFolders?.[0];
    const workingDir = cwd || workspaceFolder?.uri.fsPath;
    try {
      return await execAsync2(command, { cwd: workingDir });
    } catch (error) {
      return {
        stdout: error.stdout || "",
        stderr: error.stderr || error.message || "Unknown error"
      };
    }
  }
  /**
   * Execute a curl request
   */
  async executeCurl(curlCommand) {
    const trimmed = curlCommand.trim();
    if (!trimmed.startsWith("curl")) {
      throw new Error("Only curl commands are supported");
    }
    return this.executeCommandSync(trimmed);
  }
  /**
   * Kill a running process
   */
  async killProcess(commandId) {
    const terminal = this.terminals.get(commandId);
    if (terminal) {
      terminal.dispose();
      this.terminals.delete(commandId);
      const cmd = this.runningProcesses.get(commandId);
      if (cmd) {
        cmd.status = "completed";
        this.runningProcesses.delete(commandId);
        return true;
      }
    }
    return false;
  }
  /**
   * Kill a process by port
   */
  async killProcessOnPort(port) {
    const platform = process.platform;
    let killCommand;
    if (platform === "darwin" || platform === "linux") {
      killCommand = `lsof -ti:${port} | xargs kill -9`;
    } else if (platform === "win32") {
      killCommand = `netstat -ano | findstr :${port} | for /f "tokens=5" %a in ('more') do taskkill /F /PID %a`;
    } else {
      throw new Error("Unsupported platform");
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
  async killProcessByName(name) {
    const platform = process.platform;
    let killCommand;
    if (platform === "darwin" || platform === "linux") {
      killCommand = `pkill -f "${name}"`;
    } else if (platform === "win32") {
      killCommand = `taskkill /F /IM "${name}.exe"`;
    } else {
      throw new Error("Unsupported platform");
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
  async getRunningProcesses() {
    const platform = process.platform;
    let command;
    if (platform === "darwin" || platform === "linux") {
      command = "ps aux";
    } else if (platform === "win32") {
      command = "tasklist";
    } else {
      return [];
    }
    try {
      const { stdout } = await this.executeCommandSync(command);
      return stdout.split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }
  /**
   * Check if a port is in use
   */
  async isPortInUse(port) {
    const platform = process.platform;
    let command;
    if (platform === "darwin" || platform === "linux") {
      command = `lsof -i:${port} | grep LISTEN`;
    } else if (platform === "win32") {
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
  sendToTerminal(terminalId, text) {
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
  createTerminal(name) {
    const terminal = vscode10.window.createTerminal({
      name: name || "AI Assistant Terminal"
    });
    const terminalId = `term-${Date.now()}`;
    this.terminals.set(terminalId, terminal);
    return terminal;
  }
  /**
   * Dispose all terminals
   */
  disposeAll() {
    for (const [id, terminal] of this.terminals) {
      terminal.dispose();
    }
    this.terminals.clear();
    this.runningProcesses.clear();
  }
  /**
   * Parse curl command from text
   */
  parseCurlCommand(text) {
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
  async extractAndExecuteCurlCommands(response) {
    const curlCommands = this.parseCurlCommands(response);
    const results = [];
    for (const cmd of curlCommands) {
      try {
        const { stdout, stderr } = await this.executeCurl(cmd);
        results.push({
          command: cmd,
          result: stdout || stderr
        });
      } catch (error) {
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
  parseCurlCommands(text) {
    const commands4 = [];
    const lines = text.split("\n");
    let currentCommand = "";
    let inCurlCommand = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith("curl")) {
        inCurlCommand = true;
        currentCommand = trimmed;
      } else if (inCurlCommand) {
        currentCommand += " " + trimmed;
        if (!trimmed.endsWith("\\") && !trimmed.endsWith("'") && !trimmed.endsWith('"')) {
          inCurlCommand = false;
          commands4.push(currentCommand.trim());
          currentCommand = "";
        }
      }
    }
    const singleLineRegex = /curl\s+[^\n]+/gi;
    const singleLineMatches = text.match(singleLineRegex);
    if (singleLineMatches) {
      commands4.push(...singleLineMatches.map((m) => m.trim()));
    }
    return commands4;
  }
};

// src/credentialsView.ts
var vscode11 = __toESM(require("vscode"));
var CredentialsViewProvider = class {
  constructor(extensionUri, credentialManager2) {
    this.extensionUri = extensionUri;
    this.credentialManager = credentialManager2;
  }
  resolveWebviewView(webviewView, context, _token) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "loadState":
          await this.loadState();
          break;
        case "getWorkspaceInfo":
          await this.sendWorkspaceInfo();
          break;
        case "switchProvider":
          await this.switchProvider(data.provider);
          break;
        case "saveAzureCredentials":
          await this.saveAzureCredentials(data.credentials);
          break;
        case "saveNvidiaCredentials":
          await this.saveNvidiaCredentials(data.credentials);
          break;
        case "selectNvidiaModel":
          await this.selectNvidiaModel(data.modelName);
          break;
        case "deleteNvidiaModel":
          await this.deleteNvidiaModel(data.modelName);
          break;
        case "openLogs":
          Logger.show();
          break;
        case "loadSystemPrompt":
          await this.loadSystemPrompt();
          break;
        case "saveSystemPrompt":
          await this.saveSystemPrompt(data.prompt);
          break;
        case "resetSystemPrompt":
          await this.resetSystemPrompt();
          break;
      }
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.loadState();
      }
    });
  }
  /**
   * Send workspace information to webview
   */
  async sendWorkspaceInfo() {
    const workspaceFolders = vscode11.workspace.workspaceFolders;
    const workspacePath = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : process.cwd();
    this.sendMessage({
      type: "workspaceInfo",
      workspacePath
    });
  }
  /**
   * Load and send current state to webview
   */
  async loadState() {
    const provider = await this.credentialManager.getSelectedProvider();
    const azureCreds = await this.credentialManager.getAzureCredentials();
    const nvidiaCreds = await this.credentialManager.getAllNvidiaCredentials();
    const selectedNvidiaModel = await this.credentialManager.getSelectedNvidiaModel();
    this.sendMessage({
      type: "stateLoaded",
      state: {
        provider,
        azure: azureCreds ? {
          ...azureCreds,
          apiKey: azureCreds.apiKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : ""
        } : null,
        nvidia: nvidiaCreds,
        selectedNvidiaModel
      }
    });
    await this.loadSystemPrompt();
  }
  /**
   * Switch provider
   */
  async switchProvider(provider) {
    await this.credentialManager.setSelectedProvider(provider);
    Logger.log(`Provider switched to: ${provider}`);
    vscode11.window.showInformationMessage(`Switched to ${provider === "azure" /* Azure */ ? "Azure OpenAI" : "NVIDIA"} provider`);
    await this.loadState();
  }
  /**
   * Save Azure credentials
   */
  async saveAzureCredentials(creds) {
    try {
      Logger.log("Saving Azure credentials from webview...");
      const existing = await this.credentialManager.getAzureCredentials();
      let apiKeyToSave = creds.apiKey;
      if (creds.apiKey === "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" || !creds.apiKey) {
        if (existing) {
          apiKeyToSave = existing.apiKey;
        } else {
          throw new Error("API Key is required");
        }
      }
      await this.manualStoreAzureCredentials({
        endpoint: creds.endpoint,
        apiKey: apiKeyToSave,
        deploymentName: creds.deploymentName,
        apiVersion: creds.apiVersion,
        modelName: creds.modelName,
        maxTokens: creds.maxTokens,
        temperature: creds.temperature
      });
      this.sendMessage({
        type: "credentialsSaved",
        success: true,
        provider: "azure"
      });
      vscode11.window.showInformationMessage("Azure credentials saved successfully!");
      await this.loadState();
    } catch (error) {
      Logger.error("Failed to save Azure credentials", error);
      this.sendMessage({
        type: "credentialsSaved",
        success: false,
        error: error.message,
        provider: "azure"
      });
      vscode11.window.showErrorMessage(`Failed to save credentials: ${error.message}`);
    }
  }
  /**
   * Save NVIDIA credentials
   */
  async saveNvidiaCredentials(data) {
    try {
      Logger.log("Saving NVIDIA credentials from webview...");
      const existing = await this.credentialManager.getAllNvidiaCredentials();
      let updated;
      if (data.isEdit && data.editIndex >= 0) {
        updated = [...existing];
        updated[data.editIndex] = {
          endpoint: data.endpoint,
          modelName: data.modelName,
          providerName: data.providerName,
          maxTokens: data.maxTokens,
          temperature: data.temperature
        };
      } else {
        updated = [...existing, {
          endpoint: data.endpoint,
          modelName: data.modelName,
          providerName: data.providerName,
          maxTokens: data.maxTokens,
          temperature: data.temperature
        }];
      }
      await this.credentialManager.configureNvidiaCredentials(updated);
      this.sendMessage({
        type: "credentialsSaved",
        success: true,
        provider: "nvidia"
      });
      vscode11.window.showInformationMessage("NVIDIA credentials saved successfully!");
      await this.loadState();
    } catch (error) {
      Logger.error("Failed to save NVIDIA credentials", error);
      this.sendMessage({
        type: "credentialsSaved",
        success: false,
        error: error.message,
        provider: "nvidia"
      });
      vscode11.window.showErrorMessage(`Failed to save credentials: ${error.message}`);
    }
  }
  /**
   * Select NVIDIA model
   */
  async selectNvidiaModel(modelName) {
    await this.credentialManager.setSelectedNvidiaModel(modelName);
    Logger.log(`Selected NVIDIA model: ${modelName}`);
    vscode11.window.showInformationMessage(`Selected NVIDIA model: ${modelName}`);
    await this.loadState();
  }
  /**
   * Delete NVIDIA model
   */
  async deleteNvidiaModel(modelName) {
    const confirmed = await vscode11.window.showWarningMessage(
      `Delete NVIDIA model "${modelName}"?`,
      "Yes",
      "No"
    );
    if (confirmed === "Yes") {
      const existing = await this.credentialManager.getAllNvidiaCredentials();
      const updated = existing.filter((m) => m.providerName !== modelName);
      await this.credentialManager.configureNvidiaCredentials(updated);
      Logger.log(`Deleted NVIDIA model: ${modelName}`);
      vscode11.window.showInformationMessage(`Deleted NVIDIA model: ${modelName}`);
      await this.loadState();
    }
  }
  /**
   * Manually store Azure credentials
   */
  async manualStoreAzureCredentials(creds) {
    const context = this.credentialManager.context;
    await context.globalState.update("azure.credentials", {
      endpoint: creds.endpoint.trim(),
      deploymentName: creds.deploymentName.trim(),
      apiVersion: creds.apiVersion.trim(),
      modelName: creds.modelName.trim()
    });
    await context.secrets.store("azure.apiKey", creds.apiKey.trim());
    Logger.log("Azure credentials stored from webview successfully");
  }
  /**
   * Load system prompt
   */
  async loadSystemPrompt() {
    const prompt = await this.credentialManager.getSystemPrompt();
    this.sendMessage({
      type: "systemPromptLoaded",
      prompt
    });
  }
  /**
   * Save system prompt
   */
  async saveSystemPrompt(prompt) {
    try {
      await this.credentialManager.setSystemPrompt(prompt);
      vscode11.window.showInformationMessage("System prompt saved successfully!");
      this.sendMessage({
        type: "systemPromptSaved",
        success: true
      });
    } catch (error) {
      Logger.error("Failed to save system prompt", error);
      this.sendMessage({
        type: "systemPromptSaved",
        success: false,
        error: error.message
      });
      vscode11.window.showErrorMessage(`Failed to save system prompt: ${error.message}`);
    }
  }
  /**
   * Reset system prompt to default
   */
  async resetSystemPrompt() {
    try {
      await this.credentialManager.resetSystemPrompt();
      vscode11.window.showInformationMessage("System prompt reset to default!");
      await this.loadSystemPrompt();
    } catch (error) {
      Logger.error("Failed to reset system prompt", error);
      vscode11.window.showErrorMessage(`Failed to reset system prompt: ${error.message}`);
    }
  }
  /**
   * Send message to webview
   */
  sendMessage(message) {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }
  /**
   * Get HTML for webview
   */
  getHtmlForWebview(webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Provider Credentials</title>
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

        .provider-switch {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
            background: var(--vscode-editor-background);
            padding: 4px;
            border-radius: 8px;
        }

        .provider-button {
            flex: 1;
            padding: 8px;
            background: transparent;
            color: var(--vscode-foreground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
        }

        .provider-button:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .provider-button.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .status {
            padding: 8px 12px;
            border-radius: 4px;
            margin-bottom: 16px;
            font-size: 13px;
        }

        .status.configured {
            background-color: var(--vscode-testing-iconPassed);
            color: #000;
        }

        .status.not-configured {
            background-color: var(--vscode-errorBackground);
            color: var(--vscode-errorForeground);
        }

        .form-group {
            margin-bottom: 16px;
        }

        label {
            display: block;
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 6px;
            color: var(--vscode-foreground);
        }

        input {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            box-sizing: border-box;
        }

        input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .input-hint {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }

        .button-group {
            display: flex;
            gap: 8px;
            margin-top: 20px;
        }

        button {
            flex: 1;
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .nvidia-models-list {
            margin-bottom: 16px;
        }

        .nvidia-model-item {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 8px;
        }

        .nvidia-model-item.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-button-secondaryBackground);
        }

        .nvidia-model-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .nvidia-model-name {
            font-weight: 600;
            font-size: 13px;
        }

        .nvidia-model-actions {
            display: flex;
            gap: 4px;
        }

        .nvidia-model-actions button {
            padding: 4px 8px;
            font-size: 11px;
        }

        .nvidia-model-details {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .hidden {
            display: none !important;
        }

        .loading {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
        }

        .workspace-info {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 16px;
        }

        .workspace-info-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }

        .workspace-info-path {
            font-size: 12px;
            color: var(--vscode-foreground);
            word-break: break-all;
            font-family: var(--vscode-editor-font-family);
        }
    </style>
</head>
<body>
    <h2>AI Provider Credentials</h2>

    <div class="workspace-info">
        <div class="workspace-info-label">WORKSPACE DIRECTORY</div>
        <div class="workspace-info-path" id="workspacePath">Loading...</div>
    </div>

    <div class="provider-switch">
        <button id="azureProviderBtn" class="provider-button">Azure OpenAI</button>
        <button id="nvidiaProviderBtn" class="provider-button">NVIDIA (Local)</button>
    </div>

    <div id="status" class="status not-configured">
        Checking status...
    </div>

    <!-- Azure Credentials Form -->
    <div id="azureForm" class="hidden">
        <div class="form-group">
            <label for="azureEndpoint">Endpoint URL</label>
            <input type="text" id="azureEndpoint" placeholder="https://your-resource.openai.azure.com/">
            <div class="input-hint">Your Azure OpenAI resource endpoint</div>
        </div>

        <div class="form-group">
            <label for="azureApiKey">API Key</label>
            <input type="password" id="azureApiKey" placeholder="Enter API key">
            <div class="input-hint">Leave unchanged to keep existing key</div>
        </div>

        <div class="form-group">
            <label for="azureDeploymentName">Deployment Name</label>
            <input type="text" id="azureDeploymentName" placeholder="e.g., gpt-4">
            <div class="input-hint">The name of your model deployment</div>
        </div>

        <div class="form-group">
            <label for="azureApiVersion">API Version</label>
            <input type="text" id="azureApiVersion" placeholder="2024-02-15-preview" value="2024-02-15-preview">
            <div class="input-hint">Azure OpenAI API version</div>
        </div>

        <div class="form-group">
            <label for="azureModelName">Model Name</label>
            <input type="text" id="azureModelName" placeholder="e.g., gpt-4">
            <div class="input-hint">The underlying model name</div>
        </div>

        <div class="form-group">
            <label for="azureMaxTokens">Max Tokens (Optional)</label>
            <input type="number" id="azureMaxTokens" placeholder="Leave empty for backend default">
            <div class="input-hint">Maximum tokens in response. Leave empty for model default (supports GPT-5.x verbosity)</div>
        </div>

        <div class="form-group">
            <label for="azureTemperature">Temperature (Optional)</label>
            <input type="number" id="azureTemperature" step="0.1" min="0" max="2" placeholder="Leave empty for backend default">
            <div class="input-hint">Response randomness (0.0 - 2.0). Leave empty for model default</div>
        </div>

        <div class="button-group">
            <button id="saveAzureButton">Save Azure Credentials</button>
        </div>
    </div>

    <!-- NVIDIA Credentials Form -->
    <div id="nvidiaForm" class="hidden">
        <div id="nvidiaModelsList" class="nvidia-models-list"></div>

        <div style="border-top: 1px solid var(--vscode-panel-border); padding-top: 16px; margin-top: 16px;">
            <h3 style="font-size: 14px; margin-bottom: 12px;">Add NVIDIA Model</h3>

            <div class="form-group">
                <label for="nvidiaProviderName">Model Name (Label)</label>
                <input type="text" id="nvidiaProviderName" placeholder="e.g., Nemotron, OCR Model">
                <div class="input-hint">A friendly name to identify this model</div>
            </div>

            <div class="form-group">
                <label for="nvidiaEndpoint">Endpoint URL</label>
                <input type="text" id="nvidiaEndpoint" placeholder="http://10.33.11.12:8012/v1">
                <div class="input-hint">The API endpoint (will append /chat/completions if needed)</div>
            </div>

            <div class="form-group">
                <label for="nvidiaModelName">Model Name</label>
                <input type="text" id="nvidiaModelName" placeholder="e.g., nemotron-3-nano-30b">
                <div class="input-hint">The model identifier</div>
            </div>

            <div class="form-group">
                <label for="nvidiaMaxTokens">Max Tokens (Optional)</label>
                <input type="number" id="nvidiaMaxTokens" placeholder="Leave empty for backend default">
                <div class="input-hint">Maximum tokens in response. Leave empty for model default</div>
            </div>

            <div class="form-group">
                <label for="nvidiaTemperature">Temperature (Optional)</label>
                <input type="number" id="nvidiaTemperature" step="0.1" min="0" max="2" placeholder="Leave empty for backend default">
                <div class="input-hint">Response randomness (0.0 - 2.0). Leave empty for model default</div>
            </div>

            <div class="button-group">
                <button id="addNvidiaButton">Add NVIDIA Model</button>
            </div>
        </div>
    </div>

    <div style="border-top: 1px solid var(--vscode-panel-border); padding-top: 16px; margin-top: 16px;">
        <h3 style="font-size: 14px; margin-bottom: 12px;">System Prompt Editor</h3>
        <p style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 12px;">Customize the system prompt used for AI interactions. Use placeholders: {fileCount}, {includeGitDiff}, {includeTerminal}</p>

        <textarea id="systemPromptEditor" style="
            width: 100%;
            min-height: 200px;
            max-height: 400px;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            resize: vertical;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            white-space: pre;
            overflow-x: auto;
        "></textarea>

        <div class="button-group" style="margin-top: 12px;">
            <button id="saveSystemPrompt">Save System Prompt</button>
            <button id="resetSystemPrompt" class="secondary">Reset to Default</button>
        </div>
    </div>

    <div class="button-group">
        <button id="logsButton" class="secondary">View Logs</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentState = {
            provider: 'azure',
            azure: null,
            nvidia: [],
            selectedNvidiaModel: null
        };

        // Provider switching
        document.getElementById('azureProviderBtn').addEventListener('click', () => {
            switchProvider('azure');
        });

        document.getElementById('nvidiaProviderBtn').addEventListener('click', () => {
            switchProvider('nvidia');
        });

        function switchProvider(provider) {
            vscode.postMessage({ type: 'switchProvider', provider });
        }

        // Save Azure credentials
        document.getElementById('saveAzureButton').addEventListener('click', () => {
            const credentials = {
                endpoint: document.getElementById('azureEndpoint').value.trim(),
                apiKey: document.getElementById('azureApiKey').value.trim(),
                deploymentName: document.getElementById('azureDeploymentName').value.trim(),
                apiVersion: document.getElementById('azureApiVersion').value.trim(),
                modelName: document.getElementById('azureModelName').value.trim()
            };

            // Add optional fields if provided
            const maxTokens = document.getElementById('azureMaxTokens').value.trim();
            if (maxTokens) {
                credentials.maxTokens = parseInt(maxTokens, 10);
            }

            const temperature = document.getElementById('azureTemperature').value.trim();
            if (temperature) {
                credentials.temperature = parseFloat(temperature);
            }

            if (!credentials.endpoint || !credentials.deploymentName) {
                alert('Endpoint and Deployment Name are required');
                return;
            }

            vscode.postMessage({
                type: 'saveAzureCredentials',
                credentials
            });
        });

        // Add NVIDIA model
        document.getElementById('addNvidiaButton').addEventListener('click', () => {
            const credentials = {
                providerName: document.getElementById('nvidiaProviderName').value.trim(),
                endpoint: document.getElementById('nvidiaEndpoint').value.trim(),
                modelName: document.getElementById('nvidiaModelName').value.trim(),
                isEdit: false,
                editIndex: -1
            };

            // Add optional fields if provided
            const maxTokens = document.getElementById('nvidiaMaxTokens').value.trim();
            if (maxTokens) {
                credentials.maxTokens = parseInt(maxTokens, 10);
            }

            const temperature = document.getElementById('nvidiaTemperature').value.trim();
            if (temperature) {
                credentials.temperature = parseFloat(temperature);
            }

            if (!credentials.providerName || !credentials.endpoint || !credentials.modelName) {
                alert('All fields are required');
                return;
            }

            vscode.postMessage({
                type: 'saveNvidiaCredentials',
                credentials
            });

            // Clear form
            document.getElementById('nvidiaProviderName').value = '';
            document.getElementById('nvidiaEndpoint').value = '';
            document.getElementById('nvidiaModelName').value = '';
            document.getElementById('nvidiaMaxTokens').value = '';
            document.getElementById('nvidiaTemperature').value = '';
        });

        // View logs
        document.getElementById('logsButton').addEventListener('click', () => {
            vscode.postMessage({ type: 'openLogs' });
        });

        // System prompt editor
        document.getElementById('saveSystemPrompt').addEventListener('click', () => {
            const prompt = document.getElementById('systemPromptEditor').value.trim();
            vscode.postMessage({
                type: 'saveSystemPrompt',
                prompt
            });
        });

        document.getElementById('resetSystemPrompt').addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the system prompt to the default?')) {
                vscode.postMessage({ type: 'resetSystemPrompt' });
            }
        });

        // Handle messages from extension
        window.addEventListener('message', (event) => {
            const message = event.data;

            switch (message.type) {
                case 'stateLoaded':
                    currentState = message.state;
                    renderState();
                    break;
                case 'workspaceInfo':
                    document.getElementById('workspacePath').textContent = message.workspacePath;
                    break;
                case 'credentialsSaved':
                    if (message.success) {
                        // Clear Azure API key input for security
                        document.getElementById('azureApiKey').value = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
                    }
                    break;
                case 'systemPromptLoaded':
                    document.getElementById('systemPromptEditor').value = message.prompt || '';
                    break;
                case 'systemPromptSaved':
                    if (message.success) {
                        alert('System prompt saved successfully!');
                    } else {
                        alert('Failed to save system prompt: ' + message.error);
                    }
                    break;
            }
        });

        function renderState() {
            // Update provider buttons
            document.getElementById('azureProviderBtn').classList.toggle('active', currentState.provider === 'azure');
            document.getElementById('nvidiaProviderBtn').classList.toggle('active', currentState.provider === 'nvidia');

            // Update status
            const statusEl = document.getElementById('status');
            const isConfigured = currentState.provider === 'azure'
                ? currentState.azure !== null
                : currentState.nvidia.length > 0;

            if (isConfigured) {
                statusEl.textContent = '\u2713 ' + (currentState.provider === 'azure' ? 'Azure Configured' : currentState.nvidia.length + ' NVIDIA Model(s)');
                statusEl.className = 'status configured';
            } else {
                statusEl.textContent = '\u2717 Not Configured';
                statusEl.className = 'status not-configured';
            }

            // Show/hide forms
            document.getElementById('azureForm').classList.toggle('hidden', currentState.provider !== 'azure');
            document.getElementById('nvidiaForm').classList.toggle('hidden', currentState.provider !== 'nvidia');

            // Populate Azure form
            if (currentState.azure) {
                document.getElementById('azureEndpoint').value = currentState.azure.endpoint || '';
                document.getElementById('azureApiKey').value = currentState.azure.apiKey || '';
                document.getElementById('azureDeploymentName').value = currentState.azure.deploymentName || '';
                document.getElementById('azureApiVersion').value = currentState.azure.apiVersion || '';
                document.getElementById('azureModelName').value = currentState.azure.modelName || '';
                document.getElementById('azureMaxTokens').value = currentState.azure.maxTokens || '';
                document.getElementById('azureTemperature').value = currentState.azure.temperature || '';
            }

            // Render NVIDIA models list
            renderNvidiaModels();
        }

        function renderNvidiaModels() {
            const container = document.getElementById('nvidiaModelsList');
            container.innerHTML = '';

            currentState.nvidia.forEach((model, index) => {
                const isSelected = model.providerName === currentState.selectedNvidiaModel;

                const div = document.createElement('div');
                div.className = 'nvidia-model-item' + (isSelected ? ' selected' : '');
                div.innerHTML = \`
                    <div class="nvidia-model-header">
                        <div class="nvidia-model-name">\${escapeHtml(model.providerName)}</div>
                        <div class="nvidia-model-actions">
                            <button class="secondary" onclick="selectModel('\${escapeHtml(model.providerName)}')">Select</button>
                            <button class="secondary" onclick="deleteModel('\${escapeHtml(model.providerName)}')">Delete</button>
                        </div>
                    </div>
                    <div class="nvidia-model-details">
                        <div>Endpoint: \${escapeHtml(model.endpoint)}</div>
                        <div>Model: \${escapeHtml(model.modelName)}</div>
                        \${model.maxTokens ? '<div>Max Tokens: ' + escapeHtml(model.maxTokens) + '</div>' : ''}
                        \${model.temperature ? '<div>Temperature: ' + escapeHtml(model.temperature) + '</div>' : ''}
                    </div>
                \`;
                container.appendChild(div);
            });

            if (currentState.nvidia.length === 0) {
                container.innerHTML = '<p style="color: var(--vscode-descriptionForeground); font-size: 12px;">No NVIDIA models configured. Add one below.</p>';
            }
        }

        function selectModel(modelName) {
            vscode.postMessage({ type: 'selectNvidiaModel', modelName });
        }

        function deleteModel(modelName) {
            vscode.postMessage({ type: 'deleteNvidiaModel', modelName });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Request initial state
        vscode.postMessage({ type: 'loadState' });
        vscode.postMessage({ type: 'getWorkspaceInfo' });
    </script>
</body>
</html>`;
  }
};

// src/chatHistoryView.ts
var vscode12 = __toESM(require("vscode"));
var ChatHistoryViewProvider = class {
  constructor(extensionUri, chatHistoryManager2) {
    this.extensionUri = extensionUri;
    this.chatHistoryManager = chatHistoryManager2;
  }
  resolveWebviewView(webviewView, context, _token) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "loadSessions":
          await this.loadSessions();
          break;
        case "switchSession":
          await this.switchSession(data.sessionId);
          break;
        case "deleteSession":
          await this.deleteSession(data.sessionId);
          break;
        case "updateSessionTitle":
          await this.updateSessionTitle(data.sessionId, data.title);
          break;
        case "newSession":
          await this.createNewSession();
          break;
        case "exportSession":
          await this.exportSession(data.sessionId);
          break;
      }
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.loadSessions();
      }
    });
  }
  /**
   * Load and send sessions to webview
   */
  async loadSessions() {
    try {
      const sessions = await this.chatHistoryManager.getAllSessions();
      const activeSessionId = await this.chatHistoryManager.getActiveSessionId();
      this.sendMessage({
        type: "sessionsLoaded",
        sessions,
        activeSessionId
      });
    } catch (error) {
      Logger.error("Failed to load sessions", error);
      this.sendMessage({
        type: "error",
        message: `Failed to load sessions: ${error.message}`
      });
    }
  }
  /**
   * Switch to a specific session
   */
  async switchSession(sessionId) {
    try {
      await this.chatHistoryManager.setActiveSession(sessionId);
      await vscode12.commands.executeCommand("azureGPTChatView.focus");
      this.sendMessage({
        type: "sessionSwitched",
        sessionId
      });
    } catch (error) {
      Logger.error("Failed to switch session", error);
      this.sendMessage({
        type: "error",
        message: `Failed to switch session: ${error.message}`
      });
    }
  }
  /**
   * Delete a session
   */
  async deleteSession(sessionId) {
    try {
      const confirmed = await vscode12.window.showWarningMessage(
        "Delete this chat session?",
        "Yes",
        "No"
      );
      if (confirmed === "Yes") {
        await this.chatHistoryManager.deleteSession(sessionId);
        await this.loadSessions();
        this.sendMessage({
          type: "sessionDeleted",
          sessionId
        });
      }
    } catch (error) {
      Logger.error("Failed to delete session", error);
      this.sendMessage({
        type: "error",
        message: `Failed to delete session: ${error.message}`
      });
    }
  }
  /**
   * Update session title
   */
  async updateSessionTitle(sessionId, title) {
    try {
      await this.chatHistoryManager.updateSessionTitle(sessionId, title);
      await this.loadSessions();
      this.sendMessage({
        type: "sessionTitleUpdated",
        sessionId,
        title
      });
    } catch (error) {
      Logger.error("Failed to update session title", error);
      this.sendMessage({
        type: "error",
        message: `Failed to update title: ${error.message}`
      });
    }
  }
  /**
   * Create new session
   */
  async createNewSession() {
    try {
      await this.chatHistoryManager.createSession();
      await this.loadSessions();
      await vscode12.commands.executeCommand("azureGPTChatView.focus");
      this.sendMessage({
        type: "newSessionCreated"
      });
    } catch (error) {
      Logger.error("Failed to create new session", error);
      this.sendMessage({
        type: "error",
        message: `Failed to create session: ${error.message}`
      });
    }
  }
  /**
   * Export session to file
   */
  async exportSession(sessionId) {
    try {
      const session = await this.chatHistoryManager.getSession(sessionId);
      if (!session) {
        throw new Error("Session not found");
      }
      const workspaceFolders = vscode12.workspace.workspaceFolders;
      if (!workspaceFolders) {
        throw new Error("No workspace folder open");
      }
      const exportPath = `${workspaceFolders[0].uri.fsPath}/chat-session-${session.id}.json`;
      const uri = vscode12.Uri.file(exportPath);
      const encoder = new TextEncoder();
      const content = encoder.encode(JSON.stringify(session, null, 2));
      await vscode12.workspace.fs.writeFile(uri, content);
      vscode12.window.showInformationMessage(`Chat session exported to ${exportPath}`);
    } catch (error) {
      Logger.error("Failed to export session", error);
      this.sendMessage({
        type: "error",
        message: `Failed to export session: ${error.message}`
      });
    }
  }
  /**
   * Send message to webview
   */
  sendMessage(message) {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }
  /**
   * Get HTML for webview
   */
  getHtmlForWebview(webview) {
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
                                \u{1F4E5}
                            </button>
                            <button class="session-action-btn" onclick="deleteSession('\${session.id}')" title="Delete">
                                \u{1F5D1}\uFE0F
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
};

// src/systemPromptManager.ts
var vscode13 = __toESM(require("vscode"));
var SystemPromptManager = class _SystemPromptManager {
  constructor(context) {
    this.context = context;
  }
  static {
    this.RULES_KEY = "systemPromptRules";
  }
  static {
    this.DEFAULT_RULES_KEY = "defaultSystemPrompt";
  }
  /**
   * Get all system prompt rules
   */
  async getAllRules() {
    const rules = this.context.globalState.get(
      _SystemPromptManager.RULES_KEY,
      []
    );
    return rules.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  /**
   * Get enabled system prompt rules
   */
  async getEnabledRules() {
    const rules = await this.getAllRules();
    return rules.filter((rule) => rule.enabled);
  }
  /**
   * Get default system prompt
   */
  async getDefaultSystemPrompt() {
    return this.context.globalState.get(
      _SystemPromptManager.DEFAULT_RULES_KEY,
      this.getDefaultPrompt()
    );
  }
  /**
   * Set default system prompt
   */
  async setDefaultSystemPrompt(prompt) {
    await this.context.globalState.update(
      _SystemPromptManager.DEFAULT_RULES_KEY,
      prompt
    );
    Logger.log("Default system prompt updated");
  }
  /**
   * Get complete system prompt with all enabled rules
   */
  async getCompleteSystemPrompt() {
    const defaultPrompt = await this.getDefaultSystemPrompt();
    const enabledRules = await this.getEnabledRules();
    if (enabledRules.length === 0) {
      return defaultPrompt;
    }
    const rulesPrompt = enabledRules.map((rule) => `### ${rule.name}
${rule.content}`).join("\n\n");
    return `${defaultPrompt}

${rulesPrompt}`;
  }
  /**
   * Add or update a system prompt rule
   */
  async saveRule(rule) {
    const rules = await this.getAllRules();
    const existingIndex = rules.findIndex((r) => r.name === rule.name);
    const newRule = {
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
    await this.context.globalState.update(_SystemPromptManager.RULES_KEY, rules);
    Logger.log(`System prompt rule saved: ${newRule.name}`);
    return newRule;
  }
  /**
   * Delete a system prompt rule
   */
  async deleteRule(ruleId) {
    const confirmed = await vscode13.window.showWarningMessage(
      "Delete this system prompt rule?",
      "Yes",
      "No"
    );
    if (confirmed === "Yes") {
      const rules = await this.getAllRules();
      const filtered = rules.filter((r) => r.id !== ruleId);
      await this.context.globalState.update(_SystemPromptManager.RULES_KEY, filtered);
      Logger.log(`System prompt rule deleted: ${ruleId}`);
    }
  }
  /**
   * Toggle rule enabled status
   */
  async toggleRule(ruleId) {
    const rules = await this.getAllRules();
    const rule = rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = !rule.enabled;
      rule.updatedAt = Date.now();
      await this.context.globalState.update(_SystemPromptManager.RULES_KEY, rules);
      Logger.log(`System prompt rule ${ruleId} ${rule.enabled ? "enabled" : "disabled"}`);
    }
  }
  /**
   * Get default prompt
   */
  getDefaultPrompt() {
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
  generateId() {
    return `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  /**
   * Show system prompt configuration UI
   */
  async showConfigurationUI() {
    const action = await vscode13.window.showQuickPick([
      "View/Edit Default Prompt",
      "Manage Custom Rules",
      "Add New Rule"
    ], {
      placeHolder: "What would you like to configure?"
    });
    switch (action) {
      case "View/Edit Default Prompt":
        await this.editDefaultPrompt();
        break;
      case "Manage Custom Rules":
        await this.manageRules();
        break;
      case "Add New Rule":
        await this.addNewRule();
        break;
    }
  }
  /**
   * Edit default system prompt
   */
  async editDefaultPrompt() {
    const currentPrompt = await this.getDefaultSystemPrompt();
    const document = await vscode13.workspace.openTextDocument({
      content: currentPrompt,
      language: "plaintext"
    });
    await vscode13.window.showTextDocument(document);
    const result = await vscode13.window.showInformationMessage(
      'Edit the prompt in the opened document. Click "Save" when done.',
      "Save",
      "Cancel"
    );
    if (result === "Save") {
      const updatedPrompt = document.getText();
      await this.setDefaultSystemPrompt(updatedPrompt);
      await vscode13.commands.executeCommand("workbench.action.closeActiveEditor");
      vscode13.window.showInformationMessage("Default system prompt updated");
    }
  }
  /**
   * Manage existing rules
   */
  async manageRules() {
    const rules = await this.getAllRules();
    if (rules.length === 0) {
      vscode13.window.showInformationMessage("No custom rules found. Add a new rule to get started.");
      return;
    }
    const ruleItems = rules.map((rule) => ({
      label: `${rule.enabled ? "\u2705" : "\u274C"} ${rule.name}`,
      description: rule.description,
      rule
    }));
    const selected = await vscode13.window.showQuickPick(ruleItems, {
      placeHolder: "Select a rule to manage"
    });
    if (selected) {
      const actions = ["Edit", "Toggle", "Delete"];
      const action = await vscode13.window.showQuickPick(actions, {
        placeHolder: `What would you like to do with "${selected.rule.name}"?`
      });
      switch (action) {
        case "Edit":
          await this.editRule(selected.rule);
          break;
        case "Toggle":
          await this.toggleRule(selected.rule.id);
          vscode13.window.showInformationMessage(`Rule "${selected.rule.name}" ${selected.rule.enabled ? "disabled" : "enabled"}`);
          break;
        case "Delete":
          await this.deleteRule(selected.rule.id);
          break;
      }
    }
  }
  /**
   * Add new rule
   */
  async addNewRule() {
    const name = await vscode13.window.showInputBox({
      prompt: "Rule name",
      placeHolder: "e.g., TypeScript Guidelines"
    });
    if (!name)
      return;
    const description = await vscode13.window.showInputBox({
      prompt: "Rule description",
      placeHolder: "Brief description of what this rule does"
    });
    if (!description)
      return;
    const document = await vscode13.workspace.openTextDocument({
      content: `# ${name}

${description}

## Guidelines:
`,
      language: "markdown"
    });
    await vscode13.window.showTextDocument(document);
    const result = await vscode13.window.showInformationMessage(
      'Edit the rule content in the opened document. Click "Save" when done.',
      "Save",
      "Cancel"
    );
    if (result === "Save") {
      const content = document.getText();
      await this.saveRule({
        name,
        description,
        content,
        enabled: true
      });
      await vscode13.commands.executeCommand("workbench.action.closeActiveEditor");
      vscode13.window.showInformationMessage(`Rule "${name}" added successfully`);
    }
  }
  /**
   * Edit existing rule
   */
  async editRule(rule) {
    const name = await vscode13.window.showInputBox({
      prompt: "Rule name",
      value: rule.name
    });
    if (!name)
      return;
    const description = await vscode13.window.showInputBox({
      prompt: "Rule description",
      value: rule.description
    });
    if (!description)
      return;
    const document = await vscode13.workspace.openTextDocument({
      content: rule.content,
      language: "markdown"
    });
    await vscode13.window.showTextDocument(document);
    const result = await vscode13.window.showInformationMessage(
      'Edit the rule content in the opened document. Click "Save" when done.',
      "Save",
      "Cancel"
    );
    if (result === "Save") {
      const content = document.getText();
      await this.saveRule({
        name,
        description,
        content,
        enabled: rule.enabled
      });
      await vscode13.commands.executeCommand("workbench.action.closeActiveEditor");
      vscode13.window.showInformationMessage(`Rule "${name}" updated successfully`);
    }
  }
};

// src/extension.ts
var chatPanelProvider;
var credentialManager;
var azureGPTService;
var nvidiaService;
var fileManager;
var backupManager;
var exclusionManager;
var credentialsViewProvider;
var chatHistoryViewProvider;
var chatHistoryManager;
var terminalManager;
var systemPromptManager;
function activate(context) {
  Logger.initialize();
  Logger.log("=== Local Prime DevBot Activating ===");
  credentialManager = new CredentialManager(context);
  exclusionManager = new ExclusionManager(context);
  fileManager = new FileManager(exclusionManager);
  backupManager = new BackupManager(context);
  azureGPTService = new AzureGPTService(credentialManager);
  nvidiaService = new NvidiaService(credentialManager);
  terminalManager = new TerminalManager();
  chatHistoryManager = new ChatHistoryManager(context);
  systemPromptManager = new SystemPromptManager(context);
  Logger.log("All managers initialized successfully");
  credentialsViewProvider = new CredentialsViewProvider(
    context.extensionUri,
    credentialManager
  );
  chatHistoryViewProvider = new ChatHistoryViewProvider(
    context.extensionUri,
    chatHistoryManager
  );
  chatPanelProvider = new ChatPanelProvider(
    context.extensionUri,
    credentialManager,
    azureGPTService,
    nvidiaService,
    fileManager,
    backupManager,
    exclusionManager,
    context,
    terminalManager,
    chatHistoryManager
  );
  context.subscriptions.push(
    vscode14.window.registerWebviewViewProvider(
      "azureGPTChatView",
      chatPanelProvider
    )
  );
  context.subscriptions.push(
    vscode14.window.registerWebviewViewProvider(
      "azureGPTCredentialsView",
      credentialsViewProvider
    )
  );
  context.subscriptions.push(
    vscode14.window.registerWebviewViewProvider(
      "azureGPTHistoryView",
      chatHistoryViewProvider
    )
  );
  context.subscriptions.push(
    vscode14.commands.registerCommand("localAzureGPT.openChat", () => {
      vscode14.commands.executeCommand("prime-devbot-sidebar.azureGPTChatView.focus");
    })
  );
  context.subscriptions.push(
    vscode14.commands.registerCommand("localAzureGPT.configureCredentials", async () => {
      try {
        vscode14.commands.executeCommand("prime-devbot-sidebar.azureGPTCredentialsView.focus");
      } catch (error) {
        Logger.error("Failed to open credentials configuration", error, true);
      }
    })
  );
  context.subscriptions.push(
    vscode14.commands.registerCommand("localAzureGPT.showLogs", async () => {
      Logger.show();
    })
  );
  context.subscriptions.push(
    vscode14.commands.registerCommand("localAzureGPT.showCredentialStatus", async () => {
      await credentialManager.showCredentialStatus();
    })
  );
  context.subscriptions.push(
    vscode14.commands.registerCommand("localAzureGPT.configureExclusions", async () => {
      await exclusionManager.showConfigurationUI();
    })
  );
  context.subscriptions.push(
    vscode14.commands.registerCommand("localAzureGPT.clearHistory", async () => {
      const confirmed = await vscode14.window.showWarningMessage(
        "Are you sure you want to clear all chat history?",
        "Yes",
        "No"
      );
      if (confirmed === "Yes") {
        await chatPanelProvider.clearHistory();
        vscode14.window.showInformationMessage("Chat history cleared!");
      }
    })
  );
  context.subscriptions.push(
    vscode14.commands.registerCommand("localAzureGPT.exportHistory", async () => {
      await chatPanelProvider.exportHistory();
    })
  );
  context.subscriptions.push(
    vscode14.commands.registerCommand("localAzureGPT.rollbackChanges", async () => {
      await backupManager.rollback();
    })
  );
  context.subscriptions.push(
    vscode14.commands.registerCommand("localAzureGPT.configureSystemPrompts", async () => {
      try {
        await systemPromptManager.showConfigurationUI();
      } catch (error) {
        Logger.error("Failed to open system prompts configuration", error, true);
      }
    })
  );
}
function deactivate() {
  Logger.log("=== DevBot Assistant Deactivating ===");
  Logger.dispose();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
