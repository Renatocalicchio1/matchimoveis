const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js','utf8');

// Substituir a linha problemática do botão
const antigo = ctx.match(/.*importarXMLPeloChat.*\n/)[0];
const novo = "        '<button onclick=\"importarXMLPeloChat(\\'' + url + '\\')\" style=\"background:#ff385c;color:white;border:none;border-radius:10px;padding:10px 20px;font-weight:700;cursor:pointer;font-size:14px\">\uD83D\uDCE5 Importar agora</button>' +\n";

ctx = ctx.replace(antigo, novo);
fs.writeFileSync('cerebro/contexto.js', ctx);
console.log('ok');
