// Motor de Retenção, Fase 6 — Ranking (ver CLAUDE.md). Por TAXA, não
// volume (nunca recompensa quem faz mais ação barata); só dentro do
// mesmo grupo de pares (tipo de conta + estado de atuação — não compara
// conta grande de rede com corretor autônomo); privado por padrão
// (usuarios.dados.rankingOptIn); ZERO ligação com
// services/distribuicaoAreaAtuacao.js — puramente reconhecimento.
const { getPool, dbOk } = require('./db');

const _CTE_BASE = `
  WITH base AS (
    SELECT
      COALESCE(u.codigo_usuario, u.id) AS uid,
      u.tipo,
      u.dados->>'areaAtuacaoEstado' AS estado,
      COALESCE((u.dados->>'rankingOptIn')::boolean, false) AS opt_in,
      u.nome,
      u.dados->>'nivelCorretor' AS nivel
    FROM usuarios u
    WHERE u.ativo = true AND u.dados->>'areaAtuacaoEstado' IS NOT NULL
  ),
  visitas_agg AS (
    SELECT COALESCE(v.user_id, v.corretor_id, v.owner_user_id) AS uid,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE v.status IN ('confirmada','lead_confirmou','realizada')) AS confirmadas,
      -- pipelineStatus não é coluna própria — vive em visitas.dados JSONB
      -- (mesmo padrão de usuarios.dados), gravado por /app/visitas/fechado/:id.
      COUNT(*) FILTER (WHERE v.dados->>'pipelineStatus' = 'FECHADO') AS fechados
    FROM visitas v GROUP BY 1
  ),
  leads_agg AS (
    SELECT COALESCE(l.user_id, l.codigo_usuario) AS uid,
      COUNT(*) AS total
    FROM leads l GROUP BY 1
  ),
  score AS (
    SELECT b.uid, b.tipo, b.estado, b.opt_in, b.nome, b.nivel,
      COALESCE(va.total, 0) AS total_visitas,
      COALESCE(la.total, 0) AS total_leads,
      (
        COALESCE(COALESCE(va.confirmadas,0)::numeric / NULLIF(va.total,0), 0) +
        COALESCE(COALESCE(va.fechados,0)::numeric / NULLIF(la.total,0), 0)
      ) / 2.0 AS score,
      COALESCE(COALESCE(va.confirmadas,0)::numeric / NULLIF(va.total,0), 0) AS taxa_confirmacao,
      COALESCE(COALESCE(va.fechados,0)::numeric / NULLIF(la.total,0), 0) AS taxa_conversao
    FROM base b
    LEFT JOIN visitas_agg va ON va.uid = b.uid
    LEFT JOIN leads_agg la ON la.uid = b.uid
  )
`;

// "Sua posição" — só entre quem tem pelo menos 1 visita ou 1 lead (evita
// ranquear conta sem nenhuma atividade real, que teria score 0 artificial).
async function calcularPosicao(usuarioId) {
  if (!dbOk() || !usuarioId) return null;
  try {
    const pool = getPool();
    const sql = _CTE_BASE + `
      , elegiveis AS (SELECT * FROM score WHERE total_visitas > 0 OR total_leads > 0),
      ranqueado AS (
        SELECT *, RANK() OVER (PARTITION BY tipo, estado ORDER BY score DESC) AS posicao,
          COUNT(*) OVER (PARTITION BY tipo, estado) AS total_grupo
        FROM elegiveis
      )
      SELECT * FROM ranqueado WHERE uid = $1
    `;
    const r = await pool.query(sql, [String(usuarioId)]);
    if (!r.rows.length) return null;
    const row = r.rows[0];
    // Grupo pequeno demais não gera comparação estatisticamente útil —
    // mesma regra de quietude das outras fases: sem dado suficiente, não
    // finge que existe ranking.
    if (parseInt(row.total_grupo, 10) < 5) return null;
    return {
      posicao: parseInt(row.posicao, 10),
      totalGrupo: parseInt(row.total_grupo, 10),
      tipo: row.tipo,
      estado: row.estado,
      taxaConfirmacao: Math.round(Number(row.taxa_confirmacao) * 100),
      taxaConversao: Math.round(Number(row.taxa_conversao) * 100)
    };
  } catch (e) { console.error('[rankingCorretor] calcularPosicao', e.message); return null; }
}

// Lista pública — só quem optou por aparecer (rankingOptIn=true).
async function topOptIn(tipo, estado, limite) {
  if (!dbOk() || !tipo || !estado) return [];
  try {
    const pool = getPool();
    const sql = _CTE_BASE + `
      SELECT nome, nivel, score FROM score
      WHERE opt_in = true AND tipo = $1 AND estado = $2 AND (total_visitas > 0 OR total_leads > 0)
      ORDER BY score DESC LIMIT $3
    `;
    const r = await pool.query(sql, [tipo, estado, limite || 3]);
    return r.rows.map(row => ({ nome: row.nome, nivel: row.nivel || 'NOVO' }));
  } catch (e) { console.error('[rankingCorretor] topOptIn', e.message); return []; }
}

module.exports = { calcularPosicao, topOptIn };
