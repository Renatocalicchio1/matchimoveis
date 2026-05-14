'use strict';

var EMOCOES = {
  URGENTE:    { padroes: /desesperado|urgente|preciso agora|rapido|ja|imediato|socorro|nao aguento|critico|emergencia/, emoji: '🚨', tom: 'direto' },
  ANIMADO:    { padroes: /otimo|incrivel|que bom|maravilhoso|perfeito|excelente|amei|adorei|topou|fechou|vendeu|consegui/, emoji: '🎉', tom: 'celebrar' },
  FRUSTRADO:  { padroes: /nao funciona|que raiva|impossivel|nao consigo|travado|emperrado|problema|erro|falhou|nao saiu/, emoji: '😤', tom: 'calmo' },
  CONFUSO:    { padroes: /nao entendo|nao sei|como faz|me explica|nao consigo|perdido|que e isso|o que e|como funciona/, emoji: '🤔', tom: 'didatico' },
  NEGOCIANDO: { padroes: /caro|valor|preco|desconto|negociar|proposta|contra proposta|pechinchar|barato|reducao/, emoji: '🤝', tom: 'estrategico' },
  PREOCUPADO: { padroes: /preocupado|medo|risco|cuidado|atencao|perigoso|nao quero perder|pode dar errado/, emoji: '😟', tom: 'tranquilizar' },
  SATISFEITO: { padroes: /obrigado|valeu|ajudou|resolveu|funcionou|deu certo|consegui|perfeito|show|muito bom/, emoji: '😊', tom: 'positivo' }
};

var URGENCIA = {
  ALTA:   /hoje|agora|urgente|ja|imediato|rapido|preciso logo|nao pode esperar|antes de|ainda hoje/,
  MEDIA:  /amanha|essa semana|em breve|logo|nos proximos dias|ate sexta|ate segunda/,
  BAIXA:  /quando puder|sem pressa|calma|tranquilo|pode ser depois|qualquer hora/
};

function detectarEmocao(texto) {
  var t = String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  for (var nome in EMOCOES) {
    if (EMOCOES[nome].padroes.test(t)) return { emocao: nome, emoji: EMOCOES[nome].emoji, tom: EMOCOES[nome].tom };
  }
  return { emocao: 'NEUTRO', emoji: '', tom: 'normal' };
}

function detectarUrgencia(texto) {
  var t = String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  if (URGENCIA.ALTA.test(t)) return 'ALTA';
  if (URGENCIA.MEDIA.test(t)) return 'MEDIA';
  if (URGENCIA.BAIXA.test(t)) return 'BAIXA';
  return 'NORMAL';
}

function adaptarResposta(resposta, emocaoObj, urgencia) {
  var prefixos = {
    URGENTE:    '🚨 Entendido, vamos resolver agora!<br><br>',
    ANIMADO:    '🎉 Que ótima notícia!<br><br>',
    FRUSTRADO:  '😤 Entendo sua frustração. Vamos resolver isso.<br><br>',
    CONFUSO:    '🤔 Sem problema, vou explicar passo a passo.<br><br>',
    NEGOCIANDO: '🤝 Boa estratégia! Veja o que tenho:<br><br>',
    PREOCUPADO: '😊 Calma, vou te orientar.<br><br>',
    SATISFEITO: '😊 Fico feliz em ajudar!<br><br>',
    NEUTRO:     ''
  };
  var prefixo = prefixos[emocaoObj.emocao] || '';
  if (urgencia === 'ALTA' && emocaoObj.emocao === 'NEUTRO') prefixo = '⚡ Resolvendo agora:<br><br>';
  return prefixo + resposta;
}

function aprenderEstilo(userId, mensagem) {
  var t = String(mensagem);
  var estilo = { curto: t.length < 30, usaGiria: /vc|pra|ta|to|tbm|tb|kd|kkk|haha|rsrs/.test(t.toLowerCase()), formal: /poderia|gostaria|solicito|prezado|segue/.test(t.toLowerCase()) };
  return estilo;
}

module.exports = { detectarEmocao, detectarUrgencia, adaptarResposta, aprenderEstilo, EMOCOES };
