#!/bin/bash
TARGET="$HOME/Downloads/matchimoveis /cerebro"

# ── 1. RAG + SLOTS: cerebro/rag.js ───────────────────────────────────────────
cat > "$TARGET/rag.js" << 'JSEOF'
'use strict';
/**
 * RAG — Retrieval Augmented Generation
 * Busca semântica nos dados reais + extração de slots
 */

// ── EXTRAIR SLOTS DA MENSAGEM ─────────────────────────────────────────────────
function extrairSlots(mNorm) {
  const slots = {};

  // Tipo de imóvel
  const tipos = ['apartamento','casa','cobertura','sala','terreno','sobrado','studio','loft','galpao'];
  for (const t of tipos) {
    if (mNorm.includes(t)) { slots.tipo = t; break; }
  }

  // Quartos
  const q = mNorm.match(/(\d+)\s*(?:quarto|dorm|suite)/);
  if (q) slots.quartos = parseInt(q[1]);

  // Valor máximo
  const v = mNorm.match(/(?:ate|max|maximo|menos de|abaixo de)\s*(?:r\$)?\s*(\d+(?:[.,]\d+)?)\s*(mil|k|m)?/);
  if (v) {
    let val = parseFloat(v[1].replace(',','.'));
    if (v[2] === 'mil' || v[2] === 'k') val *= 1000;
    if (v[2] === 'm') val *= 1000000;
    slots.valorMax = val;
  }

  // Valor mínimo
  const vm = mNorm.match(/(?:partir de|minimo|acima de|mais de)\s*(?:r\$)?\s*(\d+(?:[.,]\d+)?)\s*(mil|k|m)?/);
  if (vm) {
    let val = parseFloat(vm[1].replace(',','.'));
    if (vm[2] === 'mil' || vm[2] === 'k') val *= 1000;
    if (vm[2] === 'm') val *= 1000000;
    slots.valorMin = val;
  }

  // Vagas
  const vg = mNorm.match(/(\d+)\s*vaga/);
  if (vg) slots.vagas = parseInt(vg[1]);

  // Suítes
  const su = mNorm.match(/(\d+)\s*suite/);
  if (su) slots.suites = parseInt(su[1]);

  return slots;
}

// ── BUSCA SEMÂNTICA NOS IMÓVEIS ───────────────────────────────────────────────
function buscarImoveis(mNorm, imoveis, bairrosDisponiveis) {
  const slots = extrairSlots(mNorm);

  // Detectar bairro na mensagem
  const bairroEncontrado = bairrosDisponiveis.find(b =>
    mNorm.includes(b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))
  );
  if (bairroEncontrado) slots.bairro = bairroEncontrado;

  // Se não tem nenhum slot, não é uma busca
  if (!Object.keys(slots).length) return null;

  // Filtrar imóveis
  let resultado = imoveis.filter(i => i.status !== 'inativo');

  if (slots.tipo)     resultado = resultado.filter(i => i.tipo && i.tipo.toLowerCase().includes(slots.tipo));
  if (slots.bairro)   resultado = resultado.filter(i => i.bairro && i.bairro.toLowerCase().includes(slots.bairro.toLowerCase()));
  if (slots.quartos)  resultado = resultado.filter(i => i.quartos && parseInt(i.quartos) >= slots.quartos);
  if (slots.valorMax) resultado = resultado.filter(i => i.valor && parseFloat(i.valor) <= slots.valorMax);
  if (slots.valorMin) resultado = resultado.filter(i => i.valor && parseFloat(i.valor) >= slots.valorMin);
  if (slots.vagas)    resultado = resultado.filter(i => i.vagas && parseInt(i.vagas) >= slots.vagas);
  if (slots.suites)   resultado = resultado.filter(i => i.suites && parseInt(i.suites) >= slots.suites);

  return { slots, resultado };
}

// ── BUSCA SEMÂNTICA NAS LEADS ─────────────────────────────────────────────────
function buscarLeads(mNorm, leads, bairrosDisponiveis) {
  const slots = extrairSlots(mNorm);

  const bairroEncontrado = bairrosDisponiveis.find(b =>
    mNorm.includes(b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))
  );
  if (bairroEncontrado) slots.bairro = bairroEncontrado;

  if (!Object.keys(slots).length) return null;

  let resultado = leads;
  if (slots.tipo)    resultado = resultado.filter(l => l.tipo && l.tipo.toLowerCase().includes(slots.tipo));
  if (slots.bairro)  resultado = resultado.filter(l => l.bairro && l.bairro.toLowerCase().includes(slots.bairro.toLowerCase()));
  if (slots.quartos) resultado = resultado.filter(l => l.quartos && parseInt(l.quartos) >= slots.quartos);

  return { slots, resultado };
}

