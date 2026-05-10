const fs = require('fs');
let idx = fs.readFileSync('cerebro/index.js', 'utf8');

const antigo = `    const celularMatch = mensagem.match(/(\\(?\\d{2}\\)?[\\s-]?\\d{4,5}[\\s-]?\\d{4})/);`;
const novo = `    const celularMatch = mensagem.match(/(\\(?\\d{2}\\)?[\\s-]?\\d{3,5}[\\s-]?\\d{3,4})/);`;

if (idx.includes(antigo)) {
  idx = idx.replace(antigo, novo);
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('ok');
} else {
  console.log('nao encontrado');
}
