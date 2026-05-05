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
function clean(value = '') { return String(value).replace(/\s+/g, ' ').trim(); }
async function extractProperty(row = {}, origin = {}) {
  const listingUrl = row.listingUrl || row.url || origin.url || '';
  const cacheKey = listingUrl;
  if (cacheKey && extractionCache.has(cacheKey)) return extractionCache.get(cacheKey);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('body', { timeout: 15000 });
    await page.waitForTimeout(8000);
    const data = await page.evaluate(() => {
      const clean = (v='') => String(v).replace(/\s+/g, ' ').trim();
      const onlyNumber = (v) => { const n = String(v||'').replace(/\D/g,''); return n ? Number(n) : 0; };
      const h1 = document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : '';
      const text = document.body.innerText;
      function extractLogradouro(text) {
        const linhas = text.split('\n').map(l => clean(l)).filter(Boolean);
        const linhaEndereco = linhas.find(l =>
          /,\s*[^,]{2,40},\s*(São Paulo|Sao Paulo)/i.test(l) &&
          /Rua|Av\.|Avenida|Alameda|Travessa|Estrada/i.test(l)
        ) || '';
        const m = linhaEndereco.match(/^([^,]+)/);
        return m ? clean(m[1]) : '';
      }
      function bairroDologradouro(logradouro) {
        // "Cj Hab Nome B" ou "(Nome B)" entre parenteses
        const mp = logradouro.match(/\((?:Cj\s+Hab\s+)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,30}?)(?:\s+[A-Z])?\)/i);
        if (mp) return clean(mp[1]);
        // "Avenida/Rua ... da/do/de BAIRRO"
        const md = logradouro.match(/(?:da|do|de)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,30})$/i);
        if (md) return clean(md[1]);
        return '';
      }
      function extractBairro(h1, text, logradouro) {
        // 1. H1 "no bairro NOME"
        const m1 = h1.match(/no bairro\s+([A-Za-zÀ-ÿ][^-\n,]{2,39})\s*[-]/i);
        if (m1) return clean(m1[1]);
        // 2. H1 "em NOME - São Paulo"
        const m2 = h1.match(/\bem\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,35})\s*[-]\s*São Paulo/i);
        if (m2) return clean(m2[1]);
        // 3. Texto "no bairro NOME"
        const m3 = text.match(/no bairro\s+([A-Za-zÀ-ÿ][^-\n,]{2,39})\s*[-,.]/i);
        if (m3) return clean(m3[1]);
        // 4. Texto "localizado no bairro NOME"
        const m4 = text.match(/localiza(?:do|da)\s+no bairro\s+([A-Za-zÀ-ÿ][^-\n,]{2,35})\s*[,.]/i);
        if (m4) return clean(m4[1]);
        // 5. Extrair do logradouro
        const m5 = bairroDologradouro(logradouro);
        if (m5) return m5;
        return '';
      }
      const indisponivel = /não está mais publicado|foi finalizado pelo anunciante|indispon[ií]vel|removido|não encontrado|despublicado|encerrado/i.test(text);
      const logradouro = extractLogradouro(text);
      const bairro = extractBairro(h1, text, logradouro);
      const valorMatch = text.match(/R\$\s?[\d\.]+/);
      const areaMatch = text.match(/(\d+)\s?m²/i);
      const quartosMatch = text.match(/(\d+)\s?(quartos?|dormitórios?)/i);
      const suitesMatch = text.match(/(\d+)\s?suítes?/i);
      const banheirosMatch = text.match(/(\d+)\s?banheiros?/i);
      const vagasMatch = text.match(/(\d+)\s?vagas?/i);
      let tipo = 'Apartamento';
      if (/casa|sobrado/i.test(h1 + ' ' + text.slice(0, 500))) tipo = 'Casa';
      return {
        logradouro, bairro, cidade: 'São Paulo', estado: 'SP', tipo,
        area_m2: areaMatch ? Number(areaMatch[1]) : 0,
        quartos: quartosMatch ? Number(quartosMatch[1]) : 0,
        suites: suitesMatch ? Number(suitesMatch[1]) : 0,
        banheiros: banheirosMatch ? Number(banheirosMatch[1]) : 0,
        vagas: vagasMatch ? Number(vagasMatch[1]) : 0,
        valor_imovel: valorMatch ? onlyNumber(valorMatch[0]) : 0,
        indisponivel
      };
    });
    await page.close();
    const finalResult = { ...origin, ...data, url: listingUrl, fonte: 'ImovelWeb', extractionStatus: data.indisponivel ? 'indisponivel' : (data.bairro ? 'ok' : 'bairro_invalido') };
    if (cacheKey) extractionCache.set(cacheKey, finalResult);
    return finalResult;
  } catch (e) {
    try { await page.close(); } catch (_) {}
    return { ...origin, extractionStatus: 'erro', error: e.message, url: listingUrl };
  }
}
module.exports = { extractProperty };
