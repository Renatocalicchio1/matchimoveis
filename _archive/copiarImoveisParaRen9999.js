const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const arr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);

const fonte = arr.filter(i => 
  i.userId === 'imobiliaria-47991919191' || 
  i.userId === 'imobiliaria-47992010888'
);

console.log('Imoveis para copiar:', fonte.length);

const copias = fonte.map(i => ({
  ...i,
  userId: 'imobiliaria-REN-9999',
  usuarioId: 'imobiliaria-REN-9999',
  codigoUsuario: 'REN-9999',
  id: (i.id || i.idExterno) + '-REN9999',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}));

const novoArr = [...arr, ...copias];
fs.writeFileSync('imoveis.json', JSON.stringify(novoArr, null, 2));
console.log('Copiados:', copias.length);
console.log('Total imoveis:', novoArr.length);
