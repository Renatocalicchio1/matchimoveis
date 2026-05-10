const fs = require('fs');
let idx = fs.readFileSync('cerebro/index.js', 'utf8');

const antigo = `  if (/^(oi|ola|olá|hey|hello|bom dia|boa tarde|boa noite|tudo bem|tudo bom|e ai|e aí|opa|salve|oi tudo|olá tudo)[\\s!?.,]*$/i.test(mensagem.trim())) {`;

const novo = `  if (/^(oi|ola|olá|hey|hello|opa|salve|e ai|e aí)(\\s+(tudo\\s+)?(bem|bom|certo|ok|ótimo|otimo))?[\\s!?.,]*$/i.test(mensagem.trim()) || /^(bom dia|boa tarde|boa noite)[\\s!?.,]*$/i.test(mensagem.trim())) {`;

if (idx.includes(antigo)) {
  idx = idx.replace(antigo, novo);
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('ok');
} else {
  console.log('bloco nao encontrado');
}
