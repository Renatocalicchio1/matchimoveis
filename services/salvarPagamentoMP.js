const { query } = require('./db');

let _iniciado = false;
async function _inicializar() {
  if (_iniciado) return;
  _iniciado = true;
  await query(`
    CREATE TABLE IF NOT EXISTS pagamentos_mp_processados (
      payment_id TEXT PRIMARY KEY,
      processado_em TIMESTAMP DEFAULT NOW()
    )
  `);
}

// Marca o pagamento como processado de forma atômica — retorna true só na
// primeira vez (pode creditar), false se já tinha sido processado antes
// (reenvio/replay do webhook da Mercado Pago, ou duplo-clique no front).
async function tentarMarcarProcessado(paymentId) {
  await _inicializar();
  const { rows } = await query(
    `INSERT INTO pagamentos_mp_processados (payment_id) VALUES ($1) ON CONFLICT (payment_id) DO NOTHING RETURNING payment_id`,
    [String(paymentId)]
  );
  return rows.length > 0;
}

module.exports = { tentarMarcarProcessado };
