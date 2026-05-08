'use strict';

const PORTAIS = ['VivaReal','ZAP','OLX','Chaves','ImovelWeb','123i'];

function responder(mNorm, d, btn, chip) {
  // PÁGINA DE PORTAIS
  if (/pagina portais|app portais|menu portais|portais xml|gerencia feeds|o que tem em portais/.test(mNorm))
    return '🔗 <strong>Portais XML (/app/portais):</strong><br><br>' +
      '"Gerencie os feeds XML por portal."<br><br>' +
      'Aqui ficam salvos os links XML gerados para cada portal:<br>' +
      '• OLX<br>• ZAP Imóveis<br>• VivaReal<br>• Chaves na Mão<br>• ImovelWeb<br>• 123i<br><br>' +
      'Copie o link e cadastre nas configurações do portal.<br><br>' +
      btn('Ver portais','/app/portais');

  // COMO FUNCIONA O FLUXO DE PORTAIS
  if (/como funciona portal|fluxo portal|como publicar portal|como enviar imovel portal/.test(mNorm))
    return '🔗 <strong>Como publicar nos portais:</strong><br><br>' +
      '<strong>Opção 1 — pelo cadastro do imóvel:</strong><br>' +
      'Ao cadastrar ou editar um imóvel, escolha os portais desejados e salve.<br><br>' +
      '<strong>Opção 2 — pela página de imóveis:</strong><br>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">1</span><span>Acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a></span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">2</span><span>Selecione todos ou escolha os imóveis desejados</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">3</span><span>Clique no portal desejado (OLX, ZAP, VivaReal...)</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">4</span><span>XML gerado — copie o link em <a href="/app/portais" style="color:#ff385c;font-weight:700">Portais →</a></span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">5</span><span>Cadastre o link nas configurações do portal</span></div>' +
      '<br>' + btn('Ver portais','/app/portais') + btn('Ver imóveis','/app/imoveis');

  // LINK DO XML
  if (/link xml|link do feed|onde fica o link|copiar link portal/.test(mNorm))
    return '🔗 O link do XML fica salvo em <strong>Portais (/app/portais)</strong> após a geração.<br><br>' +
      'Copie o link e cadastre nas configurações do portal correspondente.<br><br>' +
      btn('Ver portais','/app/portais');

  // QUAIS PORTAIS TEM
  if (/quais portais|portais disponiveis|portais suportados/.test(mNorm))
    return '🔗 <strong>Portais suportados:</strong><br><br>' +
      '• OLX<br>• ZAP Imóveis<br>• VivaReal (padrão VRSync)<br>• Chaves na Mão<br>• ImovelWeb<br>• 123i<br><br>' +
      'Todos geram XML compatível com o padrão de cada portal.<br><br>' +
      btn('Ver portais','/app/portais');

  // Ver portais
  if (/ver portais|meus portais|status portal|ver portal/.test(mNorm))
    return '🔗 <strong>Seus portais:</strong><br><br>' + PORTAIS.join(' · ') + '<br><br>Veja o status dos feeds gerados:<br><br>' + btn('Ver portais','/app/portais');
  // Portal rejeitou
  if (/rejeitou|nao publicou|nao saiu|recusou|nao apareceu portal/.test(mNorm))
    return '🔧 <strong>Portal rejeitou?</strong><br><br>Verifique:<br>• Mínimo 3 fotos obrigatórias<br>• Descrição com 100+ caracteres<br>• Preço preenchido<br>• Endereço completo (bairro + cidade)<br>• Tipo do imóvel preenchido<br><br>Corrija e gere o XML novamente.<br><br>' + btn('Ver imóveis','/app/imoveis');

  // Portal rejeitou
  if (/rejeitou|nao publicou|nao saiu|recusou/.test(mNorm))
    return '🔧 <strong>Portal rejeitou?</strong><br><br>Verifique:<br>• Mínimo 3 fotos obrigatórias<br>• Descrição com 100+ caracteres<br>• Preço preenchido<br>• Endereço completo (bairro + cidade)<br>• Tipo do imóvel preenchido<br><br>Corrija o imóvel e gere o XML novamente.' + btn('Ver imóveis','/app/imoveis');

  // GERAR XML ESPECÍFICO
  const portal = PORTAIS.find(p => mNorm.includes(p.toLowerCase().replace(' ','')));
  if (portal && /gerar|criar|publicar|subir|feed/.test(mNorm))
    return `🔗 <strong>Gerar XML para ${portal}:</strong><br><br>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">1</span><span>Acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a></span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">2</span><span>Selecione os imóveis com os checkboxes.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">3</span><span>Clique em <strong>${portal}</strong> na barra inferior.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">4</span><span>Copie o link gerado em <a href="/app/portais" style="color:#ff385c;font-weight:700">Portais →</a> e cadastre no portal.</span></div>`+
      `<br>${btn('Ir para imóveis','/app/imoveis')}${btn('Ver portais','/app/portais')}`;

  // GERAR XML GENÉRICO
  if (/gerar|criar|publicar|xml/.test(mNorm))
    return `🔗 <strong>Para qual portal gerar o XML?</strong><br><br>`+
      PORTAIS.map(p=>chip(`🔗 ${p}`,`gerar xml ${p.toLowerCase()}`)).join('');

  // O QUE É XML
  if (/o que|para que|como funciona|explicar/.test(mNorm))
    return `🔗 <strong>O que é o XML de portais:</strong><br><br>`+
      `O XML é um arquivo que envia seus imóveis automaticamente para portais como VivaReal, ZAP e OLX.<br><br>`+
      `<strong>Como usar:</strong><br>`+
      `1. Gere o XML aqui no MatchImóveis<br>`+
      `2. Copie o link do feed gerado<br>`+
      `3. Cadastre esse link nas configurações do portal<br>`+
      `4. O portal atualiza automaticamente seus imóveis!<br><br>`+
      `${btn('Ver portais','/app/portais')}${chip('🔗 Gerar XML','gerar xml')}`;

  // STATUS PORTAIS
  if (/status|ativo|atualizado|quando/.test(mNorm))
    return `🔗 Veja o status de todos os seus feeds em <strong>Portais</strong>:<br><br>${btn('Ver portais','/app/portais')}`;

  // GERAL
  return `🔗 <strong>Portais disponíveis:</strong><br>`+
    PORTAIS.join(' · ')+'<br><br>'+
    `Gere o XML de cada portal e cadastre o link nas configurações do portal.<br><br>`+
    `${btn('Ver portais','/app/portais')}${btn('Ir para imóveis','/app/imoveis')}<br>`+
    PORTAIS.map(p=>chip(`🔗 ${p}`,`gerar xml ${p.toLowerCase()}`)).join('');
}

module.exports = { responder, PORTAIS };
