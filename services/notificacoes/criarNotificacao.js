const { query, dbOk } = require('../db');

async function criarNotificacao(notificacao = {}) {
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
  if (await dbOk()) {
    try {
      await query(`
        INSERT INTO notificacoes (id, tipo, titulo, mensagem, prioridade, status, user_id, lead_id, visita_id, imovel_id, acao, link, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (id) DO NOTHING
      `, [nova.id, nova.tipo, nova.titulo, nova.mensagem, nova.prioridade, nova.status,
          nova.userId, nova.leadId, nova.visitaId, nova.imovelId, nova.acao, nova.link, nova.createdAt]);
    } catch(e) { console.error('[criarNotificacao PG]', e.message); }
  }
  return nova;
}

async function loadNotificacoes(userId) {
  if (await dbOk()) {
    try {
      const r = await query(
        `SELECT * FROM notificacoes WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [userId]
      );
      return r.rows.map(n => ({
        id: n.id, tipo: n.tipo, titulo: n.titulo, mensagem: n.mensagem,
        prioridade: n.prioridade, status: n.status, userId: n.user_id,
        leadId: n.lead_id, visitaId: n.visita_id, imovelId: n.imovel_id,
        acao: n.acao, link: n.link, createdAt: n.created_at
      }));
    } catch(e) { console.error('[loadNotificacoes PG]', e.message); }
  }
  return [];
}

module.exports = { criarNotificacao, loadNotificacoes };
