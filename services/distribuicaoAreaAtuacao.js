/**
 * services/distribuicaoAreaAtuacao.js
 *
 * Job diário: distribui interessados de `interessados_portal` (planilha que
 * o admin importa em /admin/interesados — é a única fonte dessa tabela, não
 * precisa filtro extra pra "veio de planilha") pras contas de corretor
 * conforme a área de atuação cadastrada no perfil dele (areaAtuacaoEstado/
 * Cidade/Bairros — campos que já existiam no cadastro mas nunca tinham sido
 * lidos por nenhum job até agora, ver views/app-perfil.ejs).
 *
 * ago/2026: área de atuação virou multi-cidade (areaAtuacaoCidades, array —
 * antes era areaAtuacaoCidade, 1 string só) e os bairros viraram pares
 * {cidade,bairro} (antes eram um array de bairro solto, implicitamente da
 * única cidade cadastrada). _buscarCorretoresComAreaAtuacao() lê os dois
 * formatos — contas que ainda não resalvaram o perfil depois da mudança
 * continuam funcionando no formato antigo.
 *
 * Regras (definidas com o Renato, ago/2026):
 * - Só interessados com até 7 dias (hoje - 7 dias).
 * - Conta com bairro cadastrado: prioridade — recebe lead nova que bater o
 *   bairro dela, até um teto de 3 por dia (além do teto de sempre: máx 3
 *   contas/lead).
 * - Conta só com estado+cidade (sem bairro): recebe em lotes de 2 — dá 2 pra
 *   cada conta elegível da cidade; se sobrar interessado sem dono depois
 *   disso, dá mais 2 pra cada de novo, repetindo até esgotar o estoque do
 *   dia daquela cidade (ou faltar crédito).
 * - Mesmo interessado nunca vai pra mais de 3 contas no total (bairro + cidade
 *   somados).
 * - Sempre cobra em créditos (nova_lead, mesmo custo de qualquer lead nova).
 *
 * Idempotente: id da lead é sempre 'AREA-' + interessadoId + '-' + userId
 * (salvarLead faz UPSERT) — uma conta nunca recebe o mesmo interessado 2x,
 * mesmo rodando o job de novo. O teto "3 contas por lead" e o "já recebeu
 * esse interessado" são sempre recalculados a partir das leads 'AREA-%' que
 * já existem em `leads`, não de um contador em memória — não depende de o
 * job ter rodado sem interrupção.
 */
const { query } = require('./db');

