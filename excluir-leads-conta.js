// Exclui (DELETE permanente) TODAS as leads de uma ou mais contas.
//
// Por padrão roda em modo SIMULAÇÃO: só mostra quantas/quais leads seriam
// excluídas, sem apagar nada. Pra excluir de verdade, rodar com --confirmar.
//
// Uso:
//   node excluir-leads-conta.js CONTA1 [CONTA2 ...]              (simulação)
//   node excluir-leads-conta.js CONTA1 [CONTA2 ...] --confirmar  (exclui de verdade)
// Exemplo:
//   node excluir-leads-conta.js TIA-A6PG
//   node excluir-leads-conta.js TIA-A6PG --confirmar

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const contas = process.argv.slice(2).filter(a => !a.startsWith('--'));
const confirmar = process.argv.includes('--confirmar');

if (!contas.length) {
  console.error('Uso: node excluir-leads-conta.js CONTA1 [CONTA2 ...] [--confirmar]');
  process.exit(1);
}

async function run() {
  for (const conta of contas) {
    const { rows } = await pool.query(
      `SELECT id, nome, telefone, origem, criado_em
       FROM leads
       WHERE user_id=$1 OR codigo_usuario=$1`,
      [conta]
    );

    console.log(`\n=== ${conta}: ${rows.length} lead(s) encontrada(s) ===`);
    rows.slice(0, 20).forEach(r => {
      console.log(`  ${r.id} — ${r.nome || '(sem nome)'} — ${r.telefone || '-'} — origem: ${r.origem || '-'} — criada em: ${r.criado_em}`);
    });
    if (rows.length > 20) console.log(`  ... e mais ${rows.length - 20}`);

    if (rows.length === 0) continue;

    if (!confirmar) {
      console.log('  (SIMULAÇÃO — nada foi excluído. Rode de novo com --confirmar pra excluir de verdade)');
      continue;
    }

    const del = await pool.query(`DELETE FROM leads WHERE user_id=$1 OR codigo_usuario=$1`, [conta]);
    console.log(`  ✅ Excluídas de ${conta}: ${del.rowCount}`);
  }
  await pool.end();
}

run().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
