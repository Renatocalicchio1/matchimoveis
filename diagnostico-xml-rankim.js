// Diagnóstico pontual — testa se o bloqueio da URL do XML da Rankim é por
// "não parecer navegador" (Playwright real deve passar) ou por IP do Render
// (Playwright também vai levar 403, já que sai do mesmo IP/rede).
// Rodar no Render Shell: node diagnostico-xml-rankim.js
const URL_XML = 'https://sistema.rankim.com.br/integration/ca19d6a81d35685b87547898c5e000a5fc9be554/vivareal.xml';

async function run() {
  process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
  const playwright = require('playwright');
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      locale: 'pt-BR'
    });
    const page = await context.newPage();
    const resp = await page.goto(URL_XML, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('[diagnostico-xml-rankim] status:', resp ? resp.status() : 'sem resposta');
    const texto = await page.content();
    console.log('[diagnostico-xml-rankim] tamanho do conteúdo:', texto.length);
    console.log('[diagnostico-xml-rankim] trecho:', texto.slice(0, 400));
  } finally {
    await browser.close();
  }
}

run().then(() => process.exit(0)).catch(e => { console.error('[diagnostico-xml-rankim] erro:', e.message); process.exit(1); });
