// ===== State =====
let currentFolderId = null;
let folderHistory = []; // stack of { id, name }
let viewMode = 'grid'; // 'grid' or 'list'
let contextTarget = null; // { type: 'file'|'folder', data: {...} }
let editingFileId = null;
let currentFiles = []; // files in current view (for preview navigation)
let previewIndex = -1; // current preview index in currentFiles
let previewFileId = null;

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  loadContent();
  setupDragDrop();
  setupClickOutside();
  createToastContainer();
  setupPreviewPanel();
});

// ===== API Helpers =====
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  return res.json();
}

// ===== Navigation =====
function navigateToRoot() {
  currentFolderId = null;
  folderHistory = [];
  updateBreadcrumb();
  loadContent();
  setActiveNav('files');
}

function navigateToFolder(folderId, folderName) {
  const existingIndex = folderHistory.findIndex(f => f.id === folderId);
  if (existingIndex !== -1) {
    folderHistory = folderHistory.slice(0, existingIndex + 1);
  } else {
    folderHistory.push({ id: folderId, name: folderName });
  }
  currentFolderId = folderId;
  updateBreadcrumb();
  loadContent();
}

function updateBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  let html = `<span class="breadcrumb-item" onclick="navigateToRoot()"><i class="fas fa-home"></i> My Files</span>`;
  folderHistory.forEach((folder) => {
    html += `<span class="breadcrumb-separator"><i class="fas fa-chevron-right"></i></span>`;
    html += `<span class="breadcrumb-item" onclick="navigateToFolder('${folder.id}', '${escapeHtml(folder.name)}')">${escapeHtml(folder.name)}</span>`;
  });
  bc.innerHTML = html;
}

