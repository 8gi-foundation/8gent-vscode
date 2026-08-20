# 8gent for VS Code

Local-first AI agent in your editor, for developers who want a coding assistant
that talks to a model on their own machine. Connects to Ollama, Apple Foundation
Model, LM Studio, OpenRouter, and your 8gent vessel.

Install the `.vsix` from a release, or build it yourself: `npm install && npm run package`,
then `code --install-extension 8gent-vscode-<version>.vsix`. Open the 8gent view in the
activity bar and start a chat. Works in VS Code, Cursor, Windsurf, and any VS Code fork.

## Features

- **Chat sidebar** - Ask questions about your code, get explanations, generate code
- **Workspace context** - Automatically includes your current file, selection, and open tabs
- **Local-first** - Ollama, LM Studio, Apple Foundation Model (M-series Mac) - no API keys, no cloud
- **Vessel connection** - Optionally connect to your 8gent vessel for 24/7 agent access
- **Cloud sync** - Sign in via 8gent.app for cross-device memory and context sync
- **Works everywhere** - VS Code, Cursor, Windsurf, any VS Code fork

## Providers

| Provider | Type | Setup |
|----------|------|-------|
| **Ollama** | Local | Install Ollama, pull a model. Default. |
| **LM Studio** | Local | Install LM Studio, load a model. |
| **Apple FM** | Local | M-series Mac + `apfel` CLI. |
| **Vessel** | Cloud | Deploy an 8gent vessel, set URL in settings. |
| **OpenRouter** | Cloud | Set API key in settings. `auto:free` uses free models. |

## Commands

- `8gent: New Chat` - Start a fresh conversation
- `8gent: Send Selection to Chat` - Send selected code to chat (Cmd+Shift+8, when there is a selection)
- `8gent: Focus Chat` - Jump to the chat view (Cmd+L)
- `8gent: Switch Provider` - Pick a different provider
- `8gent: Pick Model` - Pick a model on the current provider
- `8gent: Reconnect to Provider` - Reconnect to the current provider

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `8gent.provider` | `ollama` | Active provider |
| `8gent.ollama.endpoint` | `http://localhost:11434` | Ollama API URL |
| `8gent.ollama.model` | `qwen2.5-coder:7b` | Ollama model |
| `8gent.lmstudio.endpoint` | `http://localhost:1234` | LM Studio API URL |
| `8gent.lmstudio.model` | | LM Studio model (empty uses the loaded default) |
| `8gent.vessel.url` | | Vessel daemon WebSocket URL |
| `8gent.vessel.channel` | `app` | Session channel tag for the vessel |
| `8gent.openrouter.model` | `auto:free` | OpenRouter model id |
| `8gent.contextInjection` | `true` | Include current file, selection, and open tabs as context |
| `8gent.syncEnabled` | `false` | Cloud sync via 8gent.app (requires login) |

## Development

```bash
npm install
npm run watch    # dev mode with auto-rebuild
npm run build    # production build
npm run package  # create .vsix
```

## License

Apache 2.0
