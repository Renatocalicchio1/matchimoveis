'use strict';

function responder(mNorm, d, btn, chip) {
  if (/hoje/.test(mNorm)) {
    if (d.hoje===0) return `📅 Nenhuma visita hoje. Fique tranquilo!`;
    return `📅 <strong>${d.hoje} visita(s) hoje!</strong> ⚠️<br><br>${btn('Ver hoje','/app/visitas?filtro=hoje')}`;
  }
  if (/pendente|sem resposta|aguardando/.test(mNorm)) {
    if (d.pendentes===0) return `✅ Nenhuma visita pendente. Tudo em dia!`;
    return `⏳ <strong>${d.pendentes} visita(s) pendente(s)</strong><br><br>${btn('Ver pendentes','/app/visitas?filtro=pendentes')}`;
  }
  if (/confirmada/.test(mNorm))
    return `✅ <strong>${d.confirmadas} visita(s) confirmada(s)</strong><br><br>${btn('Ver visitas','/app/visitas')}`;
  if (d.visitas===0) return `Nenhuma visita agendada ainda. 📅<br><br>${chip('👥 Ver leads','minhas leads')}`;
  return `📅 <strong>Visitas:</strong><br>Total: ${d.visitas} · ✅ Confirmadas: ${d.confirmadas} · ⏳ Pendentes: ${d.pendentes}<br>📆 Hoje: ${d.hoje}<br><br>${btn('Ver visitas','/app/visitas')}`;
}

module.exports = { responder };
