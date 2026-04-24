import * as vscode from "vscode";

/** Generate the chat webview HTML */
export function getChatHTML(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  providerName: string,
  providerLocal: boolean,
  modelName?: string
): string {
  const nonce = getNonce();
  const modelLabel = modelName ? ` (${modelName})` : "";

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

    /* ---- Header ---- */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBarSectionHeader-background);
      flex-shrink: 0;
    }
    .header-left { display: flex; align-items: center; gap: 6px; }
    .header-title {
      font-weight: 700;
      font-size: 12px;
      color: var(--vscode-sideBarSectionHeader-foreground);
    }
    .header-right { display: flex; align-items: center; gap: 3px; }
    .provider-badge {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 3px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      cursor: pointer;
      border: none;
      font-family: var(--vscode-font-family);
      transition: opacity 0.15s;
    }
    .provider-badge:hover { opacity: 0.8; }
    .provider-badge.local { background: #1a7f37; color: #fff; }
    .icon-btn {
      width: 24px; height: 24px;
      display: flex; align-items: center; justify-content: center;
      border: none; background: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer; border-radius: 4px; font-size: 14px;
    }
    .icon-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-foreground);
    }

    /* ---- Messages ---- */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      scroll-behavior: smooth;
    }
    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 3px;
    }

    /* Scroll-to-bottom */
    .scroll-bottom {
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 12px;
      padding: 4px 12px;
      font-size: 10px;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
      z-index: 10;
    }
    .scroll-bottom.visible { opacity: 1; pointer-events: auto; }

    /* Message container */
    .msg-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-width: 95%;
    }
    .msg-wrap.user { align-self: flex-end; }
    .msg-wrap.assistant { align-self: flex-start; }

    .message {
      padding: 8px 12px;
      border-radius: 8px;
      line-height: 1.55;
      word-break: break-word;
      font-size: 13px;
    }
    .message.user {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
    }
    .message.assistant {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
    }
    .message.system {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      align-self: center;
      font-style: italic;
      padding: 4px 0;
    }

    /* Markdown in assistant messages */
    .message.assistant p { margin: 4px 0; }
    .message.assistant strong { color: var(--vscode-foreground); }
    .message.assistant em { font-style: italic; }
    .message.assistant ul, .message.assistant ol { padding-left: 18px; margin: 4px 0; }
    .message.assistant li { margin: 2px 0; }
    .message.assistant h1, .message.assistant h2, .message.assistant h3 {
      font-size: 13px; font-weight: 700; margin: 8px 0 4px; color: var(--vscode-foreground);
    }
    .message.assistant h1 { font-size: 15px; }
    .message.assistant h2 { font-size: 14px; }
    .message.assistant a {
      color: var(--vscode-textLink-foreground);
      text-decoration: underline;
    }

    /* Code blocks */
    .code-block-wrap {
      position: relative;
      margin: 6px 0;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--vscode-panel-border);
    }
    .code-block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 8px;
      background: var(--vscode-editorGroupHeader-tabsBackground);
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }
    .code-block-header .lang { font-weight: 600; text-transform: uppercase; }
    .copy-btn {
      border: none; background: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer; font-size: 10px;
      padding: 2px 6px; border-radius: 3px;
    }
    .copy-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-foreground);
    }
    .copy-btn.copied { color: #1a7f37; }
    pre.code-block {
      margin: 0;
      padding: 10px 12px;
      background: var(--vscode-textCodeBlock-background);
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.5;
      color: var(--vscode-editor-foreground);
    }
    code.inline {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 5px;
      border-radius: 3px;
    }

    /* Message actions */
    .msg-actions {
      display: flex;
      gap: 2px;
      opacity: 0;
      transition: opacity 0.15s;
      padding: 0 4px;
    }
    .msg-wrap:hover .msg-actions { opacity: 1; }
    .msg-action-btn {
      border: none; background: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer; font-size: 10px;
      padding: 2px 6px; border-radius: 3px;
    }
    .msg-action-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-foreground);
    }

    /* Thinking indicator */
    .thinking {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
    }
    .thinking-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--vscode-descriptionForeground);
      animation: pulse 1.4s ease-in-out infinite;
    }
    .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
    .thinking-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }

    /* Context pills */
    .context-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px 0;
    }
    .context-pill {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 10px;
      cursor: default;
    }
    .context-pill .remove {
      cursor: pointer;
      opacity: 0.6;
      font-size: 12px;
    }
    .context-pill .remove:hover { opacity: 1; }

    /* Response meta */
    .response-meta {
      font-size: 9px;
      color: var(--vscode-descriptionForeground);
      padding: 0 4px;
      opacity: 0.7;
    }

    /* Empty state */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: var(--vscode-descriptionForeground);
      padding: 24px;
      text-align: center;
    }
    .empty-state .logo {
      font-size: 40px;
      opacity: 0.2;
      font-weight: 800;
      font-family: var(--vscode-editor-font-family);
    }
    .empty-state p { font-size: 12px; max-width: 240px; line-height: 1.5; }
    .empty-state .shortcuts {
      font-size: 10px;
      opacity: 0.5;
      margin-top: 8px;
      line-height: 1.8;
    }
    .kbd {
      background: var(--vscode-keybindingLabel-background);
      border: 1px solid var(--vscode-keybindingLabel-border);
      border-bottom: 2px solid var(--vscode-keybindingLabel-border);
      border-radius: 3px;
      padding: 1px 4px;
      font-size: 9px;
      font-family: var(--vscode-editor-font-family);
    }

    /* ---- Input area ---- */
    .input-area {
      padding: 8px 10px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
    }
    .input-wrap {
      display: flex;
      gap: 6px;
      align-items: flex-end;
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      background: var(--vscode-input-background);
      padding: 4px;
    }
    .input-wrap:focus-within { border-color: var(--vscode-focusBorder); }
    textarea {
      flex: 1;
      resize: none;
      border: none;
      background: transparent;
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      padding: 4px 6px;
      min-height: 24px;
      max-height: 120px;
      outline: none;
      line-height: 1.4;
    }
    textarea::placeholder { color: var(--vscode-input-placeholderForeground); }

    .action-btn {
      width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      border: none; border-radius: 4px;
      cursor: pointer; font-size: 14px;
      flex-shrink: 0;
      transition: background 0.15s, color 0.15s;
    }
    .send-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .send-btn:hover { background: var(--vscode-button-hoverBackground); }
    .send-btn:disabled { opacity: 0.4; cursor: default; }
    .stop-btn {
      background: #c53030;
      color: #fff;
    }
    .stop-btn:hover { background: #e53e3e; }

    .input-hint {
      font-size: 9px;
      color: var(--vscode-descriptionForeground);
      padding: 3px 6px 0;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <span class="header-title">8gent</span>
    </div>
    <div class="header-right">
      <button class="provider-badge ${providerLocal ? "local" : ""}" id="providerBtn" title="Click to switch provider">${providerName}${modelLabel}</button>
      <button class="icon-btn" id="newChatBtn" title="New chat">+</button>
    </div>
  </div>

  <div style="position: relative; flex: 1; display: flex; flex-direction: column; overflow: hidden;">
    <div id="messages" class="messages">
      <div class="empty-state">
        <div class="logo">8</div>
        <p>Ask anything about your code. Uses your local models - no API keys needed.</p>
        <div class="shortcuts">
          <span class="kbd">Enter</span> send
          <span class="kbd">Shift+Enter</span> newline<br>
          <span class="kbd">Cmd+Shift+8</span> send selection
        </div>
      </div>
    </div>
    <button class="scroll-bottom" id="scrollBottom">Scroll to bottom</button>
  </div>

  <div class="input-area">
    <div id="contextPills" class="context-pills" style="display:none;"></div>
    <div class="input-wrap">
      <textarea id="input" rows="1" placeholder="Ask 8gent..." autofocus></textarea>
      <button class="action-btn send-btn" id="actionBtn" title="Send (Enter)">
        <span id="actionIcon">\u2191</span>
      </button>
    </div>
    <div class="input-hint">
      <span id="statusHint">Ready</span>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const actionBtn = document.getElementById('actionBtn');
    const actionIcon = document.getElementById('actionIcon');
    const providerBtn = document.getElementById('providerBtn');
    const newChatBtn = document.getElementById('newChatBtn');
    const scrollBottomBtn = document.getElementById('scrollBottom');
    const contextPillsEl = document.getElementById('contextPills');
    const statusHint = document.getElementById('statusHint');

    let emptyState = true;
    let streaming = false;
    let currentAssistantEl = null;
    let startTime = 0;
    let contextItems = [];

    // ---- Scroll to bottom ----
    messagesEl.addEventListener('scroll', () => {
      const gap = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
      scrollBottomBtn.classList.toggle('visible', gap > 100);
    });
    scrollBottomBtn.addEventListener('click', () => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });

    // ---- Provider badge ----
    providerBtn.addEventListener('click', () => vscode.postMessage({ type: 'switchProvider' }));
    newChatBtn.addEventListener('click', () => vscode.postMessage({ type: 'newChat' }));

    // ---- Helpers ----
    function clearEmptyState() {
      if (emptyState) { messagesEl.innerHTML = ''; emptyState = false; }
    }

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setStreaming(active) {
      streaming = active;
      if (active) {
        actionBtn.className = 'action-btn stop-btn';
        actionBtn.title = 'Stop (Esc)';
        actionIcon.textContent = '\\u25A0'; // square stop
        statusHint.textContent = 'Generating...';
        startTime = Date.now();
      } else {
        actionBtn.className = 'action-btn send-btn';
        actionBtn.title = 'Send (Enter)';
        actionIcon.textContent = '\\u2191'; // up arrow
        actionBtn.disabled = false;
      }
    }

    // ---- Markdown rendering ----
    function renderMarkdown(text) {
      // Code blocks
      text = text.replace(/\`\`\`(\\w*)?\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
        const langLabel = lang || 'code';
        const escaped = escapeHtml(code.trim());
        return '<div class="code-block-wrap"><div class="code-block-header"><span class="lang">' + langLabel + '</span><button class="copy-btn" onclick="copyCode(this)">Copy</button></div><pre class="code-block"><code>' + escaped + '</code></pre></div>';
      });
      // Inline code
      text = text.replace(/\`([^\`]+)\`/g, '<code class="inline">$1</code>');
      // Bold
      text = text.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      // Italic
      text = text.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
      // Headers
      text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
      // Lists
      text = text.replace(/^- (.+)$/gm, '<li>$1</li>');
      text = text.replace(/(<li>.*<\\/li>)/gs, '<ul>$1</ul>');
      // Fix duplicate nested ul
      text = text.replace(/<\\/ul>\\s*<ul>/g, '');
      // Paragraphs (double newline)
      text = text.replace(/\\n\\n/g, '</p><p>');
      // Single newlines to <br> (but not inside pre/code)
      text = text.replace(/(?<!<\\/?[^>]+)\\n/g, '<br>');
      return '<p>' + text + '</p>';
    }

    function escapeHtml(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ---- Copy code ----
    window.copyCode = function(btn) {
      const code = btn.closest('.code-block-wrap').querySelector('code').textContent;
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      });
    };

    // ---- Messages ----
    function addMessage(role, text, opts) {
      clearEmptyState();
      const wrap = document.createElement('div');
      wrap.className = 'msg-wrap ' + role;

      const msg = document.createElement('div');
      msg.className = 'message ' + role;

      if (role === 'assistant' && opts && opts.html) {
        msg.innerHTML = text;
      } else if (role === 'system') {
        msg.textContent = text;
        messagesEl.appendChild(msg);
        scrollToBottom();
        return msg;
      } else {
        msg.textContent = text;
      }

      wrap.appendChild(msg);

      // Actions bar
      if (role !== 'system') {
        const actions = document.createElement('div');
        actions.className = 'msg-actions';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'msg-action-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => {
          const raw = msg.getAttribute('data-raw') || msg.textContent;
          navigator.clipboard.writeText(raw).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
          });
        };
        actions.appendChild(copyBtn);

        if (role === 'user') {
          const retryBtn = document.createElement('button');
          retryBtn.className = 'msg-action-btn';
          retryBtn.textContent = 'Retry';
          retryBtn.onclick = () => {
            inputEl.value = msg.textContent;
            inputEl.focus();
          };
          actions.appendChild(retryBtn);
        }

        wrap.appendChild(actions);
      }

      messagesEl.appendChild(wrap);
      scrollToBottom();
      return msg;
    }

    function addThinking() {
      clearEmptyState();
      const wrap = document.createElement('div');
      wrap.className = 'msg-wrap assistant';
      wrap.id = 'thinking-indicator';
      const msg = document.createElement('div');
      msg.className = 'message assistant';
      msg.innerHTML = '<div class="thinking"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div>';
      wrap.appendChild(msg);
      messagesEl.appendChild(wrap);
      scrollToBottom();
      return msg;
    }

    function removeThinking() {
      const el = document.getElementById('thinking-indicator');
      if (el) el.remove();
    }

    // ---- Send / Stop ----
    function send() {
      const text = inputEl.value.trim();
      if (!text) return;

      if (streaming) {
        // Stop
        vscode.postMessage({ type: 'stop' });
        return;
      }

      addMessage('user', text);
      inputEl.value = '';
      inputEl.style.height = 'auto';
      clearContextPills();

      setStreaming(true);
      addThinking();

      vscode.postMessage({ type: 'chat', text });
    }

    actionBtn.addEventListener('click', send);

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
      if (e.key === 'Escape' && streaming) {
        vscode.postMessage({ type: 'stop' });
      }
    });

    // Auto-resize
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });

    // ---- Context pills ----
    function addContextPill(label, removable) {
      contextPillsEl.style.display = 'flex';
      const pill = document.createElement('div');
      pill.className = 'context-pill';
      pill.innerHTML = label + (removable ? ' <span class="remove" onclick="this.parentElement.remove(); updatePillVisibility();">x</span>' : '');
      contextPillsEl.appendChild(pill);
    }
    function clearContextPills() {
      contextPillsEl.innerHTML = '';
      contextPillsEl.style.display = 'none';
    }
    window.updatePillVisibility = function() {
      if (!contextPillsEl.children.length) contextPillsEl.style.display = 'none';
    };

    // ---- Handle messages from extension ----
    let rawAssistantText = '';

    window.addEventListener('message', (event) => {
      const msg = event.data;

      switch (msg.type) {
        case 'stream': {
          removeThinking();
          if (!currentAssistantEl) {
            rawAssistantText = '';
            currentAssistantEl = addMessage('assistant', '', { html: true });
          }
          rawAssistantText += msg.text;
          currentAssistantEl.innerHTML = renderMarkdown(rawAssistantText);
          currentAssistantEl.setAttribute('data-raw', rawAssistantText);
          scrollToBottom();
          break;
        }
        case 'done': {
          removeThinking();
          setStreaming(false);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          statusHint.textContent = 'Done in ' + elapsed + 's';
          // Add response meta
          if (currentAssistantEl && currentAssistantEl.parentElement) {
            const meta = document.createElement('div');
            meta.className = 'response-meta';
            meta.textContent = elapsed + 's';
            if (msg.tokens) meta.textContent += ' - ' + msg.tokens + ' tokens';
            currentAssistantEl.parentElement.appendChild(meta);
          }
          currentAssistantEl = null;
          rawAssistantText = '';
          inputEl.focus();
          break;
        }
        case 'error': {
          removeThinking();
          setStreaming(false);
          statusHint.textContent = 'Error';
          if (currentAssistantEl && currentAssistantEl.parentElement) {
            currentAssistantEl.parentElement.remove();
          }
          currentAssistantEl = null;
          rawAssistantText = '';
          addMessage('system', msg.text);
          inputEl.focus();
          break;
        }
        case 'tool': {
          clearEmptyState();
          addMessage('system', '> ' + msg.text);
          break;
        }
        case 'inject': {
          inputEl.value = msg.text;
          inputEl.style.height = 'auto';
          inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
          inputEl.focus();
          if (msg.file) addContextPill(msg.file, true);
          break;
        }
        case 'context': {
          addContextPill(msg.label, true);
          break;
        }
        case 'providerChanged': {
          providerBtn.textContent = msg.name + (msg.model ? ' (' + msg.model + ')' : '');
          providerBtn.className = 'provider-badge' + (msg.local ? ' local' : '');
          addMessage('system', 'Switched to ' + msg.name + (msg.model ? ' - ' + msg.model : ''));
          statusHint.textContent = 'Ready';
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
