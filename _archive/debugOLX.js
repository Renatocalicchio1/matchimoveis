const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });

  const page = await browser.newPage();

  const url = 'https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/sao-paulo/vila-mariana?q=apartamento';

  console.log('ABRINDO:', url);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(10000);

  console.log('URL FINAL:', page.url());
  console.log('TITULO:', await page.title());

  const text = await page.locator('body').innerText().catch(() => '');
  console.log('TEXTO BODY PRIMEIROS 2000:');
  console.log(text.slice(0, 2000));

  const links = await page.$$eval('a', els => els.slice(0, 80).map(a => a.href).filter(Boolean));
  console.log('LINKS:');
  console.log(links);

  await browser.close();
})();
