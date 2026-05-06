const fs = require('fs');
const { buscarMatchesBaseInterna, norm } = require('./matchBaseInterna.js');

const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const leads = Array.isArray(raw) ? raw : (raw.results || []);
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const imoveisArr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);

const paraMatch = leads.filter(l => l.userId === 'imobiliaria-47991919191' && l.extractionStatus === 'ok');
console.log('Leads para match:', paraMatch.length);

let comMatch = 0, semMatch = 0;
paraMatch.forEach((lead, i) => {
  const matches = buscarMatchesBaseInterna(lead, imoveisArr);
  lead.matchesBase = matches;
  lead.matchCountBase = matches.length;
  if (matches.length > 0) {
    comMatch++;
    console.log('[' + (i+1) + '] ' + lead.nome + ' -> ' + matches.length + ' matches | bairro:' + lead.bairro + ' | tipo:' + lead.tipo + ' | q:' + lead.quartos + ' | v:' + lead.valor_imovel);
  } else {
    semMatch++;
    console.log('[' + (i+1) + '] ' + lead.nome + ' -> sem match | bairro:' + lead.bairro + ' | tipo:' + lead.tipo + ' | q:' + lead.quartos + ' | v:' + lead.valor_imovel);
  }
});

fs.writeFileSync('data.json', JSON.stringify(leads, null, 2));
console.log('\nCom match:', comMatch, '| Sem match:', semMatch);
