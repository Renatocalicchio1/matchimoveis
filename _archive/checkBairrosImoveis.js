const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const arr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);
const bairros = [...new Set(arr.map(i => i.bairro).filter(Boolean))].sort();
console.log('Total bairros na base:', bairros.length);
console.log(bairros.slice(0, 30).join('\n'));