// ── FORMATAR RESULTADO DE BUSCA ───────────────────────────────────────────────
function formatarBuscaImoveis(busca, btn) {
  const { slots, resultado } = busca;

  const filtrosAplicados = Object.entries(slots)
    .map(([k,v]) => {
      if (k==='tipo') return v;
      if (k==='bairro') return `em ${v}`;
      if (k==='quartos') return `${v}+ quartos`;
      if (k==='valorMax') return `até R$${(v/1000).toFixed(0)}k`;
      if (k==='valorMin') return `a partir R$${(v/1000).toFixed(0)}k`;
      if (k==='vagas') return `${v}+ vagas`;
      if (k==='suites') return `${v}+ suítes`;
      return '';
    }).filter(Boolean).join(', ');

  if (resultado.length === 0)
    return `🔍 Nenhum imóvel encontrado para: <strong>${filtrosAplicados}</strong><br><br>${btn('Ver todos os imóveis','/app/imoveis')}`;

  const lista = resultado.slice(0,5).map(i => {
    const val = i.valor ? ` · R$${Number(i.valor).toLocaleString('pt-BR')}` : '';
    const qts = i.quartos ? ` · ${i.quartos}q` : '';
    const vg  = i.vagas ? ` · ${i.vagas}vg` : '';
    return `• <strong>${i.tipo||'Imóvel'}</strong>${qts}${vg} — ${i.bairro||''}${val}`;
  }).join('<br>');

  return `🔍 <strong>${resultado.length} imóvel(is)</strong> encontrado(s) para: <em>${filtrosAplicados}</em><br><br>${lista}`+
    (resultado.length > 5 ? `<br><em>...e mais ${resultado.length-5}</em>` : '')+
    `<br><br>${btn('Ver todos','/app/imoveis')}`;
}

module.exports = { extrairSlots, buscarImoveis, buscarLeads, formatarBuscaImoveis };
JSEOF

# ── 2. MEMÓRIA SEMÂNTICA: cerebro/memoria.js ──────────────────────────────────
cat > "$TARGET/memoria.js" << 'JSEOF'
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
JSEOF

echo "✅ rag.js e memoria.js criados!"

# ── 3. ATUALIZAR index.js com tudo integrado ──────────────────────────────────
cat > "$TARGET/index.js" << 'JSEOF'
'use strict';
/**
 * CÉREBRO MATCHIMOVEIS v14.0
 * RAG + Slots + Memória Semântica + Feedback Loop
 */
const nlp          = require('./nlp');
const modLeads     = require('./leads');
const modImoveis   = require('./imoveis');
const modVisitas   = require('./visitas');
const modMatch     = require('./match');
const modPortais   = require('./portais');
const modSistema   = require('./sistema');
const modMercado   = require('./mercado');
const acoes        = require('./acoes');
const estrategista = require('./estrategista');
const rag          = require('./rag');
const memoria      = require('./memoria');

const btn  = (label, href) => `<a href="${href}" style="display:inline-block;background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:4px">${label} →</a>`;
const chip = (label, msg)  => `<button onclick="enviarMsg('${msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${label}</button>`;

function saudacao(d, nome, leads, imoveis, visitas, perfil) {
  const hora = new Date().getHours();
  const s = hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
  const plano = estrategista.analisar(d, leads, imoveis, visitas, btn, chip);
  // Personalizar com perfil
  const dica = perfil && perfil.bairrosMaisUsados?.length
    ? `<br>📍 Seus bairros foco: <strong>${perfil.bairrosMaisUsados.join(', ')}</strong>` : '';
  if (d.hoje > 0)
    return `${s}, ${nome}! 👋 ⚠️ <strong>${d.hoje} visita(s) hoje!</strong>${dica}<br><br>${plano}`;
  if (d.leads===0 && d.ativos===0)
    return `${s}, ${nome}! 👋 Sua conta está vazia. Vamos começar?<br><br>${btn('Importar imóveis','/app/imoveis')}${btn('Importar leads','/app-importar-leads')}`;
  return `${s}, ${nome}! 👋${dica}<br>🏠 ${d.ativos} imóveis · 👥 ${d.leads} leads · 🎯 ${d.comMatch} matchs · ⏳ ${d.pendentes} pendentes<br><br>${plano}`;
}

