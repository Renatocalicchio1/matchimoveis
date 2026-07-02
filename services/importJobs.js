const { query } = require('./db');

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

module.exports = { criarJob, atualizarJob, buscarJob };
