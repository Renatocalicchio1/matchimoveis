const fs = require('fs');
let idx = fs.readFileSync('cerebro/index.js', 'utf8');

const antigo = `  if (ultimoHist && ultimoHist.resposta && ultimoHist.resposta.includes('Me passa nome e celular')) {
    const celularMatch = mensagem.match(/(\\(?\\d{2}\\)?[\\s-]?\\d{3,5}[\\s-]?\\d{3,4})/);
    const nomeMatch = mensagem.match(/^([A-ZÀ-Úa-zà-ú]+(?:\\s+[A-ZÀ-Úa-zà-ú]+)*)/);
    if (celularMatch && nomeMatch) {
      const dados = { nome: nomeMatch[1].trim(), celular: celularMatch[1].replace(/\\D/g,'') };
      return finalizar('ACAO_CADASTRAR_LEAD:' + JSON.stringify(dados));
    }
  }`;

const novo = `  if (ultimoHist && ultimoHist.resposta && ultimoHist.resposta.includes('Me passa nome e celular')) {
    const numerosNaMensagem = mensagem.replace(/\\D/g,'');
    const nomeMatch = mensagem.match(/^([A-ZÀ-Úa-zà-ú]+(?:\\s+[A-ZÀ-Úa-zà-ú]+)*)/i);
    const nome = nomeMatch ? nomeMatch[1].trim() : null;
    // Tem número mas incompleto
    if (numerosNaMensagem.length > 0 && numerosNaMensagem.length < 10) {
      return finalizar('⚠️ O número <strong>' + numerosNaMensagem + '</strong> parece incompleto. Celular precisa ter DDD + 9 dígitos.<br><br>💡 Exemplo: <em>47 99999-1234</em>');
    }
    // Nome e celular completo — cadastra
    if (nome && numerosNaMensagem.length >= 10) {
      const dados = { nome, celular: numerosNaMensagem };
      return finalizar('ACAO_CADASTRAR_LEAD:' + JSON.stringify(dados));
    }
    // Só nome, sem número
    if (nome && numerosNaMensagem.length === 0) {
      return finalizar('📋 Entendido! Quer cadastrar <strong>' + nome + '</strong>.<br><br>Qual o celular do cliente?');
    }
  }`;

if (idx.includes(antigo)) {
  idx = idx.replace(antigo, novo);
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('ok');
} else {
  console.log('nao encontrado');
}
