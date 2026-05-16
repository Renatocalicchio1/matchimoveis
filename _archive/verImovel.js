const fs = require('fs');
const d = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
console.log('Total:', d.length);
console.log(JSON.stringify(d[0], null, 2));
