const playwright = require('playwright');
const { getPropertyDetails } = require('./details');

let browser;
const MAX_CANDIDATES = 150;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

function slugify(text = '') {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function scrapeUrl(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    console.log('Buscando:', url);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);

    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 4500);
      await page.waitForTimeout(600);
    }

    const candidates = await page.evaluate((MAX_CANDIDATES) => {
      const seen = new Set();
      const results = [];

      function cleanUrl(rawUrl) {
        if (!rawUrl) return null;
        let finalUrl = rawUrl;

        if (finalUrl.startsWith('/')) {
          finalUrl = 'https://www.quintoandar.com.br' + finalUrl;
        }

        finalUrl = finalUrl.split('?')[0].split('#')[0];

        if (!finalUrl.includes('/imovel/')) return null;
        if (!finalUrl.includes('/comprar/')) return null;
        if (finalUrl.includes('/alugar/')) return null;
        if (!finalUrl.includes('sao-paulo')) return null;

        return finalUrl;
      }

      function buildCandidate(rawUrl, text = '') {
        const url = cleanUrl(rawUrl);
        if (!url) return null;

        const idMatch = url.match(/imovel\/(\d+)/);
        const id = idMatch ? idMatch[1] : null;

        if (!id || seen.has(id)) return null;
        seen.add(id);

        let tipo = 'Apartamento';
        if (/casa/i.test(url + ' ' + text)) tipo = 'Casa';
        if (/studio|kitnet|flat/i.test(url + ' ' + text)) tipo = 'Kitnet';

        const quartosMatch = text.match(/(\d+)\s?quartos?/i);
        const valorMatch = text.match(/R\$\s?[\d\.]+/);
        const areaMatch = text.match(/(\d+)\s?m²/i);
        const suitesMatch = text.match(/(\d+)\s?su[ií]tes?/i);
        const banheirosMatch = text.match(/(\d+)\s?banheiros?/i);
        const vagasMatch = text.match(/(\d+)\s?vagas?/i);

        return {
          fonte: 'QuintoAndar',
          id_anuncio_quintoandar: id,
          id_anuncio: id,
          url,
          tipo,
          valor: valorMatch ? Number(valorMatch[0].replace(/\D/g, '')) : 0,
          area: areaMatch ? Number(areaMatch[1]) : 0,
          quartos: quartosMatch ? Number(quartosMatch[1]) : 0,
          suites: suitesMatch ? Number(suitesMatch[1]) : 0,
          banheiros: banheirosMatch ? Number(banheirosMatch[1]) : 0,
          vagas: vagasMatch ? Number(vagasMatch[1]) : 0,
          cidade: 'São Paulo',
          estado: 'SP'
        };
      }

      const links = Array.from(document.querySelectorAll('a[href*="/imovel/"]'));

      for (const link of links) {
        let container = link;
        for (let i = 0; i < 4; i++) {
          if (container && container.parentElement) container = container.parentElement;
        }

        const text = container ? container.innerText || '' : '';
        const candidate = buildCandidate(link.href, text);

        if (candidate) results.push(candidate);
        if (results.length >= MAX_CANDIDATES) break;
      }

      return results;
    }, MAX_CANDIDATES);

    await page.close().catch(() => {});
    return candidates;

  } catch (e) {
    console.log('Erro URL:', e.message);
    await page.close().catch(() => {});
    return [];
  }
}

async function searchQuintoAndar(property) {
  if (!property.bairro) return [];

  const bairroSlug = slugify(property.bairro);

  const urls = [
    'https://www.quintoandar.com.br/comprar/imovel/' + bairroSlug + '-sao-paulo-sp-brasil',
    'https://www.quintoandar.com.br/comprar/imovel/' + bairroSlug,
    'https://www.quintoandar.com.br/comprar/imovel/sao-paulo-sp/' + bairroSlug,
    'https://www.quintoandar.com.br/comprar/imovel/sao-paulo-sp-brasil/' + bairroSlug,
    'https://www.quintoandar.com.br/comprar/imovel/' + bairroSlug + '-sao-paulo',
    'https://www.quintoandar.com.br/comprar/imovel/' + bairroSlug + '-sp',
    'https://www.quintoandar.com.br/comprar/imovel/' + bairroSlug + '-sao-paulo-sp',
    'https://www.quintoandar.com.br/comprar/imovel/apartamento/' + bairroSlug + '-sao-paulo-sp-brasil',
    'https://www.quintoandar.com.br/comprar/imovel/casa/' + bairroSlug + '-sao-paulo-sp-brasil',
    'https://www.quintoandar.com.br/comprar/imovel/' + bairroSlug + '-sao-paulo-sp-brasil/apartamento'
  ];

  const all = [];

  for (const url of urls) {
    const candidates = await scrapeUrl(url);
    all.push(...candidates);
  }

  const unique = new Map();

  for (const item of all) {
    if (!item.id_anuncio_quintoandar) continue;
    unique.set(item.id_anuncio_quintoandar, item);
  }

  const final = Array.from(unique.values()).slice(0, 50);

  console.log('TOTAL CANDIDATOS:', final.length);

  const enriched = [];

  for (const item of final) {
    try {
      const details = await Promise.race([
        getPropertyDetails(item.url),
        new Promise(resolve => setTimeout(() => resolve({}), 3000))
      ]);

      enriched.push({
        ...item,
        ...details,
        fonte: 'QuintoAndar',
        id_anuncio_quintoandar: item.id_anuncio_quintoandar,
        id_anuncio: item.id_anuncio_quintoandar,
        url: item.url
      });
    } catch (e) {
      console.log('Erro detalhes:', item.url, e.message);
      enriched.push(item);
    }
  }

  console.log('TOTAL CANDIDATOS ENRIQUECIDOS:', enriched.length);

  return enriched;
}

module.exports = { searchQuintoAndar };
