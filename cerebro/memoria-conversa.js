'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');

function arquivoHistorico(userId) {
  return path.join(DATA_DIR, 'hist-' + userId + '.json');
}

function salvar(userId, role, texto, extra) {
  const arq = arquivoHistorico(userId);
  let hist = [];
  try { hist = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch(e) {}
  hist.push({ role, texto: String(texto).slice(0, 500), at: new Date().toISOString(), ...(extra||{}) });
  if (hist.length > 30) hist = hist.slice(-30);
  try { fs.writeFileSync(arq, JSON.stringify(hist)); } catch(e) {}
  return hist;
}

function carregar(userId) {
  try { return JSON.parse(fs.readFileSync(arquivoHistorico(userId), 'utf8')); } catch(e) { return []; }
}

function ultimasN(userId, n) {
  return carregar(userId).slice(-(n||6));
}

// Extrai entidades mencionadas nas últimas mensagens
function contextoAtual(userId) {
  const hist = carregar(userId);
  const ctx = { bairro: null, nomeLead: null, tipo: null, valorMax: null, quartos: null, ultimaIntencao: null };
  const msgs = hist.slice(-10).reverse();
  for (const m of msgs) {
    const t = String(m.texto || '').toLowerCase();
    if (!ctx.bairro) { const b = t.match(/\b(?:em|no|na|bairro)\s+([a-z][a-z\s]{2,20}?)(?:\s*[,.]|$)/i); if(b) ctx.bairro = b[1].trim(); }
    if (!ctx.nomeLead) { const n = t.match(/(?:lead|cliente)\s+([a-z]{3,})/i); if(n) ctx.nomeLead = n[1]; }
    if (!ctx.tipo) { const tp = t.match(/\b(apartamento|apto|casa|cobertura|terreno|sobrado|studio)\b/i); if(tp) ctx.tipo = tp[1]; }
    if (!ctx.quartos) { const q = t.match(/(\d+)\s*(?:quarto|dorm)/i); if(q) ctx.quartos = parseInt(q[1]); }
    if (!ctx.valorMax) { const v = t.match(/(?:ate|r\$)\s*([\d.]+(?:,\d{2})?)/i); if(v){const vv=parseFloat(v[1].replace(/\./g,'').replace(',','.')); if(vv>10000) ctx.valorMax=vv;} }
    if (!ctx.ultimaIntencao && m.intencao) ctx.ultimaIntencao = m.intencao;
  }
  return ctx;
}

// Resolve pronomes como "ele", "ela", "esse", "o mesmo"
function resolverPronome(userId, texto) {
  const t = String(texto).toLowerCase();
  if (!/\b(ele|ela|esse|essa|mesmo|mesma|o mesmo|a mesma|dele|dela)\b/.test(t)) return null;
  const ctx = contextoAtual(userId);
  return ctx;
}

// Retorna resumo das últimas interações para exibir no chat
function resumoRecente(userId) {
  const hist = ultimasN(userId, 6);
  if (!hist.length) return null;
  return hist.map(h => (h.role==='user'?'Você: ':'Assistente: ') + String(h.texto).slice(0,80)).join('\n');
}

function limpar(userId) {
  try { fs.unlinkSync(arquivoHistorico(userId)); } catch(e) {}
}

module.exports = { salvar, carregar, ultimasN, contextoAtual, resolverPronome, resumoRecente, limpar };
