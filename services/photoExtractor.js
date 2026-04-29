const { chromium } = require('playwright');

async function extractPhotos(url) {
  if (!url) return [];

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const urls = new Set();

      document.querySelectorAll('img').forEach(img => {
        const src = img.src || img.getAttribute('data-src');
        if (!src) return;

        if (
          src.includes('quintoandar') ||
          src.includes('cloudfront') ||
          src.includes('remax') ||
          src.includes('imovel')
        ) urls.add(src);
      });

      document.querySelectorAll('source').forEach(source => {
        const srcset = source.getAttribute('srcset');
        if (!srcset) return;
        srcset.split(',').forEach(part => {
          const u = part.trim().split(' ')[0];
          if (u) urls.add(u);
        });
      });

      const text = document.body.innerText || '';
      const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

      let descricao = '';

      const markers = [
        'Sobre o imóvel',
        'Descrição do imóvel',
        'Conheça este imóvel',
        'Descrição',
        'Características do imóvel'
      ];

      for (const marker of markers) {
        const idx = lines.findIndex(l => l.toLowerCase().includes(marker.toLowerCase()));
        if (idx >= 0) {
          descricao = lines.slice(idx + 1, idx + 8).join(' ');
          break;
        }
      }

      if (!descricao) {
        descricao = lines
          .filter(l => l.length > 80)
          .find(l =>
            !l.toLowerCase().includes('política') &&
            !l.toLowerCase().includes('cookies') &&
            !l.toLowerCase().includes('entrar')
          ) || '';
      }

      return {
        fotos: Array.from(urls)
          .filter(u => u.startsWith('http'))
          .filter(u => !u.includes('logo'))
          .filter(u => !u.includes('icon'))
          .slice(0, 10),
        descricao
      };
    });

    return result;
  } catch (err) {
    console.log('Erro ao extrair fotos/descrição:', err.message);
    return { fotos: [], descricao: '' };
  } finally {
    await browser.close();
  }
}

module.exports = { extractPhotos };
