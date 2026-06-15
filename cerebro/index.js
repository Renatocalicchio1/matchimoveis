'use strict';

// ── DEPENDÊNCIAS ──────────────────────────────────────────────────────────────
const nlp          = require('./nlp');
const memoria      = require('./memoria');
const memoriaConversa = require('./memoria-conversa');
const entidades    = require('./entidades');
const acoesDiretas = require('./acoes-diretas');
const groqIA       = require('./groq-ia');
const estrategista = require('./estrategista');
const onboarding   = require('./onboarding');
const contexto     = require('./contexto');
const navegador    = require('./navegador');

// ── HELPERS ───────────────────────────────────────────────────────────────────
const btn  = (l,h) => `<a href="${h}" style="display:inline-block;background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:4px">${l} →</a>`;
const chip = (l,m) => '<button onclick="enviarMsg(' + "'" + m + "'" + ')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">' + l + '</button>';

// ── FEEDBACKS PARA APRENDIZADO ────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const FEEDBACK_PATH = path.join(__dirname, '..', 'assistente-feedbacks.json');

function carregarFeedbacks() {
  try { return JSON.parse(fs.readFileSync(FEEDBACK_PATH,'utf8')); } 
  catch(e) { return { positivos:[], negativos:[] }; }
}

function contextoFeedbacks() {
  const fb = carregarFeedbacks();
  const pos = fb.positivos.slice(-5).map(f => 'P:"'+f.pergunta+'" R:"'+f.resposta.slice(0,100)+'"').join('\n');
  const neg = fb.negativos.slice(-5).map(f => 'P:"'+f.pergunta+'" R ruim:"'+f.resposta.slice(0,80)+'"').join('\n');
  let ctx = '';
  if (pos) ctx += 'EXEMPLOS DE BOAS RESPOSTAS:\n' + pos + '\n\n';
  if (neg) ctx += 'RESPOSTAS QUE USUÁRIOS REJEITARAM (evite esse padrão):\n' + neg;
  return ctx;
}

