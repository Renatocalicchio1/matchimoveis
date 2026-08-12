// Lista negra GLOBAL de contatos (telefone/email), separada da lista de
// "bloqueados" por conta (usuarios.dados.bloqueados, usada por
// POST /app/lead/:id/bloquear — essa continua existindo, só bloqueia pro
// corretor que clicou, sem tocar aqui).
//
// Alimentada só pela exclusão de lead feita por admin/sub-admin
// (/admin/buscar-lead/excluir) — exclusão feita pelo próprio corretor
// (DELETE /app/lead/:id) nunca escreve aqui, por pedido explícito (ago/2026):
// "se um usuario da app excluir somente exclui e nao bloqueia".
//
// Consultada nos mesmos pontos que já checavam bloqueados por conta
// (webhooks de portal + WhatsApp) — ver server.js.
const { query } = require('./db');

async function _garantirTabela() {
  await query(`CREATE TABLE IF NOT EXISTS bloqueios_globais (
    id SERIAL PRIMARY KEY,
    telefone TEXT, email TEXT, nome TEXT,
    bloqueado_por TEXT,
    criado_em TIMESTAMP DEFAULT NOW()
  )`);
}

function _norm8(telefone) {
  return (telefone || '').toString().replace(/\D/g, '').slice(-8);
}
function _normEmail(email) {
  return (email || '').toString().trim().toLowerCase();
}

async function bloquearGlobal({ telefone, email, nome, bloqueadoPor }) {
  await _garantirTabela();
  const tel = _norm8(telefone) ? (telefone || '').toString().replace(/\D/g, '') : '';
  const em = _normEmail(email);
  if (!tel && !em) return null;
  const r = await query(
    'INSERT INTO bloqueios_globais (telefone, email, nome, bloqueado_por) VALUES ($1,$2,$3,$4) RETURNING id',
    [tel || null, em || null, nome || '', bloqueadoPor || '']
  );
  return r.rows[0].id;
}

async function estaBloqueadoGlobal(telefone, email) {
  await _garantirTabela();
  const tel8 = _norm8(telefone);
  const em = _normEmail(email);
  if (!tel8 && !em) return false;
  const { rows } = await query(
    `SELECT 1 FROM bloqueios_globais
     WHERE ($1 <> '' AND right(regexp_replace(COALESCE(telefone,''),'\\D','','g'),8) = $1)
        OR ($2 <> '' AND lower(email) = $2)
     LIMIT 1`,
    [tel8, em]
  );
  return rows.length > 0;
}

async function listarBloqueiosGlobais() {
  await _garantirTabela();
  const { rows } = await query('SELECT * FROM bloqueios_globais ORDER BY criado_em DESC LIMIT 500');
  return rows;
}

module.exports = { bloquearGlobal, estaBloqueadoGlobal, listarBloqueiosGlobais };
