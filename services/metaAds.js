const axios = require('axios');

// Marketing API do Meta — diferente do "Instagram Login" usado em
// services/instagram.js (esse aqui é OAuth padrão do Facebook, porque
// campanha paga exige Conta de Anúncios + Página, coisas que só existem
// no lado do Facebook/Business Manager). Reusa FACEBOOK_APP_ID/SECRET —
// mesmo app do Instagram, só que pedindo permissões extras (ads_management,
// pages_manage_ads, leads_retrieval), que exigem aprovação separada do
// Meta (App Review) antes de funcionar em produção.
const API_VERSION = 'v21.0';
const GRAPH_URL = `https://graph.facebook.com/${API_VERSION}`;
const AUTHORIZE_URL = 'https://www.facebook.com/' + API_VERSION + '/dialog/oauth';
const SCOPES = 'ads_management,pages_show_list,pages_manage_ads,pages_read_engagement,leads_retrieval,business_management';

function baseUrl() {
  return process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
}

function redirectUri() {
  return baseUrl() + '/app/meta-ads/callback';
}

function _erroGraph(e, fallback) {
  const msg = e?.response?.data?.error?.error_user_msg || e?.response?.data?.error?.message;
  return new Error(msg || fallback || e.message);
}

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID || '',
    redirect_uri: redirectUri(),
    scope: SCOPES,
    response_type: 'code',
    state: state || ''
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function trocarCodePorToken(code) {
  try {
    const { data } = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
      params: {
        client_id: process.env.FACEBOOK_APP_ID || '',
        client_secret: process.env.FACEBOOK_APP_SECRET || '',
        redirect_uri: redirectUri(),
        code
      }
    });
    return data.access_token;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao trocar o código de autorização pelo token de acesso.');
  }
}

// Token de curta duração (1-2h) -> token de longa duração (~60 dias)
async function obterTokenLongoPrazo(shortToken) {
  try {
    const { data } = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID || '',
        client_secret: process.env.FACEBOOK_APP_SECRET || '',
        fb_exchange_token: shortToken
      }
    });
    return data.access_token;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao gerar o token de longa duração.');
  }
}

// Lista as Contas de Anúncios que o usuário tem acesso — ele escolhe qual usar
async function listarContasAnuncio(token) {
  try {
    const { data } = await axios.get(`${GRAPH_URL}/me/adaccounts`, {
      params: { fields: 'id,name,account_status,currency', access_token: token }
    });
    return data.data || [];
  } catch (e) {
    throw _erroGraph(e, 'Falha ao buscar as contas de anúncio.');
  }
}

// Lista as Páginas do Facebook que o usuário administra — necessária pra
// Lead Ads nativo e pro criativo do anúncio
async function listarPaginas(token) {
  try {
    const { data } = await axios.get(`${GRAPH_URL}/me/accounts`, {
      params: { fields: 'id,name,access_token', access_token: token }
    });
    return data.data || [];
  } catch (e) {
    throw _erroGraph(e, 'Falha ao buscar as páginas do Facebook.');
  }
}

function montarTargeting(publico) {
  const t = {
    geo_locations: { location_types: ['home', 'recent'] }
  };
  if (publico?.raioKm && publico?.latitude && publico?.longitude) {
    t.geo_locations.custom_locations = [{
      latitude: publico.latitude,
      longitude: publico.longitude,
      radius: publico.raioKm,
      distance_unit: 'kilometer'
    }];
  } else if (publico?.cidade) {
    // fallback simples por nome — a busca do city id fica pro caller
    // (o app deveria resolver via /search?type=adgeolocation antes de chamar)
    t.geo_locations.cities = publico.cidadesIds || [];
  }
  if (publico?.idadeMin) t.age_min = publico.idadeMin;
  if (publico?.idadeMax) t.age_max = publico.idadeMax;
  if (publico?.genero === 'homens') t.genders = [1];
  else if (publico?.genero === 'mulheres') t.genders = [2];
  if (publico?.interesses?.length) {
    t.flexible_spec = [{ interests: publico.interesses.map(id => ({ id })) }];
  }
  return t;
}

