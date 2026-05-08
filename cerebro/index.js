'use strict';
const nlp            = require('./nlp');
const modLeads       = require('./leads');
const modImoveis     = require('./imoveis');
const modVisitas     = require('./visitas');
const modMatch       = require('./match');
const modPortais     = require('./portais');
const modSistema     = require('./sistema');
const modMercado     = require('./mercado');
const acoes          = require('./acoes');
const estrategista   = require('./estrategista');
const rag            = require('./rag');
const memoria        = require('./memoria');
const aprendizado    = require('./aprendizado');
const notifs         = require('./notificacoes');
const onboarding     = require('./onboarding');
const relatorio      = require('./relatorio');
const leadsTemp      = require('./leads-temporal');
const scoring        = require('./scoring');
const suporte        = require('./suporte');
const { criarArvore } = require('./arvore');
const raciocinio = require('./raciocinio');
const intencao  = require('./intencao');
const navegacao = require('./navegacao');

const btn  = (label, href) => `<a href="${href}" style="display:inline-block;background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:4px">${label} →</a>`;
const chip = (label, msg)  => `<button onclick="enviarMsg('${msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${label}</button>`;

const arvore = criarArvore({
  btn, chip,
  modLeads, modImoveis, modVisitas, modMatch,
  modPortais, modSistema, modMercado,
  acoes, estrategista, rag, notifs, onboarding, relatorio
});

function responder(mensagem, d, user, imoveis, leads, visitas, contexto) {
  const uid    = user.id || user.userId || 'anon';
  const mNorm  = nlp.normalizar(mensagem);

  // Contexto de navegação — onde o usuário está agora
  const ctxNav = navegacao.contextoParaAssistente(uid);
  // Se o usuário está em uma página específica e pergunta algo vago
  // usar o domínio da página como contexto adicional
  if (ctxNav && !nlp.detectarDominio(mNorm) && ctxNav.dominioAtual) {
    contexto = { ...contexto, dominioNav: ctxNav.dominioAtual, paginaNav: ctxNav.labelAtual };
  }
  const perfil = memoria.atualizarPerfil(uid, { d, user, imoveis, leads });
  const hist   = memoria.historicoPorUsuario(uid, 5);

  // 1. SUPORTE TÉCNICO (dúvidas como/por que/erro)
  const resSuporte = suporte.responder(mNorm, btn, chip);
  if (resSuporte) return resSuporte;
  const isSistema = /como cadastrar|como adicionar foto|como conectar whatsapp|como inativar|como importar lead|como trocar senha|como acessar celular/.test(mNorm);
  if (isSistema) { const r = modSistema.responder(mNorm, d, btn, chip); if (r) return r; }

  // 2. LEADS TEMPORAIS (hoje/quentes/frias/reativar/por nome)
  const resTemp = leadsTemp.responder(mNorm, leads, btn, chip);
  if (resTemp) return resTemp;

  // 3. SCORING (prioridade/chance de fechar)
  const isScoring = /atender primeiro|mais chance|chance de fechar|pronto para proposta|ranking lead|scoring/.test(mNorm);
  if (isScoring) {
    const res = scoring.responder(mNorm, leads, visitas, btn, chip);
    if (res) return res;
  }

  // 4. ÁRVORE PRINCIPAL
  const resultado = arvore.responder(mensagem, d, user, imoveis, leads, visitas, hist, perfil);
  return resultado.resposta;
}

function detectarTema(mensagem) {
  return nlp.detectarDominio(nlp.normalizar(mensagem));
}

function pesosArvore() { return arvore.pesos(); }

module.exports = { responder, detectarTema, nlp, memoria, pesosArvore };
