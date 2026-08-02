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
    // Texto do anúncio (título/descrição/título secundário/CTA) — guardado pra
    // reaparecer nos campos quando o corretor clica em "Editar" (o criativo no
    // Meta é imutável, editar de verdade cria um criativo novo por trás)
    await query(`ALTER TABLE campanhas_meta ADD COLUMN IF NOT EXISTS titulo_anuncio TEXT`);
    await query(`ALTER TABLE campanhas_meta ADD COLUMN IF NOT EXISTS descricao_anuncio TEXT`);
    await query(`ALTER TABLE campanhas_meta ADD COLUMN IF NOT EXISTS titulo_secundario TEXT`);
    await query(`ALTER TABLE campanhas_meta ADD COLUMN IF NOT EXISTS cta_lead_form TEXT`);
  } catch(e) { console.error('[campanhas_meta boot]', e.message); }
}
// Guardado pra ser aguardado em toda função exportada — sem isso, a 1ª
// chamada logo após o require() podia rodar a query antes do CREATE TABLE
// IF NOT EXISTS terminar ("relation campanhas_meta does not exist")
const _tabelaPronta = _criarTabelaCampanhasMeta();

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
    criadoEm: r.criado_em,
    tituloAnuncio: r.titulo_anuncio || '',
    descricaoAnuncio: r.descricao_anuncio || '',
    tituloSecundario: r.titulo_secundario || '',
    ctaLeadForm: r.cta_lead_form || ''
  };
}

async function criarCampanhaRegistro(c) {
  await _tabelaPronta;
  const r = await query(
    `INSERT INTO campanhas_meta (user_id, imovel_id, objetivo, orcamento_diario_centavos, publico,
       conta_anuncio_id, page_id, campaign_id, adset_id, creative_id, ad_id, leadform_id, status,
       titulo_anuncio, descricao_anuncio, titulo_secundario, cta_lead_form)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [c.userId, c.imovelId, c.objetivo, c.orcamentoDiarioCentavos || 0, JSON.stringify(c.publico || {}),
     c.contaAnuncioId, c.pageId, c.campaignId, c.adsetId, c.creativeId, c.adId, c.leadformId || null, c.status || 'pausada',
     c.tituloAnuncio || null, c.descricaoAnuncio || null, c.tituloSecundario || null, c.ctaLeadForm || null]
  );
  return rowToCampanha(r.rows[0]);
}

async function listarCampanhas(userId) {
  await _tabelaPronta;
  const r = await query('SELECT * FROM campanhas_meta WHERE user_id=$1 ORDER BY id DESC', [userId]);
  return r.rows.map(rowToCampanha);
}

async function buscarCampanha(id, userId) {
  await _tabelaPronta;
  const r = await query('SELECT * FROM campanhas_meta WHERE id=$1 AND user_id=$2', [id, userId]);
  return r.rows[0] ? rowToCampanha(r.rows[0]) : null;
}

async function buscarCampanhaPorAdId(adId) {
  await _tabelaPronta;
  const r = await query('SELECT * FROM campanhas_meta WHERE ad_id=$1', [adId]);
  return r.rows[0] ? rowToCampanha(r.rows[0]) : null;
}

async function buscarCampanhaPorLeadformId(leadformId) {
  await _tabelaPronta;
  const r = await query('SELECT * FROM campanhas_meta WHERE leadform_id=$1', [leadformId]);
  return r.rows[0] ? rowToCampanha(r.rows[0]) : null;
}

// Atribuição do objetivo "Página do imóvel" (trafego) — não tem leadform_id/ad_id
// pra casar como os outros 2 objetivos, então usa o imóvel em si: pega a
// campanha de tráfego mais recente pra esse imóvel, sem filtrar por status local
// (a campanha pode ter sido ativada direto no Gerenciador de Anúncios do Meta,
// não só pelo botão "Editar" daqui — o status local nem sempre reflete a realidade)
async function buscarCampanhaAtivaPorImovel(imovelId, objetivo) {
  await _tabelaPronta;
  const r = await query('SELECT * FROM campanhas_meta WHERE imovel_id=$1 AND objetivo=$2 ORDER BY id DESC LIMIT 1', [String(imovelId), objetivo]);
  return r.rows[0] ? rowToCampanha(r.rows[0]) : null;
}

async function atualizarStatusCampanha(id, status) {
  await _tabelaPronta;
  await query('UPDATE campanhas_meta SET status=$1 WHERE id=$2', [status, id]);
}

async function atualizarOrcamentoCampanha(id, orcamentoDiarioCentavos) {
  await _tabelaPronta;
  await query('UPDATE campanhas_meta SET orcamento_diario_centavos=$1 WHERE id=$2', [orcamentoDiarioCentavos, id]);
}

async function atualizarPublicoCampanha(id, publico) {
  await _tabelaPronta;
  await query('UPDATE campanhas_meta SET publico=$1 WHERE id=$2', [JSON.stringify(publico || {}), id]);
}

// Criativo é imutável no Meta — "editar" de verdade cria um criativo novo e
// troca o anúncio pra apontar pra ele; aqui só grava o resultado pra reaparecer
// nos campos da próxima vez que o corretor clicar em Editar
async function atualizarCreativeCampanha(id, { creativeId, tituloAnuncio, descricaoAnuncio, tituloSecundario, ctaLeadForm }) {
  await _tabelaPronta;
  await query(
    `UPDATE campanhas_meta SET creative_id=$1, titulo_anuncio=$2, descricao_anuncio=$3, titulo_secundario=$4, cta_lead_form=$5 WHERE id=$6`,
    [creativeId, tituloAnuncio || null, descricaoAnuncio || null, tituloSecundario || null, ctaLeadForm || null, id]
  );
}

async function excluirCampanhaRegistro(id, userId) {
  await _tabelaPronta;
  await query('DELETE FROM campanhas_meta WHERE id=$1 AND user_id=$2', [id, userId]);
}

async function incrementarLeadsRecebidos(id) {
  await _tabelaPronta;
  await query('UPDATE campanhas_meta SET leads_recebidos = leads_recebidos + 1 WHERE id=$1', [id]);
}

module.exports = {
  criarCampanhaRegistro,
  listarCampanhas,
  buscarCampanha,
  buscarCampanhaPorAdId,
  buscarCampanhaPorLeadformId,
  buscarCampanhaAtivaPorImovel,
  atualizarStatusCampanha,
  atualizarOrcamentoCampanha,
  atualizarPublicoCampanha,
  atualizarCreativeCampanha,
  excluirCampanhaRegistro,
  incrementarLeadsRecebidos
};
