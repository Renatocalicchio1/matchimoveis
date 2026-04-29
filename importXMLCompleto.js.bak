const fs = require('fs');
const axios = require('axios');
const XLSX = require('xlsx');
const { XMLParser } = require('fast-xml-parser');

const XML_URL = process.argv[2];
const EXCEL_FILE = process.argv[3];

if (!XML_URL || !EXCEL_FILE) {
  console.log('Uso: node importXMLCompleto.js URL_XML arquivo.xlsx');
  process.exit();
}

const FILE = 'imoveis.json';

function normalizeId(id) {
  return String(id || '')
    .replace(/\D/g, '') // remove tudo que não é número
    .trim();
}

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
    const idRaw = l.ListingID || l.ListingId || l.Id;

    const details = l.Details || {};
    const location = l.Location || {};
    const media = l.Media || {};

    let fotos = [];

    if (media.Item) {
      if (Array.isArray(media.Item)) {
        fotos = media.Item.map(i => i.url || i.MediaURL || '');
      } else {
        fotos = [media.Item.url || media.Item.MediaURL || ''];
      }
    }

    return {
      idExterno: normalizeId(idRaw),
      idOriginal: idRaw,

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
      fotos: fotos.filter(Boolean),

      source: 'xml',
      lastUpdate: new Date().toISOString(),

      proprietario: {
        nome: '',
        telefone: '',
        email: '',
        status: 'pendente'
      }
    };

  } catch {
    return null;
  }
}

function loadExcel(file) {
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
}

function findOwner(imovelId, rows) {
  return rows.find(r => {
    const possibleIds = [
      r.id,
      r.ID,
      r.codigo,
      r.codigo_imovel,
      r.ListingID,
      r.listing_id
    ];

    return possibleIds.some(pid => normalizeId(pid).includes(imovelId) || imovelId.includes(normalizeId(pid)));
  });
}

async function run() {
  console.log('⬇️ Baixando XML...');
  const res = await axios.get(XML_URL);
  const xml = res.data;

  const parser = new XMLParser({ ignoreAttributes: false });
  const json = parser.parse(xml);

  const listings =
    json?.ListingDataFeed?.Listings?.Listing ||
    json?.Listings?.Listing ||
    [];

  console.log('🏠 Imóveis no XML:', listings.length);

  const novos = listings.map(parseListing).filter(Boolean);

  console.log('📊 Carregando Excel...');
  const rows = loadExcel(EXCEL_FILE);

  let vinculados = 0;

  novos.forEach(n => {
    const owner = findOwner(n.idExterno, rows);

    if (owner) {
      n.proprietario = {
        nome: owner.nome || owner.Nome || '',
        telefone: owner.telefone || owner.Telefone || '',
        email: owner.email || owner.Email || '',
        status: 'vinculado'
      };
      vinculados++;
    }
  });

  saveData(novos);

  console.log('✅ Total imóveis:', novos.length);
  console.log('🔗 Proprietários vinculados:', vinculados);
}

run().catch(err => console.error('Erro:', err.message));
