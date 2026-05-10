const fs = require('fs');

// 1. Fix saudacao regex
let idx = fs.readFileSync('cerebro/index.js', 'utf8');
const antigoSaud = `if (/^(oi|ola|olá|hey|hello|opa|salve|e ai|e aí)(\\s+(tudo\\s+)?(bem|bom|certo|ok|ótimo|otimo))?[\\s!?.,]*$/i.test(mensagem.trim()) || /^(bom dia|boa tarde|boa noite)[\\s!?.,]*$/i.test(mensagem.trim())) {`;
const novoSaud = `if (/^(o+i+|ola+|olá|hey|hello|opa|salve|e ai|e aí)(\\s+(tudo\\s+)?(bem|bom|certo|ok|ótimo|otimo))?[\\s!?.,]*$/i.test(mensagem.trim()) || /^(bom dia|boa tarde|boa noite)[\\s!?.,]*$/i.test(mensagem.trim())) {`;
if (idx.includes(antigoSaud)) { idx = idx.replace(antigoSaud, novoSaud); console.log('1. saudacao ok'); }
else { console.log('1. saudacao nao encontrada'); }
fs.writeFileSync('cerebro/index.js', idx);

// 2. Fix links no rag.js — verificar o que esta la
let rag = fs.readFileSync('cerebro/rag.js', 'utf8');
console.log('2. rag linha 119:', rag.split('\n')[118]);
