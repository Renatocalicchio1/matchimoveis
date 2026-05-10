const fs = require('fs');

// 1. Adicionar rota /app/imoveis-ids no server.js
let server = fs.readFileSync('server.js', 'utf8');
const rotaIdsBloco = `
// Retorna IDs de todos os imóveis ativos do usuário (para gerar XML pelo chat)
app.get('/app/imoveis-ids', auth, (req, res) => {
  const todos = fs.existsSync(dataPath('imoveis.json')) ? JSON.parse(fs.readFileSync(dataPath('imoveis.json'), 'utf8')) : [];
  const filtrados = filtrarPorUsuario(todos, req.session.user);
  const ativos = filtrados.filter(i => (i.status||'ativo').toLowerCase() === 'ativo');
  const ids = ativos.map(i => String(i.idExterno || i.id));
  res.json({ ids, total: ids.length });
});
`;

if (!server.includes('/app/imoveis-ids')) {
  server = server.replace("app.post('/app/gerar-xml'", rotaIdsBloco + "\napp.post('/app/gerar-xml'");
  fs.writeFileSync('server.js', server);
  console.log('1. rota /app/imoveis-ids criada');
} else {
  console.log('1. ja existe');
}

// 2. Adicionar intenção GERAR_XML no contexto.js
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');
const novaResposta = `
  // ── GERAR XML ───────────────────────────────────────────────────────────────
  if (intencao === 'EXPORTAR_XML') {
    const frase = ctx.fraseOriginal.toLowerCase();
    const portaisMap = { vivareal: 'vivareal', zap: 'zap', olx: 'olx', imovelweb: 'imovelweb', 'imovel web': 'imovelweb', chaves: 'chaves', '123i': '123i' };
    const portalEncontrado = Object.keys(portaisMap).find(p => frase.includes(p));

    if (!portalEncontrado) {
      return '🔗 <strong>Gerar XML — para qual portal?</strong><br><br>' +
        chip('VivaReal','gerar xml vivareal') +
        chip('ZAP','gerar xml zap') +
        chip('OLX','gerar xml olx') +
        chip('ImovelWeb','gerar xml imovelweb') +
        chip('Chaves na Mão','gerar xml chaves') +
        chip('123i','gerar xml 123i');
    }

    return 'ACAO_GERAR_XML:' + JSON.stringify({ portal: portaisMap[portalEncontrado] });
  }

`;

if (!ctx.includes('ACAO_GERAR_XML')) {
  ctx = ctx.replace("  if (intencao === 'IMPORTAR_XML') {", novaResposta + "  if (intencao === 'IMPORTAR_XML') {");
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('2. contexto.js atualizado');
} else {
  console.log('2. ja existe');
}

// 3. Adicionar função e interceptor no EJS
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const funcaoGerarXML = `
async function gerarXMLPeloChat(portal) {
  showTyping();
  try {
    const idsRes = await fetch('/app/imoveis-ids').then(r => r.json());
    const res = await fetch('/app/gerar-xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal, ids: idsRes.ids || [] })
    });
    const data = await res.json();
    removeTyping();
    if (data.url) {
      streamMsg('✅ <strong>XML gerado!</strong><br><br>' +
        '📋 Portal: <strong>' + portal.toUpperCase() + '</strong><br>' +
        '🏠 ' + data.total + ' imóvel(is) incluído(s)<br><br>' +
        '<a href="' + data.url + '" target="_blank" style="background:#ff385c;color:white;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">📥 Ver em Portais →</a>');
    } else {
      streamMsg('❌ Erro ao gerar XML. Tente novamente.');
    }
  } catch(e) {
    removeTyping();
    streamMsg('❌ Erro: ' + e.message);
  }
}
`;

const interceptorXML = `
    if (data.resposta && data.resposta.trim().includes('ACAO_GERAR_XML:')) {
      try {
        let jsonStr = data.resposta.trim().split('ACAO_GERAR_XML:')[1].trim();
        const fimJson = jsonStr.indexOf('}');
        if (fimJson !== -1) jsonStr = jsonStr.substring(0, fimJson + 1);
        const dados = JSON.parse(jsonStr);
        streamMsg('⚙️ Gerando XML para <strong>' + dados.portal.toUpperCase() + '</strong> com todos os imóveis ativos...');
        await gerarXMLPeloChat(dados.portal);
      } catch(e) {
        streamMsg('❌ Erro: ' + e.message);
      }
      return;
    }
`;

if (!ejs.includes('ACAO_GERAR_XML')) {
  ejs = ejs.replace('\nasync function importarXMLPeloChat', funcaoGerarXML + '\nasync function importarXMLPeloChat');
  ejs = ejs.replace(
    "    if (data.resposta && data.resposta.trim().includes('ACAO_CADASTRAR_LEAD:'))",
    interceptorXML + "\n    if (data.resposta && data.resposta.trim().includes('ACAO_CADASTRAR_LEAD:'))"
  );
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('3. EJS atualizado');
} else {
  console.log('3. ja existe');
}

console.log('✅ DONE');
