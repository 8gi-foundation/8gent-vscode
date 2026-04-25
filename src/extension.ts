import * as vscode from "vscode";
import type { ChatMessage, Provider, WorkspaceContext } from "./types";
import { createProvider, detectProviders, pickProvider, type ProviderName, PROVIDER_LABELS } from "./providers";
import { OllamaProvider } from "./providers/ollama";
import { OpenRouterProvider } from "./providers/openrouter";
import { gatherContext } from "./context";
import { getChatHTML } from "./webview/chat-html";

let currentProvider: Provider | null = null;
let currentProviderName: ProviderName = "ollama";
let currentModelName: string | undefined;
let chatHistory: ChatMessage[] = [];
let chatPanel: vscode.WebviewView | undefined;

export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  const config = vscode.workspace.getConfiguration("8gent");
  currentProviderName = config.get("provider", "ollama") as ProviderName;

  // Restore chat history from global state
  const savedHistory = context.globalState.get<ChatMessage[]>("8gent.chatHistory");
  if (savedHistory?.length) {
    chatHistory = savedHistory;
  }

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "8gent.switchProvider";
  statusBar.tooltip = "8gent - click to switch provider";
  context.subscriptions.push(statusBar);

  async function initProvider(name: ProviderName) {
    currentProviderName = name;
    currentProvider = createProvider(name);
    currentModelName = undefined;

    // Load vessel auth if needed
    if (name === "vessel" && "loadAuth" in currentProvider) {
      await (currentProvider as { loadAuth: (s: vscode.SecretStorage) => Promise<void> }).loadAuth(
        context.secrets
      );
    }

    // Load OpenRouter API key
    if (currentProvider instanceof OpenRouterProvider) {
      await currentProvider.loadApiKey(context.secrets);
      if (!currentProvider["apiKey"]) {
        const set = await currentProvider.promptApiKey(context.secrets);
        if (!set) {
          return false;
        }
      }
    }

    const healthy = await currentProvider.healthCheck();

    // Resolve model name for display
    if (healthy && currentProvider instanceof OllamaProvider) {
      const models = await currentProvider.listModels();
      const chatModels = models.filter((m) => !m.includes("embed") && !m.includes("nomic"));
      currentModelName = chatModels[0] || models[0];
    }

    if (healthy) {
      const display = currentModelName ? `${name}: ${currentModelName}` : name;
      statusBar.text = `$(hubot) 8gent: ${display}`;
      statusBar.backgroundColor = undefined;
    } else {
      statusBar.text = `$(warning) 8gent: ${name} (offline)`;
      statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }

    statusBar.show();
    return healthy;
  }

  // Try configured provider, then auto-detect
  let healthy = await initProvider(currentProviderName);
  if (!healthy) {
    const available = await detectProviders();
    if (available.length > 0) {
      const fallback = available[0];
      healthy = await initProvider(fallback);
      if (healthy) {
        vscode.window.showInformationMessage(`8gent: using ${fallback} (auto-detected)`);
      }
    }
  }

  if (!healthy) {
    statusBar.text = "$(warning) 8gent: no provider";
    statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    statusBar.show();
  }

  // Register sidebar webview
  const chatViewProvider: vscode.WebviewViewProvider = {
    resolveWebviewView(webviewView: vscode.WebviewView) {
      chatPanel = webviewView;

      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [context.extensionUri],
      };

      webviewView.webview.html = getChatHTML(
        webviewView.webview,
        context.extensionUri,
        currentProviderName,
        currentProvider?.isLocal ?? true,
        currentModelName
      );

      // Replay saved chat history into webview
      if (chatHistory.length > 0) {
        setTimeout(() => {
          webviewView.webview.postMessage({
            type: "restoreHistory",
            messages: chatHistory.map((m) => ({ role: m.role, content: m.content })),
          });
        }, 100);
      }

      // Handle messages from webview
      webviewView.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.type) {
          case "chat":
            await handleChat(msg.text, webviewView.webview, config.get("contextInjection", true));
            break;
          case "stop":
            currentProvider?.abort();
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
          case "switchProvider":
            vscode.commands.executeCommand("8gent.switchProvider");
            break;
          case "newChat":
            vscode.commands.executeCommand("8gent.newChat");
            break;
        }
      });
    },
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("8gent.chat", chatViewProvider)
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("8gent.newChat", async () => {
      chatHistory = [];
      await context.globalState.update("8gent.chatHistory", []);
      if (chatPanel) {
        chatPanel.webview.html = getChatHTML(
          chatPanel.webview,
          context.extensionUri,
          currentProviderName,
          currentProvider?.isLocal ?? true,
          currentModelName
        );
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
      const healthy = await initProvider(currentProviderName);
      if (healthy) {
        vscode.window.showInformationMessage(`8gent: Connected to ${currentProviderName}`);
        chatPanel?.webview.postMessage({
          type: "providerChanged",
          name: currentProviderName,
          local: currentProvider?.isLocal ?? true,
          model: currentModelName,
        });
      } else {
        vscode.window.showWarningMessage(`8gent: ${currentProviderName} is not reachable`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("8gent.switchProvider", async () => {
      const picked = await pickProvider(currentProviderName);
      if (!picked || picked === currentProviderName) return;

      const healthy = await initProvider(picked);
      if (!healthy) {
        vscode.window.showWarningMessage(`8gent: ${picked} is not reachable. Switching anyway.`);
      }

      await config.update("provider", picked, vscode.ConfigurationTarget.Global);

      chatPanel?.webview.postMessage({
        type: "providerChanged",
        name: picked,
        local: currentProvider?.isLocal ?? true,
        model: currentModelName,
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("8gent.pickModel", async () => {
      if (!(currentProvider instanceof OllamaProvider)) {
        vscode.window.showInformationMessage("8gent: Model picker is only available for Ollama");
        return;
      }
      const models = await currentProvider.listModels();
      const chatModels = models.filter((m) => !m.includes("embed") && !m.includes("nomic"));
      if (!chatModels.length) {
        vscode.window.showWarningMessage("8gent: No chat models found in Ollama");
        return;
      }
      const items = chatModels.map((m) => ({
        label: m,
        description: m === currentModelName ? "(active)" : undefined,
      }));
      const picked = await vscode.window.showQuickPick(items, { placeHolder: "Select Ollama model" });
      if (!picked || picked.label === currentModelName) return;

      // Update config and reinit
      await vscode.workspace.getConfiguration("8gent").update("ollama.model", picked.label, vscode.ConfigurationTarget.Global);
      await initProvider("ollama");

      chatPanel?.webview.postMessage({
        type: "providerChanged",
        name: "ollama",
        local: true,
        model: currentModelName,
      });
    })
  );

  // Focus chat command (Cmd+L)
  context.subscriptions.push(
    vscode.commands.registerCommand("8gent.focusChat", () => {
      vscode.commands.executeCommand("8gent.chat.focus");
      // Post a focus message to the webview so it focuses the input
      setTimeout(() => {
        chatPanel?.webview.postMessage({ type: "focusInput" });
      }, 100);
    })
  );

  // Watch for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("8gent")) {
        const newProvider = vscode.workspace
          .getConfiguration("8gent")
          .get("provider", "ollama") as ProviderName;
        if (newProvider !== currentProviderName) {
          initProvider(newProvider);
        }
      }
    })
  );
}

let extensionContext: vscode.ExtensionContext;
let mentionedFiles = new Set<string>();

async function saveHistory(): Promise<void> {
  // Keep last 50 messages
  const toSave = chatHistory.slice(-50);
  await extensionContext.globalState.update("8gent.chatHistory", toSave);
}

async function handleChat(
  text: string,
  webview: vscode.Webview,
  injectContext: boolean
): Promise<void> {
  if (!currentProvider) {
    webview.postMessage({
      type: "error",
      text: "No provider connected. Click the provider badge to switch, or run '8gent: Reconnect'.",
    });
    return;
  }

  chatHistory.push({ role: "user", content: text, timestamp: Date.now() });

  let ctx: WorkspaceContext | undefined;
  if (injectContext) {
    ctx = gatherContext();
  }

  // Include @mentioned files in context
  if (mentionedFiles.size > 0 && ctx) {
    const mentionContents: string[] = [];
    for (const filePath of mentionedFiles) {
      try {
        const folders = vscode.workspace.workspaceFolders;
        if (folders?.length) {
          const uri = vscode.Uri.joinPath(folders[0].uri, filePath);
          const content = await vscode.workspace.fs.readFile(uri);
          const text = new TextDecoder().decode(content);
          const lang = filePath.split(".").pop() || "";
          mentionContents.push(`File: ${filePath}\n\`\`\`${lang}\n${text.slice(0, 5000)}\n\`\`\``);
        }
      } catch {
        // File not found, skip
      }
    }
    if (mentionContents.length) {
      // Prepend mentioned files to the active file context
      const mentionCtx = mentionContents.join("\n\n");
      if (ctx.activeFile) {
        ctx.activeFile.content = mentionCtx + "\n\n" + ctx.activeFile.content;
      }
    }
    mentionedFiles.clear();
  }

  try {
    const response = await currentProvider.chat(
      chatHistory,
      ctx,
      (chunk) => {
        if (chunk.text) {
          webview.postMessage({ type: "stream", text: chunk.text });
        }
      }
    );

    chatHistory.push({ role: "assistant", content: response, timestamp: Date.now() });
    await saveHistory();
    webview.postMessage({ type: "done", model: currentModelName || currentProviderName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Remove the failed user message from history
    chatHistory.pop();

    if (msg.includes("aborted")) {
      webview.postMessage({ type: "error", text: "Request cancelled" });
    } else if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET") || msg.includes("network")) {
      // Connection error - check if provider is still alive
      const healthy = await currentProvider?.healthCheck();
      if (healthy) {
        webview.postMessage({ type: "error", text: "Temporary connection error. Please try again." });
      } else {
        webview.postMessage({ type: "error", text: `${currentProviderName} is offline. Start the service or click the provider badge to switch.` });
      }
    } else {
      webview.postMessage({ type: "error", text: msg });
    }
  }
}

/** Search workspace files for @mention autocomplete */
async function handleMentionQuery(query: string, webview: vscode.Webview): Promise<void> {
  if (!query) {
    webview.postMessage({ type: "mentionResults", files: [] });
    return;
  }

  try {
    const pattern = `**/*${query}*`;
    const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 15);
    const files = uris.map((uri) => {
      const rel = vscode.workspace.asRelativePath(uri);
      const parts = rel.split("/");
      const name = parts.pop() || rel;
      const dir = parts.join("/");
      return { path: rel, name, dir };
    });
    webview.postMessage({ type: "mentionResults", files });
  } catch {
    webview.postMessage({ type: "mentionResults", files: [] });
  }
}

/** Show diff between current editor content and proposed code */
async function showDiffPreview(proposedCode: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("8gent: No active editor for diff preview");
    return;
  }

  const currentContent = editor.selection.isEmpty
    ? editor.document.getText()
    : editor.document.getText(editor.selection);

  // Create virtual documents for diff
  const originalUri = vscode.Uri.parse("8gent-diff:Current");
  const proposedUri = vscode.Uri.parse("8gent-diff:Proposed");

  // Register a temporary content provider
  const provider = new (class implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
      return uri.path === "Current" ? currentContent : proposedCode;
    }
  })();

  const reg = vscode.workspace.registerTextDocumentContentProvider("8gent-diff", provider);

  await vscode.commands.executeCommand(
    "vscode.diff",
    originalUri,
    proposedUri,
    "8gent: Current vs Proposed",
    { preview: true }
  );

  // Clean up after a delay
  setTimeout(() => reg.dispose(), 60000);
}

/** Insert code at cursor position in active editor */
function applyCodeToEditor(code: string): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("8gent: No active editor to apply code to");
    return;
  }

  editor.edit((editBuilder) => {
    if (editor.selection.isEmpty) {
      // Insert at cursor
      editBuilder.insert(editor.selection.active, code);
    } else {
      // Replace selection
      editBuilder.replace(editor.selection, code);
    }
  }).then((success) => {
    if (success) {
      vscode.window.showInformationMessage("8gent: Code applied to editor");
    }
  });
}

export function deactivate() {
  currentProvider?.abort();
}
