const fs = require('fs');
const path = require('path');
const { lerJSON, salvarJSON } = require('./storage');
const { query, dbOk } = require('./db');

function dataPath() {
  const DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
  return path.join(DIR, 'data.json');
}

// Converte row do banco para objeto lead
function rowToLead(r) {
  return {
    id: r.id,
    nome: r.nome,
    telefone: r.telefone,
    whatsapp: r.whatsapp,
    contato: r.contato,
    origem: r.origem,
    status: r.status,
    faseFunil: r.fase_funil,
    temperatura: r.temperatura,
    score: r.score,
    userId: r.user_id,
    codigoUsuario: r.codigo_usuario,
    tipoLead: r.tipo_lead,
    perfilIA: r.perfil_ia || {},
    mensagens: r.mensagens || [],
    matches: r.matches || [],
    matchesAuto: r.matches_auto || [],
    matchesBase: r.matches_base || [],
    historico: r.historico || [],
    timeline: r.timeline || [],
    eventos: r.eventos || [],
    followUps: r.follow_ups || [],
    deletadoPor: r.deletado_por || [],
    vitrineEnviada: r.vitrine_enviada,
    vitrineEnviadaEm: r.vitrine_enviada_em,
    visitaAgendada: r.visita_agendada,
    visitaAgendadaEm: r.visita_agendada_em,
    imovelVendedor: r.imovel_vendedor,
    comissaoParceiro: r.comissao_parceiro,
    cicloAnterior: r.ciclo_anterior,
    cicloSeguinte: r.ciclo_seguinte,
    criadoEm: r.criado_em,
    data_cadastro: r.criado_em,
    ...(r.dados || {})
  };
}

// Converte objeto lead para colunas do banco
function leadToRow(lead) {
  const dados = { ...lead };
  const campos = ['id','nome','telefone','whatsapp','contato','origem','status','faseFunil','temperatura','score','userId','codigoUsuario','tipoLead','perfilIA','mensagens','matches','matchesAuto','matchesBase','historico','timeline','eventos','followUps','deletadoPor','vitrineEnviada','vitrineEnviadaEm','visitaAgendada','visitaAgendadaEm','imovelVendedor','comissaoParceiro','cicloAnterior','cicloSeguinte','criadoEm','data_cadastro'];
  campos.forEach(k => delete dados[k]);
  return {
    id: lead.id || String(Date.now()),
    nome: lead.nome || '',
    telefone: lead.telefone || '',
    whatsapp: lead.whatsapp || '',
    contato: lead.contato || '',
    origem: lead.origem || 'whatsapp',
    status: lead.status || 'novo',
    fase_funil: lead.faseFunil || 'novo',
    temperatura: lead.temperatura || 'frio',
    score: lead.score || 0,
    user_id: lead.userId || lead.codigoUsuario || lead.corretorId || null,
    codigo_usuario: lead.codigoUsuario || lead.userId || null,
    tipo_lead: lead.tipoLead || 'cliente',
    perfil_ia: JSON.stringify(lead.perfilIA || {}),
    mensagens: JSON.stringify(lead.mensagens || []),
    matches: JSON.stringify(lead.matches || []),
    matches_auto: JSON.stringify(lead.matchesAuto || []),
    matches_base: JSON.stringify(lead.matchesBase || []),
    historico: JSON.stringify(lead.historico || []),
    timeline: JSON.stringify(lead.timeline || []),
    eventos: JSON.stringify(lead.eventos || []),
    follow_ups: JSON.stringify(lead.followUps || []),
    deletado_por: JSON.stringify(lead.deletadoPor || []),
    vitrine_enviada: lead.vitrineEnviada || false,
    vitrine_enviada_em: lead.vitrineEnviadaEm || null,
    visita_agendada: lead.visitaAgendada || false,
    visita_agendada_em: lead.visitaAgendadaEm || null,
    imovel_vendedor: lead.imovelVendedor ? JSON.stringify(lead.imovelVendedor) : null,
    comissao_parceiro: lead.comissaoParceiro || null,
    ciclo_anterior: lead.cicloAnterior || null,
    ciclo_seguinte: lead.cicloSeguinte || null,
    dados: JSON.stringify(dados)
  };
}

async function lerLeads(userId) {
  if (await dbOk()) {
    try {
      let sql, params;
      if (!userId) {
        sql = `SELECT * FROM leads ORDER BY criado_em DESC`;
        params = [];
      } else {
        sql = `SELECT * FROM leads WHERE (user_id=$1 OR codigo_usuario=$1) AND NOT (deletado_por @> $2::jsonb) ORDER BY criado_em DESC`;
        params = [userId, JSON.stringify([userId])];
      }
      const res = await query(sql, params);
      return res.rows.map(rowToLead);
    } catch(e) {
      console.error('[lerLeads PG]', e.message);
    }
  }
  // Fallback JSON
  const todos = lerJSON(dataPath(), []);
  if (!userId) return todos;
  return todos.filter(l => {
    const pertence = l.userId === userId || l.codigoUsuario === userId || l.corretorId === userId;
    if (!pertence) return false;
    if (l.deletadoPor && l.deletadoPor.includes(userId)) return false;
    return true;
  });
}

