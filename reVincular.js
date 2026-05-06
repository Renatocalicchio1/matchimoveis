const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const arr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);

let vinculados = 0, desvinculados = 0;
arr.forEach(i => {
  if (i.fonte === 'COMPLEXO IMOBILIÁRIO') {
    if (i.codigoUsuario === 'RAN-9191' || i.userId === 'imobiliaria-47991919191') {
      // Esses são os 946 errados — tira
      if (!i.codigoUsuario || i.codigoUsuario !== 'RAN-9191') {
        i.userId = '';
        i.usuarioId = '';
        desvinculados++;
      }
    }
  }
});

fs.writeFileSync('imoveis.json', JSON.stringify(arr, null, 2));
const ran9191 = arr.filter(i => i.userId === 'imobiliaria-47991919191');
const semUser = arr.filter(i => !i.userId || !i.userId.trim());
console.log('RAN-9191:', ran9191.length);
console.log('Sem userId:', semUser.length);
