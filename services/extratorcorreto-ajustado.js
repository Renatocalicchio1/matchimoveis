const playwright = require('playwright');

let browser;
const extractionCache = new Map();

async function getBrowser() {
  if (!browser) {
    browser = await playwright.chromium.launch({
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

function clean(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

async function extractProperty(row = {}, origin = {}) {
  const listingUrl = row.listingUrl || row.url || origin.url || '';
  const cacheKey = listingUrl;

  if (cacheKey && extractionCache.has(cacheKey)) {
    return extractionCache.get(cacheKey);
  }

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('body', { timeout: 15000 });
    await page.waitForTimeout(8000);

    const data = await page.evaluate(() => {
      const clean = (v='') => String(v).replace(/\s+/g, ' ').trim();
      const onlyNumber = (v) => {
        const n = String(v || '').replace(/\D/g, '');
        return n ? Number(n) : 0;
      };

      function extractAddress(text) {
        let bairro = '';
        let cidade = '';
        let estado = '';
        let logradouro = '';

        const linhas = text.split('\n').map(l => clean(l)).filter(Boolean);

        const linhaEndereco = linhas.find(l =>
          /,\s*[^,]{2,40},\s*(São Paulo|Sao Paulo)/i.test(l) &&
          !/Imovelweb|Comprar|Venda|Apartamento para Venda|Casa para Venda|quartos?|dormit[oó]rios?|vaga|m²|R\$/i.test(l)
        ) || '';

        const match = linhaEndereco.match(/([^\n]+?),\s*([^,\n]+),\s*(São Paulo|Sao Paulo)/i);

        if (match) {
          logradouro = clean(match[1]);
          bairro = clean(match[2]);
          cidade = 'São Paulo';
          estado = 'SP';
        }

        if (!bairro || bairro.length > 50 || /^\d+$/.test(bairro) || /^\d+\s*-/.test(bairro) || /quartos?|vaga|dormit/i.test(bairro)) {
          const titulo = document.title || '';
          const partes = titulo.split(/São Paulo|Sao Paulo/i)[0].split(/Comprar/i);
          const candidatoTitulo = partes.length > 1 ? partes[partes.length - 1] : '';
          const mTitulo = candidatoTitulo.match(/([A-Za-zÀ-ÿ\s]{3,35})$/);
          bairro = mTitulo ? clean(mTitulo[1]) : '';
        }

        return { logradouro, bairro, cidade, estado };
      }

      const text = document.body.innerText;
      const titulo = document.title || '';

      const indisponivel = /não está mais publicado|nao esta mais publicado|foi finalizado pelo anunciante|indispon[ií]vel|removido|não encontrado|nao encontrado|despublicado|encerrado|não está mais disponível|nao esta mais disponivel/i.test(text);

      const address = extractAddress(text);

      const valorMatch = text.match(/R\$\s?[\d\.]+/);
      const areaMatch = text.match(/(\d+)\s?m²/i);
      const quartosMatch = text.match(/(\d+)\s?(quartos?|dormitórios?)/i);
      const suitesMatch = text.match(/(\d+)\s?suítes?/i);
      const banheirosMatch = text.match(/(\d+)\s?banheiros?/i);
      const vagasMatch = text.match(/(\d+)\s?vagas?/i);

      let tipo = 'Apartamento';
      if (/casa|sobrado/i.test(titulo + ' ' + text.slice(0, 500))) {
        tipo = 'Casa';
      }

      const valor_imovel = valorMatch ? onlyNumber(valorMatch[0]) : 0;
      const area_m2 = areaMatch ? Number(areaMatch[1]) : 0;

      return {
        ...address,
        tipo,
        area_m2,
        quartos: quartosMatch ? Number(quartosMatch[1]) : 0,
        suites: suitesMatch ? Number(suitesMatch[1]) : 0,
        banheiros: banheirosMatch ? Number(banheirosMatch[1]) : 0,
        vagas: vagasMatch ? Number(vagasMatch[1]) : 0,
        valor_imovel,
        indisponivel
      };
    });

    await page.close();

    const finalResult = {
      ...origin,
      ...data,
      url: listingUrl,
      fonte: 'ImovelWeb',
      extractionStatus: data.indisponivel ? 'indisponivel' : (data.bairro ? 'ok' : 'bairro_invalido')
    };

    if (cacheKey) extractionCache.set(cacheKey, finalResult);

    return finalResult;

  } catch (e) {
    try { await page.close(); } catch (_) {}

    return {
      ...origin,
      extractionStatus: 'erro',
      error: e.message,
      url: listingUrl
    };
  }
}

module.exports = { extractProperty };
