// Diagnóstico: como está a cobertura de cidade/bairro na tabela
// `localidades` hoje — por estado, quantas cidades já têm bairro
// cadastrado e quantas ainda faltam, pra saber se precisa rodar
// completar-bairros-faltantes.js de novo (e quantas cidades ainda restam).
// Só leitura, não altera nada.
// Roda manual no Render Shell:
//   node status-localidades.js
const { query, dbOk } = require('./services/db');

(async () => {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  const { rows: porEstado } = await query(`
    WITH por_cidade AS (
      SELECT estado, cidade, COUNT(*) FILTER (WHERE bairro IS NOT NULL) AS n_bairros
      FROM localidades
      GROUP BY estado, cidade
    )
    SELECT estado,
      COUNT(*)::int AS total_cidades,
      COUNT(*) FILTER (WHERE n_bairros > 0)::int AS cidades_com_bairro,
      COUNT(*) FILTER (WHERE n_bairros = 0)::int AS cidades_sem_bairro,
      COALESCE(SUM(n_bairros), 0)::int AS total_bairros
    FROM por_cidade
    GROUP BY estado
    ORDER BY estado
  `);

  console.log('=== COBERTURA DE CIDADE/BAIRRO POR ESTADO (sigla) ===');
  console.table(porEstado);

  const totalCidades = porEstado.reduce((s, r) => s + r.total_cidades, 0);
  const totalComBairro = porEstado.reduce((s, r) => s + r.cidades_com_bairro, 0);
  const totalSemBairro = porEstado.reduce((s, r) => s + r.cidades_sem_bairro, 0);
  const totalBairros = porEstado.reduce((s, r) => s + r.total_bairros, 0);
  console.log(`\nTOTAL GERAL: ${totalCidades} cidade(s) | ${totalComBairro} com bairro | ${totalSemBairro} sem bairro | ${totalBairros} bairro(s) cadastrado(s) no total`);

  if (totalSemBairro > 0) {
    const { rows: faltando } = await query(`
      WITH por_cidade AS (
        SELECT estado, cidade, COUNT(*) FILTER (WHERE bairro IS NOT NULL) AS n_bairros
        FROM localidades
        GROUP BY estado, cidade
      )
      SELECT estado, cidade FROM por_cidade WHERE n_bairros = 0 ORDER BY estado, cidade
    `);
    console.log(`\n=== CIDADES AINDA SEM BAIRRO (${faltando.length}) — mostrando até 100 ===`);
    console.table(faltando.slice(0, 100));
    if (faltando.length > 100) console.log(`... e mais ${faltando.length - 100} cidade(s). Rode "node completar-bairros-faltantes.js" de novo pra tentar cobrir todas — ele já pula quem já tem bairro e tenta só quem ainda falta.`);
  } else {
    console.log('\n✅ Todas as cidades da base já têm pelo menos 1 bairro cadastrado.');
  }

  process.exit(0);
})();
