/**
 * motor-intencao.js
 * Motor Dinâmico de Intenção Imobiliária — Fases 2, 3, 4 e 5
 *
 * Fase 2 — matchPorMapa()         : match ponderado por scores do mapaIntencao
 * Fase 3 — inferirOcultos()       : detecta intenções que o lead não disse explicitamente
 * Fase 4 — registrarComportamento(): rastreia ações na plataforma (visualizações, favoritos...)
 * Fase 5 — recomendar()           : recommendation engine proativo (Netflix/Spotify style)
 *
 * Filosofia: comportamento vale mais que texto.
 * Nunca substitui o perfilIA — trabalha junto com o mapaIntencao.
 */

'use strict';

// ════════════════════════════════════════════════════════════════
// FASE 2 — MATCH PONDERADO POR MAPA DE INTENÇÃO
// ════════════════════════════════════════════════════════════════

/**
 * matchPorMapa(lead, imoveis)
 *
 * Em vez de usar perfilIA fixo, usa o mapaIntencao com scores ponderados.
 * Cada sinal tem score (0-100), confiança e decay aplicado.
 * O match é fuzzy — não precisa bater exato; pondera compatibilidade.
 *
 * Retorna array de { imovel, scoreMatch, motivos } ordenado por scoreMatch desc.
 */

const _ESTADOS_SIGLA = {
  'acre':'ac','alagoas':'al','amapa':'ap','amazonas':'am','bahia':'ba',
  'ceara':'ce','distrito federal':'df','espirito santo':'es','goias':'go',
  'maranhao':'ma','mato grosso':'mt','mato grosso do sul':'ms',
  'minas gerais':'mg','para':'pa','paraiba':'pb','parana':'pr',
  'pernambuco':'pe','piaui':'pi','rio de janeiro':'rj',
  'rio grande do norte':'rn','rio grande do sul':'rs','rondonia':'ro',
  'roraima':'rr','santa catarina':'sc','sao paulo':'sp','sergipe':'se',
  'tocantins':'to'
};
function _normalizarEstado(s) {
  const n = _normalizar(s);
  return _ESTADOS_SIGLA[n] || n;
}


