const playwright = require('playwright');
async function main() {
  const browser = await playwright.chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox']
  });
  const urls = [
    'https://www.imovelweb.com.br/propiedades/-3004588991.html',
    'https://www.imovelweb.com.br/propiedades/-3008528824.html',
    'https://www.imovelweb.com.br/propiedades/-3012187664.html'
  ];
  for (const url of urls) {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    const d = await page.evaluate(() => {
      const bc = Array.from(document.querySelectorAll('[class*="breadcrumb"] a, [class*="Breadcrumb"] a, nav a')).map(el => el.innerText.trim()).filter(Boolean);
      const h1 = document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : '';
      const og = document.querySelector('meta[property="og:title"]') ? document.querySelector('meta[property="og:title"]').content : '';
      return { bc, h1, og };
    });
    console.log('\nURL:', url.split('-').pop().replace('.html',''));
    console.log('BC:', d.bc);
    console.log('H1:', d.h1);
    console.log('OG:', d.og);
    await page.close();
  }
  await browser.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
