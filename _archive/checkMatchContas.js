const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const leads = Array.isArray(raw) ? raw : (raw.results || []);

const comMatch = leads.filter(l => l.matchesBase && l.matchesBase.length > 0);
console.log('Leads com match:', comMatch.length);

comMatch.forEach(lead => {
  console.log('\n' + lead.nome + ' | ' + lead.bairro + ' | ' + lead.tipo);
  const ran9191 = lead.matchesBase.filter(m => m.userId === 'imobiliaria-47991919191');
  const ran0888 = lead.matchesBase.filter(m => m.userId === 'imobiliaria-47992010888');
  console.log('  RAN-9191 (Rankim):', ran9191.length, 'matches');
  console.log('  RAN-0888 (Rankim 2):', ran0888.length, 'matches');
  lead.matchesBase.forEach(m => console.log('   -', m.fonte, '|', m.bairro, '|', m.tipo, '| q:', m.quartos));
});
