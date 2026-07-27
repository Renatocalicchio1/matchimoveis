const { query } = require('./db');
const { v4: uuidv4 } = require('uuid');

let _iniciado = false;
async function _inicializar() {
  if (_iniciado) return;
  _iniciado = true;
  await query(`
    CREATE TABLE IF NOT EXISTS disparos_campanhas (
      id UUID PRIMARY KEY,
      nome_campanha TEXT NOT NULL,
      template_nome TEXT NOT NULL,
      template_idioma TEXT NOT NULL,
      mapeamento_variaveis JSONB DEFAULT '[]',
      status TEXT DEFAULT 'pendente',
      total_contatos INT DEFAULT 0,
      enviados INT DEFAULT 0,
      erros INT DEFAULT 0,
      delay_ms INT DEFAULT 2500,
      pausado BOOLEAN DEFAULT false,
      erro_geral TEXT,
      criado_em TIMESTAMP DEFAULT NOW(),
      criado_por TEXT,
      atualizado_em TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS disparos_contatos (
      id UUID PRIMARY KEY,
      campanha_id UUID NOT NULL REFERENCES disparos_campanhas(id) ON DELETE CASCADE,
      nome TEXT,
      telefone TEXT NOT NULL,
      variaveis JSONB DEFAULT '{}',
      status TEXT DEFAULT 'pendente',
      erro TEXT,
      tentativas INT DEFAULT 0,
      enviado_em TIMESTAMP,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_disparos_contatos_campanha ON disparos_contatos(campanha_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_disparos_contatos_status ON disparos_contatos(campanha_id, status)`);
}

async function criarCampanha({ nomeCampanha, templateNome, templateIdioma, mapeamentoVariaveis, delayMs, criadoPor }) {
  await _inicializar();
  const id = uuidv4();
  await query(
    `INSERT INTO disparos_campanhas (id, nome_campanha, template_nome, template_idioma, mapeamento_variaveis, delay_ms, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, nomeCampanha, templateNome, templateIdioma, JSON.stringify(mapeamentoVariaveis || []), delayMs || 2500, criadoPor || '']
  );
  return id;
}

async function inserirContatos(campanhaId, contatos) {
  await _inicializar();
  let inseridos = 0;
  for (const c of contatos) {
    if (!c.telefone) continue;
    await query(
      `INSERT INTO disparos_contatos (id, campanha_id, nome, telefone, variaveis) VALUES ($1,$2,$3,$4,$5)`,
      [uuidv4(), campanhaId, c.nome || '', c.telefone, JSON.stringify(c.variaveis || {})]
    );
    inseridos++;
  }
  if (inseridos > 0) {
    await query(`UPDATE disparos_campanhas SET total_contatos = total_contatos + $1 WHERE id=$2`, [inseridos, campanhaId]);
  }
  return inseridos;
}

async function atualizarCampanha(id, dados) {
  await _inicializar();
  const campos = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(dados)) {
    campos.push(`${k}=$${i}`);
    vals.push(v);
    i++;
  }
  campos.push(`atualizado_em=NOW()`);
  vals.push(id);
  await query(`UPDATE disparos_campanhas SET ${campos.join(',')} WHERE id=$${i}`, vals);
}

async function incrementarContador(id, campo) {
  await _inicializar();
  if (campo !== 'enviados' && campo !== 'erros') throw new Error('Campo de contador inválido');
  await query(`UPDATE disparos_campanhas SET ${campo}=${campo}+1, atualizado_em=NOW() WHERE id=$1`, [id]);
}

async function buscarCampanha(id) {
  await _inicializar();
  const { rows } = await query(`SELECT * FROM disparos_campanhas WHERE id=$1`, [id]);
  return rows[0] || null;
}

async function listarCampanhas() {
  await _inicializar();
  const { rows } = await query(`SELECT * FROM disparos_campanhas ORDER BY criado_em DESC LIMIT 100`);
  return rows;
}

async function listarContatos(campanhaId, { pagina = 1, status = '', q = '' } = {}) {
  await _inicializar();
  const offset = (pagina - 1) * 50;
  const params = [campanhaId];
  let where = 'WHERE campanha_id=$1';
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  if (q) { params.push('%' + q + '%'); where += ` AND (nome ILIKE $${params.length} OR telefone ILIKE $${params.length})`; }
  params.push(50); params.push(offset);
  const { rows } = await query(
    `SELECT id, nome, telefone, status, erro, enviado_em FROM disparos_contatos ${where} ORDER BY criado_em ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const { rows: tot } = await query(`SELECT COUNT(*) as total FROM disparos_contatos ${where}`, params.slice(0, -2));
  return { contatos: rows, total: parseInt(tot[0]?.total || 0) };
}

async function proximoLotePendente(campanhaId, limite) {
  await _inicializar();
  const { rows } = await query(
    `SELECT id, nome, telefone, variaveis FROM disparos_contatos WHERE campanha_id=$1 AND status='pendente' ORDER BY criado_em ASC LIMIT $2`,
    [campanhaId, limite]
  );
  return rows;
}

async function marcarContato(id, { status, erro, incrementarTentativa }) {
  await _inicializar();
  if (incrementarTentativa) {
    await query(
      `UPDATE disparos_contatos SET status=$1, erro=$2, tentativas=tentativas+1, enviado_em=CASE WHEN $1='enviado' THEN NOW() ELSE enviado_em END WHERE id=$3`,
      [status, erro || null, id]
    );
  } else {
    await query(
      `UPDATE disparos_contatos SET status=$1, erro=$2, enviado_em=CASE WHEN $1='enviado' THEN NOW() ELSE enviado_em END WHERE id=$3`,
      [status, erro || null, id]
    );
  }
}

async function statsCampanha(campanhaId) {
  await _inicializar();
  const { rows } = await query(`SELECT status, COUNT(*) as total FROM disparos_contatos WHERE campanha_id=$1 GROUP BY status`, [campanhaId]);
  return rows;
}

module.exports = {
  criarCampanha,
  inserirContatos,
  atualizarCampanha,
  incrementarContador,
  buscarCampanha,
  listarCampanhas,
  listarContatos,
  proximoLotePendente,
  marcarContato,
  statsCampanha
};
