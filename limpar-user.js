const fs = require('fs');

const USER_ID = 'ALE-2442';
const file = 'imoveis.json';

if (fs.existsSync(file) === false) {
  console.log('imoveis.json não existe');
  process.exit();
}

let data = JSON.parse(fs.readFileSync(file, 'utf8'));

const antes = data.length;

data = data.filter(i =>
  String(i.userId || i.usuarioId || i.corretorId || '') !== USER_ID
);

const depois = data.length;

fs.writeFileSync(file, JSON.stringify(data, null, 2));

console.log('Removidos:', antes - depois);
console.log('Restantes:', depois);
