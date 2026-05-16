const fs = require('fs');
const { buscarMatchesBaseInterna } = require('./matchBaseInterna.js');

const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const leads = Array.isArray(raw) ? raw : (raw.results || []);
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const imoveisArr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);

const ids = ['3026786507', '3025119124'];
const paraMatch = leads.filter(l => ids.some(id => l.url && l.url.includes(id)));

console.log('Leads para match:', paraMatch.length);
paraMatch.forEach((lead, i) => {
  const matches = buscarMatchesBaseInterna(lead, imoveisArr);
  lead.matchesBase = matches;
  lead.matchCountBase = matches.length;
  console.log('\n[' + (i+1) + '] ' + lead.nome + ' | bairro:' + lead.bairro + ' | tipo:' + lead.tipo + ' | q:' + lead.quartos + ' | v:' + lead.valor_imovel);
  console.log('Matches encontrados:', matches.length);
  matches.slice(0,3).forEach(m => console.log('  -', m.bairro, '|', m.tipo, '| q:', m.quartos, '| v:', m.valor));
});

fs.writeFileSync('data.json', JSON.stringify(leads, null, 2));
console.log('\nSalvo.');
