// extrator-perfil.js — extrai perfil completo do cliente a partir de mensagens WhatsApp

const TIPOS = ['apartamento','apto','casa','sobrado','sala','comercial','terreno','lote','cobertura','studio','kitnet','galpao','chacara','sitio'];
const INTENCAO = {
  comprar: ['comprar','compra','quero comprar','quero adquirir','adquirir','financiar','financiamento'],
  alugar: ['alugar','aluguel','locacao','locação','arrendar','quero alugar'],
  investir: ['investir','investimento','renda','rentabilidade','retorno','valorizar']
};
const URGENCIA = {
  alta: ['urgente','preciso logo','rápido','imediato','essa semana','hoje','agora','prazo'],
  baixa: ['só pesquisando','sem pressa','futuramente','ano que vem','ainda não sei','explorando']
};
const FAMILIA = {
  criancas: ['filho','filha','filhos','criança','bebê','escola','colegio'],
  casal: ['casal','minha esposa','meu marido','minha namorada','meu namorado','nós dois'],
  sozinho: ['sozinho','só eu','moro só','solteiro']
};
const MOTIVACAO = {
  mudanca: ['mudança','mudar','mudando','transferencia','transferência'],
  primeiro_imovel: ['primeiro imóvel','primeira casa','nunca tive','sonho'],
  investimento: ['investir','renda extra','alugar depois','valorização'],
  upgrade: ['trocar','maior','upgrade','melhorar de imóvel']
};

function normalizar(txt) {
  return txt.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\w\s]/g,' ');
}

function extrairNumero(txt, palavras) {
  for (const p of palavras) {
    const re = new RegExp(p + '\\s*[:]?\\s*(\\d+)', 'i');
    const m = txt.match(re);
    if (m) return parseInt(m[1]);
  }
  // número antes da palavra
  for (const p of palavras) {
    const re = new RegExp('(\\d+)\\s*' + p, 'i');
    const m = txt.match(re);
    if (m) return parseInt(m[1]);
  }
  return null;
}

function extrairValor(txt) {
  // entre X e Y
  const entre = txt.match(/entre\s*r?\$?\s*([\d.,]+)\s*(mil|k|m)?\s*(?:e|a)\s*r?\$?\s*([\d.,]+)\s*(mil|k)?/i);
  if (entre) {
    let vmin = parseFloat(entre[1].replace(/\./g,'').replace(',','.'));
    let vmax = parseFloat(entre[3].replace(/\./g,'').replace(',','.'));
    if ((entre[2]||'').match(/mil|k/i)) vmin *= 1000;
    if ((entre[4]||'').match(/mil|k/i)) vmax *= 1000;
    if ((entre[2]||'').match(/^m$/i)) vmin *= 1000000;
    if ((entre[4]||'').match(/^m$/i)) vmax *= 1000000;
    return { valorMin: vmin, valorMax: vmax };
  }
  // até X
  const ate = txt.match(/(?:ate|até|maximo|máximo|no maximo)\s*r?\$?\s*([\d.,]+)\s*(mil|k|m)?/i);
  if (ate) {
    let v = parseFloat(ate[1].replace(/\./g,'').replace(',','.'));
    if ((ate[2]||'').match(/mil|k/i)) v *= 1000;
    if ((ate[2]||'').match(/^m$/i)) v *= 1000000;
    return { valorMax: v };
  }
  // R$ X
  const val = txt.match(/r?\$\s*([\d.,]+)\s*(mil|k|m)?/i);
  if (val) {
    let v = parseFloat(val[1].replace(/\./g,'').replace(',','.'));
    if ((val[2]||'').match(/mil|k/i)) v *= 1000;
    if ((val[2]||'').match(/^m$/i)) v *= 1000000;
    return { valorMax: v };
  }
  // numero mil/k sem prefixo ex: "750 mil", "500k"
  const numMil = txt.match(/\b(\d[\d.,]*)\s*(mil|k\b)/i);
  if (numMil) {
    let v = parseFloat(numMil[1].replace(/\./g,'').replace(',','.')) * 1000;
    return { valorMax: v };
  }
  return null;
}

function extrairTipo(norm) {
  for (const t of TIPOS) {
    if (norm.includes(t)) return t;
  }
  return null;
}

function extrairIntencao(norm) {
  for (const [intencao, palavras] of Object.entries(INTENCAO)) {
    if (palavras.some(p => norm.includes(p))) return intencao;
  }
  return null;
}

