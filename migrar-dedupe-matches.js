// Migração única: zera matches_auto/matches_base quando são idênticos a matches
// (o motor de match sempre grava os 3 com o mesmo conteúdo — isso triplicava o
// tamanho de cada lead com match no banco e na memória do cache em RAM). Rodar
// uma vez manualmente: node migrar-dedupe-matches.js
'use strict';
const { query } = require('./services/db');

async function run() {
  console.log('Medindo tamanho atual da tabela leads...');
  const antes = await query(`SELECT pg_size_pretty(pg_total_relation_size('leads')) as tamanho`);
  console.log('Tamanho antes:', antes.rows[0].tamanho);

  console.log('Zerando matches_auto onde é idêntico a matches...');
  const r1 = await query(`
    UPDATE leads SET matches_auto = '[]'::jsonb
    WHERE matches_auto::text = matches::text AND matches_auto::text <> '[]'
  `);
  console.log('matches_auto zerado em', r1.rowCount, 'leads');

  console.log('Zerando matches_base onde é idêntico a matches...');
  const r2 = await query(`
    UPDATE leads SET matches_base = '[]'::jsonb
    WHERE matches_base::text = matches::text AND matches_base::text <> '[]'
  `);
  console.log('matches_base zerado em', r2.rowCount, 'leads');

  // VACUUM normal (sem FULL) — não trava a tabela com lock exclusivo, seguro rodar
  // com o app no ar. Só libera espaço em disco aos poucos; o que já importa pro
  // consumo de RAM do app é o UPDATE acima, que já commitou linhas menores.
  console.log('Rodando VACUUM ANALYZE...');
  await query(`VACUUM ANALYZE leads`);

  const depois = await query(`SELECT pg_size_pretty(pg_total_relation_size('leads')) as tamanho`);
  console.log('Tamanho depois (disco ainda leva um tempo pra compactar de vez):', depois.rows[0].tamanho);
  console.log('Concluído. Na próxima recarga do cache (até 30s), a RAM do app já reflete a redução.');
  process.exit(0);
}

run().catch(e => { console.error('Erro:', e.message); process.exit(1); });
