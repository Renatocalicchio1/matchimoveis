// Diagnóstico READ-ONLY da tabela indicacoes_bonus (indicador_tipo='afiliado')
// — pra confirmar o que tem lá antes de decidir zerar (pedido do Renato,
// ago/2026: "esta aparecendo compras antigas, vamos zerar tudo"). Não
// apaga nada — só mostra a foto atual. Rodar: node verificar-comissoes-afiliado.js
require('dotenv').config();
const { query } = require('./services/db');

async function main() {
  const { rows: porStatus } = await query(`
    SELECT status, COUNT(*)::int as linhas, COALESCE(SUM(bonus_coins),0)::int as total_coins
    FROM indicacoes_bonus
    WHERE indicador_tipo = 'afiliado'
    GROUP BY status
    ORDER BY status
  `);
  console.log('\n=== indicacoes_bonus (indicador_tipo=afiliado), por status ===');
  console.table(porStatus);

  const { rows: [datas] } = await query(`
    SELECT MIN(criado_em) as mais_antiga, MAX(criado_em) as mais_recente, COUNT(*)::int as total
    FROM indicacoes_bonus WHERE indicador_tipo = 'afiliado'
  `);
  console.log('\n=== Intervalo de datas ===');
  console.table([datas]);

  const { rows: pagos } = await query(`
    SELECT id, indicador_codigo, indicado_codigo, bonus_coins, papel, origem, status, pago_em, criado_em
    FROM indicacoes_bonus
    WHERE indicador_tipo = 'afiliado' AND status IN ('pago', 'solicitado')
    ORDER BY criado_em DESC
    LIMIT 50
  `);
  console.log('\n=== Linhas JA PAGAS ou SOLICITADAS (' + pagos.length + ' mostradas, max 50) — CUIDADO, apagar isso apaga registro de pagamento real ===');
  console.table(pagos);

  const { rows: porIndicador } = await query(`
    SELECT indicador_codigo, COUNT(*)::int as linhas, COALESCE(SUM(bonus_coins),0)::int as total_coins,
      COUNT(*) FILTER (WHERE status='pago')::int as linhas_pagas
    FROM indicacoes_bonus WHERE indicador_tipo='afiliado'
    GROUP BY indicador_codigo
    ORDER BY total_coins DESC
    LIMIT 30
  `);
  console.log('\n=== Top 30 por afiliado (indicador_codigo) ===');
  console.table(porIndicador);

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
