const fs = require('fs');
let idx = fs.readFileSync('cerebro/index.js', 'utf8');

const antigo = `  // Prioridade: cadastrar lead antes do intencao.detectar
  if (/^cadastra(r)?\\s/i.test(mensagem.trim())) {`;

const novo = `  // Prioridade: contexto antes do intencao.detectar
  if (/^cadastra(r)?\\s/i.test(mensagem.trim()) || /importar?\\s+(xml|imoveis?)|quero importar|subir xml|trazer imoveis?/i.test(mensagem.trim())) {`;

if (idx.includes(antigo)) {
  idx = idx.replace(antigo, novo);
  // Também corrigir o if interno para pegar IMPORTAR_XML
  idx = idx.replace(
    `if (ctx && ctx.intencao === 'CADASTRAR_LEAD') {`,
    `if (ctx && (ctx.intencao === 'CADASTRAR_LEAD' || ctx.intencao === 'IMPORTAR_XML')) {`
  );
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('ok');
} else {
  console.log('bloco nao encontrado');
}