function matchPorMapa(lead, imoveis) {
  const mapa = lead.mapaIntencao;
  if (!mapa || !imoveis || !imoveis.length) return [];

  // Extrai critérios mínimos do mapa
  const leadTransacao = _normalizar(mapa.transacao?.[0]?.valor || '');
  const leadTipo      = _normalizar(mapa.tipo_imovel?.[0]?.valor || '');
  const leadEstado    = _normalizarEstado(mapa.estado?.[0]?.valor || mapa.cidade?.[0]?.estado || '');
  const leadCidade    = _normalizar(mapa.cidade?.[0]?.valor || '');
  const leadBairro    = _normalizar(mapa.bairro?.[0]?.valor || '');
  const leadValorMax  = mapa.valor?.[0]?.valor?.max || 0;
  const leadValorMin  = mapa.valor?.[0]?.valor?.min || 0;

  const resultados = [];

  for (const im of imoveis) {
    if (im.status === 'inativo') continue;

    // Normaliza campos do imóvel
    const imovel = {
      id:          im.id,
      id_externo:  im.id_externo || im.id_interno || im.codigo_imovel,
      tipo:        im.tipo || im.categoria || '',
      bairro:      _normalizar(im.bairro || ''),
      cidade:      _normalizar(im.cidade || ''),
      estado:      _normalizarEstado(im.estado || ''),
      preco:       Number(im.valor_imovel || im.valor || 0),
      quartos:     Number(im.quartos || im.dormitorios || 0),
      suites:      Number(im.suites || 0),
      vagas:       Number(im.vagas || 0),
      banheiros:   Number(im.banheiros || 0),
      area:        Number(im.area_m2 || im.area_construida || im.area_total || 0),
      transacao:   _normalizar(im.transacao || ''),
      financiamento: im.aceita_financiamento || false,
      diferenciais: im.diferenciais || [],
      fotos:       im.fotos || [],
      _raw:        im
    };

    // ════════════════════════════════════════════════════════
    // CRITÉRIO MÍNIMO OBRIGATÓRIO — todos devem bater
    // ════════════════════════════════════════════════════════
    const motivos = [];
    let eliminado = false;
    let motEliminado = '';

    // 1. TRANSAÇÃO
    if (leadTransacao) {
      const bate = (leadTransacao.includes('vend') || leadTransacao.includes('compr')) && (imovel.transacao.includes('vend') || imovel.transacao.includes('compr'))
        || leadTransacao.includes('alug') && imovel.transacao.includes('alug');
      if (!bate) { eliminado = true; motEliminado = 'transacao'; }
    }

    // 2. TIPO
    if (!eliminado && leadTipo) {
      if (!_tiposCompativeis(leadTipo, _normalizar(imovel.tipo))) {
        eliminado = true; motEliminado = 'tipo';
      }
    }

    // 3. ESTADO
    if (!eliminado && leadEstado) {
      if (imovel.estado !== leadEstado) {
        eliminado = true; motEliminado = 'estado';
      }
    }

    // 4. CIDADE
    if (!eliminado && leadCidade) {
      if (imovel.cidade !== leadCidade) {
        eliminado = true; motEliminado = 'cidade';
      }
    }

    // 5. BAIRRO
    if (!eliminado && leadBairro) {
      if (imovel.bairro !== leadBairro && !_bairrosProximos(imovel.bairro, leadBairro)) {
        eliminado = true; motEliminado = 'bairro';
      }
    }

    // 6. VALOR ±25%
    if (!eliminado && leadValorMax > 0 && imovel.preco > 0) {
      const vmin = leadValorMin > 0 ? leadValorMin * 0.75 : 0;
      const vmax = leadValorMax * 1.25;
      if (imovel.preco > vmax || (vmin > 0 && imovel.preco < vmin)) {
        eliminado = true; motEliminado = 'valor';
      }
    }

    if (eliminado) continue; // imóvel eliminado

    // ════════════════════════════════════════════════════════
    // SCORING — campos extras aumentam o score
    // ════════════════════════════════════════════════════════
    let score = 60; // base para quem passou o critério mínimo

    // Transação compatível
    if (leadTransacao) { score += 10; motivos.push('transação ✓'); }

    // Tipo compatível
    if (leadTipo) {
      const exato = _normalizar(leadTipo) === _normalizar(imovel.tipo);
      score += exato ? 15 : 8;
      motivos.push(`tipo: ${imovel.tipo}`);
    }

    // Cidade compatível
    if (leadCidade) { score += 10; motivos.push(`${imovel.cidade}`); }

    // Bairro compatível
    if (leadBairro && imovel.bairro === leadBairro) { score += 20; motivos.push(`bairro: ${im.bairro}`); }
    else if (leadBairro && _bairrosProximos(imovel.bairro, leadBairro)) { score += 10; motivos.push('bairro próximo'); }

    // Valor — quanto mais próximo do ideal, maior o score
    if (leadValorMax > 0 && imovel.preco > 0) {
      const diff = Math.abs(imovel.preco - leadValorMax) / leadValorMax;
      if (diff <= 0.05)       { score += 15; motivos.push(`R$${imovel.preco.toLocaleString('pt-BR')} ✓✓`); }
      else if (diff <= 0.15)  { score += 10; motivos.push(`R$${imovel.preco.toLocaleString('pt-BR')} ✓`); }
      else                    { score += 5;  motivos.push(`R$${imovel.preco.toLocaleString('pt-BR')}`); }
    }

    // Quartos >= pedido (nunca menos)
    const leadQuartos = Number(mapa.quartos?.[0]?.valor || 0);
    if (leadQuartos > 0) {
      if (imovel.quartos < leadQuartos) continue; // elimina se tiver menos quartos
      if (imovel.quartos === leadQuartos) { score += 15; motivos.push(`${imovel.quartos} quartos ✓`); }
      else { score += 8; motivos.push(`${imovel.quartos} quartos (pediu ${leadQuartos}+)`); }
    }

    // Suítes >= pedido
    const leadSuites = Number(mapa.suites?.[0]?.valor || 0);
    if (leadSuites > 0 && imovel.suites >= leadSuites) {
      score += 10; motivos.push(`${imovel.suites} suítes ✓`);
    }

    // Vagas >= pedido
    const leadVagas = Number(mapa.vagas?.[0]?.valor || 0);
    if (leadVagas > 0 && imovel.vagas >= leadVagas) {
      score += 10; motivos.push(`${imovel.vagas} vagas ✓`);
    }

    // Área >= pedido (tolerância -10%)
    const leadArea = mapa.area?.[0]?.valor?.min || 0;
    if (leadArea > 0 && imovel.area >= leadArea * 0.90) {
      score += 8; motivos.push(`${imovel.area}m² ✓`);
    }

    // Diferenciais compatíveis
    if (mapa.diferenciais && mapa.diferenciais.length > 0) {
      const difsIm = Array.isArray(imovel.diferenciais)
        ? imovel.diferenciais.map(d => _normalizar(String(d))) : [];
      let hits = 0;
      for (const sinal of mapa.diferenciais) {
        const dv = _normalizar(sinal.valor||'');
        if (difsIm.some(d => d.includes(dv) || dv.includes(d))) hits++;
      }
      if (hits > 0) { score += hits * 8; motivos.push(`${hits} diferenciais ✓`); }
    }

    // Urgência do lead — boost
    if ((mapa.urgencia || 0) > 50) { score += 5; }

    resultados.push({ imovel: im, scoreMatch: Math.min(score, 100), motivos });
  }

  resultados.sort((a, b) => b.scoreMatch - a.scoreMatch);
  return resultados.slice(0, 30);
}

