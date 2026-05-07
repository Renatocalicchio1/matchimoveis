const playwright = require('playwright');

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

async function getDetails(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const data = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const valorMatch = text.match(/R\$\s?[\d\.]+(?:\.[\d]+)*/);
      const areaMatch = text.match(/(\d+)\s?m²/i);
      const quartosMatch = text.match(/(\d+)\s?(?:dorm|quarto)/i);
      const suitesMatch = text.match(/(\d+)\s?su[ií]te/i);
      const banheirosMatch = text.match(/(\d+)\s?banheiro/i);
      const vagasMatch = text.match(/(\d+)\s?vaga/i);
      const bairroMatch = text.match(/Bairro[:\s]+([^\n]+)/i);
      const fotos = Array.from(document.querySelectorAll('img[src*="foxter"], img[src*="imgix"], img[src*="cdn"]'))
        .map(i => i.src).filter(s => s && s.startsWith('http')).slice(0, 10);
      return {
        valor: valorMatch ? Number(valorMatch[0].replace(/\D/g, '')) : 0,
        area: areaMatch ? Number(areaMatch[1]) : 0,
        quartos: quartosMatch ? Number(quartosMatch[1]) : 0,
        suites: suitesMatch ? Number(suitesMatch[1]) : 0,
        banheiros: banheirosMatch ? Number(banheirosMatch[1]) : 0,
        vagas: vagasMatch ? Number(vagasMatch[1]) : 0,
        bairroDetalhe: bairroMatch ? bairroMatch[1].trim() : '',
        fotos
      };
    });
    await page.close().catch(() => {});
    return data;
  } catch(e) {
    await page.close().catch(() => {});
    return {};
  }
}

async function scrapeUrl(url, bairro) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    console.log('Foxter buscando:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 4500);
      await page.waitForTimeout(600);
    }
    const candidates = await page.evaluate((MAX_CANDIDATES) => {
      const seen = new Set();
      const results = [];
      const links = Array.from(document.querySelectorAll('a[href]'));
      for (const link of links) {
        const href = link.href || '';
        const match = href.match(/foxterciaimobiliaria\.com\.br\/imovel\/(\d+)$/);
        if (!match) continue;
        const id = match[1];
        if (seen.has(id)) continue;
        seen.add(id);
        results.push({ id_anuncio: id, idExterno: id, url: 'https://www.foxterciaimobiliaria.com.br/imovel/' + id });
        if (results.length >= MAX_CANDIDATES) break;
      }
      return results;
    }, MAX_CANDIDATES);
    await page.close().catch(() => {});
    return candidates.map(c => ({ ...c, bairro, fonte: 'Foxter', cidade: 'São Paulo', estado: 'SP', tipo: 'Apartamento' }));
  } catch (e) {
    console.log('Erro URL Foxter:', e.message);
    await page.close().catch(() => {});
    return [];
  }
}

async function searchFoxter(property) {
  if (!property.bairro) return [];
  const bairroSlug = slugify(property.bairro);
  const cidadeSlug = slugify(property.cidade || 'sao-paulo');
  const urls = [
    `https://www.foxterciaimobiliaria.com.br/imoveis/a-venda/em-${bairroSlug}-${cidadeSlug}-sp`,
    `https://www.foxterciaimobiliaria.com.br/imoveis/a-venda/em-${bairroSlug}`,
    `https://www.foxterciaimobiliaria.com.br/imoveis/a-venda/apartamentos/em-${bairroSlug}-${cidadeSlug}-sp`,
    `https://www.foxterciaimobiliaria.com.br/imoveis/a-venda/casas/em-${bairroSlug}-${cidadeSlug}-sp`,
  ];
  const all = [];
  for (const url of urls) {
    const candidates = await scrapeUrl(url, property.bairro);
    all.push(...candidates);
  }
  const unique = new Map();
  for (const item of all) {
    if (!item.id_anuncio) continue;
    unique.set(item.id_anuncio, item);
  }
  const candidatos = Array.from(unique.values()).slice(0, 30);
  console.log('FOXTER CANDIDATOS ENCONTRADOS:', candidatos.length, '- buscando detalhes...');

  const enriched = [];
  for (const item of candidatos) {
    try {
      const details = await Promise.race([
        getDetails(item.url),
        new Promise(r => setTimeout(() => r({}), 5000))
      ]);
      const tipo_raw = (item.url + ' ' + (details.bairroDetalhe || '')).toLowerCase();
      let tipo = 'Apartamento';
      if (/\bcasa\b|\bsobrado\b/.test(tipo_raw)) tipo = 'Casa';
      if (/studio|flat/.test(tipo_raw)) tipo = 'Studio';
      if (/kitnet/.test(tipo_raw)) tipo = 'Kitnet';
      enriched.push({ ...item, ...details, tipo, fonte: 'Foxter' });
    } catch(e) {
      enriched.push(item);
    }
  }

  console.log('FOXTER TOTAL ENRIQUECIDOS:', enriched.length);
  return enriched;
}

module.exports = { searchFoxter };
