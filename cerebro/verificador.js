'use strict';

function verificarResposta(resposta, dados, intencao) {
  var problemas = [];
  var r = String(resposta || '');
  var d = dados || {};

  // Verifica se resposta tem dados reais quando deveria ter
  if (intencao === 'ver_leads' && d.leads === 0 && !r.includes('nenhuma')) {
    problemas.push('resposta fala de leads mas conta não tem nenhuma');
  }
  if (intencao === 'ver_imoveis' && d.ativos === 0 && !r.includes('nenhum')) {
    problemas.push('resposta fala de imóveis mas conta não tem nenhum');
  }

  // Verifica se resposta é muito curta para a pergunta
  if (r.length < 20 && intencao !== 'saudacao') {
    problemas.push('resposta muito curta para a intenção detectada');
  }

  // Verifica se há números inconsistentes
  var nums = r.match(/d+/g) || [];
  nums.forEach(function(n) {
    var v = parseInt(n);
    if (intencao === 'ver_leads' && v > 10000) problemas.push('número suspeito de leads: ' + v);
    if (intencao === 'ver_imoveis' && v > 50000) problemas.push('número suspeito de imóveis: ' + v);
  });

  // Verifica se resposta é relevante para intenção
  var relevancia = {
    ver_leads:    /lead|cliente|match|importar/,
    ver_imoveis:  /imovel|carteira|ativo|bairro/,
    ver_visitas:  /visita|agendamento|confirmar/,
    fazer_match:  /match|combinar|cruzar/,
    ver_mercado:  /bairro|demanda|mercado|oferta/,
  };
  if (relevancia[intencao] && !relevancia[intencao].test(r.toLowerCase())) {
    problemas.push('resposta pode não ser relevante para: ' + intencao);
  }

  return { ok: problemas.length === 0, problemas: problemas, confianca: problemas.length === 0 ? 'alta' : problemas.length === 1 ? 'media' : 'baixa' };
}

function adicionarCalibracaoIncerteza(resposta, verificacao) {
  if (verificacao.confianca === 'alta') return resposta;
  if (verificacao.confianca === 'media') return resposta + '<br><br><span style="font-size:12px;color:var(--color-text-secondary)">ℹ️ Se precisar de mais detalhes, pode perguntar!</span>';
  return '<span style="font-size:12px;color:var(--color-text-secondary)">⚠️ Não tenho certeza sobre essa resposta. Verifique em:</span><br><br>' + resposta;
}

module.exports = { verificarResposta, adicionarCalibracaoIncerteza };
