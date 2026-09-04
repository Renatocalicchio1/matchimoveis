// Script pra rodar no Render Shell: node tmp-limpar-campanha-contatos.js
// Remove de campanha_contatos (base de ~118k pra campanha geral) todo email
// que já está em email_optout (bounce permanente ou reclamação — já estão
// bloqueados de receber email de qualquer jeito via enviarEmail(); isso só
// limpa a base fisicamente, não muda comportamento de envio). NÃO mexe em
// leads/usuarios — só na lista de campanha.
const { query } = require('./services/db');

(async () => {
  const { rows: antes } = await query(`
    SELECT COUNT(*)::int as total FROM campanha_contatos cc
    WHERE EXISTS (
      SELECT 1 FROM email_optout eo
      WHERE eo.email = LOWER(cc.email) AND eo.motivo IN ('bounce','reclamacao')
    )
  `);
  console.log('Contatos em campanha_contatos que batem com bounce/reclamação:', antes[0].total);

  if (antes[0].total === 0) {
    console.log('Nada pra remover.');
    process.exit(0);
  }

  const { rowCount } = await query(`
    DELETE FROM campanha_contatos cc
    WHERE EXISTS (
      SELECT 1 FROM email_optout eo
      WHERE eo.email = LOWER(cc.email) AND eo.motivo IN ('bounce','reclamacao')
    )
  `);
  console.log('Removidos de campanha_contatos:', rowCount);

  const { rows: restante } = await query(`SELECT COUNT(*)::int as total FROM campanha_contatos`);
  console.log('Total restante em campanha_contatos:', restante[0].total);
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