// ════════════════════════════════════════════════════════════════
// FASE 3 — INFERÊNCIA DE INTENÇÕES OCULTAS
// ════════════════════════════════════════════════════════════════

/**
 * inferirOcultos(lead)
 *
 * Analisa contradições entre o que o lead DIZ e o que ele FAZ.
 * Retorna objeto { aspiracional, upgrade, downgrade, indeciso, multiRegiao }
 * com score de 0-100 para cada padrão detectado.
 *
 * Exemplos:
 *  - Lead diz "quero barato" mas visualiza imóveis premium → aspiracional
 *  - Lead diz "3 quartos" mas salva imóveis de 2 quartos → downgrade financeiro
 *  - Lead muda de bairro frequentemente → indeciso / multi-região
 */
function inferirOcultos(lead) {
  const mapa = lead.mapaIntencao || {};
  const comportamento = lead.comportamento || {};
  const ocultos = {
    aspiracional:  { score: 0, evidencias: [] },
    upgrade:       { score: 0, evidencias: [] },
    downgrade:     { score: 0, evidencias: [] },
    indeciso:      { score: 0, evidencias: [] },
    multiRegiao:   { score: 0, evidencias: [] },
    compradorReal: { score: 0, evidencias: [] },
    locatario:     { score: 0, evidencias: [] }
  };

  // ── ASPIRACIONAL ─────────────────────────────────────────────
  // Lead declara budget baixo mas visualiza/salva imóveis premium
  const budgetDeclarado = mapa.valor?.[0]?.valor?.max || 0;
  const imoveisVisualizados = comportamento.imoveisVisualizados || [];
  const imoveisSalvos = comportamento.imoveisSalvos || [];

  if (budgetDeclarado > 0) {
    const visualizacoesPremium = imoveisVisualizados.filter(v =>
      v.preco && v.preco > budgetDeclarado * 1.30
    );
    const salvos_premium = imoveisSalvos.filter(v =>
      v.preco && v.preco > budgetDeclarado * 1.30
    );
    if (visualizacoesPremium.length >= 2) {
      ocultos.aspiracional.score += 40;
      ocultos.aspiracional.evidencias.push(`${visualizacoesPremium.length} visualizações acima do budget`);
    }
    if (salvos_premium.length >= 1) {
      ocultos.aspiracional.score += 35;
      ocultos.aspiracional.evidencias.push(`${salvos_premium.length} imóveis premium salvos`);
    }
  }

  // ── UPGRADE ─────────────────────────────────────────────────
  // Lead começou pedindo X quartos mas está visualizando mais
  const quartosDeclarados = Number(mapa.quartos?.[0]?.valor || 0);
  if (quartosDeclarados > 0) {
    const visualizacoesUpgrade = imoveisVisualizados.filter(v =>
      Number(v.quartos || 0) > quartosDeclarados
    );
    if (visualizacoesUpgrade.length >= 2) {
      ocultos.upgrade.score += 50;
      ocultos.upgrade.evidencias.push(`visualizando imóveis com ${quartosDeclarados + 1}+ quartos`);
    }
  }

  // ── DOWNGRADE FINANCEIRO ─────────────────────────────────────
  // Lead pede imóvel grande mas visualiza imóveis pequenos/baratos
  if (budgetDeclarado > 0) {
    const visualizacoesDowngrade = imoveisVisualizados.filter(v =>
      v.preco && v.preco < budgetDeclarado * 0.60
    );
    if (visualizacoesDowngrade.length >= 3) {
      ocultos.downgrade.score += 45;
      ocultos.downgrade.evidencias.push('pode estar revendo orçamento para baixo');
    }
  }

  // ── INDECISO ─────────────────────────────────────────────────
  // Muitos tipos diferentes de imóvel no mapa, baixa confiança
  const tiposComScore = (mapa.tipo_imovel || []).filter(t => t.score > 30);
  if (tiposComScore.length >= 3) {
    ocultos.indeciso.score += 40;
    ocultos.indeciso.evidencias.push(`${tiposComScore.length} tipos de imóvel com interesse relevante`);
  }
  const bairrosComScore = (mapa.bairro || []).filter(b => b.score > 30);
  if (bairrosComScore.length >= 3) {
    ocultos.indeciso.score += 30;
    ocultos.indeciso.evidencias.push(`${bairrosComScore.length} bairros com interesse`);
  }

  // ── MULTI-REGIÃO ─────────────────────────────────────────────
  if (bairrosComScore.length >= 2) {
    ocultos.multiRegiao.score += bairrosComScore.length * 20;
    ocultos.multiRegiao.evidencias.push(`interesse em ${bairrosComScore.length} regiões diferentes`);
  }

  // ── COMPRADOR REAL vs CURIOSO ─────────────────────────────────
  // Evidências de intenção séria de compra
  const mensagens = lead.mensagens || [];
  const palavrasSerias = ['preciso','urgente','decidi','já tenho entrada','minha esposa','meu marido','financiamento aprovado','quero fechar','quando posso ver'];
  const hits = palavrasSerias.filter(p =>
    mensagens.some(m => (m.texto || '').toLowerCase().includes(p))
  );
  if (hits.length >= 2) {
    ocultos.compradorReal.score += hits.length * 15;
    ocultos.compradorReal.evidencias.push(`sinais de intenção séria: ${hits.join(', ')}`);
  }

  // Clamp scores em 100
  for (const k of Object.keys(ocultos)) {
    ocultos[k].score = Math.min(100, ocultos[k].score);
  }

  return ocultos;
}

