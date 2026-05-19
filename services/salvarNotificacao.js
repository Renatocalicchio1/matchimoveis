const fs = require('fs');
const path = require('path');
const { lerJSON, salvarJSON } = require('./storage');
const { query, dbOk } = require('./db');

function dataPath() {
  const DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
  return path.join(DIR, 'notificacoes.json');
}

async function lerNotificacoes(userId) {
  if (await dbOk()) {
    try {
      let sql, params;
      if (!userId) {
        sql = `SELECT * FROM notificacoes ORDER BY criado_em DESC`;
        params = [];
      } else {
        const uid = userId.id || userId;
        sql = `SELECT * FROM notificacoes WHERE usuario_id=$1 ORDER BY criado_em DESC`;
        params = [uid];
      }
      const res = await query(sql, params);
      return res.rows.map(r => ({
        id: r.id, tipo: r.tipo, titulo: r.titulo, mensagem: r.mensagem,
        usuarioId: r.usuario_id, lida: r.lida,
        leadId: r.lead_id, imovelId: r.imovel_id, visitaId: r.visita_id,
        criadaEm: r.criado_em, ...(r.dados || {})
      }));
    } catch(e) { console.error('[lerNotificacoes PG]', e.message); }
  }
  const todos = lerJSON(dataPath(), []);
  if (!userId) return todos;
  const uid = userId.id || userId;
  return todos.filter(n => n.usuarioId === uid || n.userId === uid);
}

async function criarNotificacao(notif) {
  if (await dbOk()) {
    try {
      const { id, tipo, titulo, mensagem, usuarioId, leadId, imovelId, visitaId, criadaEm, ...dados } = notif;
      await query(`
        INSERT INTO notificacoes (id,tipo,titulo,mensagem,usuario_id,lida,lead_id,imovel_id,visita_id,criada_em,dados)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO NOTHING
      `, [id||String(Date.now()), tipo||'', titulo||'', mensagem||'', usuarioId||notif.userId||'', false, leadId||'', imovelId||'', visitaId||'', criadaEm||new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}), JSON.stringify(dados)]);
      return notif;
    } catch(e) { console.error('[criarNotificacao PG]', e.message); }
  }
  const todos = lerJSON(dataPath(), []);
  todos.push(notif);
  await salvarJSON(dataPath(), todos);
  return notif;
}

async function marcarLida(id) {
  if (await dbOk()) {
    try {
      await query(`UPDATE notificacoes SET lida=true WHERE id=$1`, [id]);
      return true;
    } catch(e) { console.error('[marcarLida PG]', e.message); }
  }
  const todos = lerJSON(dataPath(), []);
  const idx = todos.findIndex(n => n.id === id);
  if (idx >= 0) { todos[idx].lida = true; await salvarJSON(dataPath(), todos); }
  return true;
}

async function marcarTodasLidas(userId) {
  if (await dbOk()) {
    try {
      await query(`UPDATE notificacoes SET lida=true WHERE usuario_id=$1`, [userId]);
      return true;
    } catch(e) { console.error('[marcarTodasLidas PG]', e.message); }
  }
  const todos = lerJSON(dataPath(), []);
  todos.forEach(n => { if (n.usuarioId === userId) n.lida = true; });
  await salvarJSON(dataPath(), todos);
  return true;
}

async function salvarJSON_notif(notifs) {
  if (await dbOk()) {
    try {
      for (const n of notifs) await criarNotificacao(n);
      return notifs;
    } catch(e) { console.error('[salvarNotificacoes PG]', e.message); }
  }
  await salvarJSON(dataPath(), notifs);
  return notifs;
}

module.exports = { lerNotificacoes, criarNotificacao, marcarLida, marcarTodasLidas, salvarJSON_notif };
