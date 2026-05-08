'use strict';
const fs   = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '..', 'assistente-memoria.json');

function carregar() {
  if (!fs.existsSync(ARQUIVO)) return { historico:[], perfis:{} };
  try { return JSON.parse(fs.readFileSync(ARQUIVO,'utf8')); } catch(_) { return { historico:[], perfis:{} }; }
}

function salvar(mem) {
  fs.writeFileSync(ARQUIVO, JSON.stringify(mem, null, 2));
}

// ── ATUALIZAR PERFIL SEMÂNTICO DO USUÁRIO ─────────────────────────────────────
function atualizarPerfil(uid, dados) {
  const mem = carregar();
  if (!mem.perfis) mem.perfis = {};
  if (!mem.perfis[uid]) mem.perfis[uid] = {
    nome: dados.user?.nome || dados.user?.name || 'corretor',
    ultimaAtividade: null,
    taxaMatch: 0,
    totalLeads: 0,
    totalImoveis: 0,
    bairrosMaisUsados: [],
    tiposFavoritos: [],
    acessos: 0
  };

  const p = mem.perfis[uid];
  p.ultimaAtividade  = new Date().toISOString();
  p.taxaMatch        = dados.d?.leads > 0 ? Math.round(dados.d.comMatch/dados.d.leads*100) : 0;
  p.totalLeads       = dados.d?.leads || 0;
  p.totalImoveis     = dados.d?.ativos || 0;
  p.acessos          = (p.acessos||0) + 1;

  // Bairros mais buscados nas leads
  if (dados.leads?.length) {
    const bairros = {};
    dados.leads.forEach(l => { if (l.bairro) bairros[l.bairro]=(bairros[l.bairro]||0)+1; });
    p.bairrosMaisUsados = Object.entries(bairros).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([b])=>b);
  }

  // Tipos favoritos na carteira
  if (dados.imoveis?.length) {
    const tipos = {};
    dados.imoveis.filter(i=>i.status!=='inativo').forEach(i => { if (i.tipo) tipos[i.tipo]=(tipos[i.tipo]||0)+1; });
    p.tiposFavoritos = Object.entries(tipos).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t])=>t);
  }

  mem.perfis[uid] = p;
  salvar(mem);
  return p;
}

// ── SALVAR INTERAÇÃO ──────────────────────────────────────────────────────────
function salvarInteracao(uid, pergunta, resposta) {
  const mem = carregar();
  mem.historico = mem.historico || [];
  mem.historico.push({ userId:uid, pergunta, resposta, data:new Date().toISOString() });
  if (mem.historico.length > 500) mem.historico = mem.historico.slice(-500);
  salvar(mem);
}

// ── BUSCAR HISTÓRICO DO USUÁRIO ───────────────────────────────────────────────
function historicoPorUsuario(uid, n=5) {
  const mem = carregar();
  return (mem.historico||[]).filter(h=>h.userId===uid).slice(-n);
}

// ── SALVAR FEEDBACK ───────────────────────────────────────────────────────────
function salvarFeedback(uid, pergunta, resposta, util) {
  const mem = carregar();
  if (!mem.feedback) mem.feedback = [];
  mem.feedback.push({ userId:uid, pergunta, resposta, util, data:new Date().toISOString() });
  if (mem.feedback.length > 1000) mem.feedback = mem.feedback.slice(-1000);

  // Registrar padrões úteis
  if (util && !mem.padroes_uteis) mem.padroes_uteis = [];
  if (util) {
    mem.padroes_uteis = mem.padroes_uteis || [];
    mem.padroes_uteis.push({ pergunta, resposta, votos: 1 });
  }

  salvar(mem);
}

// ── OBTER PERFIL ──────────────────────────────────────────────────────────────
function obterPerfil(uid) {
  const mem = carregar();
  return (mem.perfis||{})[uid] || null;
}

module.exports = { atualizarPerfil, salvarInteracao, historicoPorUsuario, salvarFeedback, obterPerfil };
