'use strict';
/**
 * SISTEMA DE INTENÇÃO v1.0
 * Detecta O QUE o usuário quer fazer, não só sobre o que fala.
 * 
 * Intenções:
 * - VER      → quero ver, mostra, lista, quantos
 * - IMPORTAR → importar, subir, carregar, enviar
 * - ENTENDER → o que é, como funciona, explicar, o que significa
 * - ACESSAR  → como acesso, onde fica, como vou para
 * - FAZER    → fazer, executar, rodar, criar, gerar
 * - BUSCAR   → tem, busca, procura, encontra, existe
 * - AJUDA    → ajuda, socorro, não sei, não consigo
 * - RELATAR  → relatório, resumo, desempenho, estatística
 * - PROBLEMA → não funciona, erro, falhou, não apareceu
 */

const INTENCOES = {
  VER: {
    peso: 1,
    padroes: [
      /\b(ver|veja|mostra|mostre|lista|listar|exibir|mostrar|quero ver|me mostra|me diz|quantos|quantas|quanto|qual|quais|meus|minhas|meu|minha)\b/
    ],
    exemplos: ['ver leads', 'mostra meus imóveis', 'quantas visitas tenho', 'meus matches']
  },
  IMPORTAR: {
    peso: 2,
    padroes: [
      /\b(importar|importa|subir|sobe|carregar|carrega|enviar|envia|upload|planilha|csv|excel|xml)\b/
    ],
    exemplos: ['importar leads', 'subir xml', 'enviar planilha']
  },
  ENTENDER: {
    peso: 1,
    padroes: [
      /\b(o que e|o que é|como funciona|explicar|explicar|me explica|o que significa|o que sao|o que são|entender|entendo|nao entendo)\b/
    ],
    exemplos: ['o que é match', 'como funciona a vitrine', 'me explica o score']
  },
  ACESSAR: {
    peso: 2,
    padroes: [
      /\b(como acesso|onde fica|como vou|como entro|como chego|como abro|onde encontro|como navego)\b/
    ],
    exemplos: ['como acesso leads', 'onde fica portais', 'como vou para visitas']
  },
  FAZER: {
    peso: 3,
    padroes: [
      /\b(fazer|faz|executar|executa|rodar|roda|criar|cria|gerar|gera|confirmar|confirma|inativar|inativa|cadastrar|cadastra|publicar|publica)\b/
    ],
    exemplos: ['fazer match', 'gerar xml', 'confirmar visita', 'cadastrar imóvel']
  },
  BUSCAR: {
    peso: 2,
    padroes: [
      /\b(tem|buscar|busca|procurar|procura|encontrar|encontra|existe|existem|ha|há|achar|acha)\b/
    ],
    exemplos: ['tem apartamento em Itajaí', 'busca casa até 500mil', 'existe lead com match']
  },
  AJUDA: {
    peso: 1,
    padroes: [
      /\b(ajuda|ajude|socorro|nao sei|não sei|nao consigo|não consigo|help|o que voce faz|o que você faz|pode me ajudar|como começo)\b/
    ],
    exemplos: ['ajuda', 'não sei o que fazer', 'pode me ajudar']
  },
  RELATAR: {
    peso: 1,
    padroes: [
      /\b(relatorio|relatório|resumo|desempenho|performance|estatistica|estatística|metricas|métricas|resultado|resultados)\b/
    ],
    exemplos: ['relatório semanal', 'resumo da conta', 'meu desempenho']
  },
  PROBLEMA: {
    peso: 3,
    padroes: [
      /\b(nao funciona|não funciona|erro|falhou|problema|nao apareceu|não apareceu|nao atualizou|não atualizou|nao importou|nao consigo|nao saiu)\b/
    ],
    exemplos: ['xml não atualizou', 'portal rejeitou', 'lead não apareceu']
  },
  ESTRATEGIA: {
    peso: 2,
    padroes: [
      /\b(o que devo|o que fazer|por onde comecar|me orienta|plano|estrategia|estratégia|prioridade|prioritario|mais urgente|primeiro)\b/
    ],
    exemplos: ['o que devo fazer hoje', 'por onde começo', 'me orienta']
  }
};

