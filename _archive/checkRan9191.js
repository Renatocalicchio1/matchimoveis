const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const arr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);
const ran9191 = arr.filter(i => i.userId === 'imobiliaria-47991919191');
const fontes = {};
ran9191.forEach(i => { fontes[i.fonte || 'sem fonte'] = (fontes[i.fonte || 'sem fonte'] || 0) + 1; });
console.log('Total RAN-9191:', ran9191.length);
console.log('Por fonte:', JSON.stringify(fontes, null, 2));
