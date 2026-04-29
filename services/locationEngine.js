const fs = require('fs');

const bairros = JSON.parse(fs.readFileSync('./data/bairros-sp.json','utf8'));
const ceps = JSON.parse(fs.readFileSync('./data/cep-sp.json','utf8'));

function normalize(t='') {
  return String(t)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .trim();
}

function extractCep(text='') {
  const m = text.match(/(\d{5})-?\d{3}/);
  return m ? m[1] : null;
}


function detectBairro(text='') {
  const t = normalize(text);

  const known = [
    'bela vista','vila mariana','moema','pinheiros',
    'jardim paulista','morumbi','brooklin','ipiranga',
    'vila olimpia','perdizes','jabaquara','santana',
    'tatuape','lapa','barra funda'
  ];

  for (const b of known) {
    if (t.includes(b)) {
      return { tipo: 'bairro', valor: b, fonte: 'texto' };
    }
  }

  const m = text.match(/([A-Z][a-z]+\s?[A-Z]?[a-z]+)\s*(em|na|no)/);
  if (m) {
    return { tipo: 'bairro', valor: m[1].toLowerCase(), fonte: 'regex' };
  }

  return null;
}


function detectCep(text='') {
  const cep = extractCep(text);
  if (!cep) return null;

  const bairro = ceps[cep];
  if (bairro) {
    return { tipo: 'bairro', valor: bairro, fonte: 'cep' };
  }

  return null;
}

function resolveLocation(text='') { const t = (text||'').toLowerCase(); const known=['bela vista','vila mariana','moema','pinheiros','jardim paulista','morumbi','brooklin','ipiranga','vila olimpia','perdizes','jabaquara','santana','tatuape','lapa','barra funda','mirandopolis']; for (const b of known) { if (t.includes(b)) return { tipo:'bairro', valor:b, fonte:'texto' }; } return { tipo:'invalido', valor:null }; } module.exports = { resolveLocation };