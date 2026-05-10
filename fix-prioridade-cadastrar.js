const fs = require('fs');
let idx = fs.readFileSync('cerebro/index.js', 'utf8');

// Inserir verificação de CADASTRAR_LEAD ANTES do intencao.detectar (linha 117)
const antes = `  const intencaoObj = intencao.detectar(mNorm);`;
const novo = `  // Prioridade: cadastrar lead antes do intencao.detectar
  if (/^cadastra(r)?\\s/i.test(mensagem.trim())) {
    try {
      const ctx = contexto.analisar(mensagem, imoveis, leads, visitas);
      if (ctx && ctx.intencao === 'CADASTRAR_LEAD') {
        const resCtx = contexto.responder(ctx, d, user, imoveis, leads, visitas, btn, chip);
        if (resCtx) return finalizar(resCtx);
      }
    } catch(e) { console.error('cadastrar lead err:', e.message); }
  }

  const intencaoObj = intencao.detectar(mNorm);`;

if (!idx.includes('Prioridade: cadastrar lead')) {
  idx = idx.replace(antes, novo);
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('ok');
} else {
  console.log('ja existe');
}
