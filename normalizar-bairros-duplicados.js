// Normaliza bairros quase-duplicados em `localidades` (ex: "acliamacao" vs
// "aclimacao") pra TODAS as cidades/estados de uma vez.
//
// Regra de segurança (não é um DELETE cego por similaridade de texto — duas
// grafias parecidas podem ser bairros DIFERENTES de verdade, ex: "Vila Nova"
// x "Vila Nova Conceição"): pra cada par de bairros muito parecidos (mesma
// cidade+estado, similaridade trigram > 0.75), conta quantas vezes cada
// grafia aparece de verdade em imoveis.bairro, leads.perfil_ia->>'bairro' e
// interessados_portal.bairro.
//   - Se só UMA das duas tem uso real e a outra tem ZERO: apaga a de zero
//     uso automaticamente (é ruído de raspagem OSM, nunca foi digitada por
//     ninguém de verdade).
//   - Se as duas têm uso real, OU as duas têm uso zero: não mexe, só lista
//     pra revisão manual (pode ser 2 bairros de fato diferentes).
//
// Roda manual no Render Shell:
//   node normalizar-bairros-duplicados.js
const { query, dbOk } = require('./services/db');

async function usoReal(estado, cidade, bairro) {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*) FROM imoveis WHERE LOWER(unaccent(estado))=$1 AND LOWER(unaccent(cidade))=$2 AND LOWER(unaccent(bairro))=$3) +
      (SELECT COUNT(*) FROM leads WHERE LOWER(unaccent(COALESCE(perfil_ia->>'estado','')))=$1 AND LOWER(unaccent(COALESCE(perfil_ia->>'cidade','')))=$2 AND LOWER(unaccent(COALESCE(perfil_ia->>'bairro','')))=$3) +
      (SELECT COUNT(*) FROM interessados_portal WHERE LOWER(unaccent(estado))=$1 AND LOWER(unaccent(cidade))=$2 AND LOWER(unaccent(bairro))=$3)
      AS total
  `, [estado, cidade, bairro]);
  return parseInt(rows[0].total) || 0;
}

async function run() {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  await query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await query(`CREATE EXTENSION IF NOT EXISTS unaccent`);

  const { rows: pares } = await query(`
    SELECT a.estado, a.cidade, a.bairro AS bairro_1, b.bairro AS bairro_2, similarity(a.bairro,b.bairro) AS sim
    FROM localidades a JOIN localidades b
      ON a.estado=b.estado AND a.cidade=b.cidade AND a.bairro < b.bairro
      AND similarity(a.bairro,b.bairro) > 0.75
    WHERE a.bairro IS NOT NULL AND b.bairro IS NOT NULL
    ORDER BY a.estado, a.cidade, sim DESC
  `);

  console.log(`${pares.length} par(es) de bairro parecido encontrado(s). Checando uso real de cada um...\n`);

  let apagados = 0;
  const paraRevisar = [];

  for (const p of pares) {
    const uso1 = await usoReal(p.estado, p.cidade, p.bairro_1);
    const uso2 = await usoReal(p.estado, p.cidade, p.bairro_2);

    if (uso1 === 0 && uso2 > 0) {
      await query(`DELETE FROM localidades WHERE estado=$1 AND cidade=$2 AND bairro=$3`, [p.estado, p.cidade, p.bairro_1]);
      console.log(`🗑️  apagado "${p.bairro_1}" (0 usos) — mantido "${p.bairro_2}" (${uso2} uso(s)) — ${p.cidade}/${p.estado}`);
      apagados++;
    } else if (uso2 === 0 && uso1 > 0) {
      await query(`DELETE FROM localidades WHERE estado=$1 AND cidade=$2 AND bairro=$3`, [p.estado, p.cidade, p.bairro_2]);
      console.log(`🗑️  apagado "${p.bairro_2}" (0 usos) — mantido "${p.bairro_1}" (${uso1} uso(s)) — ${p.cidade}/${p.estado}`);
      apagados++;
    } else {
      paraRevisar.push({ estado: p.estado, cidade: p.cidade, bairro_1: p.bairro_1, uso_1: uso1, bairro_2: p.bairro_2, uso_2: uso2, sim: Number(p.sim).toFixed(2) });
    }
  }

  console.log(`\n=== CONCLUÍDO ===`);
  console.log(`Apagados automaticamente (sem uso real): ${apagados}`);
  console.log(`Pra revisão manual (ambos com uso, ou ambos sem uso): ${paraRevisar.length}\n`);
  if (paraRevisar.length) console.table(paraRevisar);

  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
