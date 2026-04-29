const fs = require('fs');

let s = fs.readFileSync('server.js','utf8');

// remove função quebrada
s = s.replace(/function saveUserFile[\s\S]*?\}/g,'');

// adiciona função correta no topo
s = s.replace("const app = express();", `
const fs = require('fs');
const path = require('path');

function getUserDir(telefone) {
  const dir = path.join('data','corretores', telefone || 'default');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  return dir;
}

function saveUserFile(telefone, file, data) {
  const dir = getUserDir(telefone);
  fs.writeFileSync(path.join(dir,file), JSON.stringify(data,null,2));
}

const app = express();
`);

fs.writeFileSync('server.js', s);

console.log('server.js corrigido');
