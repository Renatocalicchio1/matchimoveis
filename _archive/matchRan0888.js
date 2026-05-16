const fs = require('fs');
const { buscarMatchesBaseInterna } = require('./matchBaseInterna.js');

const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const leads = Array.isArray(raw) ? raw : (raw.results || []);
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const imoveisArr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);

// Filtra só imoveis RAN-0888
const imoveisRan0888 = imoveisArr.filter(i => i.userId === 'imobiliaria-47992010888');
console.log('Imoveis RAN-0888:', imoveisRan0888.length);

const paraMatch = leads.filter(l => l.extractionStatus === 'ok');
console.log('Leads para match:', paraMatch.length);

let comMatch = 0, semMatch = 0;
paraMatch.forEach((lead, i) => {
  const matches = buscarMatchesBaseInterna(lead, imoveisRan0888);
  if (matches.length > 0) {
    // Adiciona aos matchesBase existentes sem duplicar
    const existentes = lead.matchesBase || [];
    const idsExistentes = new Set(existentes.map(m => m.idExterno || m.id));
    const novos = matches.filter(m => !idsExistentes.has(m.idExterno || m.id));
    lead.matchesBase = [...existentes, ...novos];
    lead.matchCountBase = lead.matchesBase.length;
    comMatch++;
    console.log('[' + (i+1) + '] ' + lead.nome + ' -> ' + novos.length + ' novos matches RAN-0888 | bairro:' + lead.bairro);
  } else {
    semMatch++;
  }
});

fs.writeFileSync('data.json', JSON.stringify(leads, null, 2));
console.log('\nCom match RAN-0888:', comMatch, '| Sem match:', semMatch);
