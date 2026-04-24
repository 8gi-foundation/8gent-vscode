import * as vscode from "vscode";

/** Generate the chat webview HTML */
export function getChatHTML(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  providerName: string,
  providerLocal: boolean
): string {
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBarSectionHeader-background);
      flex-shrink: 0;
    }
    .header-title {
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-sideBarSectionHeader-foreground);
    }
    .provider-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .provider-badge.local { background: #1a7f37; color: #fff; }

    /* Messages */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 3px;
    }

    .message {
      padding: 8px 12px;
      border-radius: 6px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      max-width: 95%;
    }
    .message.user {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      align-self: flex-end;
    }
    .message.assistant {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      align-self: flex-start;
    }
    .message.system {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      align-self: center;
      font-style: italic;
    }
    .message.tool {
      font-size: 11px;
      font-family: var(--vscode-editor-font-family);
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-panel-border);
      padding: 4px 8px;
      border-radius: 4px;
    }

    .message code {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
    }
    .message pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 4px 0;
    }
    .message pre code {
      background: none;
      padding: 0;
    }

    .typing {
      display: inline-block;
      animation: blink 1s infinite;
    }
    @keyframes blink { 50% { opacity: 0.3; } }

    /* Empty state */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--vscode-descriptionForeground);
      padding: 24px;
      text-align: center;
    }
    .empty-state .logo { font-size: 32px; opacity: 0.4; font-weight: 700; }
    .empty-state p { font-size: 12px; max-width: 220px; }

    /* Input */
    .input-area {
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
    }
    .input-wrap {
      display: flex;
      gap: 6px;
      align-items: flex-end;
    }
    textarea {
      flex: 1;
      resize: none;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      padding: 6px 8px;
      border-radius: 4px;
      min-height: 32px;
      max-height: 120px;
      outline: none;
    }
    textarea:focus { border-color: var(--vscode-focusBorder); }
    textarea::placeholder { color: var(--vscode-input-placeholderForeground); }

    button.send {
      padding: 6px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
    }
    button.send:hover { background: var(--vscode-button-hoverBackground); }
    button.send:disabled { opacity: 0.5; cursor: default; }
  </style>
</head>
<body>
  <div class="header">
    <span class="header-title">8gent Chat</span>
    <span class="provider-badge ${providerLocal ? "local" : ""}">${providerName}</span>
  </div>

  <div id="messages" class="messages">
    <div class="empty-state">
      <div class="logo">8</div>
      <p>Ask anything. Your code, your editor, your local models.</p>
    </div>
  </div>

  <div class="input-area">
    <div class="input-wrap">
      <textarea id="input" rows="1" placeholder="Ask 8gent..." autofocus></textarea>
      <button class="send" id="sendBtn">Send</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');

    let emptyState = true;
    let streaming = false;
    let currentAssistantEl = null;

    function clearEmptyState() {
      if (emptyState) {
        messagesEl.innerHTML = '';
        emptyState = false;
      }
    }

    function addMessage(role, text) {
      clearEmptyState();
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function send() {
      const text = inputEl.value.trim();
      if (!text || streaming) return;

      addMessage('user', text);
      inputEl.value = '';
      inputEl.style.height = 'auto';

      streaming = true;
      sendBtn.disabled = true;
      currentAssistantEl = addMessage('assistant', '');
      currentAssistantEl.innerHTML = '<span class="typing">...</span>';

      vscode.postMessage({ type: 'chat', text });
    }

    sendBtn.addEventListener('click', send);

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    // Auto-resize textarea
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const msg = event.data;

      switch (msg.type) {
        case 'stream': {
          if (currentAssistantEl) {
            if (currentAssistantEl.querySelector('.typing')) {
              currentAssistantEl.textContent = '';
            }
            currentAssistantEl.textContent += msg.text;
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
          break;
        }
        case 'done': {
          streaming = false;
          sendBtn.disabled = false;
          currentAssistantEl = null;
          inputEl.focus();
          break;
        }
        case 'error': {
          streaming = false;
          sendBtn.disabled = false;
          if (currentAssistantEl) {
            currentAssistantEl.remove();
            currentAssistantEl = null;
          }
          addMessage('system', msg.text);
          inputEl.focus();
          break;
        }
        case 'tool': {
          clearEmptyState();
          const div = document.createElement('div');
          div.className = 'message tool';
          div.textContent = msg.text;
          messagesEl.appendChild(div);
          messagesEl.scrollTop = messagesEl.scrollHeight;
          break;
        }
        case 'inject': {
          // Inject text into input (from sendSelection command)
          inputEl.value = msg.text;
          inputEl.style.height = 'auto';
          inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
          inputEl.focus();
          break;
        }
        case 'providerChanged': {
          const badge = document.querySelector('.provider-badge');
          if (badge) {
            badge.textContent = msg.name;
            badge.className = 'provider-badge' + (msg.local ? ' local' : '');
          }
          addMessage('system', 'Switched to ' + msg.name);
          break;
        }
      }
    });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
