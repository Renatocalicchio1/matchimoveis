const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });

  const urls = [
    'https://sp.olx.com.br/sao-paulo-e-regiao/imoveis/apartamento-no-jabaquara-sp-1393987841'
  ];

  for (const url of urls) {
    const page = await browser.newPage();
    console.log('\nABRINDO:', url);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);

    const text = await page.locator('body').innerText().catch(() => '');

    console.log('\nTEXTO PRIMEIROS 4000:');
    console.log(text.slice(0, 4000));

    await page.close();
  }

  await browser.close();
})();
