// Preenche retroativamente o campo quartos das leads já existentes no banco
// que vieram sem esse dado (mineração/importação/webhook de portal) —
// mesmo critério de services/inferirQuartos.js usado na importação de
// planilha: procura outra lead na mesma região (bairro, com fallback pra
// cidade) e valor parecido (±20%) que já tenha quartos, e usa a moda entre
// elas. Sem quartos, o perfil nunca vira "suficiente" (ver
// _perfilSuficiente em cerebro/match-core.js) e a lead nunca gera match.
//
// Depois de preencher, já dispara o rematch (services/matchPendentes.js)
// pras leads que acabaram de ficar com perfil completo.
//
// Rodar no Render Shell: node preencherQuartosPendentes.js
const { query } = require('./services/db');
const { inferirQuartos, semAcento, _tipoSemQuartos } = require('./services/inferirQuartos');

async function run() {
  // Pool de candidatas: leads (de qualquer corretor) que já têm quartos e
  // valor preenchidos — padrão de preço por região é um fato de mercado,
  // não é exclusivo de uma carteira.
  const { rows: comQuartos } = await query(`
    SELECT perfil_ia->>'bairro' AS bairro, perfil_ia->>'cidade' AS cidade,
           perfil_ia->>'valorMax' AS valor, perfil_ia->>'quartos' AS quartos,
           perfil_ia->>'tipo' AS tipo
    FROM leads
    WHERE COALESCE(perfil_ia->>'quartos','') != ''
      AND COALESCE(perfil_ia->>'valorMax','') != ''
  `);
  const pool = comQuartos
    .filter(r => !_tipoSemQuartos(r.tipo) && Number(r.valor) > 0 && parseInt(r.quartos, 10) > 0)
    .map(r => ({ bairro: semAcento(r.bairro || '').toLowerCase(), cidade: semAcento(r.cidade || '').toLowerCase(), valor: Number(r.valor), quartos: parseInt(r.quartos, 10) }));
  console.log(`[preencher-quartos] pool de referência: ${pool.length} leads com quartos+valor`);

  const { rows: semQuartos } = await query(`
    SELECT id, perfil_ia
    FROM leads
    WHERE COALESCE(perfil_ia->>'quartos','') = ''
      AND COALESCE(perfil_ia->>'valorMax','') != ''
      AND COALESCE(perfil_ia->>'bairro','') != ''
  `);
  console.log(`[preencher-quartos] ${semQuartos.length} leads sem quartos encontradas`);

  let preenchidas = 0, semCandidato = 0;
  for (const row of semQuartos) {
    const p = row.perfil_ia || {};
    if (_tipoSemQuartos(p.tipo)) continue;
    const inferido = inferirQuartos({ bairro: p.bairro, cidade: p.cidade, valorMax: p.valorMax }, pool);
    if (!inferido) { semCandidato++; continue; }
    try {
      await query(
        `UPDATE leads SET perfil_ia = perfil_ia || $1::jsonb, dados = dados || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ quartos: String(inferido), quartosInferido: true }), row.id]
      );
      preenchidas++;
    } catch (e) { console.error(`[preencher-quartos] erro na lead ${row.id}:`, e.message); }
  }
  console.log(`[preencher-quartos] preenchidas: ${preenchidas} | sem candidato na região: ${semCandidato}`);

  if (preenchidas > 0) {
    console.log('[preencher-quartos] rodando rematch pras leads que ficaram com perfil completo...');
    const { rodarMatchLeadsSemMatch } = require('./services/matchPendentes');
    await rodarMatchLeadsSemMatch();
  }
}

run()
  .then(() => process.exit(0))
  .catch(e => { console.error('[preencher-quartos] erro fatal:', e.message); process.exit(1); });
