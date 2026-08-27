// Complemento do diagnostico-campanha-abriu2x.js: o número de "abriu >= 2"
// veio muito baixo (6 de 107.682) — antes de tratar isso como "baixo
// engajamento de verdade", precisa confirmar quantos contatos já
// RECEBERAM o 1º e-mail e os follow-ups, já que o envio é propositalmente
// devagar (1 por vez, 10s-2min aleatório — ver services/campanha.js). Se a
// maioria ainda nem foi enviada, "abriu pouco" é só "mandou pouco", não é
// sinal de problema de tracking nem de desinteresse real.
//
// Só leitura, não grava nada.
//
// Rodar (Render Shell):
//   node diagnostico-campanha-status-envio.js
require('dotenv').config();
const { query } = require('./services/db');

async function main() {
  const porStatus = await query(`SELECT status, COUNT(*) c FROM campanha_contatos GROUP BY status ORDER BY c DESC`);
  console.log('=== Contatos por status ===');
  console.table(porStatus.rows);

  const enviados = await query(`
    SELECT
      COUNT(*) FILTER (WHERE enviado_em IS NOT NULL) AS recebeu_1o_email,
      COUNT(*) FILTER (WHERE followup1_enviado_em IS NOT NULL) AS recebeu_followup1,
      COUNT(*) FILTER (WHERE followup2_enviado_em IS NOT NULL) AS recebeu_followup2,
      COUNT(*) FILTER (WHERE followup3_enviado_em IS NOT NULL) AS recebeu_followup3
    FROM campanha_contatos
  `);
  console.log('\n=== Quantos e-mails já foram de fato ENVIADOS (não aberto, enviado) ===');
  console.table(enviados.rows);

  // Taxa de abertura real: só sobre quem RECEBEU o 1º e-mail (denominador
  // certo, não sobre a base toda de 107k que inclui quem nunca recebeu nada).
  const taxaAbertura1 = await query(`
    SELECT
      COUNT(*) FILTER (WHERE enviado_em IS NOT NULL) AS recebeu,
      COUNT(*) FILTER (WHERE enviado_em IS NOT NULL AND aberto_em IS NOT NULL) AS abriu
    FROM campanha_contatos
  `);
  const r = taxaAbertura1.rows[0];
  const pct = r.recebeu > 0 ? ((r.abriu / r.recebeu) * 100).toFixed(1) : 0;
  console.log('\nTaxa de abertura do 1º e-mail (só sobre quem recebeu):', r.abriu + '/' + r.recebeu, '=', pct + '%');

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
