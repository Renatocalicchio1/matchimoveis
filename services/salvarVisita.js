const fs = require('fs');
const path = require('path');
const { lerJSON, salvarJSON } = require('./storage');
const { query, dbOk } = require('./db');

function visitasPath() {
  const DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
  return path.join(DIR, 'visitas.json');
}

function rowToVisita(r) {
  return {
    id: r.id,
    leadId: r.lead_id,
    nome: r.nome,
    telefone: r.telefone,
    contato: r.contato,
    imovelId: r.imovel_id,
    imovelTitulo: r.imovel_titulo,
    imovelBairro: r.imovel_bairro,
    dataVisita: r.data_visita,
    horaVisita: r.hora_visita,
    status: r.status,
    origem: r.origem,
    userId: r.user_id,
    corretorId: r.corretor_id,
    ownerUserId: r.owner_user_id,
    imovelUsuarioId: r.imovel_usuario_id,
    proprietarioNome: r.proprietario_nome,
    proprietarioTelefone: r.proprietario_telefone,
    respostaProprietario: r.resposta_proprietario,
    confirmacaoClienteStatus: r.confirmacao_cliente_status,
    obs: r.obs,
    data: r.criado_em,
    createdAt: r.criado_em,
    ...(r.dados || {})
  };
}

function visitaToRow(v) {
  const dados = { ...v };
  ['id','leadId','nome','telefone','contato','imovelId','imovelTitulo','imovelBairro','dataVisita','horaVisita','status','origem','userId','corretorId','ownerUserId','imovelUsuarioId','proprietarioNome','proprietarioTelefone','respostaProprietario','confirmacaoClienteStatus','obs','data','createdAt'].forEach(k => delete dados[k]);
  return {
    id: v.id || String(Date.now()),
    lead_id: v.leadId || v.lead_id || null,
    nome: v.nome || '',
    telefone: (v.telefone||'').replace(/\D/g,''),
    contato: (v.contato||v.telefone||'').replace(/\D/g,''),
    imovel_id: v.imovelId || v.imovel_id || null,
    imovel_titulo: v.imovelTitulo || '',
    imovel_bairro: v.imovelBairro || '',
    data_visita: v.dataVisita || null,
    hora_visita: v.horaVisita || null,
    status: v.status || 'solicitada',
    origem: v.origem || 'sistema',
    user_id: v.userId || v.user_id || null,
    corretor_id: v.corretorId || null,
    owner_user_id: v.ownerUserId || null,
    imovel_usuario_id: v.imovelUsuarioId || null,
    proprietario_nome: v.proprietarioNome || '',
    proprietario_telefone: (v.proprietarioTelefone||'').replace(/\D/g,''),
    resposta_proprietario: v.respostaProprietario || null,
    confirmacao_cliente_status: v.confirmacaoClienteStatus || null,
    obs: v.obs || '',
    dados: JSON.stringify(dados)
  };
}

async function lerVisitas(user) {
  const userId = user && (user.id || user);
  if (await dbOk()) {
    try {
      let sql, params;
      if (!userId) {
        sql = `SELECT * FROM visitas ORDER BY criado_em DESC`;
        params = [];
      } else {
        sql = `SELECT * FROM visitas WHERE user_id=$1 OR owner_user_id=$1 OR corretor_id=$1 ORDER BY criado_em DESC`;
        params = [userId];
      }
      const res = await query(sql, params);
      return res.rows.map(rowToVisita);
    } catch(e) {
      console.error('[lerVisitas PG]', e.message);
    }
  }
  const todos = lerJSON(visitasPath(), []);
  if (!userId) return todos;
  return todos.filter(v => String(v.userId||v.ownerUserId||v.corretorId||'') === String(userId));
}

async function salvarVisita(visita) {
  if (await dbOk()) {
    try {
      const r = visitaToRow(visita);
      await query(`
        INSERT INTO visitas (id,lead_id,nome,telefone,contato,imovel_id,imovel_titulo,imovel_bairro,data_visita,hora_visita,status,origem,user_id,corretor_id,owner_user_id,imovel_usuario_id,proprietario_nome,proprietario_telefone,resposta_proprietario,confirmacao_cliente_status,obs,dados)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT (id) DO UPDATE SET
          lead_id=EXCLUDED.lead_id, nome=EXCLUDED.nome, telefone=EXCLUDED.telefone,
          status=EXCLUDED.status, data_visita=EXCLUDED.data_visita, hora_visita=EXCLUDED.hora_visita,
          resposta_proprietario=EXCLUDED.resposta_proprietario,
          confirmacao_cliente_status=EXCLUDED.confirmacao_cliente_status,
          obs=EXCLUDED.obs, dados=EXCLUDED.dados, atualizado_em=NOW()
      `, [r.id,r.lead_id,r.nome,r.telefone,r.contato,r.imovel_id,r.imovel_titulo,r.imovel_bairro,r.data_visita,r.hora_visita,r.status,r.origem,r.user_id,r.corretor_id,r.owner_user_id,r.imovel_usuario_id,r.proprietario_nome,r.proprietario_telefone,r.resposta_proprietario,r.confirmacao_cliente_status,r.obs,r.dados]);
      return visita;
    } catch(e) {
      console.error('[salvarVisita PG]', e.message);
    }
  }
  const todos = lerJSON(visitasPath(), []);
  const idx = todos.findIndex(v => v.id === visita.id);
  if (idx >= 0) todos[idx] = { ...todos[idx], ...visita };
  else todos.push(visita);
  await salvarJSON(visitasPath(), todos);
  return visita;
}

async function atualizarVisita(visitaId, campos) {
  if (await dbOk()) {
    try {
      const res = await query(`SELECT * FROM visitas WHERE id=$1`, [visitaId]);
      if (res.rows.length === 0) throw new Error(`visita ${visitaId} não encontrada`);
      const visitaAtual = rowToVisita(res.rows[0]);
      return await salvarVisita({ ...visitaAtual, ...campos });
    } catch(e) {
      console.error('[atualizarVisita PG]', e.message);
    }
  }
  const todos = lerJSON(visitasPath(), []);
  const idx = todos.findIndex(v => v.id === visitaId);
  if (idx < 0) throw new Error(`visita ${visitaId} não encontrada`);
  todos[idx] = { ...todos[idx], ...campos };
  await salvarJSON(visitasPath(), todos);
  return todos[idx];
}

async function deletarVisita(visitaId) {
  if (await dbOk()) {
    try {
      await query(`DELETE FROM visitas WHERE id=$1`, [visitaId]);
      return true;
    } catch(e) {
      console.error('[deletarVisita PG]', e.message);
    }
  }
  const todos = lerJSON(visitasPath(), []);
  const filtrados = todos.filter(v => v.id !== visitaId);
  await salvarJSON(visitasPath(), todos);
  return filtrados;
}

async function salvarTodasVisitas(visitas) {
  if (await dbOk()) {
    try {
      for (const v of visitas) await salvarVisita(v);
      return visitas;
    } catch(e) {
      console.error('[salvarTodasVisitas PG]', e.message);
    }
  }
  await salvarJSON(visitasPath(), visitas);
  return visitas;
}

module.exports = { lerVisitas, salvarVisita, atualizarVisita, deletarVisita, salvarTodasVisitas };
