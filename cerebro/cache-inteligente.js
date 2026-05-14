'use strict';
var fs = require('fs');
var path = require('path');
var DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');

var _cache = {};
var TTL = { resumo: 5*60*1000, mercado: 10*60*1000, ranking: 2*60*1000, diagnostico: 5*60*1000 };

function chave(userId, tipo) { return userId + '_' + tipo; }

function get(userId, tipo) {
  var k = chave(userId, tipo);
  var item = _cache[k];
  if (!item) return null;
  if (Date.now() - item.at > (TTL[tipo] || 5*60*1000)) { delete _cache[k]; return null; }
  return item.valor;
}

function set(userId, tipo, valor) {
  _cache[chave(userId, tipo)] = { valor: valor, at: Date.now() };
}

function invalidar(userId) {
  Object.keys(_cache).forEach(function(k){ if(k.startsWith(userId)) delete _cache[k]; });
}

function invalidarTipo(tipo) {
  Object.keys(_cache).forEach(function(k){ if(k.endsWith('_'+tipo)) delete _cache[k]; });
}

module.exports = { get, set, invalidar, invalidarTipo };
