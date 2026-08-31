/**
 * cerebro/propensao.js
 *
 * "Fale agora" — pontuação de propensão a fechar por lead, com pesos que
 * decaem no tempo (pedido do Renato, ago/2026: "o cliente abriu o email faz
 * cinco minuto" tem que pesar mais que a mesma ação há 3 dias). Complementar
 * à `temperatura` já existente (que mede PERFIL — o quanto sabemos sobre o
 * que a lead quer); esta pontuação mede INTERAÇÃO — o quanto ela está
 * agindo de verdade agora. Mesma separação usada pelo RD Station (Perfil x
 * Interação) e pelo "score decay" do HubSpot (intenção tem prazo de
 * validade) — pesquisado antes de desenhar isso.
 *
 * Pesos-base seguem a mesma hierarquia que cerebro/motor-intencao.js já usa
 * (salvar > visualizar, compartilhar = altíssima intenção) e que
 * services/agenteProativo.js já trata como sinal crítico (voltar a ver o
 * mesmo imóvel) — não são pesos inventados do zero.
 */

const PONTOS = {
  // visualizacao/vitrineVista subiram e navegouImoveis passou a existir
  // (ago/2026, pedido do Renato: "detalhes do imóvel, abriu vitrine,
  // navegou por imóveis tem que ter peso maior") — são as 3 ações de
  // engajamento ativo mais comuns na jornada do lead na vitrine pública,
  // estavam pesando menos que ações pontuais (ex: 1 clique em salvar).
  visualizacao: 10,
  tempoPorSegundo: 1 / 30,  // +1 a cada 30s de uma visualização
  tempoCapPorEvento: 8,     // no máx +8 de bônus de tempo por visualização
  salvou: 15,
  compartilhou: 20,
  voltouVerMesmoImovel: 25,
  cliqueContato: 15,
  emailAberto: 5,
  emailClicado: 10,
  mensagemWhatsapp: 3,
  vitrineVista: 10,
  navegouImoveis: 15,        // navegou por 2+ imóveis distintos na vitrine (comparação ativa)
  navegouBonusPorImovel: 1,  // +1 por imóvel visto além do 2º
  navegouBonusCap: 10,       // no máx +10 de bônus por navegação
  mapaAberto: 3,
};

// Tetos por TIPO de sinal (evita 1 tipo sozinho dominar o score todo — ex:
// 50 visualizações não pode valer mais que 1 compartilhamento de verdade).
const TETOS = {
  visualizacao: 30,
  salvou: 30,
  cliqueContato: 15,
  mensagemWhatsapp: 15,
  navegouImoveis: 20,
};

function _pesoRecencia(msDesde) {
  const min = msDesde / 60000;
  if (min <= 30) return 1;
  if (min <= 180) return 0.85;   // até 3h
  if (min <= 1440) return 0.6;   // até 24h
  if (min <= 4320) return 0.3;   // até 3 dias
  return 0.1;                    // 7+ dias — quase zera, nunca some de vez
}

function _minutosDesde(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 60000;
}

// "há 5 min" / "há 2h" / "há 3 dias" — mesmo padrão usado em toda a
// plataforma (ex: services/agenteProativo.js).
function tempoRelativo(iso) {
  const min = _minutosDesde(iso);
  if (!Number.isFinite(min)) return '';
  if (min < 1) return 'agora mesmo';
  if (min < 60) return 'há ' + Math.round(min) + ' min';
  const h = min / 60;
  if (h < 24) return 'há ' + Math.round(h) + 'h';
  const d = Math.floor(h / 24);
  return 'há ' + d + (d === 1 ? ' dia' : ' dias');
}

/**
 * Monta a lista de "eventos pontuáveis" da lead a partir do que já é
 * coletado (lead.comportamento, alimentado por /api/comportamento-lead) +
 * e-mails já enviados pra ela (email_envios, opcional — quem chamar sem
 * passar `emailsLead` só perde essa fatia do score, não quebra).
 */
