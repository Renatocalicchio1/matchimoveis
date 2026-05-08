'use strict';
const nlp        = require('./nlp');
const modLeads   = require('./leads');
const modImoveis = require('./imoveis');
const modVisitas = require('./visitas');
const modMatch   = require('./match');
const modPortais = require('./portais');
const modSistema = require('./sistema');
const modMercado = require('./mercado');
const acoes      = require('./acoes');

const btn  = (label, href) => `<a href="${href}" style="display:inline-block;background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:4px">${label} →</a>`;
const chip = (label, msg)  => `<button onclick="enviarMsg('${msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${label}</button>`;

function saudacao(d, nome) {
  const hora = new Date().getHours();
  const s = hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
  if (d.hoje>0)
    return `${s}, ${nome}! 👋 ⚠️ <strong>${d.hoje} visita(s) hoje!</strong><br>🏠 ${d.ativos} imóveis · 👥 ${d.leads} leads · 🎯 ${d.comMatch} matchs<br><br>${btn('Ver visitas de hoje','/app/visitas')}`;
  if (d.leads===0&&d.ativos===0)
    return `${s}, ${nome}! 👋 Sua conta está vazia.<br><br>${btn('Importar imóveis','/app/imoveis')}${btn('Importar leads','/app-importar-leads')}`;
  return `${s}, ${nome}! 👋<br>🏠 ${d.ativos} imóveis · 👥 ${d.leads} leads · 🎯 ${d.comMatch} matchs · ⏳ ${d.pendentes} pendentes<br><br>${chip('🏠 Imóveis','meus imoveis')}${chip('👥 Leads','minhas leads')}${chip('📅 Visitas','minhas visitas')}${chip('📊 Resumo','resumo geral')}${chip('⚡ O que você faz?','o que voce faz')}`;
}

function dashboard(d) {
  const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
  return `📊 <strong>Resumo da sua conta:</strong><br><br>`+
    `🏠 Imóveis: <strong>${d.ativos}</strong> ativos · ${d.inativos} inativos<br>`+
    `👥 Leads: <strong>${d.leads}</strong> · ${d.organicas} orgânicas · ${d.importadas} importadas<br>`+
    `🎯 Match: <strong>${d.comMatch}</strong> (${taxa}%) · ${d.semMatch} sem match<br>`+
    `📅 Visitas: <strong>${d.visitas}</strong> · ${d.hoje} hoje · ${d.pendentes} pendentes<br><br>`+
    `${btn('Imóveis','/app/imoveis')}${btn('Leads','/app/leads')}${btn('Visitas','/app/visitas')}`;
}

function naoEntendeu(contexto) {
  const frases = ['Hmm, não entendi 🤔 Pode reformular?','Desculpe, não captei. Tente de outro jeito.','Tente: leads, imóveis, visitas, match ou "o que você faz".'];
  const chips = contexto?.ultimoTema==='leads'
    ? [chip('👥 Leads','minhas leads'),chip('🎯 Match','leads com match'),chip('📋 Importar','importar leads')]
    : [chip('👥 Leads','minhas leads'),chip('🏠 Imóveis','meus imoveis'),chip('📅 Visitas','minhas visitas'),chip('⚡ O que você faz?','o que voce faz')];
  return frases[Math.floor(Math.random()*frases.length)]+'<br><br>'+chips.join('');
}

function responder(mensagem, d, user, imoveis, leads, contexto) {
  const nome    = user.nome||user.name||'corretor';
  const mNorm   = nlp.normalizar(mensagem);
  const dominio = nlp.detectarDominio(mNorm);

  // 1. AÇÕES TÊM PRIORIDADE
  const acao = acoes.detectarAcao(mNorm);
  if (acao) {
    const resultado = acoes.executarAcao(acao, mensagem, mNorm, d, btn, chip);
    if (resultado) return resultado;
  }

  // 2. ROTEAMENTO POR DOMÍNIO
  switch(dominio) {
    case 'saudacao':     return saudacao(d, nome);
    case 'dashboard':    return dashboard(d);
    case 'leads':        return modLeads.responder(mNorm, d, btn, chip);
    case 'imoveis':      return modImoveis.responder(mNorm, d, imoveis, btn, chip);
    case 'visitas':      return modVisitas.responder(mNorm, d, btn, chip);
    case 'match':        return modMatch.responder(mNorm, d, btn, chip);
    case 'portais':      return modPortais.responder(mNorm, d, btn, chip);
    case 'sistema':      return modSistema.responder(mNorm, d, btn, chip);
    case 'mercado':      return modMercado.responder(mNorm, leads, imoveis, btn, chip);
    case 'coins':        return `🪙 Match Coins — seu sistema de recompensas.<br><br>${btn('Ver coins','/app/coins')}`;
    case 'notificacoes': return `🔔 Central de notificações.<br><br>${btn('Ver notificações','/app/notificacoes')}`;
    default:             return naoEntendeu(contexto);
  }
}

function detectarTema(mensagem) {
  return nlp.detectarDominio(nlp.normalizar(mensagem));
}

module.exports = { responder, detectarTema, nlp };
