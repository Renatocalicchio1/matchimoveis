const { chromium } = require('playwright');

function cleanUrl(url = '') {
  return String(url).split('?')[0];
}

function extractId(url = '') {
  const m = cleanUrl(url).match(/\/(\d{6,}(?:-\d+)?)$/);
  return m ? m[1] : cleanUrl(url).split('/').pop();
}

function normalize(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function money(text = '') {
  const m = text.match(/R\$\s*([\d\.\,]+)/);
  return m ? Number(m[1].replace(/[^\d]/g, '')) : null;
}

function numberAfter(label, text = '') {
  const re = new RegExp(label + '\\s*\\n\\s*(\\d+)', 'i');
  const m = text.match(re);
  return m ? Number(m[1]) : null;
}

function tipoFromUrl(url = '') {
  const u = normalize(url);
  if (u.includes('/casa/') || u.includes('/sobrado/') || u.includes('/casa-de-condominio/')) return 'Casa';
  if (u.includes('/apartamento/')) return 'Apartamento';
  if (u.includes('/kitnet/')) return 'Kitnet';
  if (u.includes('/studio/')) return 'Studio';
  return null;
}

function bairroFromText(text = '') {
  const lines = text.split('\n').map(x => x.trim()).filter(Boolean);

  for (const line of lines) {
    const isEnderecoSP = /São Paulo, São Paulo/i.test(line);
    const temCep = /\b\d{5}-?\d{3}\b/.test(line);
    const partes = line.split(',').map(p => p.trim()).filter(Boolean);

    if (isEnderecoSP && temCep && partes.length >= 5) {
      const idx = partes.findIndex(p => /^São Paulo$/i.test(p));
      if (idx >= 1) return partes[idx - 1];
    }
  }

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

    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(1500);
    }

    const links = await page.$$eval('a[href*="/pt-br/imoveis/"]', as =>
      as.map(a => a.href).filter(Boolean)
    );

    const uniqueLinks = [...new Set(links)]
      .map(u => u.split('?')[0])
      .filter(u => u.includes('/venda/sao-paulo/'))
      .slice(0, 120);

    console.log('REMAX LINKS SP:', uniqueLinks.length);

    for (const link of uniqueLinks) {
      const detail = await browser.newPage();
      let text = '';

      try {
        await detail.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await detail.waitForTimeout(5000);
        text = await detail.locator('body').innerText({ timeout: 10000 }).catch(() => '');
      } catch (e) {
        console.log('ERRO DETALHE REMAX:', link, e.message);
      }

      await detail.close();

      results.push({
        fonte: 'REMAX',
        id_anuncio_remax: extractId(link),
        id_anuncio: extractId(link),
        url: cleanUrl(link),
        tipo: tipoFromUrl(link),
        bairro: bairroFromText(text) || property.bairro,
        cidade: 'São Paulo',
        estado: 'SP',
        quartos: numberAfter('Dormitórios', text),
        suites: numberAfter('Suites', text),
        banheiros: numberAfter('Banheiros', text),
        vagas: numberAfter('Vagas de Estacionamento', text),
        area_m2: numberAfter('Área Útil', text) || numberAfter('Área M²', text),
        valor_imovel: money(text),
        valor: money(text),
        rawText: text.slice(0, 1000)
      });
    }

    console.log('REMAX ENCONTRADOS:', results.length);
    return results;
  } finally {
    await browser.close();
  }
}

module.exports = { searchRemax };
