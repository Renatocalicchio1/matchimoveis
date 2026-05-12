const fs = require('fs');
const path = require('path');
const { getLeadStage, rankLeads } = require('./leadPipeline');
const {
  aplicarWorkflowVisita,
  montarMensagemProprietario,
  montarMensagemParceiro
} = require('./visitaWorkflow');

function montarMensagemFollowup(visita = {}) {

  if (visita.workflowStatus === 'REMARCAR') {
    return `Olá ${visita.nome || ''}! Precisamos reagendar sua visita ao imóvel ${visita.imovelTitulo || visita.imovelBairro || 'selecionado'}. Qual melhor data e horário para você?`;
  }

  if (visita.workflowStatus === 'AGUARDANDO_PROPRIETARIO') {
    return montarMensagemProprietario(visita);
  }

  if (visita.workflowStatus === 'AGUARDANDO_PARCEIRO') {
    return montarMensagemParceiro(visita);
  }

  return `Olá ${visita.nome || ''}! Estamos acompanhando sua solicitação de visita.`;
}

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

function salvarVisitas(visitas = []) {
  writeJson('visitas.json', visitas);
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

  if (/(resumo operacional|operacao|operaçao|meu dia|meu resumo|como esta minha operacao|o que tenho hoje|painel operacional)/.test(t)) {
    intent.tipo = 'painel_operacional';
  }

  if (/(notificacao|notificacoes|aviso|avisos|pendencia|pendencias)/.test(t)) intent.tipo = 'notificacoes';
  if (/(lead|leads|cliente|clientes)/.test(t)) intent.tipo = 'leads';
  if (/(quente|quentes|prioridade|prioritarios|melhores|urgente|urgentes|prioridades|minhas prioridades|o que preciso fazer|pendencias|pendencias operacionais|parado|parados)/.test(t)) {
    intent.tipo = 'prioridades';
    intent.filtro.quente = true;
  }
  if (/(visita|visitas|agendamento|agendamentos|agenda|esperando|aguardando|pendente|pendentes)/.test(t)) intent.tipo = 'visitas';

  if (/(proprietario|dono)/.test(t)) intent.filtro.workflow = 'AGUARDANDO_PROPRIETARIO';
  if (/(parceiro|corretor parceiro)/.test(t)) intent.filtro.workflow = 'AGUARDANDO_PARCEIRO';
  if (/(corretor|manual|responsavel)/.test(t) && !/(parceiro|corretor parceiro)/.test(t)) intent.filtro.workflow = 'AGUARDANDO_CORRETOR';
  if (/(confirmada|confirmadas|confirmado|confirmados)/.test(t)) intent.filtro.workflow = 'CONFIRMADA';
  if (/(remarcar|reagendar)/.test(t)) intent.filtro.workflow = 'REMARCAR';
  if (/(cancelada|canceladas|cancelado|cancelados)/.test(t)) intent.filtro.workflow = 'CANCELADA';
  if (/(whatsapp|zap|mensagem|manda|enviar|falar)/.test(t)) intent.acao = 'whatsapp';

  if (/(primeir|primeiro|primeira|1|um)/.test(t)) intent.filtro.indice = 0;
  if (/(segund|segundo|segunda|2|dois)/.test(t)) intent.filtro.indice = 1;
  if (/(terceir|terceiro|terceira|3|tres)/.test(t)) intent.filtro.indice = 2;
  if (/(proprietario|dono)/.test(t)) intent.entidade = 'proprietario';
  if (/(corretor|parceiro)/.test(t)) intent.entidade = 'corretor';
  if (/(remarcar|reagendar)/.test(t)) {
    intent.acao = 'remarcar_visita';
    intent.tipo = 'visitas';
  }
  if (/(confirmar|confirma)/.test(t)) intent.acao = 'confirmar';

  if (/(cancelar|cancela|cancelada|cancelado)/.test(t)) {
    intent.acao = 'cancelar_visita';
  }

  if (/(remarcar|remarca|reagendar|reagenda)/.test(t)) {
    intent.acao = 'remarcar_visita';
  }

  if (/(follow|followup|cobrar|lembrete|acompanhar)/.test(t)) {
    intent.acao = 'followup_visita';
  }
  if (/(match|matches|parecido|parecidos|similar|similares)/.test(t)) intent.tipo = 'matches';

  if (/(ele|ela|esse|essa|mesmo|mesma)/.test(t)) intent.filtro.usarMemoria = true;

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
  const matches = l.matches || l.matchesBase || [];
  const bestScore = Number(l.bestScore || l.score || matches[0]?.score || 0);
  const pipeline = l.pipeline || getLeadStage(l, []);
  return {
    idx,
    nome: getLeadName(l) || 'Sem nome',
    telefone: getLeadPhone(l),
    email: getLeadEmail(l),
    bairro: getBairro(l),
    status: getStatusLead(l),
    matches: matches.length,
    bestScore,
    pipeline,
    label: pipeline.label,
    prioridade: pipeline.prioridade,
    id: l.id || l.idAnuncio || l.codigo || ''
  };
}