function extrairUrgencia(norm) {
  if (URGENCIA.alta.some(p => norm.includes(p))) return 'alta';
  if (URGENCIA.baixa.some(p => norm.includes(p))) return 'baixa';
  return null;
}

function extrairFamilia(norm) {
  for (const [tipo, palavras] of Object.entries(FAMILIA)) {
    if (palavras.some(p => norm.includes(p))) return tipo;
  }
  return null;
}

function extrairMotivacao(norm) {
  for (const [mot, palavras] of Object.entries(MOTIVACAO)) {
    if (palavras.some(p => norm.includes(p))) return mot;
  }
  return null;
}

function extrairSentimento(norm) {
  if (['otimo','ótimo','perfeito','adorei','amei','excelente','incrivel','uau'].some(p => norm.includes(p))) return 'satisfeito';
  if (['nao gostei','não gostei','ruim','pessimo','horrivel','decepcionado'].some(p => norm.includes(p))) return 'frustrado';
  if (['urgente','preciso','rapido','logo'].some(p => norm.includes(p))) return 'impaciente';
  if (['empolgado','animado','adorei','quero muito'].some(p => norm.includes(p))) return 'empolgado';
  return null;
}

function extrairFaseFunil(norm, perfil) {
  if (['fechar','assinar','contrato','proposta','quero esse'].some(p => norm.includes(p))) return 'decidido';
  if (['visitar','agendar','quero ver','posso ver'].some(p => norm.includes(p))) return 'interessado';
  if (perfil.intencao || perfil.tipo || perfil.valorMax) return 'qualificado';
  return 'novo';
}

function extrairTemperatura(perfil) {
  let score = 0;
  if (perfil.urgencia === 'alta') score += 3;
  if (perfil.faseFunil === 'decidido') score += 3;
  if (perfil.faseFunil === 'interessado') score += 2;
  if (perfil.intencao) score += 1;
  if (perfil.valorMax || perfil.valorMin) score += 1;
  if (perfil.quartos) score += 1;
  if (score >= 5) return 'quente';
  if (score >= 2) return 'morno';
  return 'frio';
}

function extrairPerfil(mensagens) {
  if (!mensagens || !mensagens.length) return {};
  
  // Concatena todas as mensagens do cliente
  const textoTotal = mensagens
    .filter(m => m.de === 'cliente')
    .map(m => m.texto || '')
    .join(' ');
  
  const norm = normalizar(textoTotal);
  const perfil = {};

  // Tipo
  const tipo = extrairTipo(norm);
  if (tipo) perfil.tipo = tipo;

  // Quartos
  const quartos = extrairNumero(norm, ['quarto','quartos','dormitorio','dormitorios','suite','suites']);
  if (quartos) perfil.quartos = quartos;

  // Suítes
  const suites = extrairNumero(norm, ['suite','suites']);
  if (suites) perfil.suites = suites;

  // Vagas
  const vagas = extrairNumero(norm, ['vaga','vagas','garagem','garagens']);
  if (vagas) perfil.vagas = vagas;

  // Área
  const area = extrairNumero(norm, ['m2','metros','m²','area','área']);
  if (area) perfil.area = area;

  // Bairro — lista conhecida + preposicao + fallback virgula
  const _bairros = ['vila olimpia','moema','itaim','brooklin','pinheiros','jardins','perdizes','lapa','santana','tatuape','morumbi','alphaville','campinas','balneario camboriu','itapema','florianopolis','joinville','blumenau','itajai','navegantes','biguacu','palhoca','garopaba','bombinhas','centro'];
  let _bairro = null;
  for (const b of _bairros) { if (norm.includes(b)) { _bairro = b; break; } }
  if (_bairro) perfil.bairro = _bairro;

  // Valor
  const valor = extrairValor(norm);
  if (valor) Object.assign(perfil, valor);

  // Intenção
  const intencao = extrairIntencao(norm);
  if (intencao) perfil.intencao = intencao;

  // Urgência
  const urgencia = extrairUrgencia(norm);
  if (urgencia) perfil.urgencia = urgencia;

  // Família
  const familia = extrairFamilia(norm);
  if (familia) perfil.familia = familia;

  // Motivação
  const motivacao = extrairMotivacao(norm);
  if (motivacao) perfil.motivacao = motivacao;

  // Sentimento
  const sentimento = extrairSentimento(norm);
  if (sentimento) perfil.sentimento = sentimento;

  // Fase funil
  perfil.faseFunil = extrairFaseFunil(norm, perfil);

  // Temperatura
  perfil.temperatura = extrairTemperatura(perfil);

  return perfil;
}

module.exports = { extrairPerfil };
