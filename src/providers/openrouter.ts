import * as vscode from "vscode";
import type { Provider, ChatMessage, WorkspaceContext, StreamChunk } from "../types";

/** OpenRouter provider - cloud models via OpenRouter API */
export class OpenRouterProvider implements Provider {
  readonly name = "openrouter";
  readonly isLocal = false;

  private model: string;
  private apiKey: string | null = null;
  private controller: AbortController | null = null;

  constructor(model: string) {
    this.model = model;
  }

  /** Load API key from VS Code SecretStorage */
  async loadApiKey(secrets: vscode.SecretStorage): Promise<void> {
    this.apiKey = await secrets.get("8gent.openrouter.apiKey") || null;
  }

  /** Prompt user for API key and store it */
  async promptApiKey(secrets: vscode.SecretStorage): Promise<boolean> {
    const key = await vscode.window.showInputBox({
      prompt: "Enter your OpenRouter API key",
      placeHolder: "sk-or-...",
      password: true,
      ignoreFocusOut: true,
    });
    if (key) {
      await secrets.store("8gent.openrouter.apiKey", key);
      this.apiKey = key;
      return true;
    }
    return false;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async chat(
    messages: ChatMessage[],
    context?: WorkspaceContext,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key not set. Run '8gent: Switch Provider' and select OpenRouter.");
    }

    this.controller = new AbortController();

    const systemMsg = context ? buildContextMessage(context) : undefined;
    const apiMessages = [
      ...(systemMsg ? [{ role: "system" as const, content: systemMsg }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://8gent.dev",
        "X-Title": "8gent VS Code",
      },
      body: JSON.stringify({
        model: this.model,
        messages: apiMessages,
        stream: true,
      }),
      signal: this.controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401) {
        throw new Error("Invalid OpenRouter API key. Update it in settings.");
      }
      throw new Error(`OpenRouter error: ${res.status} - ${body.slice(0, 200)}`);
    }

    return streamSSE(res, onChunk);
  }

  abort(): void {
    this.controller?.abort();
    this.controller = null;
  }
}

/** Stream Server-Sent Events (OpenAI format) */
async function streamSSE(
  res: Response,
  onChunk?: (chunk: StreamChunk) => void
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        onChunk?.({ text: "", done: true });
        continue;
      }
      try {
        const obj = JSON.parse(data);
        const text = obj.choices?.[0]?.delta?.content || "";
        if (text) {
          full += text;
          onChunk?.({ text, done: false });
        }
      } catch {
        // skip malformed
      }
    }
  }

  return full;
}

function buildContextMessage(ctx: WorkspaceContext): string {
  const parts: string[] = [];
  if (ctx.workspaceRoot) parts.push(`Workspace: ${ctx.workspaceRoot}`);
  if (ctx.activeFile) {
    parts.push(`Current file: ${ctx.activeFile.path} (${ctx.activeFile.language})`);
    if (ctx.selection) {
      parts.push(`Selected (lines ${ctx.selection.startLine}-${ctx.selection.endLine}):\n\`\`\`\n${ctx.selection.text}\n\`\`\``);
    } else {
      const lines = ctx.activeFile.content.split("\n").slice(0, 200).join("\n");
      parts.push(`File content:\n\`\`\`${ctx.activeFile.language}\n${lines}\n\`\`\``);
    }
  }
  if (ctx.openFiles?.length) parts.push(`Open files: ${ctx.openFiles.join(", ")}`);
  return parts.join("\n\n");
}
