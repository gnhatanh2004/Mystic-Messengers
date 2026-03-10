const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function ensureDbExists() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initial = { files: [], folders: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
  }
}

function readDb() {
  ensureDbExists();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDb(data) {
  ensureDbExists();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// File operations
function addFile(fileData) {
  const db = readDb();
  db.files.push(fileData);
  writeDb(db);
  return fileData;
}

function getFiles(folderId = null) {
  const db = readDb();
  return db.files.filter(f => f.folderId === folderId && !f.deleted);
}

function getFileById(id) {
  const db = readDb();
  return db.files.find(f => f.id === id);
}

function updateFile(id, updates) {
  const db = readDb();
  const index = db.files.findIndex(f => f.id === id);
  if (index === -1) return null;
  db.files[index] = { ...db.files[index], ...updates, updatedAt: new Date().toISOString() };
  writeDb(db);
  return db.files[index];
}

function deleteFile(id) {
  const db = readDb();
  const index = db.files.findIndex(f => f.id === id);
  if (index === -1) return false;
  db.files[index].deleted = true;
  db.files[index].deletedAt = new Date().toISOString();
  writeDb(db);
  return true;
}

// Folder operations
function addFolder(folderData) {
  const db = readDb();
  db.folders.push(folderData);
  writeDb(db);
  return folderData;
}

function getFolders(parentId = null) {
  const db = readDb();
  return db.folders.filter(f => f.parentId === parentId && !f.deleted);
}

function getFolderById(id) {
  const db = readDb();
  return db.folders.find(f => f.id === id);
}

function updateFolder(id, updates) {
  const db = readDb();
  const index = db.folders.findIndex(f => f.id === id);
  if (index === -1) return null;
  db.folders[index] = { ...db.folders[index], ...updates, updatedAt: new Date().toISOString() };
  writeDb(db);
  return db.folders[index];
}

function deleteFolder(id) {
  const db = readDb();
  const index = db.folders.findIndex(f => f.id === id);
  if (index === -1) return false;
  db.folders[index].deleted = true;
  db.folders[index].deletedAt = new Date().toISOString();
  // Also soft-delete all files and subfolders in this folder
  db.files.forEach(f => {
    if (f.folderId === id) {
      f.deleted = true;
      f.deletedAt = new Date().toISOString();
    }
  });
  db.folders.forEach(f => {
    if (f.parentId === id) {
      f.deleted = true;
      f.deletedAt = new Date().toISOString();
    }
  });
  writeDb(db);
  return true;
}

function searchFiles(query) {
  const db = readDb();
  const lowerQuery = query.toLowerCase();
  return db.files.filter(f => !f.deleted && f.originalName.toLowerCase().includes(lowerQuery));
}

module.exports = {
  addFile, getFiles, getFileById, updateFile, deleteFile,
  addFolder, getFolders, getFolderById, updateFolder, deleteFolder,
  searchFiles
};