// ===== Load Content =====
async function loadContent() {
  const contentArea = document.getElementById('contentArea');
  const folderParam = currentFolderId ? `?parentId=${currentFolderId}` : '';
  const fileParam = currentFolderId ? `?folderId=${currentFolderId}` : '';

  const [foldersRes, filesRes] = await Promise.all([
    api(`/api/folders${folderParam}`),
    api(`/api/files${fileParam}`)
  ]);

  const folders = foldersRes.folders || [];
  const files = filesRes.files || [];
  currentFiles = files; // Store for preview navigation

  if (folders.length === 0 && files.length === 0) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-cloud-upload-alt"></i>
        <h3>No files yet</h3>
        <p>Upload files, create folders, or create text files to get started</p>
      </div>`;
    return;
  }

  let html = '';

  if (folders.length > 0) {
    html += `<div class="section-header">Folders</div>`;
    html += viewMode === 'grid' ? renderFolderGrid(folders) : renderFolderList(folders);
  }

  if (files.length > 0) {
    html += `<div class="section-header">Files</div>`;
    html += viewMode === 'grid' ? renderFileGrid(files) : renderFileList(files);
  }

  contentArea.innerHTML = html;
}

// ===== Render Functions =====
function renderFolderGrid(folders) {
  return `<div class="file-grid">${folders.map(f => `
    <div class="file-card" ondblclick="navigateToFolder('${f.id}', '${escapeHtml(f.name)}')"
         oncontextmenu="showContextMenu(event, 'folder', ${escapeAttr(JSON.stringify(f))})">
      <div class="card-actions">
        <button class="card-action-btn" onclick="event.stopPropagation(); showRenameModal('folder', ${escapeAttr(JSON.stringify(f))})" title="Rename">
          <i class="fas fa-pen"></i>
        </button>
        <button class="card-action-btn delete-btn" onclick="event.stopPropagation(); deleteItem('folder', '${f.id}', '${escapeHtml(f.name)}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      <div class="icon folder"><i class="fas fa-folder"></i></div>
      <div class="name">${escapeHtml(f.name)}</div>
    </div>
  `).join('')}</div>`;
}

function renderFolderList(folders) {
  return `<div class="file-list">${folders.map(f => `
    <div class="file-row" ondblclick="navigateToFolder('${f.id}', '${escapeHtml(f.name)}')"
         oncontextmenu="showContextMenu(event, 'folder', ${escapeAttr(JSON.stringify(f))})">
      <div class="icon folder"><i class="fas fa-folder"></i></div>
      <div class="name">${escapeHtml(f.name)}</div>
      <div class="date">${formatDate(f.createdAt)}</div>
      <div class="row-actions">
        <button class="row-action-btn" onclick="event.stopPropagation(); showRenameModal('folder', ${escapeAttr(JSON.stringify(f))})" title="Rename">
          <i class="fas fa-pen"></i>
        </button>
        <button class="row-action-btn delete-btn" onclick="event.stopPropagation(); deleteItem('folder', '${f.id}', '${escapeHtml(f.name)}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('')}</div>`;
}

function renderFileGrid(files) {
  return `<div class="file-grid">${files.map(f => `
    <div class="file-card" onclick="openPreview('${f.id}')"
         oncontextmenu="showContextMenu(event, 'file', ${escapeAttr(JSON.stringify(f))})">
      <div class="card-actions">
        <button class="card-action-btn" onclick="event.stopPropagation(); showRenameModal('file', ${escapeAttr(JSON.stringify(f))})" title="Rename">
          <i class="fas fa-pen"></i>
        </button>
        <button class="card-action-btn" onclick="event.stopPropagation(); window.open('/api/files/${f.id}/download','_blank')" title="Download">
          <i class="fas fa-download"></i>
        </button>
        <button class="card-action-btn delete-btn" onclick="event.stopPropagation(); deleteItem('file', '${f.id}', '${escapeHtml(f.originalName)}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      ${f.type === 'image' ? `<img class="thumbnail" src="/api/files/${f.id}/view" alt="" loading="lazy">` : `<div class="icon ${f.type}"><i class="${getFileIcon(f.type)}"></i></div>`}
      <div class="name">${escapeHtml(f.originalName)}</div>
      <div class="meta">${formatSize(f.size)}</div>
    </div>
  `).join('')}</div>`;
}

function renderFileList(files) {
  return `<div class="file-list">${files.map(f => `
    <div class="file-row" onclick="openPreview('${f.id}')"
         oncontextmenu="showContextMenu(event, 'file', ${escapeAttr(JSON.stringify(f))})">
      <div class="icon ${f.type}"><i class="${getFileIcon(f.type)}"></i></div>
      <div class="name">${escapeHtml(f.originalName)}</div>
      <div class="meta">${formatSize(f.size)}</div>
      <div class="date">${formatDate(f.createdAt)}</div>
      <div class="row-actions">
        <button class="row-action-btn" onclick="event.stopPropagation(); showRenameModal('file', ${escapeAttr(JSON.stringify(f))})" title="Rename">
          <i class="fas fa-pen"></i>
        </button>
        <button class="row-action-btn" onclick="event.stopPropagation(); window.open('/api/files/${f.id}/download','_blank')" title="Download">
          <i class="fas fa-download"></i>
        </button>
        <button class="row-action-btn delete-btn" onclick="event.stopPropagation(); deleteItem('file', '${f.id}', '${escapeHtml(f.originalName)}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('')}</div>`;
}

// ===== Delete Item (direct) =====
async function deleteItem(type, id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  const endpoint = type === 'file' ? `/api/files/${id}` : `/api/folders/${id}`;
  await api(endpoint, { method: 'DELETE' });
  loadContent();
  showToast(`${type === 'file' ? 'File' : 'Folder'} deleted`, 'success');
}

// ===== File Upload =====
async function handleFileUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  if (currentFolderId) {
    formData.append('folderId', currentFolderId);
  }

  const progressBar = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('progressFill');
  const uploadStatus = document.getElementById('uploadStatus');
  progressBar.style.display = 'block';
  progressFill.style.width = '0%';
  uploadStatus.textContent = `Uploading ${files.length} file(s)...`;

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = pct + '%';
        uploadStatus.textContent = `Uploading... ${pct}%`;
      }
    };

    xhr.onload = () => {
      progressFill.style.width = '100%';
      uploadStatus.textContent = 'Upload complete!';
      setTimeout(() => { progressBar.style.display = 'none'; }, 1500);
      loadContent();
      showToast('Files uploaded successfully', 'success');
    };

    xhr.onerror = () => {
      progressBar.style.display = 'none';
      showToast('Upload failed', 'error');
    };

    xhr.send(formData);
  } catch (err) {
    progressBar.style.display = 'none';
    showToast('Upload failed: ' + err.message, 'error');
  }

  event.target.value = '';
}

