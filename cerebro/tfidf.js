'use strict';

/**
 * TF-IDF para o assistente MatchImóveis
 * Aprende com as perguntas e melhora com o tempo
 */

// ── BASE DE DOCUMENTOS (intenção → exemplos) ──────────────────────────────────
const DOCUMENTOS = {
  navegar_imoveis:    ['como acesso meus imoveis','onde fico imoveis','ver imoveis','meus imoveis','carteira de imoveis','abrir imoveis'],
  navegar_leads:      ['como acesso leads','ver leads','minhas leads','abrir leads','pagina de leads','onde ficam os clientes'],
  navegar_visitas:    ['como acesso visitas','ver visitas','minhas visitas','agendamentos','calendario de visitas'],
  navegar_whatsapp:   ['como acesso whatsapp','ver mensagens','inbox whatsapp','abrir whatsapp','mensagens recebidas'],
  navegar_perfil:     ['como acesso perfil','meus dados','minha conta','alterar dados','configuracoes da conta'],
  navegar_portais:    ['como acesso portais','ver portais','publicar imoveis','feed xml','ver xml'],
  navegar_dashboard:  ['como acesso dashboard','painel','tela inicial','home','resumo geral','primeiros passos','como comecar','por onde comecar','inicio','onboarding','tutorial','configurar conta'],
  navegar_coins:      ['como acesso coins','meu saldo','match coins','ver creditos','saldo de coins'],
  navegar_mapa:       ['como acesso mapa','ver imoveis no mapa','mapa de visitas','localizacao imoveis'],

  buscar_imovel:      ['tem apartamento','tem casa','tem terreno','tem cobertura','buscar imovel','procurar imovel','imovel disponivel','tem algo no bairro','imovel no centro'],
  importar_xml:       ['importar xml','subir xml','trazer imoveis','url do feed','importar imoveis do crm','tecimob xml','rankim xml'],
  importar_leads:     ['importar leads','subir planilha','planilha de leads','excel leads','csv leads','importar base'],
  gerar_xml:          ['gerar xml','exportar xml','publicar no vivareal','publicar no zap','xml para portal','feed para portal'],
  conectar_whatsapp:  ['conectar whatsapp','qr code whatsapp','escanear qr','ligar whatsapp','instancia whatsapp'],
  enviar_vitrine:     ['enviar vitrine','mandar vitrine','link da vitrine','vitrine para cliente','enviar link'],
  cadastrar_lead:     ['cadastrar lead','nova lead','novo cliente','adicionar cliente','cadastra cliente','registrar lead'],
  agendar_visita:     ['agendar visita','marcar visita','confirmar visita','solicitar visita','visita agendada'],
  fazer_match:        ['fazer match','rodar match','cruzar leads','match automatico','buscar match'],
  publicar_quintoandar:['quintoandar','quinto andar','ativar quintoandar','publicar quintoandar','xml quintoandar'],

  erro_whatsapp:      ['whatsapp desconectou','whatsapp caiu','qr code expirou','reconectar whatsapp','perdeu conexao'],
  erro_xml:           ['xml nao atualizou','xml nao saiu','xml erro','portal nao atualizou','feed desatualizado'],
  erro_match:         ['por que nao deu match','nao encontrou imovel','match nao funcionou','sem match','nao deu match'],
  erro_vitrine:       ['vitrine nao abre','vitrine nao carrega','link nao funciona','vitrine erro'],
  erro_foto:          ['foto nao sobe','foto nao carrega','erro ao subir foto','foto nao aparece'],
  erro_acesso:        ['nao consigo entrar','esqueci senha','senha errada','nao acessa','perdeu acesso'],
  erro_lead:          ['lead nao importou','leads nao apareceram','importacao falhou','planilha erro'],

  dados_leads:        ['quantas leads tenho','total de leads','minhas leads','resumo leads','leads hoje'],
  dados_imoveis:      ['quantos imoveis tenho','total de imoveis','minha carteira','imoveis ativos','resumo imoveis'],
  dados_visitas:      ['quantas visitas tenho','total de visitas','visitas hoje','visitas pendentes','agenda de hoje'],
  dados_bairros:      ['qual bairro mais demanda','bairro mais buscado','demanda por bairro','bairros quentes'],
  dados_tipo:         ['qual tipo mais buscado','tipo mais procurado','apartamento ou casa','demanda por tipo'],
  dados_leads_quentes:['leads quentes','quem esta quente','leads mais engajadas','clientes quentes'],

  conceito_match:     ['o que e match','como funciona match','o que e o match','explicar match','como o match funciona'],
  conceito_vitrine:   ['o que e vitrine','como funciona vitrine','o que e a vitrine','explicar vitrine'],
  conceito_coins:     ['o que sao coins','match coins','quanto custa','tabela de custos','preco das acoes'],
  conceito_temperatura:['temperatura lead','o que e temperatura','lead quente fria','como funciona temperatura'],
  conceito_funil:     ['funil de leads','etapas do funil','fases da lead','como funciona funil'],
  conceito_score:     ['o que e score','como funciona score','pontuacao da vitrine','score do imovel'],

  plano_dia:          ['o que devo fazer hoje','plano do dia','me orienta','por onde comecar','qual prioridade','to travado','nao sei o que fazer','me ajuda','perdido','sem ideia','travado'],
  leads_sem_match:    ['leads sem match','quem nao tem match','leads sem resultado','leads paradas'],
  imoveis_sem_foto:   ['imoveis sem foto','quais imoveis sem imagem','fotos faltando','sem fotos'],
  imoveis_sem_prop:   ['imoveis sem proprietario','quem e o dono','proprietario faltando','sem dono'],
};

