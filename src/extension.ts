import * as vscode from "vscode";
import type { ChatMessage, Provider, WorkspaceContext } from "./types";
import { createProvider, detectProviders, pickProvider, type ProviderName, PROVIDER_LABELS } from "./providers";
import { OllamaProvider } from "./providers/ollama";
import { OpenRouterProvider } from "./providers/openrouter";
import { gatherContext } from "./context";
import { getChatHTML } from "./webview/chat-html";

// ---- Per-role agent state ----
type RoleName = "orchestrator" | "engineer" | "qa";

interface RoleAgent {
  provider: Provider | null;
  providerName: ProviderName;
  modelName: string | undefined;
  history: ChatMessage[];
  systemPrompt: string; // editable by user
}

const DEFAULT_PROMPTS: Record<RoleName, string> = {
  orchestrator: `You are 8gent in Orchestrator mode. You plan, coordinate, and architect.
- Break complex tasks into sub-tasks
- Think about architecture and trade-offs before code
- Use <think>...</think> tags for planning`,
  engineer: `You are 8gent in Engineer mode. You write clean, production-ready code.
- Implement directly with working code
- Show complete code blocks, not partial diffs
- Be concise - code speaks louder than words`,
  qa: `You are 8gent in QA mode. You review code for quality and correctness.
- Find bugs, edge cases, security issues
- Check error handling and validation
- Suggest tests and rate severity (critical/warning/info)`,
};

const roles: Record<RoleName, RoleAgent> = {
  orchestrator: { provider: null, providerName: "ollama", modelName: undefined, history: [], systemPrompt: DEFAULT_PROMPTS.orchestrator },
  engineer: { provider: null, providerName: "ollama", modelName: undefined, history: [], systemPrompt: DEFAULT_PROMPTS.engineer },
  qa: { provider: null, providerName: "ollama", modelName: undefined, history: [], systemPrompt: DEFAULT_PROMPTS.qa },
};

let currentRole: RoleName = "orchestrator";
let chatPanel: vscode.WebviewView | undefined;
let extensionContext: vscode.ExtensionContext;
let mentionedFiles = new Set<string>();

function activeAgent(): RoleAgent {
  return roles[currentRole];
}

