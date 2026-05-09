'use strict';

function detectarAcao(mNorm) {
  if (/confirmar visita|aceitar visita|aprovar visita/.test(mNorm))    return 'confirmar_visita';
  if (/recusar visita|cancelar visita|negar visita/.test(mNorm))       return 'recusar_visita';
  if (/inativar imovel|desativar imovel|ocultar imovel/.test(mNorm))  return 'inativar_imovel';
  if (/fazer match|rodar match|executar match|match agora/.test(mNorm)) return 'fazer_match';
  if (/gerar xml|criar xml|publicar/.test(mNorm))                      return 'gerar_xml';
  if (/importar lead|subir lead|upload lead|importar planilha/.test(mNorm)) return 'wizard_leads';
  if (/importar xml|importar imovel|subir xml/.test(mNorm))            return 'wizard_xml';
  if (/importar proprietario|vincular proprietario/.test(mNorm))       return 'wizard_proprietarios';
  if (/pode me ajudar|o que voce faz|o que pode|me ajuda|pode ajudar/.test(mNorm)) return 'mostrar_capacidades';
  if (/avisar proprietario|notificar proprietario/.test(mNorm)) return 'avisar_proprietario';
  if (/enviar vitrine|mandar vitrine|link para|link do cliente/.test(mNorm)) return 'enviar_vitrine';
  if (/follow.?up|retornar para|ligar para/.test(mNorm)) return 'follow_up';
  return null;
}

function extrairId(mensagem) {
  const m = mensagem.match(/\b([a-zA-Z0-9-]{4,})\b/g);
  return m ? m[m.length-1] : null;
}

function extrairPortal(mNorm) {
  return ['vivareal','zap','olx','chaves','imovelweb','123i'].find(p => mNorm.includes(p)) || null;
}

function gerarWizard(wizard, btn) {
  const passos = wizard.passos.map((p,i) =>
    `<div style="display:flex;gap:10px;margin:8px 0;align-items:flex-start">` +
    `<span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${i+1}</span>` +
    `<span>${p}</span></div>`
  ).join('');
  return `${wizard.titulo}<br><br>${passos}<br>${btn(wizard.btn_direto.label, wizard.btn_direto.href)}`;
}

function mostrarCapacidades(btn, chip) {
  return `🤖 <strong>Posso te ajudar a:</strong><br><br>` +
    `<strong>📊 Consultar:</strong><br>` +
    chip('👥 Leads','minhas leads')+chip('🏠 Imóveis','meus imoveis')+chip('📅 Visitas','minhas visitas')+
    chip('🎯 Match','ver match')+chip('📊 Resumo','resumo geral')+chip('📍 Demanda','demanda por bairro')+
    `<br><br><strong>⚡ Executar:</strong><br>`+
    chip('📋 Importar leads','importar leads')+chip('🏠 Importar XML','importar xml')+
    chip('🔗 Gerar XML','gerar xml')+chip('👤 Proprietários','importar proprietarios')+chip('🎯 Fazer match','fazer match agora')+
    `<br><br><strong>💡 Explicar:</strong><br>`+
    chip('❓ Match','o que e match')+chip('❓ Vitrine','o que e vitrine')+chip('❓ Score','como funciona o score');
}

