// Script de diagnóstico — SOMENTE LEITURA. Rodar no Render Shell:
// node tmp-diagnostico-propensao-antonio.js
// Investiga por que o email "Separei umas opções pra você" (JOB_PROPENSAO,
// tipo 'propensao_alta') disparou mais de uma vez pro mesmo lead — se é
// sinal comportamental novo de verdade repetindo (ex: link sendo pré-abrido
// por scanner de segurança de email, não humano) ou se a trava de dedup
// (propensaoUltimoDisparo, cerebro/propensao.js) tem furo.
const { query } = require('./services/db');

const LEAD_ID = '1788196796922';

(async () => {
  const { rows } = await query(`SELECT id, nome, telefone, email, comportamento, dados FROM leads WHERE id=$1`, [LEAD_ID]);
  if (!rows.length) { console.log('Lead não encontrada com esse ID.'); process.exit(0); }
  const lead = rows[0];
  console.log('=== Lead:', lead.nome, '|', lead.telefone, '|', lead.email, '===\n');

  console.log('=== propensaoUltimoDisparo (estado atual da trava anti-spam) ===');
  console.log(JSON.stringify((lead.dados || {}).propensaoUltimoDisparo || null, null, 2));

  const comp = lead.comportamento || {};
  console.log('\n=== comportamento.imoveisVisualizados (cada visita a um /imovel/:id vinda da vitrine) ===');
  console.table((comp.imoveisVisualizados || []).map(v => ({ id: v.id, duracao_s: v.duracao, em: v.em })));

  console.log('\n=== comportamento.navegacoesImoveis (navegou/scrollou vários cards na vitrine) ===');
  console.table(comp.navegacoesImoveis || []);

  console.log('\n=== comportamento.vitrineVistas (contador simples, sem timestamp por evento):', comp.vitrineVistas, '===');
  console.log('ultimaAtividade:', comp.ultimaAtividade);

  console.log('\n=== Todos os envios de email propensao_alta pra essa lead (email_envios) ===');
  const { rows: envios } = await query(
    `SELECT id, assunto, enviado_em, aberto_em, clicado_em FROM email_envios WHERE lead_id=$1 AND tipo='propensao_alta' ORDER BY enviado_em ASC`,
    [LEAD_ID]
  );
  console.table(envios);

  console.log('\nFeito. Nenhum dado foi alterado (script somente leitura).');
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
