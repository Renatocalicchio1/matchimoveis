const fs = require('fs');
const XLSX = require('xlsx');

const file = process.argv[2];
if (!file) {
  console.log('ERRO: informe o arquivo');
  process.exit(1);
}

function norm(v = '') {
  return String(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ã¡/g,'a')
    .replace(/Ã³/g,'o')
    .replace(/Ã­/g,'i')
    .replace(/Ã©/g,'e')
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

const wb = XLSX.readFile(file, { raw: false, codepage: 65001 });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

let resultados = rows.map(r => ({
  nome: pick(r, ['Nome', 'nome', 'nome do cliente']),
  email: pick(r, ['E-mail usuário', 'E-mail usuario', 'E-mail usuÃ¡rio', 'email', 'e-mail']),
  contato: pick(r, ['Telefone', 'Telefone 2', 'celular', 'whatsapp', 'contato']),
  id: pick(r, ['Id anúncio', 'Id anuncio', 'Id anÃºncio', 'id do anúncio', 'id do imovel']),
  estado: pick(r, ['Estado', 'UF']),
  cidade: pick(r, ['Cidade']),
  bairro: pick(r, ['Bairro']),
  url: pick(r, ['Url anúncio', 'Url anuncio', 'Url anÃºncio', 'url do anúncio', 'url']),
  matchCount: 0,
  createdAt: new Date().toISOString()
}));

resultados = resultados.filter(l => l.cidade === 'São Paulo' && (l.estado === 'São Paulo' || l.estado === 'SP'));
fs.writeFileSync('data.json', JSON.stringify(resultados, null, 2));
console.log('Leads processados:', resultados.length);
