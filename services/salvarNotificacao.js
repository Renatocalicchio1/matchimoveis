const fs = require('fs');
const path = require('path');
const { lerJSON, salvarJSON } = require('./storage');

function dataPath() {
  const DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
  return path.join(DIR, 'notificacoes.json');
}

function lerNotificacoes(userId) {
  const todas = lerJSON(dataPath(), []);
  if (!userId) return todas;
  return todas.filter(n => n.userId === userId);
}

async function criarNotificacao(userId, tipo, mensagem, extra = {}) {
  const todas = lerJSON(dataPath(), []);
  const nova = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    userId,
    tipo: tipo || 'info',
    mensagem,
    lida: false,
    criadoEm: new Date().toISOString(),
    ...extra
  };
  todas.push(nova);
  await salvarJSON(dataPath(), todas);
  return nova;
}

async function marcarLida(notifId, userId) {
  const todas = lerJSON(dataPath(), []);
  const idx = todas.findIndex(n => n.id === notifId && n.userId === userId);
  if (idx < 0) return null;
  todas[idx].lida = true;
  todas[idx].lidaEm = new Date().toISOString();
  await salvarJSON(dataPath(), todas);
  return todas[idx];
}

async function marcarTodasLidas(userId) {
  const todas = lerJSON(dataPath(), []);
  const agora = new Date().toISOString();
  todas.forEach(n => { if (n.userId === userId) { n.lida = true; n.lidaEm = agora; } });
  await salvarJSON(dataPath(), todas);
}

async function deletarNotificacao(notifId, userId) {
  const todas = lerJSON(dataPath(), []);
  const filtradas = todas.filter(n => !(n.id === notifId && n.userId === userId));
  await salvarJSON(dataPath(), filtradas);
  return filtradas;
}

module.exports = { lerNotificacoes, criarNotificacao, marcarLida, marcarTodasLidas, deletarNotificacao };
