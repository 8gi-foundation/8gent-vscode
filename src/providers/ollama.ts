import type { Provider, ChatMessage, WorkspaceContext, StreamChunk } from "../types";

/** Ollama provider - local model inference via Ollama API */
export class OllamaProvider implements Provider {
  readonly name = "ollama";
  readonly isLocal = true;

  private endpoint: string;
  private model: string;
  private controller: AbortController | null = null;

  constructor(endpoint: string, model: string) {
    this.endpoint = endpoint.replace(/\/$/, "");
    this.model = model;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(3000),
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
    this.controller = new AbortController();

    const systemContext = context ? buildContextMessage(context) : undefined;
    const ollamaMessages = [
      ...(systemContext ? [{ role: "system" as const, content: systemContext }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: ollamaMessages,
        stream: true,
      }),
      signal: this.controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
    }

    return streamNDJSON(res, onChunk);
  }

  abort(): void {
    this.controller?.abort();
    this.controller = null;
  }
}

/** Stream newline-delimited JSON from Ollama */
async function streamNDJSON(
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
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const text = obj.message?.content || "";
        full += text;
        onChunk?.({ text, done: obj.done || false });
      } catch {
        // skip malformed lines
      }
    }
  }

  return full;
}

function buildContextMessage(ctx: WorkspaceContext): string {
  const parts: string[] = [];

  if (ctx.workspaceRoot) {
    parts.push(`Workspace: ${ctx.workspaceRoot}`);
  }

  if (ctx.activeFile) {
    parts.push(`Current file: ${ctx.activeFile.path} (${ctx.activeFile.language})`);
    if (ctx.selection) {
      parts.push(
        `Selected text (lines ${ctx.selection.startLine}-${ctx.selection.endLine}):\n\`\`\`\n${ctx.selection.text}\n\`\`\``
      );
    } else {
      // Send first 200 lines to avoid overwhelming small models
      const lines = ctx.activeFile.content.split("\n");
      const truncated = lines.slice(0, 200).join("\n");
      parts.push(`File content:\n\`\`\`${ctx.activeFile.language}\n${truncated}\n\`\`\``);
    }
  }

  if (ctx.openFiles?.length) {
    parts.push(`Open files: ${ctx.openFiles.join(", ")}`);
  }

  return parts.join("\n\n");
}
