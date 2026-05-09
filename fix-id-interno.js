const fs = require('fs');

// 1. importXMLCompleto.js — adicionar id interno
let xml = fs.readFileSync('importXMLCompleto.js','utf8');
if (!xml.includes("id: 'MI-'") && !xml.includes('"MI-"')) {
  xml = xml.replace(
    '      idExterno: idRaw,\n      idOriginal: idRaw,',
    '      id: \'MI-\' + Date.now() + \'-\' + Math.random().toString(36).substr(2,6).toUpperCase(),\n      idExterno: idRaw,\n      idOriginal: idRaw,'
  );
  fs.writeFileSync('importXMLCompleto.js', xml);
  console.log('1. importXMLCompleto.js — id interno adicionado');
} else {
  console.log('1. ja tem id interno');
}

// 2. server.js — rota de cadastro manual
let server = fs.readFileSync('server.js','utf8');
const rotaCadastro = server.indexOf("app.post('/app/imovel/cadastrar'");
if (rotaCadastro !== -1) {
  const trecho = server.slice(rotaCadastro, rotaCadastro + 800);
  if (!trecho.includes("'MI-'")) {
    // Adicionar id interno no objeto do imóvel cadastrado manualmente
    server = server.replace(
      "app.post('/app/imovel/cadastrar', auth, (req, res) => {",
      "app.post('/app/imovel/cadastrar', auth, (req, res) => {\n  const idInterno = 'MI-' + Date.now() + '-' + Math.random().toString(36).substr(2,6).toUpperCase();"
    );
    // Injetar id no objeto salvo
    server = server.replace(
      /const novoImovel\s*=\s*\{/,
      'const novoImovel = {\n      id: idInterno,'
    );
    fs.writeFileSync('server.js', server);
    console.log('2. server.js cadastro manual — id interno adicionado');
  } else {
    console.log('2. ja tem id interno no cadastro manual');
  }
} else {
  console.log('2. rota cadastro manual nao encontrada');
}

// 3. Corrigir imóveis existentes sem id — adicionar MI- retroativamente
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
let corrigidos = 0;
imoveis.forEach(i => {
  if (!i.id) {
    i.id = 'MI-' + Date.now() + '-' + Math.random().toString(36).substr(2,6).toUpperCase();
    corrigidos++;
  }
});
fs.writeFileSync('imoveis.json', JSON.stringify(imoveis, null, 2));
console.log('3. imoveis.json — ' + corrigidos + ' imóveis corrigidos com id interno');