function _eventos(lead, emailsLead) {
  const comp = lead.comportamento || {};
  const eventos = [];

  const visualizados = comp.imoveisVisualizados || [];
  visualizados.forEach(v => {
    if (!v || !v.em) return;
    const bonusTempo = Math.min((v.duracao || 0) * PONTOS.tempoPorSegundo, PONTOS.tempoCapPorEvento);
    eventos.push({ tipo: 'visualizacao', pontosBase: PONTOS.visualizacao + bonusTempo, em: v.em, imovel: v });
  });

  // Voltou a ver o MESMO imóvel 2x+ (mesmo critério do sinal 29 do Radar do
  // Corretor) — bônus extra separado, usando a visualização mais recente
  // desse imóvel repetido como referência de tempo.
  const contagemPorImovel = {};
  visualizados.forEach(v => { if (v && v.id) contagemPorImovel[v.id] = (contagemPorImovel[v.id] || 0) + 1; });
  Object.keys(contagemPorImovel).forEach(imId => {
    if (contagemPorImovel[imId] < 2) return;
    const ocorrencias = visualizados.filter(v => v.id === imId).sort((a, b) => new Date(b.em) - new Date(a.em));
    eventos.push({
      tipo: 'voltouVerMesmoImovel',
      pontosBase: PONTOS.voltouVerMesmoImovel,
      em: ocorrencias[0].em,
      imovel: ocorrencias[0],
      vezes: contagemPorImovel[imId],
    });
  });

  (comp.imoveisSalvos || []).forEach(s => {
    if (!s || !s.em) return;
    eventos.push({ tipo: 'salvou', pontosBase: PONTOS.salvou, em: s.em, imovel: s });
  });

  (comp.imoveisCompartilhados || []).forEach(c => {
    if (!c || !c.em) return;
    eventos.push({ tipo: 'compartilhou', pontosBase: PONTOS.compartilhou, em: c.em, imovel: c });
  });

  // cliquesContato/mapaAcessado/vitrineVistas são contadores, sem timestamp
  // por ocorrência — usa ultimaAtividade como referência de tempo (só é
  // impreciso se a última atividade registrada tiver sido de outro tipo,
  // aceitável pra v1; dá pra evoluir gravando timestamp por clique depois).
  if ((comp.cliquesContato || 0) > 0 && comp.ultimaAtividade) {
    eventos.push({ tipo: 'cliqueContato', pontosBase: PONTOS.cliqueContato, em: comp.ultimaAtividade });
  }
  if ((comp.vitrineVistas || 0) > 0 && (lead.vitrineVisualizadaEm || comp.ultimaAtividade)) {
    eventos.push({ tipo: 'vitrineVista', pontosBase: PONTOS.vitrineVista, em: lead.vitrineVisualizadaEm || comp.ultimaAtividade });
  }
  if ((comp.mapaAcessado || 0) > 0 && comp.ultimaAtividade) {
    eventos.push({ tipo: 'mapaAberto', pontosBase: PONTOS.mapaAberto, em: comp.ultimaAtividade });
  }

  // Navegou por vários imóveis na vitrine (scroll ativo pelos cards) — 1
  // entrada por sessão de navegação (evento 'navegou_imoveis', ver
  // cerebro/motor-intencao.js), com bônus proporcional a quantos imóveis
  // distintos passaram pela tela.
  (comp.navegacoesImoveis || []).forEach(n => {
    if (!n || !n.em) return;
    const bonus = Math.min(Math.max((n.qtd || 0) - 2, 0) * PONTOS.navegouBonusPorImovel, PONTOS.navegouBonusCap);
    eventos.push({ tipo: 'navegouImoveis', pontosBase: PONTOS.navegouImoveis + bonus, em: n.em, qtd: n.qtd });
  });

  (lead.mensagens || []).filter(m => m && m.de === 'cliente' && m.em).forEach(m => {
    eventos.push({ tipo: 'mensagemWhatsapp', pontosBase: PONTOS.mensagemWhatsapp, em: m.em });
  });

  (emailsLead || []).forEach(e => {
    if (e.clicado_em) eventos.push({ tipo: 'emailClicado', pontosBase: PONTOS.emailClicado, em: e.clicado_em, assunto: e.assunto });
    else if (e.aberto_em) eventos.push({ tipo: 'emailAberto', pontosBase: PONTOS.emailAberto, em: e.aberto_em, assunto: e.assunto });
  });

  return eventos.filter(e => e.em);
}

/**
 * calcularPropensao(lead, emailsLead?) -> { score, tier, motivo, motivoTipo,
 * tempoRelativo, imovel, atualizadoEm }
 *
 * score: 0-100. tier: 'alta' (>=60) | 'media' (30-59) | 'baixa' (<30).
 * motivo: frase pronta pro corretor entender de cara ("Voltou a ver o mesmo
 * imóvel 3x · há 6 min"). Baseado no evento de MAIOR contribuição pontual
 * (pontosBase × peso de recência), não necessariamente o mais recente —
 * um compartilhamento de 2h atrás pode valer mais que uma visualização de
 * 5min atrás.
 */
