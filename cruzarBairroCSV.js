const fs = require('fs');
const DATA_FILE = './data.json';
const CSV_FILE = './b7.csv';

const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const leads = Array.isArray(raw) ? raw : (raw.results || []);

const csvLinhas = fs.readFileSync(CSV_FILE, 'utf8').split('\n').slice(1);
const mapaBairro = {};
csvLinhas.forEach(linha => {
  const cols = linha.split(';');
  const idAnuncio = (cols[4] || '').trim();
  const bairro = (cols[7] || '').trim();
  if (idAnuncio && bairro) mapaBairro[idAnuncio] = bairro;
});

console.log('Bairros no CSV:', Object.keys(mapaBairro).length);

let atualizados = 0, removidos = 0, jaTemBairro = 0;

const leadsFiltradas = leads.filter(lead => {
  if (lead.bairro && lead.bairro.trim()) { jaTemBairro++; return true; }
  const url = lead.url || '';
  const idMatch = url.match(/propiedades\/-?(\d+)\.html/);
  const id = idMatch ? idMatch[1] : String(lead.id || '');
  const bairro = mapaBairro[id];
  if (bairro) {
    lead.bairro = bairro;
    lead.extractionStatus = 'ok';
    atualizados++;
    return true;
  }
  removidos++;
  return false;
});

fs.writeFileSync(DATA_FILE, JSON.stringify(leadsFiltradas, null, 2));
console.log('Ja tinham bairro:', jaTemBairro);
console.log('Atualizadas com CSV:', atualizados);
console.log('Removidas sem bairro:', removidos);
console.log('Total final:', leadsFiltradas.length);
