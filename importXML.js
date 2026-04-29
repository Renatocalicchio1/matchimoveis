const fs = require('fs');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const XML_URL = process.argv[2];

if (!XML_URL) {
  console.log('❌ Informe a URL do XML');
  process.exit();
}

const FILE = 'imoveis.json';

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveData(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function parseListing(l) {
  try {
    const id = l.ListingID;

    const details = l.Details || {};
    const location = l.Location || {};
    const media = l.Media || {};

    let fotos = [];

    if (media.Item) {
      if (Array.isArray(media.Item)) {
        fotos = media.Item.map(i => i.url);
      } else {
        fotos = [media.Item.url];
      }
    }

    return {
      idExterno: String(id),
      tipo: details.PropertyType || '',
      categoria: details.UsageType || '',
      bairro: location.Neighborhood || '',
      cidade: location.City || '',
      estado: location.State || '',
      valor_imovel: Number(l.ListPrice || 0),
      area_m2: Number(details.LivingArea || 0),
      quartos: Number(details.Bedrooms || 0),
      suites: Number(details.Suites || 0),
      banheiros: Number(details.Bathrooms || 0),
      vagas: Number(details.Garage || 0),
      descricao: l.Description || '',
      fotos,

      source: 'xml',
      lastUpdate: new Date().toISOString(),

      proprietario: {
        nome: '',
        telefone: '',
        email: '',
        status: 'pendente'
      }
    };

  } catch (err) {
    return null;
  }
}

async function run() {
  console.log('⬇️ Baixando XML...');
  const res = await axios.get(XML_URL);
  const xml = res.data;

  const parser = new XMLParser({
    ignoreAttributes: false
  });

  const json = parser.parse(xml);

  const listings =
    json?.ListingDataFeed?.Listings?.Listing ||
    json?.Listings?.Listing ||
    [];

  if (!listings.length) {
    console.log('❌ Nenhum imóvel encontrado no XML');
    return;
  }

  console.log('🏠 Imóveis no XML:', listings.length);

  const novos = listings
    .map(parseListing)
    .filter(Boolean);

  let base = loadData();

  const map = new Map();

  base.forEach(i => {
    if (i.idExterno) map.set(i.idExterno, i);
  });

  let criados = 0;
  let atualizados = 0;

  novos.forEach(n => {
    if (map.has(n.idExterno)) {
      const atual = map.get(n.idExterno);

      map.set(n.idExterno, {
        ...atual,
        ...n
      });

      atualizados++;
    } else {
      map.set(n.idExterno, n);
      criados++;
    }
  });

  // remover imóveis que não vieram no XML
  const novosIds = new Set(novos.map(n => n.idExterno));

  const finais = Array.from(map.values()).filter(i => {
    if (i.source !== 'xml') return true;
    return novosIds.has(i.idExterno);
  });

  saveData(finais);

  console.log('✅ Criados:', criados);
  console.log('♻️ Atualizados:', atualizados);
  console.log('🧹 Total final:', finais.length);
}

run().catch(err => {
  console.error('Erro:', err.message);
});
