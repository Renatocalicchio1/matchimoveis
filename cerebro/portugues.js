'use strict';
const nlp = require('./nlp');
const PADROES = [
  {id:'cliente_busca',regex:/(?:tenho|meu|um|uma|o)?\s*(?:cliente|comprador|interessado)\s*(?:que\s*)?(?:quer|querendo|procura|procurando|busca|buscando|precisa|interessad)/,handler:'buscar_imovel'},
  {id:'cliente_nao_gostou',regex:/cliente\s*(?:nao\s*gostou|nao\s*curtiu|nao\s*aprovou|nao\s*quis|recusou)/,handler:'cliente_nao_gostou'},
  {id:'cliente_gostou',regex:/cliente\s*(?:gostou|aprovou|curtiu|adorou|quer\s*fechar|topou)/,handler:'cliente_gostou'},
  {id:'enviei_vitrine',regex:/(?:ja\s*)?enviei\s*(?:a\s*)?vitrine|mandei\s*(?:a\s*)?vitrine/,handler:'enviei_vitrine'},
  {id:'proxima_visita',regex:/proxima\s*visita|quando\s*(?:e|é|sera)\s*(?:a\s*)?visita|visita\s*(?:e|é)\s*quando/,handler:'proxima_visita'},
  {id:'mais_barato',regex:/mais\s*barato|valor\s*menor|algo\s*mais\s*em\s*conta|menos\s*caro/,handler:'busca_mais_barato'},
  {id:'tem_imovel',regex:/tem\s*(?:algum|algo|imovel|apartamento|casa|cobertura)\s*(?:em|no|na|para|disponivel)?/,handler:'buscar_imovel'},
  {id:'nao_consigo',regex:/nao\s*consigo|nao\s*funciona|esta\s*dando\s*erro|nao\s*aparece/,handler:'problema'},
];
function extrairEntidades(mNorm, bairros) {
  const e={};
  const bNorm=mNorm.replace(/[̀-ͯ]/g,"");const b=(bairros||[]).find(b=>bNorm.includes(b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
  if(b)e.bairro=b; else { const bairroMatch=mNorm.match(/ems+([a-z]+(?:s+[a-z]+)?)/); if(bairroMatch)e.bairroTexto=bairroMatch[1]; }
  const tipos=['apartamento','apto','casa','cobertura','terreno','sobrado','studio'];
  const t=tipos.find(t=>mNorm.includes(t));
  if(t)e.tipo=t==='apto'?'apartamento':t;
  const q=mNorm.match(/(\d+)\s*(?:quarto|dorm)/);
  if(q)e.quartos=parseInt(q[1]);
  const v=mNorm.match(/(\d+(?:[.,]\d+)?)\s*(mil|k)?/);
  if(v){let val=parseFloat(v[1].replace(',','.'));if(v[2])val*=1000;if(val>10000)e.valorMax=val;}
  return e;
}
function gerarResposta(handler, e, d, imoveis, leads, visitas, btn, chip) {
  if(handler==='buscar_imovel'){
    let r=imoveis.filter(i=>i.status!=='inativo');
    if(e.tipo)r=r.filter(i=>i.tipo&&i.tipo.toLowerCase().includes(e.tipo=="apto"?"apartamento":e.tipo));
    if(e.bairro)r=r.filter(i=>i.bairro&&i.bairro.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").includes(e.bairro.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")));
    if(e.quartos)r=r.filter(i=>i.quartos&&parseInt(i.quartos)>=e.quartos);
    if(e.valorMax)r=r.filter(i=>i.valor&&parseFloat(i.valor)<=e.valorMax);
    if(!r.length)return 'Nao encontrei imoveis'+(e.tipo?' do tipo '+e.tipo:'')+(e.bairro?' em '+e.bairro:'')+' na carteira.<br><br>'+chip('Ver demanda','demanda por bairro')+btn('Ver imoveis','/app/imoveis');
    return 'Encontrei <strong>'+r.length+' imovel(is)</strong>'+(e.bairro?' em '+e.bairro:'')+':<br>'+r.slice(0,5).map(i=>'- '+(i.tipo||'Imovel')+(i.quartos?' '+i.quartos+'q':'')+' em '+(i.bairro||'-')+(i.valor?' R$'+Number(i.valor).toLocaleString('pt-BR'):'')).join('<br>')+'<br><br>'+btn('Ver todos','/app/imoveis')+chip('Enviar vitrine','enviar vitrine');
  }
  if(handler==='cliente_nao_gostou')return 'Sem problema! Temos outras opcoes.<br><br>'+chip('Buscar outro','meus imoveis')+btn('Ver imoveis','/app/imoveis');
  if(handler==='cliente_gostou')return 'Otimo! Proximo passo: agendar a visita.<br><br>'+btn('Ver visitas','/app/visitas');
  if(handler==='enviei_vitrine')return 'Vitrine enviada! Aguarde o cliente escolher e solicitar visita.<br><br>'+btn('Ver visitas','/app/visitas');
  if(handler==='proxima_visita'){
    if(d.hoje>0)return 'Voce tem <strong>'+d.hoje+' visita(s) hoje</strong>.<br><br>'+btn('Ver visitas','/app/visitas');
    if(d.confirmadas>0)return 'Voce tem <strong>'+d.confirmadas+' visita(s) confirmada(s)</strong>.<br><br>'+btn('Ver visitas','/app/visitas');
    return 'Nenhuma visita agendada ainda.<br><br>'+btn('Ver visitas','/app/visitas');
  }
  if(handler==='busca_mais_barato'){
    const r=imoveis.filter(i=>i.status!=='inativo'&&i.valor).sort((a,b)=>a.valor-b.valor).slice(0,5);
    if(!r.length)return 'Sem imoveis com valor cadastrado.';
    return 'Opcoes mais em conta:<br>'+r.map(i=>'- '+(i.tipo||'Imovel')+' em '+(i.bairro||'-')+' R$'+Number(i.valor).toLocaleString('pt-BR')).join('<br>')+'<br><br>'+btn('Ver todos','/app/imoveis');
  }
  if(handler==='problema')return 'Entendi que algo nao esta funcionando.<br><br>'+chip('XML nao atualizou','meu xml nao atualizou')+chip('Portal rejeitou','portal rejeitou imovel')+chip('Sem match','por que nao deu match');
  return null;
}

