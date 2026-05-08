'use strict';

const PASSOS = [
  { id:1, titulo:'Importar imóveis',   concluido: d => d.ativos > 0,    acao:'importar xml',        rota:'/app/imoveis',          emoji:'🏠', dica:'Importe o XML do seu CRM (Tecimob, Rankim, etc).' },
  { id:2, titulo:'Importar leads',     concluido: d => d.leads > 0,     acao:'importar leads',      rota:'/app-importar-leads',   emoji:'👥', dica:'Importe planilhas dos portais (ImovelWeb, ZAP, OLX).' },
  { id:3, titulo:'Fazer o match',      concluido: d => d.comMatch > 0,  acao:'fazer match agora',   rota:'/app/leads',            emoji:'🎯', dica:'Cruze suas leads com seus imóveis automaticamente.' },
  { id:4, titulo:'Enviar vitrine',     concluido: d => d.visitas > 0,   acao:'ver leads com match', rota:'/app/leads?filtro=com_match', emoji:'✨', dica:'Envie a vitrine para leads com match e aguarde a visita.' },
];

function verificar(d) {
  const concluidos = PASSOS.filter(p => p.concluido(d));
  const pendentes  = PASSOS.filter(p => !p.concluido(d));
  const progresso  = Math.round(concluidos.length / PASSOS.length * 100);
  return { concluidos, pendentes, progresso, total: PASSOS.length };
}

function renderOnboarding(d, btn, chip) {
  const status = verificar(d);

  if (status.progresso === 100) {
    return `🎉 <strong>Conta 100% configurada!</strong><br>Você já tem imóveis, leads, match e visitas. Parabéns!<br><br>${chip('📊 Ver resumo','resumo geral')}${chip('🧠 Plano do dia','o que devo fazer hoje')}`;
  }

  const barraProgresso = Math.round(status.progresso / 10);
  const barra = '█'.repeat(barraProgresso) + '░'.repeat(10 - barraProgresso);

  let html = `🚀 <strong>Configure sua conta:</strong><br>`;
  html += `<code style="font-size:12px">${barra}</code> ${status.progresso}%<br><br>`;

  PASSOS.forEach((p, i) => {
    const feito = p.concluido(d);
    html += `<div style="display:flex;gap:10px;margin:6px 0;align-items:flex-start">`;
    html += `<span style="background:${feito?'#22c55e':'#ff385c'};color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${feito?'✓':i+1}</span>`;
    html += `<span>${feito?'<s>':''}<strong>${p.emoji} ${p.titulo}</strong>${feito?'</s>':''} — ${p.dica} ${feito?'':btn('Fazer agora',p.rota)}</span>`;
    html += `</div>`;
  });

  return html;
}

module.exports = { verificar, renderOnboarding, PASSOS };
