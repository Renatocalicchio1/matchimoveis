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
          let bairro = "", cidade = "", estado = "", logradouro = "";
          const m1 = text.match(/([^\n]+?),\s*([^,\n]+),\s*(São Paulo|Sao Paulo)/i);
          if (m1) { logradouro = clean(m1[1]); bairro = clean(m1[2]); cidade = "São Paulo"; estado = "SP"; }
          if (!bairro) { const m2 = text.match(/Bairro[:\s]+([^\n]{2,40})/i); if (m2) bairro = clean(m2[1]); }
          if (!bairro) { const t = document.title||""; const m3 = t.match(/em\s+([^,-]{3,35})/i); if (m3) bairro = clean(m3[1]); }
          if (bairro && (bairro.length > 50 || /^\d+$/.test(bairro))) bairro = "";
          if (!cidade) { cidade = "São Paulo"; estado = "SP"; }
          return { logradouro, bairro, cidade, estado };
        }
        function extractAddress(text) {
          let bairro = "", cidade = "", estado = "", logradouro = "";
          const m1 = text.match(/([^\n]+?),\s*([^,\n]+),\s*(São Paulo|Sao Paulo)/i);
          if (m1) { logradouro = clean(m1[1]); bairro = clean(m1[2]); cidade = "São Paulo"; estado = "SP"; }
          if (!bairro) { const m2 = text.match(/Bairro[:\s]+([^\n]{2,40})/i); if (m2) bairro = clean(m2[1]); }
          if (!bairro) { const t = document.title||""; const m3 = t.match(/em\s+([^,-]{3,35})/i); if (m3) bairro = clean(m3[1]); }
          if (bairro && (bairro.length > 50 || /^\d+$/.test(bairro))) bairro = "";
          if (!cidade) { cidade = "São Paulo"; estado = "SP"; }
          return { logradouro, bairro, cidade, estado };
        }
      const text = document.body.innerText;
      const titulo = document.title || '';

      const address = extractAddress(text);

      const valorMatch = text.match(/R\$\s?[\d\.]+/);
      // Prioriza área útil/privativa
      const areaUtil = text.match(/área\s*(útil|privativa|total\s*útil)[^\d]*(\d+)\s?m²/i) ||
                       text.match(/(\d+)\s?m²\s*(úteis|útil|privativos?|privativos?)/i);
      const areaMatch = areaUtil || text.match(/(\d+)\s?m²/i);
      const areaIdx = areaUtil ? (areaUtil[2] ? 2 : 1) : 1;
      const quartosMatch = text.match(/(\d+)\s?(quartos?|dormitórios?)/i);
      const suitesMatch = text.match(/(\d+)\s?suítes?/i);
      const banheirosMatch = text.match(/(\d+)\s?banheiros?/i);
      const vagasMatch = text.match(/(\d+)\s?vagas?/i);

      let tipo = 'Apartamento';
      if (/casa|sobrado/i.test(titulo + ' ' + text.slice(0, 500))) {
        tipo = 'Casa';
      }

      const valor_imovel = valorMatch ? onlyNumber(valorMatch[0]) : 0;
      const area_m2 = areaMatch ? Number(areaMatch[areaIdx || 1]) : 0;

      return {
        ...address,
        tipo,
        area_m2,
        quartos: quartosMatch ? Number(quartosMatch[1]) : 0,
        suites: suitesMatch ? Number(suitesMatch[1]) : 0,
        banheiros: banheirosMatch ? Number(banheirosMatch[1]) : 0,
        vagas: vagasMatch ? Number(vagasMatch[1]) : 0,
        valor_imovel
      };
    });

    await page.close();

    const finalResult = {
      ...origin,
      ...data,
      url: listingUrl,
      fonte: 'ImovelWeb',
      extractionStatus: data.bairro ? 'ok' : 'bairro_invalido'
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
