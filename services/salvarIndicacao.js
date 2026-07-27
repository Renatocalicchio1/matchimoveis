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
}

async function registrarBonus({ indicadorCodigo, indicadoCodigo, valorCompraCoins, bonusCoins }) {
  await _inicializar();
  await query(
    `INSERT INTO indicacoes_bonus (id, indicador_codigo, indicado_codigo, valor_compra_coins, bonus_coins) VALUES ($1,$2,$3,$4,$5)`,
    [uuidv4(), indicadorCodigo, indicadoCodigo, valorCompraCoins, bonusCoins]
  );
}

async function listarBonusPorIndicador(indicadorCodigo) {
  await _inicializar();
  const { rows } = await query(
    `SELECT * FROM indicacoes_bonus WHERE indicador_codigo=$1 ORDER BY criado_em DESC`,
    [indicadorCodigo]
  );
  return rows;
}

async function totalBonusPorIndicador(indicadorCodigo) {
  await _inicializar();
  const { rows } = await query(
    `SELECT COALESCE(SUM(bonus_coins),0) as total FROM indicacoes_bonus WHERE indicador_codigo=$1`,
    [indicadorCodigo]
  );
  return parseInt(rows[0]?.total || 0);
}

module.exports = { registrarBonus, listarBonusPorIndicador, totalBonusPorIndicador };
