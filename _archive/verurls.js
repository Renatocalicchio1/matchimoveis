const fs = require('fs');
const d = JSON.parse(fs.readFileSync('data.json','utf8'));
const sem = d.filter(i => !i.bairro || !i.bairro.trim()).slice(0,10);
sem.forEach(i => console.log(i.url));