// ════════════════════════════════════════════════════════════════
// FASE 4 — RASTREAR COMPORTAMENTO NA PLATAFORMA
// ════════════════════════════════════════════════════════════════

/**
 * registrarComportamento(lead, evento)
 *
 * Registra uma ação do lead na plataforma e atualiza o mapaIntencao
 * com os sinais extraídos do comportamento.
 *
 * evento = {
 *   tipo: 'visualizou_imovel' | 'salvou_imovel' | 'compartilhou' | 'abriu_mapa' | 'clicou_contato' | 'viu_vitrine'
 *   imovel: { id, tipo, bairro, preco, quartos, area }
 *   duracao_segundos: 45   // tempo na página
 *   em: ISO timestamp
 * }
 *
 * Comportamento vale 2-3x mais que texto (ver visão do sistema).
 */
function registrarComportamento(lead, evento) {
  if (!evento || !evento.tipo) return lead;

  // Inicializa comportamento se não existe
  lead.comportamento = lead.comportamento || {
    imoveisVisualizados: [],
    imoveisSalvos: [],
    imoveisCompartilhados: [],
    mapaAcessado: 0,
    cliquesContato: 0,
    vitrineVistas: 0,
    tempoTotalSegundos: 0,
    sessoes: 0,
    ultimaAtividade: null
  };

  lead.comportamento.ultimaAtividade = evento.em || new Date().toISOString();

  const imovel = evento.imovel || {};
  const duracao = evento.duracao_segundos || 0;

  switch (evento.tipo) {

    case 'visualizou_imovel': {
      // Evita duplicata na mesma sessão (mesmo id nas últimas 10 visualizações)
      const recentes = lead.comportamento.imoveisVisualizados.slice(-10);
      const jaViu = recentes.some(v => v.id === imovel.id);
      if (!jaViu) {
        lead.comportamento.imoveisVisualizados.push({
          id: imovel.id,
          tipo: imovel.tipo,
          bairro: imovel.bairro,
          preco: imovel.preco,
          quartos: imovel.quartos,
          area: imovel.area,
          duracao,
          em: evento.em || new Date().toISOString()
        });
        // Comportamento tem peso 2x — atualiza mapa com peso elevado
        lead.mapaIntencao = _atualizarMapaPorComportamento(lead.mapaIntencao, imovel, duracao, 'visualizacao');
      }
      lead.comportamento.tempoTotalSegundos += duracao;
      break;
    }

    case 'salvou_imovel': {
      lead.comportamento.imoveisSalvos.push({
        id: imovel.id,
        tipo: imovel.tipo,
        bairro: imovel.bairro,
        preco: imovel.preco,
        quartos: imovel.quartos,
        em: evento.em || new Date().toISOString()
      });
      // Salvar = sinal fortíssimo (peso 3x)
      lead.mapaIntencao = _atualizarMapaPorComportamento(lead.mapaIntencao, imovel, duracao, 'favorito');
      break;
    }

    case 'compartilhou': {
      lead.comportamento.imoveisCompartilhados.push({
        id: imovel.id,
        preco: imovel.preco,
        em: evento.em || new Date().toISOString()
      });
      // Compartilhar = altíssima intenção
      lead.mapaIntencao = _atualizarMapaPorComportamento(lead.mapaIntencao, imovel, duracao, 'compartilhamento');
      break;
    }

    case 'abriu_mapa':
      lead.comportamento.mapaAcessado += 1;
      // Sinal de pesquisa de região — boost de urgência
      if (lead.mapaIntencao) {
        lead.mapaIntencao.urgencia = Math.min(100, (lead.mapaIntencao.urgencia || 0) + 8);
      }
      break;

    case 'clicou_contato':
      lead.comportamento.cliquesContato += 1;
      if (lead.mapaIntencao) {
        lead.mapaIntencao.urgencia = Math.min(100, (lead.mapaIntencao.urgencia || 0) + 20);
        lead.mapaIntencao.eventos = lead.mapaIntencao.eventos || [];
        lead.mapaIntencao.eventos.push({ tipo: 'clique_contato', em: new Date().toISOString() });
      }
      break;

    case 'viu_vitrine':
      lead.comportamento.vitrineVistas += 1;
      if (lead.mapaIntencao) {
        lead.mapaIntencao.urgencia = Math.min(100, (lead.mapaIntencao.urgencia || 0) + 5);
      }
      break;
  }

  // Recalcula intenções ocultas após comportamento
  lead.intencoesOcultas = inferirOcultos(lead);

  return lead;
}

