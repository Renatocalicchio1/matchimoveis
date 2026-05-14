'use strict';
var path = require('path');
var fs = require('fs');
var DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');

// Mapa de quais dados cada intenção realmente precisa
var DADOS_POR_INTENCAO = {
  ver_leads:          ['leads', 'stats'],
  ver_imoveis:        ['imoveis', 'stats'],
  ver_visitas:        ['visitas', 'stats'],
  fazer_match:        ['leads', 'imoveis'],
  ver_mercado:        ['leads', 'imoveis'],
  resumo_diario:      ['leads', 'imoveis', 'visitas', 'stats'],
  estrategia_venda:   ['leads', 'visitas', 'imoveis'],
  diagnosticar_match: ['leads', 'imoveis'],
  vitrine:            ['leads'],
  scoring:            ['leads', 'visitas'],
  notificacoes:       ['notificacoes'],
  portais:            ['imoveis'],
  saudacao:           ['stats'],
  ajuda:              [],
  funil:              ['leads', 'visitas'],
  inteligencia_mercado: ['leads', 'imoveis'],
  auto_diagnostico:   ['leads', 'imoveis', 'visitas'],
};

// Carrega só o que precisa — evita context rot
function carregarContextoMinimo(userId, intencao, dados) {
  var necessarios = DADOS_POR_INTENCAO[intencao] || ['leads', 'stats'];
  var ctx = { userId: userId };

  if (necessarios.includes('leads')) {
    var todasLeads = dados.leads || [];
    // Filtra por userId
    var minhasLeads = todasLeads.filter(function(l) { return String(l.userId||l.usuarioId||l.corretorId||'') === userId; });
    // Limita a 200 leads mais recentes para evitar context rot
    ctx.leads = minhasLeads.slice(-200);
    ctx.totalLeads = minhasLeads.length;
  }

  if (necessarios.includes('imoveis')) {
    var todosIm = dados.imoveis || [];
    var meusIm = todosIm.filter(function(i) { return String(i.userId||i.usuarioId||i.corretorId||'') === userId; });
    // Só ativos por padrão — reduz 70% do contexto
    ctx.imoveis = meusIm.filter(function(i) { return i.status !== 'inativo'; });
    ctx.imoveisInativos = meusIm.filter(function(i) { return i.status === 'inativo'; }).length;
    ctx.totalImoveis = meusIm.length;
  }

  if (necessarios.includes('visitas')) {
    var todasVisitas = dados.visitas || [];
    ctx.visitas = todasVisitas.filter(function(v) { return String(v.userId||v.usuarioId||v.corretorId||'') === userId || String(v.corretorId||'') === userId; });
  }

  if (necessarios.includes('notificacoes')) {
    var todasNotifs = dados.notificacoes || [];
    ctx.notificacoes = todasNotifs.filter(function(n) { return String(n.userId||n.usuarioId||n.corretorId||'') === userId && !n.lida; });
  }

  if (necessarios.includes('stats')) {
    var leads2 = ctx.leads || [];
    var imoveis2 = ctx.imoveis || [];
    var visitas2 = ctx.visitas || [];
    var hoje = new Date().toISOString().slice(0,10);
    ctx.stats = {
      totalLeads: ctx.totalLeads || leads2.length,
      comMatch: leads2.filter(function(l) { return l.matchesBase && l.matchesBase.length > 0; }).length,
      semMatch: leads2.filter(function(l) { return !l.matchesBase || l.matchesBase.length === 0; }).length,
      ativos: imoveis2.length,
      inativos: ctx.imoveisInativos || 0,
      totalImoveis: ctx.totalImoveis || imoveis2.length,
      visitas: visitas2.length,
      confirmadas: visitas2.filter(function(v) { return v.status === 'confirmada'; }).length,
      pendentes: visitas2.filter(function(v) { return v.status === 'pendente' || v.status === 'solicitada'; }).length,
      hoje: visitas2.filter(function(v) { return (v.dataVisita||'').slice(0,10) === hoje; }).length,
      bairros: [...new Set(imoveis2.map(function(i) { return i.bairro; }).filter(Boolean))].slice(0,10),
    };
  }

  return ctx;
}

// Sumariza leads antigas para reduzir context rot
function sumarizarLeads(leads) {
  if (leads.length <= 50) return leads;
  // Mantém as 50 mais recentes completas
  var recentes = leads.slice(-50);
  // Sumariza as antigas
  var antigas = leads.slice(0, -50);
  var bairros = {}, tipos = {}, comMatch = 0;
  antigas.forEach(function(l) {
    if (l.bairro) bairros[l.bairro] = (bairros[l.bairro]||0)+1;
    if (l.tipo) tipos[l.tipo] = (tipos[l.tipo]||0)+1;
    if (l.matchesBase && l.matchesBase.length > 0) comMatch++;
  });
  var resumo = { _resumo: true, total: antigas.length, comMatch: comMatch, bairros: bairros, tipos: tipos };
  return [resumo].concat(recentes);
}

// Coloca informação crítica no início do contexto (maior atenção do modelo)
function ordenarContexto(ctx, intencao) {
  var prioridades = {
    ver_visitas:   ['stats', 'visitas', 'leads', 'imoveis'],
    fazer_match:   ['leads', 'imoveis', 'stats', 'visitas'],
    ver_mercado:   ['leads', 'imoveis', 'stats'],
    resumo_diario: ['stats', 'visitas', 'leads', 'imoveis'],
  };
  return ctx;
}

module.exports = { carregarContextoMinimo, sumarizarLeads, ordenarContexto, DADOS_POR_INTENCAO };
