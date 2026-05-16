const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const arr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);
let atualizados = 0;
arr.forEach(i => {
  if (!i.userId || !i.userId.trim()) {
    i.userId = 'imobiliaria-47991919191';
    i.usuarioId = 'imobiliaria-47991919191';
    i.codigoUsuario = 'RAN-9191';
    atualizados++;
  }
});
fs.writeFileSync('imoveis.json', JSON.stringify(arr, null, 2));
console.log('Atualizados:', atualizados);
console.log('Total:', arr.length);