// ── CALCULAR TF-IDF ──────────────────────────────────────────────────────────
function tokenizar(txt) {
  return String(txt||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s]/g,'')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

// Pré-computar IDF uma vez
let _idf = null;
function getIDF() {
  if (_idf) return _idf;
  const docCount = Object.values(DOCUMENTOS).flat().length;
  const df = {};
  Object.values(DOCUMENTOS).flat().forEach(doc => {
    const tokens = new Set(tokenizar(doc));
    tokens.forEach(t => { df[t] = (df[t]||0) + 1; });
  });
  _idf = {};
  Object.entries(df).forEach(([t,n]) => {
    _idf[t] = Math.log(docCount / n + 1);
  });
  return _idf;
}

function tfidfScore(query, doc) {
  const idf = getIDF();
  const qTokens = tokenizar(query);
  const dTokens = tokenizar(doc);
  const dFreq = {};
  dTokens.forEach(t => { dFreq[t] = (dFreq[t]||0) + 1; });

  let score = 0;
  qTokens.forEach(t => {
    if (dFreq[t]) {
      const tf = dFreq[t] / dTokens.length;
      const idfVal = idf[t] || 1;
      score += tf * idfVal;
    }
  });
  return score;
}

// ── DETECTAR INTENÇÃO ─────────────────────────────────────────────────────────
function detectarIntencao(query, threshold = 0.05) {
  let melhor = null;
  let melhorScore = 0;

  Object.entries(DOCUMENTOS).forEach(([intencao, exemplos]) => {
    const scores = exemplos.map(ex => tfidfScore(query, ex));
    const maxScore = Math.max(...scores);
    if (maxScore > melhorScore) {
      melhorScore = maxScore;
      melhor = intencao;
    }
  });

  return melhorScore >= threshold ? { intencao: melhor, score: melhorScore } : null;
}

// ── ADICIONAR EXEMPLO (aprendizado) ──────────────────────────────────────────
function aprenderExemplo(intencao, exemplo) {
  if (!DOCUMENTOS[intencao]) DOCUMENTOS[intencao] = [];
  if (!DOCUMENTOS[intencao].includes(exemplo)) {
    DOCUMENTOS[intencao].push(exemplo);
    _idf = null; // Reset cache
  }
}

// ── SUGERIR INTENÇÃO MAIS PRÓXIMA ────────────────────────────────────────────
function sugerirIntencao(query) {
  const resultado = detectarIntencao(query, 0.01);
  return resultado;
}

module.exports = { detectarIntencao, sugerirIntencao, aprenderExemplo, tokenizar, tfidfScore, DOCUMENTOS };
