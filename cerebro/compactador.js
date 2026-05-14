'use strict';
var memoriaConversa = require('./memoria-conversa');

// Compacta histórico de conversa longa em resumo
function compactarHistorico(userId) {
  var hist = memoriaConversa.carregar(userId);
  if (hist.length <= 10) return hist;

  // Mantém as últimas 10 mensagens completas
  var recentes = hist.slice(-10);
  // Resume as antigas
  var antigas = hist.slice(0, -10);

  var temas = [];
  var acoes = [];
  antigas.forEach(function(m) {
    var t = String(m.texto||'').toLowerCase();
    if (/lead/.test(t)) temas.push('leads');
    if (/imovel/.test(t)) temas.push('imoveis');
    if (/visita/.test(t)) temas.push('visitas');
    if (/match/.test(t)) temas.push('match');
    if (/xml|portal/.test(t)) temas.push('portais');
    if (/fazer|executar|rodar|gerar|importar/.test(t)) acoes.push(m.texto.slice(0,50));
  });

  var temasUnicos = [...new Set(temas)];
  var resumo = {
    _compactado: true,
    totalMensagens: antigas.length,
    temas: temasUnicos,
    acoesRealizadas: acoes.slice(-5),
    periodo: { inicio: antigas[0] && antigas[0].at, fim: antigas[antigas.length-1] && antigas[antigas.length-1].at }
  };

  // Salva versão compactada
  var novoHist = [{ role: 'sistema', texto: 'RESUMO DE CONVERSA ANTERIOR: ' + temasUnicos.join(', ') + ' - ' + antigas.length + ' mensagens', at: new Date().toISOString() }].concat(recentes);
  try {
    var fs2 = require('fs'), path2 = require('path');
    var DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : path2.join(__dirname, '..');
    fs2.writeFileSync(path2.join(DATA_DIR, 'hist-' + userId + '.json'), JSON.stringify(novoHist));
  } catch(e) {}

  return { resumo: resumo, recentes: recentes };
}

// Verifica se histórico precisa de compactação
function precisaCompactar(userId) {
  var hist = memoriaConversa.carregar(userId);
  return hist.length > 20;
}

// Extrai tópico principal das últimas mensagens
function extrairTopicoPrincipal(userId) {
  var hist = memoriaConversa.ultimasN(userId, 5);
  var contagem = {};
  hist.forEach(function(m) {
    var t = String(m.texto||'').toLowerCase();
    var temas = ['lead','imovel','visita','match','xml','portal','mercado','proposta'];
    temas.forEach(function(tema) { if(t.includes(tema)) contagem[tema] = (contagem[tema]||0)+1; });
  });
  var top = Object.entries(contagem).sort(function(a,b){return b[1]-a[1];})[0];
  return top ? top[0] : null;
}

module.exports = { compactarHistorico, precisaCompactar, extrairTopicoPrincipal };
