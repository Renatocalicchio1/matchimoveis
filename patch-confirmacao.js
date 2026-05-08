const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// Ler a view
let ejs = fs.readFileSync(path.join(BASE,'views','app-assistente.ejs'),'utf8');

// Substituir a linha que adiciona a resposta do bot
// Original: addMsg(data.resposta,'bot');
// Novo: adicionar botões de confirmação quando precisaConfirmar=true

ejs = ejs.replace(
  `    addMsg(data.resposta,'bot');`,
  `    addMsg(data.resposta,'bot');
    if(data.precisaConfirmar){
      const feedDiv=document.createElement('div');
      feedDiv.className='msg bot';
      feedDiv.style.cssText='padding:4px 12px';
      feedDiv.innerHTML='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 0">' +
        '<span style="font-size:12px;color:#999">Era isso que você queria?</span>' +
        '<button onclick="enviarFeedback(true,this)" style="background:#e8f5e9;border:1px solid #4caf50;border-radius:20px;padding:3px 12px;font-size:12px;cursor:pointer;color:#2e7d32">👍 Sim</button>' +
        '<button onclick="enviarFeedback(false,this)" style="background:#fce4ec;border:1px solid #e91e63;border-radius:20px;padding:3px 12px;font-size:12px;cursor:pointer;color:#880e4f">👎 Não</button>' +
        '</div>';
      feedDiv.dataset.pergunta = msg;
      feedDiv.dataset.resposta = data.resposta;
      document.getElementById('chat-messages').appendChild(feedDiv);
    }`
);

// Adicionar função enviarFeedback antes do fechamento do script
ejs = ejs.replace(
  `async function enviarMsg(texto){`,
  `async function enviarFeedback(util, btn){
  const container = btn.closest('[data-pergunta]');
  const pergunta  = container?.dataset.pergunta || '';
  const resposta  = container?.dataset.resposta || '';
  try{
    await fetch('/app/assistente/feedback',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({util, pergunta, resposta})
    });
    container.innerHTML = '<span style="font-size:12px;color:'+( util ? '#4caf50' : '#e91e63')+'">'+(util ? '✅ Ótimo! Obrigado pelo feedback.' : '📝 Entendido! Vou melhorar.')+' </span>';
  } catch(e){ console.error(e); }
}

async function enviarMsg(texto){`
);

fs.writeFileSync(path.join(BASE,'views','app-assistente.ejs'), ejs);
console.log('✅ app-assistente.ejs — botões de confirmação adicionados');

// Verificar se a rota do server.js já tem precisaConfirmar
const server = fs.readFileSync(path.join(BASE,'server.js'),'utf8');
if (server.includes('precisaConfirmar')) {
  console.log('✅ server.js — precisaConfirmar já está na rota');
} else {
  console.log('⚠️  server.js — precisaConfirmar não encontrado na rota — adicionar manualmente');
}

// Verificar rota de feedback
if (server.includes('/app/assistente/feedback')) {
  console.log('✅ server.js — rota de feedback já existe');
} else {
  console.log('⚠️  server.js — rota de feedback não encontrada — precisa adicionar');
}

console.log('\n✅ Confirmação implementada no frontend');
console.log('   Aparece quando: pergunta feita 3+ vezes com respostas inconsistentes');
console.log('   Botões: 👍 Sim (confirma) | 👎 Não (rejeita e aprende)');
