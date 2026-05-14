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

function classificar(lead, visitas) {
  visitas = visitas || [];
  const leadId = String(lead.id || lead._id || '');
  const visitasLead = visitas.filter(function(v){ return String(v.leadId||'') === leadId; });
  const agora = Date.now();
  const diasAtras = lead.createdAt ? (agora - new Date(lead.createdAt).getTime()) / 86400000 : 999;

  // Pipeline de visita
  if (visitasLead.some(function(v){ return v.status === 'fechado' || v.workflowStatus === 'FECHADO'; })) return 'FECHADO';
  if (visitasLead.some(function(v){ return v.status === 'perdido' || v.workflowStatus === 'PERDIDO'; })) return 'PERDIDO';
  if (visitasLead.some(function(v){ return v.status === 'proposta' || v.workflowStatus === 'PROPOSTA'; })) return 'PROPOSTA';
  if (visitasLead.some(function(v){ return v.status === 'negociacao' || v.workflowStatus === 'NEGOCIACAO'; })) return 'NEGOCIACAO';
  if (visitasLead.some(function(v){ return v.status === 'confirmada'; })) return 'VISITA';
  if (visitasLead.length > 0) return 'VISITA';

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
  var contagem = {};
  Object.keys(ETAPAS).forEach(function(e){ contagem[e] = 0; });
  leads.forEach(function(l){ var etapa = classificar(l, visitas); contagem[etapa] = (contagem[etapa]||0) + 1; });
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