// Detectar intenção da mensagem
function detectar(mNorm) {
  const resultados = [];

  for (const [nome, config] of Object.entries(INTENCOES)) {
    for (const padrao of config.padroes) {
      if (padrao.test(mNorm)) {
        resultados.push({ intencao: nome, peso: config.peso });
        break;
      }
    }
  }

  if (!resultados.length) return { intencao: 'VER', peso: 1, confianca: 'baixa' };

  // Retornar a intenção com maior peso
  resultados.sort((a,b) => b.peso - a.peso);
  return { ...resultados[0], confianca: resultados.length > 1 ? 'media' : 'alta', todas: resultados };
}

// Combinar intenção + domínio para ação final
function resolverAcao(intencao, dominio) {
  const mapa = {
    'FAZER_leads':      'importar_leads',
    'FAZER_imoveis':    'wizard_xml',
    'FAZER_match':      'fazer_match',
    'FAZER_portais':    'gerar_xml',
    'IMPORTAR_leads':   'importar_leads',
    'IMPORTAR_imoveis': 'wizard_xml',
    'VER_leads':        'ver_leads',
    'VER_imoveis':      'ver_imoveis',
    'VER_visitas':      'ver_visitas',
    'VER_match':        'ver_match',
    'VER_portais':      'ver_portais',
    'VER_dashboard':    'ver_dashboard',
    'ENTENDER_match':   'explicar_match',
    'ENTENDER_sistema': 'ajuda',
    'ACESSAR_leads':    'navegar_leads',
    'ACESSAR_imoveis':  'navegar_imoveis',
    'ACESSAR_visitas':  'navegar_visitas',
    'PROBLEMA_portais': 'suporte_xml',
    'PROBLEMA_leads':   'suporte_leads',
    'PROBLEMA_match':   'suporte_match',
    'ESTRATEGIA_null':  'plano_do_dia',
    'AJUDA_null':       'mostrar_capacidades',
    'RELATAR_null':     'relatorio',
  };

  const chave = `${intencao}_${dominio || 'null'}`;
  return mapa[chave] || `${intencao.toLowerCase()}_${dominio || 'geral'}`;
}

// Gerar resposta baseada em intenção quando domínio não resolve
function respostaBaseadaEmIntencao(intencaoObj, mNorm, btn, chip) {
  const { intencao } = intencaoObj;

  switch(intencao) {
    case 'AJUDA':
      return `🤖 <strong>Posso te ajudar com:</strong><br><br>` +
        chip('👥 Ver leads','minhas leads') +
        chip('🏠 Ver imóveis','meus imoveis') +
        chip('📅 Ver visitas','minhas visitas') +
        chip('🎯 Ver match','ver match') +
        chip('📊 Resumo','resumo geral') +
        chip('🧠 Plano do dia','o que devo fazer hoje') +
        `<br><br>Ou me diga o que precisa com mais detalhes!`;

    case 'ESTRATEGIA':
      return null; // deixar o estrategista responder

    case 'PROBLEMA':
      return `🔧 <strong>Detectei um problema.</strong><br><br>` +
        `Me diga mais detalhes:<br>` +
        chip('❓ XML não atualizou','meu xml nao atualizou') +
        chip('❓ Portal rejeitou','portal rejeitou imovel') +
        chip('❓ Sem match','por que nao deu match') +
        chip('❓ Lead não importou','a extracao falhou');

    case 'IMPORTAR':
      return null; // deixar acoes.js resolver

    case 'FAZER':
      return null; // deixar acoes.js resolver

    default:
      return null;
  }
}

module.exports = { detectar, resolverAcao, respostaBaseadaEmIntencao, INTENCOES };
