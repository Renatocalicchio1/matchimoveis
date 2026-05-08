#!/bin/bash
TARGET="$HOME/Downloads/matchimoveis /cerebro"

# ── estrategista.js ───────────────────────────────────────────────────────────
cat > "$TARGET/estrategista.js" << 'JSEOF'
'use strict';

function analisar(d, leads, imoveis, visitas, btn, chip) {
  const alertas = [];
  const acoes = [];
  const oportunidades = [];

  // ALERTAS CRÍTICOS
  if (d.hoje > 0)
    alertas.push(`🔴 <strong>${d.hoje} visita(s) hoje!</strong> Não perca o horário. ${btn('Ver visitas','/app/visitas')}`);
  if (d.pendentes > 0)
    alertas.push(`🟡 <strong>${d.pendentes} visita(s) pendente(s)</strong> aguardando confirmação. ${btn('Confirmar','/app/visitas')}`);
  if (d.semMatch > 0 && d.leads > 5)
    alertas.push(`🟡 <strong>${d.semMatch} leads sem match</strong> — pode estar faltando imóvel no bairro certo. ${chip('Ver demanda','demanda por bairro')}`);

  // AÇÕES PRIORITÁRIAS
  if (d.ativos === 0)
    acoes.push(`Importe seus imóveis via XML para começar. ${btn('Importar XML','/app/imoveis')}`);
  else if (d.leads === 0)
    acoes.push(`Importe leads dos portais para fazer o match. ${btn('Importar leads','/app-importar-leads')}`);
  else if (d.comMatch === 0)
    acoes.push(`Nenhuma lead tem match ainda. Faça o match agora! ${btn('Fazer match','/app/leads')}`);

  // Leads com match mas sem visita agendada
  const comMatchSemVisita = leads.filter(l =>
    l.matchesBase && l.matchesBase.length > 0 &&
    !visitas.some(v => v.leadId === (l.id||l._id))
  ).length;
  if (comMatchSemVisita > 0)
    acoes.push(`Envie a vitrine para as <strong>${comMatchSemVisita} leads com match</strong> que ainda não visitaram. ${btn('Ver leads','/app/leads?filtro=com_match')}`);

  // OPORTUNIDADES DE MERCADO
  const bairrosLeads = {};
  leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro] = (bairrosLeads[l.bairro]||0)+1; });
  const bairrosIm = {};
  imoveis.filter(i=>i.status!=='inativo').forEach(i => { if (i.bairro) bairrosIm[i.bairro] = (bairrosIm[i.bairro]||0)+1; });

  Object.entries(bairrosLeads)
    .filter(([b,n]) => n >= 3 && (!bairrosIm[b] || bairrosIm[b] < n))
    .sort((a,b) => b[1]-a[1]).slice(0,2)
    .forEach(([bairro, demanda]) => {
      const oferta = bairrosIm[bairro]||0;
      oportunidades.push(`💡 <strong>${bairro}</strong>: ${demanda} leads buscando, só ${oferta} imóvel(is) — capte mais imóveis aqui!`);
    });

  const taxa = d.leads > 0 ? Math.round(d.comMatch/d.leads*100) : 0;
  if (taxa < 40 && d.leads > 5)
    oportunidades.push(`📉 Taxa de match em <strong>${taxa}%</strong> — importe mais imóveis ou revise os bairros. ${chip('Importar XML','importar xml')}`);

  // NADA URGENTE
  if (!alertas.length && !acoes.length && !oportunidades.length)
    return `✅ <strong>Tudo em dia!</strong> Nenhuma ação urgente agora.<br><br>${chip('📊 Resumo','resumo geral')}${chip('📍 Demanda','demanda por bairro')}`;

  let html = `🧠 <strong>Plano de ação para hoje:</strong><br><br>`;

  if (alertas.length) {
    html += `<strong>⚠️ Atenção agora:</strong><br>`;
    alertas.forEach(a => { html += `${a}<br><br>`; });
  }

  if (acoes.length) {
    html += `<strong>✅ O que fazer:</strong><br>`;
    acoes.forEach((a,i) => {
      html += `<div style="display:flex;gap:10px;margin:6px 0;align-items:flex-start">`+
        `<span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${i+1}</span>`+
        `<span>${a}</span></div>`;
    });
    html += '<br>';
  }

  if (oportunidades.length) {
    html += `<strong>💡 Oportunidades:</strong><br>`;
    oportunidades.forEach(o => { html += `${o}<br>`; });
  }

  return html;
}

