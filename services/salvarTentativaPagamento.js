// Registra TODA tentativa de checkout do Mercado Pago — não só a aprovada.
// Antes disso o sistema só gravava alguma coisa quando o webhook confirmava
// pagamento aprovado (services/salvarPagamentoMP.js, só dedup por payment_id,
// nenhum dado de quem tentou e desistiu). Pedido do Renato (ago/2026): ver
// quem clicou pra comprar, quando, quanto, qual plano, por qual caminho
// (avulso dentro do app, combo dentro do app, ou combo em /demanda), e quem
// tentou e não completou — pra puder chamar no WhatsApp.
//
// Fluxo: registrarTentativa() é chamada nos 3 pontos que criam
// preference.create() (/pagamento/criar, /pagamento/criar-plano,
// /demanda/comprar), gravando a linha com status 'iniciado' assim que a
// preferência é criada no Mercado Pago (antes do usuário ser redirecionado
// pra lá — é o único jeito de capturar quem chegou a clicar mas nunca pagou).
// O webhook (/webhook/mercadopago) atualiza o status quando o pagamento
// resolve (aprovado/rejeitado/etc), casando pelo preference_id.
const { query } = require('./db');

let _tabelaPronta = false;
async function _garantirTabela() {
  if (_tabelaPronta) return;
  await query(`CREATE TABLE IF NOT EXISTS pagamento_tentativas (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    nome TEXT,
    telefone TEXT,
    email TEXT,
    tipo TEXT,
    plano TEXT,
    label TEXT,
    valor NUMERIC,
    creditos INT,
    caminho TEXT,
    preference_id TEXT UNIQUE,
    payment_id TEXT,
    status TEXT DEFAULT 'iniciado',
    valor_pago NUMERIC,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pagamento_tentativas_status ON pagamento_tentativas(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pagamento_tentativas_criado ON pagamento_tentativas(criado_em DESC)`);
  _tabelaPronta = true;
}

// caminho: 'app_avulso' | 'app_plano' | 'demanda'
async function registrarTentativa({ userId, nome, telefone, email, tipo, plano, label, valor, creditos, caminho, preferenceId }) {
  await _garantirTabela();
  try {
    await query(
      `INSERT INTO pagamento_tentativas (user_id, nome, telefone, email, tipo, plano, label, valor, creditos, caminho, preference_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'iniciado')
       ON CONFLICT (preference_id) DO NOTHING`,
      [userId || '', nome || '', telefone || '', email || '', tipo || '', plano || '', label || '', valor || 0, creditos || 0, caminho || '', preferenceId || '']
    );
  } catch (e) { console.error('[pagamento-tentativas] erro ao registrar:', e.message); }
}

// Chamado pelo webhook quando o pagamento resolve — casa pelo preference_id
// que veio junto no objeto de pagamento da Mercado Pago.
async function atualizarStatusPorPreference(preferenceId, { status, paymentId, valorPago }) {
  if (!preferenceId) return;
  await _garantirTabela();
  try {
    await query(
      `UPDATE pagamento_tentativas SET status=$1, payment_id=$2, valor_pago=$3, atualizado_em=NOW() WHERE preference_id=$4`,
      [status || 'desconhecido', paymentId || null, valorPago || null, preferenceId]
    );
  } catch (e) { console.error('[pagamento-tentativas] erro ao atualizar:', e.message); }
}

async function listarTentativas({ limite = 100, offset = 0, status = '', caminho = '', q = '' } = {}) {
  await _garantirTabela();
  let where = 'WHERE 1=1';
  const params = [];
  if (status === 'aprovado') where += ` AND status = 'approved'`;
  else if (status === 'abandonado') where += ` AND status IN ('iniciado','rejected','cancelled','pending','in_process')`;
  if (caminho) { params.push(caminho); where += ` AND caminho = $${params.length}`; }
  if (q) { params.push('%' + q + '%'); where += ` AND (nome ILIKE $${params.length} OR email ILIKE $${params.length} OR telefone ILIKE $${params.length})`; }
  params.push(limite); params.push(offset);
  const { rows } = await query(
    `SELECT * FROM pagamento_tentativas ${where} ORDER BY criado_em DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const { rows: [{ total }] } = await query(`SELECT COUNT(*)::int AS total FROM pagamento_tentativas ${where}`, params.slice(0, -2));
  return { rows, total };
}

async function resumoTentativas() {
  await _garantirTabela();
  const { rows } = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'approved')::int AS aprovados,
      COUNT(*) FILTER (WHERE status IN ('iniciado','rejected','cancelled','pending','in_process'))::int AS abandonados,
      COALESCE(SUM(valor_pago) FILTER (WHERE status = 'approved'), 0)::numeric AS valor_total_aprovado,
      COUNT(*) FILTER (WHERE status = 'approved' AND caminho = 'app_avulso')::int AS aprovados_app_avulso,
      COUNT(*) FILTER (WHERE status = 'approved' AND caminho = 'app_plano')::int AS aprovados_app_plano,
      COUNT(*) FILTER (WHERE status = 'approved' AND caminho = 'demanda')::int AS aprovados_demanda,
      COUNT(*) FILTER (WHERE caminho = 'app_avulso')::int AS total_app_avulso,
      COUNT(*) FILTER (WHERE caminho = 'app_plano')::int AS total_app_plano,
      COUNT(*) FILTER (WHERE caminho = 'demanda')::int AS total_demanda
    FROM pagamento_tentativas
  `);
  return rows[0];
}

module.exports = { registrarTentativa, atualizarStatusPorPreference, listarTentativas, resumoTentativas };
