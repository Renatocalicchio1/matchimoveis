const fs = require('fs');

// Conectar mapa-completo.json no cerebro/sistema.js
let sistema = fs.readFileSync('cerebro/sistema.js', 'utf8');

const novoBloco = `
// ── MAPA COMPLETO DO SISTEMA ──────────────────────────────────────────────────
function responderComMapa(mNorm, btn, chip) {
  let mapa;
  try { mapa = JSON.parse(fs.readFileSync('./cerebro/mapa-completo.json','utf8')); } catch(e) { return null; }

  const views = mapa.views || {};
  const rotas = mapa.server?.rotas || [];

  // Detectar qual view o usuario quer saber
  const mapaViews = {
    'leads':        'app-leads',
    'imoveis':      'app-imoveis',
    'visitas':      'app-visitas',
    'dashboard':    'app-home',
    'home':         'app-home',
    'cadastro':     'app-cadastro',
    'portais':      'app-portais',
    'notificacoes': 'app-notificacoes',
    'perfil':       'app-perfil',
    'coins':        'app-coins',
    'assistente':   'app-assistente',
    'editar imovel':'app-editar-imovel',
    'lead detalhe': 'app-lead-detalhe',
    'importar leads':'app-importar-leads',
  };

  const viewKey = Object.entries(mapaViews).find(([k]) => mNorm.includes(k));
  if (!viewKey) return null;

  const view = views[viewKey[1]];
  if (!view) return null;

  const nome = viewKey[1].replace('app-','').replace('-',' ');

  // "o que tem" / "me explica" / "o que fica"
  if (/o que tem|o que ha|me explica|me fala|o que fica|conteudo|pagina de/.test(mNorm)) {
    let resp = '\uD83D\uDCCB <strong>P\u00e1gina ' + nome + ':</strong><br><br>';
    if (view.textos && view.textos.length) resp += '<strong>Textos e t\u00edtulos:</strong><br>' + view.textos.slice(0,8).map(t=>'\u2022 '+t).join('<br>') + '<br><br>';
    if (view.inputs && view.inputs.length) resp += '<strong>Campos dispon\u00edveis:</strong><br>' + view.inputs.slice(0,8).map(i=>'\u2022 '+i).join('<br>') + '<br><br>';
    if (view.selects && view.selects.length) resp += '<strong>Filtros/Selects:</strong><br>' + view.selects.map(s=>'\u2022 '+s).join('<br>') + '<br><br>';
    if (view.onclicks && view.onclicks.length) resp += '<strong>A\u00e7\u00f5es/Bot\u00f5es:</strong><br>' + view.onclicks.slice(0,6).map(o=>'\u2022 '+o.slice(0,60)).join('<br>');
    return resp;
  }

  // "quais campos tem"
  if (/campos?|inputs?|formulario|preencher/.test(mNorm)) {
    if (!view.inputs || !view.inputs.length) return 'N\u00e3o encontrei campos de formul\u00e1rio nessa p\u00e1gina.';
    return '\uD83D\uDCDD <strong>Campos em ' + nome + ':</strong><br><br>' + view.inputs.map(i=>'\u2022 '+i).join('<br>');
  }

  // "quais botoes tem"
  if (/bot[aã]o|bot[oõ]es|acoes|cliques|o que posso clicar/.test(mNorm)) {
    if (!view.onclicks || !view.onclicks.length) return 'N\u00e3o encontrei bot\u00f5es nessa p\u00e1gina.';
    return '\u26A1 <strong>Bot\u00f5es em ' + nome + ':</strong><br><br>' + view.onclicks.slice(0,8).map(o=>'\u2022 '+o.slice(0,60)).join('<br>');
  }

  // "quais links tem" / "para onde vai"
  if (/links?|navega|para onde|rotas?/.test(mNorm)) {
    if (!view.links || !view.links.length) return 'N\u00e3o encontrei links internos nessa p\u00e1gina.';
    return '\uD83D\uDD17 <strong>Links em ' + nome + ':</strong><br><br>' + [...new Set(view.links)].slice(0,8).map(l=>'\u2022 '+l).join('<br>');
  }

  return null;
}

`;

// Adicionar função e exportar
if (!sistema.includes('responderComMapa')) {
  // Adicionar require fs se não tiver
  if (!sistema.includes("require('fs')")) {
    sistema = "'use strict';\nconst fs = require('fs');\n" + sistema.replace("'use strict';",'');
  }
  // Injetar antes do module.exports
  sistema = sistema.replace('module.exports', novoBloco + 'module.exports');
  // Adicionar no exports
  sistema = sistema.replace('module.exports = {', 'module.exports = { responderComMapa,');
  fs.writeFileSync('cerebro/sistema.js', sistema);
  console.log('1. sistema.js — responderComMapa adicionado');
} else {
  console.log('1. ja existe');
}

// Conectar no index.js antes do bloco de sistema
let idx = fs.readFileSync('cerebro/index.js','utf8');
if (!idx.includes('responderComMapa')) {
  idx = idx.replace(
    '  // ── 4. SISTEMA',
    `  // ── 3.5. MAPA COMPLETO
  try {
    const resMapa = modSistema.responderComMapa && modSistema.responderComMapa(mNorm, btn, chip);
    if (resMapa) return finalizar(resMapa + sugestoes(dominio, d));
  } catch(e) {}

  // ── 4. SISTEMA`
  );
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('2. index.js — mapa conectado');
} else {
  console.log('2. ja conectado');
}
