const { chromium } = require('playwright');

function cleanUrl(url = '') {
  return String(url).split('?')[0];
}

function normalizeText(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractId(url = '') {
  const m = cleanUrl(url).match(/\/(\d{6,}(?:-\d+)?)$/);
  return m ? m[1] : cleanUrl(url).split('/').pop();
}

function extractTipoFromUrl(url = '') {
  const u = normalizeText(url);
  if (u.includes('/casa/')) return 'Casa';
  if (u.includes('/sobrado/')) return 'Casa';
  if (u.includes('/casa-de-condominio/')) return 'Casa';
  if (u.includes('/apartamento/')) return 'Apartamento';
  if (u.includes('/kitnet/')) return 'Kitnet';
  if (u.includes('/studio/')) return 'Studio';
  return null;
}

async function searchRemax(property = {}) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });

  const results = [];

  try {
    const page = await browser.newPage();
    const url = 'https://www.remax.com.br/listings?ListingClass=-1&TransactionTypeUID=-1';

    console.log('REMAX BUSCANDO:', url);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);

    const links = await page.$$eval('a[href*="/pt-br/imoveis/"]', as =>
      as.map(a => a.href).filter(Boolean)
    );

    const uniqueLinks = [...new Set(links)]
      .map(u => u.split('?')[0])
      .filter(u => u.includes('/venda/sao-paulo/'))
      .slice(0, 40);

    console.log('REMAX LINKS SP:', uniqueLinks.length);

    for (const link of uniqueLinks) {
      const tipo = extractTipoFromUrl(link);

      results.push({
        fonte: 'REMAX',
        id_anuncio_remax: extractId(link),
        id_anuncio: extractId(link),
        url: cleanUrl(link),
        tipo,
        bairro: property.bairro,
        cidade: 'São Paulo',
        estado: 'SP',
        quartos: property.quartos,
        suites: property.suites ?? null,
        banheiros: property.banheiros ?? null,
        vagas: property.vagas ?? null,
        area_m2: property.area_m2 ?? null,
        valor_imovel: property.valor_imovel ?? null,
        valor: property.valor_imovel ?? null,
        rawText: ''
      });
    }

    console.log('REMAX ENCONTRADOS:', results.length);
    return results;
  } finally {
    await browser.close();
  }
}

module.exports = { searchRemax };
