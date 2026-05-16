const fs = require('fs');
const { norm } = require('./matchBaseInterna.js');
const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const arr = Array.isArray(raw) ? raw : (raw.results || []);
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const imoveisArr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);
const bairrosBase = new Set(imoveisArr.map(i => norm(i.bairro)).filter(Boolean));

const comBairroNaBase = arr.filter(l => l.bairro && bairrosBase.has(norm(l.bairro)));
const pendentes = comBairroNaBase.filter(l => l.extractionStatus !== 'ok' && l.url && l.url.includes('imovelweb'));
const ok = arr.filter(l => l.extractionStatus === 'ok');

console.log('Total leads:', arr.length);
console.log('Com bairro na base:', comBairroNaBase.length);
console.log('Pendentes de extracao:', pendentes.length);
console.log('Ja extraidas:', ok.length);
