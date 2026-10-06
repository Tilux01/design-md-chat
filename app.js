const API_BASE = window.API_BASE_URL || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? '' 
    : 'https://design-md-backend.vercel.app'
);

document.addEventListener('DOMContentLoaded', () => {
  const chatHistory = document.getElementById('chat-history');
  const welcomeCard = document.getElementById('welcome-card');
  const chatInput = document.getElementById('chat-input');
  const submitBtn = document.getElementById('submit-btn');
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('file-input');
  const uploadPreview = document.getElementById('upload-preview');
  const previewItems = document.getElementById('preview-items');
  const clearPreviewBtn = document.getElementById('clear-preview-btn');

  let selectedFiles = [];

  // Toast System
  function showToast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // Suggestion Chips
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chatInput.value = chip.textContent.trim();
      updateSubmitButton();
      handleSend();
    });
  });

  // Enable/Disable Submit Button
  chatInput.addEventListener('input', updateSubmitButton);

  function updateSubmitButton() {
    const hasText = chatInput.value.trim().length > 0;
    const hasFiles = selectedFiles.length > 0;
    submitBtn.disabled = !(hasText || hasFiles);
  }

  // File Upload Handlers
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      selectedFiles = [...selectedFiles, ...files];
      renderPreview();
    }
  });

  clearPreviewBtn.addEventListener('click', () => {
    selectedFiles = [];
    fileInput.value = '';
    uploadPreview.classList.add('hidden');
    updateSubmitButton();
  });

  function renderPreview() {
    previewItems.innerHTML = '';
    selectedFiles.forEach(f => {
      const el = f.type.startsWith('image/')
        ? document.createElement('img')
        : document.createElement('video');
      el.src = URL.createObjectURL(f);
      previewItems.appendChild(el);
    });
    uploadPreview.classList.remove('hidden');
    updateSubmitButton();
  }

  // Keyboard Enter
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !submitBtn.disabled) {
      e.preventDefault();
      handleSend();
    }
  });

  submitBtn.addEventListener('click', handleSend);

  async function handleSend() {
    const text = chatInput.value.trim();
    const filesToUpload = [...selectedFiles];
    if (!text && filesToUpload.length === 0) return;

    if (welcomeCard) welcomeCard.remove();

    // Reset Input
    chatInput.value = '';
    selectedFiles = [];
    fileInput.value = '';
    uploadPreview.classList.add('hidden');
    updateSubmitButton();

    appendUserMessage(text, filesToUpload);

    const typingId = appendTypingIndicator();
    scrollToBottom();

    const isUrl = text.startsWith('http://') || text.startsWith('https://');

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
          body: JSON.stringify({ prompt: text })
        });
      }

      const result = await response.json();
      removeTypingIndicator(typingId);

      if (result.success) {
        if (result.type === 'info') {
          appendSystemMessage(result.message);
        } else if (result.type === 'design_response') {
          appendAiMessage(result.markdown);
        } else {
          const fileId = result.new_design.id;
          const mdRes = await fetch(`${API_BASE}/api/designs/${fileId}`);
          const mdText = await mdRes.text();
          appendAiMessage(mdText);
        }
      } else {
        appendSystemMessage(`Extraction failed: ${result.error}`);
      }
    } catch (err) {
      removeTypingIndicator(typingId);
      appendSystemMessage(`Network error: ${err.message}`);
    }

    scrollToBottom();
  }

  function appendUserMessage(text, files) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message user-message';
    let contentHtml = '';
    if (text) contentHtml += `<p>${text}</p>`;

    wrapper.innerHTML = `
      <div class="avatar user-avatar">U</div>
      <div class="message-content">${contentHtml}</div>
    `;
    chatHistory.appendChild(wrapper);
  }

  function appendAiMessage(markdownContent) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message ai-message';

    const parsedHtml = marked.parse(markdownContent);
    const isTemplate = markdownContent.includes('# 1.') || markdownContent.includes('# Design');

    let templateBanner = '';
    if (isTemplate) {
      templateBanner = `
        <div class="copy-spec-banner">
          <span>✦ Copyable Design.Md Template</span>
          <button class="copy-btn copy-full-spec-btn">Copy Full Template</button>
        </div>
      `;
    }

    wrapper.innerHTML = `
      <div class="avatar ai-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
      </div>
      <div class="message-content markdown-body">
        ${templateBanner}
        <div class="markdown-body-inner">${parsedHtml}</div>
      </div>
    `;

    chatHistory.appendChild(wrapper);

    // Attach Copy Handlers
    const fullCopyBtn = wrapper.querySelector('.copy-full-spec-btn');
    if (fullCopyBtn) {
      fullCopyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(markdownContent);
        fullCopyBtn.textContent = '✓ Copied Spec!';
        showToast('Copied full design template to clipboard!', 'success');
        setTimeout(() => fullCopyBtn.textContent = 'Copy Full Template', 2500);
      });
    }

    // Attach Code Copy Handlers
    wrapper.querySelectorAll('pre').forEach(pre => {
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
        showToast('Copied code block!', 'success');
        setTimeout(() => btn.textContent = 'Copy Code', 2000);
      });

      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(btn);
      wrap.appendChild(pre);
    });

    setTimeout(scrollToBottom, 50);
  }

  function appendSystemMessage(text) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message ai-message';
    wrapper.innerHTML = `
      <div class="avatar ai-avatar" style="color: #ef4444">!</div>
      <div class="message-content" style="color: #ef4444">${text}</div>
    `;
    chatHistory.appendChild(wrapper);
  }

  function appendTypingIndicator() {
    const id = 'typing-' + Date.now();
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message ai-message';
    wrapper.id = id;
    wrapper.innerHTML = `
      <div class="avatar ai-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
      </div>
      <div class="message-content">
        <span style="color:var(--text-secondary);font-size:0.9rem;">Generating design specification...</span>
      </div>
    `;
    chatHistory.appendChild(wrapper);
    return id;
  }

  function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function scrollToBottom() {
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }
});
