const { query } = require('./db');
const { v4: uuidv4 } = require('uuid');

let _iniciado = false;
async function _inicializar() {
  if (_iniciado) return;
  _iniciado = true;
  await query(`
    CREATE TABLE IF NOT EXISTS indicacoes_bonus (
      id UUID PRIMARY KEY,
      indicador_codigo TEXT NOT NULL,
      indicado_codigo TEXT NOT NULL,
      valor_compra_coins INT NOT NULL,
      bonus_coins INT NOT NULL,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_indicacoes_bonus_indicador ON indicacoes_bonus(indicador_codigo)`);
  // indicador_tipo distingue corretor (ganha automaticamente em match_coins,
  // já creditado direto na conta) de admin/sub-admin (ganha comissão de
  // 20% que fica só nesse ledger — sub-admin não tem saldo de coins na
  // tabela usuarios, então o "ganho" só existe aqui até virar resgate).
  await query(`ALTER TABLE indicacoes_bonus ADD COLUMN IF NOT EXISTS indicador_tipo TEXT DEFAULT 'corretor'`);
  // Ciclo de vida de uma comissão de admin: disponivel -> solicitado (sub-admin
  // escolheu um lote e pediu resgate) -> pago (superadmin cumpriu por fora e
  // marcou aqui). modo_resgate: 'dinheiro' (paga em R$ fora do sistema) ou
  // 'credito' (vira match_coins que o sub-admin repassa/revende pra um corretor).
  await query(`ALTER TABLE indicacoes_bonus ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'disponivel'`);
  await query(`ALTER TABLE indicacoes_bonus ADD COLUMN IF NOT EXISTS modo_resgate TEXT`);
  await query(`ALTER TABLE indicacoes_bonus ADD COLUMN IF NOT EXISTS solicitado_em TIMESTAMP`);
  await query(`ALTER TABLE indicacoes_bonus ADD COLUMN IF NOT EXISTS pago_em TIMESTAMP`);
  await query(`ALTER TABLE indicacoes_bonus ADD COLUMN IF NOT EXISTS credito_destino_codigo TEXT`);
  // papel distingue, dentro do programa de afiliados (indicador_tipo='afiliado'),
  // se a linha é a comissão "propria" (quem indicou direto o comprador) ou um
  // "override_n2"/"override_n1" (nível acima recebendo a diferença) — usado
  // pro cálculo de volume de venda própria que dispara promoção automática
  // de nível (ver _volumeVendasAfiliado/_checarPromocaoAfiliado em server.js).
  await query(`ALTER TABLE indicacoes_bonus ADD COLUMN IF NOT EXISTS papel TEXT`);
  // Origem da recarga que gerou a comissão — 'app' (pagamento real via
  // Mercado Pago) ou 'admin' (crédito manual pelo admin, que também conta
  // como recarga pra quem indicou, ver comentário em POST
  // /admin/usuario/:codigo/creditos). Pedido do Renato (ago/2026): mostrar
  // isso na planilha de comissões do afiliado, pra distinguir comissão de
  // venda real da gerada por crédito de cortesia.
  await query(`ALTER TABLE indicacoes_bonus ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'app'`);
}

