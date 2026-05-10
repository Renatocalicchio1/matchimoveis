const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const antigo = `        const jsonStr = data.resposta.trim().split('ACAO_CADASTRAR_LEAD:')[1].trim();
        const dados = JSON.parse(jsonStr);`;

const novo = `        let jsonStr = data.resposta.trim().split('ACAO_CADASTRAR_LEAD:')[1].trim();
        // Corta tudo após o fechamento do JSON }
        const fimJson = jsonStr.indexOf('}');
        if (fimJson !== -1) jsonStr = jsonStr.substring(0, fimJson + 1);
        const dados = JSON.parse(jsonStr);`;

if (ejs.includes(antigo)) {
  ejs = ejs.replace(antigo, novo);
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('ok');
} else {
  console.log('bloco nao encontrado');
}
