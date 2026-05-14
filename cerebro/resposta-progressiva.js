'use strict';

function querMaisDetalhes(texto) {
  var t = String(texto).toLowerCase();
  return /mais detalhes|me conta mais|explica melhor|aprofunda|como assim|por que|detalha|fala mais|e dai|e depois|continua|quero saber mais/.test(t);
}

function querMaisCurto(texto) {
  var t = String(texto).toLowerCase();
  return /resumo|resumido|curto|rapido|so o essencial|simplifica|sem detalhes|so o numero|direto ao ponto/.test(t);
}

function resumir(html) {
  var texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return texto.slice(0, 150) + (texto.length > 150 ? '...' : '');
}

function adicionarVerMais(html) {
  if (html.length < 300) return html;
  var resumo = resumir(html);
  var btnStyle = 'background:#f3f4f6;border:none;border-radius:20px;padding:6px 14px;cursor:pointer;font-size:12px';
  var parte1 = '<div id="resp-curta">' + resumo + '<br><br>';
  parte1 += '<button onclick="document.getElementById(' + "'resp-curta'" + ').style.display=' + "'none'" + ';document.getElementById(' + "'resp-completa'" + ').style.display=' + "'block'" + '" style="' + btnStyle + '">Ver mais</button></div>';
  var parte2 = '<div id="resp-completa" style="display:none">' + html + '<br>';
  parte2 += '<button onclick="document.getElementById(' + "'resp-completa'" + ').style.display=' + "'none'" + ';document.getElementById(' + "'resp-curta'" + ').style.display=' + "'block'" + '" style="' + btnStyle + '">Ver menos</button></div>';
  return parte1 + parte2;
}

function gerarEmCamadas(resumoTexto, detalhesHtml) {
  var btnStyle = 'background:#f3f4f6;border:none;border-radius:20px;padding:6px 14px;cursor:pointer;font-size:12px;color:var(--color-text-secondary)';
  return '<div>' + resumoTexto + '<br><br>' +
    '<button onclick="this.parentElement.querySelector(' + "'.detalhes'" + ').style.display=' + "'block'" + ';this.style.display=' + "'none'" + '" style="' + btnStyle + '">Ver detalhes</button>' +
    '<div class="detalhes" style="display:none;margin-top:10px">' + detalhesHtml + '</div>' +
    '</div>';
}

module.exports = { querMaisDetalhes, querMaisCurto, resumir, adicionarVerMais, gerarEmCamadas };
