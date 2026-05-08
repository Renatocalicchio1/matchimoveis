'use strict';

function gerarSemanal(d, leads, imoveis, visitas, btn) {
  const taxa = d.leads > 0 ? Math.round(d.comMatch/d.leads*100) : 0;

  // Top bairros demandados
  const bairrosLeads = {};
  leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
  const topBairros = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([b,n])=>`${b} (${n})`).join(', ');

  // Top tipos demandados
  const tipos = {};
  leads.forEach(l => { if (l.tipo) tipos[l.tipo]=(tipos[l.tipo]||0)+1; });
  const topTipos = Object.entries(tipos).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,n])=>`${t} (${n})`).join(', ');

  // Imóveis parados (sem match com nenhuma lead)
  const idsComMatch = new Set(leads.flatMap(l=>(l.matchesBase||[]).map(m=>m.id||m._id)));
  const parados = imoveis.filter(i=>i.status!=='inativo'&&!idsComMatch.has(i.id||i._id)).length;

  const data = new Date().toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'});

  return `📊 <strong>Relatório — ${data}</strong><br><br>`+
    `<strong>🏠 Carteira:</strong><br>`+
    `• Ativos: ${d.ativos} · Inativos: ${d.inativos}<br>`+
    `• Imóveis sem match: ${parados}<br><br>`+
    `<strong>👥 Leads:</strong><br>`+
    `• Total: ${d.leads} · Com match: ${d.comMatch} (${taxa}%)<br>`+
    `• Bairros mais buscados: ${topBairros||'—'}<br>`+
    `• Tipos mais buscados: ${topTipos||'—'}<br><br>`+
    `<strong>📅 Visitas:</strong><br>`+
    `• Total: ${d.visitas} · Confirmadas: ${d.confirmadas} · Pendentes: ${d.pendentes}<br><br>`+
    `<strong>💡 Oportunidade:</strong><br>`+
    (parados > 0 ? `• ${parados} imóveis sem nenhuma lead compatível — revise bairros ou tipo.<br>` : `• Excelente! Toda a carteira tem compatibilidade com leads.<br>`)+
    (taxa < 40 && d.leads > 5 ? `• Taxa de match abaixo de 40% — importe mais imóveis nos bairros mais buscados.<br>` : '')+
    `<br>${btn('Ver leads','/app/leads')}${btn('Ver imóveis','/app/imoveis')}`;
}

module.exports = { gerarSemanal };
