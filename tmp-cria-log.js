const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_seguranca (
      id SERIAL PRIMARY KEY,
      tipo VARCHAR(50) NOT NULL,
      ip VARCHAR(60),
      user_agent TEXT,
      dados JSONB,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_log_seguranca_tipo ON log_seguranca(tipo);
    CREATE INDEX IF NOT EXISTS idx_log_seguranca_ip ON log_seguranca(ip);
    CREATE INDEX IF NOT EXISTS idx_log_seguranca_criado ON log_seguranca(criado_em);
  `);
  console.log('TABELA log_seguranca OK');
  await pool.end();
}
run().catch(e => { console.error(e); process.exit(1); });
