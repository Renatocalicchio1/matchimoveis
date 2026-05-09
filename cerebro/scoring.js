'use strict';

// Calcula score de prioridade de cada lead
function calcularScore(lead, visitas) {
  let score = 0;
  const temMatch    = lead.matchesBase && lead.matchesBase.length > 0;
  const qtdMatch    = lead.matchesBase?.length || 0;
  const temVisita   = visitas.some(v => v.leadId===(lead.id||lead._id));
  const visitaConf  = visitas.some(v => v.leadId===(lead.id||lead._id) && v.status==='confirmada');
  const recente     = lead.dataCriacao && (new Date()-new Date(lead.dataCriacao)) < 7*24*60*60*1000;

  if (temMatch)    score += 40;
  if (qtdMatch>2)  score += 20;
  if (temVisita)   score += 30;
  if (visitaConf)  score += 25;
  if (recente)     score += 15;
  if (lead.valorMax && lead.valorMax > 500000) score += 10;

  return score;
}

function rankingLeads(leads, visitas, n=10) {
  return leads
    .map(l => ({ ...l, _score: calcularScore(l, visitas) }))
    .filter(l => l._score > 0)
    .sort((a,b) => b._score - a._score)
    .slice(0, n);
}

function responder(mNorm, leads, visitas, btn, chip) {

  // QUEM ATENDER PRIMEIRO
  if (/atender primeiro|mais urgente|prioridade|mais importante/.test(mNorm)) {
    const ranking = rankingLeads(leads, visitas, 5);
    if (!ranking.length) return `Nenhuma lead com score ainda. Faça o match primeiro!<br><br>${btn('Leads','/app/leads')}`;
    return `🎯 <strong>Atenda nessa ordem:</strong><br><br>`+
      ranking.map((l,i)=>{
        const emoji = i===0?'🔴':i===1?'🟠':i===2?'🟡':'🟢';
        return `${emoji} <strong>${i+1}. ${l.nome||l.name||'Lead'}</strong> — ${l.bairro||''} ${l.tipo||''} · score ${l._score}pts`;
      }).join('<br>')+
      `<br><br>${btn('Ver leads','/app/leads')}`;
  }

  // CHANCE DE FECHAR
  if (/chance de fechar|chance de compra|mais propenso|vai comprar|pronto para proposta/.test(mNorm)) {
    const ranking = rankingLeads(leads, visitas, 5);
    if (!ranking.length) return `Sem dados suficientes para calcular. Faça o match e aguarde visitas!`;
    const top = ranking[0];
    const nivel = top._score>=80?'🔥 Altíssima':top._score>=50?'✅ Boa':'🟡 Média';
    return `📊 <strong>Leads com mais chance de fechar:</strong><br><br>`+
      ranking.map((l,i)=>`${i+1}. ${l.nome||l.name||'Lead'} — ${l._score}pts`).join('<br>')+
      `<br><br>Chance do #1: <strong>${nivel}</strong><br>${btn('Ver leads','/app/leads')}`;
  }

  // RANKING GERAL
  const ranking = rankingLeads(leads, visitas, 8);
  if (!ranking.length) return null;
  return `📊 <strong>Ranking de leads por prioridade:</strong><br><br>`+
    ranking.map((l,i)=>`${i+1}. ${l.nome||l.name||'Lead'} — ${l._score}pts · ${l.bairro||''}`).join('<br>')+
    `<br><br>${btn('Ver leads','/app/leads')}`;
}


// ── PADRÕES EXTRAS DE SCORING ─────────────────────────────────────────────────
function responderExtra(mNorm, leads, visitas, btn, chip) {
  // "pronto para fechar" / "quase fechando"
  if (/pronto para fechar|quase fechando|proximo de fechar|proposta|quer fechar/.test(mNorm)) {
    const comVisita = leads.filter(l => visitas && visitas.some(v =>
      String(v.leadId||v.lead_id||'') === String(l.id||'') && v.status === 'confirmada'
    ));
    if (!comVisita.length) return 'Nenhuma lead com visita confirmada ainda. Isso geralmente indica interesse real.' +
      btn('Ver visitas', '/app/visitas');
    return '🏆 <strong>' + comVisita.length + ' lead(s) com visita confirmada — potencial de fechamento:</strong><br><br>' +
      comVisita.slice(0,5).map(l => '• <strong>' + (l.nome||l.email||'Lead') + '</strong> — ' + (l.bairro||'') + ' ' + (l.tipo||'')).join('<br>') +
      '<br><br>' + btn('Ver leads', '/app/leads');
  }
  return null;
}

module.exports = { responder, rankingLeads, calcularScore };
