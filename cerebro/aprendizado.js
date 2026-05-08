'use strict';
const fs   = require('fs');
const path = require('path');

const ARQUIVO   = path.join(__dirname, '..', 'assistente-nao-entendidos.json');
const THRESHOLD = 3; // quantas vezes para virar candidato

function carregar() {
  if (!fs.existsSync(ARQUIVO)) return { nao_entendidos:[], sugestoes:[], inconsistencias:[], confirmadas:[] };
  try { return JSON.parse(fs.readFileSync(ARQUIVO,'utf8')); } catch(_) { return { nao_entendidos:[], sugestoes:[], inconsistencias:[], confirmadas:[] }; }
}

function salvar(d) { fs.writeFileSync(ARQUIVO, JSON.stringify(d,null,2)); }

function similar(a, b) {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(t=>t.length>2));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(t=>t.length>2));
  const inter = [...ta].filter(t=>tb.has(t)).length;
  const uniao = new Set([...ta,...tb]).size;
  return uniao===0 ? 0 : inter/uniao;
}

// Registrar pergunta não entendida
function registrar(uid, pergunta) {
  const d = carregar();
  d.nao_entendidos = d.nao_entendidos||[];
  let grupo = null;
  for (const item of d.nao_entendidos) {
    if (similar(pergunta, item.exemplo) >= 0.5) { grupo = item; break; }
  }
  if (grupo) {
    grupo.count = (grupo.count||1)+1;
    grupo.usuarios = [...new Set([...(grupo.usuarios||[]),uid])];
    grupo.ultima = new Date().toISOString();
    if (grupo.count >= THRESHOLD && !grupo.sugerido) {
      grupo.sugerido = true;
      d.sugestoes = d.sugestoes||[];
      d.sugestoes.push({ pergunta:grupo.exemplo, count:grupo.count, status:'pendente', geradaEm:new Date().toISOString() });
    }
  } else {
    d.nao_entendidos.push({ exemplo:pergunta, count:1, usuarios:[uid], primeira:new Date().toISOString(), ultima:new Date().toISOString(), sugerido:false });
  }
  if (d.nao_entendidos.length>500) d.nao_entendidos = d.nao_entendidos.sort((a,b)=>b.count-a.count).slice(0,500);
  salvar(d);
}

// Registrar resposta dada para uma pergunta
function registrarResposta(pergunta, resposta, dominio) {
  const d = carregar();
  d.inconsistencias = d.inconsistencias||[];
  // Procurar grupo similar
  let grupo = null;
  for (const item of d.inconsistencias) {
    if (similar(pergunta, item.pergunta) >= 0.6) { grupo = item; break; }
  }
  if (grupo) {
    grupo.respostas = grupo.respostas||[];
    // Checar se resposta é diferente das anteriores
    const jaTem = grupo.respostas.some(r => similar(r.texto, resposta.replace(/<[^>]+>/g,'')) > 0.7);
    if (!jaTem) grupo.respostas.push({ texto: resposta.replace(/<[^>]+>/g,'').substring(0,150), dominio, data:new Date().toISOString() });
    grupo.count = (grupo.count||1)+1;
    grupo.ultima = new Date().toISOString();
  } else {
    d.inconsistencias.push({
      pergunta, count:1,
      respostas:[{ texto:resposta.replace(/<[^>]+>/g,'').substring(0,150), dominio, data:new Date().toISOString() }],
      primeira:new Date().toISOString(), ultima:new Date().toISOString()
    });
  }
  if (d.inconsistencias.length>300) d.inconsistencias = d.inconsistencias.slice(-300);
  salvar(d);
}

// Detectar se uma pergunta precisa de confirmação
// Retorna true se: pergunta feita 3+ vezes E respostas foram inconsistentes
function precisaConfirmacao(pergunta) {
  const d = carregar();
  // Checar inconsistências
  for (const item of (d.inconsistencias||[])) {
    if (similar(pergunta, item.pergunta) >= 0.6) {
      const respostasUnicas = item.respostas?.length || 0;
      const vezesFeita = item.count || 0;
      // 3+ vezes feita E 2+ respostas diferentes = inconsistente
      if (vezesFeita >= THRESHOLD && respostasUnicas >= 2) return true;
    }
  }
  return false;
}

// Confirmar que uma resposta estava correta (feedback positivo)
function confirmar(pergunta, resposta) {
  const d = carregar();
  d.confirmadas = d.confirmadas||[];
  d.confirmadas.push({ pergunta, resposta:resposta.replace(/<[^>]+>/g,'').substring(0,200), data:new Date().toISOString() });
  // Remover das inconsistências
  d.inconsistencias = (d.inconsistencias||[]).filter(i => similar(pergunta, i.pergunta) < 0.6);
  if (d.confirmadas.length>500) d.confirmadas = d.confirmadas.slice(-500);
  salvar(d);
}

// Marcar resposta como errada (feedback negativo)
function rejeitar(uid, pergunta, resposta) {
  registrar(uid, pergunta); // vai para fila de não entendidos
  const d = carregar();
  // Marcar inconsistência com flag de rejeitada
  for (const item of (d.inconsistencias||[])) {
    if (similar(pergunta, item.pergunta) >= 0.6) {
      item.rejeitada = true;
      item.rejeitadaEm = new Date().toISOString();
    }
  }
  salvar(d);
}

function topNaoEntendidas(n=10) {
  const d = carregar();
  return (d.nao_entendidos||[]).sort((a,b)=>b.count-a.count).slice(0,n);
}

function sugestoesPendentes() {
  const d = carregar();
  return (d.sugestoes||[]).filter(s=>s.status==='pendente');
}

function inconsistenciasDetectadas(n=10) {
  const d = carregar();
  return (d.inconsistencias||[])
    .filter(i => i.count >= THRESHOLD && (i.respostas?.length||0) >= 2)
    .sort((a,b)=>b.count-a.count).slice(0,n);
}

module.exports = { registrar, registrarResposta, precisaConfirmacao, confirmar, rejeitar, topNaoEntendidas, sugestoesPendentes, inconsistenciasDetectadas };
