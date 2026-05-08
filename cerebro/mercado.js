'use strict';

function responder(mNorm, leads, imoveis, btn, chip) {
  if (/bairro|demanda/.test(mNorm)) {
    const bairrosLeads = {};
    leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
    const ranking = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,6);
    if (!ranking.length) return `Sem dados de bairro nas leads ainda.<br><br>${btn('Importar leads','/app-importar-leads')}`;
    return `📍 <strong>Bairros mais buscados:</strong><br>`+ranking.map(([b,n],i)=>`${i+1}. ${b} — ${n} lead${n>1?'s':''}`).join('<br>')+`<br><br>${chip('🏠 Imóveis por bairro','imoveis por bairro')}`;
  }
  if (/tipo/.test(mNorm)) {
    const tipos = {};
    leads.forEach(l => { if (l.tipo) tipos[l.tipo]=(tipos[l.tipo]||0)+1; });
    const ranking = Object.entries(tipos).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (!ranking.length) return `Sem dados de tipo nas leads ainda.`;
    return `🏷️ <strong>Tipos mais buscados:</strong><br>`+ranking.map(([t,n])=>`• ${t}: ${n} lead${n>1?'s':''}`).join('<br>');
  }
  if (/valor|preco|faixa/.test(mNorm)) {
    const vals = leads.filter(l=>l.valorMax&&l.valorMax>0).map(l=>l.valorMax);
    if (!vals.length) return `Sem dados de valor nas leads ainda.`;
    const med = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    return `💰 <strong>Faixa de valor:</strong><br>Mínimo: R$ ${Math.min(...vals).toLocaleString('pt-BR')}<br>Médio: R$ ${med.toLocaleString('pt-BR')}<br>Máximo: R$ ${Math.max(...vals).toLocaleString('pt-BR')}`;
  }
  // oferta vs demanda
  const bairrosLeads = {};
  leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
  const bairrosIm = {};
  imoveis.filter(i=>i.status!=='inativo').forEach(i => { if (i.bairro) bairrosIm[i.bairro]=(bairrosIm[i.bairro]||0)+1; });
  const top = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if (!top.length) return `Sem dados de mercado ainda.<br><br>${btn('Importar leads','/app-importar-leads')}`;
  return `📊 <strong>Oferta vs Demanda:</strong><br>`+
    top.map(([b,dem])=>{const of=bairrosIm[b]||0;const st=of===0?'🔴 sem imóvel':of<dem?'🟡 pouca oferta':'🟢 ok';return `• ${b}: ${dem} leads · ${of} imóveis ${st}`;}).join('<br>')+
    `<br><br>${chip('🏠 Imóveis','meus imoveis')}`;
}

module.exports = { responder };
