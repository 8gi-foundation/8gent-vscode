import type { WorkspaceContext } from "./types";

/** Build a system prompt for the coding assistant */
export function buildSystemPrompt(ctx?: WorkspaceContext): string {
  const parts: string[] = [];

  parts.push(`You are 8gent, a coding assistant running inside VS Code. You help the user understand, write, debug, and improve code.

Rules:
- Be concise. Prefer short, direct answers.
- When showing code, always use fenced code blocks with the language identifier.
- When suggesting changes, show the complete modified code block - not partial diffs.
- If the user asks about their current file or selection, reference the context provided below.
- When you reason through a problem, use <think>...</think> tags to show your reasoning, then give the final answer outside those tags.
- If you don't know something, say so. Don't guess at APIs or syntax.`);

  if (ctx?.workspaceRoot) {
    parts.push(`Workspace: ${ctx.workspaceRoot}`);
  }

  if (ctx?.activeFile) {
    parts.push(`Current file: ${ctx.activeFile.path} (${ctx.activeFile.language})`);
    if (ctx.selection) {
      parts.push(
        `Selected text (lines ${ctx.selection.startLine}-${ctx.selection.endLine}):\n\`\`\`${ctx.activeFile.language}\n${ctx.selection.text}\n\`\`\``
      );
    } else {
      // Send first 200 lines to avoid overwhelming small models
      const lines = ctx.activeFile.content.split("\n");
      const truncated = lines.slice(0, 200).join("\n");
      if (truncated.trim()) {
        parts.push(`File content:\n\`\`\`${ctx.activeFile.language}\n${truncated}\n\`\`\``);
      }
    }
  }

  if (ctx?.openFiles?.length) {
    parts.push(`Open tabs: ${ctx.openFiles.join(", ")}`);
  }

  return parts.join("\n\n");
}
