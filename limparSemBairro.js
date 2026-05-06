const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const arr = Array.isArray(raw) ? raw : (raw.results || []);
const antes = arr.length;
const filtrado = arr.filter(l => l.bairro && l.bairro.trim().length > 2);
fs.writeFileSync('data.json', JSON.stringify(filtrado, null, 2));
console.log('Removidas sem bairro:', antes - filtrado.length);
console.log('Total restante:', filtrado.length);
