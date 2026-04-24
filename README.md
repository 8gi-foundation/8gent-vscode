# 8gent for VS Code

Local-first AI agent in your editor. Connects to Ollama, Apple Foundation Model, LM Studio, and your 8gent vessel.

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
- `8gent: Send Selection to Chat` - Send selected code to chat (Cmd+Shift+8)
- `8gent: Switch Provider` - Pick a different AI provider
- `8gent: Reconnect` - Reconnect to current provider

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `8gent.provider` | `ollama` | Active provider |
| `8gent.ollama.endpoint` | `http://localhost:11434` | Ollama API URL |
| `8gent.ollama.model` | `qwen2.5-coder:7b` | Ollama model |
| `8gent.lmstudio.endpoint` | `http://localhost:1234` | LM Studio API URL |
| `8gent.vessel.url` | | Vessel WebSocket URL |
| `8gent.contextInjection` | `true` | Include workspace context |
| `8gent.syncEnabled` | `false` | Cloud sync via 8gent.app |

## Development

```bash
npm install
npm run watch    # dev mode with auto-rebuild
npm run build    # production build
npm run package  # create .vsix
```

## License

Apache 2.0
