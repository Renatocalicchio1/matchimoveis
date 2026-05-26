const { query, dbOk } = require('./services/db');
(async () => {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }
  const r = await query(`SELECT id, nome, telefone, vitrine_enviada, vitrine_enviada_em, dados->>'vitrineLink' as vitrine_link FROM leads WHERE id=$1`, ['1779763726029']);
  console.log(JSON.stringify(r.rows[0], null, 2));
  process.exit(0);
})();
