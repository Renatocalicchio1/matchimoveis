const fs = require('fs');

// ── 1. mercado.js — tipo mais buscado com padrão mais específico ──────────────
let mercado = fs.readFileSync('cerebro/mercado.js','utf8');
mercado = mercado.replace(
  /if \(\/tipo mais buscado\|tipo mais pedido\|qual tipo\|tipos\?.*?\.test\(mNorm\)\)/,
  "if (/tipo mais buscado|tipo mais pedido|qual tipo.*busca|tipos.*mais.*busca|tipos.*leads|leads.*tipo/.test(mNorm))"
);
fs.writeFileSync('cerebro/mercado.js', mercado);
console.log('1. mercado.js ok');

// ── 2. acoes.js — gerar xml já com portal detectado ──────────────────────────
let acoes = fs.readFileSync('cerebro/acoes.js','utf8');
acoes = acoes.replace(
  "if (/gerar|criar|exportar/.test(mNorm) && /xml/.test(mNorm) && !/vivareal|zap|olx|chaves|imovelweb|123i/.test(mNorm))",
  "if (/gerar|criar|exportar/.test(mNorm) && /xml/.test(mNorm))"
);
fs.writeFileSync('cerebro/acoes.js', acoes);
console.log('2. acoes.js ok');

// ── 3. portugues.js — enviar vitrine com resposta certa ──────────────────────
let pt = fs.readFileSync('cerebro/portugues.js','utf8');
if (!pt.includes('enviar vitrine para cliente')) {
  const novoBloco = `
  if (/enviar vitrine para cliente|mandar vitrine|link para o cliente|link da vitrine/.test(m)) {
    const comMatch = leads.filter(l => l.matchesBase && l.matchesBase.length > 0);
    if (!comMatch.length) return 'Nenhuma lead com match ainda. Fa\u00e7a o match primeiro.<br><br>' + btn('Ver leads', '/app/leads');
    return '\uD83D\uDD17 <strong>' + comMatch.length + ' lead(s) com vitrine dispon\u00edvel:</strong><br><br>' +
      comMatch.slice(0,4).map(l => '\u2022 <strong>' + (l.nome||l.email||'Lead') + '</strong> \u2014 ' + (l.bairro||'') + '<br><code style="font-size:11px;color:#888">/cliente/oferta/' + l.id + '</code>').join('<br>') +
      '<br><br>\uD83D\uDCA1 Copie o link e envie pelo WhatsApp!<br><br>' + btn('Ver leads com match', '/app/leads') + chip('Leads com match', 'leads com match');
  }
`;
  pt = pt.replace('  // ── PADRÕES APRENDIDOS DO HISTÓRICO REAL', novoBloco + '\n  // ── PADRÕES APRENDIDOS DO HISTÓRICO REAL');
  fs.writeFileSync('cerebro/portugues.js', pt);
  console.log('3. portugues.js ok');
} else {
  console.log('3. portugues.js ja tem vitrine');
}

// ── 4. index.js — blablabla deve cair no nao entendeu ────────────────────────
let idx = fs.readFileSync('cerebro/index.js','utf8');
if (!idx.includes('LIXO')) {
  idx = idx.replace(
    '  // ── 1. SAUDAÇÃO',
    `  // ── 0. FILTRO DE LIXO — palavras sem sentido
  const ehLixo = mNorm.split(' ').every(w => w.length < 3 || /^[a-z]{1,2}$/.test(w)) && mNorm.length < 20;
  const semPalavrasReais = !/imovel|lead|visita|match|portal|xml|bairro|casa|apto|valor|corretor|cliente|quartos|foto|proprietario|relatorio|dashboard|coins/.test(mNorm);
  if (ehLixo && semPalavrasReais && mNorm.length > 3) {
    return 'Hmm, n\u00e3o entendi. \uD83E\uDD14 Pode reformular?<br><br>' +
      chip('Leads', 'minhas leads') + chip('Im\u00f3veis', 'meus imoveis') +
      chip('Visitas', 'visitas hoje') + chip('O que fazer hoje', 'o que devo fazer hoje');
  }

  // ── 1. SAUDAÇÃO`
  );
  fs.writeFileSync('cerebro/index.js', idx);
  console.log('4. index.js filtro de lixo ok');
} else {
  console.log('4. index.js ja tem filtro');
}

console.log('\nPronto! Rode: npm run cerebro');
