const fs = require('fs');
const path = require('path');
const { lerJSON, salvarJSON } = require('./storage');

function dataPath() {
  const DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
  return path.join(DIR, 'data.json');
}

function lerLeads(userId) {
  const todos = lerJSON(dataPath(), []);
  if (!userId) return todos;
  return todos.filter(l => {
    // Pertence ao usuário
    const pertence = l.userId === userId || l.codigoUsuario === userId || l.corretorId === userId;
    if (!pertence) return false;
    // Não foi deletada por este usuário
    if (l.deletadoPor && l.deletadoPor.includes(userId)) return false;
    return true;
  });
}

async function salvarLead(lead) {
  const todos = lerJSON(dataPath(), []);
  const idx = todos.findIndex(l => l.id === lead.id);
  if (idx >= 0) todos[idx] = { ...todos[idx], ...lead };
  else todos.push(lead);
  await salvarJSON(dataPath(), todos);
  return lead;
}

async function atualizarLead(leadId, campos) {
  const todos = lerJSON(dataPath(), []);
  const idx = todos.findIndex(l => l.id === leadId);
  if (idx < 0) throw new Error(`lead ${leadId} não encontrado`);
  todos[idx] = { ...todos[idx], ...campos };
  await salvarJSON(dataPath(), todos);
  return todos[idx];
}

async function deletarLead(leadId) {
  const todos = lerJSON(dataPath(), []);
  const filtrados = todos.filter(l => l.id !== leadId);
  await salvarJSON(dataPath(), filtrados);
  return filtrados;
}

async function salvarTodosLeads(leads) {
  await salvarJSON(dataPath(), leads);
  return leads;
}

module.exports = { lerLeads, salvarLead, atualizarLead, deletarLead, salvarTodosLeads };
