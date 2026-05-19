const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const file = process.argv[2];
const importUserId = process.argv[3] || "";
const DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');

if (!file) { console.log('ERRO: informe o arquivo'); process.exit(1); }

function norm(v = '') {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function pick(row, keys) {
  for (const k of keys) {
    const found = Object.keys(row).find(h => norm(h) === norm(k));
    if (found && row[found] !== undefined && row[found] !== '') return String(row[found]).trim();
  }
  return '';
}

function money(v) {
  if (!v) return 0;
  return Number(String(v).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
}

function parseSheet(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerIndex = raw.findIndex(r =>
    r.some(c => norm(c) === 'nome') &&
    r.some(c => norm(c).includes('telefone') || norm(c).includes('celular') || norm(c).includes('whatsapp') || norm(c).includes('contato'))
  );
  if (headerIndex < 0) {
    console.log('ERRO: cabeçalho não encontrado. Obrigatório: Nome + Telefone');
    console.log('Primeiras linhas:', JSON.stringify(raw.slice(0, 3)));
    process.exit(1);
  }
  const headers = raw[headerIndex].map(h => String(h).trim());
  console.log('HEADER:', headers.join(' | '));
  return raw.slice(headerIndex + 1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i]; });
    return obj;
  });
}

const rows = parseSheet(file);
const existing = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : [];
let adicionados = 0, duplicados = 0, ignorados = 0;

for (const r of rows) {
  const nome = pick(r, ['Nome', 'name']);
  const telefone = String(pick(r, ['Telefone', 'Celular', 'WhatsApp', 'Contato', 'phone'])).replace(/\D/g, '');

  if (!nome && !telefone) { ignorados++; continue; }
  if (!telefone) { ignorados++; console.log('IGNORADO sem telefone:', nome); continue; }

  // Anti-duplicação por telefone + userId
  const dup = existing.find(x => {
    const xUser = String(x.userId || x.codigoUsuario || '');
    const xFone = String(x.telefone || x.contato || '').replace(/\D/g, '');
    return xUser === importUserId && xFone.slice(-8) === telefone.slice(-8);
  });
  if (dup) { duplicados++; console.log('DUPLICADO:', nome, telefone); continue; }

  const valorMin = money(pick(r, ['Valor_min', 'Valor min', 'Valor mínimo', 'valor_min']));
  const valorMax = money(pick(r, ['Valor_max', 'Valor max', 'Valor máximo', 'valor_max']));
  const areaMin = money(pick(r, ['Area_min', 'Área min', 'Area min', 'area_min']));
  const areaMax = money(pick(r, ['Area_max', 'Área max', 'Area max', 'area_max']));

  const lead = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    nome,
    telefone,
    whatsapp: telefone,
    email: pick(r, ['Email', 'E-mail', 'email']),
    origem: pick(r, ['Origem', 'origem', 'source']) || 'planilha',
    userId: importUserId,
    codigoUsuario: importUserId,
    status: 'novo',
    faseFunil: pick(r, ['Fase_funil', 'Fase funil', 'fase']) || 'novo',
    temperatura: pick(r, ['Temperatura', 'temperatura']) || 'frio',
    observacoes: pick(r, ['Observacoes', 'Observações', 'obs', 'notas']),
    perfilIA: {
      tipo: norm(pick(r, ['Tipo', 'tipo', 'type'])),
      transacao: norm(pick(r, ['Transacao', 'Transação', 'operacao'])) || 'compra',
      condicao: norm(pick(r, ['Condicao', 'Condição', 'condicao'])) || 'usado',
      bairro: pick(r, ['Bairro', 'bairro', 'neighborhood']),
      cidade: pick(r, ['Cidade', 'cidade', 'city']),
      estado: pick(r, ['Estado', 'estado', 'state']),
      quartos: Number(pick(r, ['Quartos', 'quartos', 'bedrooms'])) || 0,
      suites: Number(pick(r, ['Suites', 'Suítes', 'suites'])) || 0,
      vagas: Number(pick(r, ['Vagas', 'vagas', 'garage'])) || 0,
      banheiros: Number(pick(r, ['Banheiros', 'banheiros', 'bathrooms'])) || 0,
      areaMin,
      areaMax,
      valorMin,
      valorMax,
    },
    bairro: pick(r, ['Bairro', 'bairro']),
    cidade: pick(r, ['Cidade', 'cidade']),
    quartos: Number(pick(r, ['Quartos', 'quartos'])) || 0,
    valorMax,
    mensagens: [],
    matches: [],
    matchesAuto: [],
    timeline: [],
    eventos: [],
    followUps: [],
    deletadoPor: [],
    criadoEm: new Date().toISOString(),
    data_cadastro: new Date().toISOString()
  };

  existing.push(lead);
  adicionados++;
  console.log('ADICIONADO:', lead.nome, lead.telefone, lead.perfilIA.bairro || '-', lead.perfilIA.tipo || '-');
}

fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
console.log(`\nRESULTADO: ${adicionados} adicionados | ${duplicados} duplicados | ${ignorados} ignorados`);
console.log('TOTAL NA BASE:', existing.length);
