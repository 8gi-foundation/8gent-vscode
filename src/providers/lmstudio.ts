import type { Provider, ChatMessage, WorkspaceContext, StreamChunk } from "../types";

/** LM Studio provider - OpenAI-compatible local API */
export class LMStudioProvider implements Provider {
  readonly name = "lmstudio";
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
      const res = await fetch(`${this.endpoint}/v1/models`, {
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

    const systemMsg = context ? buildContextMessage(context) : undefined;
    const apiMessages = [
      ...(systemMsg ? [{ role: "system" as const, content: systemMsg }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model || undefined,
        messages: apiMessages,
        stream: true,
      }),
      signal: this.controller.signal,
    });

    if (!res.ok) {
      throw new Error(`LM Studio error: ${res.status} ${res.statusText}`);
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
