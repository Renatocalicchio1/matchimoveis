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
    await page.waitForTimeout(4000);

    const data = await page.evaluate(() => {
      const clean = (v = '') => String(v).replace(/\s+/g, ' ').trim();

      let info = null;
      try {
        if (typeof avisoInfo !== 'undefined' && avisoInfo) info = avisoInfo;
      } catch (e) { info = null; }

      if (info) {
        let bairro = '', cidade = '', estado = '';
        let _node = info.location;
        while (_node) {
          const _label = (_node.label || '').toUpperCase();
          if (_label === 'ZONA' && !bairro) bairro = clean(_node.name || '');
          else if (_label === 'CIUDAD' && !cidade) cidade = clean(_node.name || '');
          else if (_label === 'PROVINCIA' && !estado) estado = clean(_node.acronym || _node.name || '');
          _node = _node.parent;
        }
        const logradouro = clean((info.address && info.address.name) || '');

        const mf = info.mainFeatures || {};
        const acharFeature = (labels) => {
          for (const k in mf) {
            const f = mf[k];
            if (f && labels.some(l => (f.label || '').toLowerCase().includes(l))) return Number(f.value) || 0;
          }
          return 0;
        };
        const area_m2 = acharFeature(['util', 'tot']) || acharFeature(['m²']);
        const quartos = acharFeature(['quarto', 'dormit']);
        const banheiros = acharFeature(['banheiro']);
        const suites = acharFeature(['suíte', 'suite']);
        const vagas = acharFeature(['vaga', 'garagem']);

        let valor_imovel = 0;
        try {
          const precos = info.pricesData || [];
          const venda = precos.find(p => p.operationType && /venda|sale/i.test(p.operationType.name));
          const alvo = venda || precos[0];
          if (alvo && alvo.prices && alvo.prices[0]) valor_imovel = Number(alvo.prices[0].amount) || 0;
        } catch (e) {}

        const tipo = clean((info.realEstateType && info.realEstateType.name) || 'Apartamento');
        const status = clean(info.status || '');
        const indisponivel = !!(status && status !== 'ONLINE');

        let _lat = '', _lng = '';
        try {
          if (typeof mapLatOf !== 'undefined') _lat = mapLatOf;
          if (typeof mapLngOf !== 'undefined') _lng = mapLngOf;
        } catch (e) {}

        return { logradouro, bairro, cidade, estado, tipo, area_m2, quartos, suites, banheiros, vagas, valor_imovel, indisponivel, _lat, _lng };
      }

      const text = document.body.innerText;
      const titulo = document.title || '';
      const indisponivelTxt = /não está mais publicado|nao esta mais publicado|foi finalizado pelo anunciante|indispon[ií]vel|removido|não encontrado|nao encontrado|despublicado|encerrado/i.test(text);
      const valorMatch = text.match(/R\$\s?[\d\.]+/);
      const areaMatch = text.match(/(\d+)\s?m²/i);
      const quartosMatch = text.match(/(\d+)\s?(quartos?|dormitórios?)/i);
      let tipoTxt = 'Apartamento';
      if (/casa|sobrado/i.test(titulo + ' ' + text.slice(0, 500))) tipoTxt = 'Casa';
      return {
        logradouro: '', bairro: '', cidade: '', estado: '',
        tipo: tipoTxt,
        area_m2: areaMatch ? Number(areaMatch[1]) : 0,
        quartos: quartosMatch ? Number(quartosMatch[1]) : 0,
        suites: 0, banheiros: 0, vagas: 0,
        valor_imovel: valorMatch ? Number(String(valorMatch[0]).replace(/\D/g, '')) : 0,
        indisponivel: indisponivelTxt
      };
    });

    await page.close();

    if (!data.bairro && data._lat && data._lng) {
      try {
        const lat = Buffer.from(data._lat, 'base64').toString('utf8');
        const lng = Buffer.from(data._lng, 'base64').toString('utf8');
        if (lat && lng && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
          const _r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`, {
            headers: { 'User-Agent': 'MatchImoveisExtrator/1.0' }
          });
          const _d = await _r.json();
          const _addr = _d && _d.address ? _d.address : {};
          const _bairroGeo = _addr.suburb || _addr.neighbourhood || _addr.quarter || _addr.city_district || '';
          if (_bairroGeo) {
            data.bairro = _bairroGeo;
            data._bairroFonte = 'geocode-reverso';
          }
          await new Promise(r => setTimeout(r, 1100));
        }
      } catch (e) { console.error('[extrator] geocode reverso falhou:', e.message); }
    }
    delete data._lat;
    delete data._lng;

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
    console.error('[extrator] ERRO em', listingUrl, '->', e.message);

    return {
      ...origin,
      extractionStatus: 'erro',
      error: e.message,
      url: listingUrl
    };
  }
}

module.exports = { extractProperty };