function listarLeadsQuentes(ctx, limite = 10) {
  const leads = ctx.leadsMatch || [];
  const visitas = ctx.visitas || [];

  return rankLeads(leads, visitas)
    .map((l, idx) => {
      const item = formatarLead(l, idx);
      item.pipeline = l.pipeline;
      item.label = l.pipeline?.label || '';
      item.prioridade = l.pipeline?.prioridade || 0;
      return item;
    })
    .filter(l => ['quente','quente_score','morno','visita_pendente','visita_confirmada'].includes(l.pipeline?.stage))
    .sort((a, b) => (b.prioridade - a.prioridade) || (b.matches - a.matches))
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

  if (/(confirmar|confirma)/.test(normalizeText(texto))) intent.acao = 'confirmar_visita';

  if (
    intent.acao === 'followup_visita' &&
    typeof intent.filtro.indice !== 'undefined'
  ) {

    const visitas = (ctx.visitas || [])
      .map(v => aplicarWorkflowVisita(v));

    const prioridades = [];

    visitas.forEach(v => {

      let prioridade = 0;

      if (v.workflowStatus === 'AGUARDANDO_PROPRIETARIO') prioridade += 100;
      if (v.workflowStatus === 'AGUARDANDO_PARCEIRO') prioridade += 90;
      if (v.workflowStatus === 'REMARCAR') prioridade += 80;
      if (v.workflowStatus === 'AGUARDANDO_CORRETOR') prioridade += 70;

      prioridades.push({
        visita: v,
        prioridade
      });

    });

    prioridades.sort((a,b)=> b.prioridade - a.prioridade);

    const alvo = prioridades[intent.filtro.indice];

    if (alvo && alvo.visita) {

      const v = alvo.visita;

      const mensagem = montarMensagemFollowup(v);

      registrarHistorico(user, memoria, {
        tipo: 'followup_visita',
        texto,
        visitaId: v.id
      });

      return {
        intent,
        resumo,
        resposta: `📲 Follow-up preparado para ${v.nome}.`,
        acao: {
          tipo: 'whatsapp',
          telefone: v.workflowWhatsappDestino || v.telefone || v.contato,
          mensagem,
          url: `https://wa.me/${String(v.workflowWhatsappDestino || v.telefone || v.contato || '').replace(/\D/g,'')}?text=${encodeURIComponent(mensagem)}`
        },
        itens: [v]
      };

    }

  }

  if (
    intent.acao === 'remarcar_visita' &&
    typeof intent.filtro.indice !== 'undefined'
  ) {

    const visitasOriginais = ctx.visitas || [];

    const visitas = visitasOriginais
      .map(v => aplicarWorkflowVisita(v));

    const prioridades = [];

    visitas.forEach((v, idx) => {

      let prioridade = 0;

      if (v.workflowStatus === 'AGUARDANDO_PROPRIETARIO') prioridade += 100;
      if (v.workflowStatus === 'AGUARDANDO_PARCEIRO') prioridade += 90;
      if (v.workflowStatus === 'REMARCAR') prioridade += 80;
      if (v.workflowStatus === 'AGUARDANDO_CORRETOR') prioridade += 70;

      prioridades.push({
        idxOriginal: idx,
        visita: v,
        prioridade
      });

    });

    prioridades.sort((a,b)=> b.prioridade - a.prioridade);

    const alvo = prioridades[intent.filtro.indice];

    if (alvo && alvo.visita) {

      visitasOriginais[alvo.idxOriginal].status = 'remarcar';
      visitasOriginais[alvo.idxOriginal].remarcarEm = new Date().toISOString();

      visitasOriginais[alvo.idxOriginal] =
        aplicarWorkflowVisita(visitasOriginais[alvo.idxOriginal]);

      salvarVisitas(visitasOriginais);

      memoria.ultimaVisita = visitasOriginais[alvo.idxOriginal];
      memoria.ultimaAcao = 'remarcar_visita';

      registrarHistorico(user, memoria, {
        tipo: 'remarcar_visita',
        texto,
        visitaId: alvo.visita.id
      });

      return {
        intent,
        resumo,
        resposta: `📅 Visita marcada para reagendamento de ${alvo.visita.nome}.`,
        itens: [visitasOriginais[alvo.idxOriginal]]
      };

    }

  }

  if (
    intent.acao === 'cancelar_visita' &&
    typeof intent.filtro.indice !== 'undefined'
  ) {

    const visitasOriginais = ctx.visitas || [];

    const visitas = visitasOriginais
      .map(v => aplicarWorkflowVisita(v));

    const prioridades = [];

    visitas.forEach((v, idx) => {

      let prioridade = 0;

      if (v.workflowStatus === 'AGUARDANDO_PROPRIETARIO') prioridade += 100;
      if (v.workflowStatus === 'AGUARDANDO_PARCEIRO') prioridade += 90;
      if (v.workflowStatus === 'REMARCAR') prioridade += 80;
      if (v.workflowStatus === 'AGUARDANDO_CORRETOR') prioridade += 70;

      prioridades.push({
        idxOriginal: idx,
        visita: v,
        prioridade
      });

    });

    prioridades.sort((a,b)=> b.prioridade - a.prioridade);

    const alvo = prioridades[intent.filtro.indice];

    if (alvo && alvo.visita) {

      visitasOriginais[alvo.idxOriginal].status = 'cancelada';
      visitasOriginais[alvo.idxOriginal].canceladaEm = new Date().toISOString();

      visitasOriginais[alvo.idxOriginal] =
        aplicarWorkflowVisita(visitasOriginais[alvo.idxOriginal]);

      salvarVisitas(visitasOriginais);

      memoria.ultimaVisita = visitasOriginais[alvo.idxOriginal];
      memoria.ultimaAcao = 'cancelar_visita';

      registrarHistorico(user, memoria, {
        tipo: 'cancelamento_visita',
        texto,
        visitaId: alvo.visita.id
      });

      return {
        intent,
        resumo,
        resposta: `❌ Visita cancelada para ${alvo.visita.nome}.`,
        itens: [visitasOriginais[alvo.idxOriginal]]
      };

    }

  }

  if (
    intent.acao === 'confirmar_visita' &&
    typeof intent.filtro.indice !== 'undefined'
  ) {

    const visitasOriginais = ctx.visitas || [];

    const visitas = visitasOriginais
      .map(v => aplicarWorkflowVisita(v));

    const prioridades = [];

    visitas.forEach((v, idx) => {

      let prioridade = 0;

      if (v.workflowStatus === 'AGUARDANDO_PROPRIETARIO') prioridade += 100;
      if (v.workflowStatus === 'AGUARDANDO_PARCEIRO') prioridade += 90;
      if (v.workflowStatus === 'REMARCAR') prioridade += 80;
      if (v.workflowStatus === 'AGUARDANDO_CORRETOR') prioridade += 70;

      prioridades.push({
        idxOriginal: idx,
        visita: v,
        prioridade
      });

    });

    prioridades.sort((a,b)=> b.prioridade - a.prioridade);

    const alvo = prioridades[intent.filtro.indice];

    if (alvo && alvo.visita) {

      visitasOriginais[alvo.idxOriginal].status = 'confirmada';
      visitasOriginais[alvo.idxOriginal].confirmadaEm = new Date().toISOString();

      visitasOriginais[alvo.idxOriginal] =
        aplicarWorkflowVisita(visitasOriginais[alvo.idxOriginal]);

      salvarVisitas(visitasOriginais);

      memoria.ultimaVisita = visitasOriginais[alvo.idxOriginal];
      memoria.ultimaAcao = 'confirmar_visita';

      registrarHistorico(user, memoria, {
        tipo: 'confirmacao_visita',
        texto,
        visitaId: alvo.visita.id
      });

      return {
        intent,
        resumo,
        resposta: `✅ Visita confirmada para ${alvo.visita.nome}.`,
        itens: [visitasOriginais[alvo.idxOriginal]]
      };

    }

  }

  if (/(confirmar|confirma)/.test(normalizeText(texto))) intent.acao = 'confirmar_visita';

  if (
    intent.acao === 'confirmar_visita' &&
    typeof intent.filtro.indice !== 'undefined'
  ) {

    const visitasOriginais = ctx.visitas || [];

    const visitas = visitasOriginais
      .map(v => aplicarWorkflowVisita(v));

    const prioridades = [];

    visitas.forEach((v, idx) => {

      let prioridade = 0;

      if (v.workflowStatus === 'AGUARDANDO_PROPRIETARIO') prioridade += 100;
      if (v.workflowStatus === 'AGUARDANDO_PARCEIRO') prioridade += 90;
      if (v.workflowStatus === 'REMARCAR') prioridade += 80;
      if (v.workflowStatus === 'AGUARDANDO_CORRETOR') prioridade += 70;

      prioridades.push({
        idxOriginal: idx,
        visita: v,
        prioridade
      });

    });

    prioridades.sort((a,b)=> b.prioridade - a.prioridade);

    const alvo = prioridades[intent.filtro.indice];

    if (alvo && alvo.visita) {

      visitasOriginais[alvo.idxOriginal].status = 'confirmada';
      visitasOriginais[alvo.idxOriginal].confirmadaEm = new Date().toISOString();

      salvarVisitas(visitasOriginais);

      memoria.ultimaVisita = visitasOriginais[alvo.idxOriginal];
      memoria.ultimaAcao = 'confirmar_visita';

      registrarHistorico(user, memoria, {
        tipo: 'confirmacao_visita',
        texto,
        visitaId: alvo.visita.id
      });

      return {
        intent,
        resumo,
        resposta: `✅ Visita confirmada para ${alvo.visita.nome}.`,
        itens: [visitasOriginais[alvo.idxOriginal]]
      };

    }

  }

  if (
    intent.acao === 'whatsapp' &&
    typeof intent.filtro.indice !== 'undefined'
  ) {

    const visitas = (ctx.visitas || [])
      .map(v => aplicarWorkflowVisita(v));

    const prioridades = [];

    visitas.forEach(v => {

      let prioridade = 0;

      if (v.workflowStatus === 'AGUARDANDO_PROPRIETARIO') prioridade += 100;
      if (v.workflowStatus === 'AGUARDANDO_PARCEIRO') prioridade += 90;
      if (v.workflowStatus === 'REMARCAR') prioridade += 80;
      if (v.workflowStatus === 'AGUARDANDO_CORRETOR') prioridade += 70;

      prioridades.push({
        visita: v,
        prioridade
      });

    });

    prioridades.sort((a,b)=> b.prioridade - a.prioridade);

    const alvo = prioridades[intent.filtro.indice];

    if (alvo && alvo.visita) {

      const v = alvo.visita;

      memoria.ultimaVisita = v;
      memoria.ultimaAcao = 'whatsapp_visita';

      registrarHistorico(user, memoria, {
        tipo: 'acao_whatsapp_visita',
        texto,
        visitaId: v.id
      });

      return {
        intent,
        resumo,
        resposta: `📲 Mensagem pronta para ${v.proprietarioNome || v.nome}.`,
        acao: {
          tipo: 'whatsapp',
          telefone: v.workflowWhatsappDestino,
          mensagem: v.workflowWhatsappTexto,
          url: `https://wa.me/${String(v.workflowWhatsappDestino || '').replace(/\D/g,'')}?text=${encodeURIComponent(v.workflowWhatsappTexto || '')}`
        },
        itens: [v]
      };

    }

  }

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

  if (intent.tipo === 'painel_operacional') {

    const visitas = (ctx.visitas || [])
      .map(v => aplicarWorkflowVisita(v));

    const resumoOperacional = {
      total: visitas.length,
      aguardandoProprietario: visitas.filter(v => v.workflowStatus === 'AGUARDANDO_PROPRIETARIO').length,
      aguardandoParceiro: visitas.filter(v => v.workflowStatus === 'AGUARDANDO_PARCEIRO').length,
      aguardandoCorretor: visitas.filter(v => v.workflowStatus === 'AGUARDANDO_CORRETOR').length,
      confirmadas: visitas.filter(v => v.workflowStatus === 'CONFIRMADA').length,
      remarcar: visitas.filter(v => v.workflowStatus === 'REMARCAR').length,
      canceladas: visitas.filter(v => v.workflowStatus === 'CANCELADA').length
    };

    const prioridades = visitas
      .filter(v =>
        ['AGUARDANDO_PROPRIETARIO','AGUARDANDO_PARCEIRO','REMARCAR']
        .includes(v.workflowStatus)
      )
      .slice(0,10);

    registrarHistorico(user, memoria, {
      tipo: 'painel_operacional',
      texto
    });

    return {
      intent,
      resumo,
      resposta:
        `📊 Operação do dia:
• Total visitas: ${resumoOperacional.total}
• Aguardando proprietário: ${resumoOperacional.aguardandoProprietario}
• Aguardando parceiro: ${resumoOperacional.aguardandoParceiro}
• Aguardando corretor: ${resumoOperacional.aguardandoCorretor}
• Confirmadas: ${resumoOperacional.confirmadas}
• Reagendar: ${resumoOperacional.remarcar}
• Canceladas: ${resumoOperacional.canceladas}`,
      painel: resumoOperacional,
      itens: prioridades
    };
  }

  if (intent.tipo === 'prioridades') {

    const visitas = (ctx.visitas || [])
      .map(v => aplicarWorkflowVisita(v));

    const prioridades = [];

    visitas.forEach(v => {

      let prioridade = 0;

      if (v.workflowStatus === 'AGUARDANDO_PROPRIETARIO') prioridade += 100;
      if (v.workflowStatus === 'AGUARDANDO_PARCEIRO') prioridade += 90;
      if (v.workflowStatus === 'REMARCAR') prioridade += 80;
      if (v.workflowStatus === 'AGUARDANDO_CORRETOR') prioridade += 70;

      prioridades.push({
        tipo: 'visita',
        prioridade,
        cliente: v.nome,
        imovel: v.imovelTitulo,
        workflow: v.workflowStatus,
        label: v.workflowLabel,
        proximaAcao: v.workflowProximaAcao,
        whatsapp: v.workflowWhatsappDestino ? {
          telefone: v.workflowWhatsappDestino,
          mensagem: v.workflowWhatsappTexto,
          url: `https://wa.me/${String(v.workflowWhatsappDestino).replace(/\D/g,'')}?text=${encodeURIComponent(v.workflowWhatsappTexto || '')}`
        } : null
      });

    });

    prioridades.sort((a,b)=> b.prioridade - a.prioridade);

    memoria.ultimaIntencao = intent;

    registrarHistorico(user, memoria, {
      tipo: 'consulta_prioridades',
      texto,
      total: prioridades.length
    });

    return {
      intent,
      resumo,
      resposta: prioridades.length
        ? `🚨 Você possui ${prioridades.length} prioridade(s) operacional(is).`
        : '✅ Nenhuma prioridade operacional pendente.',
      itens: prioridades.slice(0,10)
    };
  }

  if (intent.tipo === 'prioridades') {

    const visitas = (ctx.visitas || [])
      .map(v => aplicarWorkflowVisita(v));

    const prioridades = [];

    visitas.forEach(v => {

      let prioridade = 0;

      if (v.workflowStatus === 'AGUARDANDO_PROPRIETARIO') prioridade += 100;
      if (v.workflowStatus === 'AGUARDANDO_PARCEIRO') prioridade += 90;
      if (v.workflowStatus === 'REMARCAR') prioridade += 80;
      if (v.workflowStatus === 'AGUARDANDO_CORRETOR') prioridade += 70;

      prioridades.push({
        tipo: 'visita',
        prioridade,
        cliente: v.nome,
        imovel: v.imovelTitulo,
        workflow: v.workflowStatus,
        label: v.workflowLabel,
        proximaAcao: v.workflowProximaAcao,
        whatsapp: v.workflowWhatsappDestino ? {
          telefone: v.workflowWhatsappDestino,
          mensagem: v.workflowWhatsappTexto,
          url: `https://wa.me/${String(v.workflowWhatsappDestino).replace(/\D/g,'')}?text=${encodeURIComponent(v.workflowWhatsappTexto || '')}`
        } : null
      });

    });

    prioridades.sort((a,b)=> b.prioridade - a.prioridade);

    memoria.ultimaIntencao = intent;

    registrarHistorico(user, memoria, {
      tipo: 'consulta_prioridades',
      texto,
      total: prioridades.length
    });

    return {
      intent,
      resumo,
      resposta: prioridades.length
        ? `🚨 Você possui ${prioridades.length} prioridade(s) operacional(is).`
        : '✅ Nenhuma prioridade operacional pendente.',
      itens: prioridades.slice(0,10)
    };
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
    let visitas = (ctx.visitas || [])
      .map(v => aplicarWorkflowVisita(v));

    if (intent.filtro.workflow) {
      visitas = visitas.filter(v => v.workflowStatus === intent.filtro.workflow);
    }

    visitas = visitas.slice(0, 10);

    if (visitas[0]) memoria.ultimaVisita = visitas[0];
    memoria.ultimaIntencao = intent;
    registrarHistorico(user, memoria, { tipo: 'consulta_visitas', texto, total: visitas.length, ultimaVisita: memoria.ultimaVisita });

    const pendentesProprietario = visitas.filter(v => v.workflowStatus === 'AGUARDANDO_PROPRIETARIO').length;
    const pendentesParceiro = visitas.filter(v => v.workflowStatus === 'AGUARDANDO_PARCEIRO').length;
    const pendentesCorretor = visitas.filter(v => v.workflowStatus === 'AGUARDANDO_CORRETOR').length;
    const confirmadas = visitas.filter(v => v.workflowStatus === 'CONFIRMADA').length;

    return {
      intent,
      resumo,
      resposta: visitas.length
        ? `📅 Encontrei ${visitas.length} visita(s). Proprietário: ${pendentesProprietario}, parceiro: ${pendentesParceiro}, corretor: ${pendentesCorretor}, confirmadas: ${confirmadas}.`
        : 'Não encontrei visitas cadastradas agora.',
      itens: visitas,
      acoes: visitas.map((v, idx) => ({
        tipo: 'visita_workflow',
        indice: idx,
        status: v.workflowStatus,
        responsavel: v.workflowResponsavel,
        proximaAcao: v.workflowProximaAcao,
        label: v.workflowLabel,
        whatsapp: v.workflowWhatsappDestino ? {
          telefone: v.workflowWhatsappDestino,
          mensagem: v.workflowWhatsappTexto,
          url: `https://wa.me/${String(v.workflowWhatsappDestino).replace(/\D/g, '')}?text=${encodeURIComponent(v.workflowWhatsappTexto || '')}`
        } : null
      }))
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
