const fs = require('fs');
const path = require('path');

const MEMORY_FILE = path.join(__dirname, '..', 'olx-memory.json');

function loadMemory() {
  if (!fs.existsSync(MEMORY_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveMemory(memory) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

function getMemory(url) {
  const memory = loadMemory();
  return memory[url] || null;
}

function upsertMemory(url, data = {}) {
  const memory = loadMemory();
  memory[url] = {
    ...(memory[url] || {}),
    ...data,
    url,
    updatedAt: new Date().toISOString()
  };
  saveMemory(memory);
  return memory[url];
}

module.exports = {
  loadMemory,
  saveMemory,
  getMemory,
  upsertMemory
};
