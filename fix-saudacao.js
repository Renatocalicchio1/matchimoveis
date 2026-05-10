const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

// Adicionar intenção SAUDACAO
const novaIntencao = `  SAUDACAO: /^(oi|ola|olá|hey|hello|bom dia|boa tarde|boa noite|tudo bem|tudo bom|e ai|e aí|opa|salve|oi tudo|olá tudo)[\s!?]*$/i,\n`;

if (!ctx.includes('SAUDACAO')) {
  ctx = ctx.replace('  BUSCAR_IMOVEL:', novaIntencao + '  BUSCAR_IMOVEL:');
  console.log('1. intencao SAUDACAO adicionada');
}

// Adicionar resposta para SAUDACAO
const respostaSaudacao = `
  // ── SAUDAÇÃO ─────────────────────────────────────────────────────────────────
  if (intencao === 'SAUDACAO') {
    return '👋 Olá! Como posso ajudar?<br><br>' +
      chip('Meus imóveis', 'meus imoveis') +
      chip('Leads', 'ver leads') +
      chip('Visitas', 'visitas hoje') +
      chip('Gerar XML', 'gerar xml');
  }

`;

if (!ctx.includes("intencao === 'SAUDACAO'")) {
  ctx = ctx.replace("  if (intencao === 'CADASTRAR_LEAD') {", respostaSaudacao + "  if (intencao === 'CADASTRAR_LEAD') {");
  console.log('2. resposta SAUDACAO adicionada');
}

// Bloquear temDados quando frase é saudação
const antigoAnalise = `  return { intencao, slots, imoveisEncontrados, leadsEncontrados, temDados: !!(slots.bairro || slots.tipo || slots.valorMax || slots.quartos), fraseOriginal: mensagem, mNorm };`;
const novaAnalise = `  // Bloquear temDados para saudações
  const ehSaudacao = /^(oi|ola|olá|hey|hello|bom dia|boa tarde|boa noite|tudo bem|tudo bom|e ai|e aí|opa|salve)[\s!?.,]*$/i.test(mensagem.trim());
  return { intencao, slots: ehSaudacao ? {} : slots, imoveisEncontrados, leadsEncontrados, temDados: !ehSaudacao && !!(slots.bairro || slots.tipo || slots.valorMax || slots.quartos), fraseOriginal: mensagem, mNorm };`;

if (!ctx.includes('ehSaudacao')) {
  ctx = ctx.replace(antigoAnalise, novaAnalise);
  console.log('3. bloqueio saudacao no temDados adicionado');
}

fs.writeFileSync('cerebro/contexto.js', ctx);
console.log('✅ DONE');
