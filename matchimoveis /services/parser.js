const XLSX = require('xlsx');

const FIELD_ALIASES = {
  clientName: ['nome do cliente', 'cliente', 'nome', 'client_name', 'nome_cliente'],
  contact: ['telefone / contato', 'telefone', 'contato', 'whatsapp', 'phone', 'telefone_contato', 'telefone 2'],
  email: ['email', 'e-mail', 'e-mail usuario', 'email usuario', 'e-mail usuário', 'email usuário', 'usuario email', 'user email'],
  listingId: ['id do anúncio', 'id do anuncio', 'id_anuncio', 'id anúncio', 'codigo', 'código', 'id anuncio=id do anuncio', 'id anuncio', 'id anãºncio', 'id anaºncio'],
  listingUrl: ['url do anúncio', 'url do anuncio', 'url_anuncio', 'url', 'link', 'url anúncio= url do imovel', 'url imovel', 'url do imovel', 'url do imóvel', 'url anãºncio', 'url anaºncio']
};


function cleanValue(value) {
  if (!value) return '';
  return value.toString().trim().replace(/\s+/g, ' ');
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function mapHeader(header) {
  const normalized = normalizeHeader(header);
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

function parseWorkbook(filePath) {
  const lowerPath = String(filePath || '').toLowerCase();

  if (lowerPath.endsWith('.numbers')) {
    throw new Error('Arquivos .numbers do Mac ainda não são lidos diretamente neste MVP. No Numbers, exporte a planilha para Excel (.xlsx) ou CSV e envie o arquivo exportado.');
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const normalizedRows = rawRows.map((row, index) => {
    const mapped = {
      rowNumber: index + 2,
      clientName: '',
      contact: '',
      email: '',
      listingId: '',
      listingUrl: ''
    };

    for (const [header, value] of Object.entries(row)) {
      const field = mapHeader(header);
      if (field) mapped[field] = String(value || '').trim();
    }

    return mapped;
  });

  return normalizedRows;
}

function removeDuplicates(rows) {
  const seen = new Set();
  const unique = [];
  const duplicates = [];

  for (const row of rows) {
    const key = row.listingUrl
      ? `url:${row.listingUrl.toLowerCase()}`
      : row.listingId
      ? `id:${row.listingId.toLowerCase()}`
      : `empty:${row.rowNumber}`;

    if (seen.has(key)) {
      duplicates.push(row);
      continue;
    }

    seen.add(key);
    unique.push(row);
  }

  return { unique, duplicates };
}

module.exports = {
  parseWorkbook,
  removeDuplicates,
  FIELD_ALIASES
};
