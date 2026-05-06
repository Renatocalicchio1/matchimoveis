const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const arr = Array.isArray(raw) ? raw : (raw.results || []);
let transferidas = 0;
arr.forEach(l => {
  if (l.userId === 'imobiliaria-4799999999' || l.codigoUsuario === 'REN-9999') {
    l.userId = 'imobiliaria-47991919191';
    l.usuarioId = 'imobiliaria-47991919191';
    l.corretorId = 'imobiliaria-47991919191';
    l.codigoUsuario = 'RAN-9191';
    transferidas++;
  }
});
fs.writeFileSync('data.json', JSON.stringify(arr, null, 2));
console.log('Transferidas:', transferidas);
console.log('Total leads:', arr.length);
