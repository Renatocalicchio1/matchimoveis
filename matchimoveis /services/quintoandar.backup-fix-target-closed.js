const playwright = require('playwright');

let browser;

async function getBrowser() {
  if (!browser) {
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

const MAX_CANDIDATES = 120;

function slugify(text = '') {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function scrapePage(page, url) {
  console.log('Buscando:', url);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForSelector('a[href*="/imovel/"]', { timeout: 15000 });

    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 5000);
      await page.waitForTimeout(800);
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
        if (url.includes('/casa-')) tipo = 'Casa';
        if (url.includes('/kitnet-') || url.includes('/studio-')) tipo = 'Kitnet';

        const roomsMatch = text.match(/(\d+)\s?quarto/i);
        const quartos = roomsMatch ? parseInt(roomsMatch[1]) : null;

        const priceMatch = text.match(/R\$\s?[\d\.]+/);
        const valor = priceMatch ? parseInt(priceMatch[0].replace(/[^\d]/g, '')) : null;

        const areaMatch = text.match(/(\d+)\s?m²/i);
        const area = areaMatch ? parseInt(areaMatch[1]) : null;

        return {
          id_anuncio_quintoandar: id,
          url,
          tipo,
          valor,
          area,
          quartos,
          cidade: 'São Paulo',
          estado: 'SP'
        };
      }

      const links = Array.from(document.querySelectorAll('a[href*="/imovel/"]'));

      for (const link of links) {
        const text = link.innerText || '';
        const candidate = buildCandidate(link.href, text);

        if (candidate) results.push(candidate);
        if (results.length >= MAX_CANDIDATES) break;
      }

      return results;
    }, MAX_CANDIDATES);

    return candidates;

  } catch (e) {
    console.log('Erro:', e.message);
    return [];
  }
}

async function searchQuintoAndar(property) {
  if (!property.bairro) return [];

  const browser = await getBrowser();
  const page = await browser.newPage();

  const bairroSlug = slugify(property.bairro);

  const urls = [
    `https://www.quintoandar.com.br/comprar/imovel/${bairroSlug}-sao-paulo-sp-brasil`,
    `https://www.quintoandar.com.br/comprar/imovel/sao-paulo-sp/${bairroSlug}`,
    `https://www.quintoandar.com.br/comprar/imovel/${bairroSlug}`
  ];

  let all = [];

  for (const url of urls) {
    const result = await scrapePage(page, url);
    all.push(...result);
  }

  await page.close();

  const unique = {};
  all.forEach(c => {
    if (c.id_anuncio_quintoandar) {
      unique[c.id_anuncio_quintoandar] = c;
    }
  });

  const final = Object.values(unique);

  console.log('TOTAL CANDIDATOS:', final.length);

  return final.slice(0, MAX_CANDIDATES);
}

module.exports = { searchQuintoAndar };
