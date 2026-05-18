// extrator-perfil.js v2.0 — extrai perfil completo do cliente
// Captura TUDO que pode estar relacionado a um imóvel

const TIPOS_RESIDENCIAL = ['apartamento','apto','casa','sobrado','cobertura','studio','kitnet','loft','flat','mansao','chacara','sitio','fazenda','vila'];
const TIPOS_COMERCIAL = ['sala comercial','sala','loja','galpao','galpão','escritorio','escritório','conjunto comercial','conjunto','predio','prédio','hotel','pousada'];
const TODOS_TIPOS = [...TIPOS_RESIDENCIAL, ...TIPOS_COMERCIAL];

const INTENCAO = {
  comprar: ['comprar','compra','quero comprar','adquirir','financiar','financiamento','proprio','próprio'],
  alugar: ['alugar','aluguel','locacao','locação','arrendar','quero alugar','temporada'],
  investir: ['investir','investimento','renda','rentabilidade','retorno','valorizar','renda passiva']
};

const URGENCIA = {
  alta: ['urgente','preciso logo','rápido','rapido','imediato','essa semana','hoje','agora','prazo','mudança imediata'],
  baixa: ['só pesquisando','so pesquisando','sem pressa','futuramente','ano que vem','ainda nao sei','explorando','pesquisando']
};

const FAMILIA = {
  criancas: ['filho','filha','filhos','criança','crianca','bebe','bebê','escola','colegio','colégio'],
  casal: ['casal','minha esposa','meu marido','minha namorada','meu namorado','nós dois','nos dois'],
  sozinho: ['sozinho','só eu','so eu','moro só','moro so','solteiro'],
  pets: ['cachorro','gato','pet','animal','bichinho']
};

const MOTIVACAO = {
  mudanca: ['mudança','mudar','mudando','transferencia','transferência'],
  primeiro_imovel: ['primeiro imóvel','primeira casa','nunca tive','sonho','primeiro ap'],
  investimento: ['investir','renda extra','alugar depois','valorização','valorizacao'],
  upgrade: ['trocar','maior','upgrade','melhorar','imóvel maior','casa maior']
};

const DIFERENCIAIS = {
  piscina: ['piscina'],
  academia: ['academia','gym'],
  churrasqueira: ['churrasqueira','churrasco'],
  varanda: ['varanda','sacada','terraço','terraco'],
  portaria: ['portaria 24h','porteiro','portaria'],
  playground: ['playground','area kids','area de lazer'],
  elevador: ['elevador'],
  seguranca: ['segurança','seguranca','condominio fechado','condomínio fechado','cercado'],
  mobiliado: ['mobiliado','mobília','mobilia','semi mobiliado','com móveis'],
  novo: ['novo','na planta','lançamento','lancamento','nunca habitado'],
  reformado: ['reformado','reformado','renovado','atualizado']
};

const CIDADES = [
  'sao paulo','rio de janeiro','campinas','guarulhos','osasco','santo andre',
  'sao caetano','joinville','blumenau','florianopolis','itajai','navegantes',
  'balneario camboriu','curitiba','porto alegre','belo horizonte','brasilia',
  'goiania','manaus','fortaleza','recife','salvador','natal','maceio','teresina',
  'campo grande','cuiaba','porto velho','macapa','palmas','vitoria','aracaju'
];

const ESTADOS = {
  'sp': ['sao paulo','sp','são paulo'],
  'rj': ['rio de janeiro','rj'],
  'sc': ['santa catarina','sc'],
  'pr': ['parana','paraná','pr'],
  'rs': ['rio grande do sul','rs'],
  'mg': ['minas gerais','mg'],
  'go': ['goias','goiás','go'],
  'df': ['distrito federal','df','brasilia'],
  'ba': ['bahia','ba'],
  'pe': ['pernambuco','pe'],
  'ce': ['ceara','ceará','ce'],
  'am': ['amazonas','am'],
  'pa': ['para','pará','pa'],
  'mt': ['mato grosso','mt'],
  'ms': ['mato grosso do sul','ms'],
  'es': ['espirito santo','espírito santo','es'],
  'se': ['sergipe','se'],
  'al': ['alagoas','al'],
  'rn': ['rio grande do norte','rn'],
  'pb': ['paraiba','paraíba','pb'],
  'pi': ['piaui','piauí','pi'],
  'ma': ['maranhao','maranhão','ma'],
  'to': ['tocantins','to'],
  'ro': ['rondonia','rondônia','ro'],
  'ac': ['acre','ac'],
  'rr': ['roraima','rr'],
  'ap': ['amapa','amapá','ap']
};

function normalizar(txt) {
  return (txt||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\s]/g,' ').trim();
}

function extrairNumero(txt, palavras) {
  for (const p of palavras) {
    const re = new RegExp(p + '\\s*[:]?\\s*(\\d+)', 'i');
    const m = txt.match(re);
    if (m) return parseInt(m[1]);
  }
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
  // até X / máximo X
  const ate = txt.match(/(?:ate|até|maximo|máximo|no maximo|valor|orcamento|budget)?\s*r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(mil(?:hao|hões|hao)?|k(?:\b)|m(?=\b))/i);
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
  return null;
}

function extrairTipo(norm) {
  // Comercial primeiro (mais específico)
  for (const t of TIPOS_COMERCIAL) { if (norm.includes(t)) return { tipo: t, categoria: 'comercial' }; }
  for (const t of TIPOS_RESIDENCIAL) { if (norm.includes(t)) return { tipo: t, categoria: 'residencial' }; }
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
  const resultado = [];
  for (const [tipo, palavras] of Object.entries(FAMILIA)) {
    if (palavras.some(p => norm.includes(p))) resultado.push(tipo);
  }
  return resultado.length > 0 ? resultado : null;
}

