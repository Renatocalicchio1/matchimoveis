const fs = require('fs');

// 1. app-imoveis.ejs — links usar id interno
let ejs = fs.readFileSync('views/app-imoveis.ejs','utf8');
ejs = ejs.replace(
  '<a href="/app/imovel/<%= item.idExterno %>" target="_blank" class="card-action-btn details" onclick="event.stopPropagation()">👁 Ver</a>',
  '<a href="/app/imovel/<%= item.id || item.idExterno %>" target="_blank" class="card-action-btn details" onclick="event.stopPropagation()">👁 Ver</a>'
);
ejs = ejs.replace(
  '<a href="/app/imovel/<%= item.idExterno %>/editar" class="card-action-btn edit" onclick="event.stopPropagation()">✏️ Editar</a>',
  '<a href="/app/imovel/<%= item.id || item.idExterno %>/editar" class="card-action-btn edit" onclick="event.stopPropagation()">✏️ Editar</a>'
);
ejs = ejs.replace(
  'data-id="<%= item.idExterno || item.id || idx %>"',
  'data-id="<%= item.id || item.idExterno || idx %>"'
);
fs.writeFileSync('views/app-imoveis.ejs', ejs);
console.log('1. app-imoveis.ejs — links atualizados para id interno');

// 2. app-imovel-detalhe.ejs — busca e links internos
let detalhe = fs.readFileSync('views/app-imovel-detalhe.ejs','utf8');
// Links de editar no detalhe
detalhe = detalhe.replace(
  /href="\/app\/imovel\/<%= imovel\.idExterno %>/g,
  'href="/app/imovel/<%= imovel.id || imovel.idExterno %>'
);
detalhe = detalhe.replace(
  /href="\/imovel\/<%= imovel\.idExterno %>/g,
  'href="/imovel/<%= imovel.id || imovel.idExterno %>'
);
fs.writeFileSync('views/app-imovel-detalhe.ejs', detalhe);
console.log('2. app-imovel-detalhe.ejs — links atualizados');

// 3. server.js — rotas buscam por id interno primeiro (já fazem, mas garantir)
let server = fs.readFileSync('server.js','utf8');

// Rota /app/imovel/:id — adicionar busca por i.id
server = server.replace(
  "const imovel = imoveis.find(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id));\n  if (!imovel) return res.status(404).send('Imóvel não encontrado');",
  "const imovel = imoveis.find(i => String(i.id) === String(req.params.id) || String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id));\n  if (!imovel) return res.status(404).send('Imóvel não encontrado');"
);

fs.writeFileSync('server.js', server);
console.log('3. server.js — busca por id interno primeiro');

// 4. cerebro/imoveis.js — links da busca no chat usar id interno
let cerebro = fs.readFileSync('cerebro/imoveis.js','utf8');
cerebro = cerebro.replace(
  /\/imovel\/' \+ i\.idExterno/g,
  "/imovel/' + (i.id || i.idExterno)"
);
fs.writeFileSync('cerebro/imoveis.js', cerebro);
console.log('4. cerebro/imoveis.js — links atualizados');

// 5. cerebro/contexto.js — links usar id interno
let ctx = fs.readFileSync('cerebro/contexto.js','utf8');
ctx = ctx.replace(
  /\/imovel\/' \+ i\.idExterno/g,
  "/imovel/' + (i.id || i.idExterno)"
);
fs.writeFileSync('cerebro/contexto.js', ctx);
console.log('5. cerebro/contexto.js — links atualizados');

console.log('\nPronto!');
