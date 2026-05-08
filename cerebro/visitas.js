'use strict';

function responder(mNorm, d, visitas, btn, chip) {

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
