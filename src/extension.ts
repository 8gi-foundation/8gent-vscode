import * as vscode from "vscode";
import type { ChatMessage, Provider, WorkspaceContext } from "./types";
import { createProvider, detectProviders, pickProvider, type ProviderName, PROVIDER_LABELS } from "./providers";
import { OllamaProvider } from "./providers/ollama";
import { gatherContext } from "./context";
import { getChatHTML } from "./webview/chat-html";

let currentProvider: Provider | null = null;
let currentProviderName: ProviderName = "ollama";
let currentModelName: string | undefined;
let chatHistory: ChatMessage[] = [];
let chatPanel: vscode.WebviewView | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("8gent");
  currentProviderName = config.get("provider", "ollama") as ProviderName;

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

      // Handle messages from webview
      webviewView.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.type) {
          case "chat":
            await handleChat(msg.text, webviewView.webview, config.get("contextInjection", true));
            break;
          case "stop":
            currentProvider?.abort();
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
    vscode.commands.registerCommand("8gent.newChat", () => {
      chatHistory = [];
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
    webview.postMessage({ type: "done" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Remove the failed user message from history
    chatHistory.pop();

    if (msg.includes("aborted")) {
      webview.postMessage({ type: "error", text: "Request cancelled" });
    } else {
      webview.postMessage({ type: "error", text: msg });
    }
  }
}

export function deactivate() {
  currentProvider?.abort();
}
