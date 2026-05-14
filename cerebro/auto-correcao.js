'use strict';
var memoriaConversa = require('./memoria-conversa');

// Detecta se usuário está corrigindo o assistente
function detectarCorrecao(texto) {
  var t = String(texto).toLowerCase();
  return {
    eCorrecao: /nao e isso|nao foi isso|errou|errado|incorreto|nao era|me entendeu errado|nao entendeu|nao e assim|ta errado|nao e bem assim|nao e o que quis dizer/.test(t),
    querReformular: /reformula|tenta de novo|refaz|tenta outra vez|nao gostei|muda|outra abordagem|diferente/.test(t),
    discordancia: /nao concordo|discordo|nao acho|acho que nao|pelo contrario|na verdade/.test(t)
  };
}

// Gera resposta de auto-correção
function responderCorrecao(tipo, mensagem, ultimaResposta, btn, chip) {
  if (tipo.eCorrecao) {
    return '<div style="background:#fff8f0;border-left:3px solid #f59e0b;border-radius:10px;padding:14px">' +
      '🙏 Desculpe o mal-entendido! Vou tentar de novo.<br><br>' +
      'Pode me explicar melhor o que você queria saber? Ou use os botões:<br><br>' +
      chip('Tentar de novo', mensagem) +
      chip('Ver leads', 'minhas leads') +
      chip('Ver imóveis', 'meus imoveis') +
      '</div>';
  }
  if (tipo.querReformular) {
    return '<div style="background:#f0f9ff;border-left:3px solid #3b82f6;border-radius:10px;padding:14px">' +
      '🔄 Claro! Vou abordar de forma diferente.<br><br>' +
      'Qual aspecto você quer que eu foque?<br><br>' +
      chip('Mais detalhes', 'me conta mais sobre isso') +
      chip('Mais simples', 'explica de forma simples') +
      chip('Com exemplos', 'me da um exemplo') +
      '</div>';
  }
  if (tipo.discordancia) {
    return '<div style="background:#f9f9f9;border-radius:10px;padding:14px">' +
      '🤔 Entendo sua perspectiva! Me conta mais sobre o que você acha.<br><br>' +
      'Pode me dar mais contexto para eu ajudar melhor?</div>';
  }
  return null;
}

// Detecta perguntas de follow-up sobre a resposta anterior
function detectarFollowUp(texto, historico) {
  var t = String(texto).toLowerCase();
  var pronomes = /isso|esse|essa|ele|ela|aquele|aquela|o mesmo|a mesma|disso|desse|nesse|nessa/;
  if (!pronomes.test(t)) return false;
  return historico && historico.length > 0;
}

module.exports = { detectarCorrecao, responderCorrecao, detectarFollowUp };
