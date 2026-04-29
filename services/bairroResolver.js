function clean(v='') {
  return String(v).replace(/\s+/g,' ').trim();
}

function isInvalid(b) {
  if (!b) return true;
  if (/^\d+$/.test(b)) return true;
  if (b.length > 40) return true;
  if (/rua|avenida|estrada/i.test(b)) return true;
  if (/comprar|alugar|guia|cep/i.test(b)) return true;
  return false;
}

function fromPlanilha(lead) {
  return clean(lead.bairro || '');
}

function fromTexto(text='') {
  let m;

  // padrão forte: "em Bairro com X quartos"
  m = text.match(/em\s+([A-Za-zÀ-ÿ\s]+)\s+com\s+\d+\s+quartos/i);
  if (m) return clean(m[1]);

  // breadcrumb ImovelWeb
  m = text.match(/São Paulo\s+São Paulo\s+([A-Za-zÀ-ÿ\s]+)/i);
  if (m) return clean(m[1]);

  // endereço padrão
  m = text.match(/Rua[^,]+,\s*([^,]+),\s*São Paulo/i);
  if (m) return clean(m[1]);

  return '';
}

function fromRua(logradouro='') {
  const mapa = {
    'estado de israel': 'Vila Clementino',
    'piassanguaba': 'Planalto Paulista',
    'carlos sampaio': 'Bela Vista',
    'nicolau zarvos': 'Parque Jabaquara',
    'das flechas': 'Jardim Prudência'
  };

  const l = logradouro.toLowerCase();

  for (const k in mapa) {
    if (l.includes(k)) return mapa[k];
  }

  return '';
}

function resolveBairro({ lead, text, logradouro }) {

  let b;

  // 1. planilha
  b = fromPlanilha(lead);
  if (!isInvalid(b)) return b;

  // 2. texto
  b = fromTexto(text);
  if (!isInvalid(b)) return b;

  // 3. rua
  b = fromRua(logradouro);
  if (!isInvalid(b)) return b;

  return '';
}

module.exports = { resolveBairro };
