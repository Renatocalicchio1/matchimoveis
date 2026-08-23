// Havia uma 2ª implementação de INSERT aqui (própria, direto na tabela
// `notificacoes`) que gravava em colunas que não existem de verdade no
// banco (user_id, status, acao, link, created_at — confirmado contra a
// produção via check-colunas-notificacoes.js, ago/2026): toda notificação
// de transição de workflow de visita (único chamador, ver
// services/workflow/atualizarWorkflowVisita.js) falhava silenciosa, caindo
// no catch. Em vez de duplicar/consertar a lógica de INSERT aqui, delega
// pra services/salvarNotificacao.js — a implementação já usada pelo resto
// do sistema, que grava certo nas colunas reais (usuario_id, criada_em) e
// já joga qualquer campo extra (prioridade, acao, link) dentro de `dados`
// JSONB automaticamente (mesmo padrão de catch-all já usado em
// services/salvarImovel.js).
const { criarNotificacao: _criarNotificacaoBase, lerNotificacoes } = require('../salvarNotificacao');

async function criarNotificacao(notificacao = {}) {
  const nova = {
    id: 'notif-' + Date.now(),
    tipo: notificacao.tipo || 'GERAL',
    titulo: notificacao.titulo || '',
    mensagem: notificacao.mensagem || '',
    usuarioId: notificacao.userId || '',
    leadId: notificacao.leadId || '',
    visitaId: notificacao.visitaId || '',
    imovelId: notificacao.imovelId || '',
    // Sem coluna própria — caem em `dados` JSONB via o destructure catch-all
    // de salvarNotificacao.js.
    prioridade: notificacao.prioridade || 'normal',
    status: 'pendente',
    acao: notificacao.acao || '',
    link: notificacao.link || ''
  };
  await _criarNotificacaoBase(nova);
  return nova;
}

async function loadNotificacoes(userId) {
  return lerNotificacoes(userId);
}

module.exports = { criarNotificacao, loadNotificacoes };
