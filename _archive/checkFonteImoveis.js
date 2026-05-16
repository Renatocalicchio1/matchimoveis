const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const arr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);
const users = JSON.parse(fs.readFileSync('users.json','utf8'));

const erros = [];
arr.forEach(i => {
  const user = users.find(u => u.id === i.userId);
  const nomeEsperado = user ? user.nome.trim() : '';
  const fonteAtual = (i.fonte || '').trim();
  if (nomeEsperado && fonteAtual !== nomeEsperado) {
    erros.push({idExterno: i.idExterno, userId: i.userId, fonteAtual, nomeEsperado});
  }
});

console.log('Total imoveis:', arr.length);
console.log('Com fonte incorreta:', erros.length);
if (erros.length > 0) console.log('Exemplos:', JSON.stringify(erros.slice(0,3), null, 2));
else console.log('Todos os imoveis com fonte correta!');