function executarAcao(acao, mensagem, mNorm, d, btn, chip) {
  const WIZARDS = {
    wizard_leads: {
      titulo:'📋 <strong>Importar Leads — passo a passo:</strong>',
      passos:[
        'Vá até <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads →</a> e clique em <strong>Importar</strong>.',
        'Selecione o arquivo <strong>CSV ou Excel</strong> exportado do portal (ImovelWeb, ZAP, VivaReal, OLX).',
        'Clique em <strong>Enviar</strong> — o sistema extrai bairro, tipo, quartos e valor automaticamente.',
        'Após importar, clique em <strong>Fazer Match</strong> para cruzar com seus imóveis.'
      ],
      btn_direto:{ label:'Ir para Leads', href:'/app/leads' }
    },
    wizard_xml: {
      titulo:'🏠 <strong>Importar Imóveis via XML — passo a passo:</strong>',
      passos:[
        'Exporte o XML do seu CRM (Tecimob, Rankim ou outro).',
        'Vá até <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a> e clique em <strong>Importar XML</strong>.',
        'Selecione o arquivo <strong>.xml</strong> e clique em Enviar.',
        'Os imóveis são importados e vinculados à sua conta automaticamente.'
      ],
      btn_direto:{ label:'Ir para Imóveis', href:'/app/imoveis' }
    },
    wizard_proprietarios: {
      titulo:'👤 <strong>Vincular Proprietários — passo a passo:</strong>',
      passos:[
        'Prepare o Excel no padrão Tecimob.',
        'Campos necessários: <strong>Referencia, Proprietário, Celular, E-mail, Descrição</strong>.',
        'Vá até <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a> e use <strong>Importar Proprietários</strong>.',
        'O sistema cruza automaticamente pelo código de referência.'
      ],
      btn_direto:{ label:'Ir para Imóveis', href:'/app/imoveis' }
    }
  };

  switch(acao) {
    case 'mostrar_capacidades': return mostrarCapacidades(btn, chip);
    case 'wizard_leads':        return gerarWizard(WIZARDS.wizard_leads, btn);
    case 'wizard_xml':          return gerarWizard(WIZARDS.wizard_xml, btn);
    case 'wizard_proprietarios':return gerarWizard(WIZARDS.wizard_proprietarios, btn);

    case 'fazer_match':
      return `🎯 Para fazer o match:<br><br>`+
        `<div style="display:flex;gap:10px;margin:8px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">1</span><span>Vá para <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads →</a></span></div>`+
        `<div style="display:flex;gap:10px;margin:8px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">2</span><span>Clique em <strong>Fazer Match</strong> no topo.</span></div>`+
        `<div style="display:flex;gap:10px;margin:8px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">3</span><span>O sistema cruza todas as leads com seus <strong>${d.ativos} imóveis ativos</strong>.</span></div>`+
        `<br>${btn('Ir para Leads','/app/leads')}`;

    case 'gerar_xml': {
      const portal = extrairPortal(mNorm);
      if (portal)
        return `🔗 Para gerar XML do <strong>${portal.toUpperCase()}</strong>:<br><br>`+
          `<div style="display:flex;gap:10px;margin:8px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">1</span><span>Vá para <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a></span></div>`+
          `<div style="display:flex;gap:10px;margin:8px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">2</span><span>Selecione os imóveis com os checkboxes.</span></div>`+
          `<div style="display:flex;gap:10px;margin:8px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">3</span><span>Clique em <strong>${portal.toUpperCase()}</strong> na barra inferior.</span></div>`+
          `<br>${btn('Ir para Imóveis','/app/imoveis')}`;
      return `🔗 Para qual portal?<br><br>`+
        ['VivaReal','ZAP','OLX','Chaves','ImovelWeb','123i'].map(p=>chip(`🔗 ${p}`,`gerar xml ${p.toLowerCase()}`)).join('');
    }

    case 'confirmar_visita': {
      const id = extrairId(mensagem);
      if (!id) return `Para confirmar uma visita, me informe o ID.<br>Ex: <em>"confirmar visita abc123"</em><br><br>${btn('Ver visitas','/app/visitas')}`;
      return `✅ Clique em Confirmar na visita <strong>${id}</strong>:<br><br>${btn('Ver visitas','/app/visitas')}`;
    }

    case 'recusar_visita': {
      const id = extrairId(mensagem);
      if (!id) return `Para recusar uma visita, me informe o ID.<br><br>${btn('Ver visitas','/app/visitas')}`;
      return `❌ Clique em Recusar na visita <strong>${id}</strong>:<br><br>${btn('Ver visitas','/app/visitas')}`;
    }

    case 'inativar_imovel': {
      const id = extrairId(mensagem);
      if (!id) return `Para inativar, me informe o código do imóvel.<br>Ex: <em>"inativar imóvel GABI0997"</em><br><br>${btn('Ver imóveis','/app/imoveis')}`;
      return `⚠️ Acesse o imóvel <strong>${id}</strong> e clique em <strong>Inativar</strong>:<br><br>${btn('Ver imóveis','/app/imoveis')}`;
    }

    case 'avisar_proprietario':
      return '👤 Para avisar o proprietário sobre uma visita, acesse o imóvel específico e clique em <strong>Notificar Proprietário</strong>.<br><br>' + btn('Ver imóveis', '/app/imoveis') + chip('Visitas pendentes', 'visitas pendentes');

    case 'enviar_vitrine':
      return '🔗 Para enviar a vitrine ao cliente:<br><br>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">1</span><span>Vá para <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads</a></span></div>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">2</span><span>Clique na lead com match</span></div>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">3</span><span>Copie o link da vitrine e envie pelo WhatsApp</span></div>' +
        '<br>' + btn('Ver leads com match', '/app/leads') + chip('Leads com match', 'leads com match');

    case 'follow_up':
      return '📱 Para fazer follow-up:<br><br>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">1</span><span>Identifique leads sem resposta há 3+ dias</span></div>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">2</span><span>Envie mensagem personalizada com os imóveis que combinam</span></div>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">3</span><span>Se não responder, ligue direto</span></div>' +
        '<br>' + btn('Ver leads', '/app/leads') + chip('Quem não respondeu', 'quem nao respondeu');

    default: return null;
  }
}

module.exports = { detectarAcao, executarAcao, extrairPortal, extrairId };
