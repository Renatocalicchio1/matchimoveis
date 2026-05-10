const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const antigo = `    if (data.resposta && data.resposta.trim().includes('ACAO_CADASTRAR_LEAD:')) {`;
const novo = `    console.log('DEBUG resposta raw:', JSON.stringify(data.resposta));
    if (data.resposta && data.resposta.trim().includes('ACAO_CADASTRAR_LEAD:')) {`;

if (!ejs.includes('DEBUG resposta raw')) {
  ejs = ejs.replace(antigo, novo);
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('ok');
} else {
  console.log('ja existe');
}