export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  const config = vscode.workspace.getConfiguration("8gent");

  // Restore per-role state from global state
  for (const role of ["orchestrator", "engineer", "qa"] as RoleName[]) {
    const saved = context.globalState.get<ChatMessage[]>(`8gent.history.${role}`);
    if (saved?.length) roles[role].history = saved;

    const savedProvider = context.globalState.get<string>(`8gent.provider.${role}`);
    if (savedProvider) roles[role].providerName = savedProvider as ProviderName;

    const savedModel = context.globalState.get<string>(`8gent.model.${role}`);
    if (savedModel) roles[role].modelName = savedModel;

    const savedPrompt = context.globalState.get<string>(`8gent.prompt.${role}`);
    if (savedPrompt) roles[role].systemPrompt = savedPrompt;
  }

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "8gent.switchProvider";
  statusBar.tooltip = "8gent - click to switch provider";
  context.subscriptions.push(statusBar);

  // ---- Init provider for a role ----
  async function initRoleProvider(role: RoleName): Promise<boolean> {
    const agent = roles[role];
    agent.provider = createProvider(agent.providerName);

    // Load secrets for cloud providers
    if (agent.providerName === "vessel" && "loadAuth" in agent.provider) {
      await (agent.provider as { loadAuth: (s: vscode.SecretStorage) => Promise<void> }).loadAuth(context.secrets);
    }
    if (agent.provider instanceof OpenRouterProvider) {
      await agent.provider.loadApiKey(context.secrets);
      if (!agent.provider["apiKey"]) {
        const set = await agent.provider.promptApiKey(context.secrets);
        if (!set) return false;
      }
    }

    const healthy = await agent.provider.healthCheck();

    // Resolve model name
    if (healthy && agent.provider instanceof OllamaProvider) {
      if (!agent.modelName) {
        const models = await agent.provider.listModels();
        const chatModels = models.filter((m: string) => !m.includes("embed") && !m.includes("nomic"));
        agent.modelName = chatModels[0] || models[0];
      }
    }

    return healthy;
  }

  function updateStatusBar() {
    const agent = activeAgent();
    if (agent.provider) {
      const display = agent.modelName ? `${agent.providerName}: ${agent.modelName}` : agent.providerName;
      statusBar.text = `$(hubot) 8gent [${currentRole}]: ${display}`;
      statusBar.backgroundColor = undefined;
    } else {
      statusBar.text = `$(warning) 8gent [${currentRole}]: no provider`;
      statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
    statusBar.show();
  }

  // Auto-detect and init all roles
  const defaultProvider = config.get("provider", "ollama") as ProviderName;
  for (const role of ["orchestrator", "engineer", "qa"] as RoleName[]) {
    // Use saved provider or fall back to global default
    if (!roles[role].providerName) roles[role].providerName = defaultProvider;
    const ok = await initRoleProvider(role);
    if (!ok && role === "orchestrator") {
      // Try auto-detect for first role
      const available = await detectProviders();
      if (available.length) {
        roles[role].providerName = available[0];
        await initRoleProvider(role);
      }
    }
  }
  updateStatusBar();

  // ---- Webview ----
  const chatViewProvider: vscode.WebviewViewProvider = {
    resolveWebviewView(webviewView: vscode.WebviewView) {
      chatPanel = webviewView;
      webviewView.webview.options = { enableScripts: true, localResourceRoots: [context.extensionUri] };

      const agent = activeAgent();
      webviewView.webview.html = getChatHTML(
        webviewView.webview, context.extensionUri,
        agent.providerName, agent.provider?.isLocal ?? true, agent.modelName
      );

      // Replay history
      if (agent.history.length > 0) {
        setTimeout(() => {
          webviewView.webview.postMessage({
            type: "restoreHistory",
            messages: agent.history.map((m) => ({ role: m.role, content: m.content })),
          });
        }, 100);
      }

      webviewView.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.type) {
          case "chat":
            await handleChat(msg.text, webviewView.webview, config.get("contextInjection", true), msg.role as RoleName);
            break;
          case "stop":
            activeAgent().provider?.abort();
            break;
          case "applyCode":
            applyCodeToEditor(msg.code);
            break;
          case "diffCode":
            showDiffPreview(msg.code);
            break;
          case "mentionQuery":
            handleMentionQuery(msg.query, webviewView.webview);
            break;
          case "mentionFile":
            mentionedFiles.add(msg.file);
            break;
          case "openSettings":
            vscode.commands.executeCommand("workbench.action.openSettings", "8gent");
            break;
          case "truncateHistory": {
            if (typeof msg.index === "number" && msg.index >= 0) {
              const agent = activeAgent();
              agent.history = agent.history.slice(0, msg.index);
              saveHistory();
            }
            break;
          }
          case "roleChanged": {
            currentRole = (msg.role || "orchestrator") as RoleName;
            updateStatusBar();
            // Tell webview the provider for the new role
            const ra = activeAgent();
            webviewView.webview.postMessage({
              type: "providerChanged",
              name: ra.providerName,
              local: ra.provider?.isLocal ?? true,
              model: ra.modelName,
            });
            break;
          }
          case "switchProvider":
            vscode.commands.executeCommand("8gent.switchProvider");
            break;
          case "newChat":
            vscode.commands.executeCommand("8gent.newChat");
            break;
          case "editSystemPrompt":
            editSystemPrompt();
            break;
        }
      });
    },
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("8gent.chat", chatViewProvider)
  );

  // ---- Commands ----

  context.subscriptions.push(
    vscode.commands.registerCommand("8gent.newChat", async () => {
      const agent = activeAgent();
      agent.history = [];
      await context.globalState.update(`8gent.history.${currentRole}`, []);
      if (chatPanel) {
        chatPanel.webview.postMessage({ type: "clearChat" });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("8gent.sendSelection", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage("8gent: No text selected");
        return;
      }
      const text = editor.document.getText(editor.selection);
      const relPath = vscode.workspace.asRelativePath(editor.document.uri);
      const lang = editor.document.languageId;
      const startLine = editor.selection.start.line + 1;
      const endLine = editor.selection.end.line + 1;
      const prompt = `Regarding this code from ${relPath} (lines ${startLine}-${endLine}):\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
      vscode.commands.executeCommand("8gent.chat.focus");
      chatPanel?.webview.postMessage({ type: "inject", text: prompt, file: relPath });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("8gent.reconnect", async () => {
      const ok = await initRoleProvider(currentRole);
      updateStatusBar();
      if (ok) {
        vscode.window.showInformationMessage(`8gent: Connected ${currentRole} to ${activeAgent().providerName}`);
        const ra = activeAgent();
        chatPanel?.webview.postMessage({
          type: "providerChanged",
          name: ra.providerName, local: ra.provider?.isLocal ?? true, model: ra.modelName,
        });
      } else {
        vscode.window.showWarningMessage(`8gent: ${activeAgent().providerName} is not reachable`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("8gent.switchProvider", async () => {
      const agent = activeAgent();
      const picked = await pickProvider(agent.providerName);
      if (!picked || picked === agent.providerName) return;

      agent.providerName = picked;
      agent.modelName = undefined;
      const ok = await initRoleProvider(currentRole);
      if (!ok) {
        vscode.window.showWarningMessage(`8gent: ${picked} is not reachable. Switching anyway.`);
      }

      // Persist per-role provider choice
      await context.globalState.update(`8gent.provider.${currentRole}`, picked);
      updateStatusBar();

      chatPanel?.webview.postMessage({
        type: "providerChanged",
        name: picked, local: agent.provider?.isLocal ?? true, model: agent.modelName,
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("8gent.pickModel", async () => {
      const agent = activeAgent();
      if (!(agent.provider instanceof OllamaProvider)) {
        vscode.window.showInformationMessage("8gent: Model picker is only available for Ollama");
        return;
      }
      const models = await agent.provider.listModels();
      const chatModels = models.filter((m: string) => !m.includes("embed") && !m.includes("nomic"));
      if (!chatModels.length) {
        vscode.window.showWarningMessage("8gent: No chat models found in Ollama");
        return;
      }
      const items = chatModels.map((m: string) => ({
        label: m,
        description: m === agent.modelName ? "(active)" : undefined,
      }));
      const picked = await vscode.window.showQuickPick(items, { placeHolder: `Select model for ${currentRole}` });
      if (!picked || picked.label === agent.modelName) return;

      agent.modelName = picked.label;
      await context.globalState.update(`8gent.model.${currentRole}`, picked.label);
      await initRoleProvider(currentRole);
      updateStatusBar();

      chatPanel?.webview.postMessage({
        type: "providerChanged",
        name: "ollama", local: true, model: agent.modelName,
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("8gent.focusChat", () => {
      vscode.commands.executeCommand("8gent.chat.focus");
      setTimeout(() => { chatPanel?.webview.postMessage({ type: "focusInput" }); }, 100);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("8gent")) {
        // Config changes apply to current role
      }
    })
  );
}

// ---- Helpers ----

async function saveHistory(): Promise<void> {
  const agent = activeAgent();
  const toSave = agent.history.slice(-50);
  agent.history = toSave;
  await extensionContext.globalState.update(`8gent.history.${currentRole}`, toSave);
}

async function editSystemPrompt(): Promise<void> {
  const agent = activeAgent();
  const doc = await vscode.workspace.openTextDocument({
    content: agent.systemPrompt,
    language: "markdown",
  });
  const editor = await vscode.window.showTextDocument(doc, { preview: true });

  // Save when the document is saved or closed
  const disposable = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document === doc) {
      agent.systemPrompt = doc.getText();
      extensionContext.globalState.update(`8gent.prompt.${currentRole}`, agent.systemPrompt);
    }
  });

  // Clean up when editor closes
  const closeDisposable = vscode.window.onDidChangeVisibleTextEditors((editors) => {
    if (!editors.some((e) => e.document === doc)) {
      disposable.dispose();
      closeDisposable.dispose();
    }
  });
}

async function handleChat(
  text: string,
  webview: vscode.Webview,
  injectContext: boolean,
  role?: RoleName
): Promise<void> {
  // Use the specified role or current
  const targetRole = role || currentRole;
  const agent = roles[targetRole];

  if (!agent.provider) {
    // Try to init
    const ok = await initRoleProvider(targetRole);
    if (!ok || !agent.provider) {
      webview.postMessage({
        type: "error",
        text: `No provider for ${targetRole}. Click the provider badge to switch, or run '8gent: Reconnect'.`,
      });
      return;
    }
  }

  agent.history.push({ role: "user", content: text, timestamp: Date.now() });

  let ctx: WorkspaceContext = injectContext ? gatherContext() : {};
  ctx.role = targetRole;
  ctx.customSystemPrompt = agent.systemPrompt;

  // Include @mentioned files
  if (mentionedFiles.size > 0 && ctx) {
    const mentionContents: string[] = [];
    for (const filePath of mentionedFiles) {
      try {
        const folders = vscode.workspace.workspaceFolders;
        if (folders?.length) {
          const uri = vscode.Uri.joinPath(folders[0].uri, filePath);
          const content = await vscode.workspace.fs.readFile(uri);
          const fileText = new TextDecoder().decode(content);
          const lang = filePath.split(".").pop() || "";
          mentionContents.push(`File: ${filePath}\n\`\`\`${lang}\n${fileText.slice(0, 5000)}\n\`\`\``);
        }
      } catch {
        // skip
      }
    }
    if (mentionContents.length && ctx.activeFile) {
      ctx.activeFile.content = mentionContents.join("\n\n") + "\n\n" + ctx.activeFile.content;
    }
    mentionedFiles.clear();
  }

  // Trim history to fit context window
  const maxChars = 24000;
  let trimmed = [...agent.history];
  let totalChars = trimmed.reduce((sum, m) => sum + m.content.length, 0);
  const origLen = trimmed.length;
  while (totalChars > maxChars && trimmed.length > 2) {
    const removed = trimmed.shift();
    if (removed) totalChars -= removed.content.length;
  }
  if (trimmed.length < origLen) {
    webview.postMessage({ type: "tool", text: `Context trimmed: ${origLen - trimmed.length} older messages omitted` });
  }

  try {
    const response = await agent.provider.chat(trimmed, ctx, (chunk) => {
      if (chunk.text) webview.postMessage({ type: "stream", text: chunk.text });
    });
    agent.history.push({ role: "assistant", content: response, timestamp: Date.now() });
    await saveHistory();
    webview.postMessage({ type: "done", model: agent.modelName || agent.providerName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    agent.history.pop(); // remove failed user msg

    if (msg.includes("aborted")) {
      webview.postMessage({ type: "error", text: "Request cancelled" });
    } else if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET") || msg.includes("network")) {
      const healthy = await agent.provider?.healthCheck();
      webview.postMessage({
        type: "error",
        text: healthy ? "Temporary connection error. Try again." : `${agent.providerName} is offline.`,
      });
    } else {
      webview.postMessage({ type: "error", text: msg });
    }
  }
}