// ===== Drag & Drop =====
function setupDragDrop() {
  let dragCounter = 0;
  const overlay = document.createElement('div');
  overlay.className = 'drop-overlay';
  overlay.innerHTML = '<div class="drop-overlay-text"><i class="fas fa-cloud-upload-alt"></i> Drop files to upload</div>';
  document.body.appendChild(overlay);

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    overlay.classList.add('active');
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) overlay.classList.remove('active');
  });

  document.addEventListener('dragover', (e) => e.preventDefault());

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.remove('active');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const input = document.getElementById('fileInput');
      const dt = new DataTransfer();
      for (let i = 0; i < files.length; i++) dt.items.add(files[i]);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    }
  });
}

// ===== Google Drive-style Preview =====
function setupPreviewPanel() {
  document.getElementById('previewCloseBtn').onclick = closePreview;
  document.getElementById('previewOverlay').onclick = (e) => {
    if (e.target.id === 'previewOverlay') closePreview();
  };
  document.getElementById('prevFileBtn').onclick = () => navigatePreview(-1);
  document.getElementById('nextFileBtn').onclick = () => navigatePreview(1);
  document.getElementById('previewDownloadBtn').onclick = () => {
    if (previewFileId) window.open(`/api/files/${previewFileId}/download`, '_blank');
  };
  document.getElementById('previewDeleteBtn').onclick = async () => {
    if (!previewFileId) return;
    const file = currentFiles.find(f => f.id === previewFileId);
    const name = file ? file.originalName : 'this file';
    if (!confirm(`Delete "${name}"?`)) return;
    await api(`/api/files/${previewFileId}`, { method: 'DELETE' });
    closePreview();
    loadContent();
    showToast('File deleted', 'success');
  };
  document.getElementById('previewEditBtn').onclick = () => {
    if (!previewFileId) return;
    const file = currentFiles.find(f => f.id === previewFileId);
    closePreview();
    openTextEditor(previewFileId, file ? file.originalName : 'Text File');
  };
}

async function openPreview(fileId) {
  previewFileId = fileId;
  previewIndex = currentFiles.findIndex(f => f.id === fileId);
  const file = currentFiles.find(f => f.id === fileId);
  if (!file) return;

  // Show the panel
  document.getElementById('previewOverlay').classList.add('active');
  document.getElementById('previewFileName').textContent = file.originalName;

  // Show/hide edit button for text files
  document.getElementById('previewEditBtn').style.display = file.type === 'text' ? 'flex' : 'none';

  // Update navigation buttons
  updatePreviewNav();

  // Render the content
  await renderPreviewContent(file);
}

async function renderPreviewContent(file) {
  const container = document.getElementById('previewContent');
  container.innerHTML = '<div style="color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

  if (file.type === 'image') {
    const img = new Image();
    img.onload = () => {
      container.innerHTML = '';
      container.appendChild(img);
    };
    img.onerror = () => {
      container.innerHTML = '<div class="preview-unsupported"><i class="fas fa-exclamation-triangle"></i><p>Failed to load image</p></div>';
    };
    img.src = `/api/files/${file.id}/view`;
    img.alt = file.originalName;
  } else if (file.type === 'video') {
    container.innerHTML = `
      <video controls autoplay style="max-width:100%;max-height:100%;">
        <source src="/api/files/${file.id}/view" type="${file.mimeType}">
        Your browser does not support video playback.
      </video>`;
  } else if (file.type === 'text') {
    const res = await api(`/api/files/${file.id}/content`);
    container.innerHTML = `<pre>${escapeHtml(res.content || '(empty file)')}</pre>`;
  } else if (file.type === 'audio') {
    container.innerHTML = `
      <div style="text-align:center;">
        <i class="fas fa-music" style="font-size:4rem;color:var(--text-muted);margin-bottom:20px;display:block;"></i>
        <audio controls autoplay style="width:400px;max-width:100%;">
          <source src="/api/files/${file.id}/view" type="${file.mimeType}">
        </audio>
      </div>`;
  } else if (file.type === 'pdf') {
    container.innerHTML = `<iframe src="/api/files/${file.id}/view" style="width:100%;height:100%;border:none;border-radius:var(--radius-sm);"></iframe>`;
  } else {
    container.innerHTML = `
      <div class="preview-unsupported">
        <i class="${getFileIcon(file.type)}"></i>
        <h3 style="color:var(--text-secondary);">No preview available</h3>
        <p>This file type cannot be previewed. Click download to save it.</p>
      </div>`;
  }
}