async function criarCampanha({ contaAnuncioId, token, nome, objetivo }) {
  try {
    // ODAX: os 3 objetivos (lead form, tráfego, whatsapp) usam OUTCOME_LEADS
    // ou OUTCOME_ENGAGEMENT — a diferença real fica no destination_type do
    // adset e no call_to_action do criativo, não na campanha em si
    const objetivoMeta = objetivo === 'trafego' ? 'OUTCOME_TRAFFIC' : 'OUTCOME_LEADS';
    const { data } = await axios.post(`${GRAPH_URL}/act_${contaAnuncioId}/campaigns`, null, {
      params: {
        name: nome,
        objective: objetivoMeta,
        status: 'PAUSED',
        special_ad_categories: JSON.stringify([]),
        access_token: token
      }
    });
    return data.id;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao criar a campanha no Meta.');
  }
}

async function criarLeadForm({ pageId, pageToken, nome, imovel }) {
  try {
    const { data } = await axios.post(`${GRAPH_URL}/${pageId}/leadgen_forms`, null, {
      params: {
        name: nome,
        privacy_policy_url: baseUrl() + '/politica-privacidade',
        questions: JSON.stringify([
          { type: 'FULL_NAME' },
          { type: 'PHONE' },
          { type: 'EMAIL' }
        ]),
        access_token: pageToken
      }
    });
    return data.id;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao criar o formulário de lead. Verifique se a Página tem uma Política de Privacidade configurada.');
  }
}

async function criarAdSet({ contaAnuncioId, token, campaignId, nome, orcamentoDiarioCentavos, objetivo, publico }) {
  try {
    const destino = objetivo === 'whatsapp' ? 'WHATSAPP' : objetivo === 'trafego' ? 'WEBSITE' : 'ON_AD';
    const otimizacao = objetivo === 'whatsapp' ? 'CONVERSATIONS' : objetivo === 'trafego' ? 'LINK_CLICKS' : 'LEAD_GENERATION';
    const params = {
      name: nome,
      campaign_id: campaignId,
      daily_budget: orcamentoDiarioCentavos,
      billing_event: 'IMPRESSIONS',
      optimization_goal: otimizacao,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      destination_type: destino,
      targeting: JSON.stringify(montarTargeting(publico)),
      status: 'PAUSED',
      access_token: token
    };
    const { data } = await axios.post(`${GRAPH_URL}/act_${contaAnuncioId}/adsets`, null, { params });
    return data.id;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao criar o conjunto de anúncios no Meta.');
  }
}

function _textoAnuncio(imovel) {
  const local = imovel.bairro || imovel.cidade || '';
  const titulo = imovel.titulo || `${imovel.tipo || 'Imóvel'}${local ? ' em ' + local : ''}`;
  const valor = imovel.valor_imovel ? `R$ ${Number(imovel.valor_imovel).toLocaleString('pt-BR')}` : '';
  const quartos = imovel.quartos ? `${imovel.quartos} quarto${imovel.quartos > 1 ? 's' : ''}` : '';
  return { titulo, texto: [valor, quartos].filter(Boolean).join(' · ') };
}

async function criarCreative({ contaAnuncioId, token, pageId, nome, imovel, objetivo, leadFormId, whatsappNumero }) {
  try {
    const { titulo, texto } = _textoAnuncio(imovel);
    const foto = (imovel.fotos || [])[0];
    const linkData = {
      picture: foto,
      message: texto,
      name: titulo
    };
    if (objetivo === 'lead_form') {
      linkData.call_to_action = { type: 'LEAD_GENERATION', value: { lead_gen_form_id: leadFormId } };
    } else if (objetivo === 'whatsapp') {
      linkData.call_to_action = {
        type: 'WHATSAPP_MESSAGE',
        value: { app_destination: 'WHATSAPP', whatsapp_number: whatsappNumero }
      };
    } else {
      const idPublico = imovel.idInterno || imovel.id_interno || imovel.id;
      linkData.link = `${baseUrl()}/imovel/${idPublico}`;
      linkData.call_to_action = { type: 'LEARN_MORE' };
    }
    const { data } = await axios.post(`${GRAPH_URL}/act_${contaAnuncioId}/adcreatives`, null, {
      params: {
        name: nome,
        object_story_spec: JSON.stringify({ page_id: pageId, link_data: linkData }),
        access_token: token
      }
    });
    return data.id;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao criar o criativo do anúncio. Verifique se o imóvel tem foto.');
  }
}

