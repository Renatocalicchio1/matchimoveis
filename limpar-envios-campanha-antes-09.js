// Script avulso, rodar 1x manualmente no Render Shell:
//   node limpar-envios-campanha-antes-09.js            (dry-run, só mostra quantos e quem)
//   node limpar-envios-campanha-antes-09.js --confirmar (apaga de vez)
//
// Remove definitivamente da Campanha Email (campanha_contatos) todo envio
// (status 'enviado' ou 'erro') feito antes do dia 09/08/2026 — pedido do
// Renato pra tirar essa gente da listagem de "Envios recentes".
//
// ATENÇÃO — efeito colateral: como campanha_contatos é a lista mestra
// (dedup por e-mail via ON CONFLICT DO NOTHING na importação), apagar essas
// linhas libera o e-mail de novo. Se o mesmo contato aparecer numa próxima
// importação de planilha, ele volta como "pendente" e pode ser mandado de
// novo — o disparo NÃO tem memória de "já mandei um dia" fora dessa tabela.
// Contatos que estão 'pendente' (nunca enviados) não são tocados por esse
// script de jeito nenhum, só quem já foi de fato enviado/deu erro antes do
// corte.
const { query } = require('./services/db');

// Meia-noite de 09/08/2026 no horário de Brasília (UTC-3) = 03:00 UTC —
// enviado_em é gravado via NOW() num banco em UTC.
const CORTE_UTC = '2026-08-09 03:00:00';

async function main() {
  const confirmar = process.argv.includes('--confirmar');

  const { rows: preview } = await query(
    `SELECT id, nome, email, status, enviado_em FROM campanha_contatos
     WHERE status IN ('enviado','erro') AND enviado_em < $1
     ORDER BY enviado_em ASC`,
    [CORTE_UTC]
  );

  console.log(`Encontrados ${preview.length} envio(s) antes de 09/08/2026 (horário de Brasília):`);
  preview.slice(0, 20).forEach(r => console.log(`  #${r.id} ${r.email} — ${r.status} — ${r.enviado_em}`));
  if (preview.length > 20) console.log(`  ... e mais ${preview.length - 20}`);

  if (!confirmar) {
    console.log('\nDry-run — nada foi apagado. Rode de novo com --confirmar pra apagar de vez.');
    process.exit(0);
  }

  if (!preview.length) {
    console.log('\nNada pra apagar.');
    process.exit(0);
  }

  const { rowCount } = await query(
    `DELETE FROM campanha_contatos WHERE status IN ('enviado','erro') AND enviado_em < $1`,
    [CORTE_UTC]
  );
  console.log(`\n${rowCount} registro(s) apagado(s) de campanha_contatos.`);
  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
