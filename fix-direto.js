const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

let idx = fs.readFileSync(path.join(BASE,'cerebro','index.js'),'utf8');

// Ver o que tem perto de isScoring para achar ponto de inserção
const pos = idx.indexOf('isScoring');
console.log('Contexto em isScoring:');
console.log(idx.substring(pos-200, pos+100));