// ════════════════════════════════════════════════════════════════
// FASE 5 — RECOMMENDATION ENGINE PROATIVO
// ════════════════════════════════════════════════════════════════

/**
 * recomendar(lead, imoveis, opcoes)
 *
 * Gera recomendações proativas de imóveis para o lead,
 * sem ele precisar pedir. Estilo Netflix/TikTok.
 *
 * Considera:
 *  1. matchPorMapa (scores do mapaIntencao)
 *  2. Comportamento (imóveis similares aos visualizados/salvos)
 *  3. Intenções ocultas (aspiracional → inclui 1-2 premium)
 *  4. Diversidade (não retorna 10 imóveis idênticos)
 *  5. Novidade (imóveis não vistos ainda têm boost)
 *
 * opcoes = { limite: 8, incluirPremium: true, diversidade: true }
 */
function recomendar(lead, imoveis, opcoes = {}) {
  const limite     = opcoes.limite || 8;
  const diversidade = opcoes.diversidade !== false;

  if (!imoveis || !imoveis.length) return [];

  // Imóveis já vistos pelo lead
  const idsVistos = new Set([
    ...(lead.comportamento?.imoveisVisualizados || []).map(v => v.id),
    ...(lead.comportamento?.imoveisSalvos || []).map(v => v.id),
  ]);

  // ── SCORE BASE via matchPorMapa ──────────────────────────────
  const matches = matchPorMapa(lead, imoveis);
  const scoreMap = new Map();
  for (const m of matches) {
    scoreMap.set(m.imovel.id || m.imovel._id, {
      imovel: m.imovel,
      score: m.scoreMatch,
      motivos: [...m.motivos],
      categoria: 'match_direto'
    });
  }

  // ── BOOST por similaridade comportamental ────────────────────
  // Imóveis similares (mesmo tipo/bairro/faixa de preço) aos salvos
  const salvos = lead.comportamento?.imoveisSalvos || [];
  if (salvos.length > 0) {
    for (const imovel of imoveis) {
      const id = imovel.id || imovel._id;
      if (idsVistos.has(id)) continue; // novidade tem boost
      const similar = salvos.some(s =>
        _normalizar(s.tipo || '') === _normalizar(imovel.tipo || '') &&
        _precoCompativel(s.preco, imovel.preco || imovel.valor, 0.25)
      );
      if (similar) {
        const entry = scoreMap.get(id) || { imovel, score: 0, motivos: [], categoria: 'similar' };
        entry.score += 15;
        entry.motivos.push('similar ao que você salvou');
        scoreMap.set(id, entry);
      }
    }
  }

  // ── BOOST de novidade ────────────────────────────────────────
  for (const [id, entry] of scoreMap) {
    if (!idsVistos.has(id)) {
      entry.score += 10;
      entry.motivos.push('novo para você');
    }
  }

  // ── INTENÇÕES OCULTAS — incluir 1-2 aspiracionais ───────────
  const ocultos = lead.intencoesOcultas || inferirOcultos(lead);
  if (ocultos.aspiracional?.score > 40) {
    const premium = imoveis
      .filter(im => _ehPremium(im) && !scoreMap.has(im.id || im._id))
      .slice(0, 2);
    for (const im of premium) {
      const id = im.id || im._id;
      scoreMap.set(id, {
        imovel: im,
        score: 25,
        motivos: ['pode te interessar — você visualizou imóveis similares'],
        categoria: 'aspiracional'
      });
    }
  }

  // ── DIVERSIDADE — garante variedade de tipos/bairros ─────────
  let lista = Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);

  if (diversidade) {
    const final = [];
    const tiposUsados = new Map(); // tipo → contagem
    const bairrosUsados = new Map();

    for (const entry of lista) {
      const tipo   = _normalizar(entry.imovel.tipo || '');
      const bairro = _normalizar(entry.imovel.bairro || '');
      const qtTipo   = tiposUsados.get(tipo) || 0;
      const qtBairro = bairrosUsados.get(bairro) || 0;

      // Máximo 4 do mesmo tipo, 3 do mesmo bairro
      if (qtTipo < 4 && qtBairro < 3) {
        final.push(entry);
        tiposUsados.set(tipo, qtTipo + 1);
        bairrosUsados.set(bairro, qtBairro + 1);
      }
      if (final.length >= limite) break;
    }
    lista = final;
  }

  return lista.slice(0, limite).map(entry => ({
    imovel:     entry.imovel,
    scoreMatch: entry.score,
    motivos:    entry.motivos,
    categoria:  entry.categoria,
    novidade:   !idsVistos.has(entry.imovel.id || entry.imovel._id)
  }));
}

