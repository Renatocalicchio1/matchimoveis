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
    // matches_auto/matches_base costumam ser idênticos a matches (o motor de match
    // grava os 3 com o mesmo resultado) — quando a coluna vem vazia, reaproveita a
    // MESMA referência de r.matches em vez de duplicar o array na memória. Isso não
    // muda nada pra quem lê lead.matchesBase/matchesAuto, só evita 3x o consumo de
    // RAM por lead (cada imóvel do match carrega fotos/descrição inteiras).
    matches: r.matches || [],
    matchesAuto: (r.matches_auto && r.matches_auto.length) ? r.matches_auto : (r.matches || []),
    matchesBase: (r.matches_base && r.matches_base.length) ? r.matches_base : (r.matches || []),
    historico: r.historico || [],
    timeline: r.timeline || [],
    eventos: r.eventos || [],
    followUps: r.follow_ups || [],
    mapaIntencao: r.mapa_intencao || null,
    comportamento: r.comportamento || null,
    intencoesOcultas: r.intencoes_ocultas || null,
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
    ...(r.dados || {}),
    mapaIntencao: r.mapa_intencao || null,
    perfilIA: r.perfil_ia || null
  };
}

// Compara por referência primeiro (caso comum: match-core.js atribui o mesmo
// array a matches/matchesAuto/matchesBase) e só faz o JSON.stringify caro se
// as referências forem diferentes.
function _diferente(a, b) {
  if (a === b) return false;
  return JSON.stringify(a || []) !== JSON.stringify(b || []);
}

