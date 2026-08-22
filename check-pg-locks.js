// Diagnóstico ao vivo do Postgres — só LEITURA, não mata nem altera nada.
// Mostra quantas conexões estão ativas/paradas e quais queries estão
// travadas há mais tempo, pra entender por que o pool esgota / health check
// falha (ver pendência "URGENTE — índices" no CLAUDE.md).
// Roda manual no Render Shell:
//   node check-pg-locks.js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  console.log('=== Conexões por estado ===');
  const { rows: porEstado } = await pool.query(`
    SELECT state, COUNT(*) FROM pg_stat_activity
    WHERE datname = current_database()
    GROUP BY state ORDER BY COUNT(*) DESC
  `);
  console.table(porEstado);

  console.log('\n=== Queries rodando há mais de 5s (as mais lentas primeiro) ===');
  const { rows: lentas } = await pool.query(`
    SELECT pid, state, now() - query_start AS duracao,
      LEFT(query, 120) AS query
    FROM pg_stat_activity
    WHERE datname = current_database() AND state != 'idle' AND query_start IS NOT NULL
      AND now() - query_start > interval '5 seconds'
    ORDER BY duracao DESC LIMIT 20
  `);
  console.table(lentas);

  console.log('\n=== Locks esperando (quem está travando quem) ===');
  const { rows: locks } = await pool.query(`
    SELECT blocked.pid AS bloqueado_pid,
      LEFT(blocked.query, 80) AS bloqueado_query,
      blocking.pid AS bloqueando_pid,
      LEFT(blocking.query, 80) AS bloqueando_query
    FROM pg_stat_activity blocked
    JOIN pg_locks bl ON bl.pid = blocked.pid AND NOT bl.granted
    JOIN pg_locks kl ON kl.locktype = bl.locktype AND kl.database IS NOT DISTINCT FROM bl.database
      AND kl.relation IS NOT DISTINCT FROM bl.relation AND kl.pid != bl.pid AND kl.granted
    JOIN pg_stat_activity blocking ON blocking.pid = kl.pid
  `);
  console.table(locks);

  console.log('\n=== Limite de conexões do banco vs em uso ===');
  const { rows: maxConn } = await pool.query(`SHOW max_connections`);
  const { rows: totalConn } = await pool.query(`SELECT COUNT(*) FROM pg_stat_activity`);
  console.log('max_connections:', maxConn[0].max_connections, '| em uso agora (todos os bancos):', totalConn[0].count);

  await pool.end();
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
