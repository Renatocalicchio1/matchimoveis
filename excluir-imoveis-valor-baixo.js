// Exclui (DELETE permanente) todo imóvel com valor abaixo de R$ 500,00 — em
// todas as contas da plataforma (não precisa passar conta como argumento).
//
// Por padrão roda em modo SIMULAÇÃO: só mostra quantos/quais imóveis seriam
// excluídos, sem apagar nada. Pra excluir de verdade, rodar com --confirmar.
//
// Uso:
//   node excluir-imoveis-valor-baixo.js              (simulação)
//   node excluir-imoveis-valor-baixo.js --confirmar  (exclui de verdade)

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const confirmar = process.argv.includes('--confirmar');
const LIMITE = 500;

async function run() {
  const { rows } = await pool.query(
    `SELECT id, id_interno, id_externo, titulo, bairro, cidade, valor_imovel, user_id, codigo_usuario
     FROM imoveis
     WHERE valor_imovel < $1
     ORDER BY user_id, valor_imovel`,
    [LIMITE]
  );

  console.log(`\n=== ${rows.length} imóvel(is) com valor abaixo de R$ ${LIMITE.toFixed(2)} encontrado(s) (todas as contas) ===`);
  rows.slice(0, 30).forEach(r => {
    const dono = r.user_id || r.codigo_usuario || '(sem dono)';
    console.log(`  [${dono}] ${r.id_interno || r.id} — ${r.titulo || '(sem título)'} — ${r.bairro || ''}/${r.cidade || ''} — R$ ${Number(r.valor_imovel || 0).toLocaleString('pt-BR')}`);
  });
  if (rows.length > 30) console.log(`  ... e mais ${rows.length - 30}`);

  if (rows.length === 0) { await pool.end(); return; }

  if (!confirmar) {
    console.log('\n(SIMULAÇÃO — nada foi excluído. Rode de novo com --confirmar pra excluir de verdade)');
    await pool.end();
    return;
  }

  const del = await pool.query(`DELETE FROM imoveis WHERE valor_imovel < $1`, [LIMITE]);
  console.log(`\n✅ Excluídos: ${del.rowCount} imóvel(is) com valor abaixo de R$ ${LIMITE.toFixed(2)}`);
  await pool.end();
}

run().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
