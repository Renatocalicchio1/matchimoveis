'use strict';

var PROXIMOS_PASSOS = {
  ver_leads:       ['leads com match','leads quentes','importar leads','demanda por bairro'],
  ver_imoveis:     ['imoveis sem proprietario','gerar xml vivareal','importar xml','valor medio da carteira'],
  ver_visitas:     ['visitas hoje','visitas pendentes','leads com match','o que devo fazer hoje'],
  fazer_match:     ['leads com match','enviar vitrine','leads quentes','demanda por bairro'],
  ver_match:       ['enviar vitrine para cliente','leads quentes','taxa de match','demanda por bairro'],
  gerar_xml:       ['ver portais','leads com match','demanda por bairro'],
  importar_leads:  ['fazer match','leads com match','demanda por bairro'],
  importar_xml:    ['fazer match','gerar xml vivareal','imoveis sem proprietario'],
  ver_mercado:     ['oportunidade de captacao','leads quentes','fazer match'],
  resumo_diario:   ['leads quentes','visitas hoje','fazer match','oportunidade de captacao'],
  ver_notificacoes:['visitas pendentes','leads com match','o que devo fazer hoje'],
  saudacao:        ['resumo do dia','leads quentes','visitas hoje','fazer match'],
  ajuda:           ['leads quentes','demanda por bairro','resumo do dia','fazer match'],
};

function gerarSugestoes(intencao, d, chip) {
  var opcoes = PROXIMOS_PASSOS[intencao] || PROXIMOS_PASSOS['saudacao'];
  if (!opcoes || !opcoes.length) return '';
  var filtradas = opcoes.filter(function(op){
    if (op === 'fazer match' && d.comMatch > d.leads * 0.7) return false;
    if (op === 'importar leads' && d.leads > 50) return false;
    if (op === 'importar xml' && d.ativos > 100) return false;
    return true;
  }).slice(0,3);
  if (!filtradas.length) return '';
  return '<br><div style="border-top:1px solid var(--color-border-tertiary);margin-top:12px;padding-top:10px"><span style="font-size:12px;color:var(--color-text-secondary)">💡 O que fazer agora:</span><br>' + filtradas.map(function(op){ return chip(op, op); }).join('') + '</div>';
}

function gerarSugestaoContextual(mNorm, d, leads, visitas, chip) {
  var agora = Date.now();
  var hoje = new Date().toISOString().slice(0,10);
  var visitasHoje = visitas.filter(function(v){ return (v.dataVisita||'').slice(0,10) === hoje; });
  var quentesSemVisita = leads.filter(function(l){ return l.matchesBase&&l.matchesBase.length>0&&!visitas.some(function(v){return String(v.leadId||'')===String(l.id||'');}); });
  var sugestoes = [];

  if (visitasHoje.length > 0) sugestoes.push(chip('📅 Ver visitas de hoje','visitas hoje'));
  if (quentesSemVisita.length > 0) sugestoes.push(chip('🔥 Enviar vitrines ('+quentesSemVisita.length+')','leads com match'));
  if (d.semMatch > 10) sugestoes.push(chip('🎯 Fazer match agora','fazer match agora'));
  if (d.pendentes > 0) sugestoes.push(chip('⏳ Visitas pendentes','visitas pendentes'));

  if (!sugestoes.length) return '';
  return '<br><div style="border-top:1px solid var(--color-border-tertiary);margin-top:12px;padding-top:10px"><span style="font-size:12px;color:var(--color-text-secondary)">⚡ Ação recomendada:</span><br>' + sugestoes.slice(0,2).join('') + '</div>';
}

module.exports = { gerarSugestoes, gerarSugestaoContextual, PROXIMOS_PASSOS };
