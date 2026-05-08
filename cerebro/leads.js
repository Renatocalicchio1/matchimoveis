'use strict';

function responder(mNorm, d, btn, chip) {
  if (/importar|planilha|csv|upload/.test(mNorm))
    return `📋 Envie um CSV ou Excel do portal.<br><br>${btn('Importar leads','/app-importar-leads')}`;
  if (/sem match/.test(mNorm)) {
    if (d.semMatch===0) return `✅ Todas as suas leads têm match!`;
    return `❌ <strong>${d.semMatch} leads sem match</strong><br>Falta imóvel no bairro/tipo que buscam.<br><br>${btn('Ver leads','/app/leads?filtro=sem_match')}${chip('📊 Demanda por bairro','demanda por bairro')}`;
  }
  if (/com match/.test(mNorm)) {
    const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
    return `🎯 <strong>${d.comMatch} leads com match</strong> (${taxa}%)<br><br>${btn('Ver leads','/app/leads?filtro=com_match')}`;
  }
  if (d.leads===0) return `Nenhuma lead ainda. 👥<br><br>${btn('Importar leads','/app-importar-leads')}`;
  const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
  return `👥 <strong>Leads:</strong><br>Total: ${d.leads} · Orgânicas: ${d.organicas} · Importadas: ${d.importadas}<br>🎯 Com match: ${d.comMatch} (${taxa}%) · Sem match: ${d.semMatch}<br><br>${btn('Ver leads','/app/leads')}${btn('Importar','/app-importar-leads')}`;
}

module.exports = { responder };
