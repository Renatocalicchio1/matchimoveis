const fs = require('fs');
let idx = fs.readFileSync('cerebro/index.js', 'utf8');

const antigo = `  // Prioridade: contexto antes do intencao.detectar`;

const novo = `  // Prioridade: contexto de conversa anterior (memória de turno)
  const ultimoHist = hist[hist.length - 1];
  if (ultimoHist && ultimoHist.resposta && ultimoHist.resposta.includes('Me passa nome e celular')) {
    const celularMatch = mensagem.match(/(\\(?\\d{2}\\)?[\\s-]?\\d{4,5}[\\s-]?\\d{4})/);
    const nomeMatch = mensagem.match(/^([A-ZÀ-Úa-zà-ú]+(?:\\s+[A-ZÀ-Úa-zà-ú]+)*)/);
    if (celularMatch && nomeMatch) {
      const dados = { nome: nomeMatch[1].trim(), celular: celularMatch[1].replace(/\\D/g,'') };
      return finalizar('ACAO_CADASTRAR_LEAD:' + JSON.stringify(dados));
    }
  }

  // Prioridade: contexto antes do intencao.detectar`;

if (!idx.includes('memória de turno')) {
  idx = idx.replace(antigo, novo);
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('ok');
} else {
  console.log('ja existe');
}
