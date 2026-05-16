const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data.json','utf8'));

function num(v){ return Number(String(v || 0).replace(/[^\d.,-]/g,'').replace(/\./g,'').replace(',','.')) || 0; }
function txt(v){ return String(v || '').trim().toLowerCase(); }

function pctDiff(base, value) {
  base = num(base);
  value = num(value);
  if (!base || !value) return 999;
  return Math.abs(value - base) / base;
}

function getArea(o){ return num(o.area_m2 || o.area || o.areaUtil || o.area_util); }
function getValor(o){ return num(o.valor_imovel || o.valor || o.price); }

function isValid25(origin, candidate) {
  if (txt(origin.cidade) !== 'são paulo') return false;
  if (txt(origin.estado) !== 'sp') return false;
  if (txt(candidate.cidade) !== 'são paulo') return false;
  if (txt(candidate.estado) !== 'sp') return false;

  if (txt(origin.tipo) !== txt(candidate.tipo)) return false;
  if (txt(origin.bairro) !== txt(candidate.bairro)) return false;

  const oq = num(origin.quartos);
  const cq = num(candidate.quartos);
  if (!(cq === oq || cq === oq + 1)) return false;

  if (pctDiff(getValor(origin), getValor(candidate)) > 0.25) return false;
  if (pctDiff(getArea(origin), getArea(candidate)) > 0.25) return false;

  return true;
}

let perfisComMatchBuscado = 0;
let atual20 = 0;
let simulado25 = 0;
let semRawCandidates = 0;

data.forEach(item => {
  const matches = Array.isArray(item.matches) ? item.matches : [];
  const candidatos = Array.isArray(item.rawCandidates) ? item.rawCandidates : [];

  if (matches.length || candidatos.length) perfisComMatchBuscado++;

  atual20 += matches.length;

  if (!candidatos.length) {
    semRawCandidates++;
    return;
  }

  simulado25 += candidatos.filter(c => isValid25(item.origin || {}, c)).length;
});

console.log('============================');
console.log('PERFIS QUE JÁ BUSCARAM MATCH:', perfisComMatchBuscado);
console.log('MATCHES ATUAIS SALVOS:', atual20);
console.log('MATCHES SIMULADOS COM 25%:', simulado25);
console.log('GANHO ESTIMADO:', simulado25 - atual20);
console.log('ITENS SEM rawCandidates:', semRawCandidates);
console.log('============================');
