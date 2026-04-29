const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });

  const page = await browser.newPage();

  const urls = [
    'https://www.remax.com.br/pt-br/imoveis/venda/sao-paulo/parque-jabaquara',
    'https://www.remax.com.br/pt-br/imoveis/casa/venda/sao-paulo/parque-jabaquara',
    'https://www.remax.com.br/pt-br/imoveis/casa/venda/sao-paulo',
    'https://www.remax.com.br/pt-br/imoveis/venda/sao-paulo'
  ];

  for (const url of urls) {
    console.log('\nTESTANDO:', url);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(5000);

      console.log('TITLE:', await page.title());
      console.log('URL FINAL:', page.url());

      const links = await page.$$eval('a', as =>
        as.map(a => ({
          href: a.href,
          text: (a.innerText || '').replace(/\s+/g, ' ').trim()
        }))
        .filter(x => x.href.includes('/imoveis/') || x.text.includes('R$'))
        .slice(0, 30)
      );

      console.log(JSON.stringify(links, null, 2));
    } catch (e) {
      console.log('ERRO:', e.message);
    }
  }

  await browser.close();
})();
