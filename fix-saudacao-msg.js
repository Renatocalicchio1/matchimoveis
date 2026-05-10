const fs = require('fs');
let idx = fs.readFileSync('cerebro/index.js', 'utf8');

const antigo = `    return finalizar('👋 Olá! Como posso ajudar?<br><br>' +
      btn('Ver imóveis', '/app/imoveis') + ' ' +
      btn('Ver leads', '/app/leads') + ' ' +
      btn('Ver visitas', '/app/visitas'));`;

const novo = `    return finalizar('👋 Olá! Como posso ajudar?<br><br>Digite o que precisa ou escolha uma opção abaixo:<br><br>' +
      btn('Ver imóveis', '/app/imoveis') + ' ' +
      btn('Ver leads', '/app/leads') + ' ' +
      btn('Ver visitas', '/app/visitas'));`;

if (idx.includes(antigo)) {
  idx = idx.replace(antigo, novo);
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('ok');
} else {
  console.log('nao encontrado');
}
