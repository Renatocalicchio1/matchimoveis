'use strict';
var entidades = require('./entidades');

function decomporPergunta(texto, leads, imoveis, visitas) {
  var t = String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  var slots = entidades.analisar(texto);
  var filtros = [];
  var resultados = { leads: leads, imoveis: imoveis, visitas: visitas };

  // Detecta filtros múltiplos na mesma frase
  if (slots.tipo) {
    resultados.imoveis = imoveis.filter(function(i) { return i.tipo && i.tipo.toLowerCase().includes(slots.tipo); });
    resultados.leads = leads.filter(function(l) { return l.tipo && l.tipo.toLowerCase().includes(slots.tipo); });
    filtros.push('tipo: ' + slots.tipo);
  }
  if (slots.bairro) {
    var b = slots.bairro.toLowerCase();
    resultados.imoveis = resultados.imoveis.filter(function(i) { return i.bairro && i.bairro.toLowerCase().includes(b); });
    resultados.leads = resultados.leads.filter(function(l) { return l.bairro && l.bairro.toLowerCase().includes(b); });
    filtros.push('bairro: ' + slots.bairro);
  }
  if (slots.quartos) {
    resultados.imoveis = resultados.imoveis.filter(function(i) { return Number(i.quartos||0) >= slots.quartos; });
    resultados.leads = resultados.leads.filter(function(l) { return Number(l.quartos||0) >= slots.quartos; });
    filtros.push('quartos: ' + slots.quartos + '+');
  }
  if (slots.valorMax) {
    resultados.imoveis = resultados.imoveis.filter(function(i) { return Number(i.valor_imovel||0) <= slots.valorMax; });
    resultados.leads = resultados.leads.filter(function(l) { return Number(l.valor_imovel||0) <= slots.valorMax; });
    filtros.push('valor até R$' + slots.valorMax.toLocaleString('pt-BR'));
  }

  // Filtros temporais
  var agora = Date.now();
  if (/essa semana|esta semana|nos ultimos 7/.test(t)) {
    var semana = new Date(agora - 7*86400000);
    resultados.leads = resultados.leads.filter(function(l) { return l.createdAt && new Date(l.createdAt) >= semana; });
    resultados.visitas = resultados.visitas.filter(function(v) { return v.createdAt && new Date(v.createdAt) >= semana; });
    filtros.push('esta semana');
  }
  if (/hoje/.test(t)) {
    var hoje = new Date().toISOString().slice(0,10);
    resultados.leads = resultados.leads.filter(function(l) { return (l.createdAt||'').slice(0,10) === hoje; });
    resultados.visitas = resultados.visitas.filter(function(v) { return (v.dataVisita||'').slice(0,10) === hoje; });
    filtros.push('hoje');
  }
  if (/com match|que tem match/.test(t)) {
    resultados.leads = resultados.leads.filter(function(l) { return l.matchesBase && l.matchesBase.length > 0; });
    filtros.push('com match');
  }
  if (/sem match|sem imovel/.test(t)) {
    resultados.leads = resultados.leads.filter(function(l) { return !l.matchesBase || l.matchesBase.length === 0; });
    filtros.push('sem match');
  }
  if (/com visita|que visitou/.test(t)) {
    var visitaIds = new Set(visitas.map(function(v) { return String(v.leadId||''); }));
    resultados.leads = resultados.leads.filter(function(l) { return visitaIds.has(String(l.id||'')); });
    filtros.push('com visita');
  }
  if (/confirmada|confirmado/.test(t)) {
    resultados.visitas = resultados.visitas.filter(function(v) { return v.status === 'confirmada'; });
    filtros.push('confirmadas');
  }
  if (/pendente|aguardando/.test(t)) {
    resultados.visitas = resultados.visitas.filter(function(v) { return v.status === 'pendente' || v.status === 'solicitada'; });
    filtros.push('pendentes');
  }
  if (/ativo|ativa|ativos/.test(t)) {
    resultados.imoveis = resultados.imoveis.filter(function(i) { return i.status !== 'inativo'; });
    filtros.push('ativos');
  }
  if (/inativo|inativos/.test(t)) {
    resultados.imoveis = resultados.imoveis.filter(function(i) { return i.status === 'inativo'; });
    filtros.push('inativos');
  }
  if (/sem foto/.test(t)) {
    resultados.imoveis = resultados.imoveis.filter(function(i) { return !i.fotos || i.fotos.length === 0; });
    filtros.push('sem foto');
  }
  if (/sem proprietario|sem dono/.test(t)) {
    resultados.imoveis = resultados.imoveis.filter(function(i) { return !i.proprietario || !i.proprietario.telefone; });
    filtros.push('sem proprietário');
  }
  if (/quente|quentes|alta prioridade/.test(t)) {
    resultados.leads = resultados.leads.filter(function(l) { return l.matchesBase && l.matchesBase.length >= 3; });
    filtros.push('quentes (3+ matches)');
  }

  return { filtros: filtros, resultados: resultados, complexa: filtros.length > 1, slots: slots };
}

function gerarRespostaDecomposta(decomposicao, btn, chip) {
  var f = decomposicao.filtros;
  var r = decomposicao.resultados;
  if (!decomposicao.complexa || f.length === 0) return null;

  var html = '🔍 <strong>Busca com ' + f.length + ' filtros:</strong> ' + f.join(' · ') + '<br><br>';

  if (r.leads.length === 0 && r.imoveis.length === 0) {
    html += '😔 Nenhum resultado com esses filtros combinados.<br><br>';
    html += chip('Ampliar busca', 'demanda por bairro') + btn('Ver tudo', '/app/leads');
    return html;
  }

  if (r.leads.length > 0) {
    html += '👥 <strong>' + r.leads.length + ' lead(s)</strong> encontrada(s):<br>';
    r.leads.slice(0,5).forEach(function(l) {
      html += '<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin:3px 0">👤 <strong>' + (l.nome||l.name||'Lead') + '</strong>' + (l.bairro?' — '+l.bairro:'') + (l.tipo?' · '+l.tipo:'') + (l.matchesBase?' · '+l.matchesBase.length+' match(es)':'') + '</div>';
    });
    if (r.leads.length > 5) html += '<em style="font-size:12px">...e mais ' + (r.leads.length-5) + '</em><br>';
    html += '<br>';
  }

  if (r.imoveis.length > 0) {
    html += '🏠 <strong>' + r.imoveis.length + ' imóvel(is)</strong> encontrado(s):<br>';
    r.imoveis.slice(0,4).forEach(function(i) {
      html += '<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin:3px 0">🏠 <strong>' + (i.tipo||'Imóvel') + '</strong>' + (i.bairro?' — '+i.bairro:'') + (i.quartos?' · '+i.quartos+'q':'') + (i.valor_imovel?' · R$'+Number(i.valor_imovel).toLocaleString('pt-BR'):'') + '</div>';
    });
    if (r.imoveis.length > 4) html += '<em style="font-size:12px">...e mais ' + (r.imoveis.length-4) + '</em><br>';
  }

  if (r.visitas.length > 0) {
    html += '📅 <strong>' + r.visitas.length + ' visita(s)</strong>:<br>';
    r.visitas.slice(0,3).forEach(function(v) {
      html += '<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin:3px 0">📅 <strong>' + (v.nome||v.leadNome||'Lead') + '</strong>' + (v.dataVisita?' — '+v.dataVisita:'') + ' · ' + (v.status||'pendente') + '</div>';
    });
  }

  return html;
}

module.exports = { decomporPergunta, gerarRespostaDecomposta };
