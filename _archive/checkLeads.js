const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const arr = Array.isArray(raw) ? raw : (raw.results || []);
const admin = arr.filter(l => l.userId === 'admin');
const semBairro = admin.filter(l => !l.bairro || !l.bairro.trim());
const comUrl = admin.filter(l => l.url);
console.log('Total admin:', admin.length);
console.log('Com URL:', comUrl.length);
console.log('Sem bairro:', semBairro.length);
