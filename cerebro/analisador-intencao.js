/**
 * analisador-intencao.js
 * Motor Dinâmico de Intenção Imobiliária
 * 
 * Filosofia: nunca sobrescreve — acumula evidências.
 * Cada sinal tem: valor, score (0-100), confianca (0-100), peso, timestamp, origem.
 * Decay temporal: sinais antigos perdem força gradualmente.
 */

const { extrairPerfil } = require('./extrator-perfil');

const DECAY_RATE = 0.95; // perda de 5% por dia
const DECAY_MIN  = 0.10; // nunca cai abaixo de 10% do peso original

// ─── DECAY TEMPORAL ───────────────────────────────────────────
function calcularDecay(timestampISO) {
  const diasAtras = (Date.now() - new Date(timestampISO).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(DECAY_MIN, Math.pow(DECAY_RATE, diasAtras));
}

// ─── ADICIONAR OU ATUALIZAR SINAL ─────────────────────────────
// Nunca sobrescreve — acumula evidências. Se o valor já existe, aumenta o score.
// Se é novo, adiciona com score inicial.
function acumularSinal(lista, valor, scoreDelta, confianca, origem) {
  if (!valor && valor !== 0) return lista;
  const existente = lista.find(s => String(s.valor) === String(valor));
  if (existente) {
    existente.score      = Math.min(100, existente.score + scoreDelta * 0.5);
    existente.confianca  = Math.min(100, Math.round((existente.confianca + confianca) / 2));
    existente.ocorrencias = (existente.ocorrencias || 1) + 1;
    existente.ultimaVez  = new Date().toISOString();
    existente.origens    = [...new Set([...(existente.origens||[]), origem])];
  } else {
    lista.push({
      valor,
      score:      Math.min(100, scoreDelta),
      confianca:  Math.round(confianca),
      peso:       1.0,
      ocorrencias: 1,
      primeiraVez: new Date().toISOString(),
      ultimaVez:  new Date().toISOString(),
      origens:    [origem]
    });
  }
  // Ordena por score desc
  lista.sort((a, b) => b.score - a.score);
  return lista;
}

// ─── APLICAR DECAY EM TODOS OS SINAIS ─────────────────────────
function aplicarDecay(mapa) {
  const campos = ['tipo_imovel','transacao','estado','bairro','cidade','quartos','suites','vagas','valor','area','familia','diferenciais'];
  for (const campo of campos) {
    if (!mapa[campo]) continue;
    for (const sinal of mapa[campo]) {
      const decay = calcularDecay(sinal.ultimaVez || sinal.primeiraVez || new Date().toISOString());
      sinal.peso = Math.round(decay * 100) / 100;
      sinal.scoreEfetivo = Math.round(sinal.score * decay);
    }
  }
  return mapa;
}

// ─── DETECTAR PALAVRAS DE MUDANÇA FORTE ───────────────────────
function detectarMudanca(texto) {
  const norm = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const fortes = ['agora','decidi','mudei','nao quero mais','prefiro','preciso urgente','definitivo','fechei','escolhi'];
  return fortes.some(p => norm.includes(p));
}

// ─── ANALISAR UMA MENSAGEM E ATUALIZAR O MAPA ─────────────────
function analisarMensagem(mapaAtual, mensagem, origem = 'whatsapp') {
  const mapa = mapaAtual ? JSON.parse(JSON.stringify(mapaAtual)) : criarMapaVazio();

  // Se lead está tentando VENDER imóvel próprio, não atualiza mapa de busca
  try {
    const { ehIntencaoVenda } = require('./extrator-perfil');
    const normMsg = mensagem.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if (ehIntencaoVenda(normMsg)) {
      mapa.ultimaAnalise = new Date().toISOString();
      mapa.totalMensagens = (mapa.totalMensagens || 0) + 1;
      mapa._ultimaMsgVenda = mensagem.substring(0, 100);
      console.log('[INTENCAO] mensagem de venda própria — mapa de busca não atualizado');
      return mapa;
    }
  } catch(e) {}

  const perfil = extrairPerfil([{ texto: mensagem, de: 'cliente' }]);
  const ehMudanca = detectarMudanca(mensagem);
  const multiplicador = ehMudanca ? 2.0 : 1.0;

  // Tipo de imóvel
  if (perfil.tipo) {
    const score = ehMudanca ? 85 : 60;
    acumularSinal(mapa.tipo_imovel, perfil.tipo, score * multiplicador, 75, origem);
  }

  // Transação — normaliza para "venda" ou "aluguel"
  if (perfil.intencao) {
    const _tr = String(perfil.intencao).toLowerCase();
    const _trNorm = (_tr.includes('alug') || _tr.includes('locat')) ? 'aluguel' : 'venda';
    acumularSinal(mapa.transacao, _trNorm, 70 * multiplicador, 80, origem);
  }

  // Objetivo — moradia, investimento, temporada
  if (perfil.objetivo) {
    if (!mapa.objetivo) mapa.objetivo = [];
    acumularSinal(mapa.objetivo, perfil.objetivo, 70 * multiplicador, 75, origem);
  }

  // Bairro
  if (perfil.bairro) {
    acumularSinal(mapa.bairro, perfil.bairro, 65 * multiplicador, 70, origem);
  }

  // Cidade
  if (perfil.cidade) {
    acumularSinal(mapa.cidade, perfil.cidade, 80 * multiplicador, 85, origem);
  }

  // Estado
  if (perfil.estado) {
    const estadoNorm = perfil.estado.toLowerCase().trim();
    acumularSinal(mapa.estado, estadoNorm, 85 * multiplicador, 90, origem);
  }

  // Quartos
  if (perfil.quartos) {
    acumularSinal(mapa.quartos, perfil.quartos, 70 * multiplicador, 75, origem);
  }

  // Suítes
  if (perfil.suites) {
    if (!mapa.suites) mapa.suites = [];
    acumularSinal(mapa.suites, perfil.suites, 65 * multiplicador, 70, origem);
  }

  // Vagas
  if (perfil.vagas) {
    if (!mapa.vagas) mapa.vagas = [];
    acumularSinal(mapa.vagas, perfil.vagas, 65 * multiplicador, 70, origem);
  }

  // Área
  if (perfil.area || perfil.areaMin) {
    if (!mapa.area) mapa.area = [];
    acumularSinal(mapa.area, { min: perfil.areaMin||perfil.area||0, max: perfil.areaMax||perfil.area*1.5||0 }, 60 * multiplicador, 65, origem);
  }

  // Valor
  if (perfil.valorMax) {
    acumularSinal(mapa.valor, { min: perfil.valorMin||0, max: perfil.valorMax }, 65 * multiplicador, 70, origem);
  }

  // Urgência
  if (perfil.urgencia) {
    mapa.urgencia = Math.min(100, (mapa.urgencia || 0) + (ehMudanca ? 30 : 15));
  }

  // Família
  if (perfil.familia) {
    for (const membro of (Array.isArray(perfil.familia) ? perfil.familia : [perfil.familia])) {
      acumularSinal(mapa.familia, membro, 50, 60, origem);
    }
  }

  // Contexto emocional
  if (perfil.sentimento) {
    mapa.sentimento = perfil.sentimento;
  }

  // Registra evento de mudança
  if (ehMudanca) {
    mapa.eventos = mapa.eventos || [];
    mapa.eventos.push({
      tipo: 'mudanca_intencao',
      mensagem: mensagem.substring(0, 100),
      em: new Date().toISOString()
    });
  }

  // Atualiza metadados
  mapa.totalMensagens = (mapa.totalMensagens || 0) + 1;
  mapa.ultimaAnalise  = new Date().toISOString();
  mapa.fase           = calcularFase(mapa);
  mapa.temperatura    = calcularTemperatura(mapa);

  return aplicarDecay(mapa);
}

// ─── ANALISAR TODAS AS MENSAGENS DE UMA LEAD ──────────────────
function analisarHistorico(mensagens) {
  let mapa = criarMapaVazio();
  for (const msg of (mensagens || [])) {
    if (msg.de === 'cliente' && msg.texto) {
      mapa = analisarMensagem(mapa, msg.texto, msg.canal || 'whatsapp');
    }
  }
  return mapa;
}

// ─── CRIAR MAPA VAZIO ─────────────────────────────────────────
function criarMapaVazio() {
  return {
    tipo_imovel:    [],
    transacao:      [],
    estado:         [],
    cidade:         [],
    bairro:         [],
    quartos:        [],
    suites:         [],
    vagas:          [],
    valor:          [],
    area:           [],
    familia:        [],
    diferenciais:   [],
    objetivo:       [], // moradia, investimento, temporada
    urgencia:       0,
    sentimento:     null,
    eventos:        [],
    totalMensagens: 0,
    ultimaAnalise:  null,
    fase:           'descoberta',
    temperatura:    'frio',
    versao:         '1.0'
  };
}

// ─── CALCULAR FASE DO FUNIL ───────────────────────────────────
function calcularFase(mapa) {
  const temTipo   = mapa.tipo_imovel.length > 0;
  const temBairro = mapa.bairro.length > 0;
  const temValor  = mapa.valor.length > 0;
  const temQtos   = mapa.quartos.length > 0;
  const urgencia  = mapa.urgencia || 0;

  if (urgencia > 70 && temTipo && temBairro) return 'decisao';
  if (temTipo && temBairro && temValor)       return 'qualificado';
  if (temTipo && (temBairro || temQtos))      return 'interesse';
  if (temTipo)                                return 'explorando';
  return 'descoberta';
}

// ─── CALCULAR TEMPERATURA ─────────────────────────────────────
function calcularTemperatura(mapa) {
  const urgencia = mapa.urgencia || 0;
  const sinais   = [mapa.tipo_imovel, mapa.bairro, mapa.valor, mapa.quartos].filter(s => s.length > 0).length;
  const topScore = mapa.tipo_imovel[0]?.scoreEfetivo || mapa.tipo_imovel[0]?.score || 0;

  if (urgencia > 70 || (sinais >= 3 && topScore > 80)) return 'quente';
  if (sinais >= 2 || topScore > 50)                    return 'morno';
  return 'frio';
}

// ─── INTENÇÃO PRINCIPAL (compatibilidade com sistema atual) ───
function intencaoPrincipal(mapa) {
  return {
    tipo:     mapa.tipo_imovel[0]?.valor || '',
    bairro:   mapa.bairro[0]?.valor || '',
    cidade:   mapa.cidade[0]?.valor || '',
    quartos:  mapa.quartos[0]?.valor || 0,
    valorMax: mapa.valor[0]?.valor?.max || 0,
    valorMin: mapa.valor[0]?.valor?.min || 0,
    intencao: mapa.transacao[0]?.valor || '',
    fase:     mapa.fase,
    temperatura: mapa.temperatura,
    urgencia: mapa.urgencia || 0
  };
}

module.exports = {
  analisarMensagem,
  analisarHistorico,
  criarMapaVazio,
  intencaoPrincipal,
  aplicarDecay,
  calcularFase,
  calcularTemperatura
};
