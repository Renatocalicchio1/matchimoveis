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
  // Diagnóstico. Descoberto na prática (rodada de ago/2026): o campo
  // `origem` NÃO é confiável pra achar essas leads — 1279 leads com id
  // "DEMANDA-*" (formato só usado por essa entrega) apareceram todas com
  // origem='manual', não 'compra_demanda' nem 'admin_demanda'. E tentar
  // detectar "incompleta" via SQL (quartos vazio OU mapa_intencao NULL)
  // também não funcionou — alguma tentativa de rematch anterior parece já
  // ter gravado um mapa_intencao vazio-mas-não-nulo nessas leads (arrays
  // sem sinal nenhum, mas não é SQL NULL), enganando esse filtro. Por
  // isso: reprocessa TODAS as leads com id "DEMANDA-*", sem tentar
  // adivinhar quais já estão completas — reconstruir de novo é seguro e
  // idempotente (sempre substitui perfilIA+mapaIntencao do zero a partir
  // da linha original de interessados_portal, não faz merge parcial).
  const { rows: porOrigemRows } = await query(`SELECT origem, COUNT(*)::int AS total FROM leads WHERE id LIKE 'DEMANDA-%' GROUP BY origem`);
  console.log(`[preencher-perfil-demanda] por origem: ${JSON.stringify(porOrigemRows)}`);

  const { rows } = await query(`SELECT id FROM leads WHERE id LIKE 'DEMANDA-%'`);
  console.log(`[preencher-perfil-demanda] ${rows.length} lead(s) de /demanda encontradas (reprocessando todas)`);

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
