// Relatório: quantas leads foram geradas HOJE (fuso America/Sao_Paulo), por canal (origem)
// e por conta (corretor). Só leitura — não altera nada no banco.
//
// Uso:
//   node relatorio-leads-hoje.js

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const { rows } = await pool.query(`
    SELECT l.origem, l.user_id, l.codigo_usuario, l.nome, l.telefone, l.criado_em,
           u.nome AS nome_corretor
    FROM leads l
    LEFT JOIN usuarios u ON u.codigo_usuario = COALESCE(l.user_id, l.codigo_usuario)
    WHERE (l.criado_em AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
    ORDER BY l.criado_em ASC
  `);

  const hojeStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`\n=== Leads geradas hoje (${hojeStr}) — total: ${rows.length} ===\n`);

  if (!rows.length) { await pool.end(); return; }

  // ── Por canal (origem) ──────────────────────────────────────────────
  const porCanal = {};
  rows.forEach(r => {
    const canal = r.origem || '(sem origem)';
    porCanal[canal] = (porCanal[canal] || 0) + 1;
  });
  console.log('--- Por canal ---');
  Object.entries(porCanal).sort((a,b) => b[1]-a[1]).forEach(([canal, qtd]) => {
    console.log(`  ${canal}: ${qtd}`);
  });

  // ── Por conta (corretor) ────────────────────────────────────────────
  const porConta = {};
  rows.forEach(r => {
    const conta = r.user_id || r.codigo_usuario || '(sem dono)';
    if (!porConta[conta]) porConta[conta] = { qtd: 0, nome: r.nome_corretor || '' };
    porConta[conta].qtd++;
  });
  console.log('\n--- Por conta ---');
  Object.entries(porConta).sort((a,b) => b[1].qtd-a[1].qtd).forEach(([conta, info]) => {
    console.log(`  ${conta}${info.nome ? ' ('+info.nome+')' : ''}: ${info.qtd}`);
  });

  // ── Detalhe (canal x conta) ─────────────────────────────────────────
  console.log('\n--- Detalhe (canal x conta) ---');
  rows.forEach(r => {
    const hora = new Date(r.criado_em).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute:'2-digit' });
    console.log(`  [${hora}] ${r.origem||'(sem origem)'} → ${r.user_id||r.codigo_usuario||'(sem dono)'}${r.nome_corretor?' ('+r.nome_corretor+')':''} — lead: ${r.nome||'(sem nome)'} / ${r.telefone||'-'}`);
  });

  await pool.end();
}

run().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
