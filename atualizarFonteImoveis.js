const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const arr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);
const users = JSON.parse(fs.readFileSync('users.json','utf8'));

let atualizados = 0;
arr.forEach(i => {
  const user = users.find(u => u.id === i.userId);
  if (user) {
    i.fonte = user.nome;
    atualizados++;
  }
});

fs.writeFileSync('imoveis.json', JSON.stringify(arr, null, 2));
console.log('Atualizados:', atualizados);
console.log('Total:', arr.length);

// Verifica resultado
const fontes = [...new Set(arr.map(i => i.fonte))];
console.log('Fontes:', fontes);
