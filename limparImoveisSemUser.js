const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const arr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);
const antes = arr.length;
const filtrado = arr.filter(i => 
  i.userId === 'imobiliaria-47991919191' || 
  i.userId === 'imobiliaria-47992010888'
);
fs.writeFileSync('imoveis.json', JSON.stringify(filtrado, null, 2));
console.log('Removidos:', antes - filtrado.length);
console.log('Restantes:', filtrado.length);
