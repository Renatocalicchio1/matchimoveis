const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const arr = Array.isArray(raw) ? raw : (raw.results || []);
const admin = arr.filter(l => l.userId === 'admin');
const ok = admin.filter(l => l.extractionStatus === 'ok');
const pendente = admin.filter(l => l.extractionStatus !== 'ok');
console.log('Total admin:', admin.length);
console.log('Com dados extraidos:', ok.length);
console.log('Pendentes:', pendente.length);
