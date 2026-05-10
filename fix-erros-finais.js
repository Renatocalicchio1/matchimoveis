const fs = require('fs');

// 1. Fix contexto.js — mais early returns
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');
const antigoEarly = `  // Early return para exportar XML — evita cair em BUSCAR_IMOVEL
  if (/publicar\\s+im[oó]veis?\\s+(no|em|para|pro)\\s+(vivareal|zap|olx|imovelweb|chaves|123i)|exportar\\s+(para|pro)\\s+(vivareal|zap|olx|imovelweb|chaves|123i)/i.test(mensagem)) {
    return { intencao: 'EXPORTAR_XML', slots: {}, imoveisEncontrados: [], leadsEncontrados: [], temDados: false, fraseOriginal: mensagem, mNorm: mensagem.toLowerCase() };
  }`;

const novoEarly = `  // Early return para exportar XML
  if (/publicar\\s+im[oó]veis?\\s+(no|em|para|pro)\\s+(vivareal|zap|olx|imovelweb|chaves|123i)|exportar\\s+(para|pro)\\s+(vivareal|zap|olx|imovelweb|chaves|123i)/i.test(mensagem)) {
    return { intencao: 'EXPORTAR_XML', slots: {}, imoveisEncontrados: [], leadsEncontrados: [], temDados: false, fraseOriginal: mensagem, mNorm: mensagem.toLowerCase() };
  }
  // Early return para visitas
  if (/tem\\s+visita\\s+marcada|quem\\s+confirmou\\s+visita|visitas?\\s+da\\s+semana|visitas?\\s+pendentes?|visitas?\\s+hoje|quantas\\s+visitas?|minhas\\s+visitas?/i.test(mensagem)) {
    return { intencao: 'VER_VISITAS', slots: {}, imoveisEncontrados: [], leadsEncontrados: [], temDados: false, fraseOriginal: mensagem, mNorm: mensagem.toLowerCase() };
  }
  // Early return para notificações
  if (/tem\\s+algo\\s+novo|novidades|o\\s+que\\s+aconteceu|minhas\\s+notifica|tenho\\s+alguma\\s+notifica/i.test(mensagem)) {
    return { intencao: 'VER_NOTIFICACOES', slots: {}, imoveisEncontrados: [], leadsEncontrados: [], temDados: false, fraseOriginal: mensagem, mNorm: mensagem.toLowerCase() };
  }
  // Early return para leads
  if (/quantos?\\s+(leads?|clientes?)|ver\\s+leads?|meus?\\s+leads?|leads?\\s+(sem|com)\\s+match|leads?\\s+quentes?|leads?\\s+novos?|leads?\\s+sem\\s+match/i.test(mensagem)) {
    return { intencao: 'VER_LEADS', slots: {}, imoveisEncontrados: [], leadsEncontrados: [], temDados: false, fraseOriginal: mensagem, mNorm: mensagem.toLowerCase() };
  }
  // Early return para imóveis geral
  if (/meus?\\s+im[oó]veis?|quantos?\\s+im[oó]veis?|ver\\s+carteira|im[oó]veis?\\s+sem\\s+propriet|im[oó]veis?\\s+ativos?|im[oó]veis?\\s+inativos?/i.test(mensagem)) {
    return { intencao: 'VER_IMOVEIS', slots: {}, imoveisEncontrados: [], leadsEncontrados: [], temDados: false, fraseOriginal: mensagem, mNorm: mensagem.toLowerCase() };
  }`;

if (ctx.includes(antigoEarly)) {
  ctx = ctx.replace(antigoEarly, novoEarly);
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('1. early returns expandidos');
} else {
  console.log('1. nao encontrado');
}

// 2. Fix intencao.js — expandir VER_LEADS e VER_IMOVEIS
let int = fs.readFileSync('cerebro/intencao.js', 'utf8');
int = int.replace(
  /VER_LEADS:[\s\S]*?exemplos:.*?\][\s\S]*?\},/,
  `VER_LEADS: {
    peso: 10,
    padroes: [
      /quantos?\\s+(leads?|clientes?)|ver\\s+leads?|meus?\\s+leads?|minhas?\\s+leads?|leads?\\s+(com\\s+match|sem\\s+match|quentes?|novos?|ativos?|pendentes?)|lista\\s+(de\\s+)?leads?|clientes?\\s+(ativos?|novos?|pendentes?)|quantos\\s+clientes/
    ],
    exemplos: ['ver leads', 'meus leads', 'leads com match', 'quantos leads tenho?']
  },`
);

int = int.replace(
  /VER_IMOVEIS:[\s\S]*?exemplos:.*?\][\s\S]*?\},/,
  `VER_IMOVEIS: {
    peso: 10,
    padroes: [
      /meus?\\s+im[oó]veis?|quantos?\\s+im[oó]veis?|ver\\s+(carteira|im[oó]veis?)|im[oó]veis?\\s+(ativos?|inativos?|sem\\s+propriet|da\\s+carteira)|carteira|valor\\s+m[eé]dio|quais\\s+bairros|bairros\\s+(que\\s+)?(tenho|tem)/
    ],
    exemplos: ['meus imóveis', 'ver carteira', 'imóveis ativos']
  },`
);

fs.writeFileSync('cerebro/intencao.js', int);
console.log('2. VER_LEADS e VER_IMOVEIS expandidos');

console.log('✅ DONE');
