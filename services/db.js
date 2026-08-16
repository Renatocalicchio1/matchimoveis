const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    if (process.env.DATABASE_URL) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        // Sem timeout, uma conexão que não completa (comum logo após um
        // restart, antes da rede estabilizar) fica pendurada pra sempre e
        // vai comendo as conexões do pool até travar o resto do app
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        // Reduzido de 20 pra deixar espaço pro pool separado e pequeno da
        // sessão (server.js, _pgPoolSessao) — sessão não pode competir por
        // conexão com os jobs de fundo pesados (recarga completa de leads/
        // imóveis/usuários/visitas etc, que disparam todos juntos no boot);
        // se competisse, um pico desses jobs travava a página de todo mundo
        // "carregando" sem abrir (ago/2026).
        max: 15
      });
    } else {
      // Sem banco configurado — retorna null (usa JSON como fallback)
      return null;
    }
  }
  return pool;
}

async function query(sql, params = []) {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL não configurada');
  const client = await p.connect();
  try {
    const res = await client.query(sql, params);
    return res;
  } finally {
    client.release();
  }
}

async function dbOk() {
  try {
    const p = getPool();
    if (!p) return false;
    await p.query('SELECT 1');
    return true;
  } catch(e) {
    return false;
  }
}

module.exports = { query, getPool, dbOk };
