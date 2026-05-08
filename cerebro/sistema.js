'use strict';

const EXPLICACOES = {
  match:   'Match é quando um imóvel da sua carteira combina com o que um lead procura. O sistema cruza bairro + tipo + quartos automaticamente.',
  vitrine: 'Vitrine é uma página exclusiva enviada ao lead com os imóveis em match. O lead escolhe e solicita visita — tudo automático!',
  score:   'Score define a ordem na vitrine: valor abaixo do máximo +50pts, área maior +30pts, quartos extras +20pts, suítes +15pts, vagas +15pts.',
  lead:    'Lead é um cliente interessado em comprar ou alugar. Você importa planilhas dos portais e o sistema faz o match automático.',
  xml:     'XML é o arquivo que envia seus imóveis para portais (VivaReal, ZAP, OLX). Gere aqui e cadastre o link no portal.',
  coins:   'Match Coins são pontos ganhos a cada match realizado. Futuramente usados para recursos premium.',
  visita:  'Fluxo: Lead recebe vitrine → escolhe imóvel → solicita visita → proprietário confirma/recusa → lead notificado. Tudo automático!'
};

const AJUDA = [
  {emoji:'👥',label:'Leads',      msg:'minhas leads'},
  {emoji:'🏠',label:'Imóveis',    msg:'meus imoveis'},
  {emoji:'📅',label:'Visitas',    msg:'minhas visitas'},
  {emoji:'🎯',label:'Match',      msg:'ver match'},
  {emoji:'🔗',label:'Portais',    msg:'ver portais'},
  {emoji:'🪙',label:'Coins',      msg:'meus coins'},
  {emoji:'🔔',label:'Notificações',msg:'notificacoes'},
  {emoji:'📊',label:'Resumo',     msg:'resumo geral'},
];

function responder(mNorm, d, btn, chip) {
  for (const [key, texto] of Object.entries(EXPLICACOES)) {
    if (mNorm.includes(key))
      return `💡 <strong>${key.charAt(0).toUpperCase()+key.slice(1)}</strong><br><br>${texto}<br><br>${chip('❓ Mais ajuda','ajuda')}`;
  }
  return `🤖 <strong>Sou o Match, seu assistente.</strong> Posso te ajudar com:<br><br>`+
    AJUDA.map(i=>`<button onclick="enviarMsg('${i.msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${i.emoji} ${i.label}</button>`).join('');
}

module.exports = { EXPLICACOES, responder };
