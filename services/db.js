const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    if (process.env.DATABASE_URL) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
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
