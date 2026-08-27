/**
 * services/distribuicaoAreaAtuacao.js
 *
 * Job: distribui interessados de `interessados_portal` (planilha que o
 * admin importa em /admin/interesados — é a única fonte dessa tabela, não
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
 * ago/2026 (2ª mudança): volume de interessados cresceu muito — pedido
 * explícito do Renato: "5 leads pra cada conta, pelo menos 3x no dia". Antes
 * rodava 1x/dia (4h) com teto DIÁRIO de 3 (bairro) ou 2 (cidade, em lotes de
 * 2). Agora roda em 3+ horários espalhados no dia (HORARIOS_RODADA_BR) e
 * cada RODADA entrega até TETO_POR_RODADA (2) pra cada conta elegível —
 * teto por rodada, não mais por dia, então uma conta pode chegar a
 * HORARIOS_RODADA_BR.length × 2 no dia (hoje: 3×2=6). Bairro e cidade
 * unificados no mesmo teto (antes eram números diferentes, 3 e 2).
 * ago/2026 (3ª mudança): pedido explícito do Renato pra baixar de 5 pra 2
 * leads por rodada ("vamos baixar para duas leads por distribuição") —
 * TETO_POR_RODADA 5 → 2, cadência de 3x/dia mantida.
 *
 * Regras (definidas com o Renato, ago/2026):
 * - Só interessados com até 7 dias (hoje - 7 dias).
 * - Conta com bairro cadastrado: prioridade — recebe lead nova que bater o
 *   bairro dela, até TETO_POR_RODADA por rodada (além do teto de sempre:
 *   máx 2 contas/lead).
 * - Conta só com estado+cidade (sem bairro): recebe em lotes de LOTE_CIDADE
 *   (2) — dá 2 pra cada conta elegível da cidade; se sobrar interessado sem
 *   dono depois disso, dá mais 2 pra cada de novo, repetindo até esgotar o
 *   estoque da rodada daquela cidade (ou faltar crédito) — até
 *   TETO_POR_RODADA por rodada.
 * - Mesmo interessado nunca vai pra mais de 2 contas no total (bairro + cidade
 *   somados), somando TODAS as rodadas já rodadas (não reseta por rodada).
 * - Sempre cobra em créditos (nova_lead, mesmo custo de qualquer lead nova).
 * - Aviso por email: 1 só por corretor por rodada, com o TOTAL recebido
 *   nessa rodada (ex: "Você recebeu 5 leads novas") — cada lead é criada com
 *   `_lote:true` de propósito, pra NÃO disparar o alerta individual de
 *   services/salvarLead.js (senão viraria 1 email por lead, até 5 separados
 *   na mesma rodada).
 *
 * Idempotente: id da lead é sempre 'AREA-' + interessadoId + '-' + userId
 * (salvarLead faz UPSERT) — uma conta nunca recebe o mesmo interessado 2x,
 * mesmo rodando o job de novo. O teto "2 contas por lead" é sempre
 * recalculado a partir das leads 'AREA-%' que já existem em `leads`, não de
 * um contador em memória — não depende de o job ter rodado sem interrupção.
 * Já o teto de TETO_POR_RODADA é por invocação (reseta a cada rodada de
 * propósito, é o mecanismo que permite as 3+ entregas do dia).
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

// Teto POR RODADA por conta — igual pros dois tiers (bairro e cidade), pedido
// do Renato (ago/2026: "5 leads pra cada conta, pelo menos 3x no dia").
// Não é mais diário: reseta a cada invocação de distribuirLeadsPorArea(), é
// o próprio agendamento (HORARIOS_RODADA_BR, 3+ vezes/dia) que soma o volume
// do dia. Uma conta nunca entra nos dois tiers pra uma MESMA cidade (é
// bairro OU cidade, filtro c.bairros.size abaixo), então um único contador
// por conta serve pros dois tiers, sem precisar marcar de qual tier veio.
// Máximo de contas que recebem a mesma lead (esse sim é por SEMPRE, não por
// rodada — ver _mapaJaAtribuidos): 2 (bairro + cidade somados).
const TETO_POR_RODADA = 2;
const MAX_CONTAS_POR_LEAD = 2;

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
  // Teto é POR RODADA agora (não mais por dia) — cada chamada de
  // distribuirLeadsPorArea() é 1 rodada, contador começa zerado sempre.
  const recebidoNaRodada = {};

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
    // de TETO_POR_RODADA (2) por conta nessa rodada, além do teto de
    // MAX_CONTAS_POR_LEAD (2) contas/lead e do saldo do corretor.
    for (const it of lista) {
      const bairroN = _norm(it.bairro);
      if (!bairroN) continue;
      const jaTem = jaAtribuidos[it.id] || (jaAtribuidos[it.id] = new Set());
      for (const c of candidatosBairro) {
        if (jaTem.size >= MAX_CONTAS_POR_LEAD) break;
        if (jaTem.has(c.userId) || !c.bairros.has(bairroN)) continue;
        if (saldoRestante[c.userId] < custoLead) continue;
        if ((recebidoNaRodada[c.userId] || 0) >= TETO_POR_RODADA) continue;
        jaTem.add(c.userId);
        saldoRestante[c.userId] -= custoLead;
        recebidoNaRodada[c.userId] = (recebidoNaRodada[c.userId] || 0) + 1;
        fila.push({ it, userId: c.userId });
      }
    }

    // Tier cidade — rodízio em lotes de LOTE_CIDADE por corretor, repetindo
    // passadas enquanto alguém ainda receber algo (evita loop infinito quando
    // ninguém mais pode receber — sem saldo, ou interessados todos com
    // MAX_CONTAS_POR_LEAD contas, ou já recebidos por todo mundo, ou teto
    // de TETO_POR_RODADA (2) dessa rodada batido).
    if (candidatosCidade.length) {
      let mudouAlgumaCoisa = true;
      while (mudouAlgumaCoisa) {
        mudouAlgumaCoisa = false;
        const recebidoNestaPassada = {};
        for (const c of candidatosCidade) recebidoNestaPassada[c.userId] = 0;
        for (const it of lista) {
          const jaTem = jaAtribuidos[it.id] || (jaAtribuidos[it.id] = new Set());
          if (jaTem.size >= MAX_CONTAS_POR_LEAD) continue;
          for (const c of candidatosCidade) {
            if (jaTem.size >= MAX_CONTAS_POR_LEAD) break;
            if (recebidoNestaPassada[c.userId] >= LOTE_CIDADE) continue;
            if (jaTem.has(c.userId)) continue;
            if (saldoRestante[c.userId] < custoLead) continue;
            if ((recebidoNaRodada[c.userId] || 0) >= TETO_POR_RODADA) continue;
            jaTem.add(c.userId);
            recebidoNestaPassada[c.userId]++;
            recebidoNaRodada[c.userId] = (recebidoNaRodada[c.userId] || 0) + 1;
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
  const criadasPorUsuario = {}; // userId -> quantas recebeu NESSA rodada, pro aviso em lote abaixo

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
      criadasPorUsuario[userId] = (criadasPorUsuario[userId] || 0) + 1;
    } catch (e) { console.error('[distribuicaoAreaAtuacao] erro ao entregar', id, e.message); }
  }

  console.log('[distribuicaoAreaAtuacao] rodada concluída —', criadas, 'lead(s) entregue(s) em', fila.length, 'tentativa(s)');

  // Aviso por email — 1 email por corretor com o TOTAL que ele recebeu
  // NESSA rodada (não 1 email por lead — `lead._lote:true` acima já pula de
  // propósito o alerta individual de services/salvarLead.js, senão virariam
  // até 5 emails separados numa rodada só). Pedido do Renato (ago/2026):
  // "legal dizer quantas leads novas recebeu".
  if (Object.keys(criadasPorUsuario).length) {
    try {
      const { rows: usuariosEmail } = await query(
        `SELECT codigo_usuario, email FROM usuarios WHERE codigo_usuario = ANY($1) AND email IS NOT NULL AND email != ''`,
        [Object.keys(criadasPorUsuario)]
      );
      const { enviarEmail } = require('./email');
      for (const u of usuariosEmail) {
        const total = criadasPorUsuario[u.codigo_usuario];
        if (!total) continue;
        const plural = total === 1 ? 'lead nova' : 'leads novas';
        enviarEmail({
          para: u.email,
          assunto: `🔔 Você recebeu ${total} ${plural} — MatchImóveis`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><h2 style="color:#FF385C">🔔 ${total} ${plural}!</h2><p>Chegaram ${total} ${plural} pra você agora, distribuídas conforme sua área de atuação.</p><a href="https://matchimoveis.ia.br/app/leads" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Ver leads →</a></div>`,
          texto: `Você recebeu ${total} ${plural} | https://matchimoveis.ia.br/app/leads`,
          tipo: 'nova_lead_lote_area_atuacao',
          botaoTexto: 'Ver leads →',
          userId: u.codigo_usuario
        }).catch(() => {});
      }
    } catch (eEmail) { console.error('[distribuicaoAreaAtuacao] erro ao enviar aviso em lote:', eEmail.message); }
  }

  return { atribuicoes: criadas };
}

// Guard de "rodou há pouco tempo" — substitui o antigo "já rodou hoje"
// (fazia sentido quando só existia 1 horário/dia). Agora com 3+ horários
// agendados por dia, o guard só precisa evitar uma rodada extra bem em cima
// da outra (ex: o fallback de boot disparando minutos depois de uma rodada
// agendada já ter rodado). INTERVALO_MINIMO_MS bem menor que o espaçamento
// real entre horários (ver HORARIOS_RODADA_BR), então nunca bloqueia uma
// rodada agendada de verdade, só duplicata acidental. Reaproveita a tabela
// job_status já criada pela distribuição de sub-admin (server.js,
// _registrarStatusJobDistribuicao).
const INTERVALO_MINIMO_MS = 60 * 60 * 1000; // 1h
async function _rodouRecentemente() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS job_status (id TEXT PRIMARY KEY, atualizado_em TIMESTAMP DEFAULT NOW(), detalhe TEXT)`);
    const { rows } = await query(`SELECT atualizado_em FROM job_status WHERE id='distribuicao_area_atuacao'`);
    if (!rows.length) return false;
    return (Date.now() - new Date(rows[0].atualizado_em).getTime()) < INTERVALO_MINIMO_MS;
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

async function rodarComGuard() {
  if (await _rodouRecentemente()) { console.log('[distribuicaoAreaAtuacao] rodou há menos de 1h, pulando (evita duplicata)'); return; }
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

// 3 horários espalhados no dia (pedido do Renato, ago/2026: "pelo menos 3x
// no dia") — 6h, 12h, 18h, horário de Brasília. Fora da janela de jobs de
// madrugada (créditos 2h-2h40, xmlScheduler 3h, recarga de cache
// 3h15-3h50), espaçados o suficiente (6h) pra nunca colidir com o guard de
// INTERVALO_MINIMO_MS (1h).
const HORARIOS_RODADA_BR = [6, 12, 18];
function iniciarDistribuicaoAreaAtuacao() {
  console.log('[distribuicaoAreaAtuacao] ⏱️ ' + HORARIOS_RODADA_BR.length + ' rodadas/dia — ' + HORARIOS_RODADA_BR.join('h, ') + 'h (horário de Brasília)');
  const _agora = new Date();
  for (const hh of HORARIOS_RODADA_BR) {
    setTimeout(() => {
      rodarComGuard().catch(e => console.error('[distribuicaoAreaAtuacao] erro na rodada:', e.message));
      setInterval(() => {
        rodarComGuard().catch(e => console.error('[distribuicaoAreaAtuacao] erro na rodada:', e.message));
      }, 24 * 60 * 60 * 1000);
    }, _proximoHorarioBR(hh, 0, _agora) - _agora);
  }
  // Fallback de boot — se o servidor ficou fora do ar durante alguma janela
  // agendada, garante pelo menos 1 rodada ao subir. O guard de "rodou há
  // menos de 1h" evita duplicar se uma rodada agendada acabou de rodar.
  setTimeout(() => {
    rodarComGuard().catch(e => console.error('[distribuicaoAreaAtuacao] erro na rodada:', e.message));
  }, 40000);
}

module.exports = { iniciarDistribuicaoAreaAtuacao, distribuirLeadsPorArea, rodarComGuard };
