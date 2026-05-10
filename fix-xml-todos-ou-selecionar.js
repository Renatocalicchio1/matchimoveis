const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const antigo = `        streamMsg('⚙️ Gerando XML para <strong>' + dados.portal.toUpperCase() + '</strong> com todos os imóveis ativos...');
        await gerarXMLPeloChat(dados.portal);`;

const novo = `        // Perguntar todos ou selecionar
        window._portalPendente = dados.portal;
        streamMsg('🔗 Gerar XML para <strong>' + dados.portal.toUpperCase() + '</strong>:<br><br>' +
          '<button onclick="gerarXMLTodos()" style="background:#ff385c;color:white;border:none;border-radius:10px;padding:10px 20px;font-weight:700;cursor:pointer;font-size:14px;margin-right:8px">✅ Todos os imóveis</button>' +
          '<a href="/app/imoveis" style="background:#222;color:white;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">🔎 Selecionar imóveis</a>');`;

if (ejs.includes(antigo)) {
  ejs = ejs.replace(antigo, novo);
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('1. interceptor atualizado');
} else {
  console.log('1. bloco nao encontrado');
}

// Adicionar função gerarXMLTodos
const funcaoTodos = `
async function gerarXMLTodos() {
  const portal = window._portalPendente;
  if (!portal) return;
  addMsg('Gerar XML de todos os imóveis', 'user');
  await gerarXMLPeloChat(portal);
}
`;

if (!ejs.includes('gerarXMLTodos')) {
  ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');
  ejs = ejs.replace('\nasync function gerarXMLPeloChat', funcaoTodos + '\nasync function gerarXMLPeloChat');
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('2. gerarXMLTodos adicionado');
} else {
  console.log('2. ja existe');
}

console.log('✅ DONE');
