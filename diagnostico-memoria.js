// Diagnóstico: mede o tamanho real de cada tabela que o app carrega inteira pra
// RAM (cache em memória) periodicamente, pra achar de fato o que está causando o
// "JavaScript heap out of memory" / "Ran out of memory (used over 2GB)". Rodar
// uma vez manualmente no Render Shell: node diagnostico-memoria.js
'use strict';
const { query } = require('./services/db');

async function run() {
  console.log('=== Tamanho de todas as tabelas (maior pra menor) ===');
  const tabelas = await query(`
    SELECT relname AS tabela,
           pg_size_pretty(pg_total_relation_size(relid)) AS tamanho_total,
           pg_size_pretty(pg_relation_size(relid)) AS tamanho_dados,
           n_live_tup AS linhas_estimadas
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
  `);
  tabelas.rows.forEach(r => {
    console.log(`${r.tabela.padEnd(25)} total:${String(r.tamanho_total).padEnd(10)} dados:${String(r.tamanho_dados).padEnd(10)} linhas:${r.linhas_estimadas}`);
  });

  console.log('\n=== Detalhe imoveis (o que o _cacheImoveis carrega inteiro) ===');
  const imoveis = await query(`
    SELECT count(*) as total,
           pg_size_pretty(avg(pg_column_size(imoveis.*))::bigint) as tamanho_medio_por_linha,
           pg_size_pretty(max(pg_column_size(imoveis.*))::bigint) as maior_linha,
           avg(jsonb_array_length(coalesce(fotos,'[]'::jsonb))) as media_fotos_por_imovel
    FROM imoveis
  `);
  console.log(imoveis.rows[0]);

  console.log('\n=== Detalhe leads (o que o _cacheLeads carrega inteiro) ===');
  const leads = await query(`
    SELECT count(*) as total,
           pg_size_pretty(avg(pg_column_size(leads.*))::bigint) as tamanho_medio_por_linha,
           pg_size_pretty(max(pg_column_size(leads.*))::bigint) as maior_linha
    FROM leads
  `);
  console.log(leads.rows[0]);

  console.log('\n=== Detalhe usuarios ===');
  const usuarios = await query(`
    SELECT count(*) as total,
           pg_size_pretty(avg(pg_column_size(usuarios.*))::bigint) as tamanho_medio_por_linha,
           pg_size_pretty(max(pg_column_size(usuarios.*))::bigint) as maior_linha
    FROM usuarios
  `);
  console.log(usuarios.rows[0]);

  console.log('\n=== Detalhe visitas ===');
  const visitas = await query(`
    SELECT count(*) as total,
           pg_size_pretty(avg(pg_column_size(visitas.*))::bigint) as tamanho_medio_por_linha,
           pg_size_pretty(max(pg_column_size(visitas.*))::bigint) as maior_linha
    FROM visitas
  `);
  console.log(visitas.rows[0]);

  console.log('\n=== Memória do processo Node AGORA (process.memoryUsage) ===');
  console.log(process.memoryUsage());

  process.exit(0);
}

run().catch(e => { console.error('Erro:', e.message); process.exit(1); });
