// Motor de Retenção, Fase 5 — Sistema de Nível (ver CLAUDE.md).
// Mesmo mecanismo do Nível de Afiliados já em produção (server.js,
// _checarPromocaoAfiliado): métrica acumulada → limiar → promove → grava
// em `dados` JSONB (sem migração) → notifica. Só troca a métrica e os
// rótulos. Nível só sobe, nunca desce automaticamente por queda de
// atividade (mesma regra do afiliado) — conta que esfriar entra em
// segmentação de reengajamento (Fase 13), não perde nível ganho.
const { getPool, dbOk } = require('./db');
const { atualizarUsuario } = require('./salvarUsuario');
const { decidirNotificacao } = require('./notificationEngine');

const NIVEIS = ['NOVO', 'ATIVO', 'PRO', 'ELITE', 'MASTER'];

// Limiares ILUSTRATIVOS — ver CLAUDE.md: calibrar contra a distribuição
// real de "dias ativos totais" e "resultados" antes de considerar
// definitivo (não temos hoje o percentil real de cada faixa).
// 2 portões por nível (dias ativos E resultado comercial), não 1 score
// somado — evita subir de nível só spammando ação barata.
const LIMIARES = {
  ATIVO:  { diasAtivos: 15,  resultados: 1 },
  PRO:    { diasAtivos: 45,  resultados: 10 },
  ELITE:  { diasAtivos: 120, resultados: 30 },
  MASTER: { diasAtivos: 250, resultados: 80 }
};

async function _metricasNivel(usuarioId) {
  if (!dbOk() || !usuarioId) return { diasAtivos: 0, resultados: 0 };
  try {
    const pool = getPool();
    const rDias = await pool.query(
      `SELECT COUNT(DISTINCT to_char((criado_em AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD')) AS n
       FROM atividade_diaria WHERE usuario_id=$1`,
      [String(usuarioId)]
    );
    const rRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM atividade_diaria WHERE usuario_id=$1 AND tipo_acao IN ('visita_concluida','negocio_fechado')`,
      [String(usuarioId)]
    );
    return { diasAtivos: parseInt(rDias.rows[0] && rDias.rows[0].n || 0, 10), resultados: (rRes.rows[0] && rRes.rows[0].n) || 0 };
  } catch (e) { console.error('[nivelCorretor] metricas', e.message); return { diasAtivos: 0, resultados: 0 }; }
}

function _nivelAtingido(m) {
  let atual = 'NOVO';
  for (const n of NIVEIS.slice(1)) {
    const lim = LIMIARES[n];
    if (m.diasAtivos >= lim.diasAtivos && m.resultados >= lim.resultados) atual = n;
  }
  return atual;
}

// Chamada depois de qualquer ação de valor (mesmo gatilho de
// atividadeDiaria.registrarAtividade) — barata quando não há promoção
// (1 SELECT de leitura de nível atual + early-return), só grava/notifica
// quando de fato sobe.
async function checarPromocaoNivel(usuarioId) {
  if (!usuarioId || !dbOk()) return;
  try {
    const pool = getPool();
    const r = await pool.query(`SELECT dados->>'nivelCorretor' AS nivel FROM usuarios WHERE codigo_usuario=$1 OR id=$1 LIMIT 1`, [String(usuarioId)]);
    const nivelAtual = (r.rows[0] && r.rows[0].nivel) || 'NOVO';
    const m = await _metricasNivel(usuarioId);
    const nivelNovo = _nivelAtingido(m);
    if (NIVEIS.indexOf(nivelNovo) <= NIVEIS.indexOf(nivelAtual)) return;
    await atualizarUsuario(usuarioId, { nivelCorretor: nivelNovo });
    // Tier "reconhecimento" (Fase 7) — sino + cap diário, nunca push avulso.
    await decidirNotificacao(usuarioId, {
      tipo: 'nivel_promocao',
      tier: 'reconhecimento',
      titulo: '🚀 Você subiu de nível',
      mensagem: 'Sua consistência e seus resultados te colocaram no nível ' + nivelNovo + '.',
      dedupHoras: 24
    });
  } catch (e) { console.error('[nivelCorretor] checarPromocao', e.message); }
}

module.exports = { NIVEIS, LIMIARES, checarPromocaoNivel, _metricasNivel, _nivelAtingido };
