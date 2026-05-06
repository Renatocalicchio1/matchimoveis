const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const arr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);

let desvinculados = 0;
arr.forEach(i => {
  if (i.userId === 'imobiliaria-47991919191' && i.codigoUsuario !== 'RAN-9191') {
    i.userId = '';
    i.usuarioId = '';
    i.codigoUsuario = '';
    desvinculados++;
  }
});

fs.writeFileSync('imoveis.json', JSON.stringify(arr, null, 2));
const ran9191 = arr.filter(i => i.userId === 'imobiliaria-47991919191');
console.log('Desvinculados:', desvinculados);
console.log('RAN-9191 restante:', ran9191.length);
