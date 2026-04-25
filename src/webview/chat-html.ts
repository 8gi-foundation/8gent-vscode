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
      animation: msgIn 0.2s ease-out;
    }
    @keyframes msgIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
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
      tab-size: 2;
    }
    /* Syntax highlighting using VS Code theme colors */
    .tok-kw { color: var(--vscode-debugTokenExpression-name, #569cd6); }
    .tok-str { color: var(--vscode-debugTokenExpression-string, #ce9178); }
    .tok-num { color: var(--vscode-debugTokenExpression-number, #b5cea8); }
    .tok-cm { color: var(--vscode-descriptionForeground); opacity: 0.7; font-style: italic; }
    .tok-fn { color: var(--vscode-symbolIcon-functionForeground, #dcdcaa); }
    .tok-ty { color: var(--vscode-symbolIcon-classForeground, #4ec9b0); }
    .tok-op { color: var(--vscode-descriptionForeground); }
    .tok-prop { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); }
    /* Apply button on code blocks */
    .apply-btn, .diff-btn {
      border: none; background: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer; font-size: 10px;
      padding: 2px 6px; border-radius: 3px;
      margin-left: 2px;
    }
    .apply-btn:hover, .diff-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-foreground);
    }
    .apply-btn.applied { color: #1a7f37; }
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

    /* Model thinking blocks (<think> from qwen3, deepseek, etc.) */
    .think-block {
      margin: 6px 0;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
      overflow: hidden;
    }
    .think-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      background: var(--vscode-editorGroupHeader-tabsBackground);
      cursor: pointer;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      user-select: none;
    }
    .think-header:hover { color: var(--vscode-foreground); }
    .think-chevron {
      font-size: 10px;
      transition: transform 0.2s;
      display: inline-block;
    }
    .think-block.collapsed .think-chevron { transform: rotate(-90deg); }
    .think-body {
      padding: 8px 12px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-textCodeBlock-background);
      max-height: 300px;
      overflow-y: auto;
      transition: max-height 0.2s ease;
    }
    .think-block.collapsed .think-body { display: none; }
    .think-body p { margin: 3px 0; }

    /* Streaming cursor */
    .streaming-cursor {
      display: inline-block;
      width: 2px;
      height: 1em;
      background: var(--vscode-editorCursor-foreground, var(--vscode-foreground));
      margin-left: 2px;
      vertical-align: text-bottom;
      animation: blink 1s step-end infinite;
    }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

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
    /* Quick action buttons */
    .quick-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      margin-top: 8px;
      max-width: 280px;
    }
    .quick-btn {
      font-size: 11px;
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-foreground);
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .quick-btn:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
    }
    /* Markdown tables */
    .message.assistant table {
      border-collapse: collapse;
      margin: 6px 0;
      font-size: 12px;
      width: 100%;
    }
    .message.assistant th, .message.assistant td {
      border: 1px solid var(--vscode-panel-border);
      padding: 4px 8px;
      text-align: left;
    }
    .message.assistant th {
      background: var(--vscode-editorGroupHeader-tabsBackground);
      font-weight: 600;
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
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .input-wrap:focus-within {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 0 0 1px var(--vscode-focusBorder);
    }
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

    /* @mention autocomplete */
    .mention-list, .slash-list {
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      max-height: 200px;
      overflow-y: auto;
      background: var(--vscode-editorSuggestWidget-background);
      border: 1px solid var(--vscode-editorSuggestWidget-border);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 100;
      display: none;
    }
    .mention-list.visible, .slash-list.visible { display: block; }
    .mention-item {
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--vscode-editorSuggestWidget-foreground);
    }
    .mention-item:hover, .mention-item.selected {
      background: var(--vscode-editorSuggestWidget-selectedBackground);
      color: var(--vscode-editorSuggestWidget-highlightForeground, var(--vscode-foreground));
    }
    .mention-item .icon {
      font-size: 10px;
      opacity: 0.6;
      width: 14px;
      text-align: center;
    }
    .mention-item .path {
      opacity: 0.5;
      margin-left: auto;
      font-size: 10px;
    }

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
      <button class="icon-btn" id="exportBtn" title="Export chat as Markdown">\u21E9</button>
      <button class="icon-btn" id="newChatBtn" title="New chat">+</button>
      <button class="icon-btn" id="settingsBtn" title="Settings">\u2699</button>
    </div>
  </div>

  <div style="position: relative; flex: 1; display: flex; flex-direction: column; overflow: hidden;">
    <div id="messages" class="messages">
      <div class="empty-state">
        <div class="logo">8</div>
        <p>Ask anything about your code. Uses your local models - no API keys needed.</p>
        <div class="quick-actions">
          <button class="quick-btn" onclick="quickAction('Explain this code')">Explain code</button>
          <button class="quick-btn" onclick="quickAction('Find bugs in this code')">Find bugs</button>
          <button class="quick-btn" onclick="quickAction('Add tests for this code')">Add tests</button>
          <button class="quick-btn" onclick="quickAction('Refactor this code for readability')">Refactor</button>
          <button class="quick-btn" onclick="quickAction('Add TypeScript types to this code')">Add types</button>
          <button class="quick-btn" onclick="quickAction('Add documentation comments to this code')">Add docs</button>
        </div>
        <div class="shortcuts">
          <span class="kbd">Enter</span> send
          <span class="kbd">Shift+Enter</span> newline
          <span class="kbd">Cmd+L</span> focus<br>
          <span class="kbd">Cmd+Shift+8</span> send selection
          <span class="kbd">@</span> mention file
        </div>
      </div>
    </div>
    <button class="scroll-bottom" id="scrollBottom">Scroll to bottom</button>
  </div>

  <div class="input-area">
    <div id="contextPills" class="context-pills" style="display:none;"></div>
    <div style="position: relative;">
      <div class="mention-list" id="mentionList"></div>
      <div class="slash-list" id="slashList"></div>
    </div>
    <div class="input-wrap">
      <textarea id="input" rows="1" placeholder="Ask 8gent... (@ for files, / for commands)" autofocus></textarea>
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
    let wordCount = 0;

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
    document.getElementById('settingsBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
    });
    document.getElementById('exportBtn').addEventListener('click', () => {
      // Build markdown from visible messages
      const msgs = messagesEl.querySelectorAll('.msg-wrap');
      if (!msgs.length || emptyState) return;
      let md = '# 8gent Chat Export\\n\\n';
      msgs.forEach(wrap => {
        const msg = wrap.querySelector('.message');
        if (!msg) return;
        const raw = msg.getAttribute('data-raw') || msg.textContent;
        if (wrap.classList.contains('user')) {
          md += '## User\\n\\n' + raw + '\\n\\n';
        } else {
          md += '## Assistant\\n\\n' + raw + '\\n\\n';
        }
      });
      navigator.clipboard.writeText(md).then(() => {
        const btn = document.getElementById('exportBtn');
        btn.textContent = '\\u2713';
        setTimeout(() => { btn.textContent = '\\u21E9'; }, 1500);
      });
    });

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
        wordCount = 0;
      } else {
        actionBtn.className = 'action-btn send-btn';
        actionBtn.title = 'Send (Enter)';
        actionIcon.textContent = '\\u2191'; // up arrow
        actionBtn.disabled = false;
      }
    }

    // ---- Syntax highlighting (lightweight, no deps) ----
    const KEYWORDS = new Set(['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','new','class','extends','import','export','from','default','async','await','try','catch','finally','throw','typeof','instanceof','in','of','void','delete','this','super','yield','static','get','set','true','false','null','undefined','interface','type','enum','implements','abstract','public','private','protected','readonly','as','is','keyof','declare','module','namespace','require','def','self','elif','pass','lambda','with','raise','except','None','True','False','print','fn','pub','mut','impl','struct','trait','use','mod','crate','loop','match','where','ref','move','dyn','unsafe']);

    function highlightCode(code, lang) {
      const escaped = escapeHtml(code);
      // Comments
      let result = escaped
        .replace(/(\/\/.*$)/gm, '<span class="tok-cm">$1</span>')
        .replace(/(#.*$)/gm, '<span class="tok-cm">$1</span>')
        .replace(/(\/\\*[\\s\\S]*?\\*\/)/g, '<span class="tok-cm">$1</span>');
      // Strings (double, single, backtick)
      result = result.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)/g, '<span class="tok-str">$1</span>');
      result = result.replace(/('(?:[^'\\\\]|\\\\.)*?')/g, '<span class="tok-str">$1</span>');
      result = result.replace(/(\`(?:[^\`\\\\]|\\\\.)*?\`)/g, '<span class="tok-str">$1</span>');
      // Numbers
      result = result.replace(/\\b(\\d+\\.?\\d*(?:e[+-]?\\d+)?)\\b/gi, '<span class="tok-num">$1</span>');
      // Function calls
      result = result.replace(/\\b([a-zA-Z_]\\w*)(?=\\s*\\()/g, (m, name) => {
        if (KEYWORDS.has(name)) return m;
        return '<span class="tok-fn">' + name + '</span>';
      });
      // Keywords
      result = result.replace(/\\b([a-zA-Z_]+)\\b/g, (m, word) => {
        if (KEYWORDS.has(word)) return '<span class="tok-kw">' + word + '</span>';
        return m;
      });
      // Types (PascalCase)
      result = result.replace(/\\b([A-Z][a-zA-Z0-9]+)\\b/g, '<span class="tok-ty">$1</span>');
      return result;
    }

    // ---- Markdown rendering ----
    function renderMarkdown(text, isStreaming) {
      // Handle <think> blocks from reasoning models (qwen3, deepseek, etc.)
      text = text.replace(/<think>([\\s\\S]*?)<\\/think>/g, (_, content) => {
        const id = 'think-' + Math.random().toString(36).slice(2, 8);
        const rendered = content.trim().replace(/\\n/g, '<br>');
        return '<div class="think-block collapsed" id="' + id + '"><div class="think-header" onclick="this.parentElement.classList.toggle(\'collapsed\')"><span class="think-chevron">\\u25BC</span> Reasoning</div><div class="think-body">' + rendered + '</div></div>';
      });
      // Handle unclosed <think> during streaming (model still thinking)
      if (isStreaming && text.includes('<think>') && !text.includes('</think>')) {
        const parts = text.split('<think>');
        const before = parts[0];
        const thinkContent = parts.slice(1).join('').trim().replace(/\\n/g, '<br>');
        text = before + '<div class="think-block"><div class="think-header"><span class="think-chevron">\\u25BC</span> Thinking...</div><div class="think-body">' + thinkContent + '</div></div>';
      }

      // Code blocks with syntax highlighting (closed blocks)
      text = text.replace(/\`\`\`(\\w*)?\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
        const langLabel = lang || 'code';
        const highlighted = highlightCode(code.trim(), langLabel);
        const id = 'cb-' + Math.random().toString(36).slice(2, 8);
        return '<div class="code-block-wrap" id="' + id + '"><div class="code-block-header"><span class="lang">' + langLabel + '</span><span><button class="copy-btn" onclick="copyCode(this)">Copy</button><button class="diff-btn" onclick="diffCode(this)" title="Preview diff">Diff</button><button class="apply-btn" onclick="applyCode(this)" title="Insert into editor">Apply</button></span></div><pre class="code-block"><code>' + highlighted + '</code></pre></div>';
      });
      // Handle unclosed code blocks during streaming
      if (isStreaming) {
        text = text.replace(/\`\`\`(\\w*)?\\n([\\s\\S]*)$/g, (_, lang, code) => {
          const langLabel = lang || 'code';
          const highlighted = highlightCode(code, langLabel);
          return '<div class="code-block-wrap"><div class="code-block-header"><span class="lang">' + langLabel + '</span><span style="font-size:10px;opacity:0.5;">typing...</span></div><pre class="code-block"><code>' + highlighted + '</code></pre></div>';
        });
      }
      // Inline code
      text = text.replace(/\`([^\`]+)\`/g, '<code class="inline">$1</code>');
      // Bold
      text = text.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      // Italic
      text = text.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
      // Strikethrough
      text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      // Blockquotes
      text = text.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--vscode-panel-border);padding-left:10px;margin:4px 0;color:var(--vscode-descriptionForeground);font-style:italic;">$1</blockquote>');
      text = text.replace(/<\\/blockquote>\\s*<blockquote[^>]*>/g, '<br>');
      // Horizontal rules
      text = text.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid var(--vscode-panel-border);margin:8px 0;">');
      // Headers
      text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
      // Links [text](url)
      text = text.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" title="$2">$1</a>');
      // Auto-link URLs
      text = text.replace(/(?<![="'])\\b(https?:\\/\\/[^\\s<]+)/g, '<a href="$1">$1</a>');
      // Numbered lists
      text = text.replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>');
      // Bullet lists
      text = text.replace(/^- (.+)$/gm, '<li>$1</li>');
      text = text.replace(/(<li>.*<\\/li>)/gs, '<ul>$1</ul>');
      text = text.replace(/<\\/ul>\\s*<ul>/g, '');
      // Tables (GFM-style)
      text = text.replace(/((?:^\\|.+\\|\\s*$\\n?)+)/gm, (tableBlock) => {
        const rows = tableBlock.trim().split('\\n').filter(r => r.trim());
        if (rows.length < 2) return tableBlock;
        // Check if second row is separator
        const sepRow = rows[1];
        if (!/^\\|[\\s:|-]+\\|$/.test(sepRow.trim())) return tableBlock;
        let html = '<table>';
        // Header
        const headerCells = rows[0].split('|').filter(c => c.trim());
        html += '<thead><tr>' + headerCells.map(c => '<th>' + c.trim() + '</th>').join('') + '</tr></thead>';
        // Body
        html += '<tbody>';
        for (let i = 2; i < rows.length; i++) {
          const cells = rows[i].split('|').filter(c => c.trim());
          html += '<tr>' + cells.map(c => '<td>' + c.trim() + '</td>').join('') + '</tr>';
        }
        html += '</tbody></table>';
        return html;
      });
      // Paragraphs
      text = text.replace(/\\n\\n/g, '</p><p>');
      text = text.replace(/(?<!<\\/?[^>]+)\\n/g, '<br>');
      let html = '<p>' + text + '</p>';
      if (isStreaming) html += '<span class="streaming-cursor"></span>';
      return html;
    }

    function escapeHtml(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ---- Quick actions ----
    window.quickAction = function(prompt) {
      inputEl.value = prompt;
      send();
    };

    // ---- Copy code ----
    window.copyCode = function(btn) {
      const code = btn.closest('.code-block-wrap').querySelector('code').textContent;
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      });
    };

    // ---- Apply code to editor ----
    window.applyCode = function(btn) {
      const code = btn.closest('.code-block-wrap').querySelector('code').textContent;
      vscode.postMessage({ type: 'applyCode', code: code });
      btn.textContent = 'Applied!';
      btn.classList.add('applied');
      setTimeout(() => { btn.textContent = 'Apply'; btn.classList.remove('applied'); }, 2000);
    };

    // ---- Diff preview ----
    window.diffCode = function(btn) {
      const code = btn.closest('.code-block-wrap').querySelector('code').textContent;
      vscode.postMessage({ type: 'diffCode', code: code });
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
          const editBtn = document.createElement('button');
          editBtn.className = 'msg-action-btn';
          editBtn.textContent = 'Edit';
          editBtn.onclick = () => {
            // Remove this message and everything after it
            const allWraps = Array.from(messagesEl.querySelectorAll('.msg-wrap'));
            const idx = allWraps.indexOf(wrap);
            if (idx >= 0) {
              for (let i = allWraps.length - 1; i >= idx; i--) {
                allWraps[i].remove();
              }
            }
            inputEl.value = msg.textContent;
            inputEl.focus();
            // Tell extension to truncate history
            vscode.postMessage({ type: 'truncateHistory', index: idx });
          };
          actions.appendChild(editBtn);

          const resendBtn = document.createElement('button');
          resendBtn.className = 'msg-action-btn';
          resendBtn.textContent = 'Resend';
          resendBtn.onclick = () => {
            // Remove everything after this user message
            const allWraps = Array.from(messagesEl.querySelectorAll('.msg-wrap'));
            const idx = allWraps.indexOf(wrap);
            if (idx >= 0) {
              for (let i = allWraps.length - 1; i > idx; i--) {
                allWraps[i].remove();
              }
            }
            // Resend the same message
            const text = msg.textContent;
            vscode.postMessage({ type: 'truncateHistory', index: idx });
            setStreaming(true);
            addThinking();
            vscode.postMessage({ type: 'chat', text: text });
          };
          actions.appendChild(resendBtn);
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
      pushHistory(text);
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

    // ---- Input history (Up/Down arrows recall previous messages) ----
    let inputHistory = [];
    let historyIndex = -1;
    let savedInput = '';

    function pushHistory(text) {
      if (text && (inputHistory.length === 0 || inputHistory[inputHistory.length - 1] !== text)) {
        inputHistory.push(text);
      }
      historyIndex = -1;
    }

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' && inputEl.value === '' && inputHistory.length > 0) {
        e.preventDefault();
        if (historyIndex === -1) { savedInput = inputEl.value; historyIndex = inputHistory.length; }
        if (historyIndex > 0) {
          historyIndex--;
          inputEl.value = inputHistory[historyIndex];
        }
      }
      if (e.key === 'ArrowDown' && historyIndex >= 0) {
        e.preventDefault();
        historyIndex++;
        if (historyIndex >= inputHistory.length) {
          historyIndex = -1;
          inputEl.value = savedInput;
        } else {
          inputEl.value = inputHistory[historyIndex];
        }
      }
    });

    // Auto-resize
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });

    // ---- Drag and drop files ----
    const dropOverlay = document.createElement('div');
    dropOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,100,200,0.1);border:2px dashed var(--vscode-focusBorder);z-index:1000;display:none;align-items:center;justify-content:center;pointer-events:none;';
    dropOverlay.innerHTML = '<div style="font-size:13px;color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:8px 16px;border-radius:6px;border:1px solid var(--vscode-panel-border);">Drop file to add as context</div>';
    document.body.appendChild(dropOverlay);

    let dragCounter = 0;
    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) dropOverlay.style.display = 'flex';
    });
    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) { dragCounter = 0; dropOverlay.style.display = 'none'; }
    });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropOverlay.style.display = 'none';
      // VS Code webviews don't get real File objects, but we get the text/plain path
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        // Looks like a file path - use it as a mention
        const path = text.replace(/^file:\\/\\//, '');
        addContextPill(path, true);
        vscode.postMessage({ type: 'mentionFile', file: path });
      }
    });

    // ---- File icons ----
    function getFileIcon(ext) {
      const icons = { ts: 'TS', tsx: 'TX', js: 'JS', jsx: 'JX', py: 'PY', rs: 'RS', go: 'GO', md: 'MD', json: 'JN', css: 'CS', html: 'HT', svg: 'SV', yaml: 'YM', yml: 'YM', toml: 'TM', sh: 'SH', sql: 'SQ' };
      return icons[ext] || ext.slice(0, 2).toUpperCase() || 'F';
    }

    // ---- @mention autocomplete ----
    const mentionList = document.getElementById('mentionList');
    let mentionFiles = [];
    let mentionSelectedIndex = 0;
    let mentionQuery = '';
    let mentionActive = false;

    inputEl.addEventListener('input', (e) => {
      const val = inputEl.value;
      const cursor = inputEl.selectionStart || 0;
      // Find @ before cursor
      const before = val.slice(0, cursor);
      const atMatch = before.match(/@([\\w.\\-\\/]*)$/);

      if (atMatch) {
        mentionQuery = atMatch[1].toLowerCase();
        mentionActive = true;
        vscode.postMessage({ type: 'mentionQuery', query: mentionQuery });
      } else {
        mentionActive = false;
        mentionList.classList.remove('visible');
      }
    });

    inputEl.addEventListener('keydown', (e) => {
      if (!mentionActive || !mentionList.classList.contains('visible')) return;
      const items = mentionList.querySelectorAll('.mention-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionSelectedIndex = Math.min(mentionSelectedIndex + 1, items.length - 1);
        updateMentionSelection(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionSelectedIndex = Math.max(mentionSelectedIndex - 1, 0);
        updateMentionSelection(items);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (mentionActive && items.length) {
          e.preventDefault();
          selectMention(items[mentionSelectedIndex]);
        }
      } else if (e.key === 'Escape') {
        mentionActive = false;
        mentionList.classList.remove('visible');
      }
    });

    function updateMentionSelection(items) {
      items.forEach((el, i) => {
        el.classList.toggle('selected', i === mentionSelectedIndex);
      });
    }

    function selectMention(item) {
      const file = item.getAttribute('data-file');
      const val = inputEl.value;
      const cursor = inputEl.selectionStart || 0;
      const before = val.slice(0, cursor);
      const after = val.slice(cursor);
      const atIndex = before.lastIndexOf('@');
      inputEl.value = before.slice(0, atIndex) + '@' + file + ' ' + after;
      inputEl.selectionStart = inputEl.selectionEnd = atIndex + file.length + 2;
      mentionActive = false;
      mentionList.classList.remove('visible');
      addContextPill(file, true);
      // Tell extension to include this file
      vscode.postMessage({ type: 'mentionFile', file: file });
      inputEl.focus();
    }

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

    // ---- Slash commands ----
    const SLASH_COMMANDS = [
      { cmd: '/explain', desc: 'Explain the current code', prompt: 'Explain this code in detail. What does it do, and why?' },
      { cmd: '/fix', desc: 'Fix bugs in the code', prompt: 'Find and fix any bugs in this code. Show the corrected version.' },
      { cmd: '/tests', desc: 'Generate tests', prompt: 'Write comprehensive tests for this code.' },
      { cmd: '/refactor', desc: 'Refactor for readability', prompt: 'Refactor this code for better readability and maintainability. Show the improved version.' },
      { cmd: '/types', desc: 'Add TypeScript types', prompt: 'Add proper TypeScript types and interfaces to this code.' },
      { cmd: '/docs', desc: 'Add documentation', prompt: 'Add JSDoc/TSDoc comments to all functions and classes in this code.' },
      { cmd: '/optimize', desc: 'Optimize performance', prompt: 'Optimize this code for better performance. Explain what changed and why.' },
      { cmd: '/simplify', desc: 'Simplify complex code', prompt: 'Simplify this code. Remove unnecessary complexity while preserving functionality.' },
    ];
    const slashList = document.getElementById('slashList');
    let slashActive = false;
    let slashSelectedIndex = 0;

    function checkSlashCommand() {
      const val = inputEl.value;
      if (val.startsWith('/') && !val.includes(' ')) {
        const query = val.slice(1).toLowerCase();
        const matches = SLASH_COMMANDS.filter(c => c.cmd.slice(1).startsWith(query));
        if (matches.length && val.length > 0) {
          slashList.innerHTML = '';
          slashSelectedIndex = 0;
          matches.forEach((c, i) => {
            const item = document.createElement('div');
            item.className = 'mention-item' + (i === 0 ? ' selected' : '');
            item.innerHTML = '<span style="font-weight:600;font-size:12px;">' + c.cmd + '</span><span class="path">' + c.desc + '</span>';
            item.onclick = () => selectSlash(c);
            slashList.appendChild(item);
          });
          slashList.classList.add('visible');
          slashActive = true;
          return;
        }
      }
      slashActive = false;
      slashList.classList.remove('visible');
    }

    function selectSlash(cmd) {
      inputEl.value = cmd.prompt;
      slashActive = false;
      slashList.classList.remove('visible');
      send();
    }

    inputEl.addEventListener('input', checkSlashCommand);

    inputEl.addEventListener('keydown', (e) => {
      if (!slashActive || !slashList.classList.contains('visible')) return;
      const items = slashList.querySelectorAll('.mention-item');
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slashSelectedIndex = Math.min(slashSelectedIndex + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('selected', i === slashSelectedIndex));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        slashSelectedIndex = Math.max(slashSelectedIndex - 1, 0);
        items.forEach((el, i) => el.classList.toggle('selected', i === slashSelectedIndex));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const matches = SLASH_COMMANDS.filter(c => c.cmd.slice(1).startsWith(inputEl.value.slice(1).toLowerCase()));
        if (matches[slashSelectedIndex]) selectSlash(matches[slashSelectedIndex]);
      } else if (e.key === 'Escape') {
        slashActive = false;
        slashList.classList.remove('visible');
      }
    });

    // ---- Handle messages from extension ----
    let rawAssistantText = '';
    let renderTimer = null;
    let pendingRender = false;

    function flushRender() {
      if (!currentAssistantEl || !rawAssistantText) return;
      currentAssistantEl.innerHTML = renderMarkdown(rawAssistantText, streaming);
      currentAssistantEl.setAttribute('data-raw', rawAssistantText);
      scrollToBottom();
      pendingRender = false;
      // Update word count in status
      if (streaming) {
        wordCount = rawAssistantText.split(/\\s+/).filter(w => w).length;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        statusHint.textContent = wordCount + ' words - ' + elapsed + 's';
      }
    }

    function scheduleRender() {
      if (renderTimer) return; // already scheduled
      pendingRender = true;
      renderTimer = setTimeout(() => {
        renderTimer = null;
        if (pendingRender) flushRender();
      }, 40); // ~25fps - smooth without CPU waste
    }

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
          scheduleRender();
          break;
        }
        case 'done': {
          removeThinking();
          // Flush any pending render immediately, then final render without cursor
          if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
          setStreaming(false);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          statusHint.textContent = 'Done in ' + elapsed + 's';
          // Final render without streaming cursor
          if (currentAssistantEl && rawAssistantText) {
            currentAssistantEl.innerHTML = renderMarkdown(rawAssistantText, false);
            currentAssistantEl.setAttribute('data-raw', rawAssistantText);
          }
          // Add response meta
          if (currentAssistantEl && currentAssistantEl.parentElement) {
            const meta = document.createElement('div');
            meta.className = 'response-meta';
            const parts = [elapsed + 's'];
            if (wordCount) parts.push(wordCount + ' words');
            if (msg.model) parts.push(msg.model);
            meta.textContent = parts.join(' - ');
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
        case 'mentionResults': {
          if (!mentionActive) break;
          mentionList.innerHTML = '';
          mentionSelectedIndex = 0;
          if (msg.files && msg.files.length) {
            msg.files.forEach((f, i) => {
              const item = document.createElement('div');
              item.className = 'mention-item' + (i === 0 ? ' selected' : '');
              item.setAttribute('data-file', f.path);
              const ext = f.path.split('.').pop() || '';
              item.innerHTML = '<span class="icon">' + getFileIcon(ext) + '</span>' + f.name + '<span class="path">' + f.dir + '</span>';
              item.onclick = () => selectMention(item);
              mentionList.appendChild(item);
            });
            mentionList.classList.add('visible');
          } else {
            mentionList.classList.remove('visible');
          }
          break;
        }
        case 'restoreHistory': {
          // Replay saved messages (no animation)
          if (msg.messages && msg.messages.length) {
            clearEmptyState();
            messagesEl.style.animation = 'none';
            for (const m of msg.messages) {
              if (m.role === 'user') {
                const el = addMessage('user', m.content);
                el.parentElement.style.animation = 'none';
              } else if (m.role === 'assistant') {
                const el = addMessage('assistant', '', { html: true });
                el.innerHTML = renderMarkdown(m.content, false);
                el.setAttribute('data-raw', m.content);
                el.parentElement.style.animation = 'none';
              }
            }
            scrollToBottom();
          }
          break;
        }
        case 'providerChanged': {
          providerBtn.textContent = msg.name + (msg.model ? ' (' + msg.model + ')' : '');
          providerBtn.className = 'provider-badge' + (msg.local ? ' local' : '');
          addMessage('system', 'Switched to ' + msg.name + (msg.model ? ' - ' + msg.model : ''));
          statusHint.textContent = 'Ready';
          break;
        }
        case 'focusInput': {
          inputEl.focus();
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
