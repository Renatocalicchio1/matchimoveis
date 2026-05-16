const fs = require('fs');
fs.writeFileSync('data.json', JSON.stringify([], null, 2));
console.log('Todas as leads removidas.');
