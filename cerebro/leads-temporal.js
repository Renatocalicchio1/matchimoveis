'use strict';

function responder(mNorm, leads, btn, chip) {
  const agora = new Date();
  const hoje  = agora.toLocaleDateString('pt-BR');

  // LEADS DE HOJE
  if (/hoje|entraram hoje|chegaram hoje|novas hoje/.test(mNorm)) {
    const novas = leads.filter(l => {
      const d = l.dataCriacao||l.createdAt||l.data||'';
      return d.includes(hoje) || (d && new Date(d).toLocaleDateString('pt-BR')===hoje);
    });
    if (!novas.length) return `Nenhuma lead chegou hoje ainda. 📋<br><br>${chip('👥 Todas as leads','minhas leads')}`;
    return `📋 <strong>${novas.length} lead(s) hoje:</strong><br>`+
      novas.slice(0,8).map(l=>`• ${l.nome||l.name||'Lead'} — ${l.bairro||''} ${l.tipo||''}`).join('<br>')+
      `<br><br>${btn('Ver todas','app/leads')}`;
  }

  // LEADS QUENTES (com match + sem visita)
  if (/quente|mais chance|interessado|prioridade|atender primeiro/.test(mNorm)) {
    const quentes = leads.filter(l=>l.matchesBase&&l.matchesBase.length>0)
      .sort((a,b)=>(b.matchesBase?.length||0)-(a.matchesBase?.length||0))
      .slice(0,8);
    if (!quentes.length) return `Nenhuma lead com match ainda. Faça o match primeiro!<br><br>${btn('Fazer match','/app/leads')}`;
    return `🔥 <strong>Leads mais quentes:</strong><br>`+
      quentes.map((l,i)=>`${i+1}. ${l.nome||l.name||'Lead'} — ${l.bairro||''} ${l.tipo||''} · ${l.matchesBase?.length||0} match(es)`).join('<br>')+
      `<br><br>${btn('Ver leads','/app/leads?filtro=com_match')}`;
  }

  // LEADS FRIAS (sem contato há muito tempo)
  if (/fria|frio|esfriou|esquecida|parada|sem contato|abandonada/.test(mNorm)) {
    const limite = new Date(agora - 15*24*60*60*1000);
    const frias = leads.filter(l => {
      const d = l.dataCriacao||l.createdAt||l.data||'';
      return d && new Date(d) < limite && (!l.matchesBase||!l.matchesBase.length);
    }).slice(0,8);
    if (!frias.length) return `Nenhuma lead fria detectada. Boa gestão! ✅`;
    return `🥶 <strong>${frias.length} leads frias</strong> (sem match há 15+ dias):<br>`+
      frias.map(l=>`• ${l.nome||l.name||'Lead'} — ${l.bairro||''} ${l.tipo||''}`).join('<br>')+
      `<br><br>${chip('🎯 Fazer match','fazer match agora')}${btn('Ver leads','/app/leads')}`;
  }

  // REATIVAR LEADS
  if (/reativar|reengajar|recuperar|voltar a contatar/.test(mNorm)) {
    const reativar = leads.filter(l=>!l.matchesBase||!l.matchesBase.length).slice(0,6);
    if (!reativar.length) return `Todas as leads têm match! Nada para reativar. ✅`;
    return `♻️ <strong>${reativar.length} leads para reativar:</strong><br>`+
      reativar.map(l=>`• ${l.nome||l.name||'Lead'} — ${l.bairro||''} ${l.tipo||''}`).join('<br>')+
      `<br><br>Envie a vitrine ou faça o match agora!<br>${btn('Ver leads','/app/leads')}${chip('🎯 Fazer match','fazer match agora')}`;
  }

  // BUSCA POR NOME
  const nomeMatch = mNorm.match(/(?:lead|cliente|contato|buscar|procurar|encontrar|onde esta)\s+([a-z]{3,})/);
  if (nomeMatch) {
    const nome = nomeMatch[1];
    const encontrados = leads.filter(l=>{
      const n = (l.nome||l.name||'').toLowerCase();
      return n.includes(nome);
    });
    if (!encontrados.length) return `Não encontrei lead com nome "${nome}". Verifique na lista completa.<br><br>${btn('Ver leads','/app/leads')}`;
    return `🔍 <strong>${encontrados.length} lead(s) encontrada(s):</strong><br>`+
      encontrados.slice(0,5).map(l=>`• <strong>${l.nome||l.name}</strong> — ${l.bairro||''} ${l.tipo||''} ${l.telefone?'📱'+l.telefone:''}`).join('<br>')+
      `<br><br>${btn('Ver leads','/app/leads')}`;
  }

  // SEM RESPOSTA
  if (/sem resposta|nao respondeu|sem retorno|visualizou/.test(mNorm)) {
    return `📋 Leads sem resposta aparecem na lista com status pendente.<br><br>${btn('Ver leads','/app/leads')}${chip('⏳ Visitas pendentes','visitas pendentes')}`;
  }

  return null;
}

module.exports = { responder };
