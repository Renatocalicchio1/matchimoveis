const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

// 1. IMPORTAR_XML — adicionar prioridade sobre BUSCAR_IMOVEL para frases com CRM
// O problema é que "trazer imóveis do Rankim" extrai "imóveis" como tipo
// Solução: adicionar verificação no inicio do contexto.analisar

// 2. EXPORTAR_XML — adicionar "exportar para", "publicar no"
ctx = ctx.replace(
  /EXPORTAR_XML:.*\/i,/,
  `EXPORTAR_XML: /exporta(r)?(\\s+para|\\s+o|\\s+xml)?\\s*(xml|imoveis?|feed)?\\s*(para|pro|no)?\\s*(vivareal|zap|olx|imovelweb|chaves|123i)?|gera(r)?(\\s+um|\\s+o)?\\s+xml|xml\\s+(do|para|no|em|pro)\\s+|(vivareal|viva\\s*real|zap|zap\\s*imoveis|olx|imovelweb|imovel\\s*web|chaves|chaves\\s*na\\s*mao|123i).*xml|xml.*(vivareal|zap|olx|imovelweb|chaves|123i)|publicar(\\s+imoveis?)?\\s*(no|em|para|pro|no)\\s*(portal|vivareal|zap|olx|imovelweb|chaves|123i)|enviar\\s+(xml|imoveis?)\\s*(para|pro)\\s+portal|subir\\s*(no|em|para|pro)\\s*(vivareal|zap|olx|imovelweb|chaves|123i|portal)|quero\\s+publicar|preciso\\s+publicar|feed\\s+(para|pro|do)\\s*(vivareal|zap|olx|imovelweb|chaves|123i)/i,`
);

// 3. IMPORTAR_XML — garantir que "trazer/puxar imóveis do X" não cai em BUSCAR
ctx = ctx.replace(
  /IMPORTAR_XML:.*\/i,/,
  `IMPORTAR_XML: /importa(r)?(\\s+o|\\s+um|\\s+os|\\s+meus)?\\s*(xml|imoveis?|feed|carteira)|trazer\\s+(imoveis?|carteira|feed|do\\s+)|subir\\s+(xml|imoveis?|feed)|url\\s+(do\\s+)?(feed|xml)|puxar\\s+(imoveis?|feed|xml)|sincronizar\\s+imoveis?|atualizar\\s+(imoveis?|xml|feed)|trazer\\s+do\\s+(crm|tecimob|rankim|vista|jetimob|kenlo)|puxar\\s+do\\s+(crm|tecimob|rankim|vista|jetimob|kenlo)|do\\s+(tecimob|rankim|vista|jetimob|kenlo)|como\\s+(importo|importar|faco\\s+para\\s+importar)|quero\\s+importar|preciso\\s+importar|tenho\\s+(um\\s+)?(xml|feed)|meu\\s+(xml|feed|crm)|cole\\s+a\\s+url|conectar\\s+(crm|sistema)|integrar\\s+(com\\s+)?(crm|tecimob|rankim|vista)/i,`
);

fs.writeFileSync('cerebro/contexto.js', ctx);
console.log('1. intencoes corrigidas');

// 4. Garantir prioridade IMPORTAR_XML sobre BUSCAR_IMOVEL no index.js
let idx = fs.readFileSync('cerebro/index.js', 'utf8');
const antigoCheck = `if (ctx && (ctx.intencao === 'CADASTRAR_LEAD' || ctx.intencao === 'IMPORTAR_XML' || ctx.intencao === 'GERAR_XML_TODOS' || ctx.intencao === 'EXPORTAR_XML')) {`;
const novoCheck = `if (ctx && (ctx.intencao === 'CADASTRAR_LEAD' || ctx.intencao === 'IMPORTAR_XML' || ctx.intencao === 'GERAR_XML_TODOS' || ctx.intencao === 'EXPORTAR_XML' || ctx.intencao === 'GERAR_XML')) {`;

if (idx.includes(antigoCheck)) {
  idx = idx.replace(antigoCheck, novoCheck);
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('2. index.js ok');
}

// 5. Expandir condição de prioridade para IMPORTAR também
const antigoIf = `if (/^cadastra(r)?\\s/i.test(mensagem.trim()) || /importar?\\s+(xml|imoveis?)|quero importar|subir xml|trazer imoveis?/i.test(mensagem.trim()) || /gerar? xml todos|xml todos/i.test(mensagem.trim())) {`;
const novoIf = `if (/^cadastra(r)?\\s/i.test(mensagem.trim()) || /importar?\\s+(xml|imoveis?)|quero importar|subir xml|trazer imoveis?|puxar imoveis?|trazer do|puxar do|tenho um (xml|feed)|meu (xml|feed)/i.test(mensagem.trim()) || /gerar? xml todos|xml todos/i.test(mensagem.trim()) || /exportar para|publicar (imoveis? )?(no|em|para)|gerar? xml|gera xml|xml (para|pro|no)/i.test(mensagem.trim())) {`;

if (idx.includes(antigoIf)) {
  idx = idx.replace(antigoIf, novoIf);
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('3. prioridade expandida');
} else {
  console.log('3. nao encontrado');
}

console.log('✅ DONE');
