const http = require('http');

const rotas = [
  '/login',
  '/app-home',
  '/app/imoveis',
  '/app/cadastro',
  '/app/importar-leads',
  '/app/leads',
  '/app/portais',
  '/app/visitas',
  '/app/perfil'
];

function testar(path){
  return new Promise(resolve=>{
    http.get({host:'localhost',port:3000,path}, res=>{
      resolve({rota:path,status:res.statusCode});
    }).on('error', err=>{
      resolve({rota:path,status:'ERRO',erro:err.message});
    });
  });
}

(async()=>{
  for(const rota of rotas){
    const r = await testar(rota);
    console.log(`${r.status}  ${r.rota}${r.erro ? ' - '+r.erro : ''}`);
  }
})();
