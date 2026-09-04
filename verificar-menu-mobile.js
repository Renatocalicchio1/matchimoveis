'use strict';
// Checagem de deriva entre o menu desktop (sidebar) e o menu mobile
// (bottom-nav + "Mais") em views/partials/app-shell.ejs — os dois são 2
// blocos de HTML escritos à mão, sem fonte única, então um item pode ser
// adicionado num e esquecido no outro (foi exatamente o que aconteceu com
// a Academia, jul/2026 — ficou faltando na sidebar depois de corrigida só
// no "Mais"). Mesmo espírito do verificar-cerebro.js: não elimina a
// duplicação, mas garante que ela nunca fica destrancada sem ninguém notar.
// Roda manual (node verificar-menu-mobile.js) — recomendado depois de mexer
// no menu, antes de dar deploy.
const fs = require('fs');
const path = require('path');

const shellPath = path.join(__dirname, 'views', 'partials', 'app-shell.ejs');
const shell = fs.readFileSync(shellPath, 'utf8');

function extrairBloco(src, marcaInicio, marcaFim) {
  const i = src.indexOf(marcaInicio);
  if (i === -1) throw new Error('Marca de início não encontrada: ' + marcaInicio);
  const j = src.indexOf(marcaFim, i);
  if (j === -1) throw new Error('Marca de fim não encontrada: ' + marcaFim);
  return src.slice(i, j);
}

function extrairHrefsApp(bloco) {
  const set = new Set();
  const re = /href="(\/app[^"#?]*)"/g;
  let m;
  while ((m = re.exec(bloco))) set.add(m[1]);
  return set;
}

const blocoSidebar = extrairBloco(shell, '<nav class="menu"', '<!-- Footer -->');
const blocoBottomNav = extrairBloco(shell, '<nav class="bottom-nav"', '<div id="maisOverlay"');
const blocoMais = extrairBloco(shell, 'id="maisMenu"', '<script>');

const hrefsSidebar = extrairHrefsApp(blocoSidebar);
const hrefsMobile = new Set([...extrairHrefsApp(blocoBottomNav), ...extrairHrefsApp(blocoMais)]);

const soNaSidebar = [...hrefsSidebar].filter(h => !hrefsMobile.has(h)).sort();
const soNoMobile = [...hrefsMobile].filter(h => !hrefsSidebar.has(h)).sort();

if (!soNaSidebar.length && !soNoMobile.length) {
  console.log('✅ Sidebar e menu mobile (bottom-nav + Mais) têm os mesmos destinos /app/*.');
  process.exit(0);
}

if (soNaSidebar.length) {
  console.log('⚠️  Só aparecem na sidebar (faltando no bottom-nav OU no "Mais" mobile):');
  soNaSidebar.forEach(h => console.log('   - ' + h));
}
if (soNoMobile.length) {
  console.log('⚠️  Só aparecem no mobile (faltando na sidebar):');
  soNoMobile.forEach(h => console.log('   - ' + h));
}
console.log('\nAdicione o item que falta no bloco que não tem (sidebar: <nav class="menu">; mobile: <nav class="bottom-nav"> ou <div id="maisMenu">).');
process.exit(1);
