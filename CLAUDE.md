# CLAUDE.md

## Project

8gent VS Code Extension - local-first AI agent sidebar for VS Code and clones (Cursor, Windsurf, etc.).

- **Runtime:** Node.js (VS Code extension host)
- **Build:** esbuild, single-file bundle
- **Language:** TypeScript
- **License:** Apache 2.0

## Architecture

```
src/
  extension.ts          # Entry point - activation, commands, webview provider
  types.ts              # Shared types (Provider, ChatMessage, WorkspaceContext)
  context.ts            # Workspace context gathering (active file, selection, open tabs)
  providers/
    index.ts            # Provider factory, auto-detect, quick-pick
    ollama.ts           # Ollama local provider (NDJSON streaming)
    lmstudio.ts         # LM Studio provider (OpenAI-compatible SSE)
    apfel.ts            # Apple Foundation Model via apfel CLI
    vessel.ts           # 8gent vessel daemon (WebSocket, Daemon Protocol v1.0)
  webview/
    chat-html.ts        # Chat UI HTML generation (inline CSS + JS, CSP-safe)
```

## Commands

```bash
npm install             # install deps
npm run build           # production bundle
npm run watch           # dev mode
npm run lint            # type-check
npm run package         # create .vsix
```

## Prohibitions

Same as 8gent-code:
1. No em dashes
2. No purple/pink/violet
3. No secrets in chat
4. No AI vendor traces in commits
