// Quantos abriram o follow-up 1 (de quem recebeu) — só leitura.
// Rodar (Render Shell): node diagnostico-followup1-abertura.js
require('dotenv').config();
const { query } = require('./services/db');

async function main() {
  const r = await query(`
    SELECT
      COUNT(*) FILTER (WHERE followup1_enviado_em IS NOT NULL) AS recebeu_followup1,
      COUNT(*) FILTER (WHERE followup1_enviado_em IS NOT NULL AND followup1_aberto_em IS NOT NULL) AS abriu_followup1
    FROM campanha_contatos
  `);
  const row = r.rows[0];
  const pct = row.recebeu_followup1 > 0 ? ((row.abriu_followup1 / row.recebeu_followup1) * 100).toFixed(1) : 0;
  console.log('Abriu o follow-up 1:', row.abriu_followup1 + '/' + row.recebeu_followup1, '=', pct + '%');
  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
