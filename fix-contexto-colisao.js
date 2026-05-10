const fs = require('fs');
let idx = fs.readFileSync('cerebro/index.js', 'utf8');

// Renomear parâmetro contexto para ctxParam na função responder
idx = idx.replace(
  'function responder(mensagem, d, user, imoveis, leads, visitas, contexto) {',
  'function responder(mensagem, d, user, imoveis, leads, visitas, ctxParam) {'
);

fs.writeFileSync('cerebro/index.js', idx);
console.log('ok');