// ── PADRÕES EXTRAS BASEADOS NO HISTÓRICO REAL ─────────────────────────────────
function interpretarExtra(mensagem, d, imoveis, leads, visitas, btn, chip) {
  const nlp = require('./nlp');
  const m = nlp.normalizar(mensagem);

  // "filtros" sozinho
  if (/^filtros?$/.test(m.trim()))
    return '🔍 Filtros disponíveis em cada página:<br><br>' +
      '<strong>Imóveis:</strong> tipo, bairro, valor, quartos, vagas, status, proprietário<br>' +
      '<strong>Leads:</strong> status, bairro, tipo, match, data<br>' +
      '<strong>Visitas:</strong> status, data, cliente<br><br>' +
      btn('Ver imóveis','/app/imoveis') + btn('Ver leads','/app/leads');

  // "me fale mais da app" / "o que ela faz"
  if (/me fale mais|o que ela faz|o que o sistema|me conta mais|como funciona o sistema|o que voce sabe fazer/.test(m))
    return '🏠 <strong>MatchImóveis</strong> é um CRM inteligente para corretores:<br><br>' +
      '🏠 <strong>Imóveis</strong> — importe via XML, gerencie sua carteira, gere feed para portais<br>' +
      '👥 <strong>Leads</strong> — importe clientes, extraia perfil, faça match<br>' +
      '🎯 <strong>Match</strong> — cruza bairro+tipo+quartos automaticamente<br>' +
      '🔗 <strong>Vitrine</strong> — página personalizada para o cliente agendar visita<br>' +
      '📅 <strong>Visitas</strong> — agende, confirme e acompanhe<br>' +
      '🦖 <strong>Portais</strong> — gere XML para VivaReal, ZAP, OLX e mais<br>' +
      '🤖 <strong>Assistente</strong> — sou eu! Seu CRM por conversa<br><br>' +
      btn('Dashboard','/app-home') + chip('O que fazer hoje','o que devo fazer hoje');

  // "porque nao esta salvando" / memoria
  if (/porque nao esta salvando|nao salva|perdeu o historico|sumir as mensagens|onde paramos|continuar de onde/.test(m))
    return '💾 <strong>Sobre a memória do chat:</strong><br><br>' +
      'Salvo o histórico em <code>assistente-memoria.json</code>. Porém cada sessão começa visualmente do zero — as mensagens anteriores não aparecem na tela.<br><br>' +
      '💡 Para continuar de onde parou, me conte o contexto e eu retomo!<br><br>' +
      chip('O que fazer hoje','o que devo fazer hoje') + chip('Resumo geral','resumo geral');

  // "dicas pra hoje" / "onde posso melhorar"
  if (/dicas (pra|para) hoje|onde (posso |eu )?melhorar|como melhorar|minha performance|meu desempenho/.test(m)) {
    const dicas = [];
    const semMatch = leads.filter(l => !(l.matchesBase && l.matchesBase.length > 0));
    const semProp  = imoveis.filter(i => i.status!=='inativo' && (!i.proprietario||!i.proprietario.nome));
    const semFoto  = imoveis.filter(i => i.status!=='inativo' && (!i.fotos||i.fotos.length===0));
    if (semMatch.length) dicas.push('📋 <strong>'+semMatch.length+' leads sem match</strong> — verifique bairros certos '+chip('Demanda por bairro','demanda por bairro'));
    if (semProp.length)  dicas.push('👤 <strong>'+semProp.length+' imóveis sem proprietário</strong> '+chip('Ver','imoveis sem proprietario'));
    if (semFoto.length)  dicas.push('📸 <strong>'+semFoto.length+' imóveis sem foto</strong> — portais rejeitam');
    if (!dicas.length) return '🎉 Tudo em ordem! Nenhuma melhoria urgente agora.'+chip('Resumo','resumo geral');
    return '💡 <strong>Onde melhorar agora:</strong><br><br>'+dicas.join('<br><br>')+'<br><br>'+btn('Dashboard','/app-home');
  }

  // "ate 300k" / "imoveis ate X" / "buscar por valor"
  if (/buscar por valor|filtrar por valor|imoveis? (ate|abaixo|menos de)|^ate d/.test(m)) {
    const vM   = m.match(/ates+(d+[,.]?d*)s*milh/);
    const vMil = m.match(/ates+(d+[,.]?d*)s*mil/);
    const vK   = m.match(/ates+(d+[,.]?d*)s*k/);
    const vNum = m.match(/ates+(d[d.,]+)/);
    let valorMax = null;
    if (vM)        valorMax = parseFloat(vM[1].replace(',','.')) * 1000000;
    else if (vMil) valorMax = parseFloat(vMil[1].replace(',','.')) * 1000;
    else if (vK)   valorMax = parseFloat(vK[1].replace(',','.')) * 1000;
    else if (vNum) valorMax = parseFloat(vNum[1].replace(/./g,'').replace(',','.'));
    if (!valorMax) return 'Qual valor máximo?<br><br>'+chip('Até 300k','imoveis ate 300 mil')+chip('Até 500k','imoveis ate 500 mil')+chip('Até 800k','imoveis ate 800 mil');
    const r = imoveis.filter(i=>i.status!=='inativo'&&i.valor&&Number(i.valor)<=valorMax).sort((a,b)=>Number(a.valor)-Number(b.valor));
    if (!r.length) return '😔 Nenhum imóvel ativo até R$ '+valorMax.toLocaleString('pt-BR')+'.'+btn('Ver todos','/app/imoveis');
    const fmtVal = v => 'R$ '+Number(v).toLocaleString('pt-BR');
    return '🔍 <strong>'+r.length+' imóvel(is) até '+fmtVal(valorMax)+':</strong><br><br>'+
      r.slice(0,5).map(i=>'- <strong>'+(i.tipo||'Imóvel')+'</strong> '+(i.quartos?i.quartos+'q':'')+' — '+(i.bairro||'')+' · <strong>'+fmtVal(i.valor)+'</strong>').join('<br>')+
      (r.length>5?'<br><em>...e mais '+(r.length-5)+'</em>':'')+
      '<br><br>'+btn('Ver todos','/app/imoveis');
  }

  return null;
}
function interpretar(mensagem, d, imoveis, leads, visitas, btn, chip) {
  const extra = interpretarExtra(mensagem, d, imoveis, leads, visitas, btn, chip);
  if (extra) return extra;
  const mNorm=nlp.normalizar(mensagem);
  const padrao=PADROES.find(p=>p.regex.test(mNorm));
  if(!padrao)return null;
  const e=extrairEntidades(mNorm,d.bairros||[]);
  return gerarResposta(padrao.handler,e,d,imoveis,leads,visitas,btn,chip);
}
module.exports={interpretar,PADROES};
