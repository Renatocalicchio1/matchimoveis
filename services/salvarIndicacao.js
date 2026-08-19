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
}

async function registrarBonus({ indicadorCodigo, indicadoCodigo, valorCompraCoins, bonusCoins, indicadorTipo }) {
  await _inicializar();
  await query(
    `INSERT INTO indicacoes_bonus (id, indicador_codigo, indicado_codigo, valor_compra_coins, bonus_coins, indicador_tipo) VALUES ($1,$2,$3,$4,$5,$6)`,
    [uuidv4(), indicadorCodigo, indicadoCodigo, valorCompraCoins, bonusCoins, indicadorTipo || 'corretor']
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
// do sub-admin mostra como "disponível pra resgatar".
async function totalDisponivelPorIndicador(indicadorCodigo) {
  await _inicializar();
  const { rows } = await query(
    `SELECT COALESCE(SUM(bonus_coins),0) as total FROM indicacoes_bonus WHERE indicador_codigo=$1 AND indicador_tipo='admin' AND status='disponivel'`,
    [indicadorCodigo]
  );
  return parseInt(rows[0]?.total || 0);
}

// Sub-admin escolhe um lote de comissões "disponivel" e pede resgate — fica
// 'solicitado' até o superadmin cumprir por fora (dinheiro) ou creditar
// coins pro corretor escolhido (credito) e marcar como pago.
async function solicitarResgate({ ids, indicadorCodigo, modo, creditoDestinoCodigo }) {
  await _inicializar();
  if (!ids || !ids.length) return { atualizados: 0 };
  const { rows } = await query(
    `UPDATE indicacoes_bonus SET status='solicitado', modo_resgate=$1, solicitado_em=NOW(), credito_destino_codigo=$2
     WHERE id = ANY($3) AND indicador_codigo=$4 AND indicador_tipo='admin' AND status='disponivel'
     RETURNING id, bonus_coins`,
    [modo, creditoDestinoCodigo || null, ids, indicadorCodigo]
  );
  return { atualizados: rows.length, totalCoins: rows.reduce((s, r) => s + r.bonus_coins, 0) };
}

async function listarSolicitacoesResgate() {
  await _inicializar();
  const { rows } = await query(
    `SELECT * FROM indicacoes_bonus WHERE indicador_tipo='admin' AND status='solicitado' ORDER BY solicitado_em ASC`
  );
  return rows;
}

// Relatório de pagos recentes (últimos 30 dias) pro superadmin conferir o
// que já saiu do caixa — mesma tabela, só filtra status='pago' em vez de
// 'solicitado'. Usado junto com listarSolicitacoesResgate() em
// /admin/comissoes-pendentes pra mostrar pendente + pago lado a lado.
async function listarResgatesPagosRecentes() {
  await _inicializar();
  const { rows } = await query(
    `SELECT * FROM indicacoes_bonus WHERE indicador_tipo='admin' AND status='pago' AND pago_em >= NOW() - INTERVAL '30 days' ORDER BY pago_em DESC`
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
  totalDisponivelPorIndicador, solicitarResgate, listarSolicitacoesResgate, marcarResgatePago,
  listarResgatesPagosRecentes
};
