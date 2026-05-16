const fs = require('fs');
const path = require('path');
const BASE = __dirname;

let f = fs.readFileSync(path.join(BASE,'views','app-assistente.ejs'),'utf8');

// Adicionar delay de pensamento antes da chamada ao servidor
f = f.replace(
  "const res=await fetch('/app/assistente/chat',",
  "await new Promise(function(r){setTimeout(r, 600+Math.random()*900)});\n    const res=await fetch('/app/assistente/chat',"
);

fs.writeFileSync(path.join(BASE,'views','app-assistente.ejs'), f);
console.log('ok — delay de pensamento adicionado');
