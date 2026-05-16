const fs = require('fs');

let s = fs.readFileSync('server.js', 'utf8');

const oldLine = "  const resposta = cerebroApp.responder(mensagem, d, user, imoveis, leads, visitas, contexto);";

const newBlock = `  let resposta = null;

  const msgNorm = String(mensagem || "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"");
  const usarCentral = /(whatsapp|zap|mensagem|manda|enviar|falar|ele|ela|lead|leads|cliente|clientes|quente|quentes|match|matches|visita|visitas|notificacao|notificacoes|pendente|pendentes)/.test(msgNorm);

  if (usarCentral) {
    try {
      const central = centralOperacional.responderCentral(user, mensagem);

      if (central && central.resposta) {
        resposta = central.resposta;

        if (central.itens && central.itens.length) {
          resposta += "\\n\\n" + central.itens.map((i)=>{
            return "• " + (i.nome || i.titulo || i.title || i.cliente || "Item")
              + (i.bairro ? " — " + i.bairro : "")
              + (i.matches !== undefined ? " | Matches: " + i.matches : "")
              + (i.bestScore !== undefined ? " | Score: " + i.bestScore : "");
          }).join("\\n");
        }

        if (central.acao && central.acao.tipo === "whatsapp") {
          resposta += "\\n\\n📲 WhatsApp preparado.";
          if (central.acao.url) resposta += "\\n" + central.acao.url;
        }
      }
    } catch(e) {
      console.error("Erro central operacional:", e.message);
    }
  }

  if (!resposta) {
    resposta = cerebroApp.responder(mensagem, d, user, imoveis, leads, visitas, contexto);
  }`;

if (!s.includes(oldLine)) {
  console.error('Linha original não encontrada. Talvez já tenha sido alterada.');
  process.exit(1);
}

s = s.replace(oldLine, newBlock);
fs.writeFileSync('server.js', s);
console.log('PATCH OK');
