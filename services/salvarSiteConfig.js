const { query } = require('./db');

let _iniciado = false;
async function _inicializar() {
  if (_iniciado) return;
  _iniciado = true;
  await query(`
    CREATE TABLE IF NOT EXISTS site_config (
      user_id TEXT PRIMARY KEY,
      cor_primaria TEXT DEFAULT '#FF385C',
      logo_url TEXT,
      rodape_nome TEXT,
      rodape_telefone TEXT,
      rodape_endereco TEXT,
      rodape_texto TEXT,
      rodape_instagram TEXT,
      rodape_facebook TEXT,
      site_ativo BOOLEAN DEFAULT true,
      atualizado_em TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function buscarConfig(userId) {
  await _inicializar();
  const { rows } = await query(`SELECT * FROM site_config WHERE user_id=$1`, [userId]);
  return rows[0] || null;
}

async function salvarConfig(userId, dados) {
  await _inicializar();
  const campos = ['cor_primaria', 'logo_url', 'rodape_nome', 'rodape_telefone', 'rodape_endereco', 'rodape_texto', 'rodape_instagram', 'rodape_facebook', 'site_ativo'];
  const padroes = { cor_primaria: '#FF385C', site_ativo: true };
  const existente = await buscarConfig(userId);
  const valores = {};
  for (const c of campos) {
    if (dados.hasOwnProperty(c)) valores[c] = dados[c];
    else if (existente) valores[c] = existente[c];
    else valores[c] = padroes.hasOwnProperty(c) ? padroes[c] : null;
  }
  if (existente) {
    const sets = campos.map((c, i) => `${c}=$${i + 2}`).join(',');
    await query(`UPDATE site_config SET ${sets}, atualizado_em=NOW() WHERE user_id=$1`, [userId, ...campos.map(c => valores[c])]);
  } else {
    const cols = ['user_id', ...campos];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
    await query(`INSERT INTO site_config (${cols.join(',')}) VALUES (${placeholders})`, [userId, ...campos.map(c => valores[c])]);
  }
  return buscarConfig(userId);
}

module.exports = { buscarConfig, salvarConfig };
