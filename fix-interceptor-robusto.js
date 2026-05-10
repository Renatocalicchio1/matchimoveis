const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const antigo = `    // Interceptar ações do cérebro
    if (data.resposta && data.resposta.startsWith('ACAO_CADASTRAR_LEAD:')) {
      try {
        const dados = JSON.parse(data.resposta.replace('ACAO_CADASTRAR_LEAD:', ''));
        streamMsg('📋 Cadastrando lead <strong>' + dados.nome + '</strong>...');
        await cadastrarLeadPeloChat(dados);
      } catch(e) {
        streamMsg('❌ Erro ao processar cadastro: ' + e.message);
      }
      return;
    }`;

const novo = `    // Interceptar ações do cérebro
    if (data.resposta && data.resposta.trim().includes('ACAO_CADASTRAR_LEAD:')) {
      try {
        const jsonStr = data.resposta.trim().split('ACAO_CADASTRAR_LEAD:')[1].trim();
        const dados = JSON.parse(jsonStr);
        streamMsg('📋 Cadastrando lead <strong>' + dados.nome + '</strong>...');
        await cadastrarLeadPeloChat(dados);
      } catch(e) {
        streamMsg('❌ Erro ao processar cadastro: ' + e.message);
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
