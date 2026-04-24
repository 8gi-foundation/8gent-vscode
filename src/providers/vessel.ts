import * as vscode from "vscode";
import type { Provider, ChatMessage, WorkspaceContext, StreamChunk, VesselEvent } from "../types";

/**
 * Vessel provider - connects to 8gent daemon via WebSocket.
 * Follows the Daemon Protocol v1.0 spec.
 * Supports both local daemon (ws://localhost:18789) and remote vessel.
 */
export class VesselProvider implements Provider {
  readonly name = "vessel";
  readonly isLocal = false;

  private url: string;
  private channel: string;
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private authToken: string | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(url: string, channel: string) {
    this.url = url;
    this.channel = channel;
  }

  /** Load auth token from VS Code SecretStorage */
  async loadAuth(secrets: vscode.SecretStorage): Promise<void> {
    this.authToken = (await secrets.get("8gent.vessel.token")) || null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.url) return false;
    try {
      // Try HTTP health endpoint
      const httpUrl = this.url.replace(/^ws/, "http").replace(/\/$/, "");
      const res = await fetch(`${httpUrl}/health`, {
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
    await this.ensureConnected();

    // Build prompt from last user message + context
    const lastUser = messages.filter((m) => m.role === "user").pop();
    if (!lastUser) throw new Error("No user message");

    let prompt = lastUser.content;
    if (context?.activeFile) {
      const ctxParts = [`[File: ${context.activeFile.path}]`];
      if (context.selection) {
        ctxParts.push(`[Selection L${context.selection.startLine}-${context.selection.endLine}]:\n${context.selection.text}`);
      }
      prompt = ctxParts.join("\n") + "\n\n" + prompt;
    }

    return new Promise<string>((resolve, reject) => {
      if (!this.ws) return reject(new Error("Not connected to vessel"));

      let full = "";
      const handler = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(String(event.data));

          if (msg.type === "event") {
            const ve = msg as { type: "event" } & VesselEvent;
            switch (ve.event) {
              case "agent:stream": {
                const text = ve.payload.chunk || "";
                full += text;
                onChunk?.({ text, done: ve.payload.final || false });
                if (ve.payload.final) {
                  this.ws?.removeEventListener("message", handler);
                  resolve(full);
                }
                break;
              }
              case "agent:error":
                this.ws?.removeEventListener("message", handler);
                reject(new Error(ve.payload.error));
                break;
              case "tool:start":
                onChunk?.({ text: `\n[tool: ${ve.payload.tool}]\n`, done: false });
                break;
              case "session:end":
                this.ws?.removeEventListener("message", handler);
                if (!full) resolve("(session ended)");
                else resolve(full);
                break;
            }
          } else if (msg.type === "error") {
            this.ws?.removeEventListener("message", handler);
            reject(new Error(msg.message));
          }
        } catch {
          // skip parse errors
        }
      };

      this.ws.addEventListener("message", handler);
      this.ws.send(JSON.stringify({ type: "prompt", text: prompt }));
    });
  }

  abort(): void {
    // Can't abort a vessel prompt mid-flight yet - close and reconnect
    this.disconnect();
  }

  private async ensureConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.sessionId) return;
    await this.connect();
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      const timeout = setTimeout(() => {
        reject(new Error("Vessel connection timeout"));
        this.ws?.close();
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);

        // Auth if we have a token
        if (this.authToken) {
          this.ws!.send(JSON.stringify({ type: "auth", token: this.authToken }));
        }

        // Create session
        this.ws!.send(JSON.stringify({ type: "session:create", channel: this.channel }));

        // Start keepalive
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type === "session:created") {
            this.sessionId = msg.sessionId;
            resolve();
          } else if (msg.type === "auth:fail") {
            reject(new Error("Vessel authentication failed"));
          }
        } catch {
          // handled by chat handler
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Failed to connect to vessel at ${this.url}`));
      };

      this.ws.onclose = () => {
        clearTimeout(timeout);
        this.sessionId = null;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
      };
    });
  }

  private disconnect(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.ws?.close();
    this.ws = null;
    this.sessionId = null;
  }
}
