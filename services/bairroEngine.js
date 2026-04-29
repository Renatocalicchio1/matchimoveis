const fs = require('fs');

const bairros = JSON.parse(
  fs.readFileSync('./data/bairros-sp.json','utf8')
);

function normalize(t='') {
  return String(t)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .trim();
}

function isRua(t='') {
  return /(rua|avenida|estrada|alameda|travessa)/i.test(t);
}

function isBairroSP(text='') {
  const t = normalize(text);
  return bairros.includes(t);
}

function extractFromText(text='') {
  const t = normalize(text);

  for (const b of bairros) {
    if (t.includes(b)) return b;
  }
  return '';
}

function resolveBairroSmart(text='') {
  if (!text) return '';

  const clean = normalize(text);

  if (isRua(clean)) return '';

  if (isBairroSP(clean)) return clean;

  return extractFromText(clean);
}

module.exports = {
  resolveBairroSmart,
  isBairroSP,
  normalize
};
