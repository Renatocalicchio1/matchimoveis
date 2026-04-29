const fs = require('fs');
const crypto = require('crypto');

const file = 'data.json';

if (!fs.existsSync(file)) {
  console.error('data.json não encontrado');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));

let count = 0;

for (const item of data) {
  if (!item.offerToken) {
    item.offerToken = crypto.randomBytes(8).toString('hex');
    count++;
  }
}

fs.writeFileSync(file, JSON.stringify(data, null, 2));

console.log(`Tokens criados: ${count}`);
console.log('Pronto. Agora cada lead tem um offerToken.');
