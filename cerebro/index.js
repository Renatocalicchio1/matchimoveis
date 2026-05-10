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
const rag          = require('./rag');
const memoria      = require('./memoria');
const aprendizado  = require('./aprendizado');
const notifs       = require('./notificacoes');
const onboarding   = require('./onboarding');
const relatorio    = require('./relatorio');
const leadsTemp    = require('./leads-temporal');
const scoring      = require('./scoring');
const suporte      = require('./suporte');
const raciocinio   = require('./raciocinio');
const intencao     = require('./intencao');
const portugues    = require('./portugues');
const navegacao    = require('./navegacao');
const navegador    = require('./navegador');
const contexto     = require('./contexto');
const { criarArvore } = require('./arvore');

const btn  = (l,h) => `<a href="${h}" style="display:inline-block;background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:4px">${l} →</a>`;
const chip = (l,m) => `<button onclick="enviarMsg('${m}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${l}</button>`;

const arvore = criarArvore({btn,chip,modLeads,modImoveis,modVisitas,modMatch,modPortais,modSistema,modMercado,acoes,estrategista,rag,notifs,onboarding,relatorio});

// ── SUGESTÕES CONTEXTUAIS ─────────────────────────────────────────────────────
function sugestoes(dominio, d) {
  const s = {
    leads:    [chip('Leads quentes','leads quentes'), chip('Importar leads','importar leads'), chip('Leads sem match','leads sem match')],
    imoveis:  [chip('Meus imóveis','meus imoveis'), chip('Imóveis inativos','imoveis inativos'), chip('Gerar XML','gerar xml vivareal')],
    visitas:  [chip('Visitas hoje','visitas hoje'), chip('Pendentes','visitas pendentes'), chip('Notificar proprietário','notificar proprietario')],
    match:    [chip('Ver match','ver match'), chip('Taxa de match','taxa de match'), chip('Por que sem match','por que nao deu match')],
    portais:  [chip('Ver portais','ver portais'), chip('Gerar XML','gerar xml vivareal')],
    mercado:  [chip('Bairros demanda','demanda por bairro'), chip('Tipo mais buscado','tipo mais buscado')],
    dashboard:[chip('Resumo','resumo geral'), chip('O que fazer hoje','o que devo fazer hoje')],
  };
  const chips = s[dominio] || [chip('Leads','minhas leads'), chip('Imóveis','meus imoveis'), chip('Visitas','visitas hoje'), chip('Match','ver match')];
  return '<br><br><div style="margin-top:8px">' + chips.join('') + '</div>';
}

