'use strict';
var fs = require('fs');
var path = require('path');
var DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');

function arqNotas(userId) { return path.join(DATA_DIR, 'notas-' + userId + '.json'); }

function carregarNotas(userId) {
  try { return JSON.parse(fs.readFileSync(arqNotas(userId), 'utf8')); }
  catch(e) {
    return {
      userId: userId,
      preferencias: {},
      fatos: [],
      objetivos: [],
      problemas: [],
      ultimaAtividade: null,
      totalInteracoes: 0,
      estiloPreferido: 'normal',
    };
  }
}

function salvarNotas(userId, notas) {
  try {
    notas.ultimaAtividade = new Date().toISOString();
    fs.writeFileSync(arqNotas(userId), JSON.stringify(notas, null, 2));
  } catch(e) {}
}

// Extrai fatos importantes da conversa e salva nas notas
function extrairEAtualizar(userId, mensagem, resposta, intencao) {
  var notas = carregarNotas(userId);
  var t = String(mensagem).toLowerCase();
  notas.totalInteracoes = (notas.totalInteracoes||0) + 1;

  // Aprende preferências de bairro
  var bairroM = t.match(/(?:em|no|na|bairro)\s+([a-z][a-z\s]{2,20}?)(?:\s*[,.]|$)/i);
  if (bairroM) {
    var b = bairroM[1].trim();
    notas.preferencias.bairro = notas.preferencias.bairro || {};
    notas.preferencias.bairro[b] = (notas.preferencias.bairro[b]||0) + 1;
  }

  // Aprende tipo preferido
  var tipoM = t.match(/\b(apartamento|apto|casa|cobertura|terreno|sobrado)\b/i);
  if (tipoM) {
    notas.preferencias.tipo = notas.preferencias.tipo || {};
    notas.preferencias.tipo[tipoM[1]] = (notas.preferencias.tipo[tipoM[1]]||0) + 1;
  }

  // Detecta estilo de comunicação
  if (t.length < 20) notas.estiloPreferido = 'curto';
  else if (t.length > 100) notas.estiloPreferido = 'detalhado';

  // Registra problemas recorrentes
  if (/nao funciona|problema|erro|nao consegui/.test(t)) {
    notas.problemas = notas.problemas || [];
    notas.problemas.push({ texto: mensagem.slice(0,100), at: new Date().toISOString() });
    if (notas.problemas.length > 10) notas.problemas = notas.problemas.slice(-10);
  }

  // Registra objetivos mencionados
  if (/quero|preciso|objetivo|meta|vou|planejo/.test(t)) {
    notas.objetivos = notas.objetivos || [];
    var obj = mensagem.slice(0, 150);
    if (!notas.objetivos.includes(obj)) {
      notas.objetivos.push(obj);
      if (notas.objetivos.length > 5) notas.objetivos = notas.objetivos.slice(-5);
    }
  }

  // Salva última intenção
  if (intencao) notas.ultimaIntencao = intencao;

  salvarNotas(userId, notas);
  return notas;
}

// Gera contexto personalizado baseado nas notas
function gerarContextoPersonalizado(userId) {
  var notas = carregarNotas(userId);
  var ctx = '';

  if (notas.estiloPreferido === 'curto') ctx += 'Preferencia: respostas curtas e diretas. ';
  else if (notas.estiloPreferido === 'detalhado') ctx += 'Preferencia: respostas detalhadas. ';

  if (notas.preferencias.bairro) {
    var topBairro = Object.entries(notas.preferencias.bairro).sort(function(a,b){return b[1]-a[1];})[0];
    if (topBairro) ctx += 'Bairro favorito: ' + topBairro[0] + '. ';
  }

  if (notas.preferencias.tipo) {
    var topTipo = Object.entries(notas.preferencias.tipo).sort(function(a,b){return b[1]-a[1];})[0];
    if (topTipo) ctx += 'Tipo preferido: ' + topTipo[0] + '. ';
  }

  return ctx;
}

module.exports = { carregarNotas, salvarNotas, extrairEAtualizar, gerarContextoPersonalizado };