module.exports = { analisar };
JSEOF

# ── index.js com estrategista ─────────────────────────────────────────────────
cat > "$TARGET/index.js" << 'JSEOF'
'use strict';
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

const btn  = (label, href) => `<a href="${href}" style="display:inline-block;background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:4px">${label} →</a>`;
const chip = (label, msg)  => `<button onclick="enviarMsg('${msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${label}</button>`;

function saudacao(d, nome, leads, imoveis, visitas) {
  const hora = new Date().getHours();
  const s = hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
  // Saudação já traz plano do dia embutido
  const plano = estrategista.analisar(d, leads, imoveis, visitas, btn, chip);
  if (d.hoje > 0)
    return `${s}, ${nome}! 👋 ⚠️ <strong>${d.hoje} visita(s) hoje!</strong><br>🏠 ${d.ativos} imóveis · 👥 ${d.leads} leads · 🎯 ${d.comMatch} matchs<br><br>${plano}`;
  if (d.leads===0 && d.ativos===0)
    return `${s}, ${nome}! 👋 Sua conta está vazia. Vamos começar?<br><br>${btn('Importar imóveis','/app/imoveis')}${btn('Importar leads','/app-importar-leads')}`;
  return `${s}, ${nome}! 👋<br>🏠 ${d.ativos} imóveis · 👥 ${d.leads} leads · 🎯 ${d.comMatch} matchs · ⏳ ${d.pendentes} pendentes<br><br>${plano}`;
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

function naoEntendeu(contexto) {
  const frases = ['Hmm, não entendi 🤔 Pode reformular?','Desculpe, não captei. Tente de outro jeito.','Tente: leads, imóveis, visitas, match ou "o que devo fazer hoje".'];
  const chips = contexto?.ultimoTema==='leads'
    ? [chip('👥 Leads','minhas leads'),chip('🎯 Match','leads com match'),chip('📋 Importar','importar leads')]
    : [chip('👥 Leads','minhas leads'),chip('🏠 Imóveis','meus imoveis'),chip('📅 Visitas','minhas visitas'),chip('🧠 Plano do dia','o que devo fazer hoje')];
  return frases[Math.floor(Math.random()*frases.length)]+'<br><br>'+chips.join('');
}

function responder(mensagem, d, user, imoveis, leads, visitas, contexto) {
  const nome    = user.nome||user.name||'corretor';
  const mNorm   = nlp.normalizar(mensagem);

  // 1. PLANO DO DIA / ESTRATÉGIA
  if (/o que devo fazer|plano do dia|me orienta|por onde comecar|resumo do dia|o que fazer hoje/.test(mNorm))
    return estrategista.analisar(d, leads, imoveis, visitas, btn, chip);

  // 2. AÇÕES TÊM PRIORIDADE
  const acao = acoes.detectarAcao(mNorm);
  if (acao) {
    const resultado = acoes.executarAcao(acao, mensagem, mNorm, d, btn, chip);
    if (resultado) return resultado;
  }

  // 3. ROTEAMENTO POR DOMÍNIO
  const dominio = nlp.detectarDominio(mNorm);
  switch(dominio) {
    case 'saudacao':     return saudacao(d, nome, leads, imoveis, visitas);
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
    default:             return naoEntendeu(contexto);
  }
}

function detectarTema(mensagem) {
  return nlp.detectarDominio(nlp.normalizar(mensagem));
}

module.exports = { responder, detectarTema, nlp };
JSEOF

echo "✅ estrategista.js + index.js v14.0 instalados!"
ls "$TARGET"
