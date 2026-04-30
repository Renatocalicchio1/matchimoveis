const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launchPersistentContext(
    './chrome-olx-profile',
    {
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    }
  );

  const page = await browser.newPage();

  // Escuta respostas de rede
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('phone') || url.includes('contact') || url.includes('lead')) {
      try {
        const text = await res.text();
        const m = text.match(/\(?\d{2}\)?[\s-]?9\d{4}[\s-]?\d{4}/);
        if (m) {
          console.log('\nTELEFONE (NETWORK):', m[0]);
        }
      } catch {}
    }
  });

  const url = 'https://sp.olx.com.br/sao-paulo-e-regiao/imoveis/apartamento-no-jabaquara-sp-1393987841';
  console.log('ABRINDO:', url);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  const btn = page.locator('text=Telefone').first();
  if (await btn.isVisible().catch(() => false)) {
    console.log('CLICANDO EM TELEFONE...');
    await btn.click();
    await page.waitForTimeout(8000);
  }

  await browser.close();
})();
