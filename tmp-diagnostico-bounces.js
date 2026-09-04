// Script de diagnóstico — SOMENTE LEITURA, não altera nada. Rodar no Render
// Shell: node tmp-diagnostico-bounces.js
// Objetivo: levantar quem gerou bounce/reclamação (já suprimidos automaticamente
// via services/sesWebhook.js -> email_optout) e cruzar com email_envios pra
// ver de qual tipo/campanha de email vieram, pra saber o que limpar/ajustar
// antes de reativar o envio (_EMAILS_PAUSADOS em services/email.js).
const { query } = require('./services/db');

(async () => {
  console.log('=== Resumo email_optout (motivo) ===');
  const { rows: porMotivo } = await query(`
    SELECT motivo, COUNT(*)::int as total,
      MIN(criado_em) as primeiro, MAX(criado_em) as ultimo
    FROM email_optout
    GROUP BY motivo
    ORDER BY total DESC
  `);
  console.table(porMotivo);

  console.log('\n=== Bounces/reclamações nos últimos 30 dias, por dia ===');
  const { rows: porDia } = await query(`
    SELECT DATE(criado_em) as dia, motivo, COUNT(*)::int as total
    FROM email_optout
    WHERE criado_em >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(criado_em), motivo
    ORDER BY dia DESC, motivo
  `);
  console.table(porDia);

  console.log('\n=== Taxa aproximada: bounces / envios, últimos 30 dias ===');
  const { rows: taxa } = await query(`
    SELECT
      (SELECT COUNT(*) FROM email_envios WHERE enviado_em >= NOW() - INTERVAL '30 days')::int as enviados_30d,
      (SELECT COUNT(*) FROM email_optout WHERE motivo = 'bounce' AND criado_em >= NOW() - INTERVAL '30 days')::int as bounces_30d,
      (SELECT COUNT(*) FROM email_optout WHERE motivo = 'reclamacao' AND criado_em >= NOW() - INTERVAL '30 days')::int as reclamacoes_30d
  `);
  const t = taxa[0];
  const taxaBounce = t.enviados_30d > 0 ? (100 * t.bounces_30d / t.enviados_30d).toFixed(2) : 'N/A';
  const taxaReclamacao = t.enviados_30d > 0 ? (100 * t.reclamacoes_30d / t.enviados_30d).toFixed(2) : 'N/A';
  console.log(t);
  console.log('Taxa de bounce (30d, aprox.):', taxaBounce + '%');
  console.log('Taxa de reclamação (30d, aprox.):', taxaReclamacao + '%');

  console.log('\n=== De qual tipo/campanha de email vieram os bounces (cruzando com email_envios) ===');
  const { rows: porTipo } = await query(`
    SELECT ee.tipo, ee.variante, COUNT(DISTINCT eo.email)::int as bounces
    FROM email_optout eo
    JOIN email_envios ee ON LOWER(ee.destinatario) = eo.email
    WHERE eo.motivo = 'bounce'
    GROUP BY ee.tipo, ee.variante
    ORDER BY bounces DESC
    LIMIT 30
  `);
  console.table(porTipo);

  console.log('\n=== Últimos 20 emails com bounce permanente (mais recentes) ===');
  const { rows: recentes } = await query(`
    SELECT email, motivo, criado_em
    FROM email_optout
    WHERE motivo = 'bounce'
    ORDER BY criado_em DESC
    LIMIT 20
  `);
  console.table(recentes);

  console.log('\nFeito. Nenhum dado foi alterado (script somente leitura).');
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
