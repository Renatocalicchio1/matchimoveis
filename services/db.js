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
        // Subido de 15 pra 30 (ago/2026) — o teto real do banco é
        // max_connections=103 e o uso medido num momento calmo foi só ~21
        // (checado via check-pg-locks.js), então 15 sobrava pouca margem
        // pra pilha de jobs que dispara toda junta no boot (cache incremental
        // de leads/imóveis/usuários/visitas + campanha + onboarding + email +
        // geocodificação) — o log mostrava "timeout exceeded when trying to
        // connect" nesses jobs E no próprio /health (mesmo pool), o que
        // travava o health check do Render bem no meio de um deploy, quando
        // a instância antiga e a nova ficam as duas de pé por alguns
        // segundos. 30 + os 5 do pool de sessão (_pgPoolSessao, server.js)
        // ainda deixa margem folgada mesmo com 2 instâncias simultâneas.
        max: 30
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
