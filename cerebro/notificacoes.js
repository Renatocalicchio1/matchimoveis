'use strict';

/**
 * NOTIFICAÇÕES PROATIVAS
 * Analisa dados e gera alertas relevantes para o usuário.
 * Chamado na saudação e quando o usuário pergunta sobre notificações.
 */

function gerarAlertas(d, leads, imoveis, visitas) {
  const alertas = [];
  const agora = new Date();
  const hoje = agora.toLocaleDateString('pt-BR');

  // CRÍTICOS
  if (d.hoje > 0)
    alertas.push({ nivel:'critico', emoji:'🔴', titulo:`${d.hoje} visita(s) hoje`, detalhe:'Não perca o horário!', rota:'/app/visitas' });

  if (d.pendentes > 0)
    alertas.push({ nivel:'critico', emoji:'🟡', titulo:`${d.pendentes} visita(s) pendentes`, detalhe:'Aguardando sua confirmação.', rota:'/app/visitas' });

  // Leads com match sem vitrine enviada
  const comMatchSemVisita = leads.filter(l =>
    l.matchesBase && l.matchesBase.length > 0 &&
    !visitas.some(v => v.leadId === (l.id||l._id))
  ).length;
  if (comMatchSemVisita > 5)
    alertas.push({ nivel:'atencao', emoji:'🎯', titulo:`${comMatchSemVisita} leads com match sem visita`, detalhe:'Envie a vitrine para converter!', rota:'/app/leads?filtro=com_match' });

  // Imóveis sem proprietário
  const semProp = imoveis.filter(i=>i.status!=='inativo'&&!i.proprietario&&!i.nomeProprietario).length;
  if (semProp > 10)
    alertas.push({ nivel:'atencao', emoji:'👤', titulo:`${semProp} imóveis sem proprietário`, detalhe:'Importe o Excel para vincular.', rota:'/app/imoveis' });

  // Taxa de match baixa
  const taxa = d.leads > 0 ? Math.round(d.comMatch/d.leads*100) : 0;
  if (taxa < 30 && d.leads > 10)
    alertas.push({ nivel:'atencao', emoji:'📉', titulo:`Taxa de match em ${taxa}%`, detalhe:'Importe mais imóveis nos bairros mais buscados.', rota:'/app/imoveis' });

  // Conta vazia
  if (d.ativos === 0)
    alertas.push({ nivel:'info', emoji:'🏠', titulo:'Nenhum imóvel cadastrado', detalhe:'Importe um XML para começar.', rota:'/app/imoveis' });
  if (d.leads === 0)
    alertas.push({ nivel:'info', emoji:'👥', titulo:'Nenhuma lead cadastrada', detalhe:'Importe uma planilha para fazer o match.', rota:'/app-importar-leads' });

  return alertas;
}

function renderAlertas(alertas, btn) {
  if (alertas.length === 0)
    return `🔔 Nenhuma notificação no momento. Tudo em dia! ✅`;

  const criticos  = alertas.filter(a=>a.nivel==='critico');
  const atencao   = alertas.filter(a=>a.nivel==='atencao');
  const info      = alertas.filter(a=>a.nivel==='info');

  let html = `🔔 <strong>${alertas.length} notificação(ões):</strong><br><br>`;

  if (criticos.length) {
    html += `<strong>⚠️ Urgente:</strong><br>`;
    criticos.forEach(a => {
      html += `${a.emoji} <strong>${a.titulo}</strong> — ${a.detalhe} ${btn('Ver',a.rota)}<br>`;
    });
    html += '<br>';
  }
  if (atencao.length) {
    html += `<strong>📋 Atenção:</strong><br>`;
    atencao.forEach(a => {
      html += `${a.emoji} <strong>${a.titulo}</strong> — ${a.detalhe} ${btn('Ver',a.rota)}<br>`;
    });
    html += '<br>';
  }
  if (info.length) {
    html += `<strong>💡 Info:</strong><br>`;
    info.forEach(a => {
      html += `${a.emoji} ${a.titulo} — ${a.detalhe}<br>`;
    });
  }

  return html;
}

module.exports = { gerarAlertas, renderAlertas };


// Responder perguntas sobre a página de notificações
function responderPagina(mNorm, btn, chip) {

  // PÁGINA DE NOTIFICAÇÕES
  if (/central notificacoes|pagina notificacoes|o que tem em notificacoes|menu notificacoes/.test(mNorm))
    return '🔔 <strong>Central de Notificações:</strong><br><br>' +
      '"Acompanhe solicitações de visitas, novos matches e avisos importantes."<br><br>' +
      '<strong>Tipos de notificação:</strong><br>' +
      '• 📅 Nova solicitação de visita — lead quer visitar um imóvel<br>' +
      '• 🔄 Cliente remarcou a visita — lead escolheu nova data<br>' +
      '• 🔄 Proprietário pediu remarcação — proprietário não pode no dia<br>' +
      '• ✅ Visita confirmada pelo proprietário<br>' +
      '• ✅ Cliente confirmou presença<br>' +
      '• 🎯 Novo match — lead compatível com imóvel<br><br>' +
      btn('Ver notificações','/app/notificacoes');

  // TIPOS DE NOTIFICAÇÃO
  if (/tipos notificacao|quais notificacoes|o que aparece nas notificacoes/.test(mNorm))
    return '🔔 <strong>Tipos de notificação:</strong><br><br>' +
      '• <strong>Nova solicitação de visita</strong> — mostra: lead, imóvel, data. Ações: ver lead, ver imóvel<br>' +
      '• <strong>Cliente remarcou</strong> — lead escolheu nova data. Ação: notificar proprietário<br>' +
      '• <strong>Proprietário pediu remarcação</strong> — não pode receber no dia. Ação: pedir nova data ao cliente<br>' +
      '• <strong>Visita confirmada pelo proprietário</strong> — tudo certo<br>' +
      '• <strong>Cliente confirmou presença</strong> — cliente vai comparecer<br>' +
      '• <strong>Novo match</strong> — IA encontrou imóvel compatível com lead<br><br>' +
      btn('Ver notificações','/app/notificacoes');

  // CLIENTE REMARCOU
  if (/cliente remarcou|lead remarcou|nova data cliente/.test(mNorm))
    return '🔄 <strong>Cliente remarcou a visita:</strong><br><br>' +
      'A lead escolheu uma nova data para visitar o imóvel.<br>' +
      'Você precisa <strong>notificar o proprietário</strong> sobre a nova data.<br><br>' +
      btn('Ver notificações','/app/notificacoes');

  // PROPRIETÁRIO PEDIU REMARCAÇÃO
  if (/proprietario remarcou|proprietario pediu|proprietario nao pode/.test(mNorm))
    return '🔄 <strong>Proprietário pediu remarcação:</strong><br><br>' +
      'O proprietário não pode receber o cliente na data combinada.<br>' +
      'Você precisa <strong>pedir uma nova data ao cliente</strong>.<br><br>' +
      btn('Ver notificações','/app/notificacoes');

  // NOVA SOLICITAÇÃO
  if (/nova solicitacao|nova visita solicitada|lead solicitou/.test(mNorm))
    return '📅 <strong>Nova solicitação de visita:</strong><br><br>' +
      'Uma lead quer visitar um imóvel. A notificação mostra:<br>' +
      '• Nome da lead<br>• Imóvel desejado<br>• Data e horário<br><br>' +
      'Ações disponíveis: Ver lead · Ver imóvel · Notificar proprietário<br><br>' +
      btn('Ver notificações','/app/notificacoes');

  return null;
}

module.exports.responderPagina = responderPagina;
