// Versão do extrator (services/extratorcorreto-ajustado.js) preparada pra
// rodar no servidor (Render), não só localmente no Mac do Renato: sem
// executablePath fixo (usa o Chromium que o Playwright baixa sozinho no
// postinstall) e headless de verdade. Mesma lógica de extração (lê o
// avisoInfo exposto pela própria página do ImovelWeb quando disponível,
// cai pra regex no texto senão). Usado por services/interesadosPortal.js
// pra completar bairro/quartos/suítes/banheiros/área/valor a partir da URL
// do anúncio quando a planilha não trouxer isso pronto.
//
// Diferença importante do script local: aqui o navegador roda num IP de
// datacenter (Render), que portais como ImovelWeb costumam bloquear/desafiar
// com proteção anti-bot — headless puro é detectável (navigator.webdriver,
// falta de plugins, etc). Por isso: contexto com fingerprint de navegador
// normal (UA, idioma, plugins fake), espera ativa pelo avisoInfo em vez de
// timeout fixo, e 1 retry automático se a 1ª tentativa não achar os dados.
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';

const _USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

let _browserPromise = null;
let _contextPromise = null;

async function _getContext() {
  if (!_browserPromise) {
    const playwright = require('playwright');
    _browserPromise = playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    }).catch(e => { _browserPromise = null; throw e; });
  }
  if (!_contextPromise) {
    _contextPromise = (async () => {
      const browser = await _browserPromise;
      const context = await browser.newContext({
        userAgent: _USER_AGENT,
        locale: 'pt-BR',
        viewport: { width: 1366, height: 768 },
        extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' }
      });
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        window.chrome = window.chrome || { runtime: {} };
      });
      return context;
    })().catch(e => { _contextPromise = null; throw e; });
  }
  return _contextPromise;
}

async function fecharBrowser() {
  if (_browserPromise) {
    try { const b = await _browserPromise; await b.close(); } catch (e) {}
  }
  _browserPromise = null;
  _contextPromise = null;
}

async function _tentarExtrair(url) {
  let page;
  try {
    const context = await _getContext();
    page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    try {
      await page.waitForFunction(() => typeof avisoInfo !== 'undefined' && !!avisoInfo, { timeout: 8000 });
    } catch (e) {
      // avisoInfo não apareceu a tempo — segue e tenta aproveitar o texto da página
    }
    await page.waitForTimeout(500);

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
      const titulo = document.title || '';
      const indisponivel = /não está mais publicado|nao esta mais publicado|foi finalizado pelo anunciante|indispon[ií]vel|removido|não encontrado|nao encontrado|despublicado|encerrado/i.test(text);
      const bloqueado = /access denied|attention required|are you a human|verifique que voc[eê] [eé] humano|too many requests|just a moment|checking your browser|captcha/i.test(text + ' ' + titulo);
      return { bairro: '', cidade: '', estado: '', tipo: '', area_m2: 0, quartos: 0, suites: 0, banheiros: 0, vagas: 0, valor_imovel: 0, indisponivel, bloqueado, titulo, fonte: 'texto_bruto', textoPagina: text.slice(0, 2000) };
    });

    await page.close();
    return { ok: true, ...data };
  } catch (e) {
    try { if (page) await page.close(); } catch (_) {}
    return { ok: false, erro: e.message };
  }
}

async function extrairDadosAnuncio(url) {
  if (!url) return { ok: false, erro: 'sem url' };
  let r = await _tentarExtrair(url);
  if (!(r.ok && r.fonte === 'avisoInfo')) {
    // 1 retry — pode ter sido só timing de hidratação da página, ou a 1ª
    // tentativa caiu numa checagem anti-bot que a 2ª (mesmo contexto, já
    // com cookies) passa direto
    await new Promise(res => setTimeout(res, 1500));
    const r2 = await _tentarExtrair(url);
    if (r2.ok && r2.fonte === 'avisoInfo') return r2;
    if (!r.ok && r2.ok) return r2;
  }
  return r;
}

module.exports = { extrairDadosAnuncio, fecharBrowser };
