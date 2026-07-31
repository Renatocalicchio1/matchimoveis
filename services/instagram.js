const axios = require('axios');

// Fluxo "Instagram API with Instagram Login" (Business Login for Instagram) —
// substitui o antigo "Facebook Login for Business": a autorização e a troca de
// tokens acontecem direto com o domínio instagram.com/graph.instagram.com, e o
// user_id retornado já é o Instagram-scoped User ID (não precisa localizar
// Página do Facebook nem instagram_business_account vinculada).
const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const LONG_TOKEN_URL = 'https://graph.instagram.com/access_token';
const GRAPH_URL = 'https://graph.instagram.com';
const SCOPES = 'instagram_business_basic,instagram_business_content_publish';

function baseUrl() {
  return process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
}

function redirectUri() {
  return baseUrl() + '/app/instagram/callback';
}

const ERROS_CONHECIDOS = [
  { padrao: /aspect ratio/i, msg: 'Foto com proporção não aceita pelo Instagram (precisa ficar entre 4:5 retrato e 1.91:1 paisagem).' },
  { padrao: /media.*type.*not.*support|unsupported.*format/i, msg: 'Formato de foto não suportado pelo Instagram (use JPEG).' },
  { padrao: /could not download|failed to download|url.*not.*(valid|accessible)/i, msg: 'O Instagram não conseguiu baixar a foto — verifique se a URL é pública.' }
];

function _traduzErro(msg) {
  const achado = ERROS_CONHECIDOS.find(e => e.padrao.test(msg || ''));
  return achado ? achado.msg : msg;
}

function _erroGraph(e, fallback, etapa) {
  const msg = e?.response?.data?.error_message || e?.response?.data?.error?.message;
  const texto = _traduzErro(msg) || fallback || e.message;
  // Enquanto o erro "Unsupported request - method type" não for diagnosticado
  // de vez, anexa a resposta bruta do Meta na mensagem — não dá acesso aos
  // logs do Render daqui, então isso é o jeito de ver o payload completo
  // (código, tipo, fbtrace_id) a partir do próprio print de erro na tela.
  const detalhe = e?.response?.data ? ' | raw: ' + JSON.stringify(e.response.data) : '';
  return new Error((etapa ? `[${etapa}] ` : '') + texto + detalhe);
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
    // api.instagram.com/oauth/access_token devolve user_id como NUMBER no
    // JSON (diferente do resto da Graph API, que sempre usa string pra IDs).
    // IDs do Instagram têm 17+ dígitos, acima de Number.MAX_SAFE_INTEGER —
    // o JSON.parse padrão arredonda silenciosamente e corrompe o ID, fazendo
    // toda chamada seguinte (obterUsername, publicarFeed/Story) apontar pra
    // um ID que não existe. Extrai o valor exato como string do texto bruto
    // antes do parse.
    const { data } = await axios.post(TOKEN_URL, params, {
      transformResponse: [(raw) => {
        const parsed = JSON.parse(raw);
        const m = String(raw).match(/"user_id"\s*:\s*"?(\d+)"?/);
        if (m) parsed.user_id = m[1];
        return parsed;
      }]
    });
    return { accessToken: data.access_token, igUserId: data.user_id ? String(data.user_id) : null };
  } catch (e) {
    const errData = e?.response?.data?.error || e?.response?.data || {};
    console.error('[instagram] trocarCodePorToken falhou — resposta completa:', JSON.stringify(errData));
    throw _erroGraph(e, 'Falha ao trocar o código de autorização pelo token de acesso.', 'trocarCodePorToken');
  }
}

