'use strict';

function analisarTendencias(leads, imoveis, visitas) {
  var agora = Date.now();
  var semana = new Date(agora - 7*86400000);
  var mes = new Date(agora - 30*86400000);
  var leadsRecentes = leads.filter(function(l){ var d=l.createdAt||''; return d&&new Date(d)>=semana; });
  var leadsAntes = leads.filter(function(l){ var d=l.createdAt||''; return d&&new Date(d)<semana&&new Date(d)>=mes; });

  // Tendência de bairros
  var blRecente = {}, blAntes = {};
  leadsRecentes.forEach(function(l){ if(l.bairro) blRecente[l.bairro]=(blRecente[l.bairro]||0)+1; });
  leadsAntes.forEach(function(l){ if(l.bairro) blAntes[l.bairro]=(blAntes[l.bairro]||0)+1; });

  var tendencias = [];
  Object.entries(blRecente).forEach(function(e){
    var b = e[0], n = e[1];
    var antes = blAntes[b] || 0;
    if (n > antes * 1.5 && n >= 3) tendencias.push({ bairro: b, crescimento: Math.round((n-antes)/Math.max(antes,1)*100), recente: n });
  });
  tendencias.sort(function(a,b){ return b.crescimento - a.crescimento; });

  // Score de liquidez por bairro (leads/imóveis)
  var bi = {};
  imoveis.filter(function(i){return i.status!=='inativo';}).forEach(function(i){ if(i.bairro) bi[i.bairro]=(bi[i.bairro]||0)+1; });
  var bl = {};
  leads.forEach(function(l){ if(l.bairro) bl[l.bairro]=(bl[l.bairro]||0)+1; });
  var liquidez = Object.entries(bl).map(function(e){
    var bairro = e[0], demanda = e[1];
    var oferta = bi[bairro] || 0;
    var score = oferta > 0 ? demanda/oferta : demanda;
    return { bairro: bairro, demanda: demanda, oferta: oferta, score: score };
  }).sort(function(a,b){ return b.score - a.score; }).slice(0,5);

  // Ticket médio por bairro
  var ticketPorBairro = {};
  leads.filter(function(l){ return l.bairro && l.valor_imovel > 0; }).forEach(function(l){
    if (!ticketPorBairro[l.bairro]) ticketPorBairro[l.bairro] = [];
    ticketPorBairro[l.bairro].push(Number(l.valor_imovel));
  });
  var ticketMedioPorBairro = {};
  Object.entries(ticketPorBairro).forEach(function(e){
    var vals = e[1];
    ticketMedioPorBairro[e[0]] = Math.round(vals.reduce(function(a,b){return a+b;},0)/vals.length);
  });

  return { tendencias: tendencias, liquidez: liquidez, ticketMedioPorBairro: ticketMedioPorBairro };
}

function responder(mNorm, leads, imoveis, visitas, btn, chip) {
  if (!/tendencia|crescimento|alta|aquecido|preditivo|previsao|analise avancada|inteligencia/.test(mNorm)) return null;

  var analise = analisarTendencias(leads, imoveis, visitas);
  var fmt = function(v){ return 'R$ ' + Number(v).toLocaleString('pt-BR'); };

  var html = '📈 <strong>Inteligência de mercado avançada:</strong><br><br>';

  if (analise.tendencias.length > 0) {
    html += '<strong>🔥 Bairros em alta (crescimento esta semana):</strong><br>';
    analise.tendencias.slice(0,3).forEach(function(t){
      html += '<div style="background:#fff8f0;border-left:3px solid #f59e0b;border-radius:8px;padding:8px 12px;margin:4px 0">📍 <strong>' + t.bairro + '</strong> +' + t.crescimento + '% de demanda · ' + t.recente + ' leads novas</div>';
    });
    html += '<br>';
  }

  if (analise.liquidez.length > 0) {
    html += '<strong>💧 Liquidez por bairro (demanda/oferta):</strong><br>';
    analise.liquidez.slice(0,4).forEach(function(l){
      var cor = l.score > 3 ? '#fee2e2' : l.score > 1.5 ? '#fef9c3' : '#f0fdf4';
      var status = l.score > 3 ? '🔴 Alta demanda, pouca oferta' : l.score > 1.5 ? '🟡 Demanda moderada' : '🟢 Equilibrado';
      html += '<div style="background:' + cor + ';border-radius:8px;padding:8px 12px;margin:4px 0">📍 <strong>' + l.bairro + '</strong> — ' + l.demanda + ' leads · ' + l.oferta + ' imóveis · ' + status + '</div>';
    });
    html += '<br>';
  }

  if (Object.keys(analise.ticketMedioPorBairro).length > 0) {
    html += '<strong>💰 Ticket médio por bairro:</strong><br>';
    Object.entries(analise.ticketMedioPorBairro).sort(function(a,b){return b[1]-a[1];}).slice(0,4).forEach(function(e){
      html += '• <strong>' + e[0] + '</strong>: ' + fmt(e[1]) + '<br>';
    });
  }

  html += '<br>' + chip('Oportunidades','oportunidade de captacao') + chip('Demanda por bairro','demanda por bairro');
  return html;
}

module.exports = { analisarTendencias, responder };
