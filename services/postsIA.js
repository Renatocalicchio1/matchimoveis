const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const MODEL = 'llama-3.1-8b-instant';

// Bloqueia URLs apontando pra rede interna/local — o servidor não deve
// buscar conteúdo de endereços privados a partir de uma URL informada por usuário.
function _hostBloqueado(hostname) {
  const h = (hostname || '').toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return true;
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1]), parseInt(ipv4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

function _absoluta(src, base) {
  try { return new URL(src, base).href; } catch (e) { return ''; }
}

async function analisarSite(url) {
  let urlCompleta = String(url || '').trim();
  if (urlCompleta && !/^https?:\/\//i.test(urlCompleta)) urlCompleta = 'https://' + urlCompleta;
  let alvo;
  try { alvo = new URL(urlCompleta); } catch (e) { throw new Error('URL inválida.'); }
  if (!/^https?:$/.test(alvo.protocol)) throw new Error('A URL precisa começar com http:// ou https://');
  if (_hostBloqueado(alvo.hostname)) throw new Error('Esse endereço não pode ser analisado.');

  const { data: html } = await axios.get(alvo.href, {
    timeout: 10000,
    maxContentLength: 5 * 1024 * 1024,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MatchImoveisBot/1.0)' }
  });

  const $ = cheerio.load(html);
  const titulo = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || '';
  const descricao = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';

  // Padrão mais amplo de imagem que não é foto de verdade — logo, banner de
  // marca, capa genérica, placeholder etc. Sites grandes (construtoras,
  // portais) costumam reusar a mesma imagem de marca em og:image em todas
  // as páginas, então isso sozinho não identifica a foto do imóvel.
  const PADRAO_LIXO = /logo|[ií]cone?|icon|sprite|pixel|blank\.gif|spacer|banner|capa-padrao|cover|placeholder|avatar|favicon|og-image|share-image|social-image|watermark/i;

  const imagens = [];

  // 1) JSON-LD (schema.org) — muitos sites com galeria carregada via JS ainda
  // embutem os dados estruturados da página (inclusive fotos reais) no HTML
  // estático, só pra SEO/crawlers — mais confiável que raspar <img> nesses casos
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).contents().text());
      const itens = Array.isArray(json) ? json : [json];
      itens.forEach(item => {
        let imgs = item && item.image;
        if (!imgs) return;
        if (typeof imgs === 'string') imgs = [imgs];
        if (imgs && !Array.isArray(imgs) && imgs.url) imgs = [imgs.url];
        if (!Array.isArray(imgs)) return;
        imgs.forEach(im => {
          const src = typeof im === 'string' ? im : (im && im.url);
          if (!src || PADRAO_LIXO.test(src)) return;
          const abs = _absoluta(src, alvo.href);
          if (abs && !imagens.includes(abs)) imagens.push(abs);
        });
      });
    } catch (e) { /* JSON-LD malformado ou sem campo image — ignora */ }
  });

  // 2) og:image — pega todas as ocorrências (alguns sites têm mais de uma),
  // mas agora filtrada pelo mesmo padrão de lixo (antes entrava sem checar nada)
  $('meta[property="og:image"], meta[property="og:image:secure_url"]').each((_, el) => {
    const src = $(el).attr('content');
    if (!src || PADRAO_LIXO.test(src)) return;
    const abs = _absoluta(src, alvo.href);
    if (abs && !imagens.includes(abs)) imagens.push(abs);
  });

  // 3) <img> da página — fallback, checando também atributos comuns de
  // lazy-load (data-src já existia, adicionado data-lazy-src/data-original/srcset)
  $('img').each((_, el) => {
    if (imagens.length >= 20) return;
    const $el = $(el);
    const srcsetPrimeiro = ($el.attr('srcset') || '').split(',')[0].trim().split(' ')[0];
    const src = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src') || $el.attr('data-original') || srcsetPrimeiro;
    if (!src) return;
    if (PADRAO_LIXO.test(src)) return;
    const w = parseInt($el.attr('width') || '0');
    const h = parseInt($el.attr('height') || '0');
    if ((w && w < 100) || (h && h < 100)) return;
    const abs = _absoluta(src, alvo.href);
    if (abs && !imagens.includes(abs)) imagens.push(abs);
  });

  $('script, style, nav, footer, header, noscript').remove();
  const textoBruto = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000);
  const matchValor = textoBruto.match(/R\$\s?[\d.,]{4,}/);
  const valor = matchValor ? matchValor[0].trim() : '';

  return {
    titulo: titulo.slice(0, 200),
    descricao: descricao.slice(0, 500),
    valor,
    textoBruto,
    imagens: imagens.slice(0, 20),
    url: alvo.href
  };
}