function navigatePreview(direction) {
  const newIndex = previewIndex + direction;
  if (newIndex < 0 || newIndex >= currentFiles.length) return;
  // Stop any playing video/audio
  const media = document.querySelector('#previewContent video, #previewContent audio');
  if (media) media.pause();
  openPreview(currentFiles[newIndex].id);
}

function updatePreviewNav() {
  document.getElementById('prevFileBtn').disabled = previewIndex <= 0;
  document.getElementById('nextFileBtn').disabled = previewIndex >= currentFiles.length - 1;
}

function closePreview() {
  // Stop any playing video/audio
  const media = document.querySelector('#previewContent video, #previewContent audio');
  if (media) media.pause();
  document.getElementById('previewOverlay').classList.remove('active');
  document.getElementById('previewContent').innerHTML = '';
  previewFileId = null;
  previewIndex = -1;
}

// ===== Folder Operations =====
function showNewFolderModal() {
  document.getElementById('folderNameInput').value = '';
  openModal('newFolderModal');
  setTimeout(() => document.getElementById('folderNameInput').focus(), 100);
}

async function createFolder() {
  const name = document.getElementById('folderNameInput').value.trim();
  if (!name) return;
  await api('/api/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentId: currentFolderId })
  });
  closeModal('newFolderModal');
  loadContent();
  showToast('Folder created', 'success');
}

// ===== Text File Operations =====
function showNewTextFileModal() {
  document.getElementById('textFileNameInput').value = '';
  openModal('newTextFileModal');
  setTimeout(() => document.getElementById('textFileNameInput').focus(), 100);
}

async function createTextFile() {
  const name = document.getElementById('textFileNameInput').value.trim();
  if (!name) return;
  const res = await api('/api/files/text', {
    method: 'POST',
    body: JSON.stringify({ name, content: '', folderId: currentFolderId })
  });
  closeModal('newTextFileModal');
  loadContent();
  if (res.success) {
    openTextEditor(res.file.id, res.file.originalName);
  }
  showToast('Text file created', 'success');
}

async function openTextEditor(fileId, fileName) {
  editingFileId = fileId;
  document.getElementById('editorFileName').textContent = fileName;
  const res = await api(`/api/files/${fileId}/content`);
  document.getElementById('textEditorContent').value = res.content || '';
  openModal('textEditorModal');
  setTimeout(() => document.getElementById('textEditorContent').focus(), 100);
}

async function saveTextFile() {
  if (!editingFileId) return;
  const content = document.getElementById('textEditorContent').value;
  await api(`/api/files/${editingFileId}/content`, {
    method: 'PUT',
    body: JSON.stringify({ content })
  });
  closeModal('textEditorModal');
  loadContent();
  showToast('File saved', 'success');
}

// ===== Context Menu =====
function showContextMenu(event, type, data) {
  event.preventDefault();
  event.stopPropagation();
  contextTarget = { type, data };

  const menu = document.getElementById('contextMenu');
  menu.style.display = 'block';

  const x = Math.min(event.clientX, window.innerWidth - 200);
  const y = Math.min(event.clientY, window.innerHeight - 200);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function hideContextMenu() {
  document.getElementById('contextMenu').style.display = 'none';
  contextTarget = null;
}

function setupClickOutside() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu')) {
      hideContextMenu();
    }
  });
}

