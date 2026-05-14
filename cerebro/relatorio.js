'use strict';
function gerarSemanal(d, leads, imoveis, visitas, btn) {
  const agora=new Date();
  const taxa=d.leads>0?Math.round(d.comMatch/d.leads*100):0;
  const semanaAtras=new Date(agora-7*86400000);
  const mesAtras=new Date(agora-30*86400000);
  const leadsNovas=leads.filter(l=>{const dt=l.createdAt||l.dataCriacao||l.data||'';return dt&&new Date(dt)>=semanaAtras;}).length;
  const leadsMes=leads.filter(l=>{const dt=l.createdAt||l.dataCriacao||l.data||'';return dt&&new Date(dt)>=mesAtras;}).length;
  const bl={};leads.forEach(l=>{if(l.bairro)bl[l.bairro]=(bl[l.bairro]||0)+1;});
  const topBairros=Object.entries(bl).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([b,n])=>b+' ('+n+')').join(', ');
  const tipos={};leads.forEach(l=>{if(l.tipo)tipos[l.tipo]=(tipos[l.tipo]||0)+1;});
  const topTipos=Object.entries(tipos).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,n])=>t+' ('+n+')').join(', ');
  const vals=leads.filter(l=>l.valor_imovel>0).map(l=>Number(l.valor_imovel));
  const ticketMedio=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;
  const idsComMatch=new Set(leads.flatMap(l=>(l.matchesBase||[]).map(m=>m.id||m._id)));
  const parados=imoveis.filter(i=>i.status!=='inativo'&&!idsComMatch.has(i.id||i._id)).length;
  const semFoto=imoveis.filter(i=>i.status!=='inativo'&&(!i.fotos||i.fotos.length===0)).length;
  const semProp=imoveis.filter(i=>i.status!=='inativo'&&(!i.proprietario||!i.proprietario.telefone)).length;
  const data=agora.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
  return '📊 <strong>Relatório — '+data+'</strong><br><br>'+
    '<strong>🏠 Carteira:</strong><br>• Ativos: '+d.ativos+' · Inativos: '+d.inativos+'<br>• Sem match: '+parados+' · Sem foto: '+semFoto+' · Sem proprietário: '+semProp+'<br><br>'+
    '<strong>👥 Leads:</strong><br>• Total: '+d.leads+' · Com match: '+d.comMatch+' ('+taxa+'%)<br>• Novas esta semana: '+leadsNovas+' · Mês: '+leadsMes+'<br>• Bairros mais buscados: '+(topBairros||'—')+'<br>• Tipos mais buscados: '+(topTipos||'—')+'<br>'+(ticketMedio?'• Ticket médio: R$ '+ticketMedio.toLocaleString('pt-BR'):'')+'<br><br>'+
    '<strong>📅 Visitas:</strong><br>• Total: '+d.visitas+' · Confirmadas: '+d.confirmadas+' · Pendentes: '+d.pendentes+'<br><br>'+
    '<strong>💡 Ações recomendadas:</strong><br>'+
    (parados>0?'• '+parados+' imóveis sem lead compatível — importe leads ou revise bairros<br>':'')+
    (semFoto>0?'• '+semFoto+' imóveis sem foto — portais rejeitam<br>':'')+
    (semProp>0?'• '+semProp+' imóveis sem proprietário — vincule para confirmar visitas<br>':'')+
    (taxa<40&&d.leads>5?'• Taxa de match '+taxa+'% — importe mais imóveis nos bairros certos<br>':'')+
    '<br>'+btn('Ver leads','/app/leads')+btn('Ver imóveis','/app/imoveis');
}
module.exports = { gerarSemanal };