function _chamarGroq(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    if (!GROQ_API_KEY) return reject(new Error('GROQ_API_KEY não configurada'));
    const body = JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 300,
      temperature: 0.7
    });
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 15000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const texto = json.choices?.[0]?.message?.content;
          if (texto) resolve(texto.trim());
          else reject(new Error('Resposta vazia da IA: ' + data.slice(0, 200)));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout ao gerar legenda')); });
    req.write(body);
    req.end();
  });
}

// Cada tipo de site tem detalhes diferentes (imóvel tem m²/quartos, veículo tem km/ano,
// serviço tem outra coisa) — em vez de campos fixos, pede pra IA extrair o que existir
// e escrever direto no corpo da legenda, em tópicos. Texto puro (não JSON): já tentamos
// pedir JSON estruturado pro modelo e ele quebrava o formato com frequência.
async function gerarLegenda({ titulo, descricao, valor, textoBruto }) {
  const systemPrompt = `Você é um redator de posts de Instagram para negócios locais brasileiros (imobiliárias, concessionárias, lojas, prestadores de serviço etc).
Analise o conteúdo do site e identifique do que se trata (imóvel, veículo, serviço, produto etc) — cada tipo de site tem detalhes diferentes.

Estrutura da legenda, nessa ordem:
1. Uma linha de abertura chamativa sobre o que está sendo anunciado.
2. Tópicos curtos, um por linha, cada um com um emoji na frente, só com informações que realmente aparecem no conteúdo (nunca invente número) — ex: imóvel → 💰 valor, 📐 área, 🛏 quartos, 🚗 vagas; veículo → 💰 valor, 📅 ano, 🛣 km, ⚙️ modelo; serviço → 💰 valor, o que está incluso. Pule qualquer tópico cuja informação não exista no conteúdo.
3. Uma linha em branco.
4. Uma chamada pra ação convidando a pessoa a chamar no direct pra saber mais.
5. Até 3 hashtags relevantes ao assunto.

Responda SOMENTE com o texto final da legenda, pronta pra publicar, em português do Brasil, sem explicações, sem aspas, sem markdown.`;
  const userPrompt = `Título: ${titulo || '(sem título)'}\nDescrição: ${descricao || '(sem descrição)'}${valor ? '\nValor detectado: ' + valor : ''}\n\nTexto da página:\n${(textoBruto || '').slice(0, 2000)}`;
  const legenda = await _chamarGroq(systemPrompt, userPrompt);
  return { legenda: legenda.trim() };
}

// Título + descrição pro criativo de um anúncio pago do Meta (Facebook/Instagram
// Ads) — diferente da legenda de post (services/postsIA.js gerarLegenda): aqui é
// só 2 campos curtos e objetivos, o formato que a Marketing API espera
// (link_data.name = título principal, link_data.message = descrição/texto do corpo).
async function gerarTextoAnuncio({ titulo, tipo, bairro, cidade, valor, quartos }) {
  const systemPrompt = `Você é um redator de anúncios pagos (Facebook/Instagram Ads) para o mercado imobiliário brasileiro.
A partir dos dados do imóvel, escreva:
1. Um TÍTULO curto e chamativo (até 40 caracteres), sem emoji, sem aspas.
2. Uma DESCRIÇÃO de 1 a 2 frases (até 125 caracteres), destacando valor/quartos/localização quando existirem, terminando com uma chamada pra ação (ex: "Fale agora!", "Agende sua visita").

Nunca invente informação que não foi passada. Responda EXATAMENTE neste formato, sem mais nada:
TITULO: <texto>
DESCRICAO: <texto>`;
  const userPrompt = `Título do imóvel: ${titulo || '(sem título)'}\nTipo: ${tipo || ''}\nBairro: ${bairro || ''}\nCidade: ${cidade || ''}\nValor: ${valor ? 'R$ ' + Number(valor).toLocaleString('pt-BR') : '(não informado)'}\nQuartos: ${quartos || '(não informado)'}`;
  const resposta = await _chamarGroq(systemPrompt, userPrompt);
  const mTitulo = resposta.match(/TITULO:\s*(.+)/i);
  const mDescricao = resposta.match(/DESCRICAO:\s*(.+)/i);
  return {
    titulo: (mTitulo ? mTitulo[1] : resposta.split('\n')[0]).trim().replace(/^["']|["']$/g, ''),
    descricao: (mDescricao ? mDescricao[1] : resposta.split('\n').slice(1).join(' ')).trim().replace(/^["']|["']$/g, '')
  };
}

module.exports = { analisarSite, gerarLegenda, gerarTextoAnuncio };
