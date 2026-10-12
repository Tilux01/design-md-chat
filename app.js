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

  let currentFiles = [];

  // Auto resize scroll
  function scrollToBottom() {
    chatHistory.scrollTo({ top: chatHistory.scrollHeight, behavior: 'smooth' });
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

  // Submit Action
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const text = chatInput ? chatInput.value.trim() : '';
      const filesToUpload = [...currentFiles];
      
      // Clear Input UI
      if (chatInput) chatInput.value = '';
      if (clearPreviewBtn) clearPreviewBtn.click();
      
      // Determine if it's a URL or File upload
      const isUrl = text.startsWith('http://') || text.startsWith('https://');
      
      // Add User Message to Chat
      appendUserMessage(text, filesToUpload);

      // Add Loading Indicator
      const typingId = appendTypingIndicator();
      scrollToBottom();

      try {
        let response;
        if (filesToUpload.length > 0) {
          // File Upload
          const formData = new FormData();
          filesToUpload.forEach(f => formData.append('designFiles', f));
          response = await fetch(`${API_BASE}/api/upload-design`, { method: 'POST', body: formData });
        } else if (isUrl) {
          // URL Process
          response = await fetch(`${API_BASE}/api/process-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: text })
          });
        } else {
          // Plain text chat prompt -> RAG search for matching design
          response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text })
          });
        }

        const result = await response.json();
        removeTypingIndicator(typingId);

        if (result.success) {
          if (result.type === 'info') {
            appendSystemMessage(result.message);
          } else if (result.type === 'design_response') {
            const content = `> 💡 **AI Match Note:** ${result.explanation}\n\n---\n\n${result.markdown}`;
            appendAiMessage(content, result.markdown, result.design_id);
          } else {
            // File upload / URL processing fallback
            const fileId = result.new_design.id;
            const mdRes = await fetch(`${API_BASE}/api/designs/${fileId}`);
            const mdText = await mdRes.text();
            appendAiMessage(mdText, mdText, fileId);
          }
        } else {
          appendSystemMessage(`Extraction failed: ${result.error || 'Unknown error'}`);
        }

      } catch (err) {
        removeTypingIndicator(typingId);
        appendSystemMessage(`Network error: ${err.message}`);
      }
      
      scrollToBottom();
    });
  }

  // Chat Rendering Helpers
  function appendUserMessage(text, files) {
    if (!chatHistory) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message user-message';
    
    let contentHtml = '';
    if (text) contentHtml += `<p>${escapeHtml(text)}</p>`;
    
    if (files && files.length > 0) {
      contentHtml += `<div class="chat-media-grid">`;
      files.forEach(f => {
        contentHtml += f.type.startsWith('image/') 
          ? `<img src="${URL.createObjectURL(f)}">`
          : `<video src="${URL.createObjectURL(f)}"></video>`;
      });
      contentHtml += `</div>`;
    }

    wrapper.innerHTML = `
      <div class="avatar user-avatar">U</div>
      <div class="message-content">${contentHtml}</div>
    `;
    chatHistory.appendChild(wrapper);
  }

  function appendAiMessage(renderedContent, rawMarkdown = null, designId = null) {
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

    setTimeout(scrollToBottom, 50);
  }

  function appendSystemMessage(text) {
    if (!chatHistory) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message ai-message';
    wrapper.innerHTML = `
      <div class="avatar ai-avatar" style="color: #ef4444">!</div>
      <div class="message-content" style="color: #ef4444">${escapeHtml(text)}</div>
    `;
    chatHistory.appendChild(wrapper);
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
});
