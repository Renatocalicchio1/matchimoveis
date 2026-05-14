'use strict';

// Gera links de ação direta — WhatsApp, vitrine, match, XML
function gerarWhatsApp(telefone, mensagem) {
  var tel = String(telefone||'').replace(/\D/g,'');
  if (!tel) return null;
  if (tel.length === 11) tel = '55' + tel;
  return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(mensagem);
}

function btnWhatsApp(telefone, mensagem, label) {
  var url = gerarWhatsApp(telefone, mensagem);
  if (!url) return '';
  return '<a href="' + url + '" target="_blank" style="display:inline-block;background:#25d366;color:white;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700;margin:4px;font-size:13px">📱 ' + (label||'WhatsApp') + '</a>';
}

function btnVitrine(leadId, userId) {
  var url = 'https://matchimoveis.onrender.com/cliente/oferta/' + leadId + '?userId=' + userId;
  return '<a href="' + url + '" target="_blank" style="display:inline-block;background:#ff385c;color:white;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700;margin:4px;font-size:13px">🔗 Abrir vitrine</a>';
}

function btnCopiarVitrine(leadId, userId) {
  var url = 'https://matchimoveis.onrender.com/cliente/oferta/' + leadId + '?userId=' + userId;
  return '<button onclick="navigator.clipboard.writeText(' + "'" + url + "'" + ').then(function(){alert(' + "'Link copiado!'" + ');})" style="background:#6366f1;color:white;border:none;padding:10px 16px;border-radius:10px;font-weight:700;margin:4px;cursor:pointer;font-size:13px">📋 Copiar link vitrine</button>';
}

function mensagemVitrine(nomeLead, urlVitrine) {
  return 'Olá ' + (nomeLead||'') + '! Selecionei algumas opções de imóveis que combinam com o que você procura. Veja sua seleção exclusiva aqui: ' + urlVitrine + ' Qualquer dúvida estou à disposição!';
}

function mensagemFollowUp(nomeLead, bairro, tipo) {
  return 'Olá ' + (nomeLead||'') + '! Tudo bem? Estou com novidades de ' + (tipo||'imóveis') + (bairro?' em '+bairro:'') + ' que podem te interessar. Podemos conversar?';
}

function mensagemVisita(nomeLead, tipoImovel, bairro, data, hora) {
  return 'Olá ' + (nomeLead||'') + '! Confirmando nossa visita ao ' + (tipoImovel||'imóvel') + (bairro?' em '+bairro:'') + (data?' no dia '+data:'') + (hora?' às '+hora:'') + '. Qualquer imprevisto me avise!';
}

