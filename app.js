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

  // --- View Switching for Main App ---
  const navBtns = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view-section');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-view');
      if (!targetView) return;

      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      views.forEach(v => {
        if (v.id === targetView) v.classList.remove('hidden');
        else v.classList.add('hidden');
      });

      if (targetView === 'library-view') loadLibrary();
    });
  });

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

  // --- Library View Logic ---
  const libraryGrid = document.getElementById('library-grid');
  const refreshLibraryBtn = document.getElementById('refreshLibraryBtn');
  let allLibraryItems = [];

  if (refreshLibraryBtn) {
    refreshLibraryBtn.addEventListener('click', () => loadLibrary());
  }

  async function loadLibrary() {
    if (!libraryGrid) return;
    libraryGrid.innerHTML = '<p style="color:var(--text-secondary);grid-column:1/-1;text-align:center;padding:40px;">Loading designs...</p>';

    try {
      const res = await fetch(`${API_BASE}/api/designs`);
      if (!res.ok) throw new Error('Failed to load library designs');
      allLibraryItems = await res.json();
      renderLibraryCards(allLibraryItems);
    } catch (err) {
      libraryGrid.innerHTML = `<p style="color:#ef4444;grid-column:1/-1;text-align:center;padding:40px;">Error loading library: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderLibraryCards(items) {
    if (!libraryGrid) return;
    libraryGrid.innerHTML = '';
    if (items.length === 0) {
      libraryGrid.innerHTML = '<p style="color:var(--text-secondary);grid-column:1/-1;text-align:center;padding:40px;">No designs found.</p>';
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'design-card';
      card.innerHTML = `
        <h3>${escapeHtml(item.style || item.name || 'Modern UI')}</h3>
        <p>${escapeHtml(item.device || '')} ${item.platform ? '&bull; ' + escapeHtml(item.platform) : ''}</p>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="card-btn view-spec-btn" data-id="${item.id}">View Spec</button>
          <button class="card-btn copy-spec-btn" data-id="${item.id}" style="background:rgba(138,180,248,0.12);color:#8ab4f8;border:1px solid rgba(138,180,248,0.3);">Copy Template</button>
        </div>
      `;
      libraryGrid.appendChild(card);
    });

    libraryGrid.querySelectorAll('.view-spec-btn').forEach(btn => {
      btn.addEventListener('click', () => loadSpec(btn.getAttribute('data-id')));
    });

    libraryGrid.querySelectorAll('.copy-spec-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.textContent = 'Copying...';
        try {
          const res = await fetch(`${API_BASE}/api/designs/${id}`);
          if (!res.ok) throw new Error('Not found');
          const text = await res.text();
          await navigator.clipboard.writeText(text);
          btn.textContent = '✓ Copied!';
          showToast('Design template copied to clipboard!', 'success');
          setTimeout(() => { btn.textContent = 'Copy Template'; }, 2500);
        } catch (err) {
          btn.textContent = 'Copy Template';
          showToast('Copy failed: ' + err.message, 'error');
        }
      });
    });
  }

  // Spec Modal Logic
  const modal = document.getElementById('spec-modal');
  const closeModal = document.getElementById('close-modal');
  const markdownContainer = document.getElementById('markdown-container');

  if (closeModal && modal) {
    closeModal.addEventListener('click', () => modal.classList.add('hidden'));
    window.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  }

  async function loadSpec(id) {
    if (!markdownContainer || !modal) return;
    markdownContainer.innerHTML = '<p>Loading design spec...</p>';
    modal.classList.remove('hidden');
    try {
      const res = await fetch(`${API_BASE}/api/designs/${id}`);
      if (!res.ok) throw new Error('Spec not found');
      const text = await res.text();

      const modalHeader = modal.querySelector('.modal-header');
      const existingCopyBtn = modalHeader ? modalHeader.querySelector('.modal-copy-btn') : null;
      if (existingCopyBtn) existingCopyBtn.remove();

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn modal-copy-btn';
      copyBtn.style.marginRight = 'auto';
      copyBtn.textContent = 'Copy Full Template';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(text);
        copyBtn.textContent = '✓ Copied!';
        showToast('Design template copied to clipboard!', 'success');
        setTimeout(() => { copyBtn.textContent = 'Copy Full Template'; }, 2500);
      });
      if (modalHeader) modalHeader.insertBefore(copyBtn, modalHeader.querySelector('#close-modal'));

      markdownContainer.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : `<pre>${escapeHtml(text)}</pre>`;

      markdownContainer.querySelectorAll('pre').forEach(pre => {
        const code = pre.querySelector('code');
        if (!code) return;
        const wrap = document.createElement('div');
        wrap.className = 'code-block-wrapper';
        const btn = document.createElement('button');
        btn.className = 'copy-code-btn';
        btn.textContent = 'Copy Code';
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(code.innerText);
          btn.textContent = '✓ Copied!';
          showToast('Code block copied!', 'success');
          setTimeout(() => { btn.textContent = 'Copy Code'; }, 2000);
        });
        pre.parentNode.insertBefore(wrap, pre);
        wrap.appendChild(btn);
        wrap.appendChild(pre);
      });
    } catch (err) {
      markdownContainer.innerHTML = `<p style="color:#ef4444">${escapeHtml(err.message)}</p>`;
    }
  }

  // --- Auto Crawler Logic ---
  const startCrawlerBtn = document.getElementById('start-crawler-btn');
  const stopCrawlerBtn = document.getElementById('stop-crawler-btn');
  const statusLabel = document.getElementById('crawler-status-label');
  const statsLabel = document.getElementById('crawler-stats-label');
  let pollInterval = null;

  if (startCrawlerBtn) {
    startCrawlerBtn.addEventListener('click', async () => {
      startCrawlerBtn.disabled = true;
      try {
        await fetch(`${API_BASE}/api/crawler/start`, { method: 'POST' });
        startCrawlerPolling();
      } catch (err) {
        showToast(err.message, 'error');
        startCrawlerBtn.disabled = false;
      }
    });
  }

  if (stopCrawlerBtn) {
    stopCrawlerBtn.addEventListener('click', async () => {
      stopCrawlerBtn.disabled = true;
      try {
        await fetch(`${API_BASE}/api/crawler/stop`, { method: 'POST' });
      } catch (err) {}
    });
  }

  function startCrawlerPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(fetchCrawlerStatus, 2000);
    fetchCrawlerStatus();
  }

  async function fetchCrawlerStatus() {
    if (!statusLabel || !statsLabel) return;
    try {
      const res = await fetch(`${API_BASE}/api/crawler/status`);
      const stats = await res.json();
      
      statusLabel.textContent = `Status: ${(stats.status || 'STOPPED').toUpperCase()}`;
      statusLabel.style.color = stats.status === 'running' ? '#8ab4f8' : 'white';
      
      const currentLabel = stats.currentUrl || 'N/A';
      statsLabel.textContent = `Indexed: ${stats.indexedCount || 0} | Current: ${currentLabel.substring(0, 40)}`;
      
      if (stats.status === 'running' || stats.status === 'stopping...') {
        if (startCrawlerBtn) startCrawlerBtn.disabled = true;
        if (stopCrawlerBtn) stopCrawlerBtn.disabled = stats.status === 'stopping...';
      } else {
        if (startCrawlerBtn) startCrawlerBtn.disabled = false;
        if (stopCrawlerBtn) stopCrawlerBtn.disabled = true;
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }
    } catch (err) {}
  }
  if (statusLabel) fetchCrawlerStatus();

  // --- Media Extractor & Stager Logic ---
  const extractorUrlInput = document.getElementById('extractor-url-input');
  const startScrapeBtn = document.getElementById('start-scrape-btn');
  const extractorLoading = document.getElementById('extractor-loading');
  const stagerContainer = document.getElementById('stager-container');
  const stagerGrid = document.getElementById('stager-grid');
  const selectionCounter = document.getElementById('selection-counter');
  const selectAllBtn = document.getElementById('select-all-btn');
  const deselectAllBtn = document.getElementById('deselect-all-btn');
  const proceedBatchBtn = document.getElementById('proceed-batch-btn');
  const btnCount = document.getElementById('btn-count');
  const batchProgress = document.getElementById('batch-progress');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const batchProgressText = document.getElementById('batch-progress-text');

  let extractedMedia = [];

  if (startScrapeBtn && extractorUrlInput) {
    startScrapeBtn.addEventListener('click', async () => {
      const url = extractorUrlInput.value.trim();
      if (!url) return showToast('Please enter a URL to scrape media from.', 'warning');

      if (extractorLoading) extractorLoading.classList.remove('hidden');
      if (stagerContainer) stagerContainer.classList.add('hidden');
      startScrapeBtn.disabled = true;
      extractedMedia = [];

      try {
        const res = await fetch(`${API_BASE}/api/scrape-media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (extractorLoading) extractorLoading.classList.add('hidden');
        startScrapeBtn.disabled = false;

        if (!data.success) {
          return showToast(`Extraction Error: ${data.error}`, 'error');
        }

        if (!data.mediaItems || data.mediaItems.length === 0) {
          return showToast('No downloadable image or video assets found at this URL.', 'warning');
        }

        extractedMedia = data.mediaItems.map(item => ({ ...item, selected: true }));
        renderStagerGrid();
        if (stagerContainer) stagerContainer.classList.remove('hidden');

      } catch (err) {
        if (extractorLoading) extractorLoading.classList.add('hidden');
        startScrapeBtn.disabled = false;
        showToast(`Scrape error: ${err.message}`, 'error');
      }
    });
  }

  function renderStagerGrid() {
    if (!stagerGrid) return;
    stagerGrid.innerHTML = '';
    extractedMedia.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = `media-card ${item.selected ? 'selected' : ''}`;
      
      const proxyUrl = `${API_BASE}/api/proxy-media?url=${encodeURIComponent(item.url)}`;
      const mediaHtml = item.type === 'video'
        ? `<video src="${proxyUrl}" controls muted loop preload="metadata" referrerpolicy="no-referrer"></video>`
        : `<img src="${proxyUrl}" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='https://via.placeholder.com/300x200?text=Preview+Unavailable'">`;

      const statusBadge = item.done
        ? `<span class="media-badge done" style="background:#34a853;color:white;left:auto;right:50px;">✓ Processed</span>`
        : '';

      card.innerHTML = `
        <div class="card-media-wrapper">
          <span class="media-badge ${item.type}">${item.type}</span>
          ${statusBadge}
          <button class="remove-card-btn" data-index="${index}" title="Remove Item">✕</button>
          ${mediaHtml}
        </div>
        <div class="card-footer">
          <input type="checkbox" class="card-checkbox" data-index="${index}" ${item.selected ? 'checked' : ''} ${item.done ? 'disabled' : ''}>
          <span class="card-url-text">${escapeHtml(item.url)}</span>
        </div>
      `;

      stagerGrid.appendChild(card);
    });

    stagerGrid.querySelectorAll('.remove-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'));
        extractedMedia.splice(idx, 1);
        renderStagerGrid();
      });
    });

    stagerGrid.querySelectorAll('.card-media-wrapper').forEach((wrapper, idx) => {
      wrapper.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-card-btn')) return;
        const item = extractedMedia[idx];
        if (item) showMediaModal(item.url, item.type);
      });
    });

    stagerGrid.querySelectorAll('.card-checkbox').forEach(chk => {
      chk.addEventListener('change', () => {
        const idx = parseInt(chk.getAttribute('data-index'));
        extractedMedia[idx].selected = chk.checked;
        const card = chk.closest('.media-card');
        if (chk.checked) card.classList.add('selected');
        else card.classList.remove('selected');
        updateToolbarState();
      });
    });

    updateToolbarState();
  }

  function showMediaModal(url, type) {
    if (!modal || !markdownContainer) return;
    modal.classList.remove('hidden');
    const proxyUrl = `${API_BASE}/api/proxy-media?url=${encodeURIComponent(url)}`;
    if (type === 'video') {
      markdownContainer.innerHTML = `
        <div style="text-align:center;">
          <h3 style="color:white;margin-bottom:12px;">Full Video Preview</h3>
          <video src="${proxyUrl}" controls autoplay loop referrerpolicy="no-referrer" style="width:100%;max-height:70vh;border-radius:12px;background:#000;"></video>
          <p style="color:var(--text-secondary);font-size:0.8rem;margin-top:12px;word-break:break-all;">${escapeHtml(url)}</p>
        </div>
      `;
    } else {
      markdownContainer.innerHTML = `
        <div style="text-align:center;">
          <h3 style="color:white;margin-bottom:12px;">Full Image Preview</h3>
          <img src="${proxyUrl}" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.5);">
          <p style="color:var(--text-secondary);font-size:0.8rem;margin-top:12px;word-break:break-all;">${escapeHtml(url)}</p>
        </div>
      `;
    }
  }

  function updateToolbarState() {
    if (!selectionCounter || !btnCount || !proceedBatchBtn) return;
    const selectedCount = extractedMedia.filter(m => m.selected && !m.done).length;
    selectionCounter.textContent = `${selectedCount} of ${extractedMedia.length} selected`;
    btnCount.textContent = selectedCount;
    proceedBatchBtn.disabled = selectedCount === 0;
  }

  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      extractedMedia.forEach(m => { if (!m.done) m.selected = true; });
      renderStagerGrid();
    });
  }

  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', () => {
      extractedMedia.forEach(m => m.selected = false);
      renderStagerGrid();
    });
  }

  if (proceedBatchBtn) {
    proceedBatchBtn.addEventListener('click', async () => {
      const selectedItems = extractedMedia.filter(m => m.selected && !m.done);
      if (selectedItems.length === 0) return showToast('No un-processed items selected.', 'warning');

      proceedBatchBtn.disabled = true;
      if (batchProgress) batchProgress.classList.remove('hidden');
      
      let processedCount = 0;
      const total = selectedItems.length;

      for (let i = 0; i < total; i++) {
        const item = selectedItems[i];
        const pct = Math.round((i / total) * 100);
        if (progressBarFill) progressBarFill.style.width = `${pct}%`;
        if (batchProgressText) batchProgressText.textContent = `Processing asset ${i + 1} of ${total} (${pct}% complete)...`;

        try {
          const res = await fetch(`${API_BASE}/api/process-selected-media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [item] })
          });
          const data = await res.json();
          if (data.success && data.count > 0) {
            processedCount++;
            item.done = true;
            item.selected = false;
            renderStagerGrid();
          }
        } catch (err) {
          console.warn(`Error processing item ${i + 1}:`, err.message);
        }
      }

      if (progressBarFill) progressBarFill.style.width = '100%';
      if (batchProgressText) batchProgressText.textContent = `Completed! Processed ${processedCount} of ${total} assets.`;
      
      setTimeout(() => {
        if (batchProgress) batchProgress.classList.add('hidden');
        proceedBatchBtn.disabled = false;
        showToast(`Finished! Successfully generated design specs for ${processedCount} item(s).`, 'success');
      }, 1500);
    });
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
