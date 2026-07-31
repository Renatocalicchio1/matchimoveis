const { query, dbOk } = require('./db');

async function _criarTabelaCampanhasMeta() {
  try {
    if (!await dbOk()) return;
    await query(`CREATE TABLE IF NOT EXISTS campanhas_meta (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      imovel_id TEXT NOT NULL,
      objetivo TEXT NOT NULL,
      orcamento_diario_centavos INTEGER,
      publico JSONB DEFAULT '{}',
      conta_anuncio_id TEXT,
      page_id TEXT,
      campaign_id TEXT,
      adset_id TEXT,
      creative_id TEXT,
      ad_id TEXT,
      leadform_id TEXT,
      status TEXT DEFAULT 'pausada',
      leads_recebidos INTEGER DEFAULT 0,
      erro TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )`);
  } catch(e) { console.error('[campanhas_meta boot]', e.message); }
}
_criarTabelaCampanhasMeta();

function rowToCampanha(r) {
  return {
    id: r.id,
    userId: r.user_id,
    imovelId: r.imovel_id,
    objetivo: r.objetivo,
    orcamentoDiarioCentavos: r.orcamento_diario_centavos,
    publico: r.publico || {},
    contaAnuncioId: r.conta_anuncio_id,
    pageId: r.page_id,
    campaignId: r.campaign_id,
    adsetId: r.adset_id,
    creativeId: r.creative_id,
    adId: r.ad_id,
    leadformId: r.leadform_id,
    status: r.status,
    leadsRecebidos: r.leads_recebidos,
    erro: r.erro,
    criadoEm: r.criado_em
  };
}

async function criarCampanhaRegistro(c) {
  const r = await query(
    `INSERT INTO campanhas_meta (user_id, imovel_id, objetivo, orcamento_diario_centavos, publico,
       conta_anuncio_id, page_id, campaign_id, adset_id, creative_id, ad_id, leadform_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [c.userId, c.imovelId, c.objetivo, c.orcamentoDiarioCentavos || 0, JSON.stringify(c.publico || {}),
     c.contaAnuncioId, c.pageId, c.campaignId, c.adsetId, c.creativeId, c.adId, c.leadformId || null, c.status || 'pausada']
  );
  return rowToCampanha(r.rows[0]);
}

async function listarCampanhas(userId) {
  const r = await query('SELECT * FROM campanhas_meta WHERE user_id=$1 ORDER BY id DESC', [userId]);
  return r.rows.map(rowToCampanha);
}

async function buscarCampanha(id, userId) {
  const r = await query('SELECT * FROM campanhas_meta WHERE id=$1 AND user_id=$2', [id, userId]);
  return r.rows[0] ? rowToCampanha(r.rows[0]) : null;
}

async function buscarCampanhaPorAdId(adId) {
  const r = await query('SELECT * FROM campanhas_meta WHERE ad_id=$1', [adId]);
  return r.rows[0] ? rowToCampanha(r.rows[0]) : null;
}

async function buscarCampanhaPorLeadformId(leadformId) {
  const r = await query('SELECT * FROM campanhas_meta WHERE leadform_id=$1', [leadformId]);
  return r.rows[0] ? rowToCampanha(r.rows[0]) : null;
}

async function atualizarStatusCampanha(id, status) {
  await query('UPDATE campanhas_meta SET status=$1 WHERE id=$2', [status, id]);
}

async function incrementarLeadsRecebidos(id) {
  await query('UPDATE campanhas_meta SET leads_recebidos = leads_recebidos + 1 WHERE id=$1', [id]);
}

module.exports = {
  criarCampanhaRegistro,
  listarCampanhas,
  buscarCampanha,
  buscarCampanhaPorAdId,
  buscarCampanhaPorLeadformId,
  atualizarStatusCampanha,
  incrementarLeadsRecebidos
};
