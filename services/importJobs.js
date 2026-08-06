const { query } = require('./db');

let _colunaRelancamentosOk = false;
async function _garantirColunaRelancamentos() {
  if (_colunaRelancamentosOk) return;
  _colunaRelancamentosOk = true;
  await query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS relancamentos INT DEFAULT 0`);
}

async function criarJob(tipo, usuarioId, arquivo) {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  await query(
    `INSERT INTO import_jobs (id, tipo, usuario_id, status, arquivo) VALUES ($1,$2,$3,'pendente',$4)`,
    [id, tipo, usuarioId, arquivo || '']
  );
  return id;
}

async function atualizarJob(id, dados) {
  const campos = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(dados)) {
    campos.push(`${k}=$${i}`);
    vals.push(v);
    i++;
  }
  campos.push(`updated_at=NOW()`);
  vals.push(id);
  await query(`UPDATE import_jobs SET ${campos.join(',')} WHERE id=$${i}`, vals);
}

async function buscarJob(id) {
  const { rows } = await query(`SELECT * FROM import_jobs WHERE id=$1`, [id]);
  return rows[0] || null;
}

// Jobs presos em "processando" sem atualização há X minutos — indica worker_thread
// morto abruptamente (ex.: deploy no meio da importação). Limita relançamentos pra
// não reprocessar pra sempre um job cujo arquivo/URL de origem não é mais válido.
async function listarJobsTravados(minutos = 10, maxRelancamentos = 2) {
  await _garantirColunaRelancamentos();
  const { rows } = await query(
    `SELECT * FROM import_jobs WHERE status='processando' AND updated_at < NOW() - ($1 || ' minutes')::interval AND COALESCE(relancamentos,0) < $2`,
    [minutos, maxRelancamentos]
  );
  return rows;
}

module.exports = { criarJob, atualizarJob, buscarJob, listarJobsTravados };
