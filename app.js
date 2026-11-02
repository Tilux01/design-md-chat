const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.endsWith('.local')
);

const API_BASE = window.API_BASE_URL || (
  isLocalhost
    ? (window.location.port === '3000' ? '' : 'http://localhost:3000')
    : 'https://design-md-backend.vercel.app'
);

/**
 * 100% Client-Side Local Storage via IndexedDB (Zero Cloud)
 */
class ChatHistoryDB {
  constructor() {
    this.dbName = 'DesignMdLocalChats';
    this.version = 1;
    this.storeName = 'sessions';
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(this.dbName, this.version);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'id' });
          }
        };
        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
        request.onerror = (e) => {
          console.warn('IndexedDB unavailable, falling back to localStorage:', e);
          resolve(null);
        };
      } catch (err) {
        console.warn('IndexedDB exception, falling back to localStorage:', err);
        resolve(null);
      }
    });
  }

  async getAllSessions() {
    try {
      const db = await this.init();
      if (!db) return this._getLocalFallback();
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();
        req.onsuccess = () => {
          const sessions = req.result || [];
          sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          resolve(sessions);
        };
        req.onerror = () => resolve(this._getLocalFallback());
      });
    } catch {
      return this._getLocalFallback();
    }
  }

  async getSession(id) {
    try {
      const db = await this.init();
      if (!db) {
        const list = this._getLocalFallback();
        return list.find(s => s.id === id) || null;
      }
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async saveSession(session) {
    try {
      const db = await this.init();
      if (!db) {
        this._saveLocalFallback(session);
        return;
      }
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.put(session);
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          this._saveLocalFallback(session);
          resolve();
        };
      });
    } catch {
      this._saveLocalFallback(session);
    }
  }

  async deleteSession(id) {
    try {
      const db = await this.init();
      if (!db) {
        this._deleteLocalFallback(id);
        return;
      }
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          this._deleteLocalFallback(id);
          resolve();
        };
      });
    } catch {
      this._deleteLocalFallback(id);
    }
  }

  _getLocalFallback() {
    try {
      const data = localStorage.getItem('design_md_local_chats');
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  }

  _saveLocalFallback(session) {
    try {
      let list = this._getLocalFallback();
      const idx = list.findIndex(s => s.id === session.id);
      if (idx >= 0) list[idx] = session;
      else list.unshift(session);
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      localStorage.setItem('design_md_local_chats', JSON.stringify(list));
    } catch (e) {
      console.warn('localStorage save failed:', e);
    }
  }

  _deleteLocalFallback(id) {
    try {
      let list = this._getLocalFallback();
      list = list.filter(s => s.id !== id);
      localStorage.setItem('design_md_local_chats', JSON.stringify(list));
    } catch {}
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Toast Notification System
  function showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconMap = {
      info: 'ℹ️',
      success: '✓',
      warning: '⚠️',
      error: '✕'
    };

    toast.innerHTML = `
      <span class="toast-icon">${iconMap[type] || 'ℹ️'}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close">&times;</button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    const closeBtn = toast.querySelector('.toast-close');
    const dismiss = () => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => toast.remove());
    };

    closeBtn.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
  }

  // Header Interactions
  const toggleSwitch = document.querySelector('.toggle-switch');
  if (toggleSwitch) {
    toggleSwitch.addEventListener('click', () => {
      toggleSwitch.classList.toggle('active');
    });
  }

  // Chat UI Elements
  const chatHistory = document.getElementById('chat-history');
  const chatInput = document.getElementById('chat-input');
  const submitBtn = document.getElementById('submit-btn');
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('file-input');
  const uploadPreview = document.getElementById('upload-preview');
  const previewItems = document.getElementById('preview-items');
  const clearPreviewBtn = document.getElementById('clear-preview-btn');

  // History Dropdown Elements
  const headerHistoryTrigger = document.getElementById('header-history-trigger');
  const activeChatTitle = document.getElementById('active-chat-title');
  const historyDropdown = document.getElementById('history-dropdown');
  const historyList = document.getElementById('history-list');
  const dropdownNewChatBtn = document.getElementById('dropdown-new-chat-btn');
  const headerNewChatBtn = document.getElementById('header-new-chat-btn');

  const chatDb = new ChatHistoryDB();
  let currentSessionId = null;
  let currentSessionMessages = [];
  let currentFiles = [];
  const servedDesignIds = [];

  // Initialize DB and load history
  chatDb.init().then(() => {
    refreshHistoryDropdown();
  });

  function scrollToBottom() {
    if (chatHistory) {
      chatHistory.scrollTo({ top: chatHistory.scrollHeight, behavior: 'smooth' });
    }
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = Math.max(0, now - timestamp);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function refreshHistoryDropdown() {
    if (!historyList) return;
    const sessions = await chatDb.getAllSessions();
    historyList.innerHTML = '';

    if (sessions.length === 0) {
      historyList.innerHTML = '<div class="history-empty">No saved chats yet</div>';
      return;
    }

    sessions.forEach(session => {
      const item = document.createElement('div');
      item.className = `history-item ${session.id === currentSessionId ? 'active' : ''}`;
      item.innerHTML = `
        <div class="history-item-info">
          <span class="history-item-title">${escapeHtml(session.title || 'Design Chat')}</span>
          <span class="history-item-date">${formatRelativeTime(session.updatedAt || session.createdAt)}</span>
        </div>
        <button class="history-item-delete" title="Delete chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.history-item-delete')) return;
        loadSession(session.id);
        closeHistoryDropdown();
      });

      const delBtn = item.querySelector('.history-item-delete');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await chatDb.deleteSession(session.id);
          if (currentSessionId === session.id) {
            startNewChat(false);
          }
          await refreshHistoryDropdown();
          showToast('Chat deleted', 'info');
        });
      }

      historyList.appendChild(item);
    });
  }

  function toggleHistoryDropdown(e) {
    if (e && e.target.closest('#history-dropdown')) return;
    if (!historyDropdown) return;
    const isHidden = historyDropdown.classList.contains('hidden');
    if (isHidden) {
      historyDropdown.classList.remove('hidden');
      if (headerHistoryTrigger) headerHistoryTrigger.classList.add('active');
      refreshHistoryDropdown();
    } else {
      closeHistoryDropdown();
    }
  }

  function closeHistoryDropdown() {
    if (!historyDropdown) return;
    historyDropdown.classList.add('hidden');
    if (headerHistoryTrigger) headerHistoryTrigger.classList.remove('active');
  }

  if (headerHistoryTrigger) {
    headerHistoryTrigger.addEventListener('click', toggleHistoryDropdown);
  }

  document.addEventListener('click', (e) => {
    if (headerHistoryTrigger && !headerHistoryTrigger.contains(e.target)) {
      closeHistoryDropdown();
    }
  });

  function startNewChat(closeDropdown = true) {
    currentSessionId = null;
    currentSessionMessages = [];
    servedDesignIds.length = 0;
    if (activeChatTitle) activeChatTitle.textContent = 'New Design Chat';

    if (chatHistory) {
      chatHistory.innerHTML = `
        <div class="chat-message ai-message">
          <div class="avatar ai-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
          </div>
          <div class="message-content">
            <p>Hello! You can ask me for a design (e.g. <em>"Give me a dark mode fintech mobile design"</em>), upload a design screenshot/video, or paste a URL. I will search the index or process your media and provide full UI/UX specifications!</p>
          </div>
        </div>
      `;
    }
    if (closeDropdown) closeHistoryDropdown();
    refreshHistoryDropdown();
    if (chatInput) chatInput.focus();
  }

  if (dropdownNewChatBtn) {
    dropdownNewChatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startNewChat(true);
    });
  }

  if (headerNewChatBtn) {
    headerNewChatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startNewChat(true);
    });
  }

  async function loadSession(sessionId) {
    const session = await chatDb.getSession(sessionId);
    if (!session) return;
    currentSessionId = session.id;
    currentSessionMessages = session.messages || [];
    servedDesignIds.length = 0;

    if (activeChatTitle) activeChatTitle.textContent = session.title || 'Design Chat';

    if (chatHistory) {
      chatHistory.innerHTML = '';
      currentSessionMessages.forEach(msg => {
        if (msg.role === 'user') {
          appendUserMessage(msg.text, msg.files, false);
        } else if (msg.role === 'ai') {
          appendAiMessage(msg.renderedContent, msg.rawMarkdown, msg.designId, false);
        } else if (msg.role === 'system') {
          appendSystemMessage(msg.text, false);
        }
      });
      setTimeout(scrollToBottom, 50);
    }

    await refreshHistoryDropdown();
  }

  async function persistCurrentSession() {
    if (!currentSessionId) return;
    const session = {
      id: currentSessionId,
      title: activeChatTitle ? activeChatTitle.textContent : 'Design Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: currentSessionMessages
    };
    const existing = await chatDb.getSession(currentSessionId);
    if (existing && existing.createdAt) {
      session.createdAt = existing.createdAt;
    }
    await chatDb.saveSession(session);
    await refreshHistoryDropdown();
  }

  // File Handling
  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function() {
      handleFiles(this.files);
    });
  }

  window.addEventListener('paste', (e) => {
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    if (pastedText && (pastedText.startsWith('http://') || pastedText.startsWith('https://'))) {
      if (chatInput) {
        chatInput.value = pastedText;
        checkSubmitState();
      }
      return;
    }

    if (e.clipboardData && e.clipboardData.files.length > 0) {
      e.preventDefault();
      handleFiles(e.clipboardData.files);
    }
  });

  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });

  function handleFiles(files) {
    let added = false;
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/') || files[i].type.startsWith('video/')) {
        currentFiles.push(files[i]);
        added = true;
      }
    }
    if (added) {
      renderPreviews();
      checkSubmitState();
    }
  }

  function renderPreviews() {
    if (!previewItems || !uploadPreview) return;
    previewItems.innerHTML = '';
    currentFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        previewItems.appendChild(img);
      } else {
        const vid = document.createElement('video');
        vid.src = URL.createObjectURL(file);
        previewItems.appendChild(vid);
      }
    });
    uploadPreview.classList.remove('hidden');
  }

  if (clearPreviewBtn) {
    clearPreviewBtn.addEventListener('click', () => {
      currentFiles = [];
      if (fileInput) fileInput.value = '';
      if (uploadPreview) uploadPreview.classList.add('hidden');
      checkSubmitState();
    });
  }

  if (chatInput) {
    chatInput.addEventListener('input', checkSubmitState);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && submitBtn && !submitBtn.disabled) {
        submitBtn.click();
      }
    });
  }

  function checkSubmitState() {
    if (!submitBtn) return;
    if (currentFiles.length > 0 || (chatInput && chatInput.value.trim() !== '')) {
      submitBtn.disabled = false;
    } else {
      submitBtn.disabled = true;
    }
  }

  // Helper to serialize files to Base64 data URLs for 100% local IndexedDB storage
  async function filesToDataUrls(files) {
    if (!files || files.length === 0) return [];
    return Promise.all(files.map(file => {
      return new Promise((resolve) => {
        if (file.dataUrl) return resolve(file);
        const reader = new FileReader();
        reader.onload = () => resolve({
          name: file.name,
          type: file.type,
          dataUrl: reader.result
        });
        reader.onerror = () => resolve({
          name: file.name,
          type: file.type,
          dataUrl: ''
        });
        reader.readAsDataURL(file);
      });
    }));
  }

  // Submit Action
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const text = chatInput ? chatInput.value.trim() : '';
      const filesToUpload = [...currentFiles];
      
      // Clear Input UI
      if (chatInput) chatInput.value = '';
      if (clearPreviewBtn) clearPreviewBtn.click();
      
      const isUrl = text.startsWith('http://') || text.startsWith('https://');

      // Initialize session if not existing
      if (!currentSessionId) {
        currentSessionId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        let sessionTitle = 'New Design Chat';
        if (text) {
          sessionTitle = text.slice(0, 36) + (text.length > 36 ? '...' : '');
        } else if (filesToUpload.length > 0) {
          sessionTitle = filesToUpload[0].name.slice(0, 30);
        }
        if (activeChatTitle) activeChatTitle.textContent = sessionTitle;
      }

      // Convert files to data URLs for local persistence
      const persistentFiles = await filesToDataUrls(filesToUpload);

      // Add User Message to Chat and DB
      appendUserMessage(text, persistentFiles, true);

      // Add Loading Indicator
      const typingId = appendTypingIndicator();
      scrollToBottom();

      try {
        let response;
        if (filesToUpload.length > 0) {
          const formData = new FormData();
          filesToUpload.forEach(f => formData.append('designFiles', f));
          response = await fetch(`${API_BASE}/api/upload-design`, { method: 'POST', body: formData });
        } else if (isUrl) {
          response = await fetch(`${API_BASE}/api/process-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: text })
          });
        } else {
          response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text, exclude_ids: servedDesignIds })
          });
        }

        const result = await response.json();
        removeTypingIndicator(typingId);

        if (result.success) {
          if (result.type === 'info') {
            appendSystemMessage(result.message, true);
          } else if (result.type === 'design_response') {
            if (result.design_id && !servedDesignIds.includes(result.design_id)) {
              servedDesignIds.push(result.design_id);
            }
            const content = `> 💡 **AI Match Note:** ${result.explanation}\n\n---\n\n${result.markdown}`;
            appendAiMessage(content, result.markdown, result.design_id, true);
          } else {
            const fileId = result.new_design.id;
            const mdRes = await fetch(`${API_BASE}/api/designs/${fileId}`);
            const mdText = await mdRes.text();
            appendAiMessage(mdText, mdText, fileId, true);
          }
        } else {
          appendSystemMessage(`Extraction failed: ${result.error || 'Unknown error'}`, true);
        }

      } catch (err) {
        removeTypingIndicator(typingId);
        appendSystemMessage(`Network error: ${err.message}`, true);
      }
      
      scrollToBottom();
    });
  }

  // Chat Rendering Helpers
  function appendUserMessage(text, files, saveToDb = false) {
    if (!chatHistory) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message user-message';
    
    let contentHtml = '';
    if (text) contentHtml += `<p>${escapeHtml(text)}</p>`;
    
    if (files && files.length > 0) {
      contentHtml += `<div class="chat-media-grid">`;
      files.forEach(f => {
        const src = f.dataUrl || (f instanceof File ? URL.createObjectURL(f) : '');
        contentHtml += (f.type || '').startsWith('image/') 
          ? `<img src="${src}">`
          : `<video src="${src}" controls></video>`;
      });
      contentHtml += `</div>`;
    }

    wrapper.innerHTML = `
      <div class="avatar user-avatar">U</div>
      <div class="message-content">${contentHtml}</div>
    `;
    chatHistory.appendChild(wrapper);

    if (saveToDb) {
      currentSessionMessages.push({
        role: 'user',
        text: text,
        files: files
      });
      persistCurrentSession();
    }
  }

  function appendAiMessage(renderedContent, rawMarkdown = null, designId = null, saveToDb = false) {
    if (!chatHistory) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message ai-message';

    const rawText = rawMarkdown || renderedContent;
    const effectiveDesignId = designId || `design-${Date.now()}`;
    const hasContent = rawText && rawText.length > 20;

    let actionsHtml = '';
    if (hasContent) {
      actionsHtml = `
        <div class="message-actions">
          <button class="msg-action-btn copy-design-btn" title="Copy full design specification">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy Design</span>
          </button>
          <button class="msg-action-btn download-md-btn" title="Download design spec as .md file">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>Download .md</span>
          </button>
        </div>
      `;
    }

    wrapper.innerHTML = `
      <div class="avatar ai-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
      </div>
      <div class="message-content markdown-body">
        <div class="markdown-body-inner">${typeof marked !== 'undefined' ? marked.parse(renderedContent) : renderedContent}</div>
        ${actionsHtml}
      </div>
    `;

    chatHistory.appendChild(wrapper);

    // Code block copy buttons
    wrapper.querySelectorAll('pre').forEach(pre => {
      pre.style.position = 'relative';
      const codeBtn = document.createElement('button');
      codeBtn.className = 'code-copy-btn';
      codeBtn.title = 'Copy code snippet';
      codeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      codeBtn.addEventListener('click', async () => {
        const codeText = pre.querySelector('code')?.innerText || pre.innerText;
        try {
          await navigator.clipboard.writeText(codeText);
          codeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          showToast('Code snippet copied!', 'success');
          setTimeout(() => {
            codeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
          }, 2000);
        } catch (err) {
          showToast('Failed to copy code snippet', 'error');
        }
      });
      pre.appendChild(codeBtn);
    });

    if (hasContent) {
      const copyBtn = wrapper.querySelector('.copy-design-btn');
      const downloadBtn = wrapper.querySelector('.download-md-btn');

      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(rawText);
            const origHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span style="color: #34d399;">Copied!</span>
            `;
            copyBtn.classList.add('copied');
            showToast('Design specification copied to clipboard!', 'success');
            setTimeout(() => {
              copyBtn.innerHTML = origHtml;
              copyBtn.classList.remove('copied');
            }, 2000);
          } catch (err) {
            showToast('Failed to copy design: ' + err.message, 'error');
          }
        });
      }

      if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
          try {
            const filename = `${effectiveDesignId}.md`;
            const blob = new Blob([rawText], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`Downloaded ${filename}`, 'success');
          } catch (err) {
            showToast('Failed to download: ' + err.message, 'error');
          }
        });
      }
    }

    if (saveToDb) {
      currentSessionMessages.push({
        role: 'ai',
        renderedContent: renderedContent,
        rawMarkdown: rawMarkdown,
        designId: designId
      });
      persistCurrentSession();
    }

    setTimeout(scrollToBottom, 50);
  }

  function appendSystemMessage(text, saveToDb = false) {
    if (!chatHistory) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message ai-message';
    wrapper.innerHTML = `
      <div class="avatar ai-avatar" style="color: #ef4444">!</div>
      <div class="message-content" style="color: #ef4444">${escapeHtml(text)}</div>
    `;
    chatHistory.appendChild(wrapper);

    if (saveToDb) {
      currentSessionMessages.push({
        role: 'system',
        text: text
      });
      persistCurrentSession();
    }
  }

  function appendTypingIndicator() {
    if (!chatHistory) return null;
    const id = 'typing-' + Date.now();
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message ai-message';
    wrapper.id = id;
    wrapper.innerHTML = `
      <div class="avatar ai-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
      </div>
      <div class="message-content">
        <div class="typing-indicator">
          <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
        </div>
      </div>
    `;
    chatHistory.appendChild(wrapper);
    return id;
  }

  function removeTypingIndicator(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Mobile virtual keyboard and viewport adjustments
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      if (document.activeElement === chatInput) {
        setTimeout(() => {
          if (chatHistory) chatHistory.scrollTop = chatHistory.scrollHeight;
        }, 100);
      }
    });
  }

  if (chatInput) {
    chatInput.addEventListener("focus", () => {
      setTimeout(() => {
        if (chatHistory) chatHistory.scrollTop = chatHistory.scrollHeight;
      }, 300);
    });
  }
});
