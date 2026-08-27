// Diagnóstico pontual (ago/2026): entender por que normalizarCidadeBR não
// está restaurando acento faltando (ex: "sao paulo" devia virar "São Paulo",
// mas o dry-run de corrigir-localidades-imoveis.js só devolveu "Sao Paulo",
// sem acento). Só lê, não grava nada.
//
// 1ª rodada revelou que não existe NENHUMA linha fonte='ibge' na tabela —
// só 'normalizado' (11.170), 'interno' (2.321) e 'osm' (258). popular-brasil-
// tudo.js grava fonte='ibge' pra cidade e 'osm' pra bairro — 'normalizado'
// não vem de nenhum script do repo atual, foi gravado por fora. Essa 2ª
// rodada investiga se dá pra confiar em 'normalizado' como fonte de cidade.
//
// Rodar (Render Shell):
//   node diagnostico-localidades.js
require('dotenv').config();
const { query } = require('./services/db');

async function main() {
  const porFonte = await query(`SELECT fonte, COUNT(*) c FROM localidades GROUP BY fonte ORDER BY c DESC`);
  console.log('=== Linhas por fonte ===');
  console.table(porFonte.rows);

  const normalizadoShape = await query(`SELECT (bairro IS NULL) AS sem_bairro, COUNT(*) c FROM localidades WHERE fonte='normalizado' GROUP BY 1`);
  console.log('\n=== fonte=normalizado: com/sem bairro ===');
  console.table(normalizadoShape.rows);

  const spNormalizado = await query(`SELECT bairro, cidade, estado FROM localidades WHERE cidade ILIKE '%paulo%' AND fonte='normalizado' LIMIT 15`);
  console.log('\n=== Amostra "São Paulo" em fonte=normalizado (até 15) ===');
  console.table(spNormalizado.rows);

  const amostraGeral = await query(`SELECT bairro, cidade, estado FROM localidades WHERE fonte='normalizado' ORDER BY random() LIMIT 20`);
  console.log('\n=== Amostra aleatória fonte=normalizado (até 20) ===');
  console.table(amostraGeral.rows);

  const estadosNormalizado = await query(`SELECT DISTINCT estado FROM localidades WHERE fonte='normalizado' ORDER BY estado`);
  console.log('\n=== Estados presentes em fonte=normalizado:', estadosNormalizado.rows.length, '===');
  console.log(estadosNormalizado.rows.map(r => r.estado).join(', '));

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
