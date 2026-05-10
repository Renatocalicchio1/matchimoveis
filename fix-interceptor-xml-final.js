const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const antigo = `    if (data.resposta && data.resposta.trim().includes('ACAO_GERAR_XML:')) {
      try {
        let jsonStr = data.resposta.trim().split('ACAO_GERAR_XML:')[1].trim();
        const fimJson = jsonStr.indexOf('}');
        if (fimJson !== -1) jsonStr = jsonStr.substring(0, fimJson + 1);
        const dados = JSON.parse(jsonStr);
        // Perguntar todos ou selecionar — usar enviarMsg para manter escopo
        window._portalPendente = dados.portal;
        streamMsg('🔗 Gerar XML para <strong>' + dados.portal.toUpperCase() + '</strong>. Quer incluir:<br><br>' +
          '<span class="quick-chip" onclick="enviarMsg(\\'gerar xml todos ' + dados.portal + '\\')" style="cursor:pointer">✅ Todos os imóveis</span>' +
          '  <a href="/app/imoveis" style="background:#222;color:white;padding:8px 16px;border-radius:20px;text-decoration:none;font-weight:600;font-size:13px">🔎 Selecionar</a>');
      } catch(e) {
        streamMsg('❌ Erro: ' + e.message);
      }
      return;
    }`;

const novo = `    if (data.resposta && data.resposta.trim().includes('ACAO_GERAR_XML:')) {
      try {
        let jsonStr = data.resposta.trim().split('ACAO_GERAR_XML:')[1].trim();
        const fimJson = jsonStr.indexOf('}');
        if (fimJson !== -1) jsonStr = jsonStr.substring(0, fimJson + 1);
        const dados = JSON.parse(jsonStr);
        // Se veio de "gerar xml todos X" — gera direto
        if (dados.todos || /todos/i.test(msgAtual||'')) {
          streamMsg('⚙️ Gerando XML para <strong>' + dados.portal.toUpperCase() + '</strong>...');
          await gerarXMLPeloChat(dados.portal);
        } else {
          // Perguntar todos ou selecionar
          window._portalPendente = dados.portal;
          streamMsg('🔗 Gerar XML para <strong>' + dados.portal.toUpperCase() + '</strong>. Quer incluir:<br><br>' +
            '<span class="quick-chip" onclick="enviarMsg(\\'gerar xml todos ' + dados.portal + '\\')" style="cursor:pointer">✅ Todos os imóveis</span>' +
            '  <a href="/app/imoveis" style="background:#222;color:white;padding:8px 16px;border-radius:20px;text-decoration:none;font-weight:600;font-size:13px">🔎 Selecionar</a>');
        }
      } catch(e) {
        streamMsg('❌ Erro: ' + e.message);
      }
      return;
    }`;

if (ejs.includes(antigo)) {
  ejs = ejs.replace(antigo, novo);
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('ok');
} else {
  console.log('bloco nao encontrado');
}
