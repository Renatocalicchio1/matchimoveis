'use strict';

const PORTAIS = ['VivaReal','ZAP','OLX','Chaves','ImovelWeb','123i'];

function responder(mNorm, d, btn, chip) {

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