async function obterTokenLongoPrazo(shortToken) {
  // Documentação oficial descreve GET com query params, mas na prática o
  // Meta devolve "Unsupported request - method type: get" (erro genérico
  // #100) pra esse endpoint às vezes. A 1ª tentativa de POST tinha o mesmo
  // problema de fundo: mandava os parâmetros na query string igual ao GET,
  // só trocando o verbo — não é um POST de verdade. Agora tenta GET
  // (conforme doc) e, se falhar, tenta um POST de verdade com os parâmetros
  // no corpo como x-www-form-urlencoded — igual ao passo anterior
  // (trocarCodePorToken), que funciona.
  const paramsObj = {
    grant_type: 'ig_exchange_token',
    client_secret: process.env.FACEBOOK_APP_SECRET || '',
    access_token: shortToken
  };
  try {
    const { data } = await axios.get(LONG_TOKEN_URL, { params: paramsObj });
    return data.access_token;
  } catch (e) {
    const errData1 = e?.response?.data?.error || e?.response?.data || {};
    console.error('[instagram] obterTokenLongoPrazo GET falhou:', JSON.stringify(errData1));
    try {
      const { data } = await axios.post(LONG_TOKEN_URL, new URLSearchParams(paramsObj));
      return data.access_token;
    } catch (e2) {
      const errData2 = e2?.response?.data?.error || e2?.response?.data || {};
      console.error('[instagram] obterTokenLongoPrazo POST (corpo) também falhou:', JSON.stringify(errData2));
      throw _erroGraph(e2, 'Falha ao gerar o token de longa duração.', 'obterTokenLongoPrazo');
    }
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
  const local = imovel.bairro || imovel.cidade || '';
  const titulo = imovel.titulo || `${imovel.tipo || 'Imóvel'}${local ? ' em ' + local : ''}`;
  const valor = imovel.valor_imovel ? Number(imovel.valor_imovel).toLocaleString('pt-BR') : null;
  const area = imovel.area_m2 ? `${imovel.area_m2}m²` : null;
  const quartos = imovel.quartos ? `${imovel.quartos} quarto${imovel.quartos > 1 ? 's' : ''}` : null;
  const suites = imovel.suites ? `${imovel.suites} suíte${imovel.suites > 1 ? 's' : ''}` : null;
  const banheiros = imovel.banheiros ? `${imovel.banheiros} banheiro${imovel.banheiros > 1 ? 's' : ''}` : null;
  const vagas = imovel.vagas ? `${imovel.vagas} vaga${imovel.vagas > 1 ? 's' : ''} de garagem` : null;
  const idPublico = imovel.idInterno || imovel.id_interno || imovel.id;
  const link = `${base}/imovel/${idPublico}?userId=${encodeURIComponent(uidLogado || '')}`;

  const linhas = [titulo];
  if (valor) linhas.push(`💰 R$ ${valor}`);
  if (area) linhas.push(`📐 ${area}`);
  if (quartos) linhas.push(`🛏 ${quartos}`);
  if (suites) linhas.push(`🛁 ${suites}`);
  if (banheiros) linhas.push(`🚿 ${banheiros}`);
  if (vagas) linhas.push(`🚗 ${vagas}`);
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

async function _criarContainer(igUserId, token, containerParams) {
  try {
    const { data } = await axios.post(`${GRAPH_URL}/${igUserId}/media`, null, {
      params: { ...containerParams, access_token: token }
    });
    return data.id;
  } catch (e) {
    throw _erroGraph(e, 'Falha ao criar a publicação no Instagram. Verifique se a conta ainda está conectada.');
  }
}

async function _publicarContainer(igUserId, token, containerId) {
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

// imageUrls pode ser uma string (1 foto) ou array (carrossel, até 10 fotos —
// limite do Instagram). Com mais de 1 foto, cria um container por item
// (is_carousel_item, sem legenda) e depois o container pai CAROUSEL com a
// legenda e os children. Foto que falhar (ex: proporção não aceita pelo
// Instagram) é ignorada em vez de derrubar o post inteiro.
async function publicarFeed(igUserId, token, imageUrls, caption) {
  const urls = (Array.isArray(imageUrls) ? imageUrls : [imageUrls]).filter(Boolean).slice(0, 10);
  if (urls.length <= 1) {
    const containerId = await _criarContainer(igUserId, token, { image_url: urls[0], caption });
    return _publicarContainer(igUserId, token, containerId);
  }

  const validas = [];
  const falhas = [];
  for (const url of urls) {
    try {
      const containerId = await _criarContainer(igUserId, token, { image_url: url, is_carousel_item: true });
      validas.push({ url, containerId });
    } catch (e) {
      falhas.push(e.message);
    }
  }

  if (validas.length === 0) {
    throw new Error('Nenhuma foto pôde ser publicada — ' + falhas[0]);
  }
  // Instagram exige 2+ itens pra carrossel — com só 1 foto válida, publica como post simples
  if (validas.length === 1) {
    const containerId = await _criarContainer(igUserId, token, { image_url: validas[0].url, caption });
    const resultado = await _publicarContainer(igUserId, token, containerId);
    return { ...resultado, fotosIgnoradas: falhas };
  }

  const containerId = await _criarContainer(igUserId, token, {
    media_type: 'CAROUSEL',
    children: validas.map(v => v.containerId).join(','),
    caption
  });
  const resultado = await _publicarContainer(igUserId, token, containerId);
  return falhas.length ? { ...resultado, fotosIgnoradas: falhas } : resultado;
}

// Stories não suportam carrossel — sempre uma única imagem.
async function publicarStory(igUserId, token, imageUrl) {
  const url = Array.isArray(imageUrl) ? imageUrl[0] : imageUrl;
  const containerId = await _criarContainer(igUserId, token, { image_url: url, media_type: 'STORIES' });
  return _publicarContainer(igUserId, token, containerId);
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
