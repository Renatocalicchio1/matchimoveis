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
const contextEngineering = require('./context-engineering');
const notasUsuario = require('./notas-usuario');
const compactador = require('./compactador');
const tfidf = require('./tfidf');
const buscaConhecimento = require('./busca-conhecimento');
const groqIA = require('./groq-ia');
const feedbackLoop = require('./feedback-loop');
const verificador = require('./verificador');
const decompositor = require('./decompositor');
const buscaSemantica = require('./busca-semantica');
const respostaProgressiva = require('./resposta-progressiva');
const autoCorrecao = require('./auto-correcao');
const slotFilling = require('./slot-filling');
const inteligenciaMercado = require('./inteligencia-mercado');
const sugestaoProativa = require('./sugestao-proativa');
const cacheInteligente = require('./cache-inteligente');
const metricas = require('./metricas');
const gerador = require('./gerador');
const emocao = require('./emocao');
const multiturno = require('./multiturno');
const fluxoGuiado = require('./fluxo-guiado');
const autoDiagnostico = require('./auto-diagnostico');
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
const chip = (l,m) => '<button onclick="enviarMsg(' + "'" + m + "'" + ')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">' + l + '</button>';

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
  if (/^cadastra(r)?\s/i.test(mensagem.trim()) || /^nova\s+lead/i.test(mensagem.trim()) || /importar?\s+(xml|imoveis?)|quero importar|subir xml|trazer imoveis?|puxar imoveis?|trazer do|puxar do|tenho um (xml|feed)|meu (xml|feed)/i.test(mensagem.trim()) || /gerar? xml todos|xml todos/i.test(mensagem.trim()) || /exportar para|publicar (imoveis? )?(no|em|para)|gerar? xml|gera xml|xml (para|pro|no)/i.test(mensagem.trim())) {
    try {
      const ctx = contexto.analisar(mensagem, imoveis, leads, visitas);
      if (ctx && (ctx.intencao === 'CADASTRAR_LEAD' || ctx.intencao === 'IMPORTAR_XML' || ctx.intencao === 'GERAR_XML_TODOS' || ctx.intencao === 'EXPORTAR_XML' || ctx.intencao === 'GERAR_XML')) {
        const resCtx = contexto.responder(ctx, d, user, imoveis, leads, visitas, btn, chip);
        if (resCtx) return finalizar(resCtx);
      }
    } catch(e) { console.error('cadastrar lead err:', e.message); }
  }

  // -- PRIORIDADE 0.2: onboarding — primeiros passos
  try {
    const resOnb = onboarding.responder(mNorm, d, btn, chip);
    if (resOnb) return finalizar(resOnb);
  } catch(e) {}

      // -- PRIORIDADE 0.15: multiturno — resolve pronomes e contexto anterior
  try {
    const refCtx = multiturno.resolverReferencia(uid, mensagem, leads, imoveis, visitas);
    if (refCtx && refCtx.resolveu) {
      const resMulti = multiturno.responderComContexto(uid, mensagem, refCtx, btn, chip);
      if (resMulti) return finalizar(resMulti);
    }
  } catch(e) { console.error('[multiturno]', e.message); }

    // -- PRIORIDADE 0.20: acoes diretas
  try {
    const resAcao = acoesDiretas.responderAcaoDireta(mNorm, mensagem, d, leads, imoveis, visitas, uid, btn, chip);
    if (resAcao) return finalizar(resAcao);
  } catch(e) { console.error("[acoes-diretas]", e.message); }

  // -- PRIORIDADE 0.19: busca imovel especifico
  if (/tem.*(apartamento|apto|casa|cobertura|terreno|sobrado|studio|loft)|(apartamento|apto|casa|cobertura|terreno).*(em|no|na|por|ate)|imovel.*quarto|quarto.*imovel/.test(mNorm)) {
    const entInfo = entidades.analisar(mensagem, (d.bairros||[]));
    let result = (imoveis||[]).filter(function(i){ return i.status !== "inativo"; });
    if (entInfo.tipo) result = result.filter(function(i){ return (i.tipo||"").toLowerCase().includes(entInfo.tipo); });
    if (entInfo.bairro) result = result.filter(function(i){ return (i.bairro||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").includes(entInfo.bairro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")); });
    if (entInfo.quartos) result = result.filter(function(i){ return parseInt(i.quartos||0) >= entInfo.quartos; });
    if (entInfo.valorMax) result = result.filter(function(i){ return parseFloat(i.valor||0) <= entInfo.valorMax; });
    if (!result.length) {
      return finalizar("😔 Nenhum imóvel encontrado" +
        (entInfo.tipo ? " do tipo <strong>" + entInfo.tipo + "</strong>" : "") +
        (entInfo.bairro ? " em <strong>" + entInfo.bairro + "</strong>" : "") +
        ".<br><br>" + chip("Ver demanda","demanda por bairro") + " " + btn("Ver imóveis","/app/imoveis"));
    }
    return finalizar(
      "<strong>" + result.length + " imóvel(is) encontrado(s)" +
      (entInfo.bairro ? " em " + entInfo.bairro : "") + ":</strong><br><br>" +
      result.slice(0,5).map(function(i){
        return "• <strong>" + (i.tipo||"Imóvel") + "</strong>" +
          (i.quartos ? " · " + i.quartos + "q" : "") +
          (i.area ? " · " + i.area + "m²" : "") +
          " em <strong>" + (i.bairro||"-") + "</strong>" +
          (i.valor ? " · R" + String.fromCharCode(36) + Number(i.valor).toLocaleString("pt-BR") : "") +
          " <a href=\"/app/imovel/" + (i.id||i.id_interno||"") + "\" style=\"color:#ff385c;font-size:12px\">ver →</a>";
      }).join("<br>") +
      (result.length > 5 ? "<br><em>...e mais " + (result.length-5) + " imóvel(is)</em>" : "") +
      "<br><br>" + btn("Ver todos","/app/imoveis")
    );
  }

  // -- PRIORIDADE 0.18: status de lead especifica por nome
  if (/como esta|como vai|o que.*precisa|perfil.*lead|status.*lead|lead.*status/.test(mNorm) && leads && leads.length) {
    const entInfo2 = entidades.analisar(mensagem, []);
    const nomeBusca = (entInfo2.nome||"")
        .replace(/como esta|como vai|qual o status|me fala|status da|status do|perfil da|perfil do|lead da|lead do|sobre o|sobre a/gi,'')
        .toLowerCase().trim();
    if (nomeBusca && nomeBusca.length > 2) {
      const leadEnc = leads.find(function(l){ return (l.nome||l.contato||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").includes(nomeBusca.normalize("NFD").replace(/[̀-ͯ]/g,"")); });
      if (leadEnc) {
        const matches2 = (leadEnc.matchesBase||leadEnc.matches||[]).length;
        return finalizar(
          "👤 <strong>" + (leadEnc.nome||leadEnc.contato||"Lead") + "</strong><br><br>" +
          "📍 " + (leadEnc.bairro||"-") + " · " + (leadEnc.tipo||"-") + " · " + (leadEnc.quartos||"-") + " quartos<br>" +
          "💰 Até R" + String.fromCharCode(36) + Number(leadEnc.valorMax||leadEnc.valor||0).toLocaleString("pt-BR") + "<br>" +
          "🌡️ Temperatura: <strong>" + (leadEnc.temperatura||"fria") + "</strong><br>" +
          "🎯 Matches: <strong>" + matches2 + "</strong><br>" +
          "📊 Funil: <strong>" + (leadEnc.faseFunil||"novo") + "</strong><br><br>" +
          btn("Abrir lead", "/app/lead/" + (leadEnc.id||leadEnc._id||leadEnc.leadId||"")) +
          (matches2 > 0 ? " " + chip("Ver vitrine","vitrine " + (leadEnc.nome||"")) : " " + chip("Fazer match","fazer match agora"))
        );
      }
    }
  }
  // -- PRIORIDADE 0.21: perguntas sobre dados reais
  if (/quantas? leads? (tenho|tem)|total.*leads?|minhas leads?$|listar leads|resumo leads/.test(mNorm)) {
    return finalizar(
      '👥 <strong>Suas leads:</strong><br><br>' +
      '• Total: <strong>' + (d.leads||0) + '</strong><br>' +
      '• Com match: <strong>' + (d.comMatch||0) + '</strong> · Sem match: <strong>' + (d.semMatch||0) + '</strong><br>' +
      '• 🔥 Quentes: <strong>' + (d.quentes||0) + '</strong> · 🧊 Frias: <strong>' + (d.frias||0) + '</strong><br>' +
      '• Com visita: <strong>' + (d.comVisita||0) + '</strong> · Fechadas: <strong>' + (d.fechadas||0) + '</strong><br><br>' +
      btn('Ver Leads','/app/leads')
    );
  }
  if (/quantos? imoveis? (tenho|tem|ativo)|total.*imoveis?|minha carteira$|listar imoveis|resumo imoveis/.test(mNorm)) {
    return finalizar(
      '🏠 <strong>Sua carteira:</strong><br><br>' +
      '• Ativos: <strong>' + (d.ativos||0) + '</strong><br>' +
      '• Inativos: <strong>' + (d.inativos||0) + '</strong><br>' +
      '• Sem foto: <strong>' + (d.semFoto||0) + '</strong><br>' +
      '• Sem proprietário: <strong>' + (d.semProprietario||0) + '</strong><br>' +
      '• Sem CEP: <strong>' + (d.semCep||0) + '</strong><br><br>' +
      btn('Ver Imóveis','/app/imoveis')
    );
  }
  if (/quantas? visitas? (tenho|tem)|total.*visitas?|minhas visitas?$|listar visitas|resumo visitas/.test(mNorm)) {
    return finalizar(
      '📅 <strong>Suas visitas:</strong><br><br>' +
      '• Total: <strong>' + (d.visitas||0) + '</strong><br>' +
      '• Hoje: <strong>' + (d.visitasHoje||d.hoje||0) + '</strong><br>' +
      '• Pendentes: <strong>' + (d.pendentes||0) + '</strong><br>' +
      '• Confirmadas: <strong>' + (d.confirmadas||0) + '</strong><br>' +
      '• Realizadas: <strong>' + (d.realizadas||0) + '</strong><br><br>' +
      btn('Ver Visitas','/app/visitas')
    );
  }
  if (/imoveis? sem foto|sem fotos?|imoveis? sem imagem/.test(mNorm)) {
    return finalizar(
      '📸 <strong>Imóveis sem foto:</strong> <strong>' + (d.semFoto||0) + '</strong><br><br>' +
      'Imóveis sem foto têm menos cliques nos portais.<br><br>' +
      btn('Ver Imóveis','/app/imoveis') + ' ' + chip('Como adicionar foto','como adicionar foto')
    );
  }
  if (/imovel.*sem proprietario|sem proprietario|proprietario faltando|quantos sem proprietario/.test(mNorm)) {
    return finalizar(
      '👤 <strong>Imóveis sem proprietário:</strong> <strong>' + (d.semProprietario||0) + '</strong><br><br>' +
      'Sem proprietário o sistema não pode notificar sobre visitas.<br><br>' +
      btn('Ver Imóveis','/app/imoveis')
    );
  }
  if (/qual.*bairro.*mais|bairro.*demanda|bairro mais buscado|demanda por bairro/.test(mNorm)) {
    const top = (d.topBairrosDemanda||[]);
    if (!top.length) return finalizar('Ainda sem dados de demanda por bairro.<br><br>' + btn('Ver Leads','/app/leads'));
    return finalizar(
      '📍 <strong>Bairros mais buscados pelas suas leads:</strong><br><br>' +
      top.map((b,i)=>'<strong>'+(i+1)+'.</strong> '+b.bairro+' — '+b.total+' lead(s)').join('<br>') +
      '<br><br>' + btn('Ver Leads','/app/leads')
    );
  }
  if (/qual.*tipo.*mais|tipo mais buscado|tipo mais procurado|tipo mais demandado|qual analise_mercado|analise.*mercado tipo/.test(mNorm)) {
    const top = (d.topTiposDemanda||[]);
    if (!top.length) return finalizar('Ainda sem dados de tipo mais buscado.<br><br>' + btn('Ver Leads','/app/leads'));
    return finalizar(
      '🏠 <strong>Tipos mais buscados pelas suas leads:</strong><br><br>' +
      top.map((t,i)=>'<strong>'+(i+1)+'.</strong> '+t.tipo+' — '+t.total+' lead(s)').join('<br>') +
      '<br><br>' + btn('Ver Leads','/app/leads')
    );
  }
  if (/leads? recentes?|ultimas? leads?|leads? novas?|chegou hoje/.test(mNorm)) {
    const recentes = (d.leadsRecentes||[]);
    if (!recentes.length) return finalizar('Nenhuma lead ainda.<br><br>' + btn('Importar Leads','/app/importar-leads'));
    return finalizar(
      '👥 <strong>Leads mais recentes:</strong><br><br>' +
      recentes.map(l=>'• <strong>'+(l.nome||'Lead')+'</strong> — '+(l.bairro||'-')+' · '+(l.tipo||'-')+' · '+(l.temperatura||'fria')).join('<br>') +
      '<br><br>' + btn('Ver Leads','/app/leads')
    );
  }
  if (/leads? quentes?|quem esta quente|mais quente/.test(mNorm)) {
    const quentes = (d.leadsQuentes||[]);
    if (!quentes.length) return finalizar('Nenhuma lead quente ainda. Faça o match e envie vitrines!<br><br>' + chip('Fazer match','fazer match agora'));
    return finalizar(
      '🔥 <strong>Leads quentes:</strong><br><br>' +
      quentes.map(l=>'• <strong>'+(l.nome||'Lead')+'</strong> — '+(l.faseFunil||'-')+' · '+(l.temperatura||'-')).join('<br>') +
      '<br><br>' + btn('Ver Leads','/app/leads')
    );
  }

    // -- PRIORIDADE 0.24: perguntas de conhecimento/estrategia — vai direto para Groq
  if (/estrategia|dica|conselho|como abordar|melhor forma|melhor jeito|como negociar|como convencer|como fechar|como prospectar|como captar|mercado imobiliario|tendencia|alto padrao|luxo|lancamento|como fazer para|me ensina|me explica como|nao respondeu|nao me respondeu|sumiu|dias sem resposta|semanas sem|meses sem|retomar contato|reativar/.test(mNorm)) {
    if (process.env.GROQ_API_KEY) {
      const contextoGroqP = { ativos:d.ativos||0, leads:d.leads||0, comMatch:d.comMatch||0, quentes:d.quentes||0, visitas:d.visitas||0, bairrosCarteira:(d.bairros||[]).slice(0,5), corretor:user.nome||'corretor' };
      return groqIA.chamarGroq(mensagem, contextoGroqP, hist)
        .then(function(r){ return r + '<br><br><span style="font-size:11px;color:#9ca3af">✦ Resposta gerada por IA</span>'; })
        .catch(function(e){ console.error('[groq-p]',e.message); return null; });
    }
  }

    // -- PRIORIDADE 0.23: TF-IDF alta prioridade — conceitos e custos
  try {
    const tfResAlta = tfidf.detectarIntencao(mensagem);
    if (tfResAlta && tfResAlta.score > 0.15) {
      const intAlta = tfResAlta.intencao;
      if (intAlta === 'conceito_coins' || intAlta === 'conceito_match' || intAlta === 'conceito_vitrine' || intAlta === 'conceito_temperatura' || intAlta === 'conceito_score') {
        const resSisAlta = modSistema.responder(mNorm, d, btn, chip);
        if (resSisAlta) return finalizar(resSisAlta);
      }
      if (intAlta === 'navegar_dashboard') {
        return finalizar(onboarding.renderOnboarding(d, btn, chip));
      }
    }
  } catch(e) {}

    // -- PRIORIDADE 0.24: perguntas de conhecimento/estrategia — vai direto para Groq
  if (/estrategia|dica|conselho|como abordar|melhor forma|melhor jeito|como negociar|como convencer|como fechar|como prospectar|como captar|mercado imobiliario|tendencia|alto padrao|luxo|lancamento|como fazer para|me ensina|me explica como|nao respondeu ha|dias sem resposta|semanas sem resposta|meses sem resposta|retomar contato|reativar lead/.test(mNorm)) {
    if (process.env.GROQ_API_KEY) {
      const contextoGroqP = { ativos:d.ativos||0, leads:d.leads||0, comMatch:d.comMatch||0, quentes:d.quentes||0, visitas:d.visitas||0, bairrosCarteira:(d.bairros||[]).slice(0,5), corretor:user.nome||'corretor' };
      return groqIA.chamarGroq(mensagem, contextoGroqP, hist)
        .then(function(r){ return r + '<br><br><span style="font-size:11px;color:#9ca3af">✦ Resposta gerada por IA</span>'; })
        .catch(function(e){ console.error('[groq-p]',e.message); return null; });
    }
  }

  // -- PRIORIDADE 0.22: gírias e expressões do corretor
  const girias = {
    'ta caro|muito caro|caro demais|acima do budget|fora do orcamento|nao cabe no bolso': 'busca_mais_barato',
    'to travado|nao sei o que fazer|sem ideia|perdido|estrategia de venda': 'orientar',
    'o cara sumiu|a menina sumiu|nao da retorno|nao atende|sumiu|sumindo': 'lead_sumiu',
    'ta quente|muito interessado|quer muito|animado|animada': 'lead_quente',
    'bate o martelo|vai fechar|fechando|assinar contrato': 'fechar',
    'encalhado|nao sai|ninguem visita|parado': 'imovel_parado',
  };
  for (const [pattern, acao] of Object.entries(girias)) {
    if (new RegExp(pattern).test(mNorm)) {
      if (acao === 'busca_mais_barato') return finalizar('💰 <strong>Buscando opções mais acessíveis:</strong><br><br>Veja os imóveis com menor valor na sua carteira.' + '<br><br>' + btn('Ver imóveis por valor','/app/imoveis') + ' ' + chip('Mais baratos','tem algo mais barato'));
      if (acao === 'orientar') return finalizar(estrategista.analisar(d, leads, imoveis, visitas, btn, chip));
      if (acao === 'lead_sumiu') return finalizar('📵 <strong>Lead sem retorno?</strong><br><br>• Tente um follow-up via WhatsApp<br>• Veja quando foi o último contato na página da lead<br>• Se passou mais de 7 dias sem resposta, classifique como fria<br><br>' + btn('Ver Leads','/app/leads') + ' ' + chip('Leads frias','leads frias'));
      if (acao === 'lead_quente') return finalizar('🔥 <strong>Lead quente!</strong><br><br>Próximo passo: envie a vitrine ou agende a visita enquanto o interesse está alto.<br><br>' + btn('Ver Leads','/app/leads') + ' ' + chip('Leads com match','leads com match'));
      if (acao === 'fechar') return finalizar('🤝 <strong>Fechando negócio!</strong><br><br>Registre a visita como realizada e mova a lead para <strong>Proposta</strong> no kanban.<br><br>' + btn('Ver Visitas','/app/visitas') + ' ' + btn('Ver Leads','/app/leads'));
      if (acao === 'imovel_parado') return finalizar('📦 <strong>Imóvel sem visitas?</strong><br><br>• Verifique se está publicado nos portais<br>• Revise as fotos e o preço<br>• Compare com a demanda do bairro<br><br>' + btn('Ver Imóveis','/app/imoveis') + ' ' + chip('Demanda por bairro','demanda por bairro'));
    }
  }

    // -- PRIORIDADE 0.26: casos especiais antes dos módulos
  if (/onde vejo.*mensagen|ver.*mensagen|inbox|minhas mensagen|mensagen recebida/.test(mNorm))
    return finalizar('📱 Suas mensagens ficam no WhatsApp do sistema.<br><br>' + btn('Ver WhatsApp','/app/whatsapp'));
  if (/bot.*whatsapp|robo.*whatsapp|ia.*responde|resposta automatica|whatsapp.*automatico|conceito_ia_wa/.test(mNorm) || /^bot|bot (do|no|pelo)|robo|ia responde|resposta automatica/i.test(mensagem.trim()))
    return finalizar('🤖 Sim! A IA do MatchImóveis responde mensagens WhatsApp automaticamente — qualifica leads, faz match e agenda visitas.<br><br>' + btn('Ver WhatsApp','/app/whatsapp'));
  if (/negocio fechado|fechou.*negocio|venda concluida|proposta aceita|contrato assinado/.test(mNorm))
    return finalizar('🤝 <strong>Negócio fechado!</strong><br><br>Registre a visita como realizada e mova a lead para <strong>Fechado</strong> no kanban.<br><br>' + btn('Ver Visitas','/app/visitas') + ' ' + btn('Ver Leads','/app/leads'));
  if (/selecionar.*lote|lote.*selecionar|varios imoveis|multiplos imoveis|em lote/.test(mNorm) || /selecionar.*(lote|varios|multiplos)|em lote|varios imoveis/i.test(mensagem))
    return finalizar('☑️ Em Meus Imóveis, use os <strong>checkboxes</strong> para selecionar vários imóveis. A barra flutuante aparece com ações em lote: publicar em portais, inativar, etc.<br><br>' + btn('Ver Imóveis','/app/imoveis'));
  if (/quero ver.*agenda|minha agenda|agenda do dia|ver agenda|compromisso/.test(mNorm) || /minha agenda|ver.*agenda|agenda do dia/i.test(mensagem) || /listar.*visitas/.test(mNorm))
    return finalizar('📅 Sua agenda de visitas está em Visitas.<br><br>' + btn('Ver Visitas','/app/visitas'));
  if (/marcar.*notificacao.*lida|notificacao.*lida|limpar notificacao|todas.*lidas/.test(mNorm))
    return finalizar('🔔 Em Notificações, clique em <strong>Marcar todas como lidas</strong>.<br><br>' + btn('Ver Notificações','/app/notificacoes'));
  if (/nao tenho saldo|sem saldo|acabou.*coins|acabou.*credito|preciso.*coins/.test(mNorm))
    return finalizar('🪙 Seus coins acabaram! Recarregue para continuar usando o sistema.<br><br>💰 R$20 = 1.000 coins via Mercado Pago<br><br>' + btn('Comprar Coins','/app/coins'));

    // -- PRIORIDADE 0.25: situações do corretor — linguagem natural
  if (/ja enviei.*vitrine|mandei.*vitrine|enviei.*link/.test(mNorm)) {
    return finalizar('✅ Vitrine enviada! Agora aguarde o cliente escolher o imóvel e solicitar visita.<br><br>' +
      btn('Ver visitas','/app/visitas') + ' ' + chip('Leads com match','leads com match'));
  }
  if (/quando.*proxima visita|proxima visita|visita.*quando|quando.*visita/.test(mNorm)) {
    return finalizar(modVisitas.responder(mNorm, d, [], btn, chip) || 
      'Veja suas visitas agendadas em Visitas.<br><br>' + btn('Ver visitas','/app/visitas'));
  }
  if (/resumo.*dia|resumo do dia|como foi o dia|o que aconteceu hoje/.test(mNorm)) {
    return finalizar(estrategista.analisar(d, [], [], [], btn, chip));
  }

    // -- PRIORIDADE 0.3: suporte direto — erros e custos antes de tudo
  if (/vitrine nao abre|vitrine nao carrega|link.*nao funciona|nao consigo abrir vitrine/.test(mNorm)) {
    return finalizar('🔧 <strong>Vitrine não abre?</strong><br><br>• A lead precisa ter ao menos 1 imóvel em match<br>• Imóveis inativos não aparecem na vitrine<br>• Verifique se o imóvel em match está ativo<br><br><a href="/app/leads" style="color:#ff385c;font-weight:700">Ver Leads →</a>');
  }
  if (/quanto custa|faixa de valor coins|faixa de valor match|tabela.*coins|custo.*coins|coins.*custo|quanto gasta|preco.*coins|valor.*coins|tabela de preco|tabela de custo/.test(mNorm)) {
    return finalizar('🪙 <strong>Tabela de custos (Match Coins):</strong><br><br>• Cadastrar imóvel: 15 coins<br>• Importar XML: 2 coins/imóvel<br>• Match encontrado: 20 coins<br>• Vitrine WhatsApp: 30 coins<br>• IA responde WhatsApp: 30 coins<br>• Follow-up automático: 25 coins<br>• Visita agendada IA: 40 coins<br>• Nova lead portal: 20 coins<br>• Importar lead planilha: 10 coins/lead<br><br>💰 R$20 = 1.000 coins<br><br>' + btn('Ver Coins','/app/coins'));
  }

    // -- PRIORIDADE 0.5: navegação explícita — antes de qualquer módulo
  if (/como acesso|como abro|onde fica|onde acho|como entro|como chego|o que tem na pagina|o que tem no|tela de|pagina de|como uso a pagina|me leva para|ir para|abrir pagina/.test(mNorm)) {
    const resNavP05 = navegador.responder(mNorm, btn, chip);
    if (resNavP05) return finalizar(resNavP05 + sugestoes(dominio, d));
  }

    const intencaoObj = intencao.detectar(mNorm);

  // Registrar resposta para aprendizado
  function finalizar(resposta) {
    aprendizado.registrarResposta(mensagem, resposta, dominio);
    try { memoriaConversa.salvar(uid, "user", mensagem, {intencao:dominio}); memoriaConversa.salvar(uid, "assistant", resposta); } catch(e) {}
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


    // -- PRIORIDADE NAVEGAÇÃO: perguntas de acesso/localização vão para navegador
  if (/como acesso|onde fica|onde acho|o que tem na pagina|tela de|pagina de|filtro.*de|como entro/.test(mNorm)) {
    const resNavAntes = navegador.responder(mNorm, btn, chip);
    if (resNavAntes) return finalizar(resNavAntes + sugestoes(dominio, d));
  }

  // ── 2. INTERPRETADOR DE PORTUGUÊS ────────────────────────────────────────────
  // IMOVEIS tem prioridade sobre leads
  if ((/imovel|carteira|meu.*imovel|total.*imovel/.test(mNorm)||(/(casa|apto|apartamento|sobrado|cobertura|terreno|loft|studio)/.test(mNorm)&&/ems+[a-z]|disponivel|cadastrado|ativo|inativo|parado/.test(mNorm))||/^tems+(casa|apto|apartamento|sobrado|cobertura|terreno)/.test(mNorm)) && !/lead|visita|match|portal|mercado|cliente/.test(mNorm)) {
    const ri=modImoveis.responder(mNorm,d,imoveis,btn,chip);
    if(ri) return finalizar(ri+sugestoes("imoveis",d));
  }

  const resPort = portugues.interpretar(mensagem, d, imoveis, leads, visitas, btn, chip);
  if (resPort) return finalizar(resPort + sugestoes(dominio, d));

  // -- PRIORIDADE COINS: custo/preço/valor de ações
  if (/quanto custa|tabela coins|custo.*coins|coins.*custo|quanto gasta|preco.*coins|valor.*coins/.test(mNorm)) {
    const resSis3 = modSistema.responder(mNorm, d, btn, chip);
    if (resSis3) return finalizar(resSis3);
  }

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
  const ctxConv = (typeof raciocinio.analisarConversa === 'function') ? raciocinio.analisarConversa(hist) : {tema:null};
  const melhor = (typeof raciocinio.buscarMelhorResposta === 'function') ? raciocinio.buscarMelhorResposta(mensagem, ctxConv,
    {modLeads,modImoveis,modVisitas,modMatch,modPortais,modMercado,modSistema,suporte,leadsTemp,scoring,acoes},
    d, user, imoveis, leads, visitas, btn, chip) : null;
  if (melhor) return finalizar(raciocinio.enriquecerResposta(melhor, ctxConv, chip) + sugestoes(dominio, d));

  // ── 10. INTENÇÃO DETECTADA ───────────────────────────────────────────────────
  const resIntent = intencao.respostaBaseadaEmIntencao(intencaoObj, mNorm, btn, chip);
  if (resIntent) return finalizar(resIntent);

  // ── 10.5. TF-IDF FALLBACK — detecta intenção e redireciona
  try {
    const tfRes = tfidf.detectarIntencao(mensagem);
    if (tfRes && tfRes.score > 0.1) {
      const int = tfRes.intencao;
      const nav = require('./navegador');
      // Navegação
      if (int.startsWith('navegar_')) {
        const pagina = int.replace('navegar_','');
        const resNav = nav.responder(pagina, btn, chip);
        if (resNav) return finalizar(resNav + sugestoes(dominio, d));
      }
      // Erros — redireciona para suporte
      if (int.startsWith('erro_')) {
        const keyword = int.replace('erro_','');
        const erroMap = {
          whatsapp: 'whatsapp desconectou',
          xml: 'xml nao atualizou',
          match: 'por que nao deu match',
          vitrine: 'vitrine nao abre',
          foto: 'foto nao sobe',
          acesso: 'nao consigo entrar',
          lead: 'lead nao importou',
        };
        const resSup = suporte.responder(erroMap[keyword]||keyword, btn, chip);
        if (resSup) return finalizar(resSup);
      }
      // Dados reais
      if (int === 'dados_leads') return finalizar('👥 <strong>Suas leads:</strong><br><br>Total: <strong>'+(d.leads||0)+'</strong> · Com match: <strong>'+(d.comMatch||0)+'</strong> · Quentes: <strong>'+(d.quentes||0)+'</strong><br><br>'+btn('Ver Leads','/app/leads'));
      if (int === 'dados_imoveis') return finalizar('🏠 <strong>Sua carteira:</strong><br><br>Ativos: <strong>'+(d.ativos||0)+'</strong> · Inativos: <strong>'+(d.inativos||0)+'</strong><br><br>'+btn('Ver Imóveis','/app/imoveis'));
      if (int === 'dados_visitas') return finalizar('📅 <strong>Suas visitas:</strong><br><br>Total: <strong>'+(d.visitas||0)+'</strong> · Hoje: <strong>'+(d.visitasHoje||0)+'</strong> · Pendentes: <strong>'+(d.pendentes||0)+'</strong><br><br>'+btn('Ver Visitas','/app/visitas'));
      if (int === 'plano_dia') return finalizar(estrategista.analisar(d, leads, imoveis, visitas, btn, chip));
      if (int === 'navegar_dashboard' || int === 'primeiros_passos') return finalizar(onboarding.renderOnboarding(d, btn, chip));
      if (int === 'conceito_coins') return finalizar('🪙 <strong>Tabela de custos (Match Coins):</strong><br><br>• Match: 20 coins · Vitrine WA: 30 coins · IA WA: 30 coins · Importar XML: 2/imóvel<br><br>💰 R$20 = 1.000 coins<br><br>'+btn('Ver Coins','/app/coins'));
      if (int === 'fazer_match') return finalizar('🎯 O match é feito automaticamente quando uma lead chega. Você também pode rodar manualmente em Leads.<br><br>'+btn('Ver Leads','/app/leads'));
      if (int === 'dados_leads_quentes') return finalizar((d.leadsQuentes&&d.leadsQuentes.length)?'🔥 <strong>Leads quentes:</strong><br><br>'+(d.leadsQuentes||[]).map(function(l){return '• <strong>'+(l.nome||'Lead')+'</strong> — '+(l.faseFunil||'-');}).join('<br>')+'<br><br>'+btn('Ver Leads','/app/leads'):'Nenhuma lead quente ainda.<br><br>'+chip('Fazer match','fazer match agora'));
    }
  } catch(e) { console.error('[tfidf]', e.message); }

  // ── 10.8. BUSCA NA BASE DE CONHECIMENTO (933 pares)
  try {
    const buscaRes = buscaConhecimento.buscar(mensagem, 0.25);
    if (buscaRes && buscaRes.item) {
      const intBusca = buscaRes.item.r;
      // Mapear intenção para resposta
      const mapaRespostas = {
        navegar_imoveis: function(){ return btn('Ver Imóveis','/app/imoveis'); },
        navegar_leads: function(){ return btn('Ver Leads','/app/leads'); },
        navegar_visitas: function(){ return btn('Ver Visitas','/app/visitas'); },
        navegar_whatsapp: function(){ return btn('Ver WhatsApp','/app/whatsapp'); },
        navegar_perfil: function(){ return btn('Ver Perfil','/app/perfil'); },
        navegar_portais: function(){ return btn('Ver Portais','/app/portais'); },
        navegar_dashboard: function(){ return btn('Ver Dashboard','/app-home'); },
        navegar_coins: function(){ return btn('Ver Coins','/app/coins'); },
        navegar_mapa: function(){ return btn('Ver Mapa','/app/mapa'); },
        navegar_feed: function(){ return btn('Ver Feed','/app/feed'); },
        navegar_notificacoes: function(){ return btn('Ver Notificações','/app/notificacoes'); },
        navegar_parceiros: function(){ return btn('Ver Parceiros','/app/parceiros'); },
        navegar_central: function(){ return btn('Ver Central','/app/central'); },
        comprar_coins: function(){ return '🪙 Para comprar coins acesse a página de Coins.<br><br>'+btn('Ver Coins','/app/coins'); },
        funil_fechado: function(){ return '🤝 <strong>Negócio fechado!</strong><br><br>Registre a visita como realizada e mova a lead para <strong>Fechado</strong> no kanban.<br><br>'+btn('Ver Visitas','/app/visitas')+' '+btn('Ver Leads','/app/leads'); },
        funil_negociacao: function(){ return '💬 Lead em negociação! Registre a proposta em Visitas.<br><br>'+btn('Ver Visitas','/app/visitas'); },
        exportar: function(){ return '📊 Para exportar imóveis em Excel:<br><br>'+btn('Exportar Excel','/app/imoveis/exportar-excel'); },
        editar_imovel: function(){ return '✏️ Para editar um imóvel, acesse Meus Imóveis e clique em Editar.<br><br>'+btn('Ver Imóveis','/app/imoveis'); },
        detalhe_lead: function(){ return '👤 Para ver o perfil completo da lead, abra-a em Leads.<br><br>'+btn('Ver Leads','/app/leads'); },
        acao_lote: function(){ return '☑️ Em Meus Imóveis, use os checkboxes para selecionar vários imóveis e a barra flutuante para ações em lote.<br><br>'+btn('Ver Imóveis','/app/imoveis'); },
        notificacao_lida: function(){ return '🔔 Em Notificações, clique em <strong>Marcar todas como lidas</strong>.<br><br>'+btn('Ver Notificações','/app/notificacoes'); },
        historico_chat: function(){ return '💬 O histórico de conversa fica salvo automaticamente. Role para cima para ver mensagens anteriores.'; },
        conceito_suporte: function(){ return '🆘 Para suporte, entre em contato com a equipe MatchImóveis pelo WhatsApp. O assistente está aqui para resolver a maioria das dúvidas!<br><br>'+chip('O que posso perguntar','o que voce sabe responder'); },
        conceito_kanban: function(){ return '📋 <strong>Kanban</strong> é a visualização em colunas das suas leads e visitas. Cada coluna representa uma etapa do funil.<br><br>'+btn('Ver Leads','/app/leads')+' '+btn('Ver Visitas','/app/visitas'); },
        conceito_crm: function(){ return '💼 O MatchImóveis funciona como um CRM imobiliário — centralizando leads, imóveis, visitas e match em um só lugar.'; },
        conceito_copiloto: function(){ return '🤖 <strong>Copiloto</strong> é o assistente que sugere respostas para enviar ao lead pelo WhatsApp. Aparece no inbox de mensagens.<br><br>'+btn('Ver WhatsApp','/app/whatsapp'); },
        conceito_followup: function(){ return '📱 O sistema faz follow-up automático com leads via WhatsApp quando configurado. A IA responde e qualifica automaticamente.'; },
        conceito_ia_wa: function(){ return '🤖 Sim! A IA do MatchImóveis responde mensagens WhatsApp dos leads automaticamente — qualifica, faz match e agenda visitas.'; },
        acesso_mobile: function(){ return '📱 O MatchImóveis funciona pelo navegador do celular. Acesse matchimoveis.ia.br pelo Chrome ou Safari e adicione à tela inicial.'; },
      };
      
      if (mapaRespostas[intBusca]) {
        const respBusca = mapaRespostas[intBusca]();
        if (respBusca) return finalizar(respBusca + sugestoes(dominio, d));
      }
      
      // Intenções que já têm tratamento nos módulos — redireciona
      const redirecionamentos = {
        importar_xml: 'como importo imoveis via xml',
        importar_leads: 'como importo leads',
        gerar_xml: 'como publico no vivareal',
        conectar_whatsapp: 'como conectar whatsapp',
        enviar_vitrine: 'como envio vitrine',
        cadastrar_lead: 'cadastrar lead manual',
        confirmar_visita: 'como confirmar visita',
        remarcar_visita: 'como remarcar visita',
        fazer_match: 'como fazer match',
        quintoandar: 'como ativo quintoandar',
        erro_whatsapp: 'whatsapp desconectou',
        erro_xml: 'xml nao atualizou',
        erro_match: 'por que nao deu match',
        erro_vitrine: 'vitrine nao abre',
        erro_foto: 'foto nao sobe',
        erro_acesso: 'nao consigo entrar',
        erro_lead: 'lead nao importou',
        dados_leads: 'quantas leads tenho',
        dados_imoveis: 'quantos imoveis tenho',
        dados_visitas: 'quantas visitas tenho',
        dados_bairros: 'qual bairro tem mais demanda',
        dados_tipo: 'qual tipo mais buscado',
        dados_quentes: 'leads quentes',
        conceito_match: 'o que e match',
        conceito_vitrine: 'o que e vitrine',
        conceito_coins: 'quanto custa match',
        conceito_temperatura: 'temperatura lead',
        plano_dia: 'o que devo fazer hoje',
        busca_barato: 'tem algo mais barato',
        lead_sumiu: 'o cara sumiu',
        cliente_gostou: 'cliente gostou',
        cliente_nao_gostou: 'meu cliente nao gostou',
        imovel_parado: 'encalhado',
      };
      
      if (redirecionamentos[intBusca]) {
        const redir = redirecionamentos[intBusca];
        const resRedir = require('./index').responder ? null : null; // evitar circular
        // Usa suporte/sistema/navegador diretamente
        const resSup2 = suporte.responder(redir, btn, chip);
        if (resSup2) return finalizar(resSup2);
        const resSis2 = modSistema.responder(redir, d, btn, chip);
        if (resSis2) return finalizar(resSis2);
        const resNav2 = navegador.responder(redir, btn, chip);
        if (resNav2) return finalizar(resNav2 + sugestoes(dominio, d));
      }
    }
  } catch(e) { console.error('[busca-conhecimento]', e.message); }

  // ── 11. PERGUNTA DE VOLTA ────────────────────────────────────────────────────
  const pergunta = perguntarDeVolta(mNorm, intencaoObj);
  if (pergunta) return pergunta;

  // ── 12. GROQ IA — fallback inteligente ───────────────────────────────────────
  aprendizado.registrar(uid, mensagem);
  
  // Tenta Groq se disponível
  if (process.env.GROQ_API_KEY) {
    const contextoGroq = {
      ativos: d.ativos||0, inativos: d.inativos||0,
      leads: d.leads||0, comMatch: d.comMatch||0, semMatch: d.semMatch||0,
      quentes: d.quentes||0, pendentes: d.pendentes||0,
      visitas: d.visitas||0, visitasHoje: d.visitasHoje||0,
      topBairrosDemanda: d.topBairrosDemanda||[],
      topTiposDemanda: d.topTiposDemanda||[],
      bairrosCarteira: (d.bairros||[]).slice(0,10),
      corretor: user.nome||'corretor',
    };
    
    return groqIA.chamarGroq(mensagem, contextoGroq, hist)
      .then(function(resGroq) {
        aprendizado.registrarResposta(mensagem, resGroq, 'groq');
        return resGroq + '<br><br><span style="font-size:11px;color:#9ca3af">✦ Resposta gerada por IA</span>';
      })
      .catch(function(e) {
        console.error('[groq]', e.message);
        return 'Hmm, não entendi bem. 🤔 Pode reformular?<br><br>' +
          chip('Leads','minhas leads') + chip('Imóveis','meus imoveis') +
          chip('Visitas','visitas hoje') + chip('Plano do dia','o que devo fazer hoje');
      });
  }
  
  return 'Hmm, não entendi bem. 🤔 Pode reformular?<br><br>' +
    chip('Leads','minhas leads') + chip('Imóveis','meus imoveis') +
    chip('Visitas','visitas hoje') + chip('Plano do dia','o que devo fazer hoje') +
    (perfil?.bairrosFoco?.length ? '<br><br>Ou pergunte sobre: ' + perfil.bairrosFoco.slice(0,2).map(b=>chip(b,b+' imoveis')).join('') : '');
}

function detectarTema(mensagem) { return nlp.detectarDominio(nlp.normalizar(mensagem)); }
function pesosArvore() { return arvore.pesos ? arvore.pesos() : {}; }

module.exports = { responder, detectarTema, nlp, memoria, pesosArvore };
