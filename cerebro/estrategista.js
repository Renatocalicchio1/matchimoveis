'use strict';

function analisar(d, leads, imoveis, visitas, btn, chip) {
  const alertas = [], acoes = [], oportunidades = [];

  // ALERTAS CRÍTICOS
  if (d.hoje > 0) alertas.push('🔴 <strong>' + d.hoje + ' visita(s) hoje!</strong> Não perca o horário. ' + btn('Ver visitas','/app/visitas'));
  if (d.pendentes > 0) alertas.push('🟡 <strong>' + d.pendentes + ' visita(s) pendente(s)</strong> aguardando confirmação. ' + btn('Confirmar','/app/visitas'));
  
  // Leads quentes sem ação há 3+ dias
  const agora = Date.now();
  const quentesSemAcao = leads.filter(l => {
    const temMatch = l.matchesBase && l.matchesBase.length > 0;
    const temVisita = visitas && visitas.some(v => String(v.leadId||'') === String(l.id||''));
    const diasAtras = l.createdAt ? (agora - new Date(l.createdAt).getTime()) / 86400000 : 0;
    return temMatch && !temVisita && diasAtras > 3;
  });
  if (quentesSemAcao.length > 0) alertas.push('🟠 <strong>' + quentesSemAcao.length + ' lead(s) com match sem vitrine enviada há 3+ dias</strong> — risco de esfriarem!');

  // AÇÕES PRIORITÁRIAS
  if (d.ativos === 0) acoes.push('Importe seus imóveis via XML para começar. ' + btn('Importar XML','/app/imoveis'));
  else if (d.leads === 0) acoes.push('Importe leads dos portais para fazer o match. ' + btn('Importar leads','/app-importar-leads'));
  else if (d.comMatch === 0) acoes.push('Nenhuma lead tem match ainda. Faça o match! ' + btn('Fazer match','/app/leads'));

  const comMatchSemVisita = leads.filter(l => l.matchesBase && l.matchesBase.length > 0 && !visitas.some(v => String(v.leadId||'') === String(l.id||l._id||''))).length;
  if (comMatchSemVisita > 0) acoes.push('Envie a vitrine para <strong>' + comMatchSemVisita + ' leads com match</strong> que ainda não visitaram. ' + btn('Ver leads','/app/leads?filtro=com_match'));

  // Imóveis sem foto — portais rejeitam
  const semFoto = imoveis.filter(i => i.status !== 'inativo' && (!i.fotos || i.fotos.length === 0));
  if (semFoto.length > 0) acoes.push('📸 <strong>' + semFoto.length + ' imóvel(is) sem foto</strong> — portais como VivaReal rejeitam. Adicione fotos!');

  // Imóveis sem descrição
  const semDesc = imoveis.filter(i => i.status !== 'inativo' && (!i.descricao || i.descricao.length < 50));
  if (semDesc.length > 0) acoes.push('📝 <strong>' + semDesc.length + ' imóvel(is) com descrição fraca</strong> — melhore para atrair mais leads.');

  // OPORTUNIDADES DE MERCADO
  const bairrosLeads = {};
  leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro] = (bairrosLeads[l.bairro]||0)+1; });
  const bairrosIm = {};
  imoveis.filter(i=>i.status!=='inativo').forEach(i => { if (i.bairro) bairrosIm[i.bairro] = (bairrosIm[i.bairro]||0)+1; });

  Object.entries(bairrosLeads).filter(([b,n]) => n >= 3 && (!bairrosIm[b] || bairrosIm[b] < n)).sort((a,b) => b[1]-a[1]).slice(0,3).forEach(([bairro, demanda]) => {
    const oferta = bairrosIm[bairro]||0;
    oportunidades.push('💡 <strong>' + bairro + '</strong>: ' + demanda + ' leads buscando, só ' + oferta + ' imóvel(is) — capte mais aqui!');
  });

  const taxa = d.leads > 0 ? Math.round(d.comMatch/d.leads*100) : 0;
  if (taxa < 30 && d.leads > 5) oportunidades.push('📉 Taxa de match em <strong>' + taxa + '%</strong> — importe mais imóveis ou revise os bairros. ' + chip('Onde captar','oportunidade de captacao'));

  // Leads frias para reengajar
  const frias = leads.filter(l => { const dias = l.createdAt ? (agora-new Date(l.createdAt).getTime())/86400000 : 0; return dias > 15 && (!l.matchesBase||!l.matchesBase.length); });
  if (frias.length > 3) oportunidades.push('🥶 <strong>' + frias.length + ' leads frias</strong> sem match há 15+ dias — tente reengajar com nova busca. ' + chip('Ver frias','leads frias'));

  if (!alertas.length && !acoes.length && !oportunidades.length)
    return '✅ <strong>Tudo em dia!</strong> Nenhuma ação urgente agora.<br><br>' + chip('📊 Resumo','resumo do dia') + chip('📍 Mercado','demanda por bairro') + chip('🔥 Quentes','leads quentes');

  let html = '🧠 <strong>Plano de ação para hoje:</strong><br><br>';
  if (alertas.length) { html += '<strong>⚠️ Atenção agora:</strong><br>'; alertas.forEach(a => { html += '<div style="background:#fff8f0;border-left:3px solid #ef4444;border-radius:8px;padding:8px 12px;margin:4px 0">' + a + '</div>'; }); html += '<br>'; }
  if (acoes.length) { html += '<strong>✅ O que fazer:</strong><br>'; acoes.forEach((a,i) => { html += '<div style="display:flex;gap:10px;margin:6px 0;align-items:flex-start"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">' + (i+1) + '</span><span>' + a + '</span></div>'; }); html += '<br>'; }
  if (oportunidades.length) { html += '<strong>💡 Oportunidades:</strong><br>'; oportunidades.forEach(o => { html += '<div style="background:#f0fdf4;border-left:3px solid #22c55e;border-radius:8px;padding:8px 12px;margin:4px 0">' + o + '</div>'; }); }
  return html;
}

