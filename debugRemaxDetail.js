const { chromium } = require('playwright');

(async () => {
  const url = 'https://www.remax.com.br/pt-br/imoveis/sobrado/venda/sao-paulo/1317-rua-abagiba-26%C2%AA-delegacia/602101043-11';

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });

  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(8000);

  console.log('TITLE:', await page.title());
  console.log('URL FINAL:', page.url());

  const text = await page.locator('body').innerText().catch(() => '');
  console.log('TAMANHO TEXTO:', text.length);
  console.log(text.slice(0, 2000));

  await browser.close();
})();
