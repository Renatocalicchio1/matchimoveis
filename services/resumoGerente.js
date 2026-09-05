// Motor de Retenção, Fase 12 — "IA como gerente comercial" (ver CLAUDE.md).
// Fonte única de dado usada por 2 superfícies: a saudação do assistente
// (cerebro/index.js, responderSaudacao) e o intent "resumo_diario" da
// Central Operacional (services/centralOperacional.js) — pra nunca uma
// contradizer a outra. Só junta sinais já reais das Fases 4/9/10/11,
// nunca gera dado novo.
const { getPool, dbOk } = require('./db');
const { calcularStreak } = require('./atividadeDiaria');
const { calcularPosicao } = require('./rankingCorretor');

async function _oportunidadesAbertas(usuarioId) {
  if (!dbOk() || !usuarioId) return { total: 0, urgente: null };
  try {
    const r = await getPool().query(
      `SELECT entidade_id, criado_em FROM oportunidades WHERE usuario_id=$1 AND estado IN ('novo','visto') ORDER BY criado_em ASC`,
      [String(usuarioId)]
    );
    const maisAntiga = r.rows[0] || null;
    return {
      total: r.rows.length,
      urgente: maisAntiga ? { entidadeId: maisAntiga.entidade_id, horas: Math.round((Date.now() - new Date(maisAntiga.criado_em).getTime()) / 3600000) } : null
    };
  } catch (e) { console.error('[resumoGerente] oportunidades', e.message); return { total: 0, urgente: null }; }
}

async function _resolvidasRecentemente(usuarioId, horas) {
  if (!dbOk() || !usuarioId) return 0;
  try {
    const r = await getPool().query(
      `SELECT COUNT(*)::int AS n FROM oportunidades WHERE usuario_id=$1 AND estado='agido' AND agido_em > now() - ($2 || ' hours')::interval`,
      [String(usuarioId), String(horas || 48)]
    );
    return r.rows[0] ? r.rows[0].n : 0;
  } catch (e) { console.error('[resumoGerente] resolvidas', e.message); return 0; }
}

async function montarResumoGerente(usuarioId) {
  const [streak, oportunidades, resolvidas48h, ranking] = await Promise.all([
    calcularStreak(usuarioId),
    _oportunidadesAbertas(usuarioId),
    _resolvidasRecentemente(usuarioId, 48),
    calcularPosicao(usuarioId).catch(() => null)
  ]);
  return { streak, oportunidades, resolvidas48h, ranking };
}

module.exports = { montarResumoGerente };
