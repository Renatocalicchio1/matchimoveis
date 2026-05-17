const fs = require('fs');
const path = require('path');
const { lerJSON, salvarJSON } = require('./storage');

function dataPath() {
  const DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
  return path.join(DIR, 'users.json');
}

function lerUsuarios() {
  return lerJSON(dataPath(), []);
}

function lerUsuario(userId) {
  if (!userId) return null;
  const users = lerJSON(dataPath(), []);
  return users.find(u => u.id === userId || u.userId === userId) || null;
}

async function salvarUsuario(user) {
  const uid = user.id || user.userId;
  const users = lerJSON(dataPath(), []);
  const idx = users.findIndex(u => u.id === uid || u.userId === uid);
  if (idx >= 0) users[idx] = { ...users[idx], ...user };
  else users.push(user);
  await salvarJSON(dataPath(), users);
  return user;
}

async function atualizarUsuario(userId, campos) {
  const users = lerJSON(dataPath(), []);
  const idx = users.findIndex(u => u.id === userId || u.userId === userId);
  if (idx < 0) throw new Error(`usuário ${userId} não encontrado`);
  users[idx] = { ...users[idx], ...campos };
  await salvarJSON(dataPath(), users);
  return users[idx];
}

async function salvarTodosUsuarios(users) {
  await salvarJSON(dataPath(), users);
  return users;
}

module.exports = { lerUsuarios, lerUsuario, salvarUsuario, atualizarUsuario, salvarTodosUsuarios };
