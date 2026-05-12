const CORRECOES = [
  [/proprie?ri?t[oa]s?/g, 'proprietario'],
  [/propiet[oa]ri[oa]s?/g, 'proprietario'],
  [/proprietorio/g, 'proprietario'],
  [/propriaterio/g, 'proprietario'],
  [/proprieritos/g, 'proprietarios'],

  [/viteinre|vitrne|vitine|vitrine/g, 'vitrine'],
  [/dtlhes|detlahes|detalhse|detlhe/g, 'detalhes'],
  [/leds?/g, 'lead'],
  [/lids?/g, 'lead'],
  [/cadsatrad[oa]s?/g, 'cadastrado'],
  [/cadstrad[oa]s?/g, 'cadastrado'],
  [/solciita|solcit|solicitao/g, 'solicitacao'],
  [/pequeisa|pesqusa|pesquiza/g, 'pesquisa'],
  [/imovei\b|imovel\b/g, 'imovel'],
  [/imoveis|imóveis/g, 'imoveis'],
  [/whta|whats|whts|zap/g, 'whatsapp']
];

function limparAcentos(txt='') {
  return String(txt)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'');
}

function normalizarMensagem(msg='') {
  let m = limparAcentos(String(msg || '').toLowerCase());

  for (const [regex, rep] of CORRECOES) {
    m = m.replace(regex, rep);
  }

  m = m
    .replace(/\s+/g,' ')
    .trim();

  return m;
}

function detectarIntencao(m='') {
  const txt = normalizarMensagem(m);

  if (/quando.*lead|lead.*entrou|lead.*cadastrad|data.*lead/.test(txt)) {
    return 'DATA_LEAD';
  }

  if (/buscar lead|ache lead|achar lead|encontrar lead|localizar lead|procure lead/.test(txt)) {
    return 'BUSCAR_LEAD';
  }

  if (/link.*lead|pagina.*lead|detalhes.*lead/.test(txt)) {
    return 'LINK_LEAD';
  }

  if (/vitrine.*lead|lead.*vitrine|vitrine.*cliente|tem.*vitrine|minhas vitrines|vitrines prontas/.test(txt)) {
    return 'VITRINE';
  }

  if (/proprietario|proprietarios|dono/.test(txt)) {
    return 'PROPRIETARIO';
  }

  if (/(hoje|ontem|amanha|anteontem|semana|mes|ultimos|data)/.test(txt)) {
    return 'DATA';
  }

  return '';
}

module.exports = {
  normalizarMensagem,
  detectarIntencao
};