function responderAcaoDireta(mNorm, mensagemOriginal, d, leads, imoveis, visitas, userId, btn, chip) {
  var t = mNorm;

  // ENVIAR VITRINE PARA LEAD ESPECÍFICA
  if (/enviar? vitrine|mandar? vitrine|manda? o link|envia? o link|envia? vitrine/.test(t)) {
    // Tenta extrair nome
    var nomeMatch = mensagemOriginal.match(/(?:para|pro|pra)\s+([A-ZÀ-Úa-zà-ú]{3,})/i);
    var nomeBusca = nomeMatch ? nomeMatch[1].toLowerCase() : null;
    var lead = nomeBusca ? leads.find(function(l){ return (l.nome||l.name||'').toLowerCase().includes(nomeBusca) && l.matchesBase && l.matchesBase.length > 0; }) : leads.find(function(l){ return l.matchesBase && l.matchesBase.length > 0; });

    if (!lead) return '<div style="background:#fff8f0;border-radius:10px;padding:12px">Não encontrei lead com match para enviar vitrine.<br><br>' + chip('Leads com match','leads com match') + '</div>';

    var urlVitrine = 'https://matchimoveis.onrender.com/cliente/oferta/' + (lead.id||lead._id) + '?userId=' + userId;
    var tel = lead.telefone || lead.contato || lead.celular || '';
    var msgVitrine = mensagemVitrine(lead.nome||lead.name||'', urlVitrine);

    return '<div style="background:#f0fdf4;border-left:3px solid #22c55e;border-radius:10px;padding:14px;margin:4px 0">' +
      '🔗 <strong>Vitrine de ' + (lead.nome||lead.name||'Lead') + '</strong><br>' +
      '<span style="font-size:12px;color:#666">' + (lead.bairro||'') + ' · ' + (lead.tipo||'') + ' · ' + (lead.matchesBase.length) + ' imóvel(is)</span><br><br>' +
      btnVitrine(lead.id||lead._id, userId) + btnCopiarVitrine(lead.id||lead._id, userId) +
      (tel ? '<br><br>' + btnWhatsApp(tel, msgVitrine, 'Enviar por WhatsApp') : '') +
      '</div>';
  }

  // FOLLOW-UP DE LEAD
  if (/follow.?up|retornar|ligar|entrar em contato|cobrar|lead sumiu|sumiu|nao respondeu/.test(t)) {
    var nomeMatch2 = mensagemOriginal.match(/(?:para|pro|pra|com)\s+([A-ZÀ-Úa-zà-ú]{3,})/i);
    var nomeBusca2 = nomeMatch2 ? nomeMatch2[1].toLowerCase() : null;
    var candidatos = nomeBusca2 ? leads.filter(function(l){ return (l.nome||l.name||'').toLowerCase().includes(nomeBusca2); }) : leads.filter(function(l){ var dias = l.createdAt?(Date.now()-new Date(l.createdAt).getTime())/86400000:0; return dias>3&&(!visitas||!visitas.some(function(v){return String(v.leadId||'')===String(l.id||'');})); }).slice(0,5);

    if (!candidatos.length) return 'Não encontrei leads para follow-up agora.<br><br>' + btn('Ver leads','/app/leads');

    var html2 = '📱 <strong>Follow-up — ' + candidatos.length + ' lead(s):</strong><br><br>';
    candidatos.slice(0,4).forEach(function(l){
      var tel2 = l.telefone||l.contato||l.celular||'';
      var msg2 = mensagemFollowUp(l.nome||l.name||'', l.bairro, l.tipo);
      html2 += '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0">';
      html2 += '👤 <strong>' + (l.nome||l.name||'Lead') + '</strong>' + (l.bairro?' — '+l.bairro:'') + '<br>';
      if (tel2) html2 += btnWhatsApp(tel2, msg2, 'Follow-up WhatsApp');
      html2 += '</div>';
    });
    return html2;
  }

  // WHATSAPP DIRETO PARA LEAD
  if (/whatsapp|zap|ligar|falar com|contato de|telefone de|numero de/.test(t)) {
    var nomeMatch3 = mensagemOriginal.match(/(?:do|da|de|com|para)\s+([A-ZÀ-Úa-zà-ú]{3,})/i);
    var nomeBusca3 = nomeMatch3 ? nomeMatch3[1].toLowerCase() : null;
    if (!nomeBusca3) return null;
    var lead3 = leads.find(function(l){ return (l.nome||l.name||'').toLowerCase().includes(nomeBusca3); });
    if (!lead3) return 'Não encontrei lead com esse nome. Verifique em:<br><br>' + btn('Ver leads','/app/leads');
    var tel3 = lead3.telefone||lead3.contato||lead3.celular||'';
    if (!tel3) return '📱 <strong>' + (lead3.nome||lead3.name) + '</strong> não tem telefone cadastrado.<br><br>' + btn('Ver lead','/app/lead/'+(lead3.id||lead3._id));
    return '<div style="background:#f0fdf4;border-radius:10px;padding:12px">' +
      '📱 <strong>' + (lead3.nome||lead3.name) + '</strong><br>' +
      '<span style="font-size:13px;color:#666">' + tel3 + (lead3.bairro?' · '+lead3.bairro:'') + '</span><br><br>' +
      btnWhatsApp(tel3, 'Olá ' + (lead3.nome||lead3.name||'') + '! Tudo bem?', 'Abrir WhatsApp') +
      '</div>';
  }

  // PREPARAR VISITA
  if (/preparar visita|dicas para visita|o que levar|como me preparar|antes da visita/.test(t)) {
    return '<div style="background:#f0f9ff;border-radius:10px;padding:14px">' +
      '📅 <strong>Checklist antes da visita:</strong><br><br>' +
      '✅ Confirme com o cliente no dia anterior<br>' +
      '✅ Avise o proprietário da data e horário<br>' +
      '✅ Leve a ficha completa do imóvel<br>' +
      '✅ Verifique se o imóvel está limpo e organizado<br>' +
      '✅ Chegue 15 min antes para abrir e preparar<br>' +
      '✅ Tenha o link da vitrine no celular<br>' +
      '✅ Pergunte o que o cliente achou logo após<br><br>' +
      chip('Ver visitas de hoje','visitas hoje') + chip('Leads quentes','leads quentes') +
      '</div>';
  }

  // CLIENTE NÃO GOSTOU — busca alternativas
  if (/nao gostou|nao curtiu|nao aprovou|nao quis|recusou|nao quer|nao gostaram/.test(t)) {
    var nomeMatch4 = mensagemOriginal.match(/([A-ZÀ-Úa-zà-ú]{3,})/i);
    var nomeBusca4 = nomeMatch4 ? nomeMatch4[1].toLowerCase() : null;
    var lead4 = nomeBusca4 ? leads.find(function(l){ return (l.nome||l.name||'').toLowerCase().includes(nomeBusca4) && l.matchesBase && l.matchesBase.length > 1; }) : null;
    var html4 = '<div style="background:#fff8f0;border-radius:10px;padding:14px">';
    html4 += '💡 <strong>Cliente não gostou? Sem problema!</strong><br><br>';
    if (lead4 && lead4.matchesBase.length > 1) {
      html4 += 'Essa lead tem <strong>' + lead4.matchesBase.length + ' opções</strong> em match. Sugira as outras!<br><br>';
      html4 += btnVitrine(lead4.id||lead4._id, userId) + '<br><br>';
    }
    html4 += '📋 Próximos passos:<br>• Pergunte o que não agradou (preço? tamanho? localização?)<br>• Ajuste os filtros e ofereça nova vitrine<br>• Se for preço, busque opções mais baratas<br><br>';
    html4 += chip('Buscar mais barato','imoveis mais baratos') + chip('Ver leads com match','leads com match');
    html4 += '</div>';
    return html4;
  }

  // CLIENTE GOSTOU — próximo passo
  if (/gostou|adorou|curtiu|topou|quer comprar|quer fechar|muito interessado|adorei|amou/.test(t)) {
    return '<div style="background:#f0fdf4;border-left:3px solid #22c55e;border-radius:10px;padding:14px">' +
      '🔥 <strong>Cliente interessado — aja agora!</strong><br><br>' +
      '⚡ O interesse esfria rápido. Faça agora:<br><br>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#22c55e;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">1</span><span>Agende a visita ainda hoje</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#22c55e;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">2</span><span>Avise o proprietário</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#22c55e;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">3</span><span>Prepare a documentação necessária</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#22c55e;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">4</span><span>Se quiser proposta, acione agora</span></div>' +
      '<br>' + chip('Ver visitas','visitas hoje') + chip('Leads quentes','leads quentes') +
      '</div>';
  }

  return null;
}

module.exports = { responderAcaoDireta, gerarWhatsApp, btnWhatsApp, btnVitrine, mensagemVitrine, mensagemFollowUp, mensagemVisita };
