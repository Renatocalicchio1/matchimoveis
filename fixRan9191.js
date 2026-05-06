const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const arr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);

arr.forEach(i => {
  if (i.fonte === 'COMPLEXO IMOBILIÁRIO') {
    if (i.userId === 'imobiliaria-47991919191') {
      // Tira os 946
      i.userId = '';
      i.usuarioId = '';
      i.codigoUsuario = '';
    } else if (!i.userId || !i.userId.trim()) {
      // Vincula os 846
      i.userId = 'imobiliaria-47991919191';
      i.usuarioId = 'imobiliaria-47991919191';
      i.codigoUsuario = 'RAN-9191';
    }
  }
});

fs.writeFileSync('imoveis.json', JSON.stringify(arr, null, 2));
const ran9191 = arr.filter(i => i.userId === 'imobiliaria-47991919191');
const semUser = arr.filter(i => !i.userId || !i.userId.trim());
console.log('RAN-9191:', ran9191.length);
console.log('Sem userId:', semUser.length);
