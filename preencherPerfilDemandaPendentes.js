// Preenche retroativamente o perfil completo (quartos, suítes, vagas,
// banheiros, área) + mapaIntencao das leads de /demanda entregues ANTES do
// fix de ago/2026 (ver services/buscaDemanda.js, montarPerfilEMapaDemanda)
// — essas leads foram criadas só com tipo/cidade/bairro/estado/valor, sem
// quartos e sem mapaIntencao nenhum, então NUNCA geraram nenhum match.
//
// Diferente de preencherQuartosPendentes.js (que INFERE quartos por
// estatística de região pra leads de origem desconhecida): aqui o dado
// real já existe, só precisa buscar de volta na linha original de
// interessados_portal — o próprio id da lead já carrega o id dessa linha
// ("DEMANDA-<rowId>-<userId>").
//
// Depois de corrigir o perfil, já dispara o rematch (services/matchPendentes.js)
// pras leads que acabaram de ficar com perfil completo.
//
// Rodar no Render Shell: node preencherPerfilDemandaPendentes.js
const { query } = require('./services/db');
const { atualizarLead } = require('./services/salvarLead');
const { montarPerfilEMapaDemanda } = require('./services/buscaDemanda');

async function run() {
  // Diagnóstico primeiro — ajuda a distinguir "não tem lead de /demanda
  // nenhuma ainda" de "tem, mas já tá tudo completo" de "tem, mas o filtro
  // de origem tava errado" (esse último era o bug real: só olhava
  // 'compra_demanda', mas a transferência manual do admin usa
  // 'admin_demanda' — ficava de fora).
  const { rows: totalRows } = await query(`SELECT COUNT(*)::int AS total FROM leads WHERE id LIKE 'DEMANDA-%'`);
  const { rows: porOrigemRows } = await query(`SELECT origem, COUNT(*)::int AS total FROM leads WHERE id LIKE 'DEMANDA-%' GROUP BY origem`);
  console.log(`[preencher-perfil-demanda] total de leads com id DEMANDA-*: ${totalRows[0].total}`);
  console.log(`[preencher-perfil-demanda] por origem: ${JSON.stringify(porOrigemRows)}`);

  const { rows } = await query(`
    SELECT id FROM leads
    WHERE origem IN ('compra_demanda', 'admin_demanda')
      AND (COALESCE(perfil_ia->>'quartos','') = '' OR mapa_intencao IS NULL)
  `);
  console.log(`[preencher-perfil-demanda] ${rows.length} lead(s) de /demanda com perfil incompleto`);

  let atualizadas = 0, semOrigem = 0, erros = 0;
  for (const row of rows) {
    const m = String(row.id).match(/^DEMANDA-(\d+)-(.+)$/);
    if (!m) { semOrigem++; continue; }
    const rowId = m[1];
    try {
      const { rows: origemRows } = await query('SELECT * FROM interessados_portal WHERE id=$1', [rowId]);
      const o = origemRows[0];
      if (!o) { semOrigem++; continue; } // linha original não existe mais (ex: planilha reimportada/limpa)

      const l = {
        Tipo: o.tipo || '', Transacao: String(o.transacao || '').toLowerCase().includes('alug') ? 'aluguel' : 'venda',
        Bairro: o.bairro || '', Cidade: o.cidade || '', Estado: o.estado || '',
        Quartos: o.quartos || '', Suites: o.suites || '', Vagas: o.vagas || '', Banheiros: o.banheiros || '',
        Area_max: o.area_max || '', Valor_max: o.valor_max || ''
      };
      const { perfilIA, mapaIntencao } = montarPerfilEMapaDemanda(l);
      await atualizarLead(row.id, { perfilIA, mapaIntencao });
      atualizadas++;
    } catch (e) {
      erros++;
      console.error(`[preencher-perfil-demanda] erro na lead ${row.id}:`, e.message);
    }
  }
  console.log(`[preencher-perfil-demanda] atualizadas: ${atualizadas} | sem linha de origem: ${semOrigem} | erros: ${erros}`);

  if (atualizadas > 0) {
    console.log('[preencher-perfil-demanda] rodando rematch pras leads que ficaram com perfil completo...');
    const { rodarMatchLeadsSemMatch } = require('./services/matchPendentes');
    const resumo = await rodarMatchLeadsSemMatch();
    console.log('[preencher-perfil-demanda] rematch:', JSON.stringify(resumo));
  }
}

run()
  .then(() => process.exit(0))
  .catch(e => { console.error('[preencher-perfil-demanda] erro fatal:', e.message); process.exit(1); });