// ── PERGUNTA DE VOLTA ─────────────────────────────────────────────────────────
function perguntarDeVolta(mNorm, intencaoObj) {
  // Cliente sem detalhes
  if (/tenho (um )?cliente|cliente (novo|chegou|interessado|quer|precisa)|novo (cliente|interessado)/.test(mNorm) && !/bairro|tipo|valor|apto|casa|quartos|rua|cidade/.test(mNorm))
    return '📋 Ótimo! Me conta mais sobre esse cliente:<br><br>' +
      chip('Apartamento','tipo apartamento') + chip('Casa','tipo casa') + chip('Cobertura','tipo cobertura') +
      '<br><br>Qual bairro ele quer e qual o valor máximo?';

  // Busca sem tipo
  if (/buscar?|procurar?|tem (imovel|algo)|quero ver/.test(mNorm) && !/apto|apartamento|casa|terreno|cobertura|sobrado|comercial/.test(mNorm))
    return '🏠 Que tipo de imóvel você está buscando?<br><br>' +
      chip('Apartamento','apartamento') + chip('Casa','casa') + chip('Terreno','terreno') + chip('Comercial','comercial');

  // Match sem contexto
  if (/^(ver |fazer |rodar |quero |me mostra )?match$/.test(mNorm.trim()))
    return '🎯 Match de qual lead? Me diz o nome ou o bairro que ela procura que eu busco aqui.';

  // Visita sem contexto
  if (/agendar|marcar|criar/.test(mNorm) && /visita/.test(mNorm) && !/bairro|imovel|cliente|lead|quem|para/.test(mNorm))
    return '📅 Para agendar a visita preciso saber:<br><br>' +
      '• Qual cliente?<br>• Qual imóvel?<br>• Qual data e horário?<br><br>' +
      chip('Ver leads com match','leads com match') + chip('Ver visitas','visitas hoje');

  // XML sem portal
  if (/gerar|criar|exportar/.test(mNorm) && /xml/.test(mNorm) && !/vivareal|zap|olx|chaves|imovelweb|123i/.test(mNorm))
    return '🔗 Para qual portal você quer gerar o XML?<br><br>' +
      chip('VivaReal','gerar xml vivareal') + chip('ZAP','gerar xml zap') +
      chip('OLX','gerar xml olx') + chip('ImovelWeb','gerar xml imovelweb');

  // Follow-up sem lead
  if (/follow.?up|retornar|ligar|contatar/.test(mNorm) && !/nome|quem|lead|cliente|joao|maria|ana|carlos/.test(mNorm))
    return '📞 Follow-up com qual cliente? Me diz o nome ou eu posso listar as leads que não responderam.<br><br>' +
      chip('Leads sem resposta','quem nao respondeu') + chip('Leads quentes','leads quentes');

  // Relatório sem período
  if (/relatorio|relat[oó]rio/.test(mNorm) && !/semana|mes|hoje|ontem|periodo|semanal|mensal/.test(mNorm))
    return '📊 Relatório de qual período?<br><br>' +
      chip('Essa semana','relatorio semanal') + chip('Esse mês','relatorio mensal') + chip('Hoje','resumo do dia');

  // Proprietário sem contexto
  if (/proprietario|dono/.test(mNorm) && !/avisar|notificar|quem|imovel|sem|com|cadastrar/.test(mNorm))
    return '👤 O que você quer fazer com o proprietário?<br><br>' +
      chip('Ver sem proprietário','imoveis sem proprietario') + chip('Avisar sobre visita','avisar proprietario da visita');

  return null;
}

// ── PRÓXIMO PASSO SUGERIDO ────────────────────────────────────────────────────
function proximoPasso(dominio, d, leads, imoveis, visitas) {
  if (dominio==='leads' && d.comMatch>0 && d.visitasAgendadas===0)
    return '<br><br>💡 <strong>Próximo passo:</strong> Você tem ' + d.comMatch + ' lead(s) com match. Que tal enviar a vitrine para elas?' + chip('Leads com match','leads com match');

  if (dominio==='imoveis' && d.semMatch>0)
    return '<br><br>💡 <strong>Próximo passo:</strong> ' + d.semMatch + ' lead(s) ainda sem match. Verifique se tem imóveis nos bairros certos.' + chip('Demanda por bairro','demanda por bairro');

  if (dominio==='visitas' && d.pendentes>0)
    return '<br><br>💡 <strong>Próximo passo:</strong> ' + d.pendentes + ' visita(s) aguardando confirmação do proprietário.' + chip('Ver visitas pendentes','visitas pendentes');

  return '';
}

