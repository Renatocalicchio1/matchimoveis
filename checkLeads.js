const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const arr = Array.isArray(raw) ? raw : (raw.results || []);
const admin = arr.filter(l => l.userId === 'admin');
const comBairro = admin.filter(l => l.bairro && l.bairro.trim());
const semBairro = admin.filter(l => !l.bairro || !l.bairro.trim());
console.log('Total admin:', admin.length);
console.log('Com bairro:', comBairro.length);
console.log('Sem bairro:', semBairro.length);
if (semBairro.length > 0) {
  semBairro.slice(0,3).forEach(l => console.log(' -', l.nome, '|', l.url));
}
