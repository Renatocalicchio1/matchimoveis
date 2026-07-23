const axios = require('axios');

const GRAPH_VERSION = 'v21.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const OAUTH_DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const SCOPES = 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement';

function baseUrl() {
  return process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
}

function redirectUri() {
  return baseUrl() + '/app/instagram/callback';
}

function _erroGraph(e, fallback) {
  const msg = e?.response?.data?.error?.message;
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
  return `${OAUTH_DIALOG_URL}?${params.toString()}`;
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

// Procura, entre as Páginas do Facebook administradas pelo usuário, a primeira
// que tenha uma Conta Comercial do Instagram vinculada.
async function obterPaginaComInstagram(userToken) {
  try {
    const { data } = await axios.get(`${GRAPH_URL}/me/accounts`, {
      params: {
        fields: 'id,name,access_token,instagram_business_account{id,username}',
        access_token: userToken
      }
    });
    const paginas = data.data || [];
    const pagina = paginas.find(p => p.instagram_business_account && p.instagram_business_account.id);
    if (!pagina) return null;
    return {
      pageId: pagina.id,
      pageAccessToken: pagina.access_token,
      igUserId: pagina.instagram_business_account.id,
      igUsername: pagina.instagram_business_account.username || ''
    };
  } catch (e) {
    throw _erroGraph(e, 'Falha ao buscar as Páginas do Facebook do usuário.');
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
  obterPaginaComInstagram,
  montarLegenda,
  publicarFeed,
  publicarStory
};
