const { chromium } = require('playwright');

function slugify(text = '') {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function onlyNumber(text = '') {
  const n = String(text).replace(/[^\d]/g, '');
  return n ? Number(n) : null;
}

async function searchRemax(property = {}) {
  const bairro = slugify(property.bairro || property.neighborhood || 'sao-paulo');
  const cidade = slugify(property.cidade || 'sao-paulo');

  const urls = [
    'https://www.remax.com.br/listings?ListingClass=-1&TransactionTypeUID=-1'
  ];

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });

  const results = [];

  try {
    const page = await browser.newPage();

    for (const url of urls) {
      console.log('REMAX BUSCANDO:', url);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3500);

        const cards = await page.$$eval('a[href*="/imoveis/"]', links => {
          return links.slice(0, 80).map(a => ({
            href: a.href,
            text: a.innerText || ''
          }));
        });

        for (const card of cards) {
          const text = card.text.replace(/\s+/g, ' ').trim();
          if (!text || !card.href) continue;
          if (!text.includes('R$')) continue;

          const priceMatch = text.match(/R\$\s?[\d\.\,]+/);
          const valor = priceMatch ? Number(priceMatch[0].replace(/[^\d]/g, '')) : null;

          const idMatch = card.href.match(/\/(\d{6,}[-\d]*)$/);
          const id = idMatch ? idMatch[1] : card.href.split('/').pop();

          results.push({
            fonte: 'REMAX',
            id_anuncio_remax: id,
            id_anuncio: id,
            url: card.href.split('?')[0],
            valor_imovel: valor,
            valor,
            bairro: property.bairro,
            cidade: 'São Paulo',
            estado: 'SP',
            tipo: property.tipo,
            quartos: property.quartos,
            area_m2: null,
            vagas: property.vagas ?? null,
            banheiros: property.banheiros ?? null,
            suites: property.suites ?? null,
            rawText: text
          });
        }
      } catch (err) {
        console.log('ERRO URL REMAX:', url, err.message);
      }
    }

    const unique = [];
    const seen = new Set();

    for (const item of results) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      unique.push(item);
    }

    console.log('REMAX ENCONTRADOS:', unique.length);
    return unique.slice(0, 20);
  } finally {
    await browser.close();
  }
}

module.exports = { searchRemax };
