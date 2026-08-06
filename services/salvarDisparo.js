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
  // corretor_user_id: pra quem os botões de link "Sim, eu tenho!"/"Quero ajuda pra
  // cadastrar!" apontam (/captar/{corretor_user_id}?tel={telefone}) — nulo pra
  // campanhas sem botão de URL dinâmica (só corpo de texto).
  await query(`ALTER TABLE disparos_campanhas ADD COLUMN IF NOT EXISTS corretor_user_id TEXT`);
  // Telefones que clicaram "Não tenho imóvel" (resposta rápida) no webhook do Cloud
  // API — opt-out global, não fica preso a campanha/corretor específico porque a
  // planilha de disparo não tem dono.
  await query(`
    CREATE TABLE IF NOT EXISTS disparos_optout (
      telefone TEXT PRIMARY KEY,
      origem TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE disparos_campanhas ADD COLUMN IF NOT EXISTS relancamentos INT DEFAULT 0`);
}

async function marcarOptout(telefone, origem) {
  await _inicializar();
  await query(
    `INSERT INTO disparos_optout (telefone, origem) VALUES ($1,$2) ON CONFLICT (telefone) DO NOTHING`,
    [telefone, origem || '']
  );
}

async function listarOptout(telefones) {
  await _inicializar();
  if (!telefones || !telefones.length) return [];
  const { rows } = await query(`SELECT telefone FROM disparos_optout WHERE telefone = ANY($1)`, [telefones]);
  return rows.map(r => r.telefone);
}

// Telefones que já receberam disparo com sucesso em QUALQUER campanha anterior —
// evita reenvio duplicado quando os 50k contatos são subidos em lotes/planilhas
// separadas ao longo do tempo (inserirContatos só olhava optout antes disso).
async function listarJaEnviados(telefones) {
  await _inicializar();
  if (!telefones || !telefones.length) return [];
  const { rows } = await query(
    `SELECT DISTINCT telefone FROM disparos_contatos WHERE telefone = ANY($1) AND status='enviado'`,
    [telefones]
  );
  return rows.map(r => r.telefone);
}

async function criarCampanha({ nomeCampanha, templateNome, templateIdioma, mapeamentoVariaveis, delayMs, criadoPor, corretorUserId }) {
  await _inicializar();
  const id = uuidv4();
  await query(
    `INSERT INTO disparos_campanhas (id, nome_campanha, template_nome, template_idioma, mapeamento_variaveis, delay_ms, criado_por, corretor_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, nomeCampanha, templateNome, templateIdioma, JSON.stringify(mapeamentoVariaveis || []), delayMs || 2500, criadoPor || '', corretorUserId || null]
  );
  return id;
}

async function inserirContatos(campanhaId, contatos) {
  await _inicializar();
  const telefones = [...new Set(contatos.map(c => c.telefone).filter(Boolean))];
  const optados = new Set(await listarOptout(telefones));
  const jaEnviadosSet = new Set(await listarJaEnviados(telefones));
  let inseridos = 0, optout = 0, jaEnviados = 0;
  for (const c of contatos) {
    if (!c.telefone) continue;
    const emOptout = optados.has(c.telefone);
    const jaFoiEnviado = !emOptout && jaEnviadosSet.has(c.telefone);
    const status = emOptout ? 'optout' : jaFoiEnviado ? 'ja_enviado' : 'pendente';
    await query(
      `INSERT INTO disparos_contatos (id, campanha_id, nome, telefone, variaveis, status) VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuidv4(), campanhaId, c.nome || '', c.telefone, JSON.stringify(c.variaveis || {}), status]
    );
    inseridos++;
    if (emOptout) optout++;
    if (jaFoiEnviado) jaEnviados++;
  }
  if (inseridos > 0) {
    await query(`UPDATE disparos_campanhas SET total_contatos = total_contatos + $1 WHERE id=$2`, [inseridos, campanhaId]);
  }
  return { inseridos, optout, jaEnviados };
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

// Campanhas presas em "enviando" sem atualização há X minutos — indica worker_thread
// morto abruptamente (ex.: deploy no meio do disparo). Limita relançamentos pra não
// tentar pra sempre uma campanha que trava por outro motivo (ex.: token expirado).
async function listarCampanhasTravadas(minutos = 10, maxRelancamentos = 2) {
  await _inicializar();
  const { rows } = await query(
    `SELECT * FROM disparos_campanhas WHERE status='enviando' AND pausado=false AND atualizado_em < NOW() - ($1 || ' minutes')::interval AND COALESCE(relancamentos,0) < $2`,
    [minutos, maxRelancamentos]
  );
  return rows;
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
  statsCampanha,
  marcarOptout,
  listarOptout,
  listarJaEnviados,
  listarCampanhasTravadas
};
