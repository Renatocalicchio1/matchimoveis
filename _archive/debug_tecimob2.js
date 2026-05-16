const fs = require('fs');
const XLSX = require('xlsx');

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function limparValor(v) {
  return Number(String(v || '').replace(/[^0-9,.]/g,'').replace(/\./g,'').replace(',','.')) || 0;
}

const wb = XLSX.readFile('backup-28-11-25.06_22 (1) (1).xlsx');
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Imóveis']);

const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const users = JSON.parse(fs.readFileSync('users.json','utf8'));
const ran = users.find(u => u.codigoUsuario === 'RAN-0888');
const alvo = imoveis.filter(i => String(i.userId || i.usuarioId || '') === String(ran.id));

let semBairro = 0, semValorMatch = 0, semRua = 0, semQuartos = 0, ok = 0;

alvo.forEach(imovel => {
  const bairroIm = norm(imovel.bairro || '');
  const ruaIm = norm(imovel.endereco || '');
  const valorIm = Number(imovel.valor_imovel || 0);

  const bairroMatch = rows.filter(r => norm(r['Bairro']) === bairroIm);
  if (!bairroMatch.length) { semBairro++; return; }

  const valorMatch = bairroMatch.filter(r => {
    const diff = Math.abs(limparValor(r['Preço']) - valorIm) / valorIm;
    return diff <= 0.02;
  });
  if (!valorMatch.length) { semValorMatch++; return; }

  const ruaMatch = valorMatch.filter(r => {
    const ruaCad = norm(r['Logradouro'] || '');
    return !ruaCad || !ruaIm || ruaCad === ruaIm;
  });
  if (!ruaMatch.length) { semRua++; return; }

  ok++;
});

console.log('Sem bairro match:', semBairro);
console.log('Sem valor match (bairro ok):', semValorMatch);
console.log('Sem rua match (bairro+valor ok):', semRua);
console.log('Passaram todos os filtros:', ok);

// Mostrar exemplos que falharam no valor
console.log('\n=== Exemplos que falharam no VALOR ===');
let count = 0;
alvo.forEach(imovel => {
  if (count >= 5) return;
  const bairroIm = norm(imovel.bairro || '');
  const valorIm = Number(imovel.valor_imovel || 0);
  const bairroMatch = rows.filter(r => norm(r['Bairro']) === bairroIm);
  if (!bairroMatch.length) return;
  const valorMatch = bairroMatch.filter(r => Math.abs(limparValor(r['Preço']) - valorIm) / valorIm <= 0.02);
  if (!valorMatch.length && bairroMatch.length > 0) {
    count++;
    const valoresTec = bairroMatch.slice(0,3).map(r => limparValor(r['Preço']));
    console.log(`XML: bairro=${imovel.bairro} valor=${valorIm} | Tecimobi valores: ${valoresTec}`);
  }
});