async function contextAction(action) {
  hideContextMenu();
  if (!contextTarget) return;
  const { type, data } = contextTarget;

  switch (action) {
    case 'preview':
      if (type === 'file') openPreview(data.id);
      else if (type === 'folder') navigateToFolder(data.id, data.name);
      break;
    case 'download':
      if (type === 'file') window.open(`/api/files/${data.id}/download`, '_blank');
      break;
    case 'rename':
      showRenameModal(type, data);
      break;
    case 'delete':
      await deleteItem(type, data.id, type === 'file' ? data.originalName : data.name);
      break;
  }
}

// ===== Rename =====
let renameTarget = null;

function showRenameModal(type, data) {
  renameTarget = { type, data };
  const input = document.getElementById('renameInput');
  input.value = type === 'file' ? data.originalName : data.name;
  openModal('renameModal');
  setTimeout(() => { input.focus(); input.select(); }, 100);
}

async function confirmRename() {
  if (!renameTarget) return;
  const name = document.getElementById('renameInput').value.trim();
  if (!name) return;
  const { type, data } = renameTarget;
  const endpoint = type === 'file' ? `/api/files/${data.id}` : `/api/folders/${data.id}`;
  await api(endpoint, {
    method: 'PATCH',
    body: JSON.stringify({ name })
  });
  closeModal('renameModal');
  loadContent();
  showToast('Renamed successfully', 'success');
}

// ===== Search =====
function toggleSearch() {
  const searchBox = document.getElementById('searchBox');
  const breadcrumb = document.getElementById('breadcrumb');
  const isVisible = searchBox.style.display !== 'none';

  if (isVisible) {
    searchBox.style.display = 'none';
    breadcrumb.style.display = 'flex';
    setActiveNav('files');
    loadContent();
  } else {
    searchBox.style.display = 'flex';
    breadcrumb.style.display = 'none';
    setActiveNav('search');
    setTimeout(() => document.getElementById('searchInput').focus(), 100);
  }
}

let searchTimeout;
function handleSearch(event) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    const query = event.target.value.trim();
    if (!query) {
      loadContent();
      return;
    }
    const res = await api(`/api/files/search?q=${encodeURIComponent(query)}`);
    const files = res.files || [];
    currentFiles = files; // Update for preview navigation
    const contentArea = document.getElementById('contentArea');
    if (files.length === 0) {
      contentArea.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-search"></i>
          <h3>No results found</h3>
          <p>Try a different search term</p>
        </div>`;
      return;
    }
    contentArea.innerHTML = `<div class="section-header">Search Results (${files.length})</div>` +
      (viewMode === 'grid' ? renderFileGrid(files) : renderFileList(files));
  }, 300);
}

// ===== View Toggle =====
function toggleViewMode() {
  viewMode = viewMode === 'grid' ? 'list' : 'grid';
  const icon = document.getElementById('viewIcon');
  icon.className = viewMode === 'grid' ? 'fas fa-th-large' : 'fas fa-list';
  loadContent();
}

// ===== Modal Helpers =====
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Close modals on Escape
  if (e.key === 'Escape') {
    // Close preview first if open
    if (document.getElementById('previewOverlay').classList.contains('active')) {
      closePreview();
      return;
    }
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    hideContextMenu();
  }
  // Preview navigation with arrow keys
  if (document.getElementById('previewOverlay').classList.contains('active')) {
    if (e.key === 'ArrowLeft') navigatePreview(-1);
    if (e.key === 'ArrowRight') navigatePreview(1);
  }
});

// ===== Navigation Helpers =====
function setActiveNav(view) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}

// ===== Toast Notifications =====
function createToastContainer() {
  if (!document.querySelector('.toast-container')) {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
}

function showToast(message, type = 'info') {
  const container = document.querySelector('.toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${escapeHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== Utility Functions =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getFileIcon(type) {
  const icons = {
    image: 'fas fa-image',
    video: 'fas fa-film',
    text: 'fas fa-file-alt',
    audio: 'fas fa-music',
    pdf: 'fas fa-file-pdf',
    other: 'fas fa-file'
  };
  return icons[type] || icons.other;
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return size.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
