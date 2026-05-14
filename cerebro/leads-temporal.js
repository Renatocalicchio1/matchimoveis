'use strict';
function responder(mNorm, leads, btn, chip) {
  const agora = new Date();
  const hoje = agora.toLocaleDateString('pt-BR');
  const ontem = new Date(agora-86400000).toLocaleDateString('pt-BR');
  const semanaAtras = new Date(agora-7*86400000);
  const mesAtras = new Date(agora-30*86400000);
  const isHoje = d => d&&(d.includes(hoje)||(d&&new Date(d).toLocaleDateString('pt-BR')===hoje));
  const isOntem = d => d&&new Date(d).toLocaleDateString('pt-BR')===ontem;
  const isSemana = d => d&&new Date(d)>=semanaAtras;
  const isMes = d => d&&new Date(d)>=mesAtras;
  const getDate = l => l.dataCriacao||l.createdAt||l.data||'';

  // HOJE
  if(/hoje|entraram hoje|chegaram hoje|novas hoje|novidades hoje/.test(mNorm)) {
    const novas=leads.filter(l=>isHoje(getDate(l)));
    if(!novas.length) return 'Nenhuma lead chegou hoje ainda. Ative os portais para receber leads automaticamente!<br><br>'+chip('Ver portais','ver portais')+chip('Todas as leads','minhas leads');
    return '📋 <strong>'+novas.length+' lead(s) hoje:</strong><br><br>'+novas.slice(0,8).map(l=>'<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin:3px 0">👤 <strong>'+(l.nome||l.name||'Lead')+'</strong>'+(l.bairro?' — '+l.bairro:'')+' '+(l.tipo||'')+(l.telefone||l.contato?'<br>📱 '+(l.telefone||l.contato):'')+'</div>').join('')+'<br>'+btn('Ver todas','/app/leads');
  }

  // ONTEM
  if(/ontem|chegaram ontem|entraram ontem/.test(mNorm)) {
    const deOntem=leads.filter(l=>isOntem(getDate(l)));
    if(!deOntem.length) return 'Nenhuma lead chegou ontem.'+chip('Ver leads hoje','leads de hoje');
    return '📋 <strong>'+deOntem.length+' lead(s) de ontem:</strong><br><br>'+deOntem.slice(0,8).map(l=>'• <strong>'+(l.nome||l.name||'Lead')+'</strong>'+(l.bairro?' — '+l.bairro:'')).join('<br>')+'<br><br>'+btn('Ver todas','/app/leads');
  }

  // SEMANA
  if(/semana|essa semana|da semana|nos ultimos 7|ultimos 7 dias/.test(mNorm)) {
    const daSemana=leads.filter(l=>isSemana(getDate(l)));
    const comMatch=daSemana.filter(l=>l.matchesBase&&l.matchesBase.length>0);
    if(!daSemana.length) return 'Nenhuma lead esta semana ainda.'+chip('Ver todas','minhas leads');
    return '📋 <strong>'+daSemana.length+' lead(s) esta semana:</strong><br>🎯 Com match: <strong>'+comMatch.length+'</strong><br><br>'+daSemana.slice(0,6).map(l=>'• <strong>'+(l.nome||l.name||'Lead')+'</strong>'+(l.bairro?' — '+l.bairro:'')).join('<br>')+'<br><br>'+btn('Ver todas','/app/leads');
  }

  // MÊS
  if(/mes|esse mes|do mes|no mes|ultimos 30|ultimos 30 dias/.test(mNorm)) {
    const doMes=leads.filter(l=>isMes(getDate(l)));
    const comMatch=doMes.filter(l=>l.matchesBase&&l.matchesBase.length>0);
    const taxa=doMes.length?Math.round(comMatch.length/doMes.length*100):0;
    if(!doMes.length) return 'Nenhuma lead este mês.'+chip('Ver todas','minhas leads');
    return '📋 <strong>'+doMes.length+' lead(s) este mês:</strong><br>🎯 Com match: <strong>'+comMatch.length+'</strong> ('+taxa+'%)<br><br>'+btn('Ver todas','/app/leads')+chip('Demanda do mês','demanda por bairro');
  }

  // QUENTES
  if(/quente|mais chance|interessado|prioridade|atender primeiro|mais avancada|proxima de fechar/.test(mNorm)) {
    const quentes=leads.filter(l=>l.matchesBase&&l.matchesBase.length>0).sort((a,b)=>(b.matchesBase?.length||0)-(a.matchesBase?.length||0)).slice(0,8);
    if(!quentes.length) return 'Nenhuma lead com match ainda. Faça o match primeiro!<br><br>'+btn('Fazer match','/app/leads');
    return '🔥 <strong>Leads mais quentes:</strong><br><br>'+quentes.map((l,i)=>'<div style="background:#fff8f0;border-radius:8px;padding:8px 12px;margin:3px 0;border-left:3px solid #ff385c">'+(i+1)+'. <strong>'+(l.nome||l.name||'Lead')+'</strong>'+(l.bairro?' — '+l.bairro:'')+' · <strong>'+(l.matchesBase?.length||0)+' match(es)</strong><br><a href="/cliente/oferta/'+l.id+'" style="font-size:12px;color:#ff385c">🔗 Abrir vitrine</a></div>').join('')+'<br>'+btn('Ver leads','/app/leads?filtro=com_match');
  }

  // FRIAS
  if(/fria|frio|esfriou|esquecida|parada|sem contato|abandonada|sem resposta|velha|antiga/.test(mNorm)) {
    const limite=new Date(agora-15*86400000);
    const frias=leads.filter(l=>{ const d=getDate(l); return d&&new Date(d)<limite&&(!l.matchesBase||!l.matchesBase.length); }).slice(0,8);
    if(!frias.length) return 'Nenhuma lead fria detectada. Boa gestão! ✅';
    return '🥶 <strong>'+frias.length+' leads frias</strong> (sem match há 15+ dias):<br><br>'+frias.map(l=>'• '+(l.nome||l.name||'Lead')+(l.bairro?' — '+l.bairro:'')).join('<br>')+'<br><br>'+chip('Fazer match','fazer match agora')+btn('Ver leads','/app/leads');
  }

  // REATIVAR
  if(/reativar|reengajar|recuperar|voltar a contatar|retomar/.test(mNorm)) {
    const reativar=leads.filter(l=>!l.matchesBase||!l.matchesBase.length).slice(0,6);
    if(!reativar.length) return 'Todas as leads têm match! Nada para reativar. ✅';
    return '♻️ <strong>'+reativar.length+' leads para reativar:</strong><br><br>'+reativar.map(l=>'• '+(l.nome||l.name||'Lead')+(l.bairro?' — '+l.bairro:'')).join('<br>')+'<br><br>Envie a vitrine ou faça o match!<br>'+btn('Ver leads','/app/leads')+chip('Fazer match','fazer match agora');
  }

  // BUSCA POR NOME
  const nomeMatch=mNorm.match(/(?:lead|cliente|contato|buscar|procurar|encontrar|onde esta|achar|ache)\s+([a-z]{3,})/);
  if(nomeMatch) {
    const nome=nomeMatch[1];
    const enc=leads.filter(l=>(l.nome||l.name||'').toLowerCase().includes(nome)||(l.email||'').toLowerCase().includes(nome)||(String(l.telefone||l.contato||'')).includes(nome));
    if(!enc.length) return 'Não encontrei lead com "'+nome+'".<br><br>'+btn('Ver leads','/app/leads');
    return '🔍 <strong>'+enc.length+' lead(s) encontrada(s):</strong><br><br>'+enc.slice(0,5).map(l=>'<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin:3px 0">👤 <strong>'+(l.nome||l.name)+'</strong>'+(l.bairro?' — '+l.bairro:'')+' '+(l.tipo||'')+(l.telefone||l.contato?'<br>📱 '+(l.telefone||l.contato):'')+'<br><a href="/cliente/oferta/'+l.id+'" style="font-size:12px;color:#ff385c">🔗 Vitrine</a></div>').join('')+'<br>'+btn('Ver leads','/app/leads');
  }

  // SEM RESPOSTA
  if(/sem resposta|nao respondeu|sem retorno|nao retornou/.test(mNorm)) return 'Leads sem resposta ficam com status pendente.<br><br>'+btn('Ver leads','/app/leads')+chip('Visitas pendentes','visitas pendentes');

  return null;
}
module.exports = { responder };
