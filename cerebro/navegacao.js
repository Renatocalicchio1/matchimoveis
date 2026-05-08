'use strict';
var fs   = require('fs');
var path = require('path');
var ARQUIVO = path.join(__dirname,'..','assistente-navegacao.json');
var ROTAS = {
  '/app-home':             {pagina:'dashboard',    label:'Dashboard',       dominio:'dashboard'},
  '/app/imoveis':          {pagina:'imoveis',      label:'Meus Imoveis',    dominio:'imoveis'},
  '/app/leads':            {pagina:'leads',        label:'Leads',           dominio:'leads'},
  '/app/visitas':          {pagina:'visitas',      label:'Visitas',         dominio:'visitas'},
  '/app/notificacoes':     {pagina:'notificacoes', label:'Notificacoes',    dominio:'notificacoes'},
  '/app/portais':          {pagina:'portais',      label:'Portais XML',     dominio:'portais'},
  '/app/perfil':           {pagina:'perfil',       label:'Perfil',          dominio:'sistema'},
  '/app/coins':            {pagina:'coins',        label:'MatchCoins',      dominio:'coins'},
  '/app/assistente':       {pagina:'assistente',   label:'Assistente',      dominio:'sistema'},
  '/app/cadastro':         {pagina:'cadastro',     label:'Cadastrar',       dominio:'imoveis'},
  '/app/imovel/cadastrar': {pagina:'cadastro',     label:'Cadastrar',       dominio:'imoveis'}
};
function carregar(){try{return JSON.parse(fs.readFileSync(ARQUIVO,'utf8'));}catch(e){return {sessoes:{},fluxos:[]};}}
function salvar(d){try{fs.writeFileSync(ARQUIVO,JSON.stringify(d,null,2));}catch(e){}}
function rastrear(req,res,next){
  try{
    if(req.method==='GET'&&req.session&&req.session.user&&ROTAS[req.path]){
      var uid=req.session.user.id||req.session.user.userId;
      var ctx=ROTAS[req.path];
      var d=carregar();
      var antes=d.sessoes[uid]?d.sessoes[uid].paginaAtual:null;
      d.sessoes[uid]={paginaAtual:ctx.pagina,labelAtual:ctx.label,dominioAtual:ctx.dominio,rotaAtual:req.path,atualizadoEm:new Date().toISOString(),paginaAnterior:antes||null};
      if(antes&&antes!==ctx.pagina){d.fluxos.push({de:antes,para:ctx.pagina,userId:uid,data:new Date().toISOString()});if(d.fluxos.length>1000)d.fluxos=d.fluxos.slice(-1000);}
      salvar(d);
    }
  }catch(e){}
  next();
}
function paginaAtual(uid){return carregar().sessoes[uid]||null;}
function contextoParaAssistente(uid){var s=paginaAtual(uid);if(!s)return null;return{paginaAtual:s.paginaAtual,labelAtual:s.labelAtual,dominioAtual:s.dominioAtual,paginaAnterior:s.paginaAnterior};}
function fluxosMaisComuns(n){n=n||10;var d=carregar();var c={};(d.fluxos||[]).forEach(function(f){var k=f.de+'->'+f.para;c[k]=(c[k]||0)+1;});return Object.entries(c).sort(function(a,b){return b[1]-a[1];}).slice(0,n).map(function(x){return{fluxo:x[0],count:x[1]};});}
module.exports={rastrear:rastrear,paginaAtual:paginaAtual,contextoParaAssistente:contextoParaAssistente,fluxosMaisComuns:fluxosMaisComuns,ROTAS:ROTAS};
