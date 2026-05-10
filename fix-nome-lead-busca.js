const fs = require('fs');

// 1. Corrigir extração do nome no contexto.js — remover "cadastra lead" do nome
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

const antigo = `    const nomeMatch = frase.match(/(?:lead|cliente)[:\\s]+([A-ZÀ-Úa-zà-ú][a-zà-ú]+(?:\\s+[A-ZÀ-Úa-zà-ú][a-zà-ú]+)*)/i)
      || frase.match(/cadastra\\s+([A-ZÀ-Ú][a-zà-ú]+(?:\\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
    const nome = nomeMatch ? nomeMatch[1].trim() : null;`;

const novo = `    const nomeMatch = frase.match(/(?:lead|cliente)[:\\s,]+([A-ZÀ-Úa-zà-ú][a-zà-ú]+(?:\\s+[A-ZÀ-Úa-zà-ú][a-zà-ú]+)*)/i)
      || frase.match(/cadastra(?:r)?\\s+(?:lead|cliente)?\\s+([A-ZÀ-Ú][a-zà-ú]+(?:\\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
    const nomeRaw = nomeMatch ? nomeMatch[1].trim() : null;
    // Remover prefixos que possam ter vazado
    const nome = nomeRaw ? nomeRaw.replace(/^(cadastra?\\s+)?(lead|cliente)\\s+/i,'').trim() : null;`;

if (ctx.includes(antigo)) {
  ctx = ctx.replace(antigo, novo);
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('1. nome lead corrigido');
} else {
  console.log('1. bloco nao encontrado');
}

// 2. Corrigir busca — "encontrar apartamento até 600 mil" deve buscar nos imóveis da carteira
let idx = fs.readFileSync('cerebro/index.js', 'utf8');

const antigaBusca = `/^(oi|ola|olá|hey|hello|opa|salve|e ai|e aí)(\\s+(tudo\\s+)?(bem|bom|certo|ok|ótimo|otimo))?[\\s!?.,]*$/i.test(mensagem.trim()) || /^(bom dia|boa tarde|boa noite)[\\s!?.,]*$/i.test(mensagem.trim())`;

// Não mexer na saudação, vamos ver o que a busca de imóvel retorna
// O problema é que busca nos imóveis da carteira mas filtra por bairro que não existe
// Precisamos ver o que o RAG faz com "encontrar apartamento até 600 mil"
console.log('2. verificar RAG separadamente');

fs.writeFileSync('cerebro/index.js', idx);
