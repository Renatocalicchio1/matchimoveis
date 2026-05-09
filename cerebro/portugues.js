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
      r.slice(0,5).map(i=>'<div style="margin:4px 0">- <strong>'+(i.tipo||'Imóvel')+'</strong> '+(i.quartos?i.quartos+'q ':'')+'— '+(i.bairro||'')+' · <strong>'+fmtVal(i.valor)+'</strong>'+(i.idExterno?'<br><a href="/imovel/'+i.idExterno+'" target="_blank" style="font-size:12px;color:#ff385c">🔗 Ver imóvel</a>':'')+'</div>').join('')+
      (r.length>5?'<br><em>...e mais '+(r.length-5)+'</em>':'')+
      '<br><br>'+btn('Ver todos','/app/imoveis');
  }


  // ── LEADS COM VITRINE ────────────────────────────────────────────────────────
  if (/leads? (com|que tem|que gerou|que tem|com) vitrine|vitrine gerada|quais (leads?|clientes?) (tem|gerou|com) vitrine|leads? (que|com) link/.test(m)) {
    const comVitrine = leads.filter(l => l.matchesBase && l.matchesBase.length > 0);
    if (!comVitrine.length) return 'Nenhuma lead tem vitrine ainda. Faça o match primeiro.<br><br>'+btn('Ver leads','/app/leads');
    return '🔗 <strong>'+comVitrine.length+' lead(s) com vitrine disponível:</strong><br><br>'+
      comVitrine.slice(0,8).map(l=>'<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin:3px 0">'+
        '<strong>'+(l.nome||l.email||'Lead')+'</strong>'+(l.bairro?' — '+l.bairro:'')+' · '+l.matchesBase.length+' imóvel(is)<br>'+
        '<a href="/cliente/oferta/'+l.id+'" style="font-size:12px;color:#ff385c" target="_blank">🔗 /cliente/oferta/'+l.id+'</a>'+
      '</div>').join('')+
      (comVitrine.length>8?'<br><em>...e mais '+(comVitrine.length-8)+'</em>':'')+
      '<br>'+btn('Ver todas as leads','/app/leads');
  }

  // ── LEADS SEM VITRINE (com match mas sem visita) ──────────────────────────
  if (/leads? (sem|que nao|ainda nao) (viram|receberam|acessaram|tem) vitrine|nao enviou vitrine|faltam enviar vitrine/.test(m)) {
    const semVisita = leads.filter(l => l.matchesBase && l.matchesBase.length > 0 &&
      (!visitas || !visitas.some(v => String(v.leadId||'') === String(l.id||''))));
    if (!semVisita.length) return '🎉 Todas as leads com match já têm visita agendada!';
    return '📤 <strong>'+semVisita.length+' lead(s) com vitrine mas sem visita ainda:</strong><br><br>'+
      semVisita.slice(0,6).map(l=>'<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin:3px 0">'+
        '<strong>'+(l.nome||l.email||'Lead')+'</strong>'+(l.bairro?' — '+l.bairro:'')+
        '<br><a href="/cliente/oferta/'+l.id+'" style="font-size:12px;color:#ff385c">🔗 Enviar vitrine</a>'+
      '</div>').join('')+
      '<br>'+btn('Ver leads','/app/leads');
  }

  // ── VISITAS AGUARDANDO PROPRIETÁRIO ──────────────────────────────────────
  if (/visitas? (falta|aguarda|espera|pendente|proprietario ainda|que o proprietario|sem resposta do proprietario|nao aceitou|nao confirmou)|proprietario (nao|ainda nao) (aceitou|confirmou|respondeu)/.test(m)) {
    const pendentes = visitas.filter(v => v.status === 'solicitada' || v.status === 'pendente');
    if (!pendentes.length) return '🎉 Nenhuma visita aguardando proprietário! Tudo em dia.'+btn('Ver visitas','/app/visitas');
    return '⏳ <strong>'+pendentes.length+' visita(s) aguardando proprietário:</strong><br><br>'+
      pendentes.slice(0,6).map(v=>'<div style="background:#fff8f0;border-radius:8px;padding:8px 12px;margin:3px 0;border-left:3px solid #f59e0b">'+
        '👤 <strong>'+(v.nome||v.cliente?.nome||v.leadNome||'Cliente')+'</strong><br>'+
        '🏠 '+(v.imovelTitulo||v.imovel?.tipo||'Imóvel')+(v.imovelBairro?' em '+v.imovelBairro:'')+
        (v.dataVisita?'<br>📅 '+v.dataVisita+(v.horaVisita?' às '+v.horaVisita:''):'')+
      '</div>').join('')+
      '<br>'+btn('Ver visitas','/app/visitas')+chip('Confirmar visitas','visitas pendentes');
  }

  // ── VISITAS CONFIRMADAS ───────────────────────────────────────────────────
  if (/visitas? confirmadas?|quais (visitas?|agendamentos?) (foram|estao) confirmad/.test(m)) {
    const conf = visitas.filter(v => v.status === 'confirmada');
    if (!conf.length) return 'Nenhuma visita confirmada ainda.'+btn('Ver visitas','/app/visitas');
    return '✅ <strong>'+conf.length+' visita(s) confirmada(s):</strong><br><br>'+
      conf.slice(0,6).map(v=>'<div style="background:#f0fdf4;border-radius:8px;padding:8px 12px;margin:3px 0;border-left:3px solid #22c55e">'+
        '👤 <strong>'+(v.nome||v.leadNome||'Cliente')+'</strong><br>'+
        '🏠 '+(v.imovelTitulo||'Imóvel')+(v.imovelBairro?' em '+v.imovelBairro:'')+
        (v.dataVisita?'<br>📅 '+v.dataVisita+(v.horaVisita?' às '+v.horaVisita:''):'')+
      '</div>').join('')+
      '<br>'+btn('Ver visitas','/app/visitas');
  }

  // ── IMÓVEIS PARADOS (sem visita há 30+ dias) ──────────────────────────────
  if (/imoveis? parados?|sem visita ha|imoveis? sem movimento|imoveis? encalhados?|parado sem visita/.test(m)) {
    const visitadosIds = new Set((visitas||[]).map(v=>String(v.imovelId||'')).filter(Boolean));
    const parados = imoveis.filter(i => i.status !== 'inativo' && !visitadosIds.has(String(i.id||i.idExterno||'')));
    if (!parados.length) return '🎉 Todos os imóveis ativos já tiveram visita!';
    return '📉 <strong>'+parados.length+' imóvel(is) ativo(s) sem visita:</strong><br><br>'+
      parados.slice(0,6).map(i=>'<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin:3px 0">'+
        '<strong>'+(i.tipo||'Imóvel')+'</strong> '+(i.quartos?i.quartos+'q ':'')+'— '+(i.bairro||'-')+
        (i.valor?' · R$ '+Number(i.valor).toLocaleString('pt-BR'):'')+
      '</div>').join('')+
      '<br>'+btn('Ver imóveis','/app/imoveis')+chip('Reduzir valor','valor medio da carteira');
  }

  // ── IMÓVEIS SEM FOTO ──────────────────────────────────────────────────────
  if (/imoveis? (sem|sem nenhuma|sem) foto|sem imagem|nao tem foto|falta foto/.test(m)) {
    const semFoto = imoveis.filter(i => i.status !== 'inativo' && (!i.fotos || i.fotos.length === 0));
    if (!semFoto.length) return '📸 Todos os imóveis ativos têm foto! 👏';
    return '📸 <strong>'+semFoto.length+' imóvel(is) sem foto:</strong><br><br>'+
      semFoto.slice(0,6).map(i=>'• <strong>'+(i.tipo||'Imóvel')+'</strong> — '+(i.bairro||'-')+(i.valor?' · R$ '+Number(i.valor).toLocaleString('pt-BR'):'')).join('<br>')+
      '<br><br>💡 Portais como VivaReal e ZAP rejeitam imóveis sem foto.<br>'+btn('Ver imóveis','/app/imoveis');
  }

  // ── BAIRROS COM LEAD MAS SEM IMÓVEL ──────────────────────────────────────
  if (/bairros? (sem imovel|que nao tem imovel|com lead mas sem|nao cobertos?|falta imovel)|oportunidade de captacao|onde falta imovel/.test(m)) {
    const bairrosLeads = {};
    leads.forEach(l => { if(l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
    const bairrosIm = new Set(imoveis.filter(i=>i.status!=='inativo').map(i=>i.bairro).filter(Boolean));
    const oportunidades = Object.entries(bairrosLeads)
      .filter(([b]) => !bairrosIm.has(b))
      .sort((a,b)=>b[1]-a[1]).slice(0,8);
    if (!oportunidades.length) return '🎉 Você tem imóveis em todos os bairros demandados!';
    return '🚨 <strong>Oportunidades de captação — bairros com demanda mas sem imóvel:</strong><br><br>'+
      oportunidades.map(([b,n],i)=>(i+1)+'. <strong>'+b+'</strong> — '+n+' lead'+(n>1?'s':'')+' sem opção').join('<br>')+
      '<br><br>💡 Capte imóveis nesses bairros para fechar mais negócios!<br>'+btn('Ver leads','/app/leads')+chip('Demanda por bairro','demanda por bairro');
  }

  // ── QUAL LEAD TEM MAIS MATCH ──────────────────────────────────────────────
  if (/lead (com mais|que tem mais) (match|opcoes|imoveis?)|mais (match|opcoes) para qual lead|ranking de match/.test(m)) {
    const ranking = leads
      .filter(l => l.matchesBase && l.matchesBase.length > 0)
      .sort((a,b)=>(b.matchesBase?.length||0)-(a.matchesBase?.length||0))
      .slice(0,6);
    if (!ranking.length) return 'Nenhuma lead com match ainda.'+btn('Ver leads','/app/leads');
    return '🏆 <strong>Leads com mais opções de imóvel:</strong><br><br>'+
      ranking.map((l,i)=>(i+1)+'. <strong>'+(l.nome||l.email||'Lead')+'</strong>'+(l.bairro?' — '+l.bairro:'')+' · <strong>'+l.matchesBase.length+' imóvel(is)</strong>').join('<br>')+
      '<br><br>'+btn('Ver leads','/app/leads')+chip('Enviar vitrine','enviar vitrine para cliente');
  }

  // ── LEADS QUENTES (com match + visita solicitada) ─────────────────────────
  if (/leads? quentes?|leads? mais (interessadas?|avancadas?|proximas?)|prontas? para fechar|mais chances?/.test(m)) {
    const quentes = leads.filter(l => {
      const temMatch = l.matchesBase && l.matchesBase.length > 0;
      const temVisita = visitas && visitas.some(v => String(v.leadId||'') === String(l.id||''));
      return temMatch && temVisita;
    });
    const mornos = leads.filter(l => l.matchesBase && l.matchesBase.length > 0 &&
      (!visitas || !visitas.some(v => String(v.leadId||'') === String(l.id||''))));
    let resp = '';
    if (quentes.length) {
      resp += '🔥 <strong>'+quentes.length+' lead(s) QUENTE(S) — match + visita:</strong><br><br>'+
        quentes.slice(0,4).map(l=>'<div style="background:#fff8f0;border-radius:8px;padding:8px 12px;margin:3px 0;border-left:3px solid #ff385c">'+
          '👤 <strong>'+(l.nome||l.email||'Lead')+'</strong>'+(l.bairro?' — '+l.bairro:'')+
          '<br><a href="/cliente/oferta/'+l.id+'" style="font-size:12px;color:#ff385c">🔗 Vitrine</a>'+
        '</div>').join('');
    }
    if (mornos.length) {
      resp += '<br>🟡 <strong>'+mornos.length+' lead(s) MORNA(S) — match mas sem visita:</strong><br><br>'+
        mornos.slice(0,3).map(l=>'• '+(l.nome||l.email||'Lead')+(l.bairro?' — '+l.bairro:'')).join('<br>');
    }
    if (!resp) return 'Nenhuma lead com match ainda.'+btn('Ver leads','/app/leads');
    return resp+'<br><br>'+btn('Ver leads','/app/leads');
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
