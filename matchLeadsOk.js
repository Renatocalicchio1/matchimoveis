const fs = require('fs');
const { buscarMatchesBaseInterna } = require('./matchBaseInterna.js');

const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const leads = Array.isArray(raw) ? raw : (raw.results || []);
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const imoveisArr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);

const IDS_TESTE = new Set([
  '3012991542',
  '3034436969',
  '3012187664',
  '3023417424',
  '3026777889',
  '3026786167',
  '3026759178'
]);

const USER_TESTE = 'corretor-47992010889';

const paraMatch = leads.filter(l => {
  const uid = String(l.userId || l.usuarioId || l.corretorId || '');
  const id = String(l.id || l.idAnuncio || l.idAnuncioOrigem || '');
  return uid === USER_TESTE &&
    IDS_TESTE.has(id) &&
    l.extractionStatus === 'ok';
});

console.log('Leads prontas para match desta conta/teste:', paraMatch.length);

let comMatch = 0, semMatch = 0;
paraMatch.forEach((lead, i) => {
  const matches = buscarMatchesBaseInterna(lead, imoveisArr);
  lead.matchesBase = matches;
  lead.matchCountBase = matches.length;
  if (matches.length > 0) {
    comMatch++;
    console.log('[' + (i+1) + '] ' + lead.nome + ' -> ' + matches.length + ' matches | bairro:' + lead.bairro + ' | tipo:' + lead.tipo + ' | q:' + lead.quartos);
  } else {
    semMatch++;
    console.log('[' + (i+1) + '] ' + lead.nome + ' -> sem match | bairro:' + lead.bairro + ' | tipo:' + lead.tipo + ' | q:' + lead.quartos);
  }
});

fs.writeFileSync('data.json', JSON.stringify(leads, null, 2));
console.log('\nCom match:', comMatch, '| Sem match:', semMatch);
