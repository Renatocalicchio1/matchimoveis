// Motor de Retenção, Fase 13 — Recuperação de usuários (ver CLAUDE.md).
// Segmentação por atividade real (atividade_diaria, Fase 4) — nunca por
// login (usuarios.ultimo_acesso só atualiza no login, não serve como
// sinal de uso real, mesmo gargalo já documentado na Fase 1).
const { getPool, dbOk } = require('./db');
const { calcularStreak } = require('./atividadeDiaria');

const SEGMENTOS = ['POWER_USER', 'ACTIVE', 'RETURNING', 'AT_RISK', 'DORMANT'];

// Maior intervalo (em dias) entre atividades consecutivas, olhando os
// últimos 90 dias — usado só pra distinguir ACTIVE de RETURNING (quem
// esfriou de verdade e voltou agora, não quem nunca parou).
async function _maiorGapDias(usuarioId) {
  try {
    const r = await getPool().query(
      `SELECT DISTINCT to_char((criado_em AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS dia
       FROM atividade_diaria WHERE usuario_id=$1 AND criado_em > now() - interval '90 days'
       ORDER BY dia ASC`,
      [String(usuarioId)]
    );
    const dias = r.rows.map(row => row.dia);
    if (dias.length < 2) return 0;
    let maiorGap = 0;
    for (let i = 1; i < dias.length; i++) {
      const [ay, am, ad] = dias[i - 1].split('-').map(Number);
      const [by, bm, bd] = dias[i].split('-').map(Number);
      const diff = Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
      if (diff > maiorGap) maiorGap = diff;
    }
    return maiorGap;
  } catch (e) { console.error('[segmentacaoUsuario] gap', e.message); return 0; }
}

async function segmentarUsuario(usuarioId) {
  if (!usuarioId || !dbOk()) return 'DORMANT';
  try {
    const pool = getPool();
    const r = await pool.query(`SELECT MAX(criado_em) AS ultima FROM atividade_diaria WHERE usuario_id=$1`, [String(usuarioId)]);
    const ultima = r.rows[0] && r.rows[0].ultima;
    if (!ultima) return 'DORMANT';
    const diasSemAtividade = (Date.now() - new Date(ultima).getTime()) / 86400000;

    if (diasSemAtividade > 14) return 'DORMANT';
    if (diasSemAtividade > 3) return 'AT_RISK';

    const [streak, nivelRow] = await Promise.all([
      calcularStreak(usuarioId),
      pool.query(`SELECT dados->>'nivelCorretor' AS nivel FROM usuarios WHERE codigo_usuario=$1 OR id=$1 LIMIT 1`, [String(usuarioId)])
    ]);
    const nivel = (nivelRow.rows[0] && nivelRow.rows[0].nivel) || 'NOVO';
    if (streak.atual >= 14 || nivel === 'ELITE' || nivel === 'MASTER') return 'POWER_USER';

    const maiorGap = await _maiorGapDias(usuarioId);
    if (maiorGap >= 14) return 'RETURNING';
    return 'ACTIVE';
  } catch (e) { console.error('[segmentacaoUsuario] segmentar', e.message); return 'DORMANT'; }
}

// Contagem por segmento pra dashboards (Fase 15) — 1 query por segmento
// seria caro pra base grande; aqui é a versão simples, corretor a
// corretor, pensada pra rodar num job/admin, não numa página de request
// síncrona por usuário logado.
async function contarSegmentos(usuarioIds) {
  const contagem = { POWER_USER: 0, ACTIVE: 0, RETURNING: 0, AT_RISK: 0, DORMANT: 0 };
  for (const uid of usuarioIds) {
    const seg = await segmentarUsuario(uid);
    contagem[seg] = (contagem[seg] || 0) + 1;
  }
  return contagem;
}

module.exports = { SEGMENTOS, segmentarUsuario, contarSegmentos };
