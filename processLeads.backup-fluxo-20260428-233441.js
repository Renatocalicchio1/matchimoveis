const fs = require('fs');
const XLSX = require('xlsx');
const { extractProperty } = require('./services/extractor');

const file = process.argv[2];
if (!file) {
  console.log('ERRO: informe o arquivo');
  process.exit(1);
}

function norm(v = '') {
  return String(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function pick(row, aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const found = keys.find(k => norm(k) === norm(alias));
    if (found && row[found] !== undefined && row[found] !== null) {
      return String(row[found]).trim();
    }
  }
  return '';
}

function money(v='') {
  const n = String(v).replace(/\D/g,'');
  return n ? Number(n) : 0;
}

function fixUrl(url, id) {
  if (url && url.startsWith('http')) return url;
  if (id) return `https://www.imovelweb.com.br/propiedades/-${id}.html`;
  return '';
}

function readRows(file) {
  const wb = XLSX.readFile(file, { raw:false, codepage:65001 });
  const sheetName = wb.SheetNames.includes('Data') ? 'Data' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  const raw = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'' });

  const headerIndex = raw.findIndex(r =>
    r.some(c => norm(c) === 'nome') &&
    r.some(c => norm(c).includes('url'))
  );

  if (headerIndex < 0) {
    console.log('ERRO: cabeçalho não encontrado');
    console.log(raw.slice(0,5));
    process.exit(1);
  }

  const headers = raw[headerIndex].map(h => String(h).trim());
  console.log('HEADER USADO:', headers.join(' | '));

  return raw.slice(headerIndex + 1)
    .filter(r => r.some(c => String(c).trim()))
    .map(r => {
      const obj = {};
      headers.forEach((h,i) => obj[h]=r[i]);
      return obj;
    });
}

(async () => {
  const rows = readRows(file);

  let existing = fs.existsSync('data.json')
    ? JSON.parse(fs.readFileSync('data.json','utf8'))
    : [];

  if (!Array.isArray(existing)) existing = existing.results || [];

  let adicionados = 0;
  let duplicados = 0;

  for (const r of rows) {
    const id = pick(r, ['Id anúncio','Id anuncio','id do anúncio','id']);
    const url = fixUrl(pick(r, ['Url anúncio','Url anuncio','url do anúncio','url']), id);

    const lead = {
      nome: pick(r, ['Nome']),
      email: pick(r, ['E-mail usuário','E-mail usuario','email','e-mail']),
      contato: pick(r, ['Telefone','Telefone 2','celular','whatsapp','contato']),
      telefone2: pick(r, ['Telefone 2']),
      id,
      estado: pick(r, ['Estado','UF']) || 'SP',
      cidade: pick(r, ['Cidade']) || 'São Paulo',
      bairro: pick(r, ['Bairro']),
      tipo: pick(r, ['Tipo de imóvel','Tipo de imovel']),
      tipo_operacao: pick(r, ['Tipo de operação','Tipo de operacao']),
      valor_imovel: money(pick(r, ['Preço','Preco','Valor'])),
      titulo: pick(r, ['Título','Titulo']),
      url,
      matchCount: 0,
      createdAt: new Date().toISOString()
    };

    if (!lead.id && !lead.url) continue;

    const dup = existing.find(x =>
      (x.url && lead.url && x.url === lead.url) ||
      (x.id && lead.id && x.id === lead.id && x.email === lead.email && x.contato === lead.contato)
    );

    if (dup) {
      duplicados++;
      console.log('IGNORADO DUPLICADO:', lead.id, lead.nome);
      continue;
    }

    console.log('EXTRAINDO:', lead.id, lead.url);

    let origin = {};
    try {
      origin = await extractProperty({ listingUrl: lead.url, listingId: lead.id }, lead);
    } catch (e) {
      origin = { extractionStatus: 'erro', error: e.message, url: lead.url };
    }

    lead.origin = origin;
    lead.bairro = origin.bairro || lead.bairro;
    lead.tipo = origin.tipo || lead.tipo;
    lead.valor_imovel = origin.valor_imovel || lead.valor_imovel;
    lead.area_m2 = origin.area_m2 || 0;
    lead.quartos = origin.quartos || 0;
    lead.suites = origin.suites || 0;
    lead.banheiros = origin.banheiros || 0;
    lead.vagas = origin.vagas || 0;
    lead.extractionStatus = origin.extractionStatus || 'ok';

    existing.push(lead);
    adicionados++;

    console.log('ADICIONADO:', lead.id, lead.nome, lead.bairro, lead.valor_imovel, lead.area_m2);
  }

  fs.writeFileSync('data.json', JSON.stringify(existing, null, 2));

  console.log('TOTAL NA BASE:', existing.length);
  console.log('ADICIONADOS:', adicionados);
  console.log('DUPLICADOS:', duplicados);
})();
