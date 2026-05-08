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
