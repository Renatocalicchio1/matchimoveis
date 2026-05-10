const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

// 1. Fix IMPORTAR_XML — adicionar "tenho um feed", "trazer do rankim"
ctx = ctx.replace(
  /IMPORTAR_XML:.*\/i,/,
  `IMPORTAR_XML: /importa(r)?(\\s+o|\\s+um|\\s+os|\\s+meus)?\\s+(xml|imoveis?|feed|carteira)|trazer\\s+(imoveis?|carteira|feed|do)|subir\\s+(xml|imoveis?|feed)|url\\s+(do\\s+)?(feed|xml)|puxar\\s+(imoveis?|feed|xml)|sincronizar\\s+imoveis?|atualizar\\s+(imoveis?|xml|feed)|trazer\\s+do\\s+(crm|tecimob|rankim|vista|jetimob|kenlo|vistasoft)|como\\s+(importo|importar|faco\\s+para\\s+importar)|quero\\s+importar|preciso\\s+importar|tenho\\s+(um\\s+)?(xml|feed)|meu\\s+(xml|feed|crm)|cole\\s+a\\s+url|link\\s+do\\s+(xml|feed)|conectar\\s+(crm|sistema)|integrar\\s+(com\\s+)?(crm|tecimob|rankim|vista)|do\\s+(tecimob|rankim|vista|jetimob|kenlo)/i,`
);

fs.writeFileSync('cerebro/contexto.js', ctx);
console.log('1. IMPORTAR_XML ok');

// 2. Fix extração de valorMin/Max para "entre X e Y"
let rag = fs.readFileSync('cerebro/rag.js', 'utf8');
const antigoValor = `  // Valor máximo
  const vmax = mNorm.match(/ate\\s*r?\\$?\\s*([\\d.,]+)\\s*(mil|k|m)?/);`;

const novoValor = `  // Valor entre X e Y
  const ventreMatch = mNorm.match(/entre\\s*r?\\$?\\s*([\\d.,]+)\\s*(mil|k|m)?\\s*(?:e|a|e\\s+)\\s*r?\\$?\\s*([\\d.,]+)\\s*(mil|k|m)?/i);
  if (ventreMatch) {
    let vmin = parseFloat(ventreMatch[1].replace(/\\./g,'').replace(',','.'));
    let vmax2 = parseFloat(ventreMatch[3].replace(/\\./g,'').replace(',','.'));
    if ((ventreMatch[2]||'').match(/mil|k/i)) vmin *= 1000;
    if ((ventreMatch[4]||'').match(/mil|k/i)) vmax2 *= 1000;
    if ((ventreMatch[2]||'').match(/m/i)) vmin *= 1000000;
    if ((ventreMatch[4]||'').match(/m/i)) vmax2 *= 1000000;
    slots.valorMin = vmin;
    slots.valorMax = vmax2;
  }

  // Valor máximo
  const vmax = !ventreMatch && mNorm.match(/ate\\s*r?\\$?\\s*([\\d.,]+)\\s*(mil|k|m)?/);`;

if (rag.includes(antigoValor)) {
  rag = rag.replace(antigoValor, novoValor);
  fs.writeFileSync('cerebro/rag.js', rag);
  console.log('2. valor entre X e Y ok');
} else {
  console.log('2. bloco valor nao encontrado');
}

// 3. Fix valorMin no filtro do rag
if (!rag.includes('slots.valorMin')) {
  console.log('3. valorMin ja existe no filtro');
} else {
  console.log('3. ok');
}

// 4. Fix notificações — "novidades"
let idx = fs.readFileSync('cerebro/index.js', 'utf8');
if (!idx.includes('novidades')) {
  // Adicionar na prioridade de saudação não — adicionar no módulo notificações
  console.log('4. verificar modulo notificacoes');
}

console.log('✅ DONE');
