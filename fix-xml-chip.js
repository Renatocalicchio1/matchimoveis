const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const antigo = `        // Perguntar todos ou selecionar
        window._portalPendente = dados.portal;
        streamMsg('🔗 Gerar XML para <strong>' + dados.portal.toUpperCase() + '</strong>:<br><br>' +
          '<button onclick="gerarXMLTodos()" style="background:#ff385c;color:white;border:none;border-radius:10px;padding:10px 20px;font-weight:700;cursor:pointer;font-size:14px;margin-right:8px">✅ Todos os imóveis</button>' +
          '<a href="/app/imoveis" style="background:#222;color:white;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">🔎 Selecionar imóveis</a>');`;

const novo = `        // Perguntar todos ou selecionar — usar enviarMsg para manter escopo
        window._portalPendente = dados.portal;
        streamMsg('🔗 Gerar XML para <strong>' + dados.portal.toUpperCase() + '</strong>. Quer incluir:<br><br>' +
          '<span class="quick-chip" onclick="enviarMsg(\\'gerar xml todos ' + dados.portal + '\\')" style="cursor:pointer">✅ Todos os imóveis</span>' +
          '  <a href="/app/imoveis" style="background:#222;color:white;padding:8px 16px;border-radius:20px;text-decoration:none;font-weight:600;font-size:13px">🔎 Selecionar</a>');`;

if (ejs.includes(antigo)) {
  ejs = ejs.replace(antigo, novo);
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('1. interceptor atualizado');
} else {
  console.log('1. bloco nao encontrado');
}

// Adicionar intenção GERAR_XML_TODOS no contexto.js
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');
const intencaoTodos = `  GERAR_XML_TODOS: /gerar xml todos|xml todos|todos os imoveis.*xml|xml.*todos/,\n`;

if (!ctx.includes('GERAR_XML_TODOS')) {
  ctx = ctx.replace('  EXPORTAR_XML:', intencaoTodos + '  EXPORTAR_XML:');
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('2. intencao GERAR_XML_TODOS adicionada');
}

// Adicionar resposta no contexto.js
const respostaTodos = `
  if (intencao === 'GERAR_XML_TODOS') {
    const frase = ctx.fraseOriginal.toLowerCase();
    const portaisMap = { vivareal: 'vivareal', zap: 'zap', olx: 'olx', imovelweb: 'imovelweb', chaves: 'chaves', '123i': '123i' };
    const portalEncontrado = Object.keys(portaisMap).find(p => frase.includes(p)) || window?._portalPendente;
    const portal = portalEncontrado ? portaisMap[portalEncontrado] || portalEncontrado : null;
    if (portal) return 'ACAO_GERAR_XML:' + JSON.stringify({ portal });
    return '🔗 Para qual portal? ' + Object.keys(portaisMap).map(p => chip(p, 'gerar xml ' + p)).join(' ');
  }

`;

if (!ctx.includes("intencao === 'GERAR_XML_TODOS'")) {
  ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');
  ctx = ctx.replace("  if (intencao === 'EXPORTAR_XML') {", respostaTodos + "  if (intencao === 'EXPORTAR_XML') {");
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('3. resposta GERAR_XML_TODOS adicionada');
}

console.log('✅ DONE');
