const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const CSV_FILE = process.argv[2];
if (!CSV_FILE) { console.log('Uso: node cruzarProprietarios.js arquivo.csv'); process.exit(1); }
const IMOVEIS_FILE = path.join(__dirname, 'imoveis.json');

function norm(s) {
  return String(s||'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
}
function normBairro(s) { return norm(s).replace(/\(.*?\)/g,'').trim(); }
function normEnd(s) { return norm(s).split(' - ')[0].trim(); }
function limparFone(v) { return String(v||'').replace(/[\s\-().]/g,'').trim(); }
function toInt(v) { return parseInt(String(v||'0').replace(/\D/g,'')) || 0; }
function area(s) {
  const m = String(s||'').match(/(\d+)[,.]?(\d*)/);
  return m ? parseInt(m[1]) : 0;
}

// Score de similaridade — quanto menor melhor
function score(r, q, ban, vag, a) {
  const dq   = Math.abs(toInt(r['Dormitórios']) - q);
  const dban = Math.abs(toInt(r['Banheiros'])   - ban);
  const dvag = Math.abs(toInt(r['Garagens'])     - vag);
  const da   = Math.abs(area(r['Medidas'])       - a);
  // Quartos e area têm mais peso
  return (dq * 10) + (dban * 3) + (dvag * 3) + (da * 0.1);
}

const wb = XLSX.readFile(CSV_FILE, { raw: false, codepage: 65001 });
const planilha = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

const cols = Object.keys(planilha[0]);
const colProp = cols.find(c => norm(c).includes('proprietario') || norm(c).includes('propriet'));
const colTel  = cols.find(c => norm(c).includes('celular'));

// Índice por bairro+logradouro
const idx = {};
for (const r of planilha) {
  const k = normBairro(r['Bairro']) + '|' + norm(r['Logradouro']);
  if (!idx[k]) idx[k] = [];
  idx[k].push(r);
}

const imoveis = JSON.parse(fs.readFileSync(IMOVEIS_FILE, 'utf8'));
let cruzados = 0, semMatch = 0, jatem = 0;

for (const im of imoveis) {
  if (im.proprietario && im.proprietario.telefone) { jatem++; continue; }

  const b = normBairro(im.bairro);
  const e = normEnd(im.endereco);
  const q   = toInt(im.quartos);
  const ban = toInt(im.banheiros);
  const vag = toInt(im.vagas);
  const a   = toInt(im.area_m2 || im.area || 0);

  const candidatos = idx[`${b}|${e}`] || [];
  if (candidatos.length === 0) { semMatch++; continue; }

  // Ordena pelo score e pega o melhor
  const match = candidatos.sort((ca, cb) => score(ca,q,ban,vag,a) - score(cb,q,ban,vag,a))[0];

  const nome = String(match[colProp]||'').trim();
  const telefone = limparFone(match[colTel]||'');
  if (!nome && !telefone) { semMatch++; continue; }

  im.proprietario = {
    nome, telefone,
    corretor: String(match['Corretor']||'').trim(),
    referencia: String(match['Referencia']||'').trim(),
    importadoEm: new Date().toISOString()
  };
  cruzados++;
}

fs.writeFileSync(IMOVEIS_FILE, JSON.stringify(imoveis, null, 2));
console.log('✅ CRUZADOS:', cruzados);
console.log('⏭️  JÁ TINHAM:', jatem);
console.log('❌ SEM MATCH:', semMatch);
console.log('📦 TOTAL:', imoveis.length);