async function criarAd({ contaAnuncioId, token, nome, adsetId, creativeId }) {
  try {
    const { data } = await axios.post(`${GRAPH_URL}/act_${contaAnuncioId}/ads`, null, {
      params: {
        name: nome,
        adset_id: adsetId,
        creative: JSON.stringify({ creative_id: creativeId }),
        status: 'PAUSED',
        access_token: token
      }
    });
    return data.id;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao criar o anúncio no Meta.');
  }
}

// Orquestra os 4 passos da Marketing API. Cria tudo PAUSADO — o corretor
// revisa e ativa manualmente (ou a rota que chama isso já ativa em seguida,
// dependendo do que o app pedir). Retorna todos os IDs pra salvar na tabela
// campanhas_meta.
async function criarCampanhaCompleta({ contaAnuncioId, pageId, pageToken, token, imovel, objetivo, orcamentoDiarioCentavos, publico, whatsappNumero }) {
  const { titulo } = _textoAnuncio(imovel);
  const nomeBase = `MatchImoveis - ${titulo}`.slice(0, 100);

  const campaignId = await criarCampanha({ contaAnuncioId, token, nome: nomeBase, objetivo });

  let leadFormId = null;
  if (objetivo === 'lead_form') {
    leadFormId = await criarLeadForm({ pageId, pageToken, nome: nomeBase, imovel });
  }

  const adsetId = await criarAdSet({ contaAnuncioId, token, campaignId, nome: nomeBase, orcamentoDiarioCentavos, objetivo, publico });
  const creativeId = await criarCreative({ contaAnuncioId, token, pageId, nome: nomeBase, imovel, objetivo, leadFormId, whatsappNumero });
  const adId = await criarAd({ contaAnuncioId, token, nome: nomeBase, adsetId, creativeId });

  return { campaignId, adsetId, creativeId, adId, leadFormId };
}

async function ativarCampanha({ campaignId, token }) {
  try {
    await axios.post(`${GRAPH_URL}/${campaignId}`, null, { params: { status: 'ACTIVE', access_token: token } });
    return true;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao ativar a campanha.');
  }
}

async function pausarCampanha({ campaignId, token }) {
  try {
    await axios.post(`${GRAPH_URL}/${campaignId}`, null, { params: { status: 'PAUSED', access_token: token } });
    return true;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao pausar a campanha.');
  }
}

// Busca os dados completos de um lead a partir do leadgen_id recebido no
// webhook — o Meta manda só o ID no evento, os dados de verdade (nome,
// telefone, email) só vêm nessa chamada separada
async function buscarDadosLead(leadgenId, pageToken) {
  try {
    const { data } = await axios.get(`${GRAPH_URL}/${leadgenId}`, {
      params: { access_token: pageToken }
    });
    const campos = {};
    (data.field_data || []).forEach(f => { campos[f.name] = (f.values || [])[0] || ''; });
    return {
      nome: campos.full_name || '',
      telefone: campos.phone_number || '',
      email: campos.email || '',
      criadoEm: data.created_time || new Date().toISOString(),
      formId: data.form_id || '',
      adId: data.ad_id || ''
    };
  } catch (e) {
    throw _erroGraph(e, 'Falha ao buscar os dados do lead no Meta.');
  }
}

module.exports = {
  getAuthUrl,
  trocarCodePorToken,
  obterTokenLongoPrazo,
  listarContasAnuncio,
  listarPaginas,
  criarCampanhaCompleta,
  ativarCampanha,
  pausarCampanha,
  buscarDadosLead
};
