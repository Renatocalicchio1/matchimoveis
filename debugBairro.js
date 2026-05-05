const playwright = require('playwright');
async function main() {
  const browser = await playwright.chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('https://www.imovelweb.com.br/propiedades/-3008528824.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);
  const debug = await page.evaluate(() => {
    const titulo = document.title;
    const linhas = document.body.innerText.split('\n').map(l => l.trim()).filter(l => l && /paulo|bairro/i.test(l)).slice(0, 15);
    return { titulo, linhas };
  });
  console.log('TITULO:', debug.titulo);
  console.log('\nLINHAS:');
  debug.linhas.forEach(l => console.log(' -', l));
  await browser.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
