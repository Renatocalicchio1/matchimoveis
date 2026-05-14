'use strict';
const proatividade = require('./proatividade');
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
const memoriaConversa = require('./memoria-conversa');
const acoesDiretas = require('./acoes-diretas');
const raciocinioPensador = require('./raciocinio');
const funilMod = require('./funil');
const perfilCorretor = require('./perfil-corretor');
const contexto     = require('./contexto');
const datas        = require('./datas');
const { criarArvore } = require('./arvore');
const entidades = require('./entidades');
const notificacoes = require('./notificacoes');

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
  const entidadeInfo = entidades.analisar(mensagem);
  const perfil = memoria.atualizarPerfil(uid, {d,user,imoveis,leads});
  const hist   = memoria.historicoPorUsuario(uid, 8);
  const dominio = nlp.detectarDominio(mNorm);
  // Prioridade: saudação — responde direto sem processar
  if (/^(o+i+|ola+|olá|hey|hello|opa|salve|e ai|e aí)(\s+(tudo\s+)?(bem|bom|certo|ok|ótimo|otimo))?[\s!?.,]*$/i.test(mensagem.trim()) || /^(bom dia|boa tarde|boa noite)[\s!?.,]*$/i.test(mensagem.trim())) {
    return finalizar('👋 Olá! Como posso ajudar?<br><br>Digite o que precisa ou escolha uma opção abaixo:<br><br>' +
      btn('Ver imóveis', '/app/imoveis') + ' ' +
      btn('Ver leads', '/app/leads') + ' ' +
      btn('Ver visitas', '/app/visitas'));
  }

  // Prioridade: contexto de conversa anterior (memória de turno)
  const ultimoHist = hist[hist.length - 1];
  if (ultimoHist && ultimoHist.resposta && ultimoHist.resposta.includes('Me passa nome e celular')) {
    const numerosNaMensagem = mensagem.replace(/\D/g,'');
    const nomeMatch = mensagem.match(/^([A-ZÀ-Úa-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)*)/i);
    const nome = nomeMatch ? nomeMatch[1].trim() : null;
    // Tem número mas incompleto
    if (numerosNaMensagem.length > 0 && numerosNaMensagem.length < 10) {
      return finalizar('⚠️ O número <strong>' + numerosNaMensagem + '</strong> parece incompleto. Celular precisa ter DDD + 9 dígitos.<br><br>💡 Exemplo: <em>47 99999-1234</em>');
    }
    // Nome e celular completo — cadastra
    if (nome && numerosNaMensagem.length >= 10) {
      const dados = { nome, celular: numerosNaMensagem };
      return finalizar('ACAO_CADASTRAR_LEAD:' + JSON.stringify(dados));
    }
    // Só nome, sem número
    if (nome && numerosNaMensagem.length === 0) {
      return finalizar('📋 Entendido! Quer cadastrar <strong>' + nome + '</strong>.<br><br>Qual o celular do cliente?');
    }
  }

  // Prioridade: contexto antes do intencao.detectar
  if (/^cadastra(r)?\s/i.test(mensagem.trim()) || /importar?\s+(xml|imoveis?)|quero importar|subir xml|trazer imoveis?|puxar imoveis?|trazer do|puxar do|tenho um (xml|feed)|meu (xml|feed)/i.test(mensagem.trim()) || /gerar? xml todos|xml todos/i.test(mensagem.trim()) || /exportar para|publicar (imoveis? )?(no|em|para)|gerar? xml|gera xml|xml (para|pro|no)/i.test(mensagem.trim())) {
    try {
      const ctx = contexto.analisar(mensagem, imoveis, leads, visitas);
      if (ctx && (ctx.intencao === 'CADASTRAR_LEAD' || ctx.intencao === 'IMPORTAR_XML' || ctx.intencao === 'GERAR_XML_TODOS' || ctx.intencao === 'EXPORTAR_XML' || ctx.intencao === 'GERAR_XML')) {
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


  // ── 0.9. MOTOR CENTRAL DE ENTIDADES ──────────────────────────────────────────

  if (entidadeInfo.entidade === 'LEAD') {

    const nomeBusca = String(entidadeInfo.nome || '').trim().toLowerCase();

    const leadEncontrada = (leads || []).find(l =>
      String(l.nome || l.cliente || l.email || '')
        .toLowerCase()
        .includes(nomeBusca)
    );

    // LINK / DETALHES
    if (
      leadEncontrada &&
      entidadeInfo.acao === 'LINK'
    ) {

      return finalizar(
        '🔗 <strong>Link da lead:</strong><br><br>' +
        '👤 ' + (leadEncontrada.nome || 'Lead') + '<br><br>' +
        '<a href="/app/lead/' + (leadEncontrada.id || leadEncontrada.leadId) + '" style="color:#ff385c;font-weight:800">Abrir página da lead →</a>'
      );
    }

    // DATA
    if (
      leadEncontrada &&
      entidadeInfo.acao === 'DATA'
    ) {

      const dt =
        leadEncontrada.createdAt ||
        leadEncontrada.dataCriacao ||
        leadEncontrada.processedAt ||
        leadEncontrada.data_cadastro ||
        leadEncontrada.data ||
        '';

      const br = dt
        ? new Date(dt).toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' })
        : 'data não encontrada';

      return finalizar(
        '📅 <strong>Entrada da lead no sistema:</strong><br><br>' +
        '👤 ' + (leadEncontrada.nome || 'Lead') + '<br>' +
        '🕒 ' + br
      );
    }

    // VITRINE
    if (
      leadEncontrada &&
      entidadeInfo.acao === 'VITRINE'
    ) {

      const total =
        (leadEncontrada.matchesBase && leadEncontrada.matchesBase.length) ||
        (leadEncontrada.matches && leadEncontrada.matches.length) ||
        0;

      if (!total) {
        return finalizar(
          '❌ Essa lead ainda não possui vitrine pronta.'
        );
      }

      const uid = encodeURIComponent(
        String(
          leadEncontrada.userId ||
          leadEncontrada.usuarioId ||
          leadEncontrada.corretorId ||
          ''
        )
      );

      const url =
        '/cliente/oferta/' +
        (leadEncontrada.id || leadEncontrada.leadId) +
        (uid ? '?userId=' + uid : '');

      return finalizar(
        '✨ <strong>Vitrine encontrada:</strong><br><br>' +
        '👤 ' + (leadEncontrada.nome || 'Lead') + '<br>' +
        '🏠 ' + total + ' imóvel(is) em match<br><br>' +
        '<a href="' + url + '" target="_blank" style="color:#ff385c;font-weight:800">Abrir vitrine →</a>'
      );
    }

    // BUSCA
    if (
      leadEncontrada &&
      entidadeInfo.acao === 'BUSCAR'
    ) {

      return finalizar(
        '🔍 <strong>Lead encontrada:</strong><br><br>' +
        '👤 ' + (leadEncontrada.nome || 'Lead') + '<br>' +
        '📍 ' + (leadEncontrada.bairro || '-') + ' · ' + (leadEncontrada.tipo || '-') + '<br>' +
        '📱 ' + (leadEncontrada.contato || leadEncontrada.telefone || '-') + '<br><br>' +
        btn('Abrir lead','/app/lead/' + (leadEncontrada.id || leadEncontrada.leadId))
      );
    }
  }



  // ── 0.95. CENTRAL DE NOTIFICAÇÕES ────────────────────────────────────────────

  try {

    const respostaNotif = notificacoes.responder(
      mensagem,
      req.session && req.session.user
        ? req.session.user
        : {}
    );

    if (respostaNotif) {
      return finalizar(respostaNotif);
    }

  } catch(e) {
    console.error('erro notificacoes:', e.message);
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


  // -- 1.25. PRIORIDADE TEMPORAL / CONSULTAS POR DATA
  if (
    /(hoje|ontem|amanhã|amanha|anteontem|semana passada|esta semana|últimos|ultimos|mês passado|mes passado|este mês|este mes|data)/.test(mNorm)
    &&
    /(lead|leads|imovel|imóveis|imoveis|visita|visitas|match|cadastro|cadastros|notificacao|notificações|notificacoes)/.test(mNorm)
  ) {
    try {
      const resDataPrioridade = datas.responder(mNorm, d, imoveis, leads, visitas, btn, chip);

      if (resDataPrioridade) {
        return finalizar(resDataPrioridade + sugestoes(dominio, d));
      }
    } catch(e) {
      console.error('datas prioridade err:', e.message);
    }
  }

  // -- 1.3. PRIORIDADE: BUSCAS POR DATA
  try {
    const resData = datas.responder(mNorm, d, imoveis, leads, visitas, btn, chip);
    if (resData) return finalizar(resData + sugestoes(dominio, d));
  } catch(e) { console.error('datas err:', e.message); }

  // -- 1.35. PRIORIDADE: VITRINES PRONTAS
  if (/minhas vitrines|minha vitrine|vitrines prontas|vitrine pronta|vitrines para enviar|links das vitrines|leads com vitrine|clientes com vitrine/.test(mNorm)) {
    const USER_ID = String(
      (user && (user.id || user.userId || user.codigoUsuario)) || ''
    );

    const comVitrine = (leads || []).filter(l => {
      const owner = String(l.userId || l.usuarioId || l.corretorId || '');

      const temMatch =
        (l.matchesBase && l.matchesBase.length > 0) ||
        (l.matches && l.matches.length > 0);

      return owner === USER_ID && temMatch;
    });

    if (!comVitrine.length) {
      return finalizar('Nenhuma vitrine pronta ainda. Faça o match primeiro.<br><br>' +
        btn('Ver leads','/app/leads') + chip('Fazer match','fazer match agora'));
    }

    const cards = comVitrine.slice(0,10).map(l => {
      const total = (l.matchesBase && l.matchesBase.length) || (l.matches && l.matches.length) || 0;
      const idLead = l.id || l.leadId || l._id;
      const BASE_URL = String(process.env.APP_URL || process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000').replace(/\/$/, '');
      const uidLead = encodeURIComponent(String(l.userId || l.usuarioId || l.corretorId || ''));
      const url = BASE_URL + '/cliente/oferta/' + idLead + (uidLead ? '?userId=' + uidLead : '');
      const tel = String(l.contato || l.telefone || l.celular || '').replace(/\D/g,'');
      const msg = 'Olá ' + (l.nome || '') + '! Separei algumas opções de imóveis para você. Veja sua vitrine: ' + url;
      const zap = tel ? 'https://wa.me/55' + tel + '?text=' + encodeURIComponent(msg) : '';
      return '<div style="border:1px solid #eee;border-radius:14px;padding:14px;margin:10px 0;background:white">' +
        '<div style="font-size:16px;font-weight:700">👤 ' + (l.nome || l.email || 'Lead') + '</div>' +
        '<div style="font-size:13px;color:#666;margin-top:4px">📍 ' + (l.bairro || '-') + ' · 🏠 ' + (l.tipo || '-') + '</div>' +
        '<div style="margin-top:8px;font-size:13px">✨ <strong>' + total + '</strong> imóvel(is) em match · 📤 pronta para envio</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
          '<a href="' + url + '" target="_blank" style="background:#ff385c;color:white;padding:8px 12px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:700">🔗 Abrir vitrine</a>' +
          (zap ? '<a href="' + zap + '" target="_blank" style="background:#25d366;color:white;padding:8px 12px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:700">📱 Enviar WhatsApp</a>' : '') +
        '</div>' +
        '<div style="margin-top:10px;font-size:11px;color:#777">' + url + '</div>' +
      '</div>';
    }).join('');

    return finalizar('✨ <strong>' + comVitrine.length + ' vitrine(s) pronta(s) para enviar:</strong><br>' +
      '<span style="font-size:12px;color:#666">Essas leads já têm imóveis em match.</span><br><br>' +
      cards +
      (comVitrine.length > 10 ? '<br><em>...e mais ' + (comVitrine.length - 10) + ' vitrine(s).</em>' : '') +
      '<br>' + btn('Ver todas as leads','/app/leads?filtro=com_match'));
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


  // -- 1.8. PRIORIDADE: DETALHES / VITRINE / BUSCA DE LEAD / PROPRIETÁRIOS

  function limparNomeBuscaLead(txt) {
    return String(txt || '')
      .replace(/ache|achar|buscar|busca|encontrar|localizar|procure|procurar/gi,'')
      .replace(/lead|cliente|pagina|página|detalhes|detlhe|dtlhes|link|da|do|de|o|a/gi,'')
      .trim();
  }

  function encontrarLeadPorTexto(txt) {
    const nome = limparNomeBuscaLead(txt).toLowerCase();
    if (!nome) return null;

    return (leads || []).find(l =>
      String(l.nome || l.cliente || l.email || '').toLowerCase().includes(nome)
    );
  }

  if (/buscar lead|ache lead|achar lead|encontrar lead|localizar lead|procure lead/.test(mNorm)) {
    const leadBusca = encontrarLeadPorTexto(mNorm);

    if (!leadBusca) {
      return finalizar('Me diga o nome da lead que você quer buscar.<br><br>' + btn('Ver leads','/app/leads'));
    }

    return finalizar(
      '🔍 <strong>Lead encontrada:</strong><br><br>' +
      '👤 ' + (leadBusca.nome || leadBusca.email || 'Lead') + '<br>' +
      '📍 ' + (leadBusca.bairro || '-') + ' · ' + (leadBusca.tipo || '-') + '<br>' +
      '📱 ' + (leadBusca.contato || leadBusca.telefone || '-') + '<br><br>' +
      btn('Abrir lead','/app/lead/' + (leadBusca.id || leadBusca.leadId)) +
      btn('Ver leads','/app/leads')
    );
  }

  if (/link.*lead|pagina.*lead|página.*lead|detalhe.*lead|detalhes.*lead|dtlhe.*lead|dtlhes.*lead/.test(mNorm)) {
    const leadBusca = encontrarLeadPorTexto(mNorm);

    if (!leadBusca) {
      return finalizar('Qual lead você quer abrir? Me diga o nome.<br><br>' + btn('Ver leads','/app/leads'));
    }

    return finalizar(
      '🔗 <strong>Link da lead:</strong><br><br>' +
      '👤 ' + (leadBusca.nome || leadBusca.email || 'Lead') + '<br>' +
      '<a href="/app/lead/' + (leadBusca.id || leadBusca.leadId) + '" style="color:#ff385c;font-weight:800">Abrir página de detalhes da lead →</a>'
    );
  }

  if (/quando.*lead|lead.*entrou|lead.*cadastrad|data.*lead/.test(mNorm)) {
    const leadBusca = encontrarLeadPorTexto(mNorm);

    if (!leadBusca) {
      return finalizar('Qual lead você quer consultar? Me diga o nome.<br><br>' + btn('Ver leads','/app/leads'));
    }

    const dt = leadBusca.createdAt || leadBusca.dataCriacao || leadBusca.processedAt || leadBusca.data_cadastro || leadBusca.data || '';
    const br = dt ? new Date(dt).toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' }) : 'data não encontrada';

    return finalizar(
      '📅 <strong>Entrada da lead no sistema:</strong><br><br>' +
      '👤 ' + (leadBusca.nome || leadBusca.email || 'Lead') + '<br>' +
      '🕒 ' + br + '<br><br>' +
      btn('Abrir lead','/app/lead/' + (leadBusca.id || leadBusca.leadId))
    );
  }

  if (/vitrine.*lead|lead.*vitrine|vitrine.*cliente|tem.*vitrine/.test(mNorm)) {
    const leadBusca = encontrarLeadPorTexto(mNorm);

    if (!leadBusca) {
      return finalizar('Qual lead você quer consultar? Me diga o nome.<br><br>' + chip('Minhas vitrines','minhas vitrines'));
    }

    const total = (leadBusca.matchesBase && leadBusca.matchesBase.length) || (leadBusca.matches && leadBusca.matches.length) || 0;

    if (!total) {
      return finalizar('Essa lead ainda não tem vitrine pronta, pois não tem match salvo.<br><br>' + btn('Abrir lead','/app/lead/' + (leadBusca.id || leadBusca.leadId)));
    }

    const uid = encodeURIComponent(String(leadBusca.userId || leadBusca.usuarioId || leadBusca.corretorId || ''));
    const url = '/cliente/oferta/' + (leadBusca.id || leadBusca.leadId) + (uid ? '?userId=' + uid : '');

    return finalizar(
      '✨ <strong>Vitrine encontrada:</strong><br><br>' +
      '👤 ' + (leadBusca.nome || leadBusca.email || 'Lead') + '<br>' +
      '🏠 ' + total + ' imóvel(is) em match<br><br>' +
      '<a href="' + url + '" target="_blank" style="color:#ff385c;font-weight:800">Abrir vitrine →</a>'
    );
  }

  if (/proprietario|proprietário|proprie|propiet|dono/.test(mNorm) && /imovel|imóveis|imoveis|cadastrad|com|sem|quantos|qual/.test(mNorm)) {
    const ativos = (imoveis || []).filter(i => i.status !== 'inativo');

    const comProp = ativos.filter(i =>
      (i.proprietario && (i.proprietario.nome || i.proprietario.telefone || i.proprietario.email)) ||
      i.nomeProprietario || i.proprietario_nome || i.proprietarioTelefone || i.proprietario_telefone
    );

    const semProp = ativos.filter(i => !comProp.includes(i));

    return finalizar(
      '👤 <strong>Proprietários dos imóveis:</strong><br><br>' +
      '🏠 Com proprietário: <strong>' + comProp.length + '</strong><br>' +
      '❌ Sem proprietário: <strong>' + semProp.length + '</strong><br><br>' +
      btn('Ver imóveis','/app/imoveis')
    );
  }


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
