// Exclui (DELETE permanente) todos os imóveis de aluguel de uma ou mais contas.
//
// Por padrão roda em modo SIMULAÇÃO: só mostra quantos/quais imóveis seriam
// excluídos, sem apagar nada. Pra excluir de verdade, rodar com --confirmar.
//
// Uso:
//   node excluir-imoveis-aluguel.js CONTA1 [CONTA2 ...]              (simulação)
//   node excluir-imoveis-aluguel.js CONTA1 [CONTA2 ...] --confirmar  (exclui de verdade)
// Exemplo:
//   node excluir-imoveis-aluguel.js TIA-A6PG VIE-XK9H
//   node excluir-imoveis-aluguel.js TIA-A6PG VIE-XK9H --confirmar

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const contas = process.argv.slice(2).filter(a => !a.startsWith('--'));
const confirmar = process.argv.includes('--confirmar');

if (!contas.length) {
  console.error('Uso: node excluir-imoveis-aluguel.js CONTA1 [CONTA2 ...] [--confirmar]');
  process.exit(1);
}

async function run() {
  for (const conta of contas) {
    const { rows } = await pool.query(
      `SELECT id, id_interno, id_externo, titulo, bairro, cidade, transacao, status
       FROM imoveis
       WHERE (user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1)
         AND LOWER(transacao) = 'aluguel'`,
      [conta]
    );

    console.log(`\n=== ${conta}: ${rows.length} imóvel(is) de aluguel encontrado(s) ===`);
    rows.slice(0, 15).forEach(r => {
      console.log(`  ${r.id_interno || r.id} — ${r.titulo || '(sem título)'} — ${r.bairro || ''}/${r.cidade || ''} [${r.status}]`);
    });
    if (rows.length > 15) console.log(`  ... e mais ${rows.length - 15}`);

    if (rows.length === 0) continue;

    if (!confirmar) {
      console.log('  (SIMULAÇÃO — nada foi excluído. Rode de novo com --confirmar pra excluir de verdade)');
      continue;
    }

    const del = await pool.query(
      `DELETE FROM imoveis
       WHERE (user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1)
         AND LOWER(transacao) = 'aluguel'`,
      [conta]
    );
    console.log(`  ✅ Excluídos de ${conta}: ${del.rowCount}`);
  }
  await pool.end();
}

run().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