function dashboard(d, leads, imoveis, visitas) {
  const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
  return `📊 <strong>Resumo da sua conta:</strong><br><br>`+
    `🏠 Imóveis: <strong>${d.ativos}</strong> ativos · ${d.inativos} inativos<br>`+
    `👥 Leads: <strong>${d.leads}</strong> · ${d.organicas} orgânicas · ${d.importadas} importadas<br>`+
    `🎯 Match: <strong>${d.comMatch}</strong> (${taxa}%) · ${d.semMatch} sem match<br>`+
    `📅 Visitas: <strong>${d.visitas}</strong> · ${d.hoje} hoje · ${d.pendentes} pendentes<br><br>`+
    estrategista.analisar(d, leads, imoveis, visitas, btn, chip);
}

function naoEntendeu(contexto, perfil) {
  const frases = [
    'Hmm, não entendi 🤔 Pode reformular?',
    'Desculpe, não captei. Tente de outro jeito.',
    'Tente: leads, imóveis, visitas, match ou "o que devo fazer hoje".'
  ];
  // Sugerir baseado no perfil
  const chipsPerfil = perfil?.bairrosMaisUsados?.length
    ? perfil.bairrosMaisUsados.map(b => chip(`🏠 ${b}`, `imoveis em ${b}`))
    : [];
  const chipsDefault = contexto?.ultimoTema==='leads'
    ? [chip('👥 Leads','minhas leads'),chip('🎯 Match','leads com match'),chip('📋 Importar','importar leads')]
    : [chip('👥 Leads','minhas leads'),chip('🏠 Imóveis','meus imoveis'),chip('📅 Visitas','minhas visitas'),chip('🧠 Plano do dia','o que devo fazer hoje')];
  return frases[Math.floor(Math.random()*frases.length)]+'<br><br>'+[...chipsDefault,...chipsPerfil].join('');
}

// ── FUNÇÃO PRINCIPAL ──────────────────────────────────────────────────────────
function responder(mensagem, d, user, imoveis, leads, visitas, contexto) {
  const uid     = user.id || user.userId;
  const nome    = user.nome||user.name||'corretor';
  const mNorm   = nlp.normalizar(mensagem);

  // Atualizar perfil semântico em background
  const perfil = memoria.atualizarPerfil(uid, { d, user, imoveis, leads });

  // 1. RAG — busca semântica (tem slots na mensagem?)
  const buscaIm = rag.buscarImoveis(mNorm, imoveis, d.bairros);
  if (buscaIm) return rag.formatarBuscaImoveis(buscaIm, btn);

  // 2. PLANO DO DIA
  if (/o que devo fazer|plano do dia|me orienta|por onde comecar|resumo do dia|o que fazer hoje/.test(mNorm))
    return estrategista.analisar(d, leads, imoveis, visitas, btn, chip);

  // 3. AÇÕES
  const acao = acoes.detectarAcao(mNorm);
  if (acao) {
    const resultado = acoes.executarAcao(acao, mensagem, mNorm, d, btn, chip);
    if (resultado) return resultado;
  }

  // 4. ROTEAMENTO POR DOMÍNIO
  const dominio = nlp.detectarDominio(mNorm);
  switch(dominio) {
    case 'saudacao':     return saudacao(d, nome, leads, imoveis, visitas, perfil);
    case 'dashboard':    return dashboard(d, leads, imoveis, visitas);
    case 'leads':        return modLeads.responder(mNorm, d, btn, chip);
    case 'imoveis':      return modImoveis.responder(mNorm, d, imoveis, btn, chip);
    case 'visitas':      return modVisitas.responder(mNorm, d, btn, chip);
    case 'match':        return modMatch.responder(mNorm, d, btn, chip);
    case 'portais':      return modPortais.responder(mNorm, d, btn, chip);
    case 'sistema':      return modSistema.responder(mNorm, d, btn, chip);
    case 'mercado':      return modMercado.responder(mNorm, leads, imoveis, btn, chip);
    case 'coins':        return `🪙 Match Coins — seu sistema de recompensas.<br><br>${btn('Ver coins','/app/coins')}`;
    case 'notificacoes': return `🔔 Central de notificações.<br><br>${btn('Ver notificações','/app/notificacoes')}`;
    default:             return naoEntendeu(contexto, perfil);
  }
}

function detectarTema(mensagem) {
  return nlp.detectarDominio(nlp.normalizar(mensagem));
}

module.exports = { responder, detectarTema, nlp, memoria };
JSEOF

echo "✅ index.js v14.0 instalado com RAG + Slots + Memória + Feedback!"
echo ""
echo "Módulos ativos:"
ls "$TARGET"
