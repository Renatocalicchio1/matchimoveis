// resposta-auto.js — resposta automática via IA para leads no WhatsApp

const SAUDACOES = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello', 'hi'];
const DESPEDIDAS = ['tchau', 'obrigado', 'obrigada', 'valeu', 'até', 'ate', 'flw', 'abraço'];

function normalizar(txt) {
  return (txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function ehSaudacao(texto) {
  const norm = normalizar(texto);
  return SAUDACOES.some(s => norm === s || norm.startsWith(s + ' ') || norm.endsWith(' ' + s));
}

function ehDespedida(texto) {
  const norm = normalizar(texto);
  return DESPEDIDAS.some(s => norm.includes(s));
}

function gerarResposta(lead, texto, matches) {
  const norm = normalizar(texto);
  const nome = (lead.nome || '').split(' ')[0] || 'cliente';
  const perfil = lead.perfilIA || {};
  const msgs = lead.mensagens || [];
  const totalMsgs = msgs.filter(m => m.de === 'cliente').length;

  // Primeira mensagem — saudação
  if (totalMsgs <= 1 || ehSaudacao(texto)) {
    return `Olá ${nome}! 😊 Sou a assistente do MatchImóveis. Estou aqui para te ajudar a encontrar o imóvel ideal!\n\nPode me contar o que você está buscando? Tipo de imóvel, bairro, número de quartos e faixa de preço?`;
  }

  // Despedida
  if (ehDespedida(texto)) {
    return `Foi um prazer te atender, ${nome}! 😊 Qualquer dúvida é só chamar. Boa sorte na busca!`;
  }

  // Tem perfil e matches — apresenta opções
  if (perfil.tipo && matches && matches.length > 0) {
    const top3 = matches.slice(0, 3);
    let resp = `Ótimo ${nome}! Encontrei ${matches.length} imóvel(is) compatível(is) com seu perfil`;
    if (perfil.tipo) resp += ` (${perfil.tipo}`;
    if (perfil.quartos) resp += `, ${perfil.quartos} quartos`;
    if (perfil.valorMax) resp += `, até R$${Number(perfil.valorMax).toLocaleString('pt-BR')}`;
    if (perfil.tipo) resp += ')';
    resp += ':\n\n';
    top3.forEach((m, i) => {
      resp += `${i + 1}. ${m.titulo || m.endereco || 'Imóvel ' + (i+1)}`;
      if (m.bairro) resp += ` - ${m.bairro}`;
      if (m.valor) resp += ` - R$${Number(m.valor).toLocaleString('pt-BR')}`;
      resp += '\n';
    });
    resp += '\nQuer agendar uma visita ou saber mais detalhes?';
    return resp;
  }

  // Tem perfil mas sem matches ainda
  if (perfil.tipo || perfil.quartos || perfil.valorMax) {
    let resp = `Entendi ${nome}! `;
    if (perfil.tipo) resp += `Você busca um(a) ${perfil.tipo}`;
    if (perfil.quartos) resp += ` com ${perfil.quartos} quartos`;
    if (perfil.valorMax) resp += ` até R$${Number(perfil.valorMax).toLocaleString('pt-BR')}`;
    resp += '. Estou buscando as melhores opções para você! Em breve te envio as sugestões. 🔍';
    return resp;
  }

  // Sem perfil ainda — pede informações
  return `${nome}, para te indicar os melhores imóveis preciso de algumas informações:\n\n• Qual tipo? (apartamento, casa, sala...)\n• Quantos quartos?\n• Qual bairro ou região?\n• Qual faixa de preço?\n\nAssim consigo te enviar opções certeiras! 😊`;
}

module.exports = { gerarResposta };
