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
      dominio_personalizado TEXT,
      dominio_status TEXT DEFAULT 'nao_configurado',
      dominio_verificado_em TIMESTAMP,
      cloudflare_hostname_id TEXT,
      atualizado_em TIMESTAMP DEFAULT NOW()
    )
  `);
  // Migração pra tabelas criadas antes dos campos de domínio próprio existirem
  await query(`ALTER TABLE site_config ADD COLUMN IF NOT EXISTS dominio_personalizado TEXT`);
  await query(`ALTER TABLE site_config ADD COLUMN IF NOT EXISTS dominio_status TEXT DEFAULT 'nao_configurado'`);
  await query(`ALTER TABLE site_config ADD COLUMN IF NOT EXISTS dominio_verificado_em TIMESTAMP`);
  await query(`ALTER TABLE site_config ADD COLUMN IF NOT EXISTS cloudflare_hostname_id TEXT`);
  await query(`ALTER TABLE site_config ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT`);
  await query(`ALTER TABLE site_config ADD COLUMN IF NOT EXISTS google_analytics_id TEXT`);
  await query(`ALTER TABLE site_config ADD COLUMN IF NOT EXISTS cor_cabecalho TEXT`);
  await query(`ALTER TABLE site_config ADD COLUMN IF NOT EXISTS cor_rodape TEXT`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_site_config_dominio ON site_config(dominio_personalizado) WHERE dominio_personalizado IS NOT NULL AND dominio_personalizado != ''`);
}

async function buscarConfig(userId) {
  await _inicializar();
  const { rows } = await query(`SELECT * FROM site_config WHERE user_id=$1`, [userId]);
  return rows[0] || null;
}

async function buscarConfigPorDominio(dominio) {
  await _inicializar();
  const { rows } = await query(`SELECT * FROM site_config WHERE dominio_personalizado=$1 AND dominio_status='verificado'`, [(dominio || '').toLowerCase().trim()]);
  return rows[0] || null;
}

async function salvarConfig(userId, dados) {
  await _inicializar();
  const campos = ['cor_primaria', 'cor_cabecalho', 'cor_rodape', 'logo_url', 'rodape_nome', 'rodape_telefone', 'rodape_endereco', 'rodape_texto', 'rodape_instagram', 'rodape_facebook', 'site_ativo', 'dominio_personalizado', 'dominio_status', 'dominio_verificado_em', 'cloudflare_hostname_id', 'meta_pixel_id', 'google_analytics_id'];
  const padroes = { cor_primaria: '#FF385C', site_ativo: true, dominio_status: 'nao_configurado' };
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

module.exports = { buscarConfig, buscarConfigPorDominio, salvarConfig };