// Converte objeto lead para colunas do banco
function leadToRow(lead) {
  const dados = { ...lead };
  const campos = ['id','nome','telefone','whatsapp','contato','origem','status','faseFunil','temperatura','score','userId','codigoUsuario','tipoLead','perfilIA','mensagens','matches','matchesAuto','matchesBase','historico','timeline','eventos','followUps','deletadoPor','vitrineEnviada','vitrineEnviadaEm','visitaAgendada','visitaAgendadaEm','imovelVendedor','comissaoParceiro','cicloAnterior','cicloSeguinte','criadoEm','data_cadastro','mapaIntencao','comportamento','intencoesOcultas'];
  campos.forEach(k => delete dados[k]);
  return {
    id: lead.id || String(Date.now()),
    nome: lead.nome || '',
    telefone: lead.telefone || '',
    whatsapp: lead.whatsapp || '',
    contato: lead.contato || '',
    origem: lead.origem || lead.origemEntrada || 'manual',
    status: lead.status || 'novo',
    fase_funil: lead.faseFunil || 'novo',
    temperatura: lead.temperatura || 'frio',
    score: lead.score || 0,
    user_id: lead.userId || lead.codigoUsuario || lead.corretorId || null,
    codigo_usuario: lead.codigoUsuario || lead.userId || null,
    tipo_lead: lead.tipoLead || 'cliente',
    perfil_ia: JSON.stringify(lead.perfilIA || {}),
    mensagens: JSON.stringify(lead.mensagens || []),
    // Evita gravar 3x o mesmo conteúdo — matches_auto/matches_base só ocupam a
    // coluna própria quando realmente diferem de matches; senão gravam vazio e a
    // leitura (rowToLead) reaproveita matches automaticamente.
    matches: JSON.stringify(lead.matches || []),
    matches_auto: JSON.stringify(_diferente(lead.matchesAuto, lead.matches) ? (lead.matchesAuto || []) : []),
    matches_base: JSON.stringify(_diferente(lead.matchesBase, lead.matches) ? (lead.matchesBase || []) : []),
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
    mapa_intencao: lead.mapaIntencao ? JSON.stringify(lead.mapaIntencao) : null,
    comportamento: lead.comportamento ? JSON.stringify(lead.comportamento) : null,
    intencoes_ocultas: lead.intencoesOcultas ? JSON.stringify(lead.intencoesOcultas) : null,
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
        sql = `SELECT * FROM leads WHERE (user_id=$1 OR codigo_usuario=$1) AND NOT (deletado_por @> to_jsonb($2::text)) ORDER BY criado_em DESC`;
        params = [userId, userId];
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

// Migration automática
async function _migrarColunaMapa() {
  try { const { query: _q } = require('./db'); await _q('ALTER TABLE leads ADD COLUMN IF NOT EXISTS mapa_intencao JSONB DEFAULT NULL'); } catch(e) {}
}
_migrarColunaMapa();

async function salvarLead(lead) {
  if (await dbOk()) {
    try {
      const r = leadToRow(lead);
      const _jaExistiaAntes = await query('SELECT 1 FROM leads WHERE id=$1', [r.id]);
      const _eraNova = !_jaExistiaAntes.rows.length;
      await query(`
        INSERT INTO leads (id,nome,telefone,whatsapp,contato,origem,status,fase_funil,temperatura,score,user_id,codigo_usuario,tipo_lead,perfil_ia,mensagens,matches,matches_auto,matches_base,historico,timeline,eventos,follow_ups,deletado_por,vitrine_enviada,vitrine_enviada_em,visita_agendada,visita_agendada_em,imovel_vendedor,comissao_parceiro,ciclo_anterior,ciclo_seguinte,mapa_intencao,comportamento,intencoes_ocultas,dados)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
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
          mapa_intencao=EXCLUDED.mapa_intencao,
          comportamento=EXCLUDED.comportamento,
          intencoes_ocultas=EXCLUDED.intencoes_ocultas,
          dados=EXCLUDED.dados, atualizado_em=NOW()
      `, [r.id,r.nome,r.telefone,r.whatsapp,r.contato,r.origem,r.status,r.fase_funil,r.temperatura,r.score,r.user_id,r.codigo_usuario,r.tipo_lead,r.perfil_ia,r.mensagens,r.matches,r.matches_auto,r.matches_base,r.historico,r.timeline,r.eventos,r.follow_ups,r.deletado_por,r.vitrine_enviada,r.vitrine_enviada_em,r.visita_agendada,r.visita_agendada_em,r.imovel_vendedor,r.comissao_parceiro,r.ciclo_anterior,r.ciclo_seguinte,r.mapa_intencao,r.comportamento,r.intencoes_ocultas,r.dados]);
      // Email alerta nova lead individual (não lote) — vai pro corretor
      if (!lead._lote) {
        try {
          const _leadUserId = lead.user_id || lead.userId || lead.codigoUsuario || null;
          if (_eraNova && _leadUserId && lead.leadOculta !== true) {
            const _userR = await query('SELECT nome, email FROM usuarios WHERE codigo_usuario=$1 OR id=$1 LIMIT 1', [_leadUserId]);
            const _user = _userR.rows[0];
            if (_user && _user.email) {
              const { enviarEmail } = require('./email');
              const _origem = lead.origem || lead.origemEntrada || 'sistema';
              const _linkLead = 'https://matchimoveis.ia.br/app/lead/' + r.id;
              enviarEmail({
                para: _user.email,
                assunto: '🔔 Nova lead recebida — MatchImóveis',
                html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><h2 style="color:#FF385C">🔔 Nova lead!</h2><p><strong>Nome:</strong> ' + (lead.nome||'Sem nome') + '</p><p><strong>Origem:</strong> ' + _origem + '</p><a href="' + _linkLead + '" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Nova Lead →</a></div>',
                texto: 'Nova lead: ' + (lead.nome||'Sem nome') + ' | ' + _linkLead
              }).catch(()=>{});
            }
          }
        } catch(_eNL){}
      }
      // Email de captacao para a propria lead — roda sempre (manual, planilha, webhook), independente de lote.
      // Não dispara pra quem já é lead de captação (tipo_lead cliente_vendedor ou
      // origem captacao_link) — ela já está no meio do fluxo de cadastrar o imóvel,
      // convidar de novo é redundante. Essa lead recebe o email de revisão do
      // próprio anúncio em POST /captar/imovel/:imovelId (finalizar=true).
      try {
        const _leadUserId2 = lead.user_id || lead.userId || lead.codigoUsuario || null;
        const _jaECaptacao = lead.tipoLead === 'cliente_vendedor' || lead.tipo_lead === 'cliente_vendedor' || lead.origem === 'captacao_link';
        if (_eraNova && lead.email && !_jaECaptacao) {
          const { enviarEmail: _envCap } = require('./email');
          const _linkCap = 'https://matchimoveis.ia.br/captar/' + _leadUserId2;
          _envCap({
            para: lead.email,
            assunto: 'Cadastre seu imóvel — MatchImóveis',
            html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><h2 style="color:#FF385C">Olá, ' + (lead.nome||'') + '!</h2><p>Se você tiver um imóvel para venda ou locação, você pode cadastrar as informações básicas do seu imóvel que nosso time entrará em contato.</p><p>Clique no botão abaixo — o processo é simples e rápido.</p><a href="' + _linkCap + '" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Cadastrar meu imóvel →</a></div>',
            texto: 'Cadastre seu imovel: ' + _linkCap
          }).then(()=>console.log('[EMAIL CAPTACAO] enviado para:', lead.email)).catch((e)=>console.error('[EMAIL CAPTACAO] falhou:', e.message));
        }
      } catch(_eCap){}
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

module.exports = { lerLeads, salvarLead, atualizarLead, deletarLead, salvarTodosLeads, rowToLead };
