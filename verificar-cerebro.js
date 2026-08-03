'use strict';
// Checagem de deriva do conhecimento do assistente: compara os links do menu
// (views/partials/app-shell.ejs) contra as rotas cadastradas em cerebro.js.
// Roda manual (node verificar-cerebro.js) — recomendado depois de adicionar
// qualquer item novo no menu, antes de rodar `node cerebro.js` e dar deploy.
const fs = require('fs');
const path = require('path');

const shellPath = path.join(__dirname, 'views', 'partials', 'app-shell.ejs');
const cerebroPath = path.join(__dirname, 'cerebro.js');

const shell = fs.readFileSync(shellPath, 'utf8');
const cerebroSrc = fs.readFileSync(cerebroPath, 'utf8');

// Extrai hrefs de menu (ignora query string e âncora #, só rotas /app*)
const hrefsMenu = new Set();
const reHref = /href="(\/app[^"#?]*)"/g;
let m;
while ((m = reHref.exec(shell))) hrefsMenu.add(m[1]);

// Extrai rotas cadastradas em cerebro.js (array `rotas`)
const rotasCerebro = new Set();
const reRota = /rota\s*:\s*'([^']+)'/g;
while ((m = reRota.exec(cerebroSrc))) rotasCerebro.add(m[1]);

const faltando = [...hrefsMenu].filter(h => !rotasCerebro.has(h)).sort();

if (!faltando.length) {
  console.log('✅ Todos os links do menu estão mapeados em cerebro.js.');
  process.exit(0);
}

console.log('⚠️  Links do menu SEM entrada em cerebro.js (o assistente não sabe explicar essas páginas):');
faltando.forEach(h => console.log('   - ' + h));
console.log('\nAdicione essas rotas no array `rotas` de cerebro.js, com label/descrição, e rode `node cerebro.js` de novo.');
process.exit(1);
