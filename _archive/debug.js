const fs = require('fs');
const path = require('path');
const BASE = __dirname;

// Limpar cache
Object.keys(require.cache).forEach(k => delete require.cache[k]);

const nlp = require('./cerebro/nlp');
const idx = require('./cerebro/index');

const D = {ativos:45,inativos:8,bairros:['Itajai','Balneario'],tipos:['Apartamento'],leads:87,organicas:52,importadas:35,comMatch:41,semMatch:46,visitas:12,hoje:2,pendentes:3,confirmadas:7};
const U = {nome:'Renato',id:'test',userId:'test'};

// Testar normalização
const casos = ['como cadastrar imóvel','como adicionar fotos','como conectar whatsapp'];
casos.forEach(p => {
  const mNorm = nlp.normalizar(p);
  console.log(`\nOriginal: "${p}"`);
  console.log(`Normalizado: "${mNorm}"`);
  // testar regex
  const hit = /como cadastrar|como adicionar foto|como conectar whatsapp/.test(mNorm);
  console.log(`isSistema hit: ${hit}`);
  const dominio = nlp.detectarDominio(mNorm);
  console.log(`Dominio: ${dominio}`);
  const r = idx.responder(p, D, U, [], [], [], {});
  console.log(`Resposta: ${r.replace(/<[^>]+>/g,'').substring(0,60)}`);
});

// Ver isSistema atual no index.js
const idxContent = fs.readFileSync(path.join(BASE,'cerebro','index.js'),'utf8');
const match = idxContent.match(/const isSistema[\s\S]{0,300}/);
console.log('\n--- isSistema no index.js ---');
console.log(match ? match[0].substring(0,300) : 'NÃO ENCONTRADO');
