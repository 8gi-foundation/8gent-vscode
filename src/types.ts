/** Message in a chat conversation */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

/** Workspace context injected with each prompt */
export interface WorkspaceContext {
  activeFile?: { path: string; language: string; content: string };
  selection?: { text: string; startLine: number; endLine: number };
  openFiles?: string[];
  workspaceRoot?: string;
  role?: "orchestrator" | "engineer" | "qa";
  customSystemPrompt?: string;
}

/** Streamed response chunk from a provider */
export interface StreamChunk {
  text: string;
  done: boolean;
}

/** Provider interface - all providers implement this */
export interface Provider {
  readonly name: string;
  readonly isLocal: boolean;

  /** Check if the provider is reachable */
  healthCheck(): Promise<boolean>;

  /** Send a prompt and stream the response */
  chat(
    messages: ChatMessage[],
    context?: WorkspaceContext,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<string>;

  /** Abort any in-flight request */
  abort(): void;
}

/** Vessel daemon event types */
export type VesselEvent =
  | { event: "agent:thinking"; payload: { sessionId: string } }
  | { event: "agent:stream"; payload: { sessionId: string; chunk: string; final?: boolean } }
  | { event: "tool:start"; payload: { sessionId: string; tool: string; input: unknown } }
  | { event: "tool:result"; payload: { sessionId: string; tool: string; output: string; durationMs: number } }
  | { event: "agent:error"; payload: { sessionId: string; error: string } }
  | { event: "approval:required"; payload: { sessionId: string; tool: string; input: unknown; requestId: string } }
  | { event: "session:end"; payload: { sessionId: string; reason: string } };