// ── RESPONDER ─────────────────────────────────────────────────────────────────
function responder(mensagem, d, user, imoveis, leads, visitas, ctxParam) {
  const uid    = user.id || user.userId || 'anon';
  const mNorm  = nlp.normalizar(mensagem);
  const perfil = memoria.atualizarPerfil(uid, {d,user,imoveis,leads});
  const hist   = memoria.historicoPorUsuario(uid, 8);
  const dominio = nlp.detectarDominio(mNorm);
  // Prioridade: cadastrar lead antes do intencao.detectar
  if (/^cadastra(r)?\s/i.test(mensagem.trim())) {
    try {
      const ctx = contexto.analisar(mensagem, imoveis, leads, visitas);
      if (ctx && ctx.intencao === 'CADASTRAR_LEAD') {
        const resCtx = contexto.responder(ctx, d, user, imoveis, leads, visitas, btn, chip);
        if (resCtx) return finalizar(resCtx);
      }
    } catch(e) { console.error('cadastrar lead err:', e.message); }
  }

  const intencaoObj = intencao.detectar(mNorm);

  // Registrar resposta para aprendizado
  function finalizar(resposta) {
    aprendizado.registrarResposta(mensagem, resposta, dominio);
    // Adicionar próximo passo contextual
    const passo = proximoPasso(dominio, d, leads, imoveis, visitas);
    return resposta + passo;
  }

  // ── 0. FILTRO DE LIXO — palavras sem sentido
  const ehLixo = mNorm.split(' ').every(w => w.length < 3 || /^[a-z]{1,2}$/.test(w)) && mNorm.length < 20;
  const semPalavrasReais = !/imovel|lead|visita|match|portal|xml|bairro|casa|apto|valor|corretor|cliente|quartos|foto|proprietario|relatorio|dashboard|coins/.test(mNorm);
  if (ehLixo && semPalavrasReais && mNorm.length > 3) {
    return 'Hmm, não entendi. 🤔 Pode reformular?<br><br>' +
      chip('Leads', 'minhas leads') + chip('Imóveis', 'meus imoveis') +
      chip('Visitas', 'visitas hoje') + chip('O que fazer hoje', 'o que devo fazer hoje');
  }

  // ── 1. SAUDAÇÃO ──────────────────────────────────────────────────────────────
  const saudacoes = ['oi','ola','hey','eai','bom dia','boa tarde','boa noite','hello','hi','tudo bem','tudo bom','como vai'];
  if (saudacoes.some(s => mNorm.trim()===s || mNorm.startsWith(s+' '))) {
    const hora = new Date().getHours();
    const saud = hora<12 ? 'Bom dia' : hora<18 ? 'Boa tarde' : 'Boa noite';
    let r = `${saud}, <strong>${user.nome||'corretor'}</strong>! 👋`;
    if (d.pendentes>0) r += `<br><br>⚠️ Você tem <strong>${d.pendentes} visita(s) pendente(s)</strong> aguardando confirmação.`;
    if (d.semMatch>0)  r += `<br>📋 <strong>${d.semMatch} lead(s)</strong> ainda sem match.`;
    r += '<br><br>Como posso te ajudar hoje?';
    r += sugestoes('dashboard', d);
    return r;
  }

  // -- 1.4. NAVEGADOR
  try { const resNav = navegador.responder(mNorm, btn, chip); if (resNav) return finalizar(resNav + sugestoes(dominio, d)); } catch(e) {}

  // -- 1.5. CONTEXTO (safe)
  try {
    const ctx = contexto.analisar(mensagem, imoveis, leads, visitas);
    if (ctx && (ctx.intencao || ctx.temDados)) {
      const resCtx = contexto.responder(ctx, d, user, imoveis, leads, visitas, btn, chip);
      if (resCtx) return finalizar(resCtx + sugestoes(ctx.intencao === 'BUSCAR_IMOVEL' ? 'imoveis' : dominio, d));
    }
  } catch(e) { console.error('contexto err:', e.message); }

  // ── 2. INTERPRETADOR DE PORTUGUÊS ────────────────────────────────────────────
  // IMOVEIS tem prioridade sobre leads
  if ((/imovel|carteira|meu.*imovel|total.*imovel/.test(mNorm)||(/(casa|apto|apartamento|sobrado|cobertura|terreno|loft|studio)/.test(mNorm)&&/ems+[a-z]|disponivel|cadastrado|ativo|inativo|parado/.test(mNorm))||/^tems+(casa|apto|apartamento|sobrado|cobertura|terreno)/.test(mNorm)) && !/lead|visita|match|portal|mercado|cliente/.test(mNorm)) {
    const ri=modImoveis.responder(mNorm,d,imoveis,btn,chip);
    if(ri) return finalizar(ri+sugestoes("imoveis",d));
  }

  const resPort = portugues.interpretar(mensagem, d, imoveis, leads, visitas, btn, chip);
  if (resPort) return finalizar(resPort + sugestoes(dominio, d));

  // ── 3. SUPORTE TÉCNICO ───────────────────────────────────────────────────────
  const resSup = suporte.responder(mNorm, btn, chip);
  if (resSup) return finalizar(resSup);

  // ── 3.5. MAPA COMPLETO
  try {
    const resMapa = modSistema.responderComMapa && modSistema.responderComMapa(mNorm, btn, chip);
    if (resMapa) return finalizar(resMapa + sugestoes(dominio, d));
  } catch(e) {}

  // ── 4. SISTEMA (como acesso, o que é, etc) ───────────────────────────────────
  const isSistema = /como cadastrar|como adicionar foto|como conectar whatsapp|como inativar|como importar lead|como trocar senha|como acessar|como acesso|onde fica|como funciona o match|o que e match|o que e vitrine/.test(mNorm);
  if (isSistema) {
    const resSis = modSistema.responder(mNorm, d, btn, chip);
    if (resSis) return finalizar(resSis);
  }

  // ── 5. ESTRATÉGIA / PLANO DO DIA ────────────────────────────────────────────
  const isEstrategia = /o que devo fazer|plano do dia|o que fazer hoje|me orienta|por onde comecar|resumo do dia/.test(mNorm);
  if (isEstrategia) return finalizar(estrategista.analisar(d, leads, imoveis, visitas, btn, chip));

  // ── 6. SCORING / RANKING ────────────────────────────────────────────────────
  const isScoring = /atender primeiro|mais chance|chance de fechar|pronto para proposta|ranking lead/.test(mNorm);
  if (isScoring) {
    const res = scoring.responder(mNorm, leads, visitas, btn, chip);
    if (res) return finalizar(res + sugestoes('leads', d));
  }

  // ── 7. LEADS TEMPORAIS ───────────────────────────────────────────────────────
  const resTemp = leadsTemp.responder(mNorm, leads, btn, chip);
  if (resTemp) return finalizar(resTemp + sugestoes('leads', d));

  // ── 8. ÁRVORE DE DECISÃO ────────────────────────────────────────────────────
  const resultadoArvore = arvore.responder(mensagem, d, user, imoveis, leads, visitas, hist, perfil);
  if (resultadoArvore.resposta && !resultadoArvore.resposta.includes('não entendi') && !resultadoArvore.resposta.includes('não captei')) {
    return finalizar(resultadoArvore.resposta + sugestoes(dominio, d));
  }

  // ── 9. RACIOCÍNIO PROFUNDO ───────────────────────────────────────────────────
  const ctxConv = raciocinio.analisarConversa(hist);
  const melhor = raciocinio.buscarMelhorResposta(mensagem, ctxConv,
    {modLeads,modImoveis,modVisitas,modMatch,modPortais,modMercado,modSistema,suporte,leadsTemp,scoring,acoes},
    d, user, imoveis, leads, visitas, btn, chip);
  if (melhor) return finalizar(raciocinio.enriquecerResposta(melhor, ctxConv, chip) + sugestoes(dominio, d));

  // ── 10. INTENÇÃO DETECTADA ───────────────────────────────────────────────────
  const resIntent = intencao.respostaBaseadaEmIntencao(intencaoObj, mNorm, btn, chip);
  if (resIntent) return finalizar(resIntent);

  // ── 11. PERGUNTA DE VOLTA ────────────────────────────────────────────────────
  const pergunta = perguntarDeVolta(mNorm, intencaoObj);
  if (pergunta) return pergunta;

  // ── 12. NÃO ENTENDEU ─────────────────────────────────────────────────────────
  aprendizado.registrar(uid, mensagem);
  return 'Hmm, não entendi bem. 🤔 Pode reformular?<br><br>' +
    chip('Leads','minhas leads') + chip('Imóveis','meus imoveis') +
    chip('Visitas','visitas hoje') + chip('Plano do dia','o que devo fazer hoje') +
    (perfil?.bairrosFoco?.length ? '<br><br>Ou pergunte sobre: ' + perfil.bairrosFoco.slice(0,2).map(b=>chip(b,b+' imoveis')).join('') : '');
}

function detectarTema(mensagem) { return nlp.detectarDominio(nlp.normalizar(mensagem)); }
function pesosArvore() { return arvore.pesos ? arvore.pesos() : {}; }

module.exports = { responder, detectarTema, nlp, memoria, pesosArvore };
