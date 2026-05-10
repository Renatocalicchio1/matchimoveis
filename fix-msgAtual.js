const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const antigo = `  const msg = texto || input.value.trim();`;
const novo = `  const msg = texto || input.value.trim();
  window.msgAtual = msg;`;

if (ejs.includes(antigo)) {
  ejs = ejs.replace(antigo, novo);
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('ok');
} else {
  console.log('nao encontrado');
}
