'use strict';
var fs = require('fs');
var path = require('path');
var DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');

function arqMetricas() { return path.join(DATA_DIR, 'assistente-metricas.json'); }

function registrar(userId, evento, dados) {
  var arq = arqMetricas();
  var metricas = [];
  try { metricas = JSON.parse(fs.readFileSync(arq,'utf8')); } catch(e) {}
  metricas.push({ userId: userId, evento: evento, dados: dados||{}, at: new Date().toISOString() });
  if (metricas.length > 10000) metricas = metricas.slice(-10000);
  try { fs.writeFileSync(arq, JSON.stringify(metricas)); } catch(e) {}
}

function resumo(userId) {
  var arq = arqMetricas();
  var metricas = [];
  try { metricas = JSON.parse(fs.readFileSync(arq,'utf8')); } catch(e) {}
  var mUser = metricas.filter(function(m){ return m.userId === userId; });
  var contagem = {};
  mUser.forEach(function(m){ contagem[m.evento] = (contagem[m.evento]||0)+1; });
  var topEventos = Object.entries(contagem).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
  var naoEntendidos = mUser.filter(function(m){ return m.evento === 'nao_entendido'; }).length;
  var taxa = mUser.length > 0 ? Math.round((mUser.length - naoEntendidos) / mUser.length * 100) : 0;
  return { total: mUser.length, naoEntendidos: naoEntendidos, taxaEntendimento: taxa, topEventos: topEventos };
}

module.exports = { registrar, resumo };
