// Cria os índices que faltam em leads/imoveis pra acabar com as varreduras
// completas nas queries por conta (WHERE user_id=$1 OR usuario_id=$1 OR
// codigo_usuario=$1 OR corretor_id=$1) — causa raiz do pool de conexões
// esgotando com o volume atual da plataforma (ago/2026).
//
// Rodar UMA VEZ, manual, no Render Shell:
//   node criar-indices-pendentes.js
//
// Não roda automático no boot do servidor de propósito: CREATE INDEX
// CONCURRENTLY numa tabela grande pode levar minutos segurando uma conexão;
// se o processo reiniciasse no meio (crash-loop), o build nunca terminava e
// cada boot tentava de novo, competindo pelo pool logo na subida — piorava
// o próprio problema que tentava resolver. Rodando aqui, fora do processo
// principal, isso não acontece.
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const INDICES = [
  { nome: 'idx_leads_codigo_usuario', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_codigo_usuario ON leads(codigo_usuario)' },
  { nome: 'idx_imoveis_usuario_id', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_imoveis_usuario_id ON imoveis(usuario_id)' },
  { nome: 'idx_imoveis_codigo_usuario', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_imoveis_codigo_usuario ON imoveis(codigo_usuario)' },
  { nome: 'idx_imoveis_corretor_id', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_imoveis_corretor_id ON imoveis(corretor_id)' },
];

async function run() {
  for (const idx of INDICES) {
    const inicio = Date.now();
    console.log(`[${idx.nome}] criando...`);
    try {
      await pool.query(idx.sql);
      console.log(`[${idx.nome}] OK (${((Date.now() - inicio) / 1000).toFixed(1)}s)`);
    } catch (e) {
      console.error(`[${idx.nome}] ERRO:`, e.message);
    }
  }
  await pool.end();
  console.log('Concluído.');
}

run().catch(e => { console.error('Erro geral:', e.message); process.exit(1); });
