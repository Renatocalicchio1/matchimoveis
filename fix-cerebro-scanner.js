const fs = require('fs');
const path = require('path');

// Lê server.js e extrai TUDO
const server = fs.readFileSync('server.js', 'utf8');

// Extrai todas as rotas com método e handler
const rotas = [];
const rotaRegex = /app\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/g;
let m;
while ((m = rotaRegex.exec(server)) !== null) {
  rotas.push({ metodo: m[1].toUpperCase(), rota: m[2] });
}

// Extrai todos os readFileSync (JSONs que o sistema usa)
const jsons = [...server.matchAll(/readFileSync\([^)]*['"`]([^'"`]+\.json)['"`]/g)].map(m=>m[1]);
const jsonsUnicos = [...new Set(jsons)];

// Extrai todos os res.render (views usadas)
const renders = [...server.matchAll(/res\.render\(['"`]([^'"`]+)['"`]/g)].map(m=>m[1]);
const rendersUnicos = [...new Set(renders)];

// Lê cada view e extrai informações
const views = {};
const viewsDir = './views';
fs.readdirSync(viewsDir).filter(f=>f.endsWith('.ejs')&&!f.includes('backup')).forEach(file => {
  const c = fs.readFileSync(path.join(viewsDir, file), 'utf8');
  const nome = file.replace('.ejs','');

  // Extrai textos visíveis (h1, h2, labels, placeholders, títulos)
  const textos = [
    ...[...c.matchAll(/<h[1-4][^>]*>([^<]{3,60})</g)].map(m=>m[1].trim()),
    ...[...c.matchAll(/placeholder=["']([^"']{3,60})["']/g)].map(m=>m[1].trim()),
    ...[...c.matchAll(/<label[^>]*>([^<]{3,60})</g)].map(m=>m[1].trim()),
    ...[...c.matchAll(/<button[^>]*>([^<]{3,40})</g)].map(m=>m[1].trim()),
    ...[...c.matchAll(/<th[^>]*>([^<]{3,40})</g)].map(m=>m[1].trim()),
  ].filter(t => t && !t.includes('<%') && !t.includes('${'));

  // Extrai selects e options
  const selects = [...c.matchAll(/<select[^>]*name=["']([^"']+)["']/g)].map(m=>m[1]);
  const options = [...c.matchAll(/<option[^>]*>([^<]{2,30})</g)].map(m=>m[1].trim()).filter(Boolean);

  // Extrai inputs
  const inputs = [...c.matchAll(/<input[^>]*name=["']([^"']+)["']/g)].map(m=>m[1]);

  // Extrai fetch/ajax calls
  const fetches = [...c.matchAll(/fetch\(['"`]([^'"`]+)['"`]/g)].map(m=>m[1]);

  // Extrai onclick actions
  const onclicks = [...c.matchAll(/onclick=["']([^"']{3,80})["']/g)].map(m=>m[1]);

  // Extrai links internos
  const links = [...c.matchAll(/href=["']([^"']+)["']/g)].map(m=>m[1]).filter(l=>l.startsWith('/'));

  views[nome] = { textos: [...new Set(textos)].slice(0,20), selects, options: [...new Set(options)].slice(0,15), inputs: [...new Set(inputs)], fetches, onclicks: onclicks.slice(0,15), links: [...new Set(links)] };
});

// Lê cerebro/*.js e extrai intenções e padrões
const cerebroDir = './cerebro';
const modulos = {};
fs.readdirSync(cerebroDir).filter(f=>f.endsWith('.js')).forEach(file => {
  const c = fs.readFileSync(path.join(cerebroDir, file), 'utf8');
  const padroes = [...c.matchAll(/\/([^\/\n]{10,80})\//g)].map(m=>m[1]).filter(p=>!p.includes('*')&&p.length<80).slice(0,20);
  modulos[file] = { linhas: c.split('\n').length, padroes };
});

// Gera relatório completo
const relatorio = {
  geradoEm: new Date().toISOString(),
  server: {
    totalRotas: rotas.length,
    rotas: rotas,
    jsonsUsados: jsonsUnicos,
    viewsRenderizadas: rendersUnicos,
  },
  views: views,
  cerebro: modulos,
  resumo: {
    totalViews: Object.keys(views).length,
    totalCampos: Object.values(views).reduce((a,v)=>a+v.inputs.length,0),
    totalBotoes: Object.values(views).reduce((a,v)=>a+v.onclicks.length,0),
    totalLinks: Object.values(views).reduce((a,v)=>a+v.links.length,0),
    totalModulosCerebro: Object.keys(modulos).length,
    totalLinhasCerebro: Object.values(modulos).reduce((a,m)=>a+m.linhas,0),
  }
};

fs.writeFileSync('cerebro/mapa-completo.json', JSON.stringify(relatorio, null, 2));

console.log('=== MAPA COMPLETO DO SISTEMA ===');
console.log('Rotas:          ', relatorio.server.totalRotas);
console.log('Views:          ', relatorio.resumo.totalViews);
console.log('Campos/inputs:  ', relatorio.resumo.totalCampos);
console.log('Botoes/onclicks:', relatorio.resumo.totalBotoes);
console.log('Links internos: ', relatorio.resumo.totalLinks);
console.log('Modulos cerebro:', relatorio.resumo.totalModulosCerebro);
console.log('Linhas cerebro: ', relatorio.resumo.totalLinhasCerebro);
console.log('\nSalvo em cerebro/mapa-completo.json');
