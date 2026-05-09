const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

// Substituir a função addMsg do bot para suportar streaming
const antigaAddMsg = `function addMsg(html, tipo) {
  const c = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + tipo;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar ' + tipo;
  avatar.textContent = tipo === 'bot' ? '🤖' : '👤';

  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + tipo + '-bubble';
  bubble.innerHTML = html;

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  c.appendChild(wrap);
  scrollBottom();
  return wrap;
}`;

const novaAddMsg = `function addMsg(html, tipo) {
  const c = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + tipo;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar ' + tipo;
  avatar.textContent = tipo === 'bot' ? '🤖' : '👤';

  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + tipo + '-bubble';
  bubble.innerHTML = html;

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  c.appendChild(wrap);
  scrollBottom();
  return wrap;
}

// Streaming — escreve o HTML progressivamente como o Claude
function streamMsg(html) {
  const c = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar bot';
  avatar.textContent = '🤖';

  const bubble = document.createElement('div');
  bubble.className = 'bubble bot-bubble';
  bubble.innerHTML = '';

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  c.appendChild(wrap);
  scrollBottom();

  // Quebra o HTML em tokens (tags e texto)
  const tokens = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      // Tag HTML — adiciona inteira de uma vez
      const end = html.indexOf('>', i);
      if (end === -1) { tokens.push(html[i]); i++; continue; }
      tokens.push(html.slice(i, end + 1));
      i = end + 1;
    } else {
      tokens.push(html[i]);
      i++;
    }
  }

  let idx = 0;
  let current = '';

  function next() {
    if (idx >= tokens.length) {
      bubble.innerHTML = html; // garante fidelidade no final
      scrollBottom();
      return;
    }
    const token = tokens[idx++];
    current += token;
    bubble.innerHTML = current;
    scrollBottom();

    // Tags HTML: sem delay. Texto: delay variável para efeito humano
    const isTag = token.startsWith('<');
    const delay = isTag ? 0 : (token === ' ' ? 20 : Math.random() * 18 + 8);
    setTimeout(next, delay);
  }

  next();
  return wrap;
}`;

if (ejs.includes(antigaAddMsg)) {
  ejs = ejs.replace(antigaAddMsg, novaAddMsg);
  console.log('1. streamMsg adicionado');
} else {
  console.log('1. AVISO: nao encontrou addMsg — verifique');
}

// Substituir o uso de addMsg(data.resposta, 'bot') por streamMsg
ejs = ejs.replace(
  `    removeTyping();
    addMsg(data.resposta, 'bot');
    addFeedback(msg, data.resposta);`,
  `    removeTyping();
    streamMsg(data.resposta);
    setTimeout(() => addFeedback(msg, data.resposta), 200);`
);

fs.writeFileSync('views/app-assistente.ejs', ejs);
console.log('2. streaming conectado');
