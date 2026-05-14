'use strict';
function calcularScore(lead, visitas) {
  visitas = visitas || [];
  let score = 0;
  const agora = Date.now();
  const leadId = String(lead.id||lead._id||'');
  const visitasLead = visitas.filter(v=>String(v.leadId||'')===leadId);
  const temMatch = lead.matchesBase&&lead.matchesBase.length>0;
  const qtdMatch = (lead.matchesBase||[]).length;
  const temVisita = visitasLead.length>0;
  const visitaConf = visitasLead.some(v=>v.status==='confirmada');
  const visitaHoje = visitasLead.some(v=>{ const d=v.dataVisita||v.data||''; return d&&new Date(d).toDateString()===new Date().toDateString(); });
  const temNegociacao = visitasLead.some(v=>v.status==='negociacao'||v.workflowStatus==='NEGOCIACAO');
  const temProposta = visitasLead.some(v=>v.status==='proposta'||v.workflowStatus==='PROPOSTA');
  const temFechado = visitasLead.some(v=>v.status==='fechado'||v.workflowStatus==='FECHADO');
  const diasCriacao = lead.createdAt||lead.dataCriacao||lead.data;
  const diasAtras = diasCriacao?(agora-new Date(diasCriacao).getTime())/86400000:999;
  const valor = Number(lead.valor_imovel||lead.valorMax||lead.valor||0);
  const extraido = lead.extractionStatus==='ok';
  const temBairro = !!(lead.bairro&&lead.bairro.length>2);
  const temTipo = !!(lead.tipo&&lead.tipo.length>2);
  // Match
  if(temMatch) score+=40;
  if(qtdMatch>=3) score+=20;
  if(qtdMatch>=5) score+=10;
  if(qtdMatch>=10) score+=10;
  // Pipeline de visita
  if(temVisita) score+=30;
  if(visitaConf) score+=25;
  if(visitaHoje) score+=20;
  if(temNegociacao) score+=35;
  if(temProposta) score+=45;
  if(temFechado) score+=60;
  // Recência
  if(diasAtras<1) score+=25;
  else if(diasAtras<3) score+=20;
  else if(diasAtras<7) score+=15;
  else if(diasAtras<14) score+=5;
  else if(diasAtras>30) score-=15;
  else if(diasAtras>60) score-=30;
  // Valor — cliente de alto valor é mais sério
  if(valor>500000) score+=10;
  if(valor>1000000) score+=15;
  if(valor>2000000) score+=10;
  // Perfil completo
  if(extraido) score+=10;
  if(temBairro) score+=5;
  if(temTipo) score+=5;
  if(lead.quartos>0) score+=3;
  if(lead.area_m2>0) score+=3;
  // Penalidades
  if(!temBairro) score-=10;
  if(!extraido) score-=5;
  if(!temMatch&&diasAtras>15) score-=20;
  return Math.max(0,score);
}
function classificarLead(lead, visitas) {
  const s=calcularScore(lead,visitas);
  if(s>=120) return {classe:'FECHANDO',emoji:'🏆',cor:'#7c3aed',label:'Pronto para fechar'};
  if(s>=90) return {classe:'QUENTE',emoji:'🔥',cor:'#ef4444',label:'Alta prioridade'};
  if(s>=60) return {classe:'MORNA',emoji:'🟡',cor:'#f59e0b',label:'Boa chance'};
  if(s>=30) return {classe:'FRIA',emoji:'🔵',cor:'#3b82f6',label:'Acompanhar'};
  return {classe:'GELADA',emoji:'🧊',cor:'#94a3b8',label:'Reengajar'};
}
function rankingLeads(leads, visitas, n) {
  n=n||10;
  return leads.map(l=>({...l,_score:calcularScore(l,visitas),_classe:classificarLead(l,visitas)})).filter(l=>l._score>0).sort((a,b)=>b._score-a._score).slice(0,n);
}
function responder(mNorm, leads, visitas, btn, chip) {
  if(/atender primeiro|mais urgente|prioridade|mais importante|quem atendo primeiro/.test(mNorm)) {
    const ranking=rankingLeads(leads,visitas,5);
    if(!ranking.length) return 'Nenhuma lead com score. Faça o match primeiro!<br><br>'+btn('Leads','/app/leads');
    return '🎯 <strong>Atenda nessa ordem:</strong><br><br>'+ranking.map((l,i)=>l._classe.emoji+' <strong>'+(i+1)+'. '+(l.nome||l.name||'Lead')+'</strong> — '+(l.bairro||'')+' '+l._classe.label+' · <strong>'+l._score+'pts</strong>').join('<br>')+'<br><br>'+btn('Ver leads','/app/leads');
  }
  if(/chance de fechar|mais propenso|vai comprar|pronto para proposta/.test(mNorm)) {
    const ranking=rankingLeads(leads,visitas,5);
    if(!ranking.length) return 'Sem dados. Faça o match e aguarde visitas!';
    return '📊 <strong>Leads com mais chance de fechar:</strong><br><br>'+ranking.map((l,i)=>(i+1)+'. '+l._classe.emoji+' <strong>'+(l.nome||l.name||'Lead')+'</strong> — '+l._score+'pts').join('<br>')+'<br><br>'+btn('Ver leads','/app/leads');
  }
  if(/pronto para fechar|quase fechando|proposta|quer fechar/.test(mNorm)) {
    const conf=leads.filter(l=>visitas&&visitas.some(v=>String(v.leadId||'')===String(l.id||'')&&v.status==='confirmada'));
    if(!conf.length) return 'Nenhuma lead com visita confirmada ainda.'+btn('Ver visitas','/app/visitas');
    return '🏆 <strong>'+conf.length+' lead(s) com visita confirmada:</strong><br><br>'+conf.slice(0,5).map(l=>'• <strong>'+(l.nome||l.email||'Lead')+'</strong> — '+(l.bairro||'')).join('<br>')+'<br><br>'+btn('Ver leads','/app/leads');
  }
  const ranking=rankingLeads(leads,visitas,8);
  if(!ranking.length) return null;
  return '📊 <strong>Ranking de prioridade:</strong><br><br>'+ranking.map((l,i)=>(i+1)+'. '+l._classe.emoji+' <strong>'+(l.nome||l.name||'Lead')+'</strong> — '+l._score+'pts · '+(l.bairro||'')).join('<br>')+'<br><br>'+btn('Ver leads','/app/leads');
}
function responderExtra(mNorm, leads, visitas, btn, chip) {
  if(/pronto para fechar|quase fechando|proximo de fechar|proposta|quer fechar/.test(mNorm)) {
    const conf=leads.filter(l=>visitas&&visitas.some(v=>String(v.leadId||'')===String(l.id||'')&&v.status==='confirmada'));
    if(!conf.length) return 'Nenhuma lead com visita confirmada ainda.'+btn('Ver visitas','/app/visitas');
    return '🏆 <strong>'+conf.length+' lead(s) com visita confirmada:</strong><br><br>'+conf.slice(0,5).map(l=>'• <strong>'+(l.nome||l.email||'Lead')+'</strong> — '+(l.bairro||'')+' '+(l.tipo||'')).join('<br>')+'<br><br>'+btn('Ver leads','/app/leads');
  }
  return null;
}
module.exports = { calcularScore, classificarLead, rankingLeads, responder, responderExtra };
