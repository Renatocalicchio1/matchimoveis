const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const arr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);
const ran9191 = arr.filter(i => i.userId === 'imobiliaria-47991919191');
const ran0888 = arr.filter(i => i.userId === 'imobiliaria-47992010888');
const fontes9191 = [...new Set(ran9191.map(i => i.fonte))];
const fontes0888 = [...new Set(ran0888.map(i => i.fonte))];
console.log('RAN-9191 fontes:', fontes9191);
console.log('RAN-0888 fontes:', fontes0888);
