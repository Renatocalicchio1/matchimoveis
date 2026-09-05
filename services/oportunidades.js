// Entidade "Oportunidade" — Motor de Retenção, Fase 9 (ver CLAUDE.md).
// Resolve o gargalo #3 da auditoria: "oportunidade" hoje só é inferida na
// hora, nunca é um registro com estado. Ciclo de vida: novo → visto → agido,
// ou dispensado/expirado a qualquer momento a partir de novo/visto.
const { getPool, dbOk } = require('./db');

let _tabelaPronta = false;

async function _garantirTabela() {
  if (_tabelaPronta || !dbOk()) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oportunidades (
      id SERIAL PRIMARY KEY,
      usuario_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      entidade_tipo TEXT,
      entidade_id TEXT,
      estado TEXT NOT NULL DEFAULT 'novo',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      visto_em TIMESTAMPTZ,
      agido_em TIMESTAMPTZ,
      dispensado_em TIMESTAMPTZ,
      expirado_em TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_oportunidades_usuario_estado ON oportunidades(usuario_id, estado)`);
  // Dedup real: nunca duplica uma oportunidade do mesmo tipo, pra mesma
  // entidade, enquanto a anterior ainda estiver aberta (novo/visto).
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_oportunidades_dedup_aberta
    ON oportunidades(usuario_id, tipo, entidade_tipo, entidade_id)
    WHERE estado IN ('novo','visto')`);
  _tabelaPronta = true;
}

// → novo. Fire-and-forget: nunca deve derrubar quem chamou.
async function registrarOportunidade(usuarioId, tipo, opts) {
  if (!usuarioId || !tipo) return;
  try {
    await _garantirTabela();
    if (!dbOk()) return;
    const o = opts || {};
    await getPool().query(
      `INSERT INTO oportunidades (usuario_id, tipo, entidade_tipo, entidade_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      [String(usuarioId), tipo, o.entidadeTipo || null, o.entidadeId != null ? String(o.entidadeId) : null]
    );
  } catch (e) {
    console.error('[oportunidades] falha ao registrar', tipo, e.message);
  }
}

// novo → visto. Só por clique real (abrir a oportunidade), nunca só por
// ter aparecido numa lista — ver regra na Fase 3/9 do CLAUDE.md.
async function marcarVista(id) {
  if (!id) return;
  try {
    await _garantirTabela();
    if (!dbOk()) return;
    await getPool().query(
      `UPDATE oportunidades SET estado='visto', visto_em=now() WHERE id=$1 AND estado='novo'`,
      [id]
    );
  } catch (e) {
    console.error('[oportunidades] falha ao marcar vista', e.message);
  }
}

// novo/visto → agido. Fecha TODA oportunidade aberta daquela entidade —
// não só a do mesmo tipo — porque agir sobre a entidade (a lead, o imóvel)
// resolve qualquer pendência que estivesse aberta sobre ela.
async function marcarAgidaPorEntidade(usuarioId, entidadeTipo, entidadeId) {
  if (!usuarioId || !entidadeTipo || entidadeId == null) return;
  try {
    await _garantirTabela();
    if (!dbOk()) return;
    await getPool().query(
      `UPDATE oportunidades SET estado='agido', agido_em=now()
       WHERE usuario_id=$1 AND entidade_tipo=$2 AND entidade_id=$3 AND estado IN ('novo','visto')`,
      [String(usuarioId), entidadeTipo, String(entidadeId)]
    );
  } catch (e) {
    console.error('[oportunidades] falha ao marcar agida', e.message);
  }
}

// novo/visto → dispensado. Só por ação explícita do corretor (um "✕" no
// card) — nunca inferido, pra não classificar errado uma oportunidade que
// só ainda não foi vista.
async function marcarDispensada(id) {
  if (!id) return;
  try {
    await _garantirTabela();
    if (!dbOk()) return;
    await getPool().query(
      `UPDATE oportunidades SET estado='dispensado', dispensado_em=now() WHERE id=$1 AND estado IN ('novo','visto')`,
      [id]
    );
  } catch (e) {
    console.error('[oportunidades] falha ao dispensar', e.message);
  }
}

// novo/visto → expirado, depois de N dias sem desfecho. Não é "culpa" do
// corretor, só marca o fim natural da janela. Não é chamada por nenhum job
// ainda — função pronta para quando o job noturno for ligado.
async function expirarAntigas(dias) {
  try {
    await _garantirTabela();
    if (!dbOk()) return 0;
    const r = await getPool().query(
      `UPDATE oportunidades SET estado='expirado', expirado_em=now()
       WHERE estado IN ('novo','visto') AND criado_em < now() - ($1 || ' days')::interval`,
      [String(dias || 7)]
    );
    return r.rowCount;
  } catch (e) {
    console.error('[oportunidades] falha ao expirar', e.message);
    return 0;
  }
}

module.exports = { registrarOportunidade, marcarVista, marcarAgidaPorEntidade, marcarDispensada, expirarAntigas };
