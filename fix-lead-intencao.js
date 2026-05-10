const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

// 1. Corrigir regex da intenção — mais abrangente e com prioridade
const regexAntiga = `CADASTRAR_LEAD: /cadastrar (lead|cliente)|novo (lead|cliente)|criar (lead|cliente)|adicionar (lead|cliente)|novo atendimento/,`;
const regexNova = `CADASTRAR_LEAD: /cadastra(r)? (lead|cliente|o lead|o cliente)|novo (lead|cliente|interessado)|adiciona(r)? (lead|cliente)|criar (lead|cliente)|anota(r)? (lead|cliente)|salva(r)? (lead|cliente)|novo atendimento/,`;

if (ctx.includes(regexAntiga)) {
  ctx = ctx.replace(regexAntiga, regexNova);
  console.log('1. regex corrigida');
} else {
  console.log('1. regex nao encontrada — verificar');
}

// 2. Corrigir resposta da linha 169 — remover o return simples que sobrescreve
const respostaSimples = `  if (intencao === 'CADASTRAR_LEAD') return '\\uD83D\\uDC64 Cadastrar lead'+(slots.nomeCliente?' - '+slots.nomeCliente:'')+(filtros?'<br><span style="font-size:12px;color:#888">'+filtros+'</span>':'')+'<br><br>'+btn('Cadastrar lead','/app/leads');`;
if (ctx.includes(respostaSimples)) {
  ctx = ctx.replace(respostaSimples, `  // CADASTRAR_LEAD tratado no bloco principal acima`);
  console.log('2. resposta simples removida');
} else {
  console.log('2. resposta simples nao encontrada — verificar');
}

fs.writeFileSync('cerebro/contexto.js', ctx);
