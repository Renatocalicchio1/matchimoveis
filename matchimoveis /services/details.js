const playwright = require('playwright');

let browser;

async function getBrowser() {
  if (!browser) {
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

function moneyToNumber(text = '') {
  const match = String(text).match(/R\$\s?[\d\.]+/);
  return match ? Number(match[0].replace(/\D/g, '')) : 0;
}

async function getPropertyDetails(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    const data = await page.evaluate(() => {
      const text = document.body.innerText;

      const title = document.title || '';

      const valorMatch = text.match(/R\$\s?[\d\.]+/);
      const areaMatch = text.match(/(\d+)\s?m²/i);
      const quartosMatch = text.match(/(\d+)\s?quartos?/i);
      const suitesMatch = text.match(/(\d+)\s?su[ií]tes?/i);
      const vagasMatch = text.match(/(\d+)\s?vagas?/i);
      const banheirosMatch = text.match(/(\d+)\s?banheiros?/i);

      let bairro = '';
      let cidade = 'São Paulo';
      let estado = 'SP';

      const bairroTitle = title.match(/quartos?\s+(.+?)\s+são paulo/i);
      if (bairroTitle) {
        bairro = bairroTitle[1]
          .replace(/à venda em/ig, '')
          .replace(/,/g, '')
          .replace(/-/g, ' ')
          .trim();
      }

      if (!bairro) {
        const url = window.location.href;
        const slugMatch = url.match(/comprar\/[^/]*?quartos?-([a-z0-9-]+)-sao-paulo/i);
        if (slugMatch) {
          bairro = slugMatch[1]
            .split('-')
            .map(p => p.charAt(0).toUpperCase() + p.slice(1))
            .join(' ');
        }
      }

      let tipo = 'Apartamento';
      if (/casa/i.test(title + ' ' + window.location.href)) tipo = 'Casa';

      const valor_imovel = valorMatch ? Number(valorMatch[0].replace(/\D/g, '')) : 0;
      const area_m2 = areaMatch ? Number(areaMatch[1]) : 0;

      return {
        bairro,
        cidade,
        estado,
        tipo,
        valor_imovel,
        area_m2,
        quartos: quartosMatch ? Number(quartosMatch[1]) : 0,
        suites: suitesMatch ? Number(suitesMatch[1]) : 0,
        banheiros: banheirosMatch ? Number(banheirosMatch[1]) : 0,
        vagas: vagasMatch ? Number(vagasMatch[1]) : 0
      };
    });

    await page.close();
    return data;
  } catch (e) {
    await page.close();
    return {
      bairro: '',
      cidade: '',
      estado: '',
      tipo: '',
      valor_imovel: 0,
      area_m2: 0,
      quartos: 0,
      suites: 0,
      banheiros: 0,
      vagas: 0,
      error: e.message
    };
  }
}

module.exports = { getPropertyDetails };
