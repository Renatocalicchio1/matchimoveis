'use strict';

function responder(mNorm, leads, imoveis, btn, chip) {

  // BAIRROS MAIS DEMANDADOS
  if (/bairro|demanda|mais buscado|onde|regiao/.test(mNorm)) {
    const bairrosLeads = {};
    leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
    const ranking = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,8);
    if (!ranking.length) return `Sem dados de bairro nas leads ainda.<br><br>${btn('Importar leads','/app-importar-leads')}`;
    const bairrosIm = {};
    imoveis.filter(i=>i.status!=='inativo').forEach(i=>{ if(i.bairro) bairrosIm[i.bairro]=(bairrosIm[i.bairro]||0)+1; });
    const lista = ranking.map(([b,n],i)=>{
      const of = bairrosIm[b]||0;
      const st = of===0?'🔴':of<n?'🟡':'🟢';
      return `${i+1}. <strong>${b}</strong> — ${n} lead${n>1?'s':''} · ${of} imóvel(is) ${st}`;
    }).join('<br>');
    return `📍 <strong>Bairros mais buscados pelas leads:</strong><br><br>${lista}<br><br>`+
      `🔴 sem imóvel · 🟡 pouca oferta · 🟢 ok<br><br>`+
      `${chip('🏠 Ver imóveis','meus imoveis')}${chip('📥 Importar XML','importar xml')}`;
  }

  // TIPO MAIS BUSCADO
  if (/tipo mais buscado|tipo mais pedido|qual tipo.*busca|tipos.*mais.*busca|tipos.*leads|leads.*tipo/.test(mNorm)) {
    const tipos = {};
    leads.forEach(l => { if (l.tipo) tipos[l.tipo]=(tipos[l.tipo]||0)+1; });
    const ranking = Object.entries(tipos).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (!ranking.length) return 'Sem dados de tipo nas leads ainda.';
    const total = ranking.reduce((a,[,n])=>a+n,0);
    return '<strong>Tipos mais buscados pelas leads:</strong><br><br>'+
      ranking.map(([t,n],i)=>{
        const pct = Math.round(n/total*100);
        const bar = '█'.repeat(Math.round(pct/10))+'░'.repeat(10-Math.round(pct/10));
        return (i+1)+'. <strong>'+t+'</strong> — '+n+' lead'+(n>1?'s':'')+' ('+pct+'%)<br><span style="color:#ff385c;font-size:11px">'+bar+'</span>';
      }).join('<br><br>')+
      '<br><br>'+chip('Ver imóveis','meus imoveis')+chip('Demanda por bairro','demanda por bairro');
  }

  // QUARTOS MAIS PEDIDOS
  if (/quartos? mais (pedido|buscado|procurado|demandado)|quantos quartos|quartos mais/.test(mNorm)) {
    const qtds = {};
    leads.forEach(l => { if (l.quartos) qtds[l.quartos]=(qtds[l.quartos]||0)+1; });
    const ranking = Object.entries(qtds).sort((a,b)=>b[1]-a[1]).slice(0,6);
    if (!ranking.length) return 'Sem dados de quartos nas leads ainda.';
    const total = ranking.reduce((a,[,n])=>a+n,0);
    return '<strong>Quartos mais pedidos pelas leads:</strong><br><br>'+
      ranking.map(([q,n],i)=>{
        const pct = Math.round(n/total*100);
        const bar = '█'.repeat(Math.round(pct/10))+'░'.repeat(10-Math.round(pct/10));
        return (i+1)+'. <strong>'+q+' quartos</strong> — '+n+' lead'+(n>1?'s':'')+' ('+pct+'%)<br><span style="color:#ff385c;font-size:11px">'+bar+'</span>';
      }).join('<br><br>')+
      '<br><br>'+chip('Ver imóveis','meus imoveis')+chip('Tipo mais buscado','tipo mais buscado');
  }

  // FAIXA DE VALOR
  if (/valor|preco|faixa|orcamento|quanto pagam/.test(mNorm)) {
    const vals = leads.filter(l=>l.valorMax&&l.valorMax>0).map(l=>Number(l.valorMax));
    if (!vals.length) return `Sem dados de valor nas leads ainda.`;
    const med = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    const faixas = { 'até 300k':0, '300k-500k':0, '500k-800k':0, 'acima 800k':0 };
    vals.forEach(v => {
      if (v<=300000) faixas['até 300k']++;
      else if (v<=500000) faixas['300k-500k']++;
      else if (v<=800000) faixas['500k-800k']++;
      else faixas['acima 800k']++;
    });
    const faixaLista = Object.entries(faixas).filter(([,n])=>n>0).map(([f,n])=>`• ${f}: ${n} lead${n>1?'s':''}`).join('<br>');
    return `💰 <strong>Faixa de valor das leads:</strong><br><br>`+
      `Médio: <strong>R$ ${med.toLocaleString('pt-BR')}</strong><br><br>`+
      faixaLista+`<br><br>${chip('🏠 Meus imóveis','meus imoveis')}`;
  }

  // QUARTOS
  if (/quarto|dormitorio/.test(mNorm)) {
    const qts = {};
    leads.forEach(l => { if (l.quartos) qts[l.quartos]=(qts[l.quartos]||0)+1; });
    const ranking = Object.entries(qts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (!ranking.length) return `Sem dados de quartos nas leads ainda.`;
    return `🛏️ <strong>Quartos mais pedidos:</strong><br><br>`+
      ranking.map(([q,n],i)=>`${i+1}. <strong>${q} quarto${q>1?'s':''}</strong> — ${n} lead${n>1?'s':''}`).join('<br>')+
      `<br><br>${chip('🏠 Ver imóveis','meus imoveis')}`;
  }

  // OFERTA VS DEMANDA (padrão)
  const bairrosLeads = {};
  leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
  const bairrosIm = {};
  imoveis.filter(i=>i.status!=='inativo').forEach(i=>{ if(i.bairro) bairrosIm[i.bairro]=(bairrosIm[i.bairro]||0)+1; });
  const top = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if (!top.length) return `Sem dados de mercado ainda.<br><br>${btn('Importar leads','/app-importar-leads')}`;

  return `📊 <strong>Inteligência de mercado:</strong><br><br>`+
    top.map(([b,dem])=>{
      const of=bairrosIm[b]||0;
      const st=of===0?'🔴 sem imóvel':of<dem?'🟡 pouca oferta':'🟢 equilibrado';
      return `• <strong>${b}</strong>: ${dem} leads · ${of} imóveis — ${st}`;
    }).join('<br>')+
    `<br><br>${chip('💰 Faixa de valor','faixa de valor das leads')}${chip('🏷️ Tipos','tipo mais buscado')}${chip('🛏️ Quartos','quartos mais pedidos')}`;
}

module.exports = { responder };
