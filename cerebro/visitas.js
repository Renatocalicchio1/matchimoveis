'use strict';

function responder(mNorm, d, visitas, btn, chip) {
  if (/quem pediu visita|quem solicitou|nova solicitacao/.test(mNorm)) {
    const pend = visitas.filter(v=>v.status==='solicitada'||v.status==='pendente');
    if (!pend.length) return 'Nenhuma visita solicitada.' + btn('Ver visitas','/app/visitas');
    return '📋 <strong>'+pend.length+' solicitada(s):</strong><br>'+pend.slice(0,5).map(v=>'• '+(v.nome||v.leadNome||'Lead')+' — '+(v.dataVisita||'-')).join('<br>')+'<br><br>'+btn('Ver visitas','/app/visitas');
  }
  if (/visitas pendentes|pendentes de confirmacao|aguardando confirmacao/.test(mNorm)) {
    if (!d.pendentes) return 'Nenhuma visita pendente.' + btn('Ver visitas','/app/visitas');
    return '⏳ <strong>'+d.pendentes+' visita(s) pendente(s)</strong> aguardando confirmação do proprietário.<br><br>'+btn('Ver visitas','/app/visitas');
  }
  if (/quem confirmou|visitas confirmadas|confirmadas/.test(mNorm)) {
    if (!d.confirmadas) return 'Nenhuma visita confirmada ainda.' + btn('Ver visitas','/app/visitas');
    return '✅ <strong>'+d.confirmadas+' visita(s) confirmada(s)</strong>.<br><br>'+btn('Ver visitas','/app/visitas');
  }
  if (/avisar proprietario|notificar proprietario|avisar dono da visita/.test(mNorm))
    return '📱 Na página de visitas, clique em <strong>Notificar Proprietário</strong>.<br><br>O WhatsApp abre com a mensagem pronta para o proprietário confirmar a data.<br><br>'+btn('Ver visitas','/app/visitas');
  if (/quem nao respondeu|sem resposta|nao respondeu/.test(mNorm))
    return '📋 Leads sem resposta ficam com status <strong>pendente</strong>.<br><br>'+btn('Ver leads','/app/leads');

  if (/quem pediu visita|quem solicitou|nova solicitacao/.test(mNorm)) {
    const pend = visitas.filter(v=>v.status==='solicitada'||v.status==='pendente');
    if (!pend.length) return 'Nenhuma visita solicitada no momento.' + btn('Ver visitas','/app/visitas');
    return '📋 <strong>'+pend.length+' visita(s) solicitada(s):</strong><br>'+pend.slice(0,5).map(v=>'• '+(v.nome||v.leadNome||'Lead')+' — '+(v.dataVisita||'-')).join('<br>')+'<br><br>'+btn('Ver visitas','/app/visitas');
  }
  if (/avisar proprietario|notificar proprietario|avisar dono/.test(mNorm))
    return '📱 Na página de visitas, clique em <strong>Notificar Proprietário</strong>.<br><br>O WhatsApp abre com a mensagem:<br><em>"Olá [nome]! Tenho um cliente interessado no seu imóvel. Gostaria de agendar visita em [data]. Confirme: [link]"</em><br><br>'+btn('Ver visitas','/app/visitas');
  if (/quem nao respondeu|sem resposta|nao respondeu/.test(mNorm))
    return '📋 Leads sem resposta ficam com status <strong>pendente</strong> na página de leads.<br><br>'+btn('Ver leads','/app/leads');

  if (/quem confirmou|confirmou visita/.test(mNorm))
    return '✅ <strong>' + d.confirmadas + ' visita(s) confirmada(s)</strong><br><br>' + btn('Ver visitas','/app/visitas');
  if (/como funciona visita|fluxo visita|passo a passo visita/.test(mNorm))
    return '📅 <strong>Fluxo de visitas:</strong><br><br>1. Lead acessa vitrine e escolhe imóvel<br>2. Lead solicita visita<br>3. Corretor notifica proprietário<br>4. Proprietário confirma ou recusa<br>5. Lead é notificada<br><br>' + btn('Ver visitas','/app/visitas');

  // PÁGINA DE VISITAS — o que tem
  if (/pagina visitas|o que tem em visitas|menu visitas|app visitas/.test(mNorm))
    return '📅 <strong>Página Visitas:</strong><br><br>' +
      '• Nome do cliente<br>' +
      '• Telefone<br>' +
      '• Imóvel solicitado<br>' +
      '• Data e horário da visita<br>' +
      '• Status: Solicitada · Aguardando · Confirmada · Cancelada<br>' +
      '• Ações: Notificar proprietário · Remarcar · Confirmar presença<br><br>' +
      btn('Ver visitas','/app/visitas');

  // NOTIFICAR PROPRIETÁRIO
  if (/notificar proprietario|avisar proprietario|mensagem proprietario/.test(mNorm))
    return '📱 <strong>Notificar proprietário:</strong><br><br>' +
      'Clique em <strong>Notificar Proprietário</strong> na visita.<br><br>' +
      'O sistema abre o WhatsApp com a mensagem:<br>' +
      '<em>"Olá, sou o corretor [nome], corretor parceiro. Tenho um cliente interessado no imóvel [imóvel]. Gostaria de agendar uma visita em [data] às [horário]. Confirme sua disponibilidade: [link]"</em><br><br>' +
      'O proprietário acessa o link e confirma ou recusa.<br><br>' +
      btn('Ver visitas','/app/visitas');

  // REMARCAR VISITA
  if (/remarcar|reagendar|mudar data visita|remarcar visita/.test(mNorm))
    return '🔄 <strong>Remarcar visita:</strong><br><br>' +
      'Na página de visitas, clique em <strong>Remarcar</strong> na visita desejada.<br>' +
      'Escolha nova data e horário.<br><br>' +
      btn('Ver visitas','/app/visitas');

  // STATUS DAS VISITAS
  if (/status visita|o que significa solicitada|aguardando visita|confirmada visita|cancelada/.test(mNorm))
    return '📋 <strong>Status das visitas:</strong><br><br>' +
      '• ⏳ <strong>Solicitada</strong> — lead pediu a visita, aguardando ação do corretor<br>' +
      '• 🔔 <strong>Aguardando</strong> — proprietário foi notificado, aguardando confirmação<br>' +
      '• ✅ <strong>Confirmada</strong> — proprietário confirmou disponibilidade<br>' +
      '• ❌ <strong>Cancelada</strong> — visita cancelada<br><br>' +
      btn('Ver visitas','/app/visitas');

  // FLUXO COMPLETO
  if (/fluxo visita|como funciona visita|passo a passo visita/.test(mNorm))
    return '📅 <strong>Fluxo completo de visita:</strong><br><br>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">1</span><span>Lead acessa a vitrine e escolhe um imóvel</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">2</span><span>Lead solicita visita com data e horário</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">3</span><span>Corretor notifica o proprietário via WhatsApp</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">4</span><span>Proprietário confirma ou recusa pelo link</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">5</span><span>Lead é notificada automaticamente com o resultado</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">6</span><span>Corretor registra confirmação de presença</span></div>' +
      '<br>' + btn('Ver visitas','/app/visitas');

  // CONFIRMAR PRESENÇA
  if (/confirmar presenca|presenca confirmada|cliente compareceu/.test(mNorm))
    return '✅ Após a visita, registre a presença do cliente clicando em <strong>Confirmou Presença</strong> na visita.<br><br>' +
      btn('Ver visitas','/app/visitas');

  // LINK DO PROPRIETÁRIO
  if (/link proprietario|proprietario visita|proprietario confirmar/.test(mNorm))
    return '🔗 O proprietário recebe um link exclusivo para confirmar ou recusar a visita sem precisar de cadastro.<br><br>' +
      'Link: <strong>/proprietario/visita/:visitaId/responder</strong><br><br>' +
      btn('Ver visitas','/app/visitas');


  // HOJE
  if (/hoje|do dia/.test(mNorm)) {
    if (d.hoje===0) return `📅 Nenhuma visita hoje. Aproveite para enviar vitrines para leads com match!<br><br>${chip('🎯 Ver leads com match','leads com match')}`;
    return `📅 <strong>${d.hoje} visita(s) hoje!</strong> ⚠️ Não esqueça!<br><br>${btn('Ver visitas de hoje','/app/visitas?filtro=hoje')}`;
  }

  // PENDENTES
  if (/pendente|sem resposta|aguardando|confirmar/.test(mNorm)) {
    if (d.pendentes===0) return `✅ Nenhuma visita pendente. Tudo confirmado!`;
    return `⏳ <strong>${d.pendentes} visita(s) pendente(s)</strong> aguardando confirmação.<br>`+
      `Confirme logo — leads não gostam de esperar!<br><br>`+
      `${btn('Confirmar visitas','/app/visitas?filtro=pendentes')}`;
  }

  // CONFIRMADAS
  if (/confirmada|aprovada/.test(mNorm))
    return `✅ <strong>${d.confirmadas} visita(s) confirmada(s)</strong><br><br>${btn('Ver visitas','/app/visitas')}`;

  // COMO FUNCIONA
  if (/como funciona|fluxo|como agendar|como remarcar/.test(mNorm))
    return `📅 <strong>Fluxo de visitas:</strong><br><br>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">1</span><span>Lead recebe a vitrine com imóveis em match.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">2</span><span>Lead escolhe imóvel e solicita visita.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">3</span><span>Proprietário confirma ou recusa.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">4</span><span>Lead é notificado automaticamente.</span></div>`+
      `<br>${btn('Ver visitas','/app/visitas')}`;

  // REMARCAR
  if (/remarcar|reagendar|mudar data/.test(mNorm))
    return `🔄 Para remarcar uma visita, acesse a página de visitas e use o botão <strong>Remarcar</strong>.<br><br>${btn('Ver visitas','/app/visitas')}`;

  // GERAL
  if (d.visitas===0)
    return `Nenhuma visita agendada ainda. 📅<br><br>Envie vitrines para leads com match para receber solicitações!<br><br>${chip('🎯 Leads com match','leads com match')}`;

  return `📅 <strong>Visitas:</strong><br>`+
    `Total: <strong>${d.visitas}</strong> · ✅ Confirmadas: ${d.confirmadas} · ⏳ Pendentes: ${d.pendentes}<br>`+
    `📆 Hoje: <strong>${d.hoje}</strong><br><br>`+
    `${btn('Ver visitas','/app/visitas')}<br>`+
    `${chip('📆 Hoje','visitas hoje')}${chip('⏳ Pendentes','visitas pendentes')}${chip('❓ Como funciona','como funciona a visita')}`;
}

module.exports = { responder };
