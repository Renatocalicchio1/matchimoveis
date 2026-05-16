const fs = require('fs');
const { norm } = require('./matchBaseInterna.js');

const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const leads = Array.isArray(raw) ? raw : (raw.results || []);
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const imoveisArr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);

const bairrosBase = new Set(imoveisArr.map(i => norm(i.bairro)).filter(Boolean));
const admin = leads.filter(l => l.userId === 'admin' && l.bairro);
const comMatch = admin.filter(l => bairrosBase.has(norm(l.bairro)));
const semMatch = admin.filter(l => !bairrosBase.has(norm(l.bairro)));

console.log('Total admin com bairro:', admin.length);
console.log('Com bairro na base:', comMatch.length);
console.log('Sem bairro na base:', semMatch.length);
console.log('\nExemplos com bairro na base:');
comMatch.slice(0,5).forEach(l => console.log(' -', l.nome, '|', l.bairro));
