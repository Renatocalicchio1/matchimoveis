'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');

function arqPerfil(userId) {
  return path.join(DATA_DIR, 'perfil-corretor-' + userId + '.json');
}

function carregar(userId) {
  try { return JSON.parse(fs.readFileSync(arqPerfil(userId), 'utf8')); }
  catch(e) { return { userId, bairrosFavoritos: [], tiposFavoritos: [], faixaValor: null, cidadePrincipal: null, totalInteracoes: 0, ultimaAtualizacao: null }; }
}

function salvar(userId, perfil) {
  try { fs.writeFileSync(arqPerfil(userId), JSON.stringify(perfil, null, 2)); } catch(e) {}
}

function atualizar(userId, leads, imoveis) {
  var perfil = carregar(userId);
  var bairros = {}, tipos = {}, valores = [];
  leads.forEach(function(l){
    if (l.bairro) bairros[l.bairro] = (bairros[l.bairro]||0)+1;
    if (l.tipo) tipos[l.tipo] = (tipos[l.tipo]||0)+1;
    if (l.valor_imovel > 0) valores.push(Number(l.valor_imovel));
  });
  imoveis.forEach(function(i){
    if (i.bairro) bairros[i.bairro] = (bairros[i.bairro]||0)+2;
    if (i.tipo) tipos[i.tipo] = (tipos[i.tipo]||0)+2;
    if (i.valor_imovel > 0) valores.push(Number(i.valor_imovel));
  });
  perfil.bairrosFavoritos = Object.entries(bairros).sort(function(a,b){return b[1]-a[1];}).slice(0,5).map(function(x){return x[0];});
  perfil.tiposFavoritos = Object.entries(tipos).sort(function(a,b){return b[1]-a[1];}).slice(0,3).map(function(x){return x[0];});
  if (valores.length) {
    perfil.faixaValor = { min: Math.min.apply(null,valores), max: Math.max.apply(null,valores), medio: Math.round(valores.reduce(function(a,b){return a+b;},0)/valores.length) };
  }
  if (leads.length && leads[0].cidade) perfil.cidadePrincipal = leads[0].cidade;
  else if (imoveis.length && imoveis[0].cidade) perfil.cidadePrincipal = imoveis[0].cidade;
  perfil.totalInteracoes = (perfil.totalInteracoes||0) + 1;
  perfil.ultimaAtualizacao = new Date().toISOString();
  salvar(userId, perfil);
  return perfil;
}

function resumo(userId) {
  var p = carregar(userId);
  var partes = [];
  if (p.cidadePrincipal) partes.push('Cidade: ' + p.cidadePrincipal);
  if (p.bairrosFavoritos.length) partes.push('Bairros: ' + p.bairrosFavoritos.slice(0,3).join(', '));
  if (p.tiposFavoritos.length) partes.push('Tipos: ' + p.tiposFavoritos.join(', '));
  if (p.faixaValor) partes.push('Faixa: R$' + p.faixaValor.min.toLocaleString('pt-BR') + ' a R$' + p.faixaValor.max.toLocaleString('pt-BR'));
  return partes.join(' | ');
}

module.exports = { carregar, salvar, atualizar, resumo };
