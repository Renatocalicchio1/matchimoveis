// Versão do extrator (services/extratorcorreto-ajustado.js) preparada pra
// rodar no servidor (Render), não só localmente no Mac do Renato: sem
// executablePath fixo (usa o Chromium que o Playwright baixa sozinho no
// postinstall) e headless de verdade. Mesma lógica de extração (lê o
// avisoInfo exposto pela própria página do ImovelWeb quando disponível,
// cai pra regex no texto senão). Usado por services/interesadosPortal.js
// pra completar bairro/quartos/suítes/banheiros/área/valor a partir da URL
// do anúncio quando a planilha não trouxer isso pronto.
let _browserPromise = null;
async function _getBrowser() {
  if (!_browserPromise) {
    const playwright = require('playwright');
    _browserPromise = playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }).catch(e => { _browserPromise = null; throw e; });
  }
  return _browserPromise;
}

async function fecharBrowser() {
  if (_browserPromise) {
    try { const b = await _browserPromise; await b.close(); } catch (e) {}
    _browserPromise = null;
  }
}

async function extrairDadosAnuncio(url) {
  if (!url) return { ok: false, erro: 'sem url' };
  let browser, page;
  try {
    browser = await _getBrowser();
    page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForSelector('body', { timeout: 12000 });
    await page.waitForTimeout(2500);

    const data = await page.evaluate(() => {
      const clean = (v = '') => String(v).replace(/\s+/g, ' ').trim();
      let info = null;
      try { if (typeof avisoInfo !== 'undefined' && avisoInfo) info = avisoInfo; } catch (e) { info = null; }

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
        const tipo = clean((info.realEstateType && info.realEstateType.name) || '');
        const status = clean(info.status || '');
        const indisponivel = !!(status && status !== 'ONLINE');
        return { bairro, cidade, estado, tipo, area_m2, quartos, suites, banheiros, vagas, valor_imovel, indisponivel, fonte: 'avisoInfo' };
      }

      const text = document.body.innerText;
      const indisponivel = /não está mais publicado|nao esta mais publicado|foi finalizado pelo anunciante|indispon[ií]vel|removido|não encontrado|nao encontrado|despublicado|encerrado/i.test(text);
      return { bairro: '', cidade: '', estado: '', tipo: '', area_m2: 0, quartos: 0, suites: 0, banheiros: 0, vagas: 0, valor_imovel: 0, indisponivel, fonte: 'texto_bruto', textoPagina: text.slice(0, 2000) };
    });

    await page.close();
    return { ok: true, ...data };
  } catch (e) {
    try { if (page) await page.close(); } catch (_) {}
    return { ok: false, erro: e.message };
  }
}

module.exports = { extrairDadosAnuncio, fecharBrowser };
