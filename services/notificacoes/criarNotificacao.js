const fs = require('fs');
const path = require('path');

const DATA_DIR =
  process.env.RENDER
    ? '/opt/render/project/src/data'
    : '.';

const notificacoesFile = path.join(DATA_DIR, 'notificacoes.json');

function loadNotificacoes() {
  if (!fs.existsSync(notificacoesFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(notificacoesFile, 'utf8'));
  } catch {
    return [];
  }
}

function saveNotificacoes(data) {
  fs.writeFileSync(notificacoesFile, JSON.stringify(data, null, 2));
}

function criarNotificacao(notificacao = {}) {
  const notificacoes = loadNotificacoes();

  const nova = {
    id: 'notif-' + Date.now(),
    tipo: notificacao.tipo || 'GERAL',
    titulo: notificacao.titulo || '',
    mensagem: notificacao.mensagem || '',
    prioridade: notificacao.prioridade || 'normal',
    status: 'pendente',

    userId: notificacao.userId || '',
    leadId: notificacao.leadId || '',
    visitaId: notificacao.visitaId || '',
    imovelId: notificacao.imovelId || '',

    acao: notificacao.acao || '',
    link: notificacao.link || '',

    createdAt: new Date().toISOString()
  };

  notificacoes.unshift(nova);

  saveNotificacoes(notificacoes);

  return nova;
}

module.exports = {
  criarNotificacao,
  loadNotificacoes
};
