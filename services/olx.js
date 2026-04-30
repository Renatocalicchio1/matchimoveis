const { chromium } = require('playwright');
const { getMemory, upsertMemory } = require('./olxMemory');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function normalizeText(t=''){
  return String(t)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s]/g,'')
    .trim();
}

function slug(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function moneyToNumber(text = '') {
  const m = String(text).match(/R\$\s*([\d.]+)/);
  if (!m) return 0;
  return Number(m[1].replace(/\./g, '')) || 0;
}

function numAfter(label, text) {
  const re = new RegExp(label + '\\n(\\d+)', 'i');
  const m = String(text).match(re);
  return m ? Number(m[1]) : null;
}

function extractDetail(text, url, origin, telefoneCapturado = '') {
  const id = (url.match(/-(\d+)$/) || [])[1] || url;

  const valor_imovel = moneyToNumber(text);

  const area_m2 =
    numAfter('Área útil', text) ||
    Number((text.match(/(\d+)m²/i) || [])[1]) ||
    null;

  let quartos =
    numAfter('Quartos', text) ||
    Number((text.match(/•\s*(\d+)\s*Quartos/i) || [])[1]) ||
    null;

  if (quartos && quartos > 10) quartos = null;

  const banheiros =
    numAfter('Banheiros', text) ||
    Number((text.match(/(\d+)\s*Banheiros/i) || [])[1]) ||
    null;

  const vagas =
    numAfter('Vagas na garagem', text) ||
    Number((text.match(/(\d+)\s*Vaga/i) || [])[1]) ||
    null;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let bairro = origin.bairro;
  const spLineIndex = lines.findIndex(l => l === 'São Paulo' || l === 'São Paulo - SP');
  const bairroLine = lines.find(l => l.includes(', São Paulo, SP'));
  if (bairroLine) {
    const parts = bairroLine.split(',');
    if (parts.length >= 3) bairro = parts[0].trim();
  }

  if (!bairro || bairro.length > 40 || /simular|localização|consórcio|lado|avenida|rua/i.test(bairro)) {
    bairro = origin.bairro;
  }

  const anuncianteIdx = lines.findIndex(l => l.includes('Último acesso'));
  const anuncianteNome = anuncianteIdx > 0 ? lines[anuncianteIdx - 1] : '';

  const telefoneDisponivel = /\nTelefone\n/i.test(text);

  let anuncianteTipo = 'indefinido';

  if (/Direto com o proprietário/i.test(text)) {
    anuncianteTipo = 'proprietario';
  } else if (/CRECI|corretor|corretora|imobili[aá]ria|consultor|consultora|Plano Profissional|profissional/i.test(text)) {
    anuncianteTipo = 'profissional';
  } else if (anuncianteNome && !/olx|zap|viva real|im[oó]veis|imobili[aá]ria|corretor|corretora/i.test(anuncianteNome)) {
    anuncianteTipo = 'proprietario_provavel';
  }

  return {
    fonte: 'OLX',
    id,
    url,
    tipo: origin.tipo,
    bairro,
    cidade: 'São Paulo',
    estado: 'SP',
    valor_imovel,
    area_m2,
    quartos,
    suites: null,
    banheiros,
    vagas,
    anuncianteNome,
    anuncianteTelefone: telefoneCapturado,
    anuncianteTelefoneDisponivel: telefoneDisponivel,
    anuncianteTipo
  };
}

async function searchOLX(property) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH
  });

  try {
    if (!property || property.cidade !== 'São Paulo' || property.estado !== 'SP') return [];

    const bairroSlug = slug(property.bairro || '');
    const queryTipo = String(property.tipo || '').toLowerCase().includes('casa') ? 'casa' : 'apartamento';

    const busca = encodeURIComponent(queryTipo + ' ' + (property.bairro || ''));
    const url = 'https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/sao-paulo?q=' + busca + '&pe=500000&sf=1&o=1';

    console.log('OLX URL:', url);

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(7000);

    const links = await page.$$eval('a', els =>
      [...new Set(
        els
          .map(a => a.href)
          .filter(h => h && h.includes('olx.com.br') && h.includes('/imoveis/venda/')))
          )
      )].slice(0, 10)
    );

    console.log('OLX links capturados:', links.length);

    const linksParaVisitar = links.filter(link => {
      const mem = getMemory(link);
      return !(mem && mem.status === 'extraido' && mem.temTelefone);
    });

    console.log('OLX links para visitar:', linksParaVisitar.length);

    links.forEach(link => {
      upsertMemory(link, {
        fonte: 'OLX',
        status: 'link_encontrado',
        firstSeenAt: new Date().toISOString()
      });
    });

    const results = [];

    for (const link of linksParaVisitar) {

      let telefoneCapturado = '';

      const onResponse = async (res) => {
        try {
          const url = res.url();
          if (url.includes('phone') || url.includes('contact') || url.includes('lead')) {
            const txt = await res.text();
            const m = txt.match(/\(?\d{2}\)?[\s-]?9\d{4}[\s-]?\d{4}/);
            if (m) telefoneCapturado = m[0].replace(/\D/g, '');
          }
        } catch {}
      };
      const p = await browser.newPage();
        p.on('response', onResponse);
      try {
        console.log('OLX detalhe:', link);
        await p.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await p.waitForTimeout(5000);

        // tenta clicar no botão telefone
        try {
          const btn = p.locator('text=Telefone').first();
          if (await btn.isVisible().catch(() => false)) {
            await btn.click();
            await p.waitForTimeout(6000);
          }
        } catch {}
        const text = await p.locator('body').innerText().catch(() => '');
        const item = extractDetail(text, link, property, telefoneCapturado);

        const bairroOrigem = normalizeText(property.bairro || '');
        const bairroItem = normalizeText(item.bairro || '');

        // tenta extrair bairro da URL também
        let bairroUrl = '';
        const m = item.url.match(/imoveis\/([^\-]+(?:\-[^\-]+)*)-/);
        if (m) bairroUrl = normalizeText(m[1].replace(/-/g, ' '));

        const mesmoBairro = bairroItem === bairroOrigem || bairroUrl.includes(bairroOrigem);

        const quartosOk = item.quartos === property.quartos || item.quartos === property.quartos + 1 || item.quartos === property.quartos + 2;

        const valorMin = Math.max(500000, Math.round(property.valor_imovel * 0.65));
        const valorMax = Math.round(property.valor_imovel * 1.2);
        const valorOk = item.valor_imovel >= valorMin && item.valor_imovel <= valorMax;

        const areaMin = Math.round(property.area_m2 * 0.75);
        const areaMax = Math.round(property.area_m2 * 1.35);
        const areaOk = item.area_m2 >= areaMin && item.area_m2 <= areaMax;

        if (
          item.cidade === 'São Paulo' &&
          item.estado === 'SP' &&
          item.valor_imovel >= 500000 &&
          mesmoBairro &&
          quartosOk &&
          valorOk &&
          areaOk
        ) {
          results.push(item);

          const scoreIA =
            (item.anuncianteTelefone ? 40 : 0) +
            (item.anuncianteTipo === 'proprietario' ? 30 : 0) +
            (item.anuncianteTipo === 'proprietario_provavel' ? 20 : 0) +
            (item.anuncianteNome ? 10 : 0) +
            (item.valor_imovel && item.valor_imovel <= property.valor_imovel ? 10 : 0) +
            (item.bairro ? 10 : 0);

          item.scoreIA = scoreIA;

          upsertMemory(item.url, {
            status: 'extraido',
            dados: item,
            scoreIA,
            temTelefone: !!item.anuncianteTelefone,
            anunciante: item.anuncianteNome,
            telefone: item.anuncianteTelefone,
            tipoAnunciante: item.anuncianteTipo
          });
        }
      } catch (e) {
        console.log('Erro detalhe OLX:', e.message);
      } finally {
        await p.close();
      }
    }

    results.sort((a, b) => (b.scoreIA || 0) - (a.scoreIA || 0));

    console.log('OLX imóveis detalhados:', results.length);

    return results;

  } catch (err) {
    console.log('Erro OLX próprio:', err.message);
    return [];
  } finally {
    await browser.close();
  }
}

module.exports = { searchOLX };
