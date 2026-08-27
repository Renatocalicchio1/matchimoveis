// Zera a planilha de comissoes de afiliado (indicacoes_bonus,
// indicador_tipo='afiliado') pra comecar do zero a partir de agora —
// pedido do Renato (ago/2026), confirmado depois de rodar
// verificar-comissoes-afiliado.js e ver que as 51 linhas existentes
// estavam TODAS com status='disponivel' (nenhuma paga/solicitada, ou
// seja, nao existe registro de pagamento real sendo apagado aqui).
//
// NAO mexe em afiliadoNivel de ninguem — se alguma conta foi promovida
// (Nivel 2/1) usando volume gerado por esse teste, reverta manualmente
// em /admin/afiliados (tem acao de "definir nivel" pra cada conta). Nao
// dava pra saber daqui, com seguranca, quem foi promovido por volume de
// teste e quem e cabeca de rede configurada de proposito pelo admin —
// resetar todo mundo cegamente poderia derrubar estrutura de rede real.
//
// Depois de zerar, o webhook do Mercado Pago (unica fonte de comissao
// daqui pra frente, ver server.js) volta a gerar linha nova a cada
// recarga real de verdade.
//
// Rodar: node zerar-comissoes-afiliado.js
require('dotenv').config();
const { query } = require('./services/db');

async function main() {
  const { rows: antes } = await query(
    `SELECT COUNT(*)::int as linhas, COALESCE(SUM(bonus_coins),0)::int as total_coins
     FROM indicacoes_bonus WHERE indicador_tipo = 'afiliado'`
  );
  console.log('Antes de apagar:', antes[0]);

  const { rows: pagos } = await query(
    `SELECT COUNT(*)::int as total FROM indicacoes_bonus
     WHERE indicador_tipo = 'afiliado' AND status IN ('pago','solicitado')`
  );
  if (pagos[0].total > 0) {
    console.log('\n⚠️  ABORTADO: existem', pagos[0].total, 'linha(s) com status pago/solicitado.');
    console.log('Isso seria apagar registro de pagamento real — não seguimos sem confirmação explícita.');
    process.exit(1);
  }

  const { rowCount } = await query(
    `DELETE FROM indicacoes_bonus WHERE indicador_tipo = 'afiliado'`
  );
  console.log('\n✅ Apagadas', rowCount, 'linha(s) de comissão de afiliado.');
  console.log('Comissão volta a zerada — a partir de agora só cresce com compra real confirmada pelo webhook do Mercado Pago.');

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