function rotinaDoDia(d, leads, imoveis, visitas, btn, chip) {
  const acoes = [];
  const agora = Date.now();
  const hoje = new Date().toISOString().slice(0,10);
  const visitasHoje = visitas.filter(v => (v.dataVisita||'').slice(0,10) === hoje);
  if (visitasHoje.length > 0) acoes.push({ prioridade:1, texto:'📅 <strong>' + visitasHoje.length + ' visita(s) hoje</strong>', acao: chip('Ver hoje','visitas hoje') });
  if (d.pendentes > 0) acoes.push({ prioridade:2, texto:'⏳ <strong>' + d.pendentes + ' visita(s) pendente(s)</strong> aguardando confirmação', acao: chip('Ver pendentes','visitas pendentes') });
  const comMatchSemVisita = leads.filter(l => l.matchesBase && l.matchesBase.length > 0 && !visitas.some(v => String(v.leadId||'') === String(l.id||'')));
  if (comMatchSemVisita.length > 0) acoes.push({ prioridade:3, texto:'🎯 <strong>' + comMatchSemVisita.length + ' lead(s) com match</strong> sem vitrine enviada', acao: chip('Leads com match','leads com match') });
  if (d.semMatch > 0) acoes.push({ prioridade:4, texto:'📋 <strong>' + d.semMatch + ' lead(s) sem match</strong>', acao: chip('Demanda','demanda por bairro') });
  const semProp = imoveis.filter(i => i.status !== 'inativo' && (!i.proprietario||!i.proprietario.telefone));
  if (semProp.length > 0) acoes.push({ prioridade:5, texto:'👤 <strong>' + semProp.length + ' imóvel(is) sem proprietário</strong>', acao: chip('Ver','imoveis sem proprietario') });
  const semFoto = imoveis.filter(i => i.status !== 'inativo' && (!i.fotos||i.fotos.length===0));
  if (semFoto.length > 0) acoes.push({ prioridade:6, texto:'📸 <strong>' + semFoto.length + ' imóvel(is) sem foto</strong> — portais rejeitam', acao: chip('Ver imóveis','meus imoveis') });
  if (!acoes.length) return '🎉 Tudo em dia! Nenhuma pendência urgente agora.<br><br>' + chip('Ver leads','minhas leads') + chip('Ver imóveis','meus imoveis');
  const lista = acoes.sort((a,b) => a.prioridade-b.prioridade).map((a,i) => '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c">' + (i+1) + '. ' + a.texto + '<br>' + a.acao + '</div>').join('');
  return '📋 <strong>Sua rotina de hoje:</strong><br><br>' + lista + '<br>' + btn('Dashboard','/app-home');
}

module.exports = { analisar, rotinaDoDia };
