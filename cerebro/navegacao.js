'use strict';
const fs   = require('fs');
const path = require('path');
const ARQUIVO = path.join(__dirname,'..','assistente-navegacao.json');

const ROTAS = {
  '/app-home':             {pagina:'dashboard',    label:'Dashboard',       dominio:'dashboard'},
  '/app/imoveis':          {pagina:'imoveis',      label:'Meus Imoveis',    dominio:'imoveis'},
  '/app/leads':            {pagina:'leads',        label:'Leads',           dominio:'leads'},
  '/app/visitas':          {pagina:'visitas',      label:'Visitas',         dominio:'visitas'},
  '/app/notificacoes':     {pagina:'notificacoes', label:'Notificacoes',    dominio:'notificacoes'},
  '/app/portais':          {pagina:'portais',      label:'Portais XML',     dominio:'portais'},
  '/app/perfil':           {pagina:'perfil',       label:'Perfil',          dominio:'sistema'},
  '/app/coins':            {pagina:'coins',        label:'MatchCoins',      dominio:'coins'},
  '/app/assistente':       {pagina:'assistente',   label:'Assistente',      dominio:'sistema'},
  '/app/cadastro':         {pagina:'cadastro',     label:'Cadastrar Imovel',dominio:'imoveis'},
  '/app/imovel/cadastrar': {pagina:'cadastro',     label:'Cadastrar Imovel',dominio:'imoveis'},
};

function carregar() {
  try { return JSON.parse(fs.readFileSync(ARQUIVO,'utf8')); } catch(_) { return {sessoes:{},fluxos:[]}; }
}

function salvar(d) {
  fs.writeFileSync(ARQUIVO, JSON.stringify(d,null,2));
}

function rastrear(req, res, next) {
  if (req.method !== 'GET' || !req.session || !req.session.user) return next();
  const uid = req.session.user.id || req.session.user.userId;
  const ctx = ROTAS[req.path];
  if (!ctx) return next();
  const d = carregar();
  d.sessoes = d.sessoes || {};
  const antes = d.sessoes[uid] ? d.sessoes[uid].paginaAtual : null;
  d.sessoes[uid] = {
    paginaAtual:    ctx.pagina,
    labelAtual:     ctx.label,
    dominioAtual:   ctx.dominio,
    rotaAtual:      req.path,
    atualizadoEm:   new Date().toISOString(),
    paginaAnterior: antes || null
  };
  if (antes && antes !== ctx.pagina) {
    d.fluxos = d.fluxos || [];
    d.fluxos.push({de:antes, para:ctx.pagina, userId:uid, data:new Date().toISOString()});
    if (d.fluxos.length > 1000) d.fluxos = d.fluxos.slice(-1000);
  }
  salvar(d);
  next();
}

function paginaAtual(uid) {
  return carregar().sessoes[uid] || null;
}

function contextoParaAssistente(uid) {
  const s = paginaAtual(uid);
  if (!s) return null;
  return { paginaAtual:s.paginaAtual, labelAtual:s.labelAtual, dominioAtual:s.dominioAtual, paginaAnterior:s.paginaAnterior };
}

function fluxosMaisComuns(n) {
  n = n || 10;
  const d = carregar();
  const c = {};
  (d.fluxos||[]).forEach(function(f){ var k=f.de+'->'+f.para; c[k]=(c[k]||0)+1; });
  return Object.entries(c).sort(function(a,b){return b[1]-a[1];}).slice(0,n).map(function(x){return {fluxo:x[0],count:x[1]};});
}

module.exports = { rastrear, paginaAtual, contextoParaAssistente, fluxosMaisComuns, ROTAS };
