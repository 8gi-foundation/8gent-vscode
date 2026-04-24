import { execFile } from "child_process";
import { promisify } from "util";
import type { Provider, ChatMessage, WorkspaceContext, StreamChunk } from "../types";

const execFileAsync = promisify(execFile);

/**
 * Apple Foundation Model provider - M-series Mac only.
 * Uses the `apfel` CLI bridge to Apple's on-device model.
 * Falls back gracefully if apfel isn't installed or not on Apple Silicon.
 */
export class ApfelProvider implements Provider {
  readonly name = "apfel";
  readonly isLocal = true;

  private proc: ReturnType<typeof import("child_process").spawn> | null = null;

  async healthCheck(): Promise<boolean> {
    try {
      // Check if apfel CLI exists and we're on Apple Silicon
      const { stdout } = await execFileAsync("which", ["apfel"]);
      if (!stdout.trim()) return false;

      const { stdout: arch } = await execFileAsync("uname", ["-m"]);
      return arch.trim() === "arm64";
    } catch {
      return false;
    }
  }

  async chat(
    messages: ChatMessage[],
    context?: WorkspaceContext,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<string> {
    const { spawn } = await import("child_process");

    // Build the prompt from messages
    const prompt = buildPrompt(messages, context);

    return new Promise((resolve, reject) => {
      // apfel chat --prompt "..." streams output to stdout
      this.proc = spawn("apfel", ["chat", "--prompt", prompt], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let full = "";

      this.proc.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        full += text;
        onChunk?.({ text, done: false });
      });

      this.proc.stderr?.on("data", (data: Buffer) => {
        // apfel may write status to stderr - ignore unless it's an actual error
        const msg = data.toString();
        if (msg.includes("error") || msg.includes("Error")) {
          reject(new Error(`apfel: ${msg}`));
        }
      });

      this.proc.on("close", (code) => {
        this.proc = null;
        if (code === 0) {
          onChunk?.({ text: "", done: true });
          resolve(full);
        } else {
          reject(new Error(`apfel exited with code ${code}`));
        }
      });

      this.proc.on("error", (err) => {
        this.proc = null;
        reject(err);
      });
    });
  }

  abort(): void {
    if (this.proc) {
      this.proc.kill("SIGTERM");
      this.proc = null;
    }
  }
}

function buildPrompt(messages: ChatMessage[], context?: WorkspaceContext): string {
  const parts: string[] = [];

  if (context?.activeFile) {
    parts.push(`[Context: ${context.activeFile.path}]`);
    if (context.selection) {
      parts.push(`Selected code:\n${context.selection.text}`);
    }
  }

  // Include last few messages for conversational context
  const recent = messages.slice(-6);
  for (const msg of recent) {
    if (msg.role === "user") {
      parts.push(`User: ${msg.content}`);
    } else if (msg.role === "assistant") {
      parts.push(`Assistant: ${msg.content}`);
    }
  }

  return parts.join("\n\n");
}
