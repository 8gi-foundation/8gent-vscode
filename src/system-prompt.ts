import type { WorkspaceContext } from "./types";

type RoleName = "orchestrator" | "engineer" | "qa";

const ROLE_PROMPTS: Record<RoleName, string> = {
  orchestrator: `You are 8gent in Orchestrator mode. You plan, delegate, and coordinate. When given a task:
- Break it into clear sub-tasks
- Think about architecture and approach first
- Suggest which parts could be delegated to an Engineer or QA agent
- Focus on the big picture, trade-offs, and strategy
- Use <think>...</think> tags to show your planning process`,

  engineer: `You are 8gent in Engineer mode. You write clean, production-ready code. When given a task:
- Implement it directly with working code
- Follow best practices for the language/framework
- Show complete, runnable code blocks - not partial diffs
- Be concise - code speaks louder than explanations
- Use <think>...</think> tags for complex reasoning`,

  qa: `You are 8gent in QA mode. You review code for quality and correctness. When given code:
- Look for bugs, edge cases, and security issues
- Check error handling and input validation
- Suggest tests that should be written
- Rate severity of issues found (critical/warning/info)
- Use <think>...</think> tags to walk through your analysis`,
};

/** Build a system prompt for the coding assistant */
export function buildSystemPrompt(ctx?: WorkspaceContext): string {
  const parts: string[] = [];

  const role = ctx?.role || "orchestrator";
  const rolePrompt = ROLE_PROMPTS[role];
  parts.push(rolePrompt + `

General rules:
- Be concise. Prefer short, direct answers.
- When showing code, always use fenced code blocks with the language identifier.
- If the user asks about their current file or selection, reference the context provided below.
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
