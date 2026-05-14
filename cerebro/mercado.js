'use strict';
function responder(mNorm, leads, imoveis, btn, chip) {
  // OPORTUNIDADE DE CAPTAÇÃO — bairro com lead mas sem imóvel
  if(/oportunidade|captacao|onde captar|onde buscar imovel|bairro sem imovel|falta imovel|onde falta/.test(mNorm)) {
    const blMap={};leads.forEach(l=>{if(l.bairro)blMap[l.bairro]=(blMap[l.bairro]||0)+1;});
    const biSet=new Set(imoveis.filter(i=>i.status!=='inativo').map(i=>i.bairro).filter(Boolean));
    const opors=Object.entries(blMap).filter(([b])=>!biSet.has(b)).sort((a,b)=>b[1]-a[1]).slice(0,8);
    if(!opors.length) return '🎉 Você tem imóveis em todos os bairros demandados!';
    return '🚨 <strong>Oportunidades de captação — bairros com demanda mas sem imóvel:</strong><br><br>'+opors.map(([b,n],i)=>(i+1)+'. <strong>'+b+'</strong> — '+n+' lead'+(n>1?'s':'')+' sem opção').join('<br>')+'<br><br>💡 Capte imóveis nesses bairros para fechar mais negócios!<br>'+btn('Ver leads','/app/leads');
  }
  // BAIRROS MAIS DEMANDADOS
  if(/bairro|demanda|mais buscado|onde|regiao/.test(mNorm)) {
    const bl={};leads.forEach(l=>{if(l.bairro)bl[l.bairro]=(bl[l.bairro]||0)+1;});
    const ranking=Object.entries(bl).sort((a,b)=>b[1]-a[1]).slice(0,8);
    if(!ranking.length) return 'Sem dados de bairro nas leads ainda.<br><br>'+btn('Importar leads','/app-importar-leads');
    const bi={};imoveis.filter(i=>i.status!=='inativo').forEach(i=>{if(i.bairro)bi[i.bairro]=(bi[i.bairro]||0)+1;});
    const lista=ranking.map(([b,n],i)=>{
      const of=bi[b]||0;
      const st=of===0?'🔴 SEM IMÓVEL':of<n?'🟡 pouca oferta':'🟢 ok';
      return (i+1)+'. <strong>'+b+'</strong> — '+n+' lead'+(n>1?'s':'')+' · '+of+' imóvel(is) '+st;
    }).join('<br>');
    return '📍 <strong>Bairros mais buscados pelas leads:</strong><br><br>'+lista+'<br><br>🔴 sem imóvel · 🟡 pouca oferta · 🟢 ok<br><br>'+chip('Oportunidades','oportunidade de captacao')+chip('Tipos mais buscados','tipo mais buscado')+chip('Faixa de valor','faixa de valor das leads');
  }
  // TIPO MAIS BUSCADO
  if(/tipo mais buscado|tipo mais pedido|qual tipo|tipos.*leads|leads.*tipo/.test(mNorm)) {
    const tipos={};leads.forEach(l=>{if(l.tipo)tipos[l.tipo]=(tipos[l.tipo]||0)+1;});
    const ranking=Object.entries(tipos).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if(!ranking.length) return 'Sem dados de tipo nas leads ainda.';
    const total=ranking.reduce((a,[,n])=>a+n,0);
    return '<strong>Tipos mais buscados pelas leads:</strong><br><br>'+ranking.map(([t,n],i)=>{
      const pct=Math.round(n/total*100);
      const bar='█'.repeat(Math.round(pct/10))+'░'.repeat(10-Math.round(pct/10));
      return (i+1)+'. <strong>'+t+'</strong> — '+n+' lead'+(n>1?'s':'')+' ('+pct+'%)<br><span style="color:#ff385c;font-size:11px">'+bar+'</span>';
    }).join('<br><br>')+'<br><br>'+chip('Ver imóveis','meus imoveis')+chip('Demanda por bairro','demanda por bairro');
  }
  // QUARTOS MAIS PEDIDOS
  if(/quartos? mais (?:pedido|buscado|procurado|demandado)|quantos quartos|quartos mais/.test(mNorm)) {
    const qtds={};leads.forEach(l=>{if(l.quartos)qtds[l.quartos]=(qtds[l.quartos]||0)+1;});
    const ranking=Object.entries(qtds).sort((a,b)=>b[1]-a[1]).slice(0,6);
    if(!ranking.length) return 'Sem dados de quartos nas leads ainda.';
    const total=ranking.reduce((a,[,n])=>a+n,0);
    return '<strong>Quartos mais pedidos pelas leads:</strong><br><br>'+ranking.map(([q,n],i)=>{
      const pct=Math.round(n/total*100);
      const bar='█'.repeat(Math.round(pct/10))+'░'.repeat(10-Math.round(pct/10));
      return (i+1)+'. <strong>'+q+' quartos</strong> — '+n+' lead'+(n>1?'s':'')+' ('+pct+'%)<br><span style="color:#ff385c;font-size:11px">'+bar+'</span>';
    }).join('<br><br>')+'<br><br>'+chip('Ver imóveis','meus imoveis');
  }
  // FAIXA DE VALOR
  if(/valor|preco|faixa|orcamento|quanto pagam|ticket/.test(mNorm)) {
    const vals=leads.filter(l=>l.valor_imovel&&l.valor_imovel>0).map(l=>Number(l.valor_imovel));
    if(!vals.length) return 'Sem dados de valor nas leads ainda.';
    const med=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    const min=Math.min(...vals);const max=Math.max(...vals);
    const faixas={'ate 300k':0,'300k-500k':0,'500k-800k':0,'800k-1.5M':0,'acima 1.5M':0};
    vals.forEach(v=>{
      if(v<=300000)faixas['ate 300k']++;
      else if(v<=500000)faixas['300k-500k']++;
      else if(v<=800000)faixas['500k-800k']++;
      else if(v<=1500000)faixas['800k-1.5M']++;
      else faixas['acima 1.5M']++;
    });
    const fmt=v=>'R$ '+v.toLocaleString('pt-BR');
    const faixaLista=Object.entries(faixas).filter(([,n])=>n>0).map(([f,n])=>'• '+f+': '+n+' lead'+(n>1?'s':'')).join('<br>');
    return '💰 <strong>Faixa de valor das leads:</strong><br><br>Mínimo: <strong>'+fmt(min)+'</strong><br>Médio: <strong>'+fmt(med)+'</strong><br>Máximo: <strong>'+fmt(max)+'</strong><br><br>'+faixaLista+'<br><br>'+chip('Bairros mais buscados','demanda por bairro')+chip('Tipos mais buscados','tipo mais buscado');
  }
  // OFERTA VS DEMANDA padrão
  const bl={};leads.forEach(l=>{if(l.bairro)bl[l.bairro]=(bl[l.bairro]||0)+1;});
  const bi={};imoveis.filter(i=>i.status!=='inativo').forEach(i=>{if(i.bairro)bi[i.bairro]=(bi[i.bairro]||0)+1;});
  const top=Object.entries(bl).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if(!top.length) return 'Sem dados de mercado ainda.<br><br>'+btn('Importar leads','/app-importar-leads');
  return '📊 <strong>Inteligência de mercado — oferta vs demanda:</strong><br><br>'+top.map(([b,dem])=>{const of=bi[b]||0;const st=of===0?'🔴 sem imóvel':of<dem?'🟡 pouca oferta':'🟢 equilibrado';return '• <strong>'+b+'</strong>: '+dem+' leads · '+of+' imóveis — '+st;}).join('<br>')+'<br><br>'+chip('Oportunidades','oportunidade de captacao')+chip('Faixa de valor','faixa de valor das leads')+chip('Tipos mais buscados','tipo mais buscado');
}
module.exports = { responder };
