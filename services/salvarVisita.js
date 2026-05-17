const fs = require('fs');
const path = require('path');
const { lerJSON, salvarJSON } = require('./storage');

function dataPath() {
  const DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
  return path.join(DIR, 'visitas.json');
}

function lerVisitas(userId) {
  const todas = lerJSON(dataPath(), []);
  if (!userId) return todas;
  return todas.filter(v => v.userId === userId || v.corretorId === userId || v.ownerUserId === userId);
}

async function salvarVisita(visita) {
  const todas = lerJSON(dataPath(), []);
  const idx = todas.findIndex(v => v.id === visita.id);
  if (idx >= 0) todas[idx] = { ...todas[idx], ...visita };
  else todas.push(visita);
  await salvarJSON(dataPath(), todas);
  return visita;
}

async function atualizarVisita(visitaId, campos) {
  const todas = lerJSON(dataPath(), []);
  const idx = todas.findIndex(v => v.id === visitaId);
  if (idx < 0) throw new Error(`visita ${visitaId} não encontrada`);
  todas[idx] = { ...todas[idx], ...campos };
  await salvarJSON(dataPath(), todas);
  return todas[idx];
}

async function deletarVisita(visitaId) {
  const todas = lerJSON(dataPath(), []);
  const filtradas = todas.filter(v => v.id !== visitaId);
  await salvarJSON(dataPath(), filtradas);
  return filtradas;
}

async function salvarTodasVisitas(visitas) {
  await salvarJSON(dataPath(), visitas);
  return visitas;
}

module.exports = { lerVisitas, salvarVisita, atualizarVisita, deletarVisita, salvarTodasVisitas };
