const fs = require('fs');
const path = require('path');

const DATA_DIR =
  process.env.RENDER
    ? '/opt/render/project/src/data'
    : '.';

const memoriaFile = path.join(DATA_DIR, 'memoria-operacional.json');

function loadMemoria() {
  if (!fs.existsSync(memoriaFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(memoriaFile, 'utf8'));
  } catch {
    return [];
  }
}

function saveMemoria(data) {
  fs.writeFileSync(memoriaFile, JSON.stringify(data, null, 2));
}

function registrarEvento(evento = {}) {
  const memoria = loadMemoria();

  const novoEvento = {
    id: 'mem-' + Date.now(),
    tipo: evento.tipo || 'EVENTO',
    leadId: evento.leadId || '',
    visitaId: evento.visitaId || '',
    imovelId: evento.imovelId || '',
    userId: evento.userId || '',
    descricao: evento.descricao || '',
    origem: evento.origem || 'sistema',
    payload: evento.payload || {},
    createdAt: new Date().toISOString()
  };

  memoria.unshift(novoEvento);

  saveMemoria(memoria);

  return novoEvento;
}

module.exports = {
  registrarEvento,
  loadMemoria
};
