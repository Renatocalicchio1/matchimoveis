const fs = require('fs');

// 1. Corrigir teste — comparação case-insensitive
let test = fs.readFileSync('test-intencoes2.js', 'utf8');
test = test.replace(
  `const acertou = detectado === esperado || detectado.includes(esperado.split('_').pop());`,
  `const acertou = detectado.toLowerCase() === esperado.toLowerCase() || detectado.toLowerCase().includes(esperado.split('_').pop().toLowerCase());`
);
fs.writeFileSync('test-intencoes2.js', test);
console.log('1. teste corrigido');

// 2. Fix contexto.js — "trazer/puxar imóveis do X" não deve cair em BUSCAR_IMOVEL
// Adicionar verificação no início do analisar
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

// Encontrar onde começa a função analisar e adicionar early return para importar
const antigoAnalise = `function analisar(mensagem, imoveis, leads, visitas) {`;
const novoAnalise = `function analisar(mensagem, imoveis, leads, visitas) {
  // Early return para importar XML — evita cair em BUSCAR_IMOVEL
  if (/trazer\\s+im[oó]veis?\\s+do|puxar\\s+im[oó]veis?\\s+do|importar\\s+do\\s+(crm|tecimob|rankim|vista|jetimob|kenlo)|trazer\\s+do\\s+(tecimob|rankim|vista|jetimob|kenlo)|puxar\\s+do\\s+(tecimob|rankim|vista|jetimob|kenlo)/i.test(mensagem)) {
    return { intencao: 'IMPORTAR_XML', slots: {}, imoveisEncontrados: [], leadsEncontrados: [], temDados: false, fraseOriginal: mensagem, mNorm: mensagem.toLowerCase() };
  }
  // Early return para exportar XML — evita cair em BUSCAR_IMOVEL
  if (/publicar\\s+im[oó]veis?\\s+(no|em|para|pro)\\s+(vivareal|zap|olx|imovelweb|chaves|123i)|exportar\\s+(para|pro)\\s+(vivareal|zap|olx|imovelweb|chaves|123i)/i.test(mensagem)) {
    return { intencao: 'EXPORTAR_XML', slots: {}, imoveisEncontrados: [], leadsEncontrados: [], temDados: false, fraseOriginal: mensagem, mNorm: mensagem.toLowerCase() };
  }`;

if (!ctx.includes('Early return para importar XML')) {
  ctx = ctx.replace(antigoAnalise, novoAnalise);
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('2. early returns adicionados');
} else {
  console.log('2. ja existe');
}

console.log('✅ DONE');
