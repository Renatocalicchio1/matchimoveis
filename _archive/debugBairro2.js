const playwright = require('playwright');
async function main() {
  const browser = await playwright.chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox']
  });
  const urls = [
    'https://www.imovelweb.com.br/propiedades/-3012187664.html',
    'https://www.imovelweb.com.br/propiedades/-3008528824.html',
    'https://www.imovelweb.com.br/propiedades/-3004588991.html'
  ];
  for (const url of urls) {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000);
    const d = await page.evaluate(() => {
      const titulo = document.title;
      const text = document.body.innerText;
      const m1 = text.match(/no bairro\s+([^-\n,]{3,40})\s*[-,]/i);
      const linhas = text.split('\n').map(l => l.trim()).filter(l => l && /paulo|bairro/i.test(l)).slice(0, 5);
      return { titulo, m1: m1 ? m1[1] : null, linhas };
    });
    console.log('\nURL:', url);
    console.log('TITULO:', d.titulo);
    console.log('M1 (no bairro):', d.m1);
    console.log('LINHAS:', d.linhas);
    await page.close();
  }
  await browser.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
