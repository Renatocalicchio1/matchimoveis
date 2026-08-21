// Lista TODAS as cidades que ainda não têm nenhum bairro cadastrado em
// `localidades` (sem cortar em 100 como status-localidades.js) — pra
// conferir a lista completa do que falta de uma vez. Só leitura.
// Roda manual no Render Shell:
//   node listar-cidades-sem-bairro.js
const { query, dbOk } = require('./services/db');

(async () => {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  const { rows } = await query(`
    WITH por_cidade AS (
      SELECT estado, cidade, COUNT(*) FILTER (WHERE bairro IS NOT NULL) AS n_bairros
      FROM localidades
      GROUP BY estado, cidade
    )
    SELECT estado, cidade FROM por_cidade WHERE n_bairros = 0 ORDER BY estado, cidade
  `);

  console.log(`=== ${rows.length} CIDADE(S) SEM NENHUM BAIRRO CADASTRADO ===\n`);
  console.table(rows);
  process.exit(0);
})();
