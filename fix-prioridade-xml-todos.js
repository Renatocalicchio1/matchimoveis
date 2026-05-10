const fs = require('fs');
let idx = fs.readFileSync('cerebro/index.js', 'utf8');

const antigo = `  if (/^cadastra(r)?\\s/i.test(mensagem.trim()) || /importar?\\s+(xml|imoveis?)|quero importar|subir xml|trazer imoveis?/i.test(mensagem.trim())) {`;
const novo = `  if (/^cadastra(r)?\\s/i.test(mensagem.trim()) || /importar?\\s+(xml|imoveis?)|quero importar|subir xml|trazer imoveis?/i.test(mensagem.trim()) || /gerar? xml todos|xml todos/i.test(mensagem.trim())) {`;

if (idx.includes(antigo)) {
  idx = idx.replace(antigo, novo);
  // Também incluir GERAR_XML_TODOS na condição interna
  idx = idx.replace(
    `if (ctx && (ctx.intencao === 'CADASTRAR_LEAD' || ctx.intencao === 'IMPORTAR_XML')) {`,
    `if (ctx && (ctx.intencao === 'CADASTRAR_LEAD' || ctx.intencao === 'IMPORTAR_XML' || ctx.intencao === 'GERAR_XML_TODOS' || ctx.intencao === 'EXPORTAR_XML')) {`
  );
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('ok');
} else {
  console.log('bloco nao encontrado');
}