function calcularPropensao(lead, emailsLead) {
  const eventos = _eventos(lead, emailsLead);
  if (!eventos.length) {
    return { score: 0, tier: 'baixa', motivo: null, motivoTipo: null, tempoRelativo: null, imovel: null, atualizadoEm: null };
  }

  const porTipo = {};
  let melhorEvento = null;
  let melhorContribuicao = -1;

  eventos.forEach(ev => {
    const min = _minutosDesde(ev.em);
    const peso = _pesoRecencia(min * 60000);
    const contribuicao = ev.pontosBase * peso;
    porTipo[ev.tipo] = (porTipo[ev.tipo] || 0) + contribuicao;
    if (contribuicao > melhorContribuicao) {
      melhorContribuicao = contribuicao;
      melhorEvento = ev;
    }
  });

  let score = 0;
  Object.keys(porTipo).forEach(tipo => {
    const teto = TETOS[tipo];
    score += teto ? Math.min(porTipo[tipo], teto) : porTipo[tipo];
  });
  score = Math.max(0, Math.min(100, Math.round(score)));

  const tier = score >= 60 ? 'alta' : (score >= 30 ? 'media' : 'baixa');

  return {
    score,
    tier,
    motivo: melhorEvento ? _fraseMotivo(melhorEvento) : null,
    motivoTipo: melhorEvento ? melhorEvento.tipo : null,
    motivoImovel: melhorEvento ? melhorEvento.imovel : null,
    motivoVezes: melhorEvento ? melhorEvento.vezes : null,
    motivoAssunto: melhorEvento ? melhorEvento.assunto : null,
    tempoRelativo: melhorEvento ? tempoRelativo(melhorEvento.em) : null,
    atualizadoEm: melhorEvento ? melhorEvento.em : null,
  };
}

function _tituloImovel(imovel) {
  if (!imovel) return 'um imóvel';
  const tipo = imovel.tipo || 'imóvel';
  return imovel.bairro ? (tipo + ' em ' + imovel.bairro) : tipo;
}

function _fraseMotivo(ev) {
  switch (ev.tipo) {
    case 'voltouVerMesmoImovel':
      return 'Voltou a ver ' + _tituloImovel(ev.imovel) + ' ' + (ev.vezes || 2) + 'x';
    case 'visualizacao':
      return 'Viu ' + _tituloImovel(ev.imovel);
    case 'salvou':
      return 'Curtiu ' + _tituloImovel(ev.imovel);
    case 'compartilhou':
      return 'Compartilhou ' + _tituloImovel(ev.imovel);
    case 'cliqueContato':
      return 'Clicou em falar com o corretor';
    case 'emailClicado':
      return 'Clicou no e-mail' + (ev.assunto ? (' "' + ev.assunto + '"') : '');
    case 'emailAberto':
      return 'Abriu o e-mail' + (ev.assunto ? (' "' + ev.assunto + '"') : '');
    case 'mensagemWhatsapp':
      return 'Mandou mensagem no WhatsApp';
    case 'vitrineVista':
      return 'Viu a vitrine de imóveis';
    case 'navegouImoveis':
      return 'Navegou por ' + (ev.qtd || 'vários') + ' imóveis na vitrine';
    case 'mapaAberto':
      return 'Abriu o mapa da região';
    default:
      return 'Teve atividade recente';
  }
}

/**
 * gerarMensagem(propensao, { leadNome, corretorNome, link })
 *
 * Monta a mensagem de WhatsApp/e-mail já segmentada pelo motivo exato que
 * colocou a lead no painel "Fale agora" — pedido explícito do Renato
 * (ago/2026): "quando ele for conversar com o cliente já tinha que estar
 * com a mensagem pronta... o cliente já saber do que que ele está falando".
 * Sempre termina puxando pra solicitar visita (objetivo fixo do painel).
 * `link` é o link da vitrine/oferta (/cliente/oferta/:leadId?userId=...),
 * mesmo padrão já usado no resto da plataforma.
 */
