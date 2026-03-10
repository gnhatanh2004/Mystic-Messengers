const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// ==================== FILE ROUTES ====================

// Upload files (multiple)
app.post('/api/files/upload', upload.array('files', 20), (req, res) => {
  try {
    const folderId = req.body.folderId || null;
    const uploadedFiles = req.files.map(file => {
      const fileData = {
        id: uuidv4(),
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        folderId: folderId,
        type: getFileType(file.mimetype),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deleted: false
      };
      return db.addFile(fileData);
    });
    res.json({ success: true, files: uploadedFiles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get files in a folder
app.get('/api/files', (req, res) => {
  const folderId = req.query.folderId || null;
  const files = db.getFiles(folderId);
  res.json({ success: true, files });
});

// Search files
app.get('/api/files/search', (req, res) => {
  const query = req.query.q || '';
  const files = db.searchFiles(query);
  res.json({ success: true, files });
});

// Get single file info
app.get('/api/files/:id', (req, res) => {
  const file = db.getFileById(req.params.id);
  if (!file) return res.status(404).json({ success: false, error: 'File not found' });
  res.json({ success: true, file });
});

// Download / view file
app.get('/api/files/:id/download', (req, res) => {
  const file = db.getFileById(req.params.id);
  if (!file) return res.status(404).json({ success: false, error: 'File not found' });
  const filePath = path.join(UPLOADS_DIR, file.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found on disk' });
  res.download(filePath, file.originalName);
});

// View file (inline)
app.get('/api/files/:id/view', (req, res) => {
  const file = db.getFileById(req.params.id);
  if (!file) return res.status(404).json({ success: false, error: 'File not found' });
  const filePath = path.join(UPLOADS_DIR, file.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found on disk' });
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
  fs.createReadStream(filePath).pipe(res);
});

// Rename file
app.patch('/api/files/:id', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Name required' });
  const updated = db.updateFile(req.params.id, { originalName: name });
  if (!updated) return res.status(404).json({ success: false, error: 'File not found' });
  res.json({ success: true, file: updated });
});

// Delete file
app.delete('/api/files/:id', (req, res) => {
  const file = db.getFileById(req.params.id);
  if (!file) return res.status(404).json({ success: false, error: 'File not found' });
  // Delete from disk
  const filePath = path.join(UPLOADS_DIR, file.storedName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.deleteFile(req.params.id);
  res.json({ success: true });
});

// ==================== TEXT FILE ROUTES ====================

// Create text file
app.post('/api/files/text', (req, res) => {
  try {
    const { name, content, folderId } = req.body;
    const fileName = name.endsWith('.txt') ? name : name + '.txt';
    const storedName = uuidv4() + '.txt';
    const filePath = path.join(UPLOADS_DIR, storedName);
    fs.writeFileSync(filePath, content || '');
    const stats = fs.statSync(filePath);
    const fileData = {
      id: uuidv4(),
      originalName: fileName,
      storedName: storedName,
      mimeType: 'text/plain',
      size: stats.size,
      folderId: folderId || null,
      type: 'text',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false
    };
    const saved = db.addFile(fileData);
    res.json({ success: true, file: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get text file content
app.get('/api/files/:id/content', (req, res) => {
  const file = db.getFileById(req.params.id);
  if (!file) return res.status(404).json({ success: false, error: 'File not found' });
  const filePath = path.join(UPLOADS_DIR, file.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found on disk' });
  const content = fs.readFileSync(filePath, 'utf-8');
  res.json({ success: true, content, file });
});

// Update text file content
app.put('/api/files/:id/content', (req, res) => {
  const { content } = req.body;
  const file = db.getFileById(req.params.id);
  if (!file) return res.status(404).json({ success: false, error: 'File not found' });
  const filePath = path.join(UPLOADS_DIR, file.storedName);
  fs.writeFileSync(filePath, content || '');
  const stats = fs.statSync(filePath);
  const updated = db.updateFile(req.params.id, { size: stats.size });
  res.json({ success: true, file: updated });
});

// ==================== FOLDER ROUTES ====================

// Create folder
app.post('/api/folders', (req, res) => {
  try {
    const { name, parentId } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Folder name required' });
    const folderData = {
      id: uuidv4(),
      name: name,
      parentId: parentId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false
    };
    const folder = db.addFolder(folderData);
    res.json({ success: true, folder });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get folders
app.get('/api/folders', (req, res) => {
  const parentId = req.query.parentId || null;
  const folders = db.getFolders(parentId);
  res.json({ success: true, folders });
});

// Get folder by ID
app.get('/api/folders/:id', (req, res) => {
  const folder = db.getFolderById(req.params.id);
  if (!folder) return res.status(404).json({ success: false, error: 'Folder not found' });
  res.json({ success: true, folder });
});

// Rename folder
app.patch('/api/folders/:id', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Name required' });
  const updated = db.updateFolder(req.params.id, { name });
  if (!updated) return res.status(404).json({ success: false, error: 'Folder not found' });
  res.json({ success: true, folder: updated });
});

// Delete folder
app.delete('/api/folders/:id', (req, res) => {
  const result = db.deleteFolder(req.params.id);
  if (!result) return res.status(404).json({ success: false, error: 'Folder not found' });
  res.json({ success: true });
});

// ==================== HELPERS ====================

function getFileType(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('text/')) return 'text';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf')) return 'pdf';
  return 'other';
}

// Start server
app.listen(PORT, () => {
  console.log(`Mystic Cloud Storage running at http://localhost:${PORT}`);
});
