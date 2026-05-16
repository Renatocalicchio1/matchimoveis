// resposta-auto.js v3.0 — conversa natural slot a slot

function normalizar(txt) {
  return (txt||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}

function primeiroNome(lead) {
  const n = (lead.nome||'').split(' ')[0];
  if (!n || n.match(/^\d/) || n.toLowerCase().startsWith('simulac')) return '';
  return n;
}

function valorFmt(v) {
  if (!v) return '';
  if (v >= 1000000) return `R$${(v/1000000).toFixed(1).replace('.0','')} milhão`;
  if (v >= 1000) return `R$${Math.round(v/1000)} mil`;
  return `R$${Number(v).toLocaleString('pt-BR')}`;
}

// Próximo slot que falta — um por vez
function proximoSlot(perfil) {
  if (!perfil.intencao) return 'intencao';
  if (!perfil.tipo)     return 'tipo';
  if (!perfil.quartos)  return 'quartos';
  if (!perfil.bairro)   return 'bairro';
  if (!perfil.valorMax && !perfil.valorMin) return 'valor';
  return null;
}

function gerarResposta(lead, texto, matches) {
  const norm = normalizar(texto);
  const nome = primeiroNome(lead);
  const n = nome ? `, ${nome}` : '';
  const perfil = lead.perfilIA || {};
  const msgs = (lead.mensagens||[]).filter(m => m.de === 'cliente');
  const total = msgs.length;

  // Despedida
  if (['tchau','obrigado','obrigada','valeu','ate mais','flw','xau','abraco'].some(d => norm.includes(d))) {
    return `Foi um prazer${n}! Qualquer dúvida é só chamar. Até logo! 👋`;
  }

  // Apresentação inicial — primeira mensagem
  if (total <= 1) {
    return `Oi${n}! 😊 Tudo bem? Sou o Match, assistente do corretor. Como posso te ajudar hoje?`;
  }

  // Tem matches → apresenta resultados
  const slot = proximoSlot(perfil);
  if (!slot && matches && matches.length > 0) {
    const top3 = matches.slice(0, 3);
    let resp = `Boa notícia${n}! 🎉 Achei ${matches.length} opção(ões) pra você:\n\n`;
    top3.forEach((m, i) => {
      resp += `*${i+1}.* ${m.titulo || m.endereco || 'Imóvel '+(i+1)}`;
      if (m.bairro)   resp += ` — ${m.bairro}`;
      if (m.valor)    resp += ` — ${valorFmt(m.valor)}`;
      if (m.quartos)  resp += ` — ${m.quartos} quartos`;
      resp += '\n';
    });
    resp += '\nQuer visitar algum? 😊';
    return resp;
  }

  // Perfil completo mas sem matches
  if (!slot) {
    return `Perfeito${n}! Estou verificando as opções disponíveis agora. Em breve te envio as sugestões! 🔍`;
  }

  // Slot a slot — pergunta um dado por vez de forma natural
  switch(slot) {
    case 'intencao':
      // Lead mandou algo mas não captamos intenção ainda
      return `Entendi! Você está procurando para *comprar* ou *alugar*?`;

    case 'tipo':
      if (perfil.intencao === 'alugar')
        return `Legal! O que você quer alugar? Apartamento, casa, algo comercial?`;
      return `Que tipo de imóvel você quer comprar? Apartamento, casa, terreno?`;

    case 'quartos':
      return `${perfil.tipo ? 'Ótimo, ' + perfil.tipo + '!' : 'Ótimo!'} Quantos quartos você precisa?`;

    case 'bairro':
      return `${perfil.quartos} quarto${perfil.quartos > 1 ? 's' : ''}, anotado! 📝 Qual região ou bairro você prefere?`;

    case 'valor':
      const acao = perfil.intencao === 'alugar' ? 'aluguel' : 'compra';
      return `${perfil.bairro ? perfil.bairro.charAt(0).toUpperCase()+perfil.bairro.slice(1) + ', ótima escolha!' : 'Ótimo!'} Qual é sua faixa de preço para o ${acao}?`;
  }

  return `Pode me contar mais? Estou aqui pra te ajudar! 😊`;
}

module.exports = { gerarResposta };
