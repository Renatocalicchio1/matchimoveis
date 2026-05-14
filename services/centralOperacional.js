const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');

function dataFile(name) {
  return path.join(DATA_DIR, name);
}

function readJson(name, fallback) {
  try {
    const file = dataFile(name);
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(name, data) {
  try {
    const file = dataFile(name);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Erro salvando', name, e.message);
    return false;
  }
}

function normalizeText(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getUserKey(user) {
  return String(user?.id || user?.codigoUsuario || user?.celular || user?.telefone || 'anonimo');
}

function getLeadName(lead) {
  return lead.nome || lead.cliente || lead.nomeCliente || lead.lead || lead.name || '';
}

function getLeadPhone(lead) {
  return lead.telefone || lead.contato || lead.celular || lead.whatsapp || lead.phone || '';
}

function getLeadEmail(lead) {
  return lead.email || lead.mail || lead.emailUsuario || '';
}

function getBairro(item) {
  return item.bairro || item.origin?.bairro || item.imovel?.bairro || item.match?.bairro || '';
}

function getStatusLead(item) {
  if (item.matches && item.matches.length > 0) return 'com_match';
  if (item.extractionStatus === 'erro') return 'erro_extracao';
  if (item.extractionStatus === 'ok') return 'processado_sem_match';
  return 'pendente';
}

function carregarMemoriaOperacional(user) {
  const all = readJson('assistente-contexto-operacional.json', {});
  const key = getUserKey(user);
  return all[key] || {
    userKey: key,
    ultimoLead: null,
    ultimaVisita: null,
    ultimaIntencao: null,
    ultimaAcao: null,
    historico: []
  };
}

function salvarMemoriaOperacional(user, memoria) {
  const all = readJson('assistente-contexto-operacional.json', {});
  const key = getUserKey(user);
  all[key] = {
    ...memoria,
    userKey: key,
    updatedAt: new Date().toISOString(),
    historico: Array.isArray(memoria.historico) ? memoria.historico.slice(-50) : []
  };
  writeJson('assistente-contexto-operacional.json', all);
}

function registrarHistorico(user, memoria, entrada) {
  memoria.historico = Array.isArray(memoria.historico) ? memoria.historico : [];
  memoria.historico.push({
    at: new Date().toISOString(),
    ...entrada
  });
  salvarMemoriaOperacional(user, memoria);
}

function carregarContexto(user) {
  const userId = String(user?.id || user?.codigoUsuario || user?.celular || '');

  const data = readJson('data.json', []);
  const leadsJson = readJson('leads.json', []);
  const visitas = readJson('visitas.json', []);
  const notificacoes = readJson('notificacoes.json', []);
  const memoria = readJson('assistente-memoria.json', []);
  const chatHistory = readJson('chat-history.json', []);

  const leadsMatch = Array.isArray(data) ? data : [];
  const leadsBase = Array.isArray(leadsJson) ? leadsJson : [];

  const filtraUsuario = (item) => {
    if (!userId) return true;
    return String(item.userId || item.usuarioId || item.corretorId || item.donoId || item.ownerId || '') === userId ||
      String(item.codigoUsuario || item.corretorCodigo || '') === String(user?.codigoUsuario || '') ||
      String(item.corretorCelular || item.celularCorretor || item.telefoneUsuario || '') === String(user?.celular || user?.telefone || '');
  };

  return {
    user,
    memoriaOperacional: carregarMemoriaOperacional(user),
    leadsMatch: leadsMatch.filter(filtraUsuario),
    leadsBase: leadsBase.filter(filtraUsuario),
    visitas: Array.isArray(visitas) ? visitas.filter(filtraUsuario) : [],
    notificacoes: Array.isArray(notificacoes) ? notificacoes.filter(filtraUsuario) : [],
    memoria: Array.isArray(memoria) ? memoria : [],
    chatHistory: Array.isArray(chatHistory) ? chatHistory : []
  };
}

function interpretarComando(texto) {
  const t = normalizeText(texto);

  const intent = {
    tipo: 'geral',
    entidade: null,
    acao: null,
    filtro: {},
    textoOriginal: texto
  };

  if (/(notificacao|notificacoes|aviso|avisos|pendencia|pendencias)/.test(t)) intent.tipo = 'notificacoes';
  if (/(lead|leads|cliente|clientes)/.test(t)) intent.tipo = 'leads';
  if (/(quente|quentes|prioridade|prioritarios|melhores)/.test(t)) {
    intent.tipo = 'leads_quentes';
    intent.filtro.quente = true;
  }
  if (/(visita|visitas|agendamento|agendamentos|agenda)/.test(t)) intent.tipo = 'visitas';
  if (/(whatsapp|zap|mensagem|manda|enviar|falar)/.test(t)) intent.acao = 'whatsapp';
  if (/(proprietario|dono)/.test(t)) intent.entidade = 'proprietario';
  if (/(corretor|parceiro)/.test(t)) intent.entidade = 'corretor';
  if (/(remarcar|reagendar)/.test(t)) {
    intent.acao = 'remarcar_visita';
    intent.tipo = 'visitas';
  }
  if (/(confirmar|confirma)/.test(t)) intent.acao = 'confirmar';
  if (/(match|matches|parecido|parecidos|similar|similares)/.test(t)) intent.tipo = 'matches';

  if (/(ele|ela|esse|essa|mesmo|mesma)/.test(t)) intent.filtro.usarMemoria = true;
  if (/(fazer match|faz match|rodar match|match agora|match base|match interno|cruzar leads|cruza leads|buscar match|achar match|tentar match|roda o match|faz o match|fazer o match|encontrar imovel|achar imovel para lead|combinar leads|combinar imoveis)/.test(t)) intent.tipo = 'fazer_match';
  if (/(resumo do dia|o que fazer hoje|meu dia hoje|o que tenho hoje|como esta minha operacao|resumo operacional|minhas acoes|acoes do dia|o que preciso fazer|me mostra o dia|como estou hoje|situacao atual|visao geral|overview|overview do dia)/.test(t)) intent.tipo = 'resumo_diario';
  if (/(mercado|demanda|mais buscado|tendencia|bairro mais|tipo mais|o que as leads querem|o que buscam|o que mais pedem|faixa de preco|preco mais pedido|valor mais buscado|quartos mais pedidos|tipo mais pedido|analise de mercado|inteligencia|insights|dados do mercado|o que ta em alta|o que vende mais)/.test(t)) intent.tipo = 'inteligencia_mercado';
  if (/(por que nao tem match|sem match algum|diagnosticar|nao encontrou|nao achou match|nenhum match|match zerado|leads sem resultado|por que nao casa|por que nao combina|o que ta errado no match|match nao funcionou|match vazio)/.test(t)) intent.tipo = 'diagnosticar_match';
  if (/(me ajuda a vender|estrategia de venda|como fechar|quero vender|preciso vender|como fechar negocio|lead mais quente|qual lead priorizar|qual imovel ta parado|imovel sem visita|lead sem fechar|como converter|dicas de venda|quero fechar|vou fechar|negocio parado|lead parada|ajuda a converter)/.test(t)) intent.tipo = 'estrategia_venda';
  if (/(vitrine|link do cliente|oferta do cliente|link pra lead|link para cliente|mandar link|enviar link|link da oferta|pagina do cliente|pagina da lead|ver oferta|oferta de imoveis|imoveis para lead|mostrar para lead|mostrar para cliente|compartilhar|compartilha)/.test(t)) intent.tipo = 'vitrine';
  if (/(minha carteira|imoveis inativos|imoveis sem prop|valor medio carteira|quantos imoveis|meus imoveis|imoveis ativos|total imoveis|carteira de imoveis|imovel mais caro|imovel mais barato|imovel por bairro|imovel por tipo|sem dono|sem proprietario|imovel parado|imovel sem foto|imovel sem descricao)/.test(t)) intent.tipo = 'imoveis_carteira';
  if (/(ajuda|socorro|help|o que voce faz|o que pode fazer|o que sabe fazer|como funciona|me ensina|nao sei usar|como uso|comandos|o que posso perguntar|o que posso pedir|lista de comandos|tutorial|me explica|como te uso|quais sao os comandos)/.test(t)) intent.tipo = 'ajuda';
  if (/(kanban|funil de visitas|pipeline|funil de vendas|etapas da visita|etapas de venda|fluxo de visita|board|quadro de visitas)/.test(t)) intent.tipo = 'kanban';
  if (/(exportar|baixar excel|relatorio imoveis|gerar relatorio|exportar imoveis|planilha de imoveis|download imoveis|excel de imoveis)/.test(t)) intent.tipo = 'exportar';
  if (/(cadastrar imovel|novo imovel|adicionar imovel|registrar imovel|incluir imovel|quero cadastrar|preciso cadastrar|add imovel|criar imovel)/.test(t)) intent.tipo = 'cadastrar_imovel';
  if (/(meu perfil|minha conta|alterar senha|mudar senha|meus dados|atualizar dados|editar perfil|configuracoes|config da conta|dados da conta|trocar senha)/.test(t)) intent.tipo = 'perfil';
  if (/(coins|moedas|saldo|pontos|meus pontos|meus coins|quantos coins|saldo de coins|match coins|ganhar coins|como ganho coins)/.test(t)) intent.tipo = 'coins';
  if (/(o que e match|explica match|como funciona match|o que e vitrine|explica vitrine|como funciona vitrine|o que e lead|explica lead|o que e xml|explica xml|o que sao coins|como funciona score|o que e score|como calcula|explica o sistema|como funciona o sistema)/.test(t)) intent.tipo = 'explicacao';
  if (/(gerar xml|criar xml|xml para|xml do vivareal|xml do zap|xml do olx|publicar no portal|portal|portais|ver portais|status dos portais|feed|link do feed|atualizar portal)/.test(t)) intent.tipo = 'xml_portal';

  const limpo = texto
    .replace(/ache|buscar|busca|procure|mostrar|mostra|lead|cliente|manda|mensagem|whatsapp|zap|para|pra|pro|pelo|a|o/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (limpo && limpo.length >= 3 && !/(quentes|notificacoes|visitas|matches|follow)/i.test(limpo)) {
    intent.filtro.busca = limpo;
  }

  return intent;
}

function montarResumoCentral(ctx) {
  const leads = ctx.leadsMatch || [];
  const visitas = ctx.visitas || [];
  const notificacoes = ctx.notificacoes || [];

  const comMatch = leads.filter(l => l.matches && l.matches.length > 0);
  const semMatch = leads.filter(l => !(l.matches && l.matches.length > 0));
  const erros = leads.filter(l => l.extractionStatus === 'erro');

  const visitasPendentes = visitas.filter(v => normalizeText(v.status).includes('pendente') || !v.status);
  const visitasConfirmadas = visitas.filter(v => normalizeText(v.status).includes('confirm'));

  return {
    totalLeads: leads.length,
    leadsComMatch: comMatch.length,
    leadsSemMatch: semMatch.length,
    errosExtracao: erros.length,
    totalVisitas: visitas.length,
    visitasPendentes: visitasPendentes.length,
    visitasConfirmadas: visitasConfirmadas.length,
    notificacoesPendentes: notificacoes.filter(n => !n.lida && !n.read).length
  };
}

function formatarLead(l, idx) {
  const matches = l.matches || [];
  const bestScore = Number(l.bestScore || l.score || matches[0]?.score || 0);
  return {
    idx,
    nome: getLeadName(l) || 'Sem nome',
    telefone: getLeadPhone(l),
    email: getLeadEmail(l),
    bairro: getBairro(l),
    status: getStatusLead(l),
    matches: matches.length,
    bestScore,
    id: l.id || l.idAnuncio || l.codigo || ''
  };
}

function listarLeadsQuentes(ctx, limite = 10) {
  const leads = ctx.leadsMatch || [];
  return leads
    .map((l, idx) => formatarLead(l, idx))
    .filter(l => l.matches > 0 || l.bestScore >= 70)
    .sort((a, b) => (b.bestScore - a.bestScore) || (b.matches - a.matches))
    .slice(0, limite);
}

function buscarLead(ctx, termo) {
  const q = normalizeText(termo);
  const leads = ctx.leadsMatch || [];
  return leads
    .map((l, idx) => ({ lead: l, idx }))
    .filter(({ lead }) => {
      const texto = normalizeText([
        getLeadName(lead),
        getLeadPhone(lead),
        getLeadEmail(lead),
        getBairro(lead),
        lead.id,
        lead.idAnuncio,
        lead.url
      ].join(' '));
      return texto.includes(q);
    });
}

function montarMensagemWhatsappLead(leadResumo) {
  const nome = leadResumo.nome || 'cliente';
  const bairro = leadResumo.bairro ? ` sobre imóvel em ${leadResumo.bairro}` : '';
  const matches = leadResumo.matches ? ` Encontrei ${leadResumo.matches} opção(ões) parecida(s).` : '';
  return `Olá ${nome}, tudo bem? Vi seu interesse${bairro}.${matches} Posso te enviar algumas opções e verificar um melhor horário para conversar?`;
}

function responderCentral(user, texto) {
  const ctx = carregarContexto(user);
  const intent = interpretarComando(texto);
  const resumo = montarResumoCentral(ctx);
  const memoria = ctx.memoriaOperacional || carregarMemoriaOperacional(user);

  if (intent.acao === 'whatsapp' && intent.filtro.usarMemoria && memoria.ultimoLead) {
    const lead = memoria.ultimoLead;
    const mensagem = montarMensagemWhatsappLead(lead);
    memoria.ultimaAcao = 'whatsapp';
    memoria.ultimaIntencao = intent;
    registrarHistorico(user, memoria, { tipo: 'whatsapp_sugerido', texto, lead, mensagem });

    return {
      intent,
      resumo,
      resposta: `📲 Preparei a mensagem para ${lead.nome}.`,
      acao: {
        tipo: 'whatsapp',
        telefone: lead.telefone,
        mensagem,
        url: lead.telefone ? `https://wa.me/${String(lead.telefone).replace(/\D/g, '')}?text=${encodeURIComponent(mensagem)}` : ''
      },
      itens: [lead]
    };
  }

  if (intent.tipo === 'notificacoes') {
    const pendentes = (ctx.notificacoes || []).filter(n => !n.lida && !n.read).slice(0, 10);
    memoria.ultimaIntencao = intent;
    registrarHistorico(user, memoria, { tipo: 'consulta_notificacoes', texto, total: pendentes.length });

    return {
      intent,
      resumo,
      resposta: pendentes.length ? `🔔 Encontrei ${pendentes.length} notificação(ões) pendente(s).` : '✅ Não encontrei notificações pendentes agora.',
      itens: pendentes
    };
  }


  if (intent.tipo === 'fazer_match') {
    try {
      const bmi = require('../matchBaseInterna.js');
      const userId = getUserKey(user);
      const leadsOk = (ctx.leadsMatch||[]).filter(function(l){ return l.extractionStatus === 'ok'; });
      const imoveis = readJson('imoveis.json', []);
      let comMatch = 0, semMatch = 0;
      leadsOk.forEach(function(lead) {
        const matches = bmi.buscarMatchesBaseInterna(lead, imoveis);
        lead.matchesBase = matches;
        lead.matchCountBase = matches.length;
        if (matches.length > 0) comMatch++; else semMatch++;
      });
      const data = readJson('data.json', []);
      const outras = data.filter(function(l){ return String(l.userId||l.usuarioId||l.corretorId||'') !== userId; });
      const restantes = data.filter(function(l){ return String(l.userId||l.usuarioId||l.corretorId||'') === userId && !leadsOk.find(function(x){ return x.id === l.id; }); });
      writeJson('data.json', outras.concat(restantes).concat(leadsOk));
      registrarHistorico(user, memoria, { tipo: 'fazer_match', texto: texto, comMatch: comMatch, semMatch: semMatch });
      return { intent: intent, resumo: resumo, resposta: 'Match concluido! ' + comMatch + ' lead(s) com match, ' + semMatch + ' sem match. Total: ' + leadsOk.length, itens: [] };
    } catch(e) {
      return { intent: intent, resumo: resumo, resposta: 'Erro ao rodar match: ' + e.message, itens: [] };
    }
  }

  if (intent.tipo === 'resumo_diario') {
    var hoje = new Date().toISOString().slice(0,10);
    var visitasHoje = (ctx.visitas||[]).filter(function(v){ return (v.dataVisita||'').slice(0,10) === hoje; });
    var leadsHoje = (ctx.leadsMatch||[]).filter(function(l){ return (l.createdAt||'').slice(0,10) === hoje; });
    var semMatchCount = (ctx.leadsMatch||[]).filter(function(l){ return !l.matchesBase || l.matchesBase.length === 0; }).length;
    var uidRes = getUserKey(user);
    var semPropCount = readJson('imoveis.json',[]).filter(function(i){ return String(i.userId||i.usuarioId||i.corretorId||'') === uidRes && (!i.proprietario || !i.proprietario.telefone); }).length;
    var rr = 'Resumo do dia:\n';
    rr += 'Visitas hoje: ' + visitasHoje.length + '\n';
    rr += 'Leads novas hoje: ' + leadsHoje.length + '\n';
    rr += 'Leads com match: ' + resumo.leadsComMatch + '\n';
    rr += 'Leads sem match: ' + semMatchCount + '\n';
    rr += 'Imoveis sem proprietario: ' + semPropCount;
    if (visitasHoje.length > 0) rr += '\nAtencao: voce tem visitas hoje!';
    if (semMatchCount > 5) rr += '\nDica: rode o match base interna!';
    registrarHistorico(user, memoria, { tipo: 'resumo_diario', texto: texto });
    return { intent: intent, resumo: resumo, resposta: rr, itens: visitasHoje };
  }

  if (intent.tipo === 'inteligencia_mercado') {
    var leads2 = ctx.leadsMatch || [];
    var bairrosMap = {}, tiposMap = {};
    var valores2 = leads2.filter(function(l){ return l.valor_imovel > 0; }).map(function(l){ return l.valor_imovel; });
    leads2.forEach(function(l) {
      if (l.bairro) bairrosMap[l.bairro] = (bairrosMap[l.bairro]||0)+1;
      if (l.tipo) tiposMap[l.tipo] = (tiposMap[l.tipo]||0)+1;
    });
    var topB = Object.entries(bairrosMap).sort(function(a,b){ return b[1]-a[1]; }).slice(0,5);
    var topT = Object.entries(tiposMap).sort(function(a,b){ return b[1]-a[1]; }).slice(0,3);
    var vMed = valores2.length ? Math.round(valores2.reduce(function(a,b){ return a+b; },0)/valores2.length) : 0;
    var vMin = valores2.length ? Math.min.apply(null, valores2) : 0;
    var vMax = valores2.length ? Math.max.apply(null, valores2) : 0;
    var cifrao = String.fromCharCode(36);
    var r2 = 'Inteligencia de Mercado:\n\n';
    r2 += 'Bairros mais demandados:\n' + topB.map(function(x){ return x[0] + ': ' + x[1] + ' leads'; }).join('\n') + '\n\n';
    r2 += 'Tipos mais buscados:\n' + topT.map(function(x){ return x[0] + ': ' + x[1] + ' leads'; }).join('\n') + '\n\n';
    r2 += 'Faixa de valor: R' + cifrao + vMin.toLocaleString('pt-BR') + ' a R' + cifrao + vMax.toLocaleString('pt-BR') + '\n';
    r2 += 'Valor medio: R' + cifrao + vMed.toLocaleString('pt-BR');
    registrarHistorico(user, memoria, { tipo: 'inteligencia_mercado', texto: texto });
    return { intent: intent, resumo: resumo, resposta: r2, itens: [] };
  }

  if (intent.tipo === 'diagnosticar_match') {
    var leadsS = (ctx.leadsMatch||[]).filter(function(l){ return !l.matchesBase || l.matchesBase.length === 0; });
    var semBairro2 = leadsS.filter(function(l){ return !l.bairro; }).length;
    var semTipo2 = leadsS.filter(function(l){ return !l.tipo; }).length;
    var semExtr = leadsS.filter(function(l){ return l.extractionStatus !== 'ok'; }).length;
    var r3 = 'Diagnostico sem match:\n';
    r3 += 'Leads sem match: ' + leadsS.length + '\n';
    r3 += 'Sem bairro: ' + semBairro2 + '\n';
    r3 += 'Sem tipo: ' + semTipo2 + '\n';
    r3 += 'Sem extracao: ' + semExtr + '\n';
    if (semExtr > 0) r3 += 'Dica: rode a extracao de dados primeiro.\n';
    if (semBairro2 > 0) r3 += 'Dica: leads sem bairro nao fazem match.\n';
    r3 += 'O match exige cidade+bairro+tipo+quartos compativeis.';
    registrarHistorico(user, memoria, { tipo: 'diagnosticar_match', texto: texto });
    return { intent: intent, resumo: resumo, resposta: r3, itens: leadsS.slice(0,5) };
  }

  if (intent.tipo === 'estrategia_venda') {
    var leadsQ = (ctx.leadsMatch||[]).filter(function(l){ return l.matchesBase && l.matchesBase.length >= 3; });
    var uid3 = getUserKey(user);
    var imovP = readJson('imoveis.json',[]).filter(function(i){ return String(i.userId||i.usuarioId||i.corretorId||'') === uid3 && i.status === 'ativo' && i.updatedAt && (Date.now() - new Date(i.updatedAt).getTime()) > 30*24*60*60*1000; });
    var r4 = 'Estrategia de Vendas:\n';
    if (leadsQ.length > 0) r4 += leadsQ.length + ' lead(s) quente(s) com 3+ matches — priorize!\n';
    if (imovP.length > 0) r4 += imovP.length + ' imovel(is) parado(s) ha 30+ dias.\n';
    r4 += 'Recomendacoes: envie vitrine para leads com match, revise valores de imoveis parados, faca follow-up em leads sem contato ha 15+ dias.';
    registrarHistorico(user, memoria, { tipo: 'estrategia_venda', texto: texto });
    return { intent: intent, resumo: resumo, resposta: r4, itens: leadsQ.slice(0,5) };
  }

  if (intent.tipo === 'vitrine') {
    var uid4 = getUserKey(user);
    var leadsV = (ctx.leadsMatch||[]).filter(function(l){ return l.matchesBase && l.matchesBase.length > 0; }).slice(0,5);
    registrarHistorico(user, memoria, { tipo: 'vitrine', texto: texto });
    return { intent: intent, resumo: resumo, resposta: leadsV.length ? leadsV.length + ' lead(s) com vitrine disponivel!' : 'Nenhuma lead com match ainda. Rode o match primeiro.', itens: leadsV };
  }

  if (intent.tipo === 'imoveis_carteira') {
    var uid5 = getUserKey(user);
    var todosIm = readJson('imoveis.json',[]).filter(function(i){ return String(i.userId||i.usuarioId||i.corretorId||'') === uid5; });
    var ativosIm = todosIm.filter(function(i){ return i.status !== 'inativo'; });
    var inativosIm = todosIm.filter(function(i){ return i.status === 'inativo'; });
    var semPropIm = todosIm.filter(function(i){ return !i.proprietario || !i.proprietario.telefone; });
    registrarHistorico(user, memoria, { tipo: 'imoveis_carteira', texto: texto });
    return { intent: intent, resumo: resumo, resposta: 'Carteira: ' + todosIm.length + ' imovel(is) | Ativos: ' + ativosIm.length + ' | Inativos: ' + inativosIm.length + ' | Sem proprietario: ' + semPropIm.length, itens: todosIm.slice(0,8) };
  }

  if (intent.tipo === 'ajuda') {
    registrarHistorico(user, memoria, { tipo: 'ajuda', texto: texto });
    return { intent: intent, resumo: resumo, resposta: 'Sou o Match! Posso ajudar com: leads, imoveis, visitas, match, mercado, vitrine, xml, coins, resumo do dia, estrategia de venda. Basta digitar!', itens: [] };
  }

  if (intent.tipo === 'kanban') {
    return { intent: intent, resumo: resumo, resposta: 'Acesse o kanban de visitas.', acao: { tipo: 'navegar', rota: '/app/visitas-kanban' }, itens: [] };
  }

  if (intent.tipo === 'exportar') {
    return { intent: intent, resumo: resumo, resposta: 'Baixando Excel de imoveis.', acao: { tipo: 'navegar', rota: '/app/imoveis/exportar-excel' }, itens: [] };
  }

  if (intent.tipo === 'cadastrar_imovel') {
    return { intent: intent, resumo: resumo, resposta: 'Indo para cadastro de imovel!', acao: { tipo: 'navegar', rota: '/app/cadastro' }, itens: [] };
  }

  if (intent.tipo === 'perfil') {
    return { intent: intent, resumo: resumo, resposta: 'Acessando seu perfil.', acao: { tipo: 'navegar', rota: '/app/perfil' }, itens: [] };
  }
  if (intent.tipo === 'leads_quentes') {
    const itens = listarLeadsQuentes(ctx);
    if (itens[0]) memoria.ultimoLead = itens[0];
    memoria.ultimaIntencao = intent;
    registrarHistorico(user, memoria, { tipo: 'consulta_leads_quentes', texto, total: itens.length, ultimoLead: memoria.ultimoLead });

    return {
      intent,
      resumo,
      resposta: itens.length ? `🔥 Encontrei ${itens.length} lead(s) quente(s) para priorizar.` : 'Ainda não encontrei leads quentes com match/score alto.',
      itens
    };
  }

  if (intent.tipo === 'visitas') {
    const visitas = (ctx.visitas || []).slice(0, 10);
    if (visitas[0]) memoria.ultimaVisita = visitas[0];
    memoria.ultimaIntencao = intent;
    registrarHistorico(user, memoria, { tipo: 'consulta_visitas', texto, total: visitas.length });

    return {
      intent,
      resumo,
      resposta: visitas.length ? `📅 Encontrei ${visitas.length} visita(s)/agendamento(s).` : 'Não encontrei visitas cadastradas agora.',
      itens: visitas
    };
  }

  if (intent.tipo === 'matches') {
    const itens = listarLeadsQuentes(ctx, 10);
    if (itens[0]) memoria.ultimoLead = itens[0];
    memoria.ultimaIntencao = intent;
    registrarHistorico(user, memoria, { tipo: 'consulta_matches', texto, total: itens.length, ultimoLead: memoria.ultimoLead });

    return {
      intent,
      resumo,
      resposta: itens.length ? `🏠 Encontrei leads com matches disponíveis.` : 'Ainda não encontrei matches disponíveis.',
      itens
    };
  }

  if (intent.tipo === 'leads' || intent.filtro.busca) {
    let termo = intent.filtro.busca || texto;

    if (intent.filtro.usarMemoria && memoria.ultimoLead) {
      termo = memoria.ultimoLead.nome || memoria.ultimoLead.telefone || termo;
    }

    const encontrados = buscarLead(ctx, termo).slice(0, 10);
    const itens = encontrados.map(({ lead, idx }) => formatarLead(lead, idx));

    if (itens[0]) memoria.ultimoLead = itens[0];
    memoria.ultimaIntencao = intent;
    registrarHistorico(user, memoria, { tipo: 'consulta_lead', texto, termo, total: itens.length, ultimoLead: memoria.ultimoLead });

    return {
      intent,
      resumo,
      resposta: itens.length ? `🔍 Encontrei ${itens.length} lead(s). Vou lembrar do primeiro contexto: ${itens[0].nome}.` : 'Não encontrei lead com esse termo.',
      itens
    };
  }

  memoria.ultimaIntencao = intent;
  registrarHistorico(user, memoria, { tipo: 'consulta_geral', texto });

  return {
    intent,
    resumo,
    resposta:
      `🤖 Central operacional ativa.\n\nResumo: ${resumo.totalLeads} lead(s), ${resumo.leadsComMatch} com match, ${resumo.visitasPendentes} visita(s) pendente(s), ${resumo.notificacoesPendentes} notificação(ões) pendente(s).\n\nVocê pode pedir: "mostrar leads quentes", "ache o lead Bruno" ou "manda WhatsApp pra ele".`,
    itens: []
  };
}

module.exports = {
  responderCentral,
  interpretarComando,
  carregarContexto,
  montarResumoCentral,
  listarLeadsQuentes,
  buscarLead,
  carregarMemoriaOperacional,
  salvarMemoriaOperacional
};
