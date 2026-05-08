#!/bin/bash
TARGET="$HOME/Downloads/matchimoveis /cerebro"

cat > "$TARGET/index.js" << 'JSEOF'
'use strict';
/**
 * CÉREBRO MATCHIMOVEIS v16.0 — ÁRVORE VIVA
 * Todos os módulos integrados numa árvore de decisão que cresce sozinha.
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
const aprendizado  = require('./aprendizado');
const notifs       = require('./notificacoes');
const onboarding   = require('./onboarding');
const relatorio    = require('./relatorio');
const { criarArvore } = require('./arvore');

// ── HELPERS UI ────────────────────────────────────────────────────────────────
const btn  = (label, href) => `<a href="${href}" style="display:inline-block;background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:4px">${label} →</a>`;
const chip = (label, msg)  => `<button onclick="enviarMsg('${msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${label}</button>`;

// ── CRIAR ÁRVORE UMA VEZ (singleton) ─────────────────────────────────────────
const arvore = criarArvore({
  btn, chip,
  modLeads, modImoveis, modVisitas, modMatch,
  modPortais, modSistema, modMercado,
  acoes, estrategista, rag, notifs, onboarding, relatorio
});

// ── FUNÇÃO PRINCIPAL ──────────────────────────────────────────────────────────
function responder(mensagem, d, user, imoveis, leads, visitas, contexto) {
  const uid = user.id || user.userId || 'anon';

  // 1. Atualizar perfil semântico
  const perfil = memoria.atualizarPerfil(uid, { d, user, imoveis, leads });

  // 2. Buscar histórico para contexto
  const historicoUsuario = memoria.historicoPorUsuario(uid, 5);

  // 3. Percorrer a árvore
  const resultado = arvore.responder(mensagem, d, user, imoveis, leads, visitas, historicoUsuario, perfil);

  // 4. Log de aprendizado (qual galho resolveu)
  if (resultado.noResolveu) {
    console.log(`[cerebro] nó: ${resultado.noResolveu} | domínio: ${resultado.dominio||'—'} | slots: ${JSON.stringify(resultado.slots)}`);
  }

  return resultado.resposta;
}

function detectarTema(mensagem) {
  return nlp.detectarDominio(nlp.normalizar(mensagem));
}

// ── EXPORTAR PESOS (para o auto-expansor aprender) ───────────────────────────
function pesosArvore() {
  return arvore.pesos();
}

module.exports = { responder, detectarTema, nlp, memoria, pesosArvore };
JSEOF

echo "✅ index.js v16.0 (árvore viva) instalado!"
