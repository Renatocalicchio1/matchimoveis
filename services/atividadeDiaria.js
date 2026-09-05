// Diário de Atividade — Motor de Retenção, Fase 1/4 (ver CLAUDE.md).
// Um registro por ação real de valor que o corretor decide tomar — nunca
// evento automático/algorítmico (match encontrado sozinho, lead chegando
// por webhook). É a fonte de dados que faltava para calcular sequência
// (streak) e, depois, nível e ranking.
const { getPool, dbOk } = require('./db');

let _tabelaPronta = false;

async function _garantirTabela() {
  if (_tabelaPronta || !dbOk()) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atividade_diaria (
      id SERIAL PRIMARY KEY,
      usuario_id TEXT NOT NULL,
      tipo_acao TEXT NOT NULL,
      entidade_tipo TEXT,
      entidade_id TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_atividade_diaria_usuario ON atividade_diaria(usuario_id, criado_em)`);
  _tabelaPronta = true;
}

// Fire-and-forget: nunca deve derrubar a rota que chamou. Chamar sem `await`.
async function registrarAtividade(usuarioId, tipoAcao, opts) {
  if (!usuarioId || !tipoAcao) return;
  try {
    await _garantirTabela();
    if (!dbOk()) return;
    const o = opts || {};
    await getPool().query(
      `INSERT INTO atividade_diaria (usuario_id, tipo_acao, entidade_tipo, entidade_id) VALUES ($1,$2,$3,$4)`,
      [String(usuarioId), tipoAcao, o.entidadeTipo || null, o.entidadeId != null ? String(o.entidadeId) : null]
    );
    // Ação real sobre uma entidade fecha qualquer oportunidade aberta
    // daquele par (Fase 9) — mesmo insert, sem checagem nova nos call sites.
    if (o.entidadeTipo && o.entidadeId != null) {
      require('./oportunidades').marcarAgidaPorEntidade(usuarioId, o.entidadeTipo, o.entidadeId);
    }
    // Toda ação de valor é o gatilho de checagem de nível (Fase 5) — mesmo
    // padrão do afiliado (checa depois de todo evento relevante, barato
    // quando não promove).
    require('./nivelCorretor').checarPromocaoNivel(usuarioId);
  } catch (e) {
    console.error('[atividadeDiaria] falha ao registrar', tipoAcao, e.message);
  }
}

function _hojeBrasilia() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// Diferença em dias entre duas datas 'YYYY-MM-DD', com parse manual
// (nunca new Date('YYYY-MM-DD') — mesmo bug de timezone já corrigido
// no filtro de período de /app/visitas, ver CLAUDE.md).
function _diasEntre(depoisStr, antesStr) {
  const [ay, am, ad] = antesStr.split('-').map(Number);
  const [dy, dm, dd] = depoisStr.split('-').map(Number);
  const antes = new Date(ay, am - 1, ad).getTime();
  const depois = new Date(dy, dm - 1, dd).getTime();
  return Math.round((depois - antes) / 86400000);
}

// Streak = dias consecutivos (calendário de Brasília) com >=1 linha de
// atividade, contando pra trás a partir de hoje. Calculado sob demanda —
// não é um contador que só soma, pra nunca divergir da tabela real.
async function calcularStreak(usuarioId) {
  try {
    await _garantirTabela();
    if (!dbOk() || !usuarioId) return { atual: 0, ultimaData: null };
    const r = await getPool().query(
      `SELECT DISTINCT to_char((criado_em AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS dia
       FROM atividade_diaria WHERE usuario_id = $1
       ORDER BY dia DESC LIMIT 400`,
      [String(usuarioId)]
    );
    if (!r.rows.length) return { atual: 0, ultimaData: null };

    const dias = r.rows.map(row => row.dia);
    const hoje = _hojeBrasilia();
    const ontem = (() => {
      const [y, m, d] = hoje.split('-').map(Number);
      const dt = new Date(y, m - 1, d - 1);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    })();

    // Sem atividade hoje nem ontem: sequência quebrada.
    if (dias[0] !== hoje && dias[0] !== ontem) {
      return { atual: 0, ultimaData: dias[0] };
    }

    let atual = 1;
    for (let i = 0; i < dias.length - 1; i++) {
      if (_diasEntre(dias[i], dias[i + 1]) === 1) atual++;
      else break;
    }
    return { atual, ultimaData: dias[0] };
  } catch (e) {
    console.error('[atividadeDiaria] falha ao calcular streak', e.message);
    return { atual: 0, ultimaData: null };
  }
}

module.exports = { registrarAtividade, calcularStreak };
