'use strict';

const ETAPAS = {
  NOVO:       { label: 'Novo',        emoji: '🆕', cor: '#94a3b8', ordem: 1 },
  FRIA:       { label: 'Fria',        emoji: '🧊', cor: '#3b82f6', ordem: 2 },
  MORNA:      { label: 'Morna',       emoji: '🟡', cor: '#f59e0b', ordem: 3 },
  QUENTE:     { label: 'Quente',      emoji: '🔥', cor: '#ef4444', ordem: 4 },
  VITRINE:    { label: 'Vitrine',     emoji: '🔗', cor: '#8b5cf6', ordem: 5 },
  VISITA:     { label: 'Visita',      emoji: '📅', cor: '#06b6d4', ordem: 6 },
  NEGOCIACAO: { label: 'Negociação',  emoji: '🤝', cor: '#f97316', ordem: 7 },
  PROPOSTA:   { label: 'Proposta',    emoji: '📋', cor: '#84cc16', ordem: 8 },
  FECHADO:    { label: 'Fechado',     emoji: '🏆', cor: '#22c55e', ordem: 9 },
  PERDIDO:    { label: 'Perdido',     emoji: '❌', cor: '#6b7280', ordem: 0 }
};

// Desfecho comercial pós-visita mora em v.pipelineStatus (setado pelas
// rotas /app/visitas/proposta|negociacao|fechado|perdido/:id — server.js),
// não em v.status nem v.workflowStatus (esses são outra coisa: status
// básico da visita e status de confirmação/agendamento, campos
// diferentes). classificar() checava os campos errados desde que foi
// escrito — nunca detectava um FECHADO/PERDIDO real porque comparava com
// nomes de campo que não existem nesse formato em nenhuma visita de
// verdade (achado ago/2026, ver auditoria de módulos não conectados).
function _pipelineStatus(v){
  return String(v.pipelineStatus || '').toUpperCase();
}
function classificar(lead, visitas) {
  visitas = visitas || [];
  const leadId = String(lead.id || lead._id || '');
  const visitasLead = visitas.filter(function(v){ return String(v.leadId||'') === leadId; });
  const agora = Date.now();
  const diasAtras = lead.createdAt ? (agora - new Date(lead.createdAt).getTime()) / 86400000 : 999;

  // Visita cancelada não conta como "em andamento" pra nenhum propósito —
  // nem pipeline comercial, nem "tem visita ativa" mais abaixo.
  const visitasAtivas = visitasLead.filter(function(v){
    const st = String(v.status || '').toUpperCase();
    const wf = String(v.workflowStatus || v.workflow_status || '').toUpperCase();
    return !st.includes('CANCEL') && !wf.includes('CANCEL');
  });

  // Pipeline de visita — do mais avançado pro menos
  if (visitasAtivas.some(function(v){ return _pipelineStatus(v) === 'FECHADO'; })) return 'FECHADO';
  if (visitasAtivas.some(function(v){ return _pipelineStatus(v) === 'PERDIDO'; })) return 'PERDIDO';
  if (visitasAtivas.some(function(v){ return _pipelineStatus(v) === 'PROPOSTA'; })) return 'PROPOSTA';
  if (visitasAtivas.some(function(v){ return _pipelineStatus(v) === 'NEGOCIACAO'; })) return 'NEGOCIACAO';
  if (visitasAtivas.length > 0) return 'VISITA';

  // Match e vitrine
  const temMatch = lead.matchesBase && lead.matchesBase.length > 0;
  if (temMatch && diasAtras < 30) return 'QUENTE';
  if (temMatch) return 'MORNA';

  // Sem match
  if (diasAtras < 3) return 'NOVO';
  if (diasAtras < 15) return 'FRIA';
  return 'FRIA';
}

function resumoFunil(leads, visitas) {
  visitas = visitas || [];
  // Agrupa visitas por leadId 1x (em vez de filtrar a lista inteira de
  // visitas pra cada lead) — importante numa base com milhares de leads e
  // visitas, como a tela de funil do admin que olha a plataforma toda.
  var visitasPorLead = {};
  visitas.forEach(function(v){
    var k = String(v.leadId || '');
    (visitasPorLead[k] = visitasPorLead[k] || []).push(v);
  });
  var contagem = {};
  Object.keys(ETAPAS).forEach(function(e){ contagem[e] = 0; });
  leads.forEach(function(l){
    var k = String(l.id || l._id || '');
    var etapa = classificar(l, visitasPorLead[k] || []);
    contagem[etapa] = (contagem[etapa]||0) + 1;
  });
  return contagem;
}

function responder(mNorm, leads, visitas, btn, chip) {
  if (!/funil|pipeline|etapa|estagio|fase|kanban leads/.test(mNorm)) return null;

  var contagem = resumoFunil(leads, visitas);
  var total = leads.length;

  var html = '📊 <strong>Funil de leads:</strong><br><br>';
  var etapasOrdem = Object.entries(ETAPAS).sort(function(a,b){ return b[1].ordem - a[1].ordem; });

  etapasOrdem.forEach(function(entry){
    var etapa = entry[0], info = entry[1];
    var n = contagem[etapa] || 0;
    if (n === 0) return;
    var pct = total > 0 ? Math.round(n/total*100) : 0;
    var bar = '█'.repeat(Math.round(pct/10)) + '░'.repeat(10 - Math.round(pct/10));
    html += '<div style="margin:6px 0">' + info.emoji + ' <strong>' + info.label + '</strong>: ' + n + ' leads (' + pct + '%)<br>';
    html += '<span style="color:' + info.cor + ';font-size:11px">' + bar + '</span></div>';
  });

  html += '<br>' + btn('Ver leads', '/app/leads') + chip('Leads quentes', 'leads quentes') + chip('Plano do dia', 'o que devo fazer hoje');
  return html;
}

module.exports = { classificar, resumoFunil, responder, ETAPAS };
