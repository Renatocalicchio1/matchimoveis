const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const antigo = `async function gerarXMLTodos() {
  const portal = window._portalPendente;
  if (!portal) return;
  addMsg('Gerar XML de todos os imóveis', 'user');
  await gerarXMLPeloChat(portal);
}`;

const novo = `async function gerarXMLTodos() {
  const portal = window._portalPendente;
  if (!portal) { streamMsg('❌ Portal não identificado. Tente novamente.'); return; }
  addMsg('Gerar XML de todos os imóveis — ' + portal.toUpperCase(), 'user');
  showTyping();
  await gerarXMLPeloChat(portal);
  window._portalPendente = null;
}`;

if (ejs.includes(antigo)) {
  ejs = ejs.replace(antigo, novo);
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('ok');
} else {
  console.log('bloco nao encontrado — verificar');
}
