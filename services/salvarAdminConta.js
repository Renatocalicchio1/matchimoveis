const { query } = require('./db');

// Contas de admin secundárias — login separado do superadmin (que continua
// sendo o par ADMIN_USER/ADMIN_PASSWORD do .env, sem registro nessa tabela).
// `permissoes` guarda as chaves de _ADMIN_NAV (server.js) que essa conta
// pode acessar — checado em authAdmin a cada requisição sob /admin.
// Paleta pra "cor da conta" — usada pra colorir a linha da lead quando essa
// conta clica em "Falar por WhatsApp" (ver /admin/campanha/contatos/:id/atender
// em server.js), assim dá pra ver de relance quem já está tratando quem.
// Cíclica por ordem de criação — superadmin pode trocar depois pelo botão
// "🎨 Cor" em /admin/contas-admin (ex: pedido de jul/2026 pra deixar o
// Rafael verde e o Bruno azul, que por acaso já são os 2 primeiros da
// paleta — mas não dá pra garantir isso de fora sem acesso ao banco real).
const _PALETA_CORES = ['#16a34a', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

let _tabelaPronta = false;
async function _garantirTabela() {
  if (_tabelaPronta) return;
  await query(`CREATE TABLE IF NOT EXISTS admin_contas (
    id SERIAL PRIMARY KEY,
    usuario TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    nome TEXT,
    permissoes JSONB DEFAULT '[]'::jsonb,
    ativo BOOLEAN DEFAULT true,
    criado_por TEXT,
    criado_em TIMESTAMP DEFAULT NOW(),
    ultimo_login TIMESTAMP
  )`);
  await query(`ALTER TABLE admin_contas ADD COLUMN IF NOT EXISTS cor TEXT`);
  await _backfillCores();
  _tabelaPronta = true;
}

// Contas criadas antes da coluna "cor" existir ficam sem cor (NULL) — dá
// uma cor da paleta pra cada uma, na ordem de criação, 1x só.
async function _backfillCores() {
  const { rows } = await query('SELECT id FROM admin_contas WHERE cor IS NULL ORDER BY criado_em ASC');
  for (let i = 0; i < rows.length; i++) {
    await query('UPDATE admin_contas SET cor=$1 WHERE id=$2', [_PALETA_CORES[i % _PALETA_CORES.length], rows[i].id]);
  }
}

function _rowToConta(r) {
  if (!r) return null;
  return {
    id: r.id,
    usuario: r.usuario,
    senhaHash: r.senha_hash,
    nome: r.nome || '',
    permissoes: Array.isArray(r.permissoes) ? r.permissoes : [],
    ativo: r.ativo,
    cor: r.cor || '#6b7280',
    criadoPor: r.criado_por || '',
    criadoEm: r.criado_em,
    ultimoLogin: r.ultimo_login
  };
}

async function listarAdminContas() {
  await _garantirTabela();
  const { rows } = await query('SELECT * FROM admin_contas ORDER BY criado_em DESC');
  return rows.map(_rowToConta);
}

async function buscarAdminConta(usuario) {
  await _garantirTabela();
  const { rows } = await query('SELECT * FROM admin_contas WHERE usuario=$1 LIMIT 1', [String(usuario || '').trim()]);
  return _rowToConta(rows[0]);
}

async function buscarAdminContaPorId(id) {
  await _garantirTabela();
  const { rows } = await query('SELECT * FROM admin_contas WHERE id=$1 LIMIT 1', [id]);
  return _rowToConta(rows[0]);
}

async function criarAdminConta({ usuario, senhaHash, nome, permissoes, criadoPor }) {
  await _garantirTabela();
  const { rows: existentes } = await query('SELECT COUNT(*)::int AS total FROM admin_contas');
  const cor = _PALETA_CORES[(existentes[0]?.total || 0) % _PALETA_CORES.length];
  const { rows } = await query(
    `INSERT INTO admin_contas (usuario, senha_hash, nome, permissoes, criado_por, cor) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [String(usuario).trim(), senhaHash, nome || '', JSON.stringify(permissoes || []), criadoPor || '', cor]
  );
  return _rowToConta(rows[0]);
}

async function atualizarPermissoesAdminConta(id, permissoes) {
  await _garantirTabela();
  await query('UPDATE admin_contas SET permissoes=$1 WHERE id=$2', [JSON.stringify(permissoes || []), id]);
}

async function atualizarCorAdminConta(id, cor) {
  await _garantirTabela();
  await query('UPDATE admin_contas SET cor=$1 WHERE id=$2', [cor, id]);
}

async function atualizarSenhaAdminConta(id, senhaHash) {
  await _garantirTabela();
  await query('UPDATE admin_contas SET senha_hash=$1 WHERE id=$2', [senhaHash, id]);
}

async function atualizarAtivoAdminConta(id, ativo) {
  await _garantirTabela();
  await query('UPDATE admin_contas SET ativo=$1 WHERE id=$2', [!!ativo, id]);
}

async function atualizarUltimoLoginAdminConta(id) {
  await _garantirTabela();
  await query('UPDATE admin_contas SET ultimo_login=NOW() WHERE id=$1', [id]);
}

async function deletarAdminConta(id) {
  await _garantirTabela();
  await query('DELETE FROM admin_contas WHERE id=$1', [id]);
}

module.exports = {
  listarAdminContas, buscarAdminConta, buscarAdminContaPorId, criarAdminConta,
  atualizarPermissoesAdminConta, atualizarSenhaAdminConta, atualizarAtivoAdminConta,
  atualizarCorAdminConta, atualizarUltimoLoginAdminConta, deletarAdminConta
};
