const axios = require('axios');

// Fluxo "Instagram API with Instagram Login" (Business Login for Instagram) —
// substitui o antigo "Facebook Login for Business": a autorização e a troca de
// tokens acontecem direto com o domínio instagram.com/graph.instagram.com, e o
// user_id retornado já é o Instagram-scoped User ID (não precisa localizar
// Página do Facebook nem instagram_business_account vinculada).
const GRAPH_VERSION = 'v21.0';
const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const LONG_TOKEN_URL = 'https://graph.instagram.com/access_token';
const GRAPH_URL = `https://graph.instagram.com/${GRAPH_VERSION}`;
const SCOPES = 'instagram_business_basic,instagram_business_content_publish';

function baseUrl() {
  return process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
}

function redirectUri() {
  return baseUrl() + '/app/instagram/callback';
}

function _erroGraph(e, fallback) {
  const msg = e?.response?.data?.error_message || e?.response?.data?.error?.message;
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

// Troca o code pelo token de curta duração. A resposta já traz o
// Instagram-scoped User ID (user_id) — é o ig-user-id usado em todas as
// chamadas seguintes, sem precisar de Página do Facebook.
async function trocarCodePorToken(code) {
  try {
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID || '',
      client_secret: process.env.FACEBOOK_APP_SECRET || '',
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(),
      code
    });
    const { data } = await axios.post(TOKEN_URL, params);
    return { accessToken: data.access_token, igUserId: data.user_id };
  } catch (e) {
    throw _erroGraph(e, 'Falha ao trocar o código de autorização pelo token de acesso.');
  }
}

async function obterTokenLongoPrazo(shortToken) {
  try {
    const { data } = await axios.get(LONG_TOKEN_URL, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: process.env.FACEBOOK_APP_SECRET || '',
        access_token: shortToken
      }
    });
    return data.access_token;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao gerar o token de longa duração.');
  }
}

async function obterUsername(igUserId, token) {
  try {
    const { data } = await axios.get(`${GRAPH_URL}/${igUserId}`, {
      params: { fields: 'username', access_token: token }
    });
    return data.username || '';
  } catch (e) {
    return '';
  }
}

function montarLegenda(imovel, uidLogado, base) {
  const tipo = imovel.tipo || 'Imóvel';
  const local = imovel.bairro || imovel.cidade || '';
  const valor = imovel.valor_imovel ? Number(imovel.valor_imovel).toLocaleString('pt-BR') : null;
  const quartos = imovel.quartos ? `${imovel.quartos} quarto${imovel.quartos > 1 ? 's' : ''}` : null;
  const idPublico = imovel.idInterno || imovel.id_interno || imovel.id;
  const link = `${base}/imovel/${idPublico}?userId=${encodeURIComponent(uidLogado || '')}`;

  const linhas = [`${tipo}${local ? ' em ' + local : ''}`];
  if (valor) linhas.push(`💰 R$ ${valor}`);
  if (quartos) linhas.push(`🛏 ${quartos}`);
  linhas.push('');
  linhas.push(link);
  return linhas.join('\n');
}

async function _aguardarContainerPronto(containerId, token, tentativas = 10, intervaloMs = 1500) {
  for (let i = 0; i < tentativas; i++) {
    const { data } = await axios.get(`${GRAPH_URL}/${containerId}`, {
      params: { fields: 'status_code', access_token: token }
    });
    if (data.status_code === 'FINISHED') return true;
    if (data.status_code === 'ERROR') throw new Error('O Instagram não conseguiu processar a mídia enviada.');
    await new Promise(r => setTimeout(r, intervaloMs));
  }
  return true; // segue tentando publicar mesmo sem confirmação — imagens costumam ficar prontas quase na hora
}

async function _publicar(igUserId, token, containerParams) {
  let containerId;
  try {
    const { data } = await axios.post(`${GRAPH_URL}/${igUserId}/media`, null, {
      params: { ...containerParams, access_token: token }
    });
    containerId = data.id;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao criar a publicação no Instagram. Verifique se a conta ainda está conectada.');
  }

  await _aguardarContainerPronto(containerId, token);

  try {
    const { data } = await axios.post(`${GRAPH_URL}/${igUserId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: token }
    });
    return data;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao publicar no Instagram. O token pode ter expirado — reconecte a conta em /app/perfil.');
  }
}

async function publicarFeed(igUserId, token, imageUrl, caption) {
  return _publicar(igUserId, token, { image_url: imageUrl, caption });
}

async function publicarStory(igUserId, token, imageUrl) {
  return _publicar(igUserId, token, { image_url: imageUrl, media_type: 'STORIES' });
}

module.exports = {
  getAuthUrl,
  trocarCodePorToken,
  obterTokenLongoPrazo,
  obterUsername,
  montarLegenda,
  publicarFeed,
  publicarStory
};
