const playwright = require('playwright');

function onlyNumber(value) {
  const n = String(value || '').replace(/\D/g, '');
  return n ? Number(n) : 0;
}

function clean(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function extractAddress(text) {
  let bairro = '';
  let cidade = '';
  let estado = '';
  let logradouro = '';

  // 🔥 REGEX PRINCIPAL (funciona no seu exemplo)
  const match = text.match(/([^\n]+?),\s*([^,\n]+),\s*(São Paulo|Sao Paulo)/i);

  if (match) {
    logradouro = clean(match[1]);
    bairro = clean(match[2]);
    cidade = 'São Paulo';
    estado = 'SP';
  }

  // limpeza final
  if (
    !bairro ||
    bairro.length > 50 ||
    /cep|guias|comprar|alugar|anunciar|aprenda/i.test(bairro)
  ) {
    bairro = '';
  }

  return { logradouro, bairro, cidade, estado };
}

async function extractProperty(row, origin) {
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  
});

  const page = await browser.newPage();

  try {
    await await page.goto(row.listingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('body', { timeout: 15000 });
    await page.waitForTimeout(8000);
    await page.waitForTimeout(5000);

    const data = await page.evaluate(() => {
      const clean = (v='') => String(v).replace(/\s+/g, ' ').trim();
      const onlyNumber = (v) => {
        const n = String(v || '').replace(/\D/g, '');
        return n ? Number(n) : 0;
      };

      function extractAddress(text) {
        let bairro = '';
        let cidade = '';
        let estado = '';
        let logradouro = '';

        const match = text.match(/([^\n]+?),\s*([^,\n]+),\s*(São Paulo|Sao Paulo)/i);

        if (match) {
          logradouro = clean(match[1]);
          bairro = clean(match[2]);
          cidade = 'São Paulo';
          estado = 'SP';
        }

        if (
          !bairro ||
          bairro.length > 50 ||
          /cep|guias|comprar|alugar|anunciar|aprenda/i.test(bairro)
        ) {
          bairro = '';
        }

        return { logradouro, bairro, cidade, estado };
      }

      const text = document.body.innerText;
      const titulo = document.title || '';

      const address = extractAddress(text);

      const valorMatch = text.match(/R\$\s?[\d\.]+/);
      const areaMatch = text.match(/(\d+)\s?m²/i);
      const quartosMatch = text.match(/(\d+)\s?(quartos?|dormitórios?)/i);
      const suitesMatch = text.match(/(\d+)\s?suítes?/i);
      const banheirosMatch = text.match(/(\d+)\s?banheiros?/i);
      const vagasMatch = text.match(/(\d+)\s?vagas?/i);

      let tipo = 'Apartamento';
      if (/casa|sobrado|comercial/i.test(titulo + ' ' + text.slice(0, 500))) {
        tipo = 'Casa';
      }

      const valor_imovel = valorMatch ? onlyNumber(valorMatch[0]) : 0;
      const area_m2 = areaMatch ? Number(areaMatch[1]) : 0;

      return {
        titulo,
        ...address,
        tipo,
        area_m2,
        valor_m2: valor_imovel && area_m2 ? Math.round(valor_imovel / area_m2) : 0,
        quartos: quartosMatch ? Number(quartosMatch[1]) : 0,
        suites: suitesMatch ? Number(suitesMatch[1]) : 0,
        banheiros: banheirosMatch ? Number(banheirosMatch[1]) : 0,
        vagas: vagasMatch ? Number(vagasMatch[1]) : 0,
        valor_imovel
      };
    });

    await browser.close();

    return {
      ...origin,
      extractionStatus: data.bairro ? 'ok' : 'bairro_invalido',
      url: row.listingUrl,
      ...data
    };

  } catch (e) {
    await browser.close();
    return {
      ...origin,
      extractionStatus: 'erro',
      error: e.message,
      url: row.listingUrl
    };
  }
}

module.exports = { extractProperty };
