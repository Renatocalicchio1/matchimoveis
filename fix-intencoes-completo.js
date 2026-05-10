const fs = require('fs');
let int = fs.readFileSync('cerebro/intencao.js', 'utf8');

// Adicionar padrões específicos com peso alto para cada domínio
const novasIntencoes = `
  VER_VISITAS: {
    peso: 10,
    padroes: [
      /visitas?(\\s+hoje|\\s+pendentes?|\\s+da\\s+semana|\\s+marcadas?|\\s+confirmadas?|\\s+agendadas?)?|quantas\\s+visitas|minhas\\s+visitas|tem\\s+visita|quem\\s+confirmou\\s+visita|visitas?\\s+da\\s+semana/
    ],
    exemplos: ['visitas hoje', 'quantas visitas tenho', 'visitas pendentes']
  },
  VER_NOTIFICACOES: {
    peso: 10,
    padroes: [
      /notifica(c|ç)(oes?|ão)|tem\\s+algo\\s+novo|o\\s+que\\s+aconteceu|novidades|tem\\s+novidade|alguma\\s+notifica|minhas\\s+notifica|alertas?|avisos?/
    ],
    exemplos: ['tenho alguma notificação?', 'novidades', 'tem algo novo?']
  },
  VER_LEADS: {
    peso: 10,
    padroes: [
      /quantos?\\s+(leads?|clientes?)|ver\\s+leads?|meus?\\s+leads?|minhas?\\s+leads?|leads?\\s+(com\\s+match|sem\\s+match|quentes?|novos?|ativos?|pendentes?)|lista\\s+(de\\s+)?leads?|clientes?\\s+(ativos?|novos?|pendentes?)/
    ],
    exemplos: ['ver leads', 'meus leads', 'leads com match', 'quantos leads tenho?']
  },
  VER_IMOVEIS: {
    peso: 10,
    padroes: [
      /meus?\\s+im(o|ó)veis?|quantos?\\s+im(o|ó)veis?|ver\\s+(carteira|im(o|ó)veis?)|im(o|ó)veis?\\s+(ativos?|inativos?|sem\\s+propriet|da\\s+carteira)|carteira\\s+de\\s+im(o|ó)veis?|valor\\s+m(e|é)dio|quais\\s+bairros|bairros\\s+(que\\s+)?(tenho|tem)/
    ],
    exemplos: ['meus imóveis', 'ver carteira', 'imóveis ativos', 'valor médio da carteira']
  },
`;

// Inserir antes do VER existente
if (!int.includes('VER_VISITAS')) {
  int = int.replace('  VER: {', novasIntencoes + '  VER: {');
  console.log('1. novas intencoes adicionadas');
}

// Adicionar no mapa de resolução
const antigoMapa = `    'VER_leads':        'ver_leads',`;
const novoMapa = `    'VER_VISITAS':      'ver_visitas',
    'VER_NOTIFICACOES': 'ver_notificacoes',
    'VER_LEADS':        'ver_leads',
    'VER_IMOVEIS':      'ver_imoveis',
    'VER_leads':        'ver_leads',`;

if (!int.includes('VER_VISITAS') || !int.includes("'VER_VISITAS'")) {
  int = int.replace(antigoMapa, novoMapa);
  console.log('2. mapa atualizado');
}

fs.writeFileSync('cerebro/intencao.js', int);
console.log('3. salvo');

// Corrigir test para usar campo correto
let test = fs.readFileSync('test-intencoes2.js', 'utf8');
test = test.replace(
  `const detectado = detectarTudo(frase);`,
  `const detectado = detectarTudo(frase);`
);

// Fix detectarTudo para usar campo intencao
test = test.replace(
  `return ctx.intencao || ctx.temDados && 'BUSCAR_IMOVEL' || (int && int.tipo) || 'null';`,
  `return ctx.intencao || (ctx.temDados ? 'BUSCAR_IMOVEL' : null) || (int && (int.intencao || int.tipo)) || 'null';`
);
fs.writeFileSync('test-intencoes2.js', test);
console.log('4. test corrigido');
