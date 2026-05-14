'use strict';

// Dicionário semântico — mapeia conceitos para atributos reais
var SEMANTICA = {
  // Tamanho
  'grande': { campo: 'area_m2', operador: 'gte', valor: 100 },
  'enorme': { campo: 'area_m2', operador: 'gte', valor: 150 },
  'espacoso': { campo: 'area_m2', operador: 'gte', valor: 100 },
  'amplo': { campo: 'area_m2', operador: 'gte', valor: 90 },
  'pequeno': { campo: 'area_m2', operador: 'lte', valor: 50 },
  'compacto': { campo: 'area_m2', operador: 'lte', valor: 60 },
  'enxuto': { campo: 'area_m2', operador: 'lte', valor: 55 },

  // Valor
  'barato': { campo: 'valor_imovel', operador: 'lte', valor: 400000 },
  'acessivel': { campo: 'valor_imovel', operador: 'lte', valor: 500000 },
  'em conta': { campo: 'valor_imovel', operador: 'lte', valor: 450000 },
  'economico': { campo: 'valor_imovel', operador: 'lte', valor: 350000 },
  'caro': { campo: 'valor_imovel', operador: 'gte', valor: 1000000 },
  'luxuoso': { campo: 'valor_imovel', operador: 'gte', valor: 1500000 },
  'premium': { campo: 'valor_imovel', operador: 'gte', valor: 1200000 },
  'alto padrao': { campo: 'valor_imovel', operador: 'gte', valor: 1000000 },

  // Quartos
  'familia grande': { campo: 'quartos', operador: 'gte', valor: 4 },
  'casal': { campo: 'quartos', operador: 'gte', valor: 2 },
  'solteiro': { campo: 'quartos', operador: 'lte', valor: 1 },
  'para casal': { campo: 'quartos', operador: 'gte', valor: 2 },
  'para familia': { campo: 'quartos', operador: 'gte', valor: 3 },

  // Características
  'com garagem': { campo: 'vagas', operador: 'gte', valor: 1 },
  'com vaga': { campo: 'vagas', operador: 'gte', valor: 1 },
  'sem garagem': { campo: 'vagas', operador: 'eq', valor: 0 },
  'com suite': { campo: 'suites', operador: 'gte', valor: 1 },
};

function aplicarFiltroSemantico(campo, operador, valor, item) {
  var v = Number(item[campo] || 0);
  if (operador === 'gte') return v >= valor;
  if (operador === 'lte') return v <= valor;
  if (operador === 'eq') return v === valor;
  return true;
}

function buscarSemantico(texto, colecao) {
  var t = String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  var filtrosAplicados = [];
  var resultado = colecao;

  Object.entries(SEMANTICA).forEach(function(entry) {
    var termo = entry[0], config = entry[1];
    if (t.includes(termo)) {
      resultado = resultado.filter(function(item) {
        return aplicarFiltroSemantico(config.campo, config.operador, config.valor, item);
      });
      filtrosAplicados.push(termo);
    }
  });

  return { resultado: resultado, filtros: filtrosAplicados, usouSemantica: filtrosAplicados.length > 0 };
}

function enriquecerResposta(busca, btn, chip) {
  if (!busca.usouSemantica) return null;
  var html = '🧠 <strong>Busca semântica</strong> — entendi: <em>' + busca.filtros.join(', ') + '</em><br><br>';
  if (!busca.resultado.length) {
    html += '😔 Nenhum resultado com esses critérios semânticos.<br><br>' + chip('Ampliar busca', 'meus imoveis');
    return html;
  }
  html += '🏠 <strong>' + busca.resultado.length + ' resultado(s):</strong><br>';
  busca.resultado.slice(0,5).forEach(function(i) {
    var val = i.valor_imovel ? 'R$' + Number(i.valor_imovel).toLocaleString('pt-BR') : '';
    html += '<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin:3px 0">' +
      '<strong>' + (i.tipo||i.nome||'Item') + '</strong>' +
      (i.bairro?' — '+i.bairro:'') +
      (i.quartos?' · '+i.quartos+'q':'') +
      (i.area_m2?' · '+i.area_m2+'m²':'') +
      (val?' · <strong>'+val+'</strong>':'') +
      '</div>';
  });
  if (busca.resultado.length > 5) html += '<em style="font-size:12px">...e mais ' + (busca.resultado.length-5) + '</em>';
  html += '<br>' + btn('Ver todos', '/app/imoveis');
  return html;
}

module.exports = { buscarSemantico, enriquecerResposta, SEMANTICA };
