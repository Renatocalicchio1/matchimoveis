// Diagnóstico pontual (ago/2026): entender por que normalizarCidadeBR não
// está restaurando acento faltando (ex: "sao paulo" devia virar "São Paulo",
// mas o dry-run de corrigir-localidades-imoveis.js só devolveu "Sao Paulo",
// sem acento). Só lê, não grava nada.
//
// Rodar (Render Shell):
//   node diagnostico-localidades.js
require('dotenv').config();
const { query } = require('./services/db');

async function main() {
  const porFonte = await query(`SELECT fonte, COUNT(*) c FROM localidades GROUP BY fonte ORDER BY c DESC`);
  console.log('=== Linhas por fonte ===');
  console.table(porFonte.rows);

  const estados = await query(`SELECT DISTINCT estado FROM localidades WHERE fonte IN ('ibge','osm') ORDER BY estado`);
  console.log('\n=== Estados com fonte confiável (ibge/osm):', estados.rows.length, '===');
  console.log(estados.rows.map(r => r.estado).join(', '));

  const sp = await query(`SELECT bairro, cidade, estado, fonte FROM localidades WHERE cidade ILIKE '%paulo%' AND fonte IN ('ibge','osm') LIMIT 15`);
  console.log('\n=== Amostra "São Paulo" em fonte confiável (até 15) ===');
  console.table(sp.rows);

  const spCount = await query(`SELECT COUNT(*) c FROM localidades WHERE estado ILIKE '%paulo%' AND fonte IN ('ibge','osm')`);
  console.log('\nTotal linhas confiáveis com estado contendo "paulo":', spCount.rows[0].c);

  const spCidadeExata = await query(`SELECT COUNT(*) c FROM localidades WHERE cidade = 'São Paulo' AND fonte IN ('ibge','osm')`);
  console.log('Linhas confiáveis com cidade EXATAMENTE "São Paulo":', spCidadeExata.rows[0].c);

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