function gerarMensagem(propensao, { leadNome, corretorNome, link }) {
  const nome = leadNome || 'tudo bem';
  const corretor = corretorNome || 'seu corretor';
  const saudacao = 'Oi' + (leadNome ? (' ' + _primeiroNome(leadNome)) : '') + '! Aqui é ' + (corretorNome ? ('o ' + _primeiroNome(corretor)) : 'seu corretor') + ', da MatchImóveis 👋 ';
  const cta = ' Quer que eu te mande mais detalhes ou já vemos um horário pra visita?';
  const linkTxt = link ? ('\n\n' + link) : '';

  let corpo;
  const im = propensao && propensao.motivoImovel;
  switch (propensao && propensao.motivoTipo) {
    case 'voltouVerMesmoImovel':
      corpo = 'Vi que você deu uma nova olhada em ' + _tituloImovel(im) + ' agora há pouco.' + cta;
      break;
    case 'visualizacao':
      corpo = 'Vi que você esteve vendo ' + _tituloImovel(im) + '.' + cta;
      break;
    case 'salvou':
      corpo = 'Vi que você curtiu ' + _tituloImovel(im) + '! Ótima escolha.' + cta;
      break;
    case 'compartilhou':
      corpo = 'Vi que você compartilhou ' + _tituloImovel(im) + ' — sinal que gostou! Bora conversar sobre ele?' + cta;
      break;
    case 'cliqueContato':
      corpo = 'Vi que você tentou falar comigo por aqui — desculpa a demora! Como posso te ajudar?';
      break;
    case 'emailClicado':
      corpo = 'Vi que você deu uma olhada nos imóveis que te mandei por e-mail. Alguma opção chamou sua atenção?' + cta;
      break;
    case 'emailAberto':
      corpo = 'Vi que você abriu os imóveis que separei pra você. Ficou alguma dúvida?' + cta;
      break;
    case 'mensagemWhatsapp':
      corpo = 'Vi sua mensagem por aqui — segue comigo que já te respondo com calma.';
      break;
    case 'vitrineVista':
      corpo = 'Vi que você deu uma olhada na seleção de imóveis que separei pra você. O que achou?' + cta;
      break;
    case 'navegouImoveis':
      corpo = 'Vi que você deu uma olhada em vários imóveis que separei pra você.' + cta;
      break;
    case 'mapaAberto':
      corpo = 'Vi que você deu uma olhada no mapa da região. Posso te ajudar a decidir o bairro certo?' + cta;
      break;
    default:
      corpo = 'Passando aqui pra saber se posso te ajudar a encontrar o imóvel certo.' + cta;
  }

  const whatsapp = (saudacao + corpo).trim();
  const assuntoEmail = im ? ('Sobre ' + _tituloImovel(im)) : 'Separei umas opções pra você';
  const corpoEmail = (saudacao + corpo + linkTxt).trim();
  return { whatsapp, assuntoEmail, corpoEmail };
}

function _primeiroNome(nomeCompleto) {
  return String(nomeCompleto || '').trim().split(/\s+/)[0] || '';
}

const COOLDOWN_MINUTOS = 30;

/**
 * decidirDisparo(lead, propensao) -> { deveDisparar, motivoDecisao }
 *
 * Trava anti-spam do disparo automático (JOB_PROPENSAO, server.js) —
 * separada em função pura pra dar pra testar sem precisar rodar o job de
 * verdade. Lição direta do bug do enviar_vitrine (cerebro/match-core.js,
 * ago/2026) que reenviava a cada 5min pro mesmo lead: nunca basta checar
 * "ainda está quente", tem que checar "já mandei pra ESSE sinal exato" e
 * ter um cooldown geral pra nunca disparar em rajada.
 */
function decidirDisparo(lead, propensao) {
  if (!propensao || propensao.tier !== 'alta' || !propensao.atualizadoEm) {
    return { deveDisparar: false, motivoDecisao: 'nao_esta_alta' };
  }

  const ultimo = lead && lead.propensaoUltimoDisparo;
  if (ultimo && ultimo.motivoTipo === propensao.motivoTipo && ultimo.em === propensao.atualizadoEm) {
    return { deveDisparar: false, motivoDecisao: 'mesmo_sinal_ja_disparado' };
  }

  if (ultimo && ultimo.disparadoEm) {
    const minsDesde = (Date.now() - new Date(ultimo.disparadoEm).getTime()) / 60000;
    if (minsDesde < COOLDOWN_MINUTOS) {
      return { deveDisparar: false, motivoDecisao: 'cooldown_ativo' };
    }
  }

  const temVisitaAtiva = lead && (lead.visitaSolicitada || (lead.visitaStatus && !['cancelada', 'recusada'].includes(lead.visitaStatus || '')));
  if (temVisitaAtiva) {
    return { deveDisparar: false, motivoDecisao: 'ja_tem_visita_ativa' };
  }

  return { deveDisparar: true, motivoDecisao: 'ok' };
}

module.exports = { calcularPropensao, tempoRelativo, gerarMensagem, decidirDisparo, PONTOS };
