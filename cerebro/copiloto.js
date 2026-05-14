// copiloto.js — sugestões de resposta para o corretor

function gerarSugestoes(lead) {
  const p = lead.perfilIA || {};
  const nome = (lead.nome || '').split(' ')[0] || 'cliente';
  const sugestoes = [];

  // 1. Saudação inicial
  if (!lead.mensagens || lead.mensagens.filter(m => m.de === 'corretor').length === 0) {
    sugestoes.push({
      tipo: 'saudacao',
      icone: '👋',
      label: 'Saudação inicial',
      texto: `Olá ${nome}! Sou corretor parceiro MatchImóveis. Vi seu interesse em imóveis${p.tipo ? ' do tipo ' + p.tipo : ''}${p.bairro ? ' no ' + p.bairro : ''}. Posso te ajudar a encontrar o imóvel ideal! 😊`
    });
  }

  // 2. Baseado no perfil extraído
  if (p.tipo || p.quartos || p.valorMax) {
    let txt = `${nome}, encontrei alguns imóveis compatíveis com seu perfil`;
    if (p.tipo) txt += ` (${p.tipo}`;
    if (p.quartos) txt += ` com ${p.quartos} quartos`;
    if (p.valorMax) txt += `, até R$${Number(p.valorMax).toLocaleString('pt-BR')}`;
    if (p.tipo || p.quartos) txt += ')';
    txt += `. Posso te enviar as opções agora?`;
    sugestoes.push({ tipo: 'match', icone: '🏠', label: 'Enviar matches', texto: txt });
  }

  // 3. Agendar visita
  if (p.faseFunil === 'interessado' || p.faseFunil === 'decidido') {
    sugestoes.push({
      tipo: 'visita',
      icone: '📅',
      label: 'Agendar visita',
      texto: `${nome}, que tal agendarmos uma visita? Tenho disponibilidade essa semana. Qual horário fica melhor para você?`
    });
  }

  // 4. Urgência alta
  if (p.urgencia === 'alta') {
    sugestoes.push({
      tipo: 'urgencia',
      icone: '⚡',
      label: 'Responder urgência',
      texto: `${nome}, entendo que você precisa com urgência! Vou priorizar seu atendimento agora. Me conta mais sobre o que você busca para eu encontrar as melhores opções rapidamente.`
    });
  }

  // 5. Follow-up
  if (lead.ultimaMensagemEm) {
    const horas = (Date.now() - new Date(lead.ultimaMensagemEm)) / 3600000;
    if (horas > 24) {
      sugestoes.push({
        tipo: 'followup',
        icone: '🔔',
        label: 'Follow-up',
        texto: `Olá ${nome}! Tudo bem? Passando para saber se você ainda está buscando imóvel. Tenho novidades que podem te interessar! 😊`
      });
    }
  }

  // 6. Default se nenhuma sugestão
  if (!sugestoes.length) {
    sugestoes.push({
      tipo: 'geral',
      icone: '💬',
      label: 'Resposta geral',
      texto: `Olá ${nome}! Como posso te ajudar hoje?`
    });
  }

  return sugestoes.slice(0, 3);
}

module.exports = { gerarSugestoes };
