const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

// Corrigir extração de nome — ignorar palavras comuns que não são nomes
const antigo = `    const nomeMatch = frase.match(/(?:lead|cliente)[:\\s,]+([A-ZÀ-Úa-zà-ú][a-zà-ú]+(?:\\s+[A-ZÀ-Úa-zà-ú][a-zà-ú]+)*)/i)
      || frase.match(/cadastra(?:r)?\\s+(?:lead|cliente)?\\s+([A-ZÀ-Ú][a-zà-ú]+(?:\\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
    const nomeRaw = nomeMatch ? nomeMatch[1].trim() : null;
    // Remover prefixos que possam ter vazado
    const nome = nomeRaw ? nomeRaw.replace(/^(cadastra?\\s+)?(lead|cliente)\\s+/i,'').trim() : null;`;

const novo = `    const PALAVRAS_IGNORAR = ['um','uma','pra','para','mim','me','por','favor','por favor','novo','nova','agora','aqui','esse','esta','este'];
    const nomeMatch = frase.match(/(?:lead|cliente)[:\\s,]+([A-ZÀ-Úa-zà-ú][a-zà-ú]+(?:\\s+[A-ZÀ-Úa-zà-ú][a-zà-ú]+)*)/i)
      || frase.match(/cadastra(?:r)?\\s+(?:lead|cliente)?\\s+([A-ZÀ-Ú][a-zà-ú]+(?:\\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
    const nomeRaw = nomeMatch ? nomeMatch[1].trim() : null;
    const nome = nomeRaw && !PALAVRAS_IGNORAR.includes(nomeRaw.toLowerCase()) ? nomeRaw.replace(/^(cadastra?\\s+)?(lead|cliente)\\s+/i,'').trim() : null;`;

if (ctx.includes(antigo)) {
  ctx = ctx.replace(antigo, novo);
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('ok');
} else {
  console.log('nao encontrado');
}
