// Apaga TODAS as notificações (tabela `notificacoes`, todas as contas) —
// zera o sino pra começar do zero.
//
// Por padrão roda em modo SIMULAÇÃO: só mostra quantas notificações existem,
// sem apagar nada. Pra apagar de verdade, rodar com --confirmar.
//
// Uso:
//   node limpar-notificacoes.js              (simulação)
//   node limpar-notificacoes.js --confirmar  (apaga de verdade)

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const confirmar = process.argv.includes('--confirmar');

async function run() {
  const { rows } = await pool.query(`
    SELECT usuario_id, COUNT(*) as total
    FROM notificacoes
    GROUP BY usuario_id
    ORDER BY total DESC
  `);
  const totalGeral = rows.reduce((s, r) => s + parseInt(r.total), 0);

  console.log(`\n=== ${totalGeral} notificação(ões) no total, em ${rows.length} conta(s) ===`);
  rows.slice(0, 20).forEach(r => console.log(`  ${r.usuario_id || '(sem usuario_id)'} — ${r.total}`));
  if (rows.length > 20) console.log(`  ... e mais ${rows.length - 20} conta(s)`);

  if (!confirmar) {
    console.log('\n(SIMULAÇÃO — nada foi apagado. Rode de novo com --confirmar pra apagar de verdade)');
    await pool.end();
    return;
  }

  const del = await pool.query('DELETE FROM notificacoes');
  console.log(`\n✅ Apagadas: ${del.rowCount} notificações de todas as contas`);

  await pool.end();
}

run().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
