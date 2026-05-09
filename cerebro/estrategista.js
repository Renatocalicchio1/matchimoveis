'use strict';

function analisar(d, leads, imoveis, visitas, btn, chip) {
  const alertas = [];
  const acoes = [];
  const oportunidades = [];

  // ALERTAS CRÍTICOS
  if (d.hoje > 0)
    alertas.push(`🔴 <strong>${d.hoje} visita(s) hoje!</strong> Não perca o horário. ${btn('Ver visitas','/app/visitas')}`);
  if (d.pendentes > 0)
    alertas.push(`🟡 <strong>${d.pendentes} visita(s) pendente(s)</strong> aguardando confirmação. ${btn('Confirmar','/app/visitas')}`);
  if (d.semMatch > 0 && d.leads > 5)
    alertas.push(`🟡 <strong>${d.semMatch} leads sem match</strong> — pode estar faltando imóvel no bairro certo. ${chip('Ver demanda','demanda por bairro')}`);

  // AÇÕES PRIORITÁRIAS
  if (d.ativos === 0)
    acoes.push(`Importe seus imóveis via XML para começar. ${btn('Importar XML','/app/imoveis')}`);
  else if (d.leads === 0)
    acoes.push(`Importe leads dos portais para fazer o match. ${btn('Importar leads','/app-importar-leads')}`);
  else if (d.comMatch === 0)
    acoes.push(`Nenhuma lead tem match ainda. Faça o match agora! ${btn('Fazer match','/app/leads')}`);

  // Leads com match mas sem visita agendada
  const comMatchSemVisita = leads.filter(l =>
    l.matchesBase && l.matchesBase.length > 0 &&
    !visitas.some(v => v.leadId === (l.id||l._id))
  ).length;
  if (comMatchSemVisita > 0)
    acoes.push(`Envie a vitrine para as <strong>${comMatchSemVisita} leads com match</strong> que ainda não visitaram. ${btn('Ver leads','/app/leads?filtro=com_match')}`);

  // OPORTUNIDADES DE MERCADO
  const bairrosLeads = {};
  leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro] = (bairrosLeads[l.bairro]||0)+1; });
  const bairrosIm = {};
  imoveis.filter(i=>i.status!=='inativo').forEach(i => { if (i.bairro) bairrosIm[i.bairro] = (bairrosIm[i.bairro]||0)+1; });

  Object.entries(bairrosLeads)
    .filter(([b,n]) => n >= 3 && (!bairrosIm[b] || bairrosIm[b] < n))
    .sort((a,b) => b[1]-a[1]).slice(0,2)
    .forEach(([bairro, demanda]) => {
      const oferta = bairrosIm[bairro]||0;
      oportunidades.push(`💡 <strong>${bairro}</strong>: ${demanda} leads buscando, só ${oferta} imóvel(is) — capte mais imóveis aqui!`);
    });

  const taxa = d.leads > 0 ? Math.round(d.comMatch/d.leads*100) : 0;
  if (taxa < 40 && d.leads > 5)
    oportunidades.push(`📉 Taxa de match em <strong>${taxa}%</strong> — importe mais imóveis ou revise os bairros. ${chip('Importar XML','importar xml')}`);

  // NADA URGENTE
  if (!alertas.length && !acoes.length && !oportunidades.length)
    return `✅ <strong>Tudo em dia!</strong> Nenhuma ação urgente agora.<br><br>${chip('📊 Resumo','resumo geral')}${chip('📍 Demanda','demanda por bairro')}`;

  let html = `🧠 <strong>Plano de ação para hoje:</strong><br><br>`;

  if (alertas.length) {
    html += `<strong>⚠️ Atenção agora:</strong><br>`;
    alertas.forEach(a => { html += `${a}<br><br>`; });
  }

  if (acoes.length) {
    html += `<strong>✅ O que fazer:</strong><br>`;
    acoes.forEach((a,i) => {
      html += `<div style="display:flex;gap:10px;margin:6px 0;align-items:flex-start">`+
        `<span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${i+1}</span>`+
        `<span>${a}</span></div>`;
    });
    html += '<br>';
  }

  if (oportunidades.length) {
    html += `<strong>💡 Oportunidades:</strong><br>`;
    oportunidades.forEach(o => { html += `${o}<br>`; });
  }

  return html;
}


// ── ROTINA DO DIA ─────────────────────────────────────────────────────────────
function rotinaDoDia(d, leads, imoveis, visitas, btn, chip) {
  const acoes = [];
  const hoje = new Date().toLocaleDateString('pt-BR');

  // Visitas do dia
  const visitasHoje = visitas.filter(v => v.dataVisita === hoje || (v.data && new Date(v.data).toLocaleDateString('pt-BR') === hoje));
  if (visitasHoje.length > 0)
    acoes.push({ prioridade: 1, texto: '📅 <strong>' + visitasHoje.length + ' visita(s) hoje</strong> — confirme com o proprietário', acao: chip('Ver visitas de hoje', 'visitas hoje') });

  // Visitas pendentes
  if (d.pendentes > 0)
    acoes.push({ prioridade: 2, texto: '⏳ <strong>' + d.pendentes + ' visita(s) pendente(s)</strong> aguardando confirmação', acao: chip('Ver pendentes', 'visitas pendentes') });

  // Leads sem match
  if (d.semMatch > 0)
    acoes.push({ prioridade: 3, texto: '📋 <strong>' + d.semMatch + ' lead(s) sem match</strong> — verifique se tem imóveis nos bairros certos', acao: chip('Demanda por bairro', 'demanda por bairro') });

  // Leads com match mas sem visita
  const comMatchSemVisita = leads.filter(l => l.matchesBase && l.matchesBase.length > 0 && (!visitas || !visitas.some(v => String(v.leadId||'') === String(l.id||''))));
  if (comMatchSemVisita.length > 0)
    acoes.push({ prioridade: 4, texto: '🎯 <strong>' + comMatchSemVisita.length + ' lead(s) com match sem visita</strong> — envie a vitrine!', acao: chip('Leads com match', 'leads com match') });

  // Imóveis sem proprietário
  const semProp = imoveis.filter(i => i.status !== 'inativo' && (!i.proprietario || !i.proprietario.nome));
  if (semProp.length > 0)
    acoes.push({ prioridade: 5, texto: '👤 <strong>' + semProp.length + ' imóvel(is) sem proprietário</strong> cadastrado', acao: chip('Ver sem proprietário', 'imoveis sem proprietario') });

  if (!acoes.length)
    return '🎉 Tudo em dia! Nenhuma pendência urgente agora.<br><br>' + chip('Ver leads', 'minhas leads') + chip('Ver imóveis', 'meus imoveis');

  const lista = acoes.sort((a,b) => a.prioridade - b.prioridade)
    .map((a, i) => '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c">' + (i+1) + '. ' + a.texto + '<br>' + a.acao + '</div>')
    .join('');

  return '📋 <strong>Sua rotina de hoje:</strong><br><br>' + lista + '<br>' + btn('Dashboard', '/app-home');
}

module.exports = { analisar };
