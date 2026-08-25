'use strict';

const groqIA        = require('./groq-ia');
const memoriaConversa = require('./memoria-conversa');
const memoria       = require('./memoria');
const fs            = require('fs');
const path          = require('path');

const btn  = (l,h) => `<a href="${h}" style="display:inline-block;background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:4px">${l} →</a>`;
const chip = (l,m) => '<button onclick="enviarMsg(' + "'" + m + "'" + ')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">' + l + '</button>';

// ── FEEDBACKS ─────────────────────────────────────────────────────────────────
const FEEDBACK_PATH = path.join(__dirname, '..', 'assistente-feedbacks.json');
function contextoFeedbacks() {
  try {
    const fb = JSON.parse(fs.readFileSync(FEEDBACK_PATH,'utf8'));
    const pos = (fb.positivos||[]).slice(-3).map(f => 'P:"'+f.pergunta+'" R:"'+f.resposta.slice(0,80)+'"').join('\n');
    const neg = (fb.negativos||[]).slice(-3).map(f => 'P:"'+f.pergunta+'" R ruim:"'+f.resposta.slice(0,60)+'"').join('\n');
    let ctx = '';
    if (pos) ctx += 'BOAS RESPOSTAS:\n' + pos + '\n\n';
    if (neg) ctx += 'RESPOSTAS RUINS (evite):\n' + neg;
    return ctx;
  } catch(e) { return ''; }
}

// ── SAUDAÇÃO RÁPIDA ───────────────────────────────────────────────────────────
function ehSaudacao(msg) {
  return /^(oi|olá|ola|hey|eai|e ai|bom dia|boa tarde|boa noite|hello|hi|tudo bem|tudo bom|como vai)[\s!?.,]*$/i.test(msg.trim());
}

// Empurrão pro próximo passo do funil de conta (ago/2026, pedido explícito
// do Renato: assistente sempre puxando o corretor pra frente no funil,
// junto com WhatsApp e e-mail). Só nos 2 estágios que ainda precisam andar
// — "cliente" já comprou de verdade, não precisa de empurrão aqui (já
// recebe o popup de afiliados e o convite de indicação por e-mail; enfileirar
// um 3º canal pedindo a mesma coisa vira saco). d.estagioConta vem calculado
// em server.js (_estagioConta), mesma lógica usada em /admin/funil.
function _empurraoFunil(d) {
  if (d.estagioConta === 'convertido') {
    return '🚀 Sua conta ainda tá vazia — cadastra teu primeiro imóvel (ou importa o XML do teu site) que eu já te mostro os primeiros leads compatíveis.<br><br>';
  }
  if (d.estagioConta === 'ativado') {
    return '💳 Sua carteira já tá pronta pra receber lead de verdade — falta só ativar créditos. Quer ver os combos?<br><br>';
  }
  return '';
}

function responderSaudacao(user, d, finalizar) {
  const hora = new Date().getHours();
  const saud = hora<12 ? 'Bom dia' : hora<18 ? 'Boa tarde' : 'Boa noite';
  let r = saud + ', <strong>' + (user.nome||'corretor') + '</strong>! 👋<br><br>';
  r += _empurraoFunil(d);
  if (d.pendentes > 0) r += '⚠️ <strong>' + d.pendentes + ' visita(s) pendente(s)</strong><br>';
  if (d.semMatch > 0) r += '📋 <strong>' + d.semMatch + ' lead(s) sem match</strong><br>';
  r += '<br>Como posso te ajudar?<br><br>';
  r += chip('O que fazer hoje','o que devo fazer hoje') + ' ';
  r += chip('Minhas leads','quantas leads tenho') + ' ';
  r += chip('Visitas','quantas visitas tenho');
  return finalizar(r);
}

// ── FUNÇÃO PRINCIPAL ──────────────────────────────────────────────────────────
function responder(mensagem, d, user, imoveis, leads, visitas, ctxParam) {
  const uid = user.id || user.codigoUsuario || user.userId || 'anon';
  const hist = memoria.historicoPorUsuario(uid, 6);

  try { memoriaConversa.salvar(uid, 'user', mensagem); } catch(e) {}

  function finalizar(resposta) {
    try { memoriaConversa.salvar(uid, 'assistant', resposta); } catch(e) {}
    return resposta;
  }

  // ── 1. SAUDAÇÃO ──────────────────────────────────────────────────────────────
  if (ehSaudacao(mensagem)) {
    return finalizar(responderSaudacao(user, d, r => r));
  }

  // ── 2. GROQ COM CONTEXTO RICO ────────────────────────────────────────────────
  if (process.env.GROQ_API_KEY) {
    // Monta contexto completo dos dados reais
    const leadsQuentes = (d.leadsQuentes||[]).slice(0,5).map(l => '• '+(l.nome||'Lead')+' — '+(l.faseFunil||'-')+' — '+(l.bairro||'-')+' — '+(l.tipo||'-')).join('\n');
    const leadsRecentes = (d.leadsRecentes||[]).slice(0,5).map(l => '• '+(l.nome||'Lead')+' — '+(l.bairro||'-')+' — '+(l.temperatura||'fria')).join('\n');
    const topBairros = (d.topBairrosDemanda||[]).slice(0,5).map((b,i) => (i+1)+'. '+b.bairro+' ('+b.total+' leads)').join('\n');
    const topTipos = (d.topTiposDemanda||[]).slice(0,5).map((t,i) => (i+1)+'. '+t.tipo+' ('+t.total+' leads)').join('\n');
    const bairrosCarteira = (d.bairros||[]).slice(0,8).join(', ');

    const contextoRico = {
      ativos: d.ativos||0,
      inativos: d.inativos||0,
      semFoto: d.semFoto||0,
      semProprietario: d.semProprietario||0,
      leads: d.leads||0,
      comMatch: d.comMatch||0,
      semMatch: d.semMatch||0,
      quentes: d.quentes||0,
      frias: d.frias||0,
      comVisita: d.comVisita||0,
      fechadas: d.fechadas||0,
      visitas: d.visitas||0,
      visitasHoje: d.visitasHoje||0,
      pendentes: d.pendentes||0,
      confirmadas: d.confirmadas||0,
      realizadas: d.realizadas||0,
      corretor: user.nome||'corretor',
      leadsQuentes,
      leadsRecentes,
      topBairros,
      topTipos,
      bairrosCarteira,
      feedbacks: contextoFeedbacks(),
    };

    return groqIA.chamarGroq(mensagem, contextoRico, hist)
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
        return finalizar('Tive um problema ao processar. 🤔 Tente novamente.<br><br>' +
          chip('O que fazer hoje','o que devo fazer hoje') + ' ' +
          chip('Minhas leads','quantas leads tenho') + ' ' +
          chip('Visitas','quantas visitas tenho'));
      });
  }

  // ── 3. FALLBACK SEM GROQ ─────────────────────────────────────────────────────
  return finalizar('Assistente indisponível no momento. Configure GROQ_API_KEY.<br><br>' +
    chip('Leads','/app/leads') + ' ' +
    chip('Imóveis','/app/imoveis'));
}

function detectarTema(mensagem) {
  const nlp = require('./nlp');
  return nlp.detectarDominio(nlp.normalizar(mensagem));
}

module.exports = { responder, detectarTema, memoria };
