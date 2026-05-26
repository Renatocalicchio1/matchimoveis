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
function matchPorMapa(lead, imoveis) {
  const mapa = lead.mapaIntencao;
  if (!mapa || !imoveis || !imoveis.length) return [];

  const resultados = [];

  for (const imovel of imoveis) {
    if (imovel.status === 'inativo') continue;

    let scoreTotal = 0;
    let pesoTotal  = 0;
    const motivos  = [];

    // ── TIPO DE IMÓVEL ──────────────────────────────────────────
    // Considera todos os tipos com score, não só o principal
    if (mapa.tipo_imovel && mapa.tipo_imovel.length > 0) {
      const tipoImovel = _normalizar(imovel.tipo || imovel.tipoImovel || '');
      let melhorTipo = 0;
      for (const sinal of mapa.tipo_imovel) {
        const tipoLead = _normalizar(sinal.valor || '');
        const scoreEfetivo = sinal.scoreEfetivo ?? sinal.score;
        if (_tiposCompativeis(tipoLead, tipoImovel)) {
          // Match exato vale mais; match por categoria (ex: "apartamento"+"cobertura") vale menos
          const fator = tipoLead === tipoImovel ? 1.0 : 0.6;
          melhorTipo = Math.max(melhorTipo, scoreEfetivo * fator);
        }
      }
      if (melhorTipo > 0) {
        scoreTotal += melhorTipo * 2.0; // peso 2x — tipo é crítico
        pesoTotal  += 200;
        motivos.push(`tipo compatível (score ${Math.round(melhorTipo)})`);
      } else {
        // Penalidade leve se tipo não bate — pode ser lead explorando
        scoreTotal += 0;
        pesoTotal  += 200;
      }
    }

    // ── BAIRRO ──────────────────────────────────────────────────
    if (mapa.bairro && mapa.bairro.length > 0) {
      const bairroImovel = _normalizar(imovel.bairro || '');
      let melhorBairro = 0;
      for (const sinal of mapa.bairro) {
        const bairroLead = _normalizar(sinal.valor || '');
        const scoreEfetivo = sinal.scoreEfetivo ?? sinal.score;
        if (bairroLead === bairroImovel) {
          melhorBairro = Math.max(melhorBairro, scoreEfetivo);
        } else if (_bairrosProximos(bairroLead, bairroImovel)) {
          melhorBairro = Math.max(melhorBairro, scoreEfetivo * 0.5);
        }
      }
      if (melhorBairro > 0) {
        scoreTotal += melhorBairro * 1.5;
        pesoTotal  += 150;
        motivos.push(`bairro compatível (score ${Math.round(melhorBairro)})`);
      } else {
        pesoTotal += 150;
      }
    }

    // ── VALOR / ORÇAMENTO ────────────────────────────────────────
    if (mapa.valor && mapa.valor.length > 0) {
      const precoImovel = Number(imovel.preco || imovel.valor || 0);
      if (precoImovel > 0) {
        let melhorValor = 0;
        for (const sinal of mapa.valor) {
          const scoreEfetivo = sinal.scoreEfetivo ?? sinal.score;
          const vmin = sinal.valor?.min || 0;
          const vmax = sinal.valor?.max || Infinity;
          // Dentro do range: full score; até 20% acima: parcial; acima: penalidade
          if (precoImovel >= vmin && precoImovel <= vmax) {
            melhorValor = Math.max(melhorValor, scoreEfetivo);
          } else if (precoImovel <= vmax * 1.20) {
            melhorValor = Math.max(melhorValor, scoreEfetivo * 0.5);
          } else if (precoImovel < vmin * 0.70) {
            // Imóvel muito barato em relação ao budget — pode ser aspiracional invertido
            melhorValor = Math.max(melhorValor, scoreEfetivo * 0.2);
          }
        }
        if (melhorValor > 0) {
          scoreTotal += melhorValor * 1.5;
          pesoTotal  += 150;
          motivos.push(`valor dentro do range (score ${Math.round(melhorValor)})`);
        } else {
          pesoTotal += 150;
        }
      }
    }

    // ── QUARTOS ─────────────────────────────────────────────────
    if (mapa.quartos && mapa.quartos.length > 0) {
      const qtosImovel = Number(imovel.quartos || imovel.dormitorios || 0);
      let melhorQtos = 0;
      for (const sinal of mapa.quartos) {
        const scoreEfetivo = sinal.scoreEfetivo ?? sinal.score;
        const qtosLead = Number(sinal.valor || 0);
        if (qtosLead === qtosImovel) {
          melhorQtos = Math.max(melhorQtos, scoreEfetivo);
        } else if (Math.abs(qtosLead - qtosImovel) === 1) {
          // 1 quarto de diferença: parcial
          melhorQtos = Math.max(melhorQtos, scoreEfetivo * 0.6);
        }
      }
      if (melhorQtos > 0) {
        scoreTotal += melhorQtos;
        pesoTotal  += 100;
        motivos.push(`quartos compatível (score ${Math.round(melhorQtos)})`);
      } else {
        pesoTotal += 100;
      }
    }

    // ── URGÊNCIA — boost para leads quentes ─────────────────────
    const urgencia = mapa.urgencia || 0;
    if (urgencia > 50) {
      scoreTotal += urgencia * 0.3;
      pesoTotal  += 30;
      motivos.push(`lead urgente (${urgencia})`);
    }

    // ── PERFIS OCULTOS — boost se imovel bate com intenção oculta
    const ocultos = lead.intencoesOcultas || {};
    if (ocultos.aspiracional && _ehPremium(imovel)) {
      scoreTotal += 20;
      pesoTotal  += 20;
      motivos.push('interesse aspiracional detectado');
    }

    // ── SCORE FINAL ─────────────────────────────────────────────
    const scoreMatch = pesoTotal > 0 ? Math.round((scoreTotal / pesoTotal) * 100) : 0;

    if (scoreMatch > 15) { // threshold mínimo
      resultados.push({ imovel, scoreMatch, motivos });
    }
  }

  // Ordena por scoreMatch desc, retorna top 10
  resultados.sort((a, b) => b.scoreMatch - a.scoreMatch);
  return resultados.slice(0, 10);
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