async function registrarBonus({ indicadorCodigo, indicadoCodigo, valorCompraCoins, bonusCoins, indicadorTipo, papel, origem }) {
  await _inicializar();
  await query(
    `INSERT INTO indicacoes_bonus (id, indicador_codigo, indicado_codigo, valor_compra_coins, bonus_coins, indicador_tipo, papel, origem) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [uuidv4(), indicadorCodigo, indicadoCodigo, valorCompraCoins, bonusCoins, indicadorTipo || 'corretor', papel || null, origem || 'app']
  );
}

async function listarBonusPorIndicador(indicadorCodigo, indicadorTipo) {
  await _inicializar();
  const params = [indicadorCodigo];
  let where = 'WHERE indicador_codigo=$1';
  if (indicadorTipo) { params.push(indicadorTipo); where += ` AND indicador_tipo=$2`; }
  const { rows } = await query(`SELECT * FROM indicacoes_bonus ${where} ORDER BY criado_em DESC`, params);
  return rows;
}

// Conta indicados DISTINTOS que já geraram bônus (fizeram pelo menos 1
// recarga de verdade) pra esse indicador — base da gamificação de marcos
// ("indique X, ganhe Y extra"). Distinto porque o mesmo indicado pode
// recarregar várias vezes e gerar várias linhas no ledger.
async function contarIndicadosComBonus(indicadorCodigo, indicadorTipo) {
  await _inicializar();
  const { rows } = await query(
    `SELECT COUNT(DISTINCT indicado_codigo) as total FROM indicacoes_bonus WHERE indicador_codigo=$1 AND indicador_tipo=$2`,
    [indicadorCodigo, indicadorTipo || 'corretor']
  );
  return parseInt(rows[0]?.total || 0);
}

async function totalBonusPorIndicador(indicadorCodigo, indicadorTipo) {
  await _inicializar();
  const params = [indicadorCodigo];
  let where = 'WHERE indicador_codigo=$1';
  if (indicadorTipo) { params.push(indicadorTipo); where += ` AND indicador_tipo=$2`; }
  const { rows } = await query(`SELECT COALESCE(SUM(bonus_coins),0) as total FROM indicacoes_bonus ${where}`, params);
  return parseInt(rows[0]?.total || 0);
}

// Só soma o que ainda não foi pedido em resgate — é o número que o painel
// do sub-admin (ou, desde ago/2026, do afiliado) mostra como "disponível
// pra resgatar". indicadorTipo default 'admin' mantém compatível com quem
// já chamava essa função sem passar o tipo.
async function totalDisponivelPorIndicador(indicadorCodigo, indicadorTipo) {
  await _inicializar();
  const { rows } = await query(
    `SELECT COALESCE(SUM(bonus_coins),0) as total FROM indicacoes_bonus WHERE indicador_codigo=$1 AND indicador_tipo=$2 AND status='disponivel'`,
    [indicadorCodigo, indicadorTipo || 'admin']
  );
  return parseInt(rows[0]?.total || 0);
}

// Sub-admin (ou afiliado) escolhe um lote de comissões "disponivel" e pede
// resgate — fica 'solicitado' até o superadmin cumprir por fora (dinheiro)
// ou creditar coins pro destino escolhido (credito) e marcar como pago.
// indicadorTipo default 'admin' mantém compatível com o fluxo de sub-admin.
async function solicitarResgate({ ids, indicadorCodigo, modo, creditoDestinoCodigo, indicadorTipo }) {
  await _inicializar();
  if (!ids || !ids.length) return { atualizados: 0 };
  const { rows } = await query(
    `UPDATE indicacoes_bonus SET status='solicitado', modo_resgate=$1, solicitado_em=NOW(), credito_destino_codigo=$2
     WHERE id = ANY($3) AND indicador_codigo=$4 AND indicador_tipo=$5 AND status='disponivel'
     RETURNING id, bonus_coins`,
    [modo, creditoDestinoCodigo || null, ids, indicadorCodigo, indicadorTipo || 'admin']
  );
  return { atualizados: rows.length, totalCoins: rows.reduce((s, r) => s + r.bonus_coins, 0) };
}

// Planilha completa (pedido + pago, sem corte de tempo) pro superadmin
// conferir tudo que já pediu resgate em dinheiro — pendente e pago juntos,
// mais recente primeiro. Usada em /admin/comissoes-pendentes no lugar das
// 2 queries separadas que existiam antes (uma só pendente, outra só pago
// dos últimos 30 dias) — agora é 1 tabela só com todo o histórico,
// diferenciado por status na própria linha (cor no HTML).
async function listarTodasSolicitacoesResgate() {
  await _inicializar();
  // Inclui 'afiliado' desde ago/2026 (programa de afiliados reaproveita esse
  // mesmo ledger/fila de resgate em dinheiro do sub-admin) além do 'admin'
  // histórico — o superadmin confere e paga os dois tipos na mesma tela.
  const { rows } = await query(
    `SELECT * FROM indicacoes_bonus WHERE indicador_tipo IN ('admin','afiliado') AND status IN ('solicitado','pago')
     ORDER BY COALESCE(pago_em, solicitado_em) DESC`
  );
  return rows;
}

async function marcarResgatePago(ids) {
  await _inicializar();
  if (!ids || !ids.length) return [];
  const { rows } = await query(
    `UPDATE indicacoes_bonus SET status='pago', pago_em=NOW() WHERE id = ANY($1) RETURNING id, indicador_codigo, bonus_coins`,
    [ids]
  );
  return rows;
}

module.exports = {
  registrarBonus, listarBonusPorIndicador, totalBonusPorIndicador, contarIndicadosComBonus,
  totalDisponivelPorIndicador, solicitarResgate, marcarResgatePago,
  listarTodasSolicitacoesResgate
};
