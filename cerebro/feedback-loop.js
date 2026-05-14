'use strict';
var fs = require('fs');
var path = require('path');
var DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');

function arqFeedback() { return path.join(DATA_DIR, 'assistente-feedback.json'); }

function registrarFeedback(userId, mensagem, resposta, tipo, detalhe) {
  var dados = [];
  try { dados = JSON.parse(fs.readFileSync(arqFeedback(), 'utf8')); } catch(e) {}
  dados.push({
    userId: userId,
    mensagem: String(mensagem).slice(0,200),
    resposta: String(resposta).slice(0,200),
    tipo: tipo,
    detalhe: detalhe || '',
    at: new Date().toISOString()
  });
  if (dados.length > 5000) dados = dados.slice(-5000);
  try { fs.writeFileSync(arqFeedback(), JSON.stringify(dados)); } catch(e) {}
}

function analisarFeedback() {
  var dados = [];
  try { dados = JSON.parse(fs.readFileSync(arqFeedback(), 'utf8')); } catch(e) {}
  var acertos = dados.filter(function(d) { return d.tipo === 'acerto'; }).length;
  var erros = dados.filter(function(d) { return d.tipo === 'erro'; }).length;
  var naoEntendidos = dados.filter(function(d) { return d.tipo === 'nao_entendido'; }).length;
  var taxa = dados.length > 0 ? Math.round(acertos/dados.length*100) : 0;
  var topErros = {};
  dados.filter(function(d){return d.tipo==='erro';}).forEach(function(d){ topErros[d.detalhe]=(topErros[d.detalhe]||0)+1; });
  return { total: dados.length, acertos: acertos, erros: erros, naoEntendidos: naoEntendidos, taxa: taxa, topErros: Object.entries(topErros).sort(function(a,b){return b[1]-a[1];}).slice(0,5) };
}

// Detecta feedback implícito do usuário
function detectarFeedbackImplicito(mensagem) {
  var t = String(mensagem).toLowerCase();
  if (/obrigado|valeu|perfeito|show|otimo|excelente|ajudou|resolveu|deu certo/.test(t)) return 'acerto';
  if (/nao era isso|errou|errado|nao entendeu|nao foi isso|incorreto/.test(t)) return 'erro';
  if (/nao sei|nao entendi|como assim|pode repetir|nao captei/.test(t)) return 'confusao';
  return null;
}

module.exports = { registrarFeedback, analisarFeedback, detectarFeedbackImplicito };