async function initRoleProvider(role: RoleName): Promise<boolean> {
  const agent = roles[role];
  agent.provider = createProvider(agent.providerName);

  if (agent.providerName === "vessel" && "loadAuth" in agent.provider) {
    await (agent.provider as { loadAuth: (s: vscode.SecretStorage) => Promise<void> }).loadAuth(extensionContext.secrets);
  }
  if (agent.provider instanceof OpenRouterProvider) {
    await agent.provider.loadApiKey(extensionContext.secrets);
    if (!agent.provider["apiKey"]) {
      const set = await agent.provider.promptApiKey(extensionContext.secrets);
      if (!set) return false;
    }
  }

  const healthy = await agent.provider.healthCheck();

  if (healthy && agent.provider instanceof OllamaProvider && !agent.modelName) {
    const models = await agent.provider.listModels();
    const chatModels = models.filter((m: string) => !m.includes("embed") && !m.includes("nomic"));
    agent.modelName = chatModels[0] || models[0];
  }

  return healthy;
}

async function handleMentionQuery(query: string, webview: vscode.Webview): Promise<void> {
  if (!query) { webview.postMessage({ type: "mentionResults", files: [] }); return; }
  try {
    const uris = await vscode.workspace.findFiles(`**/*${query}*`, "**/node_modules/**", 15);
    const files = uris.map((uri) => {
      const rel = vscode.workspace.asRelativePath(uri);
      const parts = rel.split("/");
      const name = parts.pop() || rel;
      return { path: rel, name, dir: parts.join("/") };
    });
    webview.postMessage({ type: "mentionResults", files });
  } catch {
    webview.postMessage({ type: "mentionResults", files: [] });
  }
}

async function showDiffPreview(proposedCode: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { vscode.window.showWarningMessage("8gent: No active editor for diff"); return; }
  const currentContent = editor.selection.isEmpty ? editor.document.getText() : editor.document.getText(editor.selection);
  const originalUri = vscode.Uri.parse("8gent-diff:Current");
  const proposedUri = vscode.Uri.parse("8gent-diff:Proposed");
  const provider = new (class implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
      return uri.path === "Current" ? currentContent : proposedCode;
    }
  })();
  const reg = vscode.workspace.registerTextDocumentContentProvider("8gent-diff", provider);
  await vscode.commands.executeCommand("vscode.diff", originalUri, proposedUri, "8gent: Current vs Proposed", { preview: true });
  setTimeout(() => reg.dispose(), 60000);
}

function applyCodeToEditor(code: string): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { vscode.window.showWarningMessage("8gent: No active editor"); return; }
  editor.edit((eb) => {
    if (editor.selection.isEmpty) eb.insert(editor.selection.active, code);
    else eb.replace(editor.selection, code);
  }).then((ok) => { if (ok) vscode.window.showInformationMessage("8gent: Code applied"); });
}

export function deactivate() {
  for (const role of Object.values(roles)) {
    role.provider?.abort();
  }
}
