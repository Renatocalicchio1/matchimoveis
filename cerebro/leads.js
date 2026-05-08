'use strict';

function responder(mNorm, d, leads, btn, chip) {

  // IMPORTAR
  if (/importar|planilha|csv|upload|subir/.test(mNorm))
    return `📋 <strong>Importar leads — passo a passo:</strong><br><br>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">1</span><span>Exporte a planilha do portal (ImovelWeb, ZAP, VivaReal, OLX).</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">2</span><span>Acesse <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads →</a> e clique em <strong>Importar</strong>.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">3</span><span>Selecione o arquivo <strong>CSV ou Excel</strong>.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">4</span><span>O sistema extrai bairro, tipo, quartos e valor automaticamente.</span></div>`+
      `<br>${btn('Importar leads','/app-importar-leads')}`;

  // SEM MATCH
  if (/sem match|nao tem match|sem combinacao/.test(mNorm)) {
    if (d.semMatch===0) return `✅ Todas as suas leads têm match! Excelente carteira!`;
    // Análise de causas
    const bairrosLeads = {};
    leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
    const topSemBairro = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([b,n])=>`${b} (${n})`).join(', ');
    return `❌ <strong>${d.semMatch} leads sem match</strong><br><br>`+
      `Possíveis causas:<br>`+
      `• Bairros mais buscados: <strong>${topSemBairro||'—'}</strong> — você tem imóveis nesses bairros?<br>`+
      `• Tipo ou quantidade de quartos incompatível<br>`+
      `• Imóveis inativos não entram no match<br><br>`+
      `${btn('Ver leads sem match','/app/leads?filtro=sem_match')}${chip('📍 Demanda por bairro','demanda por bairro')}${chip('🏠 Meus imóveis','meus imoveis')}`;
  }

  // COM MATCH
  if (/com match|tem match|com combinacao/.test(mNorm)) {
    const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
    return `🎯 <strong>${d.comMatch} leads com match</strong> (${taxa}% da base)<br><br>`+
      `Essas leads já receberam a vitrine? Envie agora e converta em visitas!<br><br>`+
      `${btn('Ver leads com match','/app/leads?filtro=com_match')}`;
  }

  // ORGÂNICAS
  if (/organica|do portal|origem/.test(mNorm))
    return `🌐 <strong>${d.organicas} leads orgânicas</strong> — vieram diretamente dos portais (ImovelWeb, ZAP, etc).<br><br>${btn('Ver leads','/app/leads')}`;

  // IMPORTADAS
  if (/importada|planilha/.test(mNorm))
    return `📋 <strong>${d.importadas} leads importadas</strong> — vieram de planilhas enviadas manualmente.<br><br>${btn('Ver leads','/app/leads')}`;

  // QUENTES (com match + sem visita)
  if (/quente|interessado|alta intencao/.test(mNorm)) {
    const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
    return `🔥 Leads quentes = com match + ainda sem visita agendada.<br>`+
      `Você tem <strong>${d.comMatch}</strong> leads com match (${taxa}%).<br><br>`+
      `${btn('Ver leads quentes','/app/leads?filtro=com_match')}`;
  }

  // ANTIGAS / SEM CONTATO
  if (/antiga|sem contato|parada|abandonada/.test(mNorm))
    return `📋 Leads antigas sem contato podem esfriar. Envie a vitrine para reengajar!<br><br>`+
      `${btn('Ver todas as leads','/app/leads')}${chip('🎯 Fazer match','fazer match agora')}`;

  // TOTAL / GERAL
  if (d.leads===0)
    return `Nenhuma lead ainda. 👥<br><br>Importe planilhas dos portais para começar o match!<br><br>${btn('Importar leads','/app-importar-leads')}`;

  const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;

  // Análise de bairros das leads
  const bairrosLeads = {};
  leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
  const topBairros = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([b,n])=>`${b} (${n})`).join(', ');

  return `👥 <strong>Leads:</strong><br>`+
    `Total: ${d.leads} · 🌐 Orgânicas: ${d.organicas} · 📋 Importadas: ${d.importadas}<br>`+
    `🎯 Com match: <strong>${d.comMatch}</strong> (${taxa}%) · ❌ Sem match: ${d.semMatch}<br>`+
    `📍 Bairros mais buscados: ${topBairros||'—'}<br><br>`+
    `${btn('Ver leads','/app/leads')}${btn('Importar','/app-importar-leads')}<br>`+
    `${chip('🎯 Com match','leads com match')}${chip('❌ Sem match','leads sem match')}${chip('📊 Demanda','demanda por bairro')}`;
}

module.exports = { responder };
