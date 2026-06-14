'use strict';

const PASSOS = [
  {
    id: 1,
    titulo: 'Configure seu perfil',
    emoji: '👤',
    concluido: d => !!(d.temPerfil || d.creci || d.celular),
    acao: 'configurar perfil',
    rota: '/app/perfil',
    dica: 'Preencha nome, celular e CRECI para identificar sua conta.',
  },
  {
    id: 2,
    titulo: 'Importe seus imóveis',
    emoji: '🏠',
    concluido: d => (d.ativos || 0) > 0,
    acao: 'importar xml',
    rota: '/app/cadastro',
    dica: 'Importe o XML do seu CRM (Tecimob, Rankim, Vista...) ou cadastre manualmente.',
  },
  {
    id: 3,
    titulo: 'Conecte seu WhatsApp',
    emoji: '📱',
    concluido: d => !!(d.whatsappConectado || d.temWhatsapp),
    acao: 'conectar whatsapp',
    rota: '/app/whatsapp/qrcode',
    dica: 'Conecte seu número para receber leads e enviar vitrines automaticamente.',
  },
  {
    id: 4,
    titulo: 'Importe suas leads',
    emoji: '👥',
    concluido: d => (d.leads || 0) > 0,
    acao: 'importar leads',
    rota: '/app/importar-leads',
    dica: 'Importe planilhas dos portais (ImovelWeb, ZAP, OLX, VivaReal).',
  },
  {
    id: 5,
    titulo: 'Faça o match',
    emoji: '🎯',
    concluido: d => (d.comMatch || 0) > 0,
    acao: 'fazer match agora',
    rota: '/app/leads',
    dica: 'Cruze suas leads com seus imóveis automaticamente.',
  },
  {
    id: 6,
    titulo: 'Envie sua primeira vitrine',
    emoji: '✨',
    concluido: d => (d.vitrinesEnviadas || 0) > 0 || (d.visitas || 0) > 0,
    acao: 'ver leads com match',
    rota: '/app/leads?filtro=com_match',
    dica: 'Envie a vitrine para uma lead com match e aguarde a solicitação de visita.',
  },
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
    return '🎉 <strong>Conta 100% configurada!</strong><br><br>' +
      'Você já tem imóveis, leads, match e vitrines enviadas. Parabéns!<br><br>' +
      chip('📊 Ver resumo','resumo geral') + ' ' +
      chip('🧠 Plano do dia','o que devo fazer hoje');
  }

  const barraProgresso = Math.round(status.progresso / 10);
  const barra = '█'.repeat(barraProgresso) + '░'.repeat(10 - barraProgresso);

  let html = '🚀 <strong>Configure sua conta:</strong><br>';
  html += '<code style="font-size:12px">' + barra + '</code> ' + status.progresso + '%<br><br>';

  PASSOS.forEach((p, i) => {
    const feito = p.concluido(d);
    html += '<div style="display:flex;gap:10px;margin:8px 0;align-items:flex-start">';
    html += '<span style="background:' + (feito ? '#22c55e' : '#ff385c') + ';color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">' + (feito ? '✓' : i+1) + '</span>';
    html += '<span>' + (feito ? '<s>' : '') + '<strong>' + p.emoji + ' ' + p.titulo + '</strong>' + (feito ? '</s>' : '') + ' — ' + p.dica;
    if (!feito) html += ' ' + btn('Fazer agora', p.rota);
    html += '</span></div>';
  });

  // Próximo passo em destaque
  const proximo = status.pendentes[0];
  if (proximo) {
    html += '<br>👆 <strong>Próximo:</strong> ' + proximo.emoji + ' ' + proximo.titulo + '<br>' +
      chip('Como faço isso?', 'como ' + proximo.acao);
  }

  return html;
}

function responder(mNorm, d, btn, chip) {
  if (/primeiros passos|como comecar|por onde comecar|primeiro passo|nao sei comecar|como configuro|configurar conta|como uso|onboarding|tutorial/.test(mNorm)) {
    return renderOnboarding(d, btn, chip);
  }
  if (/progresso|quanto falta|o que falta|configurei|conta configurada/.test(mNorm)) {
    const status = verificar(d);
    if (status.progresso === 100) {
      return '🎉 Conta 100% configurada! Tudo pronto para usar o MatchImóveis.';
    }
    return '📊 Progresso: <strong>' + status.progresso + '%</strong><br><br>' +
      'Concluído: ' + status.concluidos.map(p => p.emoji + ' ' + p.titulo).join(', ') + '<br>' +
      'Falta: ' + status.pendentes.map(p => p.emoji + ' ' + p.titulo).join(', ') + '<br><br>' +
      chip('Ver passos completos', 'primeiros passos');
  }
  return null;
}

module.exports = { verificar, renderOnboarding, responder, PASSOS };
