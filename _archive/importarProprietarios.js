const fs = require('fs');
const XLSX = require('xlsx');

const FILE_PROP = process.argv[2];
if (!FILE_PROP) { console.log('Uso: node importarProprietarios.js arquivo.csv/xlsx'); process.exit(1); }

const IMOVEIS_FILE = 'imoveis.json';

function normalizeId(id) {
  return String(id || '').replace(/\D/g, '').trim();
}

function norm(v = '') {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function pick(row, aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const found = keys.find(k => norm(k) === norm(alias));
    if (found !== undefined && row[found] !== undefined && row[found] !== null && String(row[found]).trim()) {
      return String(row[found]).trim();
    }
  }
  return '';
}

function lerPlanilha(file) {
  const wb = XLSX.readFile(file, { raw: false, codepage: 65001 });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function lerCSV(file) {
  const wb = XLSX.readFile(file, { raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

(async () => {
  // Lê planilha
  let rows = [];
  try {
    rows = lerPlanilha(FILE_PROP);
  } catch(e) {
    rows = lerCSV(FILE_PROP);
  }

  console.log('LINHAS NA PLANILHA:', rows.length);
  if (rows.length === 0) { console.log('Planilha vazia'); process.exit(1); }
  console.log('COLUNAS:', Object.keys(rows[0]).join(' | '));

  // Lê imóveis
  if (!fs.existsSync(IMOVEIS_FILE)) { console.log('imoveis.json não encontrado'); process.exit(1); }
  const imoveis = JSON.parse(fs.readFileSync(IMOVEIS_FILE, 'utf8'));
  console.log('IMOVEIS NA BASE:', imoveis.length);

  // Monta índice por ID
  const indice = new Map();
  imoveis.forEach((im, i) => {
    const id = normalizeId(im.idExterno || im.idOriginal || im.id);
    if (id) indice.set(id, i);
  });

  let cruzados = 0;
  let naoEncontrados = 0;

  for (const row of rows) {
    const id = normalizeId(
      pick(row, ['id do anuncio','id anuncio','listingid','listing_id','id','codigo','codigo_imovel','ID'])
    );
    if (!id) continue;

    const idx = indice.get(id);
    if (idx === undefined) {
      naoEncontrados++;
      continue;
    }

    const nome     = pick(row, ['nome','name','proprietario','corretor']);
    const telefone = pick(row, ['telefone','celular','whatsapp','phone','fone','contato']);
    const email    = pick(row, ['email','e-mail']);

    if (!nome && !telefone && !email) continue;

    imoveis[idx].proprietario = {
      nome,
      telefone,
      email,
      importadoEm: new Date().toISOString()
    };

    cruzados++;
    console.log('CRUZADO:', id, nome, telefone);
  }

  fs.writeFileSync(IMOVEIS_FILE, JSON.stringify(imoveis, null, 2));

  console.log('CRUZADOS:', cruzados);
  console.log('NAO ENCONTRADOS:', naoEncontrados);
  console.log('TOTAL IMOVEIS:', imoveis.length);
})();
