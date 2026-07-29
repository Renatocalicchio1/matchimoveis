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
  let alvo;
  try { alvo = new URL(url); } catch (e) { throw new Error('URL inválida.'); }
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

  const imagens = [];
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) { const abs = _absoluta(ogImage, alvo.href); if (abs) imagens.push(abs); }

  $('img').each((_, el) => {
    if (imagens.length >= 20) return;
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (!src) return;
    if (/logo|icon|sprite|pixel|blank\.gif|spacer/i.test(src)) return;
    const w = parseInt($(el).attr('width') || '0');
    const h = parseInt($(el).attr('height') || '0');
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
// serviço tem outra coisa) — em vez de campos fixos, pede pra IA extrair o que fizer
// sentido pro conteúdo encontrado e devolver junto com a legenda, tudo numa única chamada.
async function gerarLegenda({ titulo, descricao, valor, textoBruto }) {
  const systemPrompt = `Você é um redator de posts de Instagram para negócios locais brasileiros (imobiliárias, concessionárias, lojas, prestadores de serviço etc).
Analise o conteúdo do site (título, descrição e texto da página) e identifique do que se trata (imóvel, veículo, serviço, produto etc) — cada tipo de site tem detalhes diferentes, extraia só o que existir e fizer sentido pro caso (ex: imóvel → valor, área, quartos, vagas; veículo → valor, ano, km, modelo; serviço → valor, o que está incluso).

Responda SOMENTE com um JSON válido, sem texto antes ou depois, no formato:
{"detalhes":[{"label":"Valor","valor":"R$ 450.000"},{"label":"Área","valor":"75m²"}],"legenda":"texto da legenda aqui"}

Regras dos "detalhes": no máximo 5 itens, só inclua o que realmente aparece no conteúdo (nunca invente número), "label" curto (1-2 palavras).
Regras da "legenda": português do Brasil, tom profissional e comercial, pronta pra publicar, entre 2 e 5 linhas curtas, emojis com moderação (no máximo 4), termine com uma chamada pra ação convidando a pessoa a chamar no direct pra saber mais, inclua no fim até 3 hashtags relevantes ao assunto.`;
  const userPrompt = `Título: ${titulo || '(sem título)'}\nDescrição: ${descricao || '(sem descrição)'}${valor ? '\nValor detectado: ' + valor : ''}\n\nTexto da página:\n${(textoBruto || '').slice(0, 2000)}`;
  const resposta = await _chamarGroq(systemPrompt, userPrompt);
  try {
    const limpo = resposta.replace(/^```json\s*|\s*```$/g, '').trim();
    const json = JSON.parse(limpo);
    return {
      legenda: String(json.legenda || '').trim(),
      detalhes: Array.isArray(json.detalhes) ? json.detalhes.slice(0, 5).filter(d => d && d.label && d.valor) : []
    };
  } catch (e) {
    return { legenda: resposta, detalhes: [] };
  }
}

module.exports = { analisarSite, gerarLegenda };
