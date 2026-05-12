'use strict';

function limpar(txt='') {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

const STOPWORDS = [
  'lead','leads','cliente','clientes',
  'imovel','imoveis',
  'pagina','paginas',
  'detalhe','detalhes',
  'link',
  'da','do','de','dos','das',
  'a','o','as','os',
  'para','pra',
  'quando',
  'entrou',
  'cadastrou',
  'cadastrada',
  'foi',
  'tem',
  'existe',
  'mostrar',
  'mostra',
  'abrir',
  'mande',
  'enviar',
  'buscar',
  'ache',
  'achar',
  'encontrar',
  'procure',
  'vitrine',
  'vitrines'
];

function extrairNome(txt='') {
  const partes = limpar(txt)
    .split(' ')
    .filter(p => p && !STOPWORDS.includes(p));

  return partes.join(' ').trim();
}

function detectarAcao(txt='') {
  txt = limpar(txt);

  if (/quando|data|entrou|cadastr/.test(txt)) {
    return 'DATA';
  }

  if (/link|pagina|pagina da|detalhe|detalhes|abrir/.test(txt)) {
    return 'LINK';
  }

  if (/vitrine/.test(txt)) {
    return 'VITRINE';
  }

  if (/proprietario|dono/.test(txt)) {
    return 'PROPRIETARIO';
  }

  if (/buscar|ache|achar|encontrar|procure/.test(txt)) {
    return 'BUSCAR';
  }

  return '';
}

function detectarEntidade(txt='') {
  txt = limpar(txt);

  if (/lead|cliente/.test(txt)) {
    return 'LEAD';
  }

  if (/imovel|imoveis|casa|apartamento/.test(txt)) {
    return 'IMOVEL';
  }

  if (/visita/.test(txt)) {
    return 'VISITA';
  }

  if (/proprietario|dono/.test(txt)) {
    return 'PROPRIETARIO';
  }

  if (/vitrine/.test(txt)) {
    return 'VITRINE';
  }

  return '';
}

function analisar(txt='') {

  const entidade = detectarEntidade(txt);
  const acao = detectarAcao(txt);
  const nome = extrairNome(txt);

  return {
    entidade,
    acao,
    nome,
    bruto: txt
  };
}

module.exports = {
  analisar,
  extrairNome,
  detectarAcao,
  detectarEntidade
};
