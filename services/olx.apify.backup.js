require('dotenv').config();
const { ApifyClient } = require('apify-client');

const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
});

function slug(text = '') {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

async function searchOLX(property) {
  try {
    if (!property || property.cidade !== 'São Paulo' || property.estado !== 'SP') {
      return [];
    }

    const bairroSlug = slug(property.bairro || '');
    const tipo = property.tipo?.toLowerCase().includes('casa') ? 'casas' : 'apartamentos';

    const url = `https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/${bairroSlug}?q=${tipo}`;

    console.log('OLX URL:', url);

    const run = await client.actor("leadercorp/olx-imoveis-scraper").call({
      startUrls: [{ url }],
      maxItems: 20
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    const results = items.map(item => ({
      fonte: 'OLX',
      id: item.id || item.url,
      url: item.url,
      tipo: property.tipo,
      bairro: property.bairro,
      cidade: 'São Paulo',
      estado: 'SP',
      valor_imovel: item.price || 0,
      area_m2: item.size || null,
      quartos: item.rooms || null,
      suites: null,
      banheiros: item.bathrooms || null,
      vagas: item.parking || null
    }));

    console.log('OLX encontrados:', results.length);

    return results;

  } catch (err) {
    console.log('Erro OLX:', err.message);
    return [];
  }
}

module.exports = { searchOLX };
