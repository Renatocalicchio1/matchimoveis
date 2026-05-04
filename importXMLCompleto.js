const fs = require('fs');
const axios = require('axios');
const XLSX = require('xlsx');
const { XMLParser } = require('fast-xml-parser');

const XML_URL = process.argv[2];
const USER_ID = process.argv[3] || '';
const EXCEL_FILE = process.argv[4];

if (!XML_URL) {
  console.log('Uso: node importXMLCompleto.js URL_XML [arquivo.xlsx]');
  process.exit();
}

const FILE = 'imoveis.json';

function normalizeId(id) {
  return String(id || '').replace(/\D/g, '').trim();
}

function saveData(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function extractNumber(field) {
  if (!field && field !== 0) return 0;
  if (typeof field === 'number') return field;
  if (typeof field === 'string') return Number(field) || 0;
  if (typeof field === 'object') {
    const val = field['#text'] ?? field['@_value'] ?? '';
    return Number(val) || 0;
  }
  return 0;
}

function extractText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field.trim();
  if (typeof field === 'object') {
    return String(field['#text'] ?? field['@_abbreviation'] ?? '').trim();
  }
  return '';
}

function normalizeTipo(raw) {
  const t = (raw || '').toLowerCase();
  if (t.includes('apartment') || t.includes('apartamento')) return 'Apartamento';
  if (t.includes('house') || t.includes('casa')) return 'Casa';
  if (t.includes('sobrado')) return 'Sobrado';
  if (t.includes('studio') || t.includes('kitnet')) return 'Studio';
  if (t.includes('commercial') || t.includes('comercial')) return 'Comercial';
  if (t.includes('land') || t.includes('terreno')) return 'Terreno';
  if (t.includes('flat')) return 'Flat';
  if (t.includes('cobertura')) return 'Cobertura';
  return raw || '';
}

function parseListing(l) {
  try {
    const idRaw = l.ListingID || l.ListingId || l.Id;
    const details = l.Details || {};
    const location = l.Location || {};
    const media = l.Media || {};
    const ownerInfo = l.OwnerInfo || {};

    let fotos = [];
    if (media.Item) {
      const items = Array.isArray(media.Item) ? media.Item : [media.Item];
      fotos = items.map(i => {
        if (typeof i === 'string') return i;
        return i['#text'] || i.MediaURL || i.url || '';
      }).filter(Boolean);
    }

    return {
      idExterno: idRaw,
      idOriginal: idRaw,
      titulo: l.Title || '',
      transacao: l.TransactionType === 'For Sale' ? 'venda' : 'aluguel',
      tipo: normalizeTipo(extractText(details.PropertyType)),
      categoria: extractText(details.UsageType),
      bairro: extractText(location.Neighborhood),
      cidade: extractText(location.City),
      estado: extractText(location.State),
      endereco: extractText(location.Address),
      cep: extractText(location.PostalCode),
      latitude: Number(location.Latitude) || null,
      longitude: Number(location.Longitude) || null,
      valor_imovel: extractNumber(details.ListPrice),
      condominio: extractNumber(details.PropertyAdministrationFee),
      iptu: extractNumber(details.Iptu),
      area_m2: extractNumber(details.LivingArea),
      area_total: extractNumber(details.LotArea),
      quartos: Number(details.Bedrooms) || 0,
      suites: Number(details.Suites) || 0,
      banheiros: Number(details.Bathrooms) || 0,
      vagas: Number(details.Garage) || 0,
      descricao: l.Description || extractText(details.Description) || '',
      fotos,
      corretor: {
        nome: extractText(ownerInfo.Name),
        email: extractText(ownerInfo.Email),
        telefone: extractText(ownerInfo.Telephone),
      },
      fonte: extractText(l.ContactInfo?.Name || l.ContactInfo?.name) || 'XML',
      source: 'xml',
      userId: USER_ID,
      usuarioId: USER_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      proprietario: {
        nome: '',
        telefone: '',
        email: '',
        status: 'pendente'
      }
    };
  } catch (e) {
    console.error('Erro ao parsear listing:', e.message);
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
    const possibleIds = [r.id, r.ID, r.codigo, r.codigo_imovel, r.ListingID, r.listing_id];
    return possibleIds.some(pid =>
      normalizeId(pid).includes(imovelId) || imovelId.includes(normalizeId(pid))
    );
  });
}

async function run() {
  console.log('⬇️  Baixando XML...');
  const res = await axios.get(XML_URL);
  const xml = res.data;

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: true,
  });

  const json = parser.parse(xml);

  const listings =
    json?.ListingDataFeed?.Listings?.Listing ||
    json?.Listings?.Listing ||
    [];

  const arr = Array.isArray(listings) ? listings : [listings];
  console.log('🏠 Imóveis no XML:', arr.length);

  const novos = arr.map(parseListing).filter(Boolean);

  if (EXCEL_FILE) {
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
    console.log('🔗 Proprietários vinculados:', vinculados);
  }

  const atuais = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE,"utf8")) : [];
  // REMOVE todos os imóveis antigos desse usuário
const restantes = atuais.filter(i => {
  const dono = String(i.userId || i.usuarioId || i.corretorId || '');
  return dono !== String(USER_ID);
});

// ADICIONA os novos já limpos
const novosFormatados = novos.map(n => ({
  ...n,
  userId: USER_ID,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastCheckedAt: new Date().toISOString()
}));

// IDS que vieram no XML
const idsNovos = new Set(novos.map(n => String(n.idExterno)));

// Imóveis antigos desse usuário
const antigosDoUsuario = atuais.filter(i => {
  const dono = String(i.userId || i.usuarioId || i.corretorId || '');
  return dono === String(USER_ID);
});

// Marca como inativo quem não veio no XML
const inativos = antigosDoUsuario
  .filter(i => !idsNovos.has(String(i.idExterno)))
  .map(i => ({
    ...i,
    status: 'inativo',
    updatedAt: new Date().toISOString()
  }));

// Novos ativos (reativa se estava inativo)
const novosFormatadosComStatus = novos.map(n => {
  const antigo = antigosDoUsuario.find(a => String(a.idExterno) === String(n.idExterno));
  return {
    ...antigo,
    ...n,
    userId: USER_ID,
    status: 'ativo',
    createdAt: antigo ? antigo.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString()
  };
});

const final = [...restantes, ...novosFormatadosComStatus, ...inativos];
  saveData(final);

  const comValor = novos.filter(n => n.valor_imovel > 0).length;
  const comArea = novos.filter(n => n.area_m2 > 0).length;
  const comFotos = novos.filter(n => n.fotos.length > 0).length;

  console.log('✅ Total imóveis salvos:', novos.length);
  console.log('💰 Com valor:', comValor);
  console.log('📐 Com área:', comArea);
  console.log('📷 Com fotos:', comFotos);
}

run().catch(err => console.error('Erro:', err.message));
