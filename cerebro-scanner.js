'use strict';
const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

const serverJs = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
const linhas   = serverJs.split('\n');

const rotas = [];
const reRota = /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/i;

linhas.forEach((linha, i) => {
  const m = linha.match(reRota);
  if (m) rotas.push({ metodo: m[1].toUpperCase(), rota: m[2], linha: i+1 });
});

const viewsDir = path.join(BASE, 'views');
const views = {};
if (fs.existsSync(viewsDir)) {
  fs.readdirSync(viewsDir).filter(f=>f.endsWith('.ejs')).forEach(f => {
    const nome     = f.replace('.ejs','');
    const conteudo = fs.readFileSync(path.join(viewsDir, f), 'utf8');
    const inputs   = [...conteudo.matchAll(/name=["']([^"']+)["']/gi)].map(m=>m[1]).filter(Boolean);
    const links    = [...conteudo.matchAll(/href=["']([^"'#][^"']*?)["']/gi)].map(m=>m[1]).filter(v=>v.startsWith('/'));
    const onclicks = [...conteudo.matchAll(/onclick=["']([^"']{5,80})["']/gi)].map(m=>m[1].trim());
    const selects  = [...conteudo.matchAll(/<option[^>]*value=["']([^"']+)["'][^>]*>([^<]*)</gi)].map(m=>(m[2]||m[1]).trim()).filter(Boolean);
    views[nome] = { inputs, links:[...new Set(links)], onclicks, selects };
  });
}

const mapa = {
  geradoEm: new Date().toISOString(),
  server: { totalRotas: rotas.length, rotas },
  views,
};

fs.writeFileSync(path.join(BASE, 'cerebro', 'mapa-completo.json'), JSON.stringify(mapa, null, 2), 'utf8');
console.log('✅ mapa-completo.json gerado! Rotas: ' + rotas.length + ' | Views: ' + Object.keys(views).length);
