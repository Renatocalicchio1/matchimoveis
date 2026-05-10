const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const funcao = `
async function gerarXMLTodos() {
  const portal = window._portalPendente;
  if (!portal) { alert('Portal não identificado. Tente novamente.'); return; }
  addMsg('Gerar XML de todos os imóveis — ' + portal.toUpperCase(), 'user');
  await gerarXMLPeloChat(portal);
  window._portalPendente = null;
}
`;

if (!ejs.includes('gerarXMLTodos')) {
  ejs = ejs.replace('async function gerarXMLPeloChat', funcao + '\nasync function gerarXMLPeloChat');
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('ok');
} else {
  console.log('ja existe');
}
