const playwright = require('playwright');

const MAX_CANDIDATES = 30;

function slugify(text = '') {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function searchQuintoAndar(property) {
  if (!property.bairro) return [];

  const bairroSlug = slugify(property.bairro);
  const url = 'https://www.quintoandar.com.br/comprar/imovel/' + bairroSlug + '-sao-paulo-sp-brasil';

  console.log('Buscando (modo expandido):', url);

  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  
});

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 5000);
      await page.waitForTimeout(1000);
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

        const roomsUrlMatch = url.match(/(?:apartamento|casa|kitnet|studio)-(\d+)-quarto/);
        const roomsTextMatch = text.match(/(\d+)\s?quarto/i);
        const quartos = roomsUrlMatch ? parseInt(roomsUrlMatch[1]) : (roomsTextMatch ? parseInt(roomsTextMatch[1]) : null);

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
        let container = link;
        for (let i = 0; i < 1; i++) {
          if (container && container.parentElement) container = container.parentElement;
        }

        const text = container ? container.innerText || '' : '';
        const candidate = buildCandidate(link.href, text);

        if (candidate) results.push(candidate);
        if (results.length >= MAX_CANDIDATES) break;
      }

      if (results.length < MAX_CANDIDATES) {
        const html = document.documentElement.innerHTML;
        const urlMatches = html.match(/(?:https:\/\/www\.quintoandar\.com\.br)?\/imovel\/\d+\/comprar\/[^"'\\<\s]+/g) || [];

        for (const raw of urlMatches) {
          const candidate = buildCandidate(raw, '');
          if (candidate) results.push(candidate);
          if (results.length >= MAX_CANDIDATES) break;
        }
      }

      return results.slice(0, MAX_CANDIDATES);
    }, MAX_CANDIDATES);

    console.log('CANDIDATOS (EXPANDIDO):', candidates.length);

    await browser.close();
    return candidates;

  } catch (err) {
    console.log('Erro no scraping:', err.message);
    await browser.close();
    return [];
  }
}

module.exports = { searchQuintoAndar };
