const fs = require('fs');
let idx = fs.readFileSync('cerebro/index.js', 'utf8');

const antigo = `  // Prioridade: contexto antes do intencao.detectar`;
const novo = `  // Prioridade: saudação — responde direto sem processar
  if (/^(oi|ola|olá|hey|hello|bom dia|boa tarde|boa noite|tudo bem|tudo bom|e ai|e aí|opa|salve|oi tudo|olá tudo)[\s!?.,]*$/i.test(mensagem.trim())) {
    return finalizar('👋 Olá! Como posso ajudar?<br><br>' +
      btn('Ver imóveis', '/app/imoveis') + ' ' +
      btn('Ver leads', '/app/leads') + ' ' +
      btn('Ver visitas', '/app/visitas'));
  }

  // Prioridade: contexto antes do intencao.detectar`;

if (!idx.includes('Prioridade: saudação')) {
  idx = idx.replace(antigo, novo);
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('ok');
} else {
  console.log('ja existe');
}