// ── DADOS REAIS ───────────────────────────────────────────────────────────────
function responderDadosReais(mNorm, d, leads, imoveis, visitas, user) {
  const uid = user.id || user.userId || '';

  // LEADS
  if (/quantas? leads?|total.*leads?|minhas leads?|listar leads?|minha base|quantos clientes/.test(mNorm)) {
    return '👥 <strong>Suas leads:</strong><br><br>' +
      '• Total: <strong>' + (d.leads||0) + '</strong><br>' +
      '• Com match: <strong>' + (d.comMatch||0) + '</strong> · Sem match: <strong>' + (d.semMatch||0) + '</strong><br>' +
      '• 🔥 Quentes: <strong>' + (d.quentes||0) + '</strong> · 🧊 Frias: <strong>' + (d.frias||0) + '</strong><br>' +
      '• Com visita: <strong>' + (d.comVisita||0) + '</strong> · Fechadas: <strong>' + (d.fechadas||0) + '</strong><br><br>' +
      btn('Ver Leads','/app/leads');
  }

  // IMÓVEIS
  if (/quantos? imoveis?|total.*imoveis?|minha carteira|meu estoque|quantos? apartamentos?|imoveis? ativos?|listar imovel|listar imoveis/.test(mNorm)) {
    return '🏠 <strong>Sua carteira:</strong><br><br>' +
      '• Ativos: <strong>' + (d.ativos||0) + '</strong><br>' +
      '• Inativos: <strong>' + (d.inativos||0) + '</strong><br>' +
      '• Sem foto: <strong>' + (d.semFoto||0) + '</strong><br>' +
      '• Sem proprietário: <strong>' + (d.semProprietario||0) + '</strong><br><br>' +
      btn('Ver Imóveis','/app/imoveis');
  }

  // VISITAS
  if (/quantas? visitas?|total.*visitas?|minhas visitas?|visitas? hoje|agenda hoje|compromissos hoje|listar visitas/.test(mNorm)) {
    return '📅 <strong>Suas visitas:</strong><br><br>' +
      '• Total: <strong>' + (d.visitas||0) + '</strong><br>' +
      '• Hoje: <strong>' + (d.visitasHoje||0) + '</strong><br>' +
      '• Pendentes: <strong>' + (d.pendentes||0) + '</strong><br>' +
      '• Confirmadas: <strong>' + (d.confirmadas||0) + '</strong><br>' +
      '• Realizadas: <strong>' + (d.realizadas||0) + '</strong><br><br>' +
      btn('Ver Visitas','/app/visitas');
  }

  // BAIRROS DEMANDA
  if (/bairro.*mais|mais.*bairro|demanda.*bairro|bairro.*demand|bairro.*busca|mais.*busca/.test(mNorm)) {
    const top = d.topBairrosDemanda || [];
    if (!top.length) return 'Ainda sem dados de demanda.<br><br>' + btn('Ver Leads','/app/leads');
    return '📍 <strong>Bairros mais buscados:</strong><br><br>' +
      top.map((b,i) => '<strong>'+(i+1)+'.</strong> '+b.bairro+' — '+b.total+' lead(s)').join('<br>') +
      '<br><br>' + btn('Ver Leads','/app/leads');
  }

  // TIPO MAIS BUSCADO
  if (/tipo.*mais|mais.*tipo|tipo.*busca|mais.*procura/.test(mNorm)) {
    const top = d.topTiposDemanda || [];
    if (!top.length) return 'Ainda sem dados de tipo.<br><br>' + btn('Ver Leads','/app/leads');
    return '🏠 <strong>Tipos mais buscados:</strong><br><br>' +
      top.map((t,i) => '<strong>'+(i+1)+'.</strong> '+t.tipo+' — '+t.total+' lead(s)').join('<br>') +
      '<br><br>' + btn('Ver Leads','/app/leads');
  }

  // LEADS QUENTES
  if (/leads? quentes?|clientes? quentes?|mais interessados?|mais engajad/.test(mNorm)) {
    const quentes = d.leadsQuentes || [];
    if (!quentes.length) return 'Nenhuma lead quente ainda.<br><br>' + chip('Fazer match','fazer match agora');
    return '🔥 <strong>Leads quentes:</strong><br><br>' +
      quentes.map(l => '• <strong>'+(l.nome||'Lead')+'</strong> — '+(l.faseFunil||'-')+' · '+(l.temperatura||'-')).join('<br>') +
      '<br><br>' + btn('Ver Leads','/app/leads');
  }

  // LEADS RECENTES
  if (/leads? recentes?|ultimas? leads?|leads? novas?|chegou lead/.test(mNorm)) {
    const recentes = d.leadsRecentes || [];
    if (!recentes.length) return 'Nenhuma lead ainda.<br><br>' + btn('Importar Leads','/app/importar-leads');
    return '👥 <strong>Leads recentes:</strong><br><br>' +
      recentes.map(l => '• <strong>'+(l.nome||'Lead')+'</strong> — '+(l.bairro||'-')+' · '+(l.temperatura||'fria')).join('<br>') +
      '<br><br>' + btn('Ver Leads','/app/leads');
  }

  // IMÓVEIS SEM FOTO
  if (/imoveis? sem foto|sem fotos?|fotos? faltando/.test(mNorm)) {
    return '📸 <strong>Imóveis sem foto:</strong> <strong>' + (d.semFoto||0) + '</strong><br><br>' +
      'Imóveis sem foto têm menos cliques nos portais.<br><br>' + btn('Ver Imóveis','/app/imoveis');
  }

  // IMÓVEIS SEM PROPRIETÁRIO
  if (/imoveis? sem proprietario|sem dono|proprietario faltando/.test(mNorm)) {
    return '👤 <strong>Imóveis sem proprietário:</strong> <strong>' + (d.semProprietario||0) + '</strong><br><br>' +
      'Sem proprietário o sistema não notifica sobre visitas.<br><br>' + btn('Ver Imóveis','/app/imoveis');
  }

  // RESUMO GERAL / PLANO DO DIA
  if (/resumo geral|resumo do dia|o que devo fazer|plano do dia|me orienta|por onde comecar|o que fazer hoje/.test(mNorm)) {
    return estrategista.analisar(d, leads, imoveis, visitas, btn, chip);
  }

  // ONBOARDING
  if (/primeiros passos|como comecar|nao sei comecar|configurar conta|tutorial|onboarding/.test(mNorm)) {
    return onboarding.renderOnboarding(d, btn, chip);
  }

  // BUSCA LEAD ESPECÍFICA
  if (leads && leads.length) {
    const entInfo = entidades.analisar(mNorm, []);
    const nomeBusca = (entInfo.nome||'')
      .replace(/como esta|como vai|qual o status|me fala|status da|status do|perfil da|perfil do/gi,'')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    if (nomeBusca && nomeBusca.length > 2 && /como esta|status|perfil|dados.*lead|lead.*dados/.test(mNorm)) {
      const lead = leads.find(l => (l.nome||l.contato||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(nomeBusca));
      if (lead) {
        const matches = (lead.matchesBase||lead.matches||[]).length;
        return '👤 <strong>' + (lead.nome||lead.contato||'Lead') + '</strong><br><br>' +
          '📍 ' + (lead.bairro||'-') + ' · ' + (lead.tipo||'-') + ' · ' + (lead.quartos||'-') + ' quartos<br>' +
          '🌡️ Temperatura: <strong>' + (lead.temperatura||'fria') + '</strong><br>' +
          '🎯 Matches: <strong>' + matches + '</strong><br>' +
          '📊 Funil: <strong>' + (lead.faseFunil||'novo') + '</strong><br><br>' +
          btn('Abrir lead', '/app/lead/' + (lead.id||lead._id||lead.leadId||''));
      }
    }
  }

  return null;
}

// ── SAUDAÇÃO ──────────────────────────────────────────────────────────────────
function ehSaudacao(mensagem) {
  return /^(oi|olá|ola|hey|eai|e ai|bom dia|boa tarde|boa noite|hello|hi|tudo bem|tudo bom|como vai)[\s!?.,]*$/i.test(mensagem.trim());
}

function responderSaudacao(user, d) {
  const hora = new Date().getHours();
  const saud = hora<12 ? 'Bom dia' : hora<18 ? 'Boa tarde' : 'Boa noite';
  let r = saud + ', <strong>' + (user.nome||'corretor') + '</strong>! 👋<br><br>';
  if (d.pendentes > 0) r += '⚠️ Você tem <strong>' + d.pendentes + ' visita(s) pendente(s)</strong>.<br>';
  if (d.semMatch > 0) r += '📋 <strong>' + d.semMatch + ' lead(s)</strong> ainda sem match.<br>';
  r += '<br>Como posso te ajudar hoje?<br><br>';
  r += chip('O que fazer hoje','o que devo fazer hoje') + ' ';
  r += chip('Minhas leads','quantas leads tenho') + ' ';
  r += chip('Visitas','quantas visitas tenho');
  return r;
}

// ── FUNÇÃO PRINCIPAL ──────────────────────────────────────────────────────────
function responder(mensagem, d, user, imoveis, leads, visitas, ctxParam) {
  const uid = user.id || user.userId || 'anon';
  const mNorm = nlp.normalizar(mensagem);
  const hist = memoria.historicoPorUsuario(uid, 6);

  // Salvar mensagem no histórico
  try { memoriaConversa.salvar(uid, 'user', mensagem); } catch(e) {}

  function finalizar(resposta) {
    try { memoriaConversa.salvar(uid, 'assistant', resposta); } catch(e) {}
    return resposta;
  }

  // ── 1. SAUDAÇÃO ──────────────────────────────────────────────────────────────
  if (ehSaudacao(mensagem)) {
    return finalizar(responderSaudacao(user, d));
  }

  // ── 2. AÇÕES DIRETAS ─────────────────────────────────────────────────────────
  try {
    const resAcao = acoesDiretas.responderAcaoDireta(mNorm, mensagem, d, leads, imoveis, visitas, uid, btn, chip);
    if (resAcao) return finalizar(resAcao);
  } catch(e) { console.error('[acoes]', e.message); }

  // ── 3. CONTEXTO — CADASTRAR LEAD / XML ───────────────────────────────────────
  if (/^cadastra(r)?\s/i.test(mensagem.trim()) || /^nova\s+lead/i.test(mensagem.trim()) ||
      /importar?\s+(xml|imoveis?)|subir xml|trazer imoveis?|gerar? xml|publicar.*portal/i.test(mensagem.trim())) {
    try {
      const ctx = contexto.analisar(mensagem, imoveis, leads, visitas);
      if (ctx && ctx.intencao) {
        const resCtx = contexto.responder(ctx, d, user, imoveis, leads, visitas, btn, chip);
        if (resCtx) return finalizar(resCtx);
      }
    } catch(e) { console.error('[contexto]', e.message); }
  }

  // ── 4. DADOS REAIS ───────────────────────────────────────────────────────────
  const resDados = responderDadosReais(mNorm, d, leads, imoveis, visitas, user);
  if (resDados) return finalizar(resDados);

  // ── 5. NAVEGAÇÃO SIMPLES ─────────────────────────────────────────────────────
  try {
    const resNav = navegador.responder(mNorm, btn, chip);
    if (resNav) return finalizar(resNav);
  } catch(e) {}

  // ── 6. GROQ — RESPONDE TUDO COM CONTEXTO DO SISTEMA ─────────────────────────
  if (process.env.GROQ_API_KEY) {
    const fbCtx = contextoFeedbacks();
    const contextoGroq = {
      ativos: d.ativos||0,
      inativos: d.inativos||0,
      leads: d.leads||0,
      comMatch: d.comMatch||0,
      semMatch: d.semMatch||0,
      quentes: d.quentes||0,
      visitas: d.visitas||0,
      pendentes: d.pendentes||0,
      confirmadas: d.confirmadas||0,
      bairrosCarteira: (d.bairros||[]).slice(0,5),
      topBairrosDemanda: d.topBairrosDemanda||[],
      topTiposDemanda: d.topTiposDemanda||[],
      corretor: user.nome||'corretor',
      feedbacks: fbCtx,
    };

    return groqIA.chamarGroq(mensagem, contextoGroq, hist)
      .then(function(resGroq) {
        const resHtml = resGroq
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\n\n/g, '<br><br>')
          .replace(/\n/g, '<br>')
          .replace(/• /g, '<br>• ');
        const resposta = resHtml + '<br><br><span style="font-size:11px;color:#9ca3af">✦ Resposta gerada por IA</span>';
        try { memoriaConversa.salvar(uid, 'assistant', resposta); } catch(e) {}
        return resposta;
      })
      .catch(function(e) {
        console.error('[groq]', e.message);
        // Fallback se Groq falhar
        return finalizar('Não entendi bem. 🤔 Pode reformular?<br><br>' +
          chip('O que fazer hoje','o que devo fazer hoje') + ' ' +
          chip('Minhas leads','quantas leads tenho') + ' ' +
          chip('Visitas','quantas visitas tenho'));
      });
  }

  // ── 7. FALLBACK FINAL ────────────────────────────────────────────────────────
  return finalizar('Não entendi bem. 🤔 Pode reformular?<br><br>' +
    chip('O que fazer hoje','o que devo fazer hoje') + ' ' +
    chip('Minhas leads','quantas leads tenho') + ' ' +
    chip('Visitas','quantas visitas tenho'));
}

function detectarTema(mensagem) { return nlp.detectarDominio(nlp.normalizar(mensagem)); }

module.exports = { responder, detectarTema, nlp, memoria };