async function salvarLead(lead) {
  if (await dbOk()) {
    try {
      const r = leadToRow(lead);
      await query(`
        INSERT INTO leads (id,nome,telefone,whatsapp,contato,origem,status,fase_funil,temperatura,score,user_id,codigo_usuario,tipo_lead,perfil_ia,mensagens,matches,matches_auto,matches_base,historico,timeline,eventos,follow_ups,deletado_por,vitrine_enviada,vitrine_enviada_em,visita_agendada,visita_agendada_em,imovel_vendedor,comissao_parceiro,ciclo_anterior,ciclo_seguinte,dados)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
        ON CONFLICT (id) DO UPDATE SET
          nome=EXCLUDED.nome, telefone=EXCLUDED.telefone, whatsapp=EXCLUDED.whatsapp,
          contato=EXCLUDED.contato, origem=EXCLUDED.origem, status=EXCLUDED.status,
          fase_funil=EXCLUDED.fase_funil, temperatura=EXCLUDED.temperatura, score=EXCLUDED.score,
          user_id=EXCLUDED.user_id, codigo_usuario=EXCLUDED.codigo_usuario, tipo_lead=EXCLUDED.tipo_lead,
          perfil_ia=EXCLUDED.perfil_ia, mensagens=EXCLUDED.mensagens, matches=EXCLUDED.matches,
          matches_auto=EXCLUDED.matches_auto, matches_base=EXCLUDED.matches_base,
          historico=EXCLUDED.historico, timeline=EXCLUDED.timeline, eventos=EXCLUDED.eventos,
          follow_ups=EXCLUDED.follow_ups, deletado_por=EXCLUDED.deletado_por,
          vitrine_enviada=EXCLUDED.vitrine_enviada, vitrine_enviada_em=EXCLUDED.vitrine_enviada_em,
          visita_agendada=EXCLUDED.visita_agendada, visita_agendada_em=EXCLUDED.visita_agendada_em,
          imovel_vendedor=EXCLUDED.imovel_vendedor, comissao_parceiro=EXCLUDED.comissao_parceiro,
          ciclo_anterior=EXCLUDED.ciclo_anterior, ciclo_seguinte=EXCLUDED.ciclo_seguinte,
          dados=EXCLUDED.dados, atualizado_em=NOW()
      `, [r.id,r.nome,r.telefone,r.whatsapp,r.contato,r.origem,r.status,r.fase_funil,r.temperatura,r.score,r.user_id,r.codigo_usuario,r.tipo_lead,r.perfil_ia,r.mensagens,r.matches,r.matches_auto,r.matches_base,r.historico,r.timeline,r.eventos,r.follow_ups,r.deletado_por,r.vitrine_enviada,r.vitrine_enviada_em,r.visita_agendada,r.visita_agendada_em,r.imovel_vendedor,r.comissao_parceiro,r.ciclo_anterior,r.ciclo_seguinte,r.dados]);
      return lead;
    } catch(e) {
      console.error('[salvarLead PG]', e.message);
    }
  }
  // Fallback JSON
  const todos = lerJSON(dataPath(), []);
  const idx = todos.findIndex(l => l.id === lead.id);
  if (idx >= 0) todos[idx] = { ...todos[idx], ...lead };
  else todos.push(lead);
  await salvarJSON(dataPath(), todos);
  return lead;
}

async function atualizarLead(leadId, campos) {
  if (await dbOk()) {
    try {
      const res = await query(`SELECT * FROM leads WHERE id=$1`, [leadId]);
      if (res.rows.length === 0) throw new Error(`lead ${leadId} não encontrada`);
      const leadAtual = rowToLead(res.rows[0]);
      return await salvarLead({ ...leadAtual, ...campos });
    } catch(e) {
      console.error('[atualizarLead PG]', e.message);
    }
  }
  // Fallback JSON
  const todos = lerJSON(dataPath(), []);
  const idx = todos.findIndex(l => l.id === leadId);
  if (idx < 0) throw new Error(`lead ${leadId} não encontrado`);
  todos[idx] = { ...todos[idx], ...campos };
  await salvarJSON(dataPath(), todos);
  return todos[idx];
}

async function deletarLead(leadId) {
  if (await dbOk()) {
    try {
      await query(`DELETE FROM leads WHERE id=$1`, [leadId]);
      return true;
    } catch(e) {
      console.error('[deletarLead PG]', e.message);
    }
  }
  const todos = lerJSON(dataPath(), []);
  const filtrados = todos.filter(l => l.id !== leadId);
  await salvarJSON(dataPath(), filtrados);
  return filtrados;
}

async function salvarTodosLeads(leads) {
  if (await dbOk()) {
    try {
      for (const lead of leads) await salvarLead(lead);
      return leads;
    } catch(e) {
      console.error('[salvarTodosLeads PG]', e.message);
    }
  }
  await salvarJSON(dataPath(), leads);
  return leads;
}

module.exports = { lerLeads, salvarLead, atualizarLead, deletarLead, salvarTodosLeads };