function extrairMotivacao(norm) {
  for (const [mot, palavras] of Object.entries(MOTIVACAO)) {
    if (palavras.some(p => norm.includes(p))) return mot;
  }
  return null;
}

function extrairSentimento(norm) {
  if (['otimo','perfeito','adorei','amei','excelente','incrivel','uau','show'].some(p => norm.includes(p))) return 'satisfeito';
  if (['nao gostei','ruim','pessimo','horrivel','decepcionado','chateado'].some(p => norm.includes(p))) return 'frustrado';
  if (['urgente','preciso','rapido','logo'].some(p => norm.includes(p))) return 'impaciente';
  if (['empolgado','animado','adorei','quero muito','amei'].some(p => norm.includes(p))) return 'empolgado';
  return null;
}

function extrairFaseFunil(norm, perfil) {
  if (['fechar','assinar','contrato','proposta','quero esse','vou fechar','quero comprar esse'].some(p => norm.includes(p))) return 'decidido';
  if (['visitar','agendar','quero ver','posso ver','ver pessoalmente','agendar visita'].some(p => norm.includes(p))) return 'interessado';
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
  if (perfil.bairro) score += 1;
  if (perfil.banheiros) score += 0.5;
  if (perfil.cidade) score += 0.5;
  if (score >= 5) return 'quente';
  if (score >= 2) return 'morno';
  return 'frio';
}

function extrairDiferenciais(norm) {
  const encontrados = [];
  for (const [dif, palavras] of Object.entries(DIFERENCIAIS)) {
    if (palavras.some(p => norm.includes(p))) encontrados.push(dif);
  }
  return encontrados.length > 0 ? encontrados : null;
}

function extrairBairro(norm) {
  // Lista de bairros conhecidos SP
  const bairrosConhecidos = [
    'vila olimpia','moema','itaim bibi','brooklin','pinheiros','jardins','perdizes',
    'lapa','santana','tatuape','morumbi','vila madalena','higienopolis','consolacao',
    'bela vista','campo belo','alphaville','granja viana','centro','liberdade',
    'aclimacao','jardim paulista','jardim america','jardim europa','vila nova conceicao',
    'itaim','berrini','faria lima','paulista','ibirapuera','mooca','ipiranga',
    'saude','paraiso','vila mariana','jabaquara','santo amaro','socorro',
    // SC
    'balneario camboriu','itapema','centro','norte','sul','leste','oeste',
    'bombinhas','porto belo','penha','barra velha','picarras','tijucas'
  ];
  for (const b of bairrosConhecidos) { if (norm.includes(b)) return b; }
  // Padrão preposição
  const bm = norm.match(/\b(?:em|no|na|bairro|regiao|região|proximo a|perto de)\s+([a-z\s]{3,30}?)(?:,|\.|\s{2}|$)/);
  if (bm) return bm[1].trim();
  // Fallback vírgula
  const partes = norm.split(',').map(p=>p.trim()).filter(p=>p.length>3&&!p.match(/^\d/)&&!TODOS_TIPOS.includes(p.split(' ')[0]));
  if (partes.length>1) return partes[partes.length-1].split(' ').slice(0,4).join(' ');
  return null;
}

function extrairPerfil(mensagens) {
  if (!mensagens || !mensagens.length) return {};

  const textoTotal = mensagens
    .filter(m => m.de === 'cliente')
    .map(m => m.texto || '')
    .join(' ');

  const norm = normalizar(textoTotal);
  const perfil = {};

  // Tipo + categoria
  const tipoResult = extrairTipo(norm);
  if (tipoResult) { perfil.tipo = tipoResult.tipo; perfil.categoria = tipoResult.categoria; }

  // Quartos / dormitórios
  const quartos = extrairNumero(norm, ['quarto','quartos','dormitorio','dormitorios','dorm','dorms']);
  if (quartos) perfil.quartos = quartos;

  // Suítes
  const suites = extrairNumero(norm, ['suite','suites','suíte','suítes']);
  if (suites) perfil.suites = suites;

  // Banheiros
  const banheiros = extrairNumero(norm, ['banheiro','banheiros','lavabo','lavabos','wc']);
  if (banheiros) perfil.banheiros = banheiros;

  // Vagas
  const vagas = extrairNumero(norm, ['vaga','vagas','garagem','garagens','estacionamento']);
  if (vagas) perfil.vagas = vagas;

  // Área
  const area = extrairNumero(norm, ['m2','metros','m²','area','área','metragem']);
  if (area) perfil.area = area;

  // Andar
  const andar = extrairNumero(norm, ['andar','andares','piso']);
  if (andar) perfil.andar = andar;

  // Valor
  const valor = extrairValor(norm);
  if (valor) Object.assign(perfil, valor);

  // Bairro
  const bairro = extrairBairro(norm);
  // Só salva como bairro se não for uma cidade conhecida
  const CIDADES_SET = new Set(CIDADES.map(c => c.toLowerCase()));
  if (bairro && !CIDADES_SET.has(bairro.toLowerCase())) perfil.bairro = bairro;

  // Cidade
  for (const cidade of CIDADES) { if (norm.includes(cidade)) { perfil.cidade = cidade; break; } }

  // Estado
  for (const [sigla, nomes] of Object.entries(ESTADOS)) {
    if (nomes.some(n => norm.includes(n))) { perfil.estado = sigla; break; }
  }

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

  // Diferenciais desejados
  const diferenciais = extrairDiferenciais(norm);
  if (diferenciais) perfil.diferenciais = diferenciais;

  // Fase funil
  perfil.faseFunil = extrairFaseFunil(norm, perfil);

  // Temperatura
  perfil.temperatura = extrairTemperatura(perfil);

  return perfil;
}

module.exports = { extrairPerfil };
