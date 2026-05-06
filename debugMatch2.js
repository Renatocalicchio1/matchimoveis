const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const arr = Array.isArray(raw) ? raw : (raw.results || []);
const lead = arr.find(l => l.nome === 'Bruno' && l.matchesBase && l.matchesBase.length > 0);
console.log('Match exemplo:');
console.log(JSON.stringify(lead.matchesBase[0], null, 2));
