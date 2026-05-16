const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.RENDER
  ? '/opt/render/project/src/data'
  : '.';

function dataFile(name){
  return path.join(DATA_DIR, name);
}

const pacote = JSON.parse(
  fs.readFileSync('sync-ran-0888-9191.json','utf8')
);

const arquivos = {
  users: 'users.json',
  imoveis: 'imoveis.json',
  leads: 'leads.json',
  data: 'data.json',
  visitas: 'visitas.json',
  notificacoes: 'notificacoes.json'
};

for(const [key,file] of Object.entries(arquivos)){

  const destino = dataFile(file);

  const atuais = fs.existsSync(destino)
    ? JSON.parse(fs.readFileSync(destino,'utf8'))
    : [];

  const novos = Array.isArray(pacote[key])
    ? pacote[key]
    : [];

  const ids = new Set(
    novos.map(i => String(i.id || i._id || i.codigoUsuario || Math.random()))
  );

  const limpos = atuais.filter(i=>{
    const id = String(i.id || i._id || i.codigoUsuario || '');
    return !ids.has(id);
  });

  const final = [...limpos, ...novos];

  fs.writeFileSync(destino, JSON.stringify(final,null,2));

  console.log(file, final.length);
}

console.log('IMPORTACAO FINALIZADA');
