'use strict';

const PORTAIS = ['VivaReal','ZAP','OLX','Chaves','ImovelWeb','123i'];

function responder(mNorm, d, btn, chip) {
  if (/gerar|criar|publicar/.test(mNorm)) {
    const portal = PORTAIS.find(p => mNorm.includes(p.toLowerCase().replace(' ','')));
    if (portal) return `🔗 Selecione os imóveis e clique em "${portal}".<br><br>${btn('Ir para imóveis','/app/imoveis')}`;
    return `🔗 Para qual portal?<br><br>`+PORTAIS.map(p=>`<button onclick="enviarMsg('gerar xml ${p.toLowerCase()}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${p}</button>`).join('');
  }
  return `🔗 <strong>Portais:</strong> ${PORTAIS.join(' · ')}<br>Selecione imóveis e gere o XML de cada portal.<br><br>${btn('Ver portais','/app/portais')}${btn('Imóveis','/app/imoveis')}`;
}

module.exports = { responder, PORTAIS };