// ════════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ════════════════════════════════════════════════════════════════

function _normalizar(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Agrupa tipos em categorias para match fuzzy
const GRUPOS_TIPO = {
  apartamento: ['apartamento','apto','flat','studio','kitnet','cobertura','duplex'],
  casa:        ['casa','sobrado','chacara','sitio','fazenda','villa'],
  comercial:   ['sala','loja','galpao','predio','escritorio','comercial'],
  terreno:     ['terreno','lote','area']
};

function _tiposCompativeis(t1, t2) {
  if (t1 === t2) return true;
  for (const grupo of Object.values(GRUPOS_TIPO)) {
    if (grupo.some(g => t1.includes(g)) && grupo.some(g => t2.includes(g))) return true;
  }
  return false;
}

// Heurística simples de bairros próximos (pode ser expandida com lista real)
function _bairrosProximos(b1, b2) {
  if (!b1 || !b2) return false;
  // Por ora: considera próximos se as 4 primeiras letras batem (ex: "kob" → kobrasol/kobrasol norte)
  return b1.substring(0, 4) === b2.substring(0, 4);
}

function _precoCompativel(preco1, preco2, tolerancia = 0.20) {
  if (!preco1 || !preco2) return false;
  const diff = Math.abs(preco1 - preco2) / Math.max(preco1, preco2);
  return diff <= tolerancia;
}

// Imóvel premium: preço alto ou tipo cobertura/penthouse
function _ehPremium(imovel) {
  const preco = Number(imovel.preco || imovel.valor || 0);
  const tipo  = _normalizar(imovel.tipo || '');
  return preco > 800000 || tipo.includes('cobertura') || tipo.includes('penthouse') || tipo.includes('villa');
}

/**
 * Atualiza o mapaIntencao com sinais extraídos de comportamento.
 * Peso 2x para visualização, 3x para favorito, 4x para compartilhamento.
 */
function _atualizarMapaPorComportamento(mapa, imovel, duracao, origemTipo) {
  if (!mapa || !imovel) return mapa;

  const { acumularSinal } = _obterAcumular();

  // Multiplicador por tipo de ação
  const mult = { visualizacao: 2.0, favorito: 3.0, compartilhamento: 4.0 }[origemTipo] || 1.0;

  // Bonus de duração (cada 30s de leitura = +5 pontos extra, máx +20)
  const bonusDuracao = Math.min(20, Math.floor((duracao || 0) / 30) * 5);

  const origem = `comportamento_${origemTipo}`;

  if (imovel.tipo) {
    mapa.tipo_imovel = mapa.tipo_imovel || [];
    acumularSinal(mapa.tipo_imovel, _normalizar(imovel.tipo), (50 + bonusDuracao) * mult, 80, origem);
  }
  if (imovel.bairro) {
    mapa.bairro = mapa.bairro || [];
    acumularSinal(mapa.bairro, _normalizar(imovel.bairro), (45 + bonusDuracao) * mult, 75, origem);
  }
  if (imovel.preco) {
    mapa.valor = mapa.valor || [];
    const faixa = {
      min: Math.round(imovel.preco * 0.80),
      max: Math.round(imovel.preco * 1.20)
    };
    acumularSinal(mapa.valor, faixa, (40 + bonusDuracao) * mult, 70, origem);
  }
  if (imovel.quartos) {
    mapa.quartos = mapa.quartos || [];
    acumularSinal(mapa.quartos, imovel.quartos, (40 + bonusDuracao) * mult, 70, origem);
  }

  mapa.ultimaAnalise = new Date().toISOString();
  return mapa;
}

// Importa acumularSinal do analisador-intencao sem criar dependência circular
function _obterAcumular() {
  try {
    return require('./analisador-intencao');
  } catch {
    // fallback inline se não encontrar
    return {
      acumularSinal: (lista, valor, score, confianca, origem) => {
        const ex = lista.find(s => String(s.valor) === String(valor));
        if (ex) {
          ex.score = Math.min(100, ex.score + score * 0.5);
          ex.confianca = Math.min(100, Math.round((ex.confianca + confianca) / 2));
          ex.ocorrencias = (ex.ocorrencias || 1) + 1;
          ex.ultimaVez = new Date().toISOString();
          ex.origens = [...new Set([...(ex.origens||[]), origem])];
        } else {
          lista.push({ valor, score: Math.min(100, score), confianca, peso: 1.0, ocorrencias: 1,
            primeiraVez: new Date().toISOString(), ultimaVez: new Date().toISOString(), origens: [origem] });
        }
        lista.sort((a, b) => b.score - a.score);
        return lista;
      }
    };
  }
}

// ════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════

module.exports = {
  // Fase 2
  matchPorMapa,
  // Fase 3
  inferirOcultos,
  // Fase 4
  registrarComportamento,
  // Fase 5
  recomendar,
  // helpers expostos para testes
  _normalizar,
  _tiposCompativeis,
  _ehPremium
};