function _norm(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// interessados_portal.estado guarda o nome completo ("São Paulo", vem da
// planilha importada) enquanto areaAtuacaoEstado do perfil do corretor
// guarda a sigla ("SP", escolhida num <select> de UF) — sem converter pro
// mesmo formato, a região NUNCA batia (confirmado rodando
// check-distribuicao-area.js: todo corretor testado dava "bate? não" mesmo
// com cidade idêntica, porque "sp" ≠ "sao paulo" na chave estado+cidade).
// Mesmo mapa sigla→nome já usado em /app/parceria-quintoandar e /app/leads.
const _SIGLA_PARA_NOME_ESTADO = {'ac':'acre','al':'alagoas','ap':'amapa','am':'amazonas','ba':'bahia','ce':'ceara','df':'distrito federal','es':'espirito santo','go':'goias','ma':'maranhao','mt':'mato grosso','ms':'mato grosso do sul','mg':'minas gerais','pa':'para','pb':'paraiba','pr':'parana','pe':'pernambuco','pi':'piaui','rj':'rio de janeiro','rn':'rio grande do norte','rs':'rio grande do sul','ro':'rondonia','rr':'roraima','sc':'santa catarina','sp':'sao paulo','se':'sergipe','to':'tocantins'};
function _normEstado(s) {
  const n = _norm(s);
  return _SIGLA_PARA_NOME_ESTADO[n] || n; // sigla (2 letras) vira nome completo; nome completo passa direto
}

const CUSTO_LEAD_CHAVE = 'nova_lead';
const LOTE_CIDADE = 2;

async function _buscarInteressadosElegiveis() {
  const { rows } = await query(`
    SELECT * FROM interessados_portal
    WHERE COALESCE(data_lead, criado_em) >= NOW() - INTERVAL '7 days'
      AND estado IS NOT NULL AND estado != ''
      AND cidade IS NOT NULL AND cidade != ''
    ORDER BY COALESCE(data_lead, criado_em) ASC
  `);
  return rows;
}

// Só contas ativas com área de atuação cadastrada (estado+cidade no mínimo —
// campos ainda ficam soltos dentro de `dados` JSONB, sem coluna própria).
// Retorna uma linha por PAR corretor+cidade (achatado) — uma conta com 2
// cidades cadastradas aparece 2x aqui, uma pra cada região, o que deixa o
// resto do job (agrupado por região) igual ao de antes sem precisar mudar a
// lógica de tier/teto/saldo (que já é tudo indexado por userId em cima
// dessa lista, então repetir o userId em 2 linhas de cidades diferentes
// soma corretamente saldo/teto compartilhados entre as cidades da conta).
async function _buscarCorretoresComAreaAtuacao() {
  const { rows } = await query(`
    SELECT codigo_usuario, match_coins,
      dados->>'areaAtuacaoEstado' AS area_estado,
      dados->'areaAtuacaoCidades' AS area_cidades,
      dados->>'areaAtuacaoCidade' AS area_cidade_legado,
      dados->'areaAtuacaoBairros' AS area_bairros
    FROM usuarios
    WHERE ativo = true
      AND COALESCE(dados->>'areaAtuacaoEstado', '') != ''
      AND (
        (jsonb_typeof(dados->'areaAtuacaoCidades') = 'array' AND jsonb_array_length(dados->'areaAtuacaoCidades') > 0)
        OR COALESCE(dados->>'areaAtuacaoCidade', '') != ''
      )
  `);
  const atuacoes = [];
  for (const r of rows) {
    const estado = _normEstado(r.area_estado);
    const saldo = parseFloat(r.match_coins) || 0;
    // Cidades: formato novo (array) tem prioridade; sem isso, cai pro
    // formato antigo (1 cidade em string) — conta que não resalvou o
    // perfil depois da mudança continua entrando na distribuição.
    let cidadesBrutas = Array.isArray(r.area_cidades) ? r.area_cidades.filter(Boolean) : [];
    if (!cidadesBrutas.length && r.area_cidade_legado) cidadesBrutas = [r.area_cidade_legado];
    const cidades = [...new Set(cidadesBrutas.map(_norm).filter(Boolean))];
    if (!cidades.length) continue;

    // Bairros: formato novo é array de {cidade,bairro} (agrupa por cidade
    // normalizada); formato antigo é array de string solta, que só faz
    // sentido pra única cidade que a conta tinha cadastrada.
    const bairrosBrutos = Array.isArray(r.area_bairros) ? r.area_bairros : [];
    const bairrosPorCidade = {};
    if (bairrosBrutos.length && bairrosBrutos[0] && typeof bairrosBrutos[0] === 'object') {
      for (const p of bairrosBrutos) {
        const cid = _norm(p && p.cidade);
        const bai = _norm(p && p.bairro);
        if (!cid || !bai) continue;
        if (!bairrosPorCidade[cid]) bairrosPorCidade[cid] = new Set();
        bairrosPorCidade[cid].add(bai);
      }
    } else if (bairrosBrutos.length && cidades.length === 1) {
      bairrosPorCidade[cidades[0]] = new Set(bairrosBrutos.map(_norm).filter(Boolean));
    }

    for (const cid of cidades) {
      atuacoes.push({
        userId: r.codigo_usuario,
        saldo,
        estado,
        cidade: cid,
        bairros: bairrosPorCidade[cid] || new Set()
      });
    }
  }
  return atuacoes;
}

// 1 query só pra saber, de todo mundo que já recebeu lead dessa distribuição
// antes (id começa com 'AREA-'), qual interessado foi pra quais contas —
// evita 1 query por interessado (a tabela pode ter milhares de linhas).
async function _mapaJaAtribuidos() {
  const { rows } = await query(`SELECT id, user_id FROM leads WHERE id LIKE 'AREA-%'`);
  const mapa = {};
  for (const r of rows) {
    const m = r.id.match(/^AREA-(\d+)-/);
    if (!m) continue;
    const interessadoId = m[1];
    if (!mapa[interessadoId]) mapa[interessadoId] = new Set();
    mapa[interessadoId].add(r.user_id);
  }
  return mapa;
}

// Teto diário do nível bairro — 3 leads por conta por dia (horário de
// Brasília), decidido com o Renato (ago/2026: rule mudou de "sem teto" pra
// "3/dia" pra não uma conta só engolir a base inteira de bairro no 1º dia).
// Conta com bairro cadastrado nunca entra no nível cidade (filtro
// c.bairros.size===0 abaixo), então contar toda lead 'AREA-%' que ela já
// recebeu hoje é exatamente a contagem do nível bairro, sem precisar marcar
// de qual tier veio.
const TETO_DIARIO_BAIRRO = 3;
async function _recebidosHojeBairro() {
  const hojeSP = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const { rows } = await query(
    `SELECT user_id, COUNT(*)::int AS total FROM leads
     WHERE id LIKE 'AREA-%' AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date = $1
     GROUP BY user_id`,
    [hojeSP]
  );
  const mapa = {};
  for (const r of rows) mapa[r.user_id] = r.total;
  return mapa;
}

// Mesmo mapeamento pra Nome/Telefone/Email/Tipo/Cidade/etc (chaves
// capitalizadas) usado em services/buscaDemanda.js — montarPerfilEMapaDemanda
// espera esse formato, não o snake_case cru da tabela.
function _paraFormatoDemanda(it) {
  return {
    Nome: it.nome || 'Interessado', Telefone: it.telefone || '', Email: it.email || '',
    Tipo: it.tipo || '', Transacao: it.transacao === 'aluguel' ? 'aluguel' : 'venda',
    Bairro: it.bairro || '', Cidade: it.cidade || '', Estado: it.estado || '',
    Quartos: it.quartos || '', Suites: it.suites || '', Vagas: it.vagas || '', Banheiros: it.banheiros || '',
    Area_max: it.area_max || '', Valor_max: it.valor_max || ''
  };
}

async function distribuirLeadsPorArea() {
  const interessados = await _buscarInteressadosElegiveis();
  const corretores = await _buscarCorretoresComAreaAtuacao();
  if (!interessados.length || !corretores.length) {
    console.log('[distribuicaoAreaAtuacao] nada a fazer —', interessados.length, 'interessado(s) elegível(is),', corretores.length, 'corretor(es) com área de atuação');
    return { atribuicoes: 0 };
  }

  const jaAtribuidos = await _mapaJaAtribuidos();
  const saldoRestante = {};
  for (const c of corretores) saldoRestante[c.userId] = c.saldo;
  const recebidoHojeBairro = await _recebidosHojeBairro();

  const { CUSTO } = require('./creditos');
  const custoLead = CUSTO[CUSTO_LEAD_CHAVE] || 30;

  // Agrupa interessados por região (estado+cidade normalizados) — o rodízio
  // em lote de 2 do nível cidade só faz sentido dentro da mesma região.
  const porRegiao = new Map();
  for (const it of interessados) {
    const chave = _normEstado(it.estado) + '|' + _norm(it.cidade);
    if (!porRegiao.has(chave)) porRegiao.set(chave, []);
    porRegiao.get(chave).push(it);
  }

  const fila = []; // { it, userId } — decidido em memória, executado (salvar+cobrar) depois

  for (const [chaveRegiao, lista] of porRegiao) {
    const [estadoN, cidadeN] = chaveRegiao.split('|');
    const candidatosBairro = corretores.filter(c => c.estado === estadoN && c.cidade === cidadeN && c.bairros.size > 0);
    const candidatosCidade = corretores.filter(c => c.estado === estadoN && c.cidade === cidadeN && c.bairros.size === 0);
    if (!candidatosBairro.length && !candidatosCidade.length) continue;

    // Tier bairro — 1 passada por todos os interessados da região, com teto
    // de TETO_DIARIO_BAIRRO (3) leads/dia por conta, além do teto de 3
    // contas/lead e do saldo do corretor.
    for (const it of lista) {
      const bairroN = _norm(it.bairro);
      if (!bairroN) continue;
      const jaTem = jaAtribuidos[it.id] || (jaAtribuidos[it.id] = new Set());
      for (const c of candidatosBairro) {
        if (jaTem.size >= 3) break;
        if (jaTem.has(c.userId) || !c.bairros.has(bairroN)) continue;
        if (saldoRestante[c.userId] < custoLead) continue;
        if ((recebidoHojeBairro[c.userId] || 0) >= TETO_DIARIO_BAIRRO) continue;
        jaTem.add(c.userId);
        saldoRestante[c.userId] -= custoLead;
        recebidoHojeBairro[c.userId] = (recebidoHojeBairro[c.userId] || 0) + 1;
        fila.push({ it, userId: c.userId });
      }
    }

    // Tier cidade — rodízio em lotes de LOTE_CIDADE por corretor, repetindo
    // rodadas enquanto alguém ainda receber algo (evita loop infinito quando
    // ninguém mais pode receber — sem saldo, ou interessados todos com 3
    // contas, ou já recebidos por todo mundo).
    if (candidatosCidade.length) {
      let mudouAlgumaCoisa = true;
      while (mudouAlgumaCoisa) {
        mudouAlgumaCoisa = false;
        const recebidoNestaRodada = {};
        for (const c of candidatosCidade) recebidoNestaRodada[c.userId] = 0;
        for (const it of lista) {
          const jaTem = jaAtribuidos[it.id] || (jaAtribuidos[it.id] = new Set());
          if (jaTem.size >= 3) continue;
          for (const c of candidatosCidade) {
            if (jaTem.size >= 3) break;
            if (recebidoNestaRodada[c.userId] >= LOTE_CIDADE) continue;
            if (jaTem.has(c.userId)) continue;
            if (saldoRestante[c.userId] < custoLead) continue;
            jaTem.add(c.userId);
            recebidoNestaRodada[c.userId]++;
            saldoRestante[c.userId] -= custoLead;
            fila.push({ it, userId: c.userId });
            mudouAlgumaCoisa = true;
          }
        }
      }
    }
  }

  if (!fila.length) {
    console.log('[distribuicaoAreaAtuacao] nenhuma atribuição nova nessa rodada');
    return { atribuicoes: 0 };
  }

  // Executa: salva a lead, roda o match na hora (mesmo padrão de qualquer
  // outra entrega de interessados_portal) e só então cobra em créditos —
  // mesma ordem/tratamento de erro de services/topupPlanoLeads.js.
  const { salvarLead } = require('./salvarLead');
  const { montarPerfilEMapaDemanda } = require('./buscaDemanda');
  const { consumir } = require('./creditos');
  const matchCore = require('../cerebro/match-core');
  const semSaldo = new Set();
  let criadas = 0;

  for (const { it, userId } of fila) {
    if (semSaldo.has(userId)) continue;
    const id = 'AREA-' + it.id + '-' + userId;
    try {
      const conseguiuDebitar = await consumir(userId, CUSTO_LEAD_CHAVE);
      if (!conseguiuDebitar) { semSaldo.add(userId); continue; }

      const { perfilIA, mapaIntencao } = montarPerfilEMapaDemanda(_paraFormatoDemanda(it));
      const lead = {
        id,
        nome: it.nome || 'Interessado', telefone: it.telefone || '', whatsapp: it.telefone || '', email: it.email || '',
        user_id: userId, userId, codigoUsuario: userId,
        origem: 'area_atuacao', status: 'novo', faseFunil: 'novo', fase_funil: 'novo',
        perfilIA, mapaIntencao,
        matches: [], matchesAuto: [], matchesBase: [], mensagens: [],
        dados: { origemAreaAtuacao: true, interessadoPortalId: it.id },
        _lote: true
      };
      await salvarLead(lead);
      try {
        await matchCore.processar({ lead, mensagem: '', canal: 'area_atuacao', userId });
      } catch (eMatch) { console.error('[distribuicaoAreaAtuacao] erro ao rodar match', userId, eMatch.message); }
      criadas++;
    } catch (e) { console.error('[distribuicaoAreaAtuacao] erro ao entregar', id, e.message); }
  }

  console.log('[distribuicaoAreaAtuacao] rodada concluída —', criadas, 'lead(s) entregue(s) em', fila.length, 'tentativa(s)');
  return { atribuicoes: criadas };
}

// Guard de "já rodou hoje" — evita que o fallback de boot (pro caso do
// servidor ter ficado fora do ar na janela agendada) rode uma 2ª rodada de
// lotes de 2 no mesmo dia. Reaproveita a tabela job_status já criada pela
// distribuição de sub-admin (server.js, _registrarStatusJobDistribuicao).
async function _jaRodouHoje() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS job_status (id TEXT PRIMARY KEY, atualizado_em TIMESTAMP DEFAULT NOW(), detalhe TEXT)`);
    const { rows } = await query(`SELECT atualizado_em FROM job_status WHERE id='distribuicao_area_atuacao'`);
    if (!rows.length) return false;
    const hojeSP = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const ultimaSP = new Date(rows[0].atualizado_em).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    return hojeSP === ultimaSP;
  } catch (e) { return false; }
}
async function _registrarRodou(detalhe) {
  try {
    await query(
      `INSERT INTO job_status (id, atualizado_em, detalhe) VALUES ('distribuicao_area_atuacao', NOW(), $1)
       ON CONFLICT (id) DO UPDATE SET atualizado_em=NOW(), detalhe=$1`,
      [detalhe]
    );
  } catch (e) { console.error('[distribuicaoAreaAtuacao] erro ao registrar status:', e.message); }
}

async function rodarComGuardDiario() {
  if (await _jaRodouHoje()) { console.log('[distribuicaoAreaAtuacao] já rodou hoje, pulando'); return; }
  const r = await distribuirLeadsPorArea();
  await _registrarRodou(`${r.atribuicoes} lead(s) entregue(s)`);
}

function _proximoHorarioBR(hh, mm, agora) {
  const hojeSP = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const hhStr = String(hh).padStart(2, '0'), mmStr = String(mm).padStart(2, '0');
  let alvo = new Date(hojeSP + 'T' + hhStr + ':' + mmStr + ':00-03:00');
  if (alvo <= agora) {
    const amanhaSP = new Date(alvo.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    alvo = new Date(amanhaSP + 'T' + hhStr + ':' + mmStr + ':00-03:00');
  }
  return alvo;
}

// 4h da madrugada — janela livre entre os outros jobs de madrugada
// (créditos 2h-2h40, xmlScheduler 3h, recarga de cache 3h15-3h50).
function iniciarDistribuicaoAreaAtuacao() {
  console.log('[distribuicaoAreaAtuacao] ⏱️ job diário iniciado — 4h da madrugada (horário de Brasília)');
  const _agora = new Date();
  setTimeout(() => {
    rodarComGuardDiario().catch(e => console.error('[distribuicaoAreaAtuacao] erro na rodada:', e.message));
    setInterval(() => {
      rodarComGuardDiario().catch(e => console.error('[distribuicaoAreaAtuacao] erro na rodada:', e.message));
    }, 24 * 60 * 60 * 1000);
  }, _proximoHorarioBR(4, 0, _agora) - _agora);
  // Fallback de boot — se o servidor ficou fora do ar durante a janela das
  // 4h, isso evita pular o dia inteiro. O guard de "já rodou hoje" impede
  // rodar 2x no mesmo dia caso o processo reinicie depois das 4h.
  setTimeout(() => {
    rodarComGuardDiario().catch(e => console.error('[distribuicaoAreaAtuacao] erro na rodada:', e.message));
  }, 40000);
}

module.exports = { iniciarDistribuicaoAreaAtuacao, distribuirLeadsPorArea, rodarComGuardDiario };
