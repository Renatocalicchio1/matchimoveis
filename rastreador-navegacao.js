const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// ── 1. Criar cerebro/navegacao.js ─────────────────────────────────────────────
const navegacaoJS = `'use strict';
/**
 * RASTREADOR DE NAVEGAÇÃO
 * Observa onde o usuário está e aprende o fluxo real de uso.
 * Middleware: app.use(navegacao.rastrear)
 * Acesso: navegacao.paginaAtual(userId)
 */

const fs   = require('fs');
const path = require('path');
const ARQUIVO = path.join(__dirname,'..','assistente-navegacao.json');

// Mapa de rotas → contexto legível
const CONTEXTO_ROTA = {
  '/app-home':                  { pagina:'dashboard',      label:'Dashboard',       dominio:'dashboard' },
  '/app/imoveis':               { pagina:'imoveis',        label:'Meus Imóveis',    dominio:'imoveis' },
  '/app/leads':                 { pagina:'leads',          label:'Leads',           dominio:'leads' },
  '/app/visitas':               { pagina:'visitas',        label:'Visitas',         dominio:'visitas' },
  '/app/notificacoes':          { pagina:'notificacoes',   label:'Notificações',    dominio:'notificacoes' },
  '/app/portais':               { pagina:'portais',        label:'Portais XML',     dominio:'portais' },
  '/app/perfil':                { pagina:'perfil',         label:'Perfil',          dominio:'sistema' },
  '/app/coins':                 { pagina:'coins',          label:'MatchCoins',      dominio:'coins' },
  '/app/assistente':            { pagina:'assistente',     label:'Assistente',      dominio:'sistema' },
  '/app/cadastro':              { pagina:'cadastro',       label:'Cadastrar Imóvel',dominio:'imoveis' },
  '/app/imovel/cadastrar':      { pagina:'cadastro',       label:'Cadastrar Imóvel',dominio:'imoveis' },
};

function carregar() {
  if (!fs.existsSync(ARQUIVO)) return { sessoes:{}, fluxos:[] };
  try { return JSON.parse(fs.readFileSync(ARQUIVO,'utf8')); } catch(_) { return { sessoes:{}, fluxos:[] }; }
}

function salvar(d) {
  fs.writeFileSync(ARQUIVO, JSON.stringify(d,null,2));
}

// Middleware Express — intercepta toda navegação GET
function rastrear(req, res, next) {
  if (req.method !== 'GET') return next();
  if (!req.session?.user) return next();

  const uid   = req.session.user.id || req.session.user.userId;
  const rota  = req.path;
  const ctx   = CONTEXTO_ROTA[rota];
  if (!ctx) return next();

  const d = carregar();
  d.sessoes = d.sessoes || {};

  // Registrar sessão atual
  const antes = d.sessoes[uid]?.paginaAtual;
  d.sessoes[uid] = {
    paginaAtual:  ctx.pagina,
    labelAtual:   ctx.label,
    dominioAtual: ctx.dominio,
    rotaAtual:    rota,
    atualizadoEm: new Date().toISOString(),
    paginaAnterior: antes || null,
  };

  // Registrar fluxo de navegação
  d.fluxos = d.fluxos || [];
  if (antes && antes !== ctx.pagina) {
    d.fluxos.push({
      de: antes, para: ctx.pagina,
      userId: uid, data: new Date().toISOString()
    });
    if (d.fluxos.length > 1000) d.fluxos = d.fluxos.slice(-1000);
  }

  salvar(d);
  next();
}

// Retorna página atual do usuário
function paginaAtual(uid) {
  const d = carregar();
  return d.sessoes?.[uid] || null;
}

// Retorna fluxos mais comuns (para aprendizado)
function fluxosMaisComuns(n=10) {
  const d = carregar();
  const contagem = {};
  (d.fluxos||[]).forEach(f => {
    const key = f.de + ' → ' + f.para;
    contagem[key] = (contagem[key]||0) + 1;
  });
  return Object.entries(contagem)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,n)
    .map(([fluxo,count])=>({fluxo,count}));
}

// Contexto para o assistente — sabe onde o usuário está
function contextoParaAssistente(uid) {
  const sessao = paginaAtual(uid);
  if (!sessao) return null;
  return {
    paginaAtual:    sessao.paginaAtual,
    labelAtual:     sessao.labelAtual,
    dominioAtual:   sessao.dominioAtual,
    paginaAnterior: sessao.paginaAnterior,
    mensagem: \`Usuário está em: \${sessao.labelAtual}\`
  };
}

module.exports = { rastrear, paginaAtual, contextoParaAssistente, fluxosMaisComuns, CONTEXTO_ROTA };
`;

fs.writeFileSync(path.join(BASE,'cerebro','navegacao.js'), navegacaoJS);
console.log('✅ cerebro/navegacao.js criado');

// ── 2. Patch no index.js — usar contexto de navegação ─────────────────────────
let idx = fs.readFileSync(path.join(BASE,'cerebro','index.js'),'utf8');

if (!idx.includes('navegacao')) {
  // Adicionar require
  idx = idx.replace(
    `const { criarArvore } = require('./arvore');`,
    `const { criarArvore } = require('./arvore');
const navegacao = require('./navegacao');`
  );

  // Usar contexto de navegação na função responder
  idx = idx.replace(
    `function responder(mensagem, d, user, imoveis, leads, visitas, contexto) {
  const uid    = user.id || user.userId || 'anon';
  const mNorm  = nlp.normalizar(mensagem);`,
    `function responder(mensagem, d, user, imoveis, leads, visitas, contexto) {
  const uid    = user.id || user.userId || 'anon';
  const mNorm  = nlp.normalizar(mensagem);

  // Contexto de navegação — onde o usuário está agora
  const ctxNav = navegacao.contextoParaAssistente(uid);
  // Se o usuário está em uma página específica e pergunta algo vago
  // usar o domínio da página como contexto adicional
  if (ctxNav && !nlp.detectarDominio(mNorm) && ctxNav.dominioAtual) {
    contexto = { ...contexto, dominioNav: ctxNav.dominioAtual, paginaNav: ctxNav.labelAtual };
  }`
  );

  fs.writeFileSync(path.join(BASE,'cerebro','index.js'), idx);
  console.log('✅ index.js — contexto de navegação integrado');
}

// ── 3. Instrução para adicionar middleware no server.js ───────────────────────
console.log('\n📋 ADICIONAR NO server.js:');
console.log('');
console.log('// No topo, após os outros requires:');
console.log("const navegacao = require('./cerebro/navegacao');");
console.log('');
console.log('// Logo após app.use(session(...)):');
console.log('app.use(navegacao.rastrear);');
console.log('');
console.log('// Na rota POST /app/assistente/chat, o contexto já é passado automaticamente');
console.log('// pelo index.js que lê assistente-navegacao.json');

// ── 4. Verificar onde adicionar no server.js ──────────────────────────────────
const server = fs.readFileSync(path.join(BASE,'server.js'),'utf8');
const linhaSession = server.split('\n').findIndex(l => l.includes('app.use(session'));
console.log(`\n📍 Linha do session no server.js: ${linhaSession+1}`);
console.log('   Adicione app.use(navegacao.rastrear) após essa linha');

