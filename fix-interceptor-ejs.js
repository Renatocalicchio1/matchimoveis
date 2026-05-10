const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const ancora = `    removeTyping();
    streamMsg(data.resposta);`;

const novo = `    removeTyping();

    // Interceptar ações do cérebro
    if (data.resposta && data.resposta.startsWith('ACAO_CADASTRAR_LEAD:')) {
      try {
        const dados = JSON.parse(data.resposta.replace('ACAO_CADASTRAR_LEAD:', ''));
        streamMsg('📋 Cadastrando lead <strong>' + dados.nome + '</strong>...');
        await cadastrarLeadPeloChat(dados);
      } catch(e) {
        streamMsg('❌ Erro ao processar cadastro: ' + e.message);
      }
      return;
    }

    streamMsg(data.resposta);`;

if (!ejs.includes('ACAO_CADASTRAR_LEAD')) {
  ejs = ejs.replace(ancora, novo);
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('ok');
} else {
  console.log('ja existe');
}
