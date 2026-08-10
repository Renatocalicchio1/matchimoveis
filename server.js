
// Cache QR codes em memória (Evolution v2.2.3 envia via webhook)
const _qrCache = {};
require("dotenv").config();
const express = require('express');
const bcrypt = require('bcrypt');
const cerebroApp = require("./cerebro/index");
const cerebroNLP = require("./services/cerebro-nlp");



const fs = require('fs');
const centralOperacional = require("./services/centralOperacional");
const { consumir, adicionarCreditos, temSaldo, saldo: saldoCreditos, CUSTO } = require("./services/creditos");
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const _mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });

// ── HELPER: verificar saldo antes de ação ───────────────────────────────────
function checarSaldo(acao, custo) {
  return (req, res, next) => {
    const user = req.session?.user;
    const _u = (_cacheUsuarios||[]).find(u => u.id === user?.id || u.codigoUsuario === user?.codigoUsuario);
    const saldo = _u?.matchCoins ?? user?.matchCoins ?? 0;
    if(saldo < custo) {
      const msg = encodeURIComponent(`Saldo insuficiente para "${acao}". Você tem ${saldo} coins e precisa de ${custo}.`);
      return res.redirect('/app/coins?erro=' + msg);
    }
    next();
  };
}
// ────────────────────────────────────────────────────────────────────────────
const { lerLeads: lerLeadsService, salvarLead, atualizarLead: atualizarLeadService, deletarLead, salvarTodosLeads } = require('./services/salvarLead');
const { lerFeeds: lerFeedsService, salvarFeed: salvarFeedService, removerFeed: removerFeedService } = require('./services/salvarXmlFeed');
const { lerImoveis: lerImoveisService, salvarImovel, salvarTodosImoveis } = require('./services/salvarImovel');
const { lerVisitas: lerVisitasService, salvarVisita, atualizarVisita: atualizarVisitaService, deletarVisita, salvarTodasVisitas } = require('./services/salvarVisita');
const { lerNotificacoes: lerNotificacoesService, criarNotificacao: criarNotificacaoService, marcarLida, marcarTodasLidas } = require('./services/salvarNotificacao');
const { lerUsuarios: lerUsuariosService, lerUsuario: lerUsuarioService, salvarUsuario: salvarUsuarioService, atualizarUsuario: atualizarUsuarioService, salvarTodosUsuarios } = require('./services/salvarUsuario');
const { aplicarWorkflowVisita } = require('./services/visitaWorkflow');
const path = require('path');

const DATA_DIR = process.env.RENDER
  ? '/opt/render/project/src/data'
  : __dirname;

// Normaliza telefone — sempre com 55 na frente
function _normTel(t) {
  if (!t) return '';
  let _t = String(t).replace(/D/g, '');
  if (_t.startsWith('55') && _t.length >= 12) return _t;
  if (_t.length === 10 || _t.length === 11) return '55' + _t;
  return _t;
}

const BASE_URL = process.env.RENDER
  ? 'https://matchimoveis.ia.br'
  : 'http://localhost:3000';

// Notificação sino "novo lead" — usada por todos os pontos de entrada de lead
// VISÍVEL de cara (portal, manual, planilha, captação). Leads do WhatsApp
// (leadOculta:true) NÃO usam isso — só notificam quando reveladas, ver match-core.js
function _notificarNovaLead(userId, leadId, nome, origemLabel){
  try {
    if (!userId) return;
    criarNotificacaoService({
      id: Date.now().toString() + '_' + Math.random().toString(36).slice(2,7),
      tipo: 'novo_lead',
      titulo: 'Novo lead chegou',
      mensagem: (nome || 'Lead') + ' entrou em contato via ' + origemLabel,
      usuarioId: userId,
      leadId: leadId || '',
      lida: false,
      criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
    });
  } catch(e) { console.error('[notif nova lead]', e.message); }
}

function dataFile(name){
  return path.join(DATA_DIR, name);
}

function dataPath(file){
  return dataFile(file);
}

// Verificação opcional de segredo nos webhooks de portal (ImovelWeb, GrupoOLX,
// 123i, Chaves). Hoje a única "credencial" desses webhooks é o userId na URL,
// que também aparece em /captar/:userId e /site/:codigoUsuario — quem descobre
// um código consegue injetar lead falsa em conta alheia. Não dá pra EXIGIR o
// token sem quebrar as integrações já configuradas em produção nos portais
// (o corretor precisaria voltar em cada portal e adicionar ?token=... na URL
// já cadastrada) — então a verificação é aceita se enviada (?token=), mas
// não obrigatória ainda. Pra reforçar uma conta específica, adiciona
// "?token=<valor>" na URL do webhook configurada naquele portal, usando o
// valor retornado por _webhookTokenEsperado(userId).
function _webhookTokenEsperado(userId) {
  const crypto = require('crypto');
  const segredo = process.env.WEBHOOK_PORTAL_SECRET || 'matchimoveis-webhook-default';
  return crypto.createHmac('sha256', segredo).update(String(userId)).digest('hex').slice(0, 16);
}
function _webhookTokenValido(userId, req) {
  const tokenRecebido = req.query.token || req.query.secret || '';
  if (!tokenRecebido) return true; // compatibilidade com integrações já configuradas sem token
  return tokenRecebido === _webhookTokenEsperado(userId);
}

// JSON.stringify() não escapa "</script>" — se um valor (ex: nome de lead
// vindo de webhook público) contiver isso, quebra a tag <script> e injeta JS
// arbitrário na página (stored XSS). Usar sempre que for injetar JSON direto
// dentro de <script> via <%- %> no EJS (não precisa nos <%= %>, que já escapa).
function _jsonScript(obj){
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// Escapa HTML pra uso nos poucos lugares onde a página é montada como
// template string em vez de EJS (que já escapa por padrão com <%= %>).
function _escapeHtml(str){
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureDataFiles(){
  try{
    if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive:true });

    const arquivos = [
      'users.json',
      'imoveis.json',
      'leads.json',
      'visitas.json',
      'notificacoes.json',
      'data.json',
      'portais.json',
      'xml-feeds.json',
      'assistente-memoria.json',
      'assistente-navegacao.json',
      'assistente-nao-entendidos.json',
      'chat-history.json'
    ];

    arquivos.forEach(file=>{
      const destino = dataFile(file);
      const origem = path.join(__dirname, file);

      if(!fs.existsSync(destino)){
        if(fs.existsSync(origem)){
          fs.copyFileSync(origem, destino);
        } else {
          fs.writeFileSync(destino, file.includes('navegacao') ? '{"sessoes":{},"fluxos":[]}' : '[]');
        }
      }
    });
  }catch(e){
    console.error('Erro ensureDataFiles:', e.message);
  }
}

ensureDataFiles();




// Inicializa diretório de dados persistentes
if (process.env.RENDER) {
  if (!fs.existsSync('/opt/render/project/src/data')) {
    fs.mkdirSync('/opt/render/project/src/data', { recursive: true });
  }
  // Copia JSONs do repo para o disco persistente se não existirem
  ['data.json','visitas.json','notificacoes.json','users.json','imoveis.json'].forEach(file => {
    const dest = '/opt/render/project/src/data/' + file;
    const src = '/opt/render/project/src/' + file;
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log('Copiado para disco persistente:', file);
    }
  });
}

// Caminho persistente no Render

const app = express();

// ── Domínio canônico: garante que a sessão sempre viva em www.matchimoveis.ia.br ──
// Quem acessa via matchimoveis.onrender.com (ou outro host) fica com o cookie
// de sessão preso naquele domínio e chega "deslogado" em fluxos que dependem
// do domínio certo (ex: callback OAuth do Instagram, cadastrado na Meta como
// www.matchimoveis.ia.br). Webhooks externos (Meta, Evolution API, portais,
// MercadoPago) e o health check do Render ficam de fora do redirect, pois
// podem ser chamados direto via onrender.com.
const CANONICAL_HOST = 'www.matchimoveis.ia.br';
const ROTAS_SEM_REDIRECT_CANONICO = ['/webhook', '/health'];
app.use((req, res, next) => {
  if (!process.env.RENDER) return next();
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  if (host === CANONICAL_HOST) return next();
  if (ROTAS_SEM_REDIRECT_CANONICO.some(r => req.path.startsWith(r))) return next();
  return res.redirect(301, 'https://' + CANONICAL_HOST + req.originalUrl);
});

const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const _pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.set('trust proxy', 1);
app.use(session({
  store: new pgSession({ pool: _pgPool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || require('crypto').randomBytes(64).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.RENDER ? true : false,
    sameSite: process.env.RENDER ? 'none' : 'lax',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));
const navegacao = require("./cerebro/navegacao");
app.use(navegacao.rastrear); // rastreia navegação para o cérebro

const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
// Força no-cache em rotas autenticadas — sem isso o navegador pode servir uma
// versão antiga de uma tela do admin (HTML gerado dinamicamente, sem esse
// header) mesmo depois de um deploy novo, até o usuário dar refresh forçado.
app.use(['/app', '/admin'], (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
const UPLOADS_STATIC_DIR = process.env.RENDER
  ? '/opt/render/project/src/data/uploads/imoveis'
  : path.join(__dirname, 'public', 'uploads', 'imoveis');
app.use('/data-uploads', express.static(UPLOADS_STATIC_DIR));

// Áudios de WhatsApp (recebidos do lead ou gravados/enviados pelo admin na
// inbox de /admin/whatsapp-cloud) — mesmo disco persistente do Render usado
// pelas fotos de imóvel, só que numa subpasta própria.
const UPLOADS_AUDIO_DIR = process.env.RENDER
  ? '/opt/render/project/src/data/uploads/whatsapp-audio'
  : path.join(__dirname, 'public', 'uploads', 'whatsapp-audio');
fs.mkdirSync(UPLOADS_AUDIO_DIR, { recursive: true });
app.use('/data-uploads-audio', express.static(UPLOADS_AUDIO_DIR));

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
// ── SEGURANÇA: HELMET (headers HTTP) ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // desabilita CSP para não quebrar EJS inline
  crossOriginEmbedderPolicy: false
}));
// ── SEGURANÇA: RATE LIMIT GERAL ──────────────────────────────────────────────
const limiterGeral = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300, // máx 300 requisições por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Tente novamente em 15 minutos.' }
});
app.use(limiterGeral);
// ── SEGURANÇA: RATE LIMIT LOGIN (anti brute force) ───────────────────────────
const limiterLogin = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máx 10 tentativas de login por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});
app.use('/login', limiterLogin);
app.use('/api/login', limiterLogin);
app.use('/admin/login', limiterLogin);
// ── SEGURANÇA: MITIGAÇÃO DE CSRF NAS AÇÕES ADMIN ────────────────────────────
// O painel /admin não tem token CSRF por formulário (implementar isso em
// todo formulário HTML montado como template string, espalhado por dezenas
// de rotas, é mudança grande demais pra fazer com segurança de uma vez).
// Como mitigação equivalente e de baixo risco: em toda ação que muda estado
// (POST/PUT/PATCH/DELETE) sob /admin, confere que o Origin (ou Referer, como
// fallback) bate com o próprio host — barra o caso clássico de CSRF (site
// malicioso induzindo o navegador do admin logado a submeter uma ação daqui).
// Requisição sem esses headers (chamada direta via script/curl com o cookie
// de sessão) não é bloqueada por esse checker — não é o vetor de CSRF (que
// depende do NAVEGADOR da vítima mandar o header de origem automaticamente).
function _checarOrigemAdmin(req, res, next) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  const origem = req.headers.origin || req.headers.referer || '';
  if (!origem) return next();
  try {
    if (new URL(origem).host !== req.headers.host) {
      console.warn('[CSRF] origem suspeita bloqueada em /admin:', origem, '| host esperado:', req.headers.host);
      return res.status(403).send('Origem inválida.');
    }
  } catch(e) {}
  next();
}
app.use('/admin', _checarOrigemAdmin);
// ── SEGURANÇA: RATE LIMIT VITRINE PÚBLICA (mitiga IDOR de leadId previsível) ──
// leadId é Date.now().toString() (timestamp em ms) — não dá pra exigir o
// userId da URL como segredo obrigatório sem quebrar o fluxo real de
// compartilhamento manual (app-lead-detalhe.ejs manda o link SEM userId no
// texto de WhatsApp que o corretor reenvia). O limiter não fecha o IDOR de
// vez, mas torna inviável varrer a faixa de timestamps por scraping.
const limiterVitrine = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Tente novamente em alguns minutos.' }
});
app.use('/cliente/oferta', limiterVitrine);
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

// ── ROTEAMENTO POR DOMÍNIO PRÓPRIO (site white-label) ────────────────────────
// Requisição chegando por um domínio diferente do nosso: resolve o dono pelo
// hostname (nunca por parâmetro do client) e serve a mesma view do site público.
const _HOSTS_PLATAFORMA = new Set(['matchimoveis.ia.br', 'www.matchimoveis.ia.br', 'localhost']);
app.use(async (req, res, next) => {
  try {
    const host = (req.hostname || '').toLowerCase();
    if (!host || _HOSTS_PLATAFORMA.has(host) || host.endsWith('.onrender.com')) return next();
    const { buscarConfigPorDominio } = require('./services/salvarSiteConfig');
    const config = await buscarConfigPorDominio(host).catch(() => null);
    if (!config) return next();
    const codigoUsuario = config.user_id;
    const matchImovel = req.path.match(/^\/imovel\/([^/]+)\/?$/);
    if (matchImovel) return _handlerSiteImovelPublico(req, res, codigoUsuario, matchImovel[1], '');
    if (req.path === '/' || req.path === '') return _handlerSitePublico(req, res, codigoUsuario, '');
    if (req.path === '/sitemap.xml') return _handlerSiteSitemap(req, res, codigoUsuario, req.protocol + '://' + host);
    if (req.path === '/robots.txt') return _handlerSiteRobots(req, res, req.protocol + '://' + host);
    return next();
  } catch(e) {
    console.error('[roteamento-dominio]', e.message);
    return next();
  }
});
// ── FIM ROTEAMENTO POR DOMÍNIO PRÓPRIO ───────────────────────────────────────

// ── PRESENÇA ONLINE (pra /admin/online) ──────────────────────────────────────
// Registra em memória, a cada navegação de página, quem está usando o sistema
// agora e em qual tela — dado efêmero, não é persistido em banco.
app.use((req, res, next) => {
  if (req.method === 'GET' && req.session && req.session.user && req.path.startsWith('/app')) {
    try {
      const { registrar, rotaParaLabel } = require('./services/presencaOnline');
      const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
      registrar(uid, { nome: req.session.user.nome || '', codigoUsuario: uid, rota: req.path, rotaLabel: rotaParaLabel(req.path) });
    } catch(e) {}
  }
  next();
});

app.post('/api/presenca/heartbeat', (req, res) => {
  try {
    if (req.session && req.session.user) {
      const { registrar, rotaParaLabel } = require('./services/presencaOnline');
      const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
      const rota = (req.body && req.body.rota) || '/app-home';
      registrar(uid, { nome: req.session.user.nome || '', codigoUsuario: uid, rota, rotaLabel: rotaParaLabel(rota) });
    }
  } catch(e) {}
  res.sendStatus(204);
});
// ── FIM PRESENÇA ONLINE ───────────────────────────────────────────────────────

// ── SEGURANÇA: BLOQUEIA TUDO QUANDO SALDO ZERADO ────────────────────────────
// Antes só bloqueava POST (ações que mudam estado); leitura (GET) continuava
// livre com saldo zerado. Agora bloqueia navegação inteira sob /app — a única
// rota que continua acessível é /app/coins (senão a pessoa fica sem como
// comprar mais créditos). Login/logout não são afetados por não estarem sob
// /app. Isso vale pra QUALQUER usuário que zere o saldo, não só quem entrou
// pela campanha de leads garantidos.
const _rotasLivresSaldo = ['/app/coins'];
app.use('/app', async (req, res, next) => {
  if (!req.session || !req.session.user) return next();
  const _rota = req.path;
  if (_rotasLivresSaldo.some(r => _rota.startsWith(r.replace('/app','')))) return next();
  try {
    const { saldo: _getSaldo } = require('./services/creditos');
    const _uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
    const _saldo = await _getSaldo(_uid);
    if (_saldo <= 0) {
      const _querJson = (req.headers['content-type']||'').includes('application/json')
        || (req.headers['accept']||'').includes('application/json')
        || req.xhr;
      if (_querJson) {
        return res.status(402).json({ ok: false, erro: 'Conta pausada. Adicione créditos para continuar.', pausada: true });
      }
      return res.redirect('/app/coins?erro=saldo_zerado');
    }
  } catch(e) { /* silencioso — não bloqueia em caso de erro */ }
  next();
});

// ── PERFIL OBRIGATÓRIO PRA CONTAS CRIADAS VIA CAMPANHA DE AQUISIÇÃO ─────────
// Quem entra pelo botão do disparo ganha conta com nome provisório (da
// planilha) e sem e-mail/localização. Antes de liberar o resto da
// plataforma, obriga trocar nome, e-mail e localização (flag
// precisaCompletarPerfil, desligada em _verificarPerfilCompleto assim que os
// 3 requisitos forem cumpridos). Só afeta quem tem essa flag — usuários
// normais não são tocados.
const _rotasLivresPerfil = ['/app/perfil'];
app.use('/app', (req, res, next) => {
  if (!req.session || !req.session.user || !req.session.user.precisaCompletarPerfil) return next();
  const _rota = req.path;
  if (_rotasLivresPerfil.some(r => _rota.startsWith(r.replace('/app','')))) return next();
  const _querJson = (req.headers['content-type']||'').includes('application/json')
    || (req.headers['accept']||'').includes('application/json')
    || req.xhr;
  if (_querJson) {
    return res.status(403).json({ ok: false, erro: 'Complete seu nome, e-mail e localização no perfil para continuar.', perfilIncompleto: true });
  }
  return res.redirect('/app/perfil?completarPerfil=1');
});

// ── COMBO OBRIGATÓRIO PRA CONTAS CRIADAS VIA CAMPANHA DE LEADS GARANTIDOS ───
// Os 1.000 créditos de bônus que essa conta ganha na hora do cadastro são só
// pra poder mexer no sistema e ver o valor — não substituem a compra. Depois
// de completar o perfil, ainda obriga contratar um dos combos (flag
// precisaComprarPlano) antes de liberar o resto. A confirmação de pagamento
// chega via webhook assíncrono do Mercado Pago (sem sessão), então não dá pra
// confiar só na flag em memória da sessão — reconsulta o banco enquanto ela
// estiver ligada, pra pegar a baixa assim que o pagamento cair.
const _rotasLivresPlano = ['/app/perfil', '/app/coins'];
app.use('/app', async (req, res, next) => {
  if (!req.session || !req.session.user || !req.session.user.precisaComprarPlano) return next();
  const _rota = req.path;
  if (_rotasLivresPlano.some(r => _rota.startsWith(r.replace('/app','')))) return next();
  try {
    const { lerUsuarios: _luPlano } = require('./services/salvarUsuario');
    const users = await _luPlano();
    const u = users.find(x => x.id === req.session.user.id);
    if (u && !u.precisaComprarPlano) {
      req.session.user.precisaComprarPlano = false;
      return next();
    }
  } catch(e) {}
  const _querJson2 = (req.headers['content-type']||'').includes('application/json')
    || (req.headers['accept']||'').includes('application/json')
    || req.xhr;
  if (_querJson2) {
    return res.status(403).json({ ok: false, erro: 'Contrate um dos combos de leads garantidos para continuar.', precisaComprarPlano: true });
  }
  return res.redirect('/app/perfil?comprarPlano=1');
});

// ── SEGURANÇA: SANITIZAÇÃO DE INPUTS ─────────────────────────────────────────
app.use((req, res, next) => {
  const sanitize = (obj) => {
    if (!obj) return obj;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key]
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    }
    return obj;
  };
  sanitize(req.body);
  sanitize(req.query);
  next();
});

// ── SEGURANÇA: LOG DE TENTATIVAS SUSPEITAS ────────────────────────────────────
const _logSeguranca = async (tipo, req, dados = {}) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'desconhecido';
    const user_agent = req.headers['user-agent'] || '';
    await _pgPool.query(
      'INSERT INTO log_seguranca (tipo, ip, user_agent, dados) VALUES ($1, $2, $3, $4)',
      [tipo, ip, user_agent, JSON.stringify(dados)]
    );
  } catch(e) { /* silencioso — log não pode derrubar a app */ }
};

const _alertaWA = async (mensagem) => {
  try {
    const EVOLUTION_URL = process.env.EVOLUTION_URL;
    const EVOLUTION_KEY = process.env.EVOLUTION_KEY;
    const MEU_NUMERO = '55' + '11951131609';
    await fetch(`${EVOLUTION_URL}/message/sendText/match-renhuh6`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number: MEU_NUMERO, text: mensagem })
    });
  } catch(e) { /* silencioso */ }
};

// Monitora tentativas de login suspeitas
const _contadorLoginFalho = {};
const _registrarLoginFalho = async (req, email) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  const chave = ip + '|' + (email || '');
  _contadorLoginFalho[chave] = (_contadorLoginFalho[chave] || 0) + 1;
  await _logSeguranca('login_falho', req, { email, tentativas: _contadorLoginFalho[chave] });
  if (_contadorLoginFalho[chave] === 5) {
    await _alertaWA(`⚠️ ALERTA MatchImóveis\n5 tentativas de login falhas\nIP: ${ip}\nEmail: ${email || 'desconhecido'}\nHorário: ${new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})}`);
  }
};
app.use((req, res, next) => {
  const suspeito = ['../', 'etc/passwd', 'wp-admin', '.env', 'phpinfo', 'eval(', 'union select', 'drop table'];
  const url = req.url.toLowerCase();
  if (suspeito.some(s => url.includes(s))) {
    console.warn(`[SEGURANÇA] ⚠️ Tentativa suspeita: IP=${req.ip} URL=${req.url}`);
  }
  next();
});

// ── ROTAS DE VISITA v2 ────────────────────────────────────────────────────────
const visitasRouter = require('./routes/visitas-v2');
app.use(visitasRouter);



// ====== HELPERS ======

function loadImoveis() {
  try {
    return ((_cacheImoveis || []));
  } catch {
    return [];
  }
}

// ====== ROTAS ======


// ═══════════════════════════════════════════════════════

// ── ADMIN SHELL — menu lateral padrão do painel admin, mesmo estilo visual do
// app do corretor (sidebar fixa + seções + item ativo destacado), trocando o
// header antigo de botões coloridos empilhados. Reaproveitado por todas as
// páginas HTML do admin via _adminShellCss()/_adminSidebarHtml(activeKey).
const _ADMIN_NAV = [
  { sec: 'Principal', items: [
    { key: 'dashboard', href: '/admin', icon: '📊', label: 'Dashboard' },
    { key: 'online', href: '/admin/online', icon: '🟢', label: 'Usuários Online' },
    { key: 'status', href: '/admin/status', icon: '🖥️', label: 'Status do Sistema' },
    { key: 'leads-auditoria', href: '/admin/leads-auditoria', icon: '🕵️', label: 'Auditoria de Leads' },
    { key: 'buscar-imovel', href: '/admin/buscar-imovel', icon: '🔍', label: 'Buscar/Excluir Imóvel' },
    { key: 'interesados', href: '/admin/interesados', icon: '📥', label: 'Interessados de Portal' },
    { key: 'demanda', href: '/admin/demanda', icon: '📍', label: 'Buscar Demanda por Região' }
  ]},
  { sec: 'Comunicação', items: [
    { key: 'campanha', href: '/admin/campanha', icon: '📧', label: 'Campanha Email' },
    { key: 'captacao-campanha', href: '/admin/captacao-campanha', icon: '🏠', label: 'Campanha Captação' },
    { key: 'disparos', href: '/admin/disparos', icon: '📲', label: 'Disparos WhatsApp' },
    { key: 'optout', href: '/admin/disparos/optout', icon: '🚫', label: 'Opt-out' },
    { key: 'whatsapp-cloud', href: '/admin/whatsapp-cloud', icon: '💬', label: 'Inbox WhatsApp' },
    { key: 'painel-whatsapp', href: 'https://match-evolution-api.onrender.com/manager', icon: '📱', label: 'Painel WhatsApp', externo: true }
  ]},
  { sec: 'Ferramentas', items: [
    { key: 'cerebro', href: '/admin/cerebro', icon: '🧠', label: 'Cérebro do Assistente' },
    { key: 'rematch', href: '/admin/rematch', icon: '🔄', label: 'Gerar Match de Conta' },
    { key: 'quintoandar', href: '/admin/quintoandar-solicitacoes', icon: '🏢', label: 'Solicitações QuintoAndar' },
    { key: 'exclusao', href: '/admin/exclusao-solicitacoes', icon: '🗑️', label: 'Exclusão de Conta' }
  ]},
  // "Contas Admin" só é utilizável pelo superadmin (ver checagem específica
  // em authAdmin) — fica visível no menu pra todo mundo por simplicidade
  // (evitar ter que passar sessão pra _adminSidebarHtml em todas as ~20
  // chamadas espalhadas pelo arquivo), mas sub-admin que clicar recebe
  // "acesso negado" — não é uma rota alcançável de outra forma.
  { sec: 'Administração', items: [
    { key: 'contas-admin', href: '/admin/contas-admin', icon: '👤', label: 'Contas Admin' }
  ]}
];

function _adminShellCss() {
  return `
    :root{--brand:#FF385C;--dark:#111111;--text:#1a1a1a;--text-sec:#6b7280;--text-ter:#9ca3af;--bg:#f8f8f7;--white:#ffffff;--border:#e5e5e3;--border-light:#f0f0ee;--sidebar-w:190px}
    .admin-app{min-height:100vh;background:var(--bg)}
    .admin-sidebar{width:var(--sidebar-w);background:var(--white);border-right:0.5px solid var(--border);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:200;overflow-y:auto}
    .admin-logo{display:flex;align-items:center;gap:6px;padding:14px 16px;border-bottom:0.5px solid var(--border-light);text-decoration:none}
    .admin-logo .sq{width:24px;height:24px;background:var(--brand);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0}
    .admin-logo .tx{font-size:13px;font-weight:700;color:var(--dark)}
    .admin-logo .tx span{color:var(--brand)}
    .admin-menu{padding:8px 6px;flex:1}
    .admin-sec{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-ter);padding:14px 12px 6px}
    .admin-sec:first-child{padding-top:6px}
    .admin-menu a{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:10px;color:var(--text-sec);text-decoration:none;font-size:12px;transition:all .1s;margin-bottom:2px}
    .admin-menu a:hover{background:var(--bg);color:var(--text)}
    .admin-menu a.active{background:#fff1f1;color:var(--brand);font-weight:600}
    .admin-menu .ic{width:18px;text-align:center;flex-shrink:0}
    .admin-foot{border-top:0.5px solid var(--border-light);padding:10px}
    .admin-foot a{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:10px;color:var(--text-sec);text-decoration:none;font-size:12px}
    .admin-foot a:hover{background:var(--bg);color:var(--text)}
    .admin-content{margin-left:var(--sidebar-w);flex:1;min-width:0;padding:24px}
    .admin-mob-btn{display:none}
    @media(max-width:900px){
      .admin-sidebar{transform:translateX(-100%);transition:transform .2s;box-shadow:0 0 30px rgba(0,0,0,.15)}
      .admin-sidebar.open{transform:translateX(0)}
      .admin-content{margin-left:0;padding:56px 14px 24px}
      .admin-mob-btn{display:flex!important}
    }
  `;
}

// segundoArg: omitido/undefined (chamada antiga, maioria das ~20 páginas
// admin) mostra o menu completo pra manter compatibilidade; `true` (só usado
// no dashboard e em /admin/contas-admin quando é de fato o superadmin) mostra
// tudo incluindo a seção "Administração"; um array (permissões de uma conta
// admin secundária) filtra o menu só pras páginas liberadas — usado hoje só
// no dashboard, que é a página de entrada depois do login.
function _adminSidebarHtml(activeKey, segundoArg) {
  const restringir = Array.isArray(segundoArg);
  const permitido = (key) => !restringir || segundoArg.includes(key);
  const secoes = _ADMIN_NAV
    .filter(sec => sec.sec !== 'Administração' || segundoArg === true)
    .map(sec => {
      const itensVisiveis = sec.items.filter(it => permitido(it.key));
      if (!itensVisiveis.length) return '';
      const itens = itensVisiveis.map(it => {
        const ativo = it.key === activeKey ? ' active' : '';
        const alvo = it.externo ? ' target="_blank"' : '';
        return `<a class="${ativo.trim()}" href="${it.href}"${alvo}><span class="ic">${it.icon}</span>${it.label}</a>`;
      }).join('');
      return `<div class="admin-sec">${sec.sec}</div>${itens}`;
    }).join('');
  return `<button class="admin-mob-btn" onclick="document.querySelector('.admin-sidebar').classList.toggle('open')" style="position:fixed;top:12px;left:12px;z-index:250;background:#fff;border:1px solid #e5e5e3;border-radius:8px;padding:8px 10px;cursor:pointer;flex-direction:column;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,.1)"><div style="width:18px;height:2px;background:#374151"></div><div style="width:18px;height:2px;background:#374151"></div><div style="width:18px;height:2px;background:#374151"></div></button>
  <aside class="admin-sidebar">
    <a class="admin-logo" href="/admin"><span class="sq">M</span><span class="tx">Match<span>Imóveis</span> <span style="font-weight:400;color:var(--text-ter)">admin</span></span></a>
    <nav class="admin-menu">${secoes}</nav>
    <div class="admin-foot"><a href="/admin/logout">🚪 Sair</a></div>
  </aside>`;
}
// ── FIM ADMIN SHELL ──────────────────────────────────────────────────────────

// ── ADMIN CÉREBRO ────────────────────────────────────────────────────────────
app.get('/admin/cerebro', authAdmin, (req, res) => {
  const base = JSON.parse(fs.readFileSync(path.join(__dirname,'cerebro','base-conhecimento-expandida.json'),'utf8'));
  const navegador = require('./cerebro/navegador');
  const { PAGINAS, FLUXOS } = navegador;
  
  // Agrupar variações por intenção
  const variacoesPorIntencao = {};
  base.items.forEach(function(item) {
    const r = String(item.r || 'sem');
    if (!variacoesPorIntencao[r]) variacoesPorIntencao[r] = [];
    variacoesPorIntencao[r].push(item.p);
  });
  
  // Adicionar variações em cada item
  const baseComVariacoes = base.items.map(function(item) {
    const r = String(item.r || 'sem');
    return Object.assign({}, item, {
      variacoes: (variacoesPorIntencao[r] || []).filter(function(p){ return p !== item.p; }).slice(0, 8)
    });
  });
  
  const modulos = {
    base_conhecimento: baseComVariacoes,
    paginas: Object.entries(PAGINAS).map(([id,p]) => ({ id, titulo: p.titulo, rota: p.rota, keywords: p.keywords, oque_tem: p.oque_tem||[], botoes: p.botoes||[] })),
    fluxos: Object.entries(FLUXOS).map(([id,f]) => ({ id, titulo: f.titulo, rota: f.rota, passos: f.passos })),
  };
  
  res.render('admin-cerebro', { modulos, totalBase: base.total, adminShellCss: _adminShellCss(), adminSidebar: _adminSidebarHtml('cerebro') });
});


app.post('/admin/cerebro/testar', authAdmin, express.json(), async (req, res) => {
  try {
    const { pergunta } = req.body;
    const uid = 'REN-HUH6';
    const imoveis = (_cacheImoveis||[]).filter(i=>i.userId===uid);
    const leads = (_cacheLeads||[]).filter(l=>l.userId===uid);
    const visitas = (_cacheVisitas||[]).filter(v=>v.userId===uid);
    const d = {
      ativos: imoveis.filter(i=>i.status!=='inativo').length,
      inativos: imoveis.filter(i=>i.status==='inativo').length,
      bairros: [...new Set(imoveis.map(i=>i.bairro).filter(Boolean))],
      leads: leads.length, comMatch: leads.filter(l=>l.matchesBase&&l.matchesBase.length>0).length,
      semMatch: leads.filter(l=>!l.matchesBase||!l.matchesBase.length).length,
      quentes: leads.filter(l=>l.temperatura==='quente').length,
      visitas: visitas.length, pendentes: visitas.filter(v=>v.status==='solicitada').length,
      confirmadas: visitas.filter(v=>v.status==='confirmada'||v.status==='lead_confirmou').length,
      topBairrosDemanda:[], topTiposDemanda:[], leadsQuentes:[], leadsRecentes:[],
    };
    const user = { id: uid, nome: 'Admin Teste' };
    const resposta = await Promise.resolve(cerebroApp.responder(pergunta, d, user, imoveis, leads, visitas));
    res.json({ ok: true, resposta: resposta || 'Sem resposta' });
  } catch(e) {
    res.json({ ok: false, erro: e.message });
  }
});

app.post('/admin/cerebro/salvar', authAdmin, express.json(), (req, res) => {
  try {
    const { tipo, id, dados } = req.body;
    
    if (tipo === 'base') {
      const basePath = path.join(__dirname,'cerebro','base-conhecimento-expandida.json');
      const base = JSON.parse(fs.readFileSync(basePath,'utf8'));
      const idx = base.items.findIndex(i => i.p === id);
      if (idx >= 0) {
        base.items[idx] = { ...base.items[idx], ...dados };
      } else {
        base.items.push({ p: dados.p, r: dados.r });
      }
      base.total = base.items.length;
      fs.writeFileSync(basePath, JSON.stringify(base, null, 2));
    }
    
    if (tipo === 'deletar_base') {
      const basePath = path.join(__dirname,'cerebro','base-conhecimento-expandida.json');
      const base = JSON.parse(fs.readFileSync(basePath,'utf8'));
      base.items = base.items.filter(i => i.p !== id);
      base.total = base.items.length;
      fs.writeFileSync(basePath, JSON.stringify(base, null, 2));
    }
    
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, erro: e.message });
  }
});

// ÁREA ADMIN
// ═══════════════════════════════════════════════════════
// Mapeamento path-prefix → permissão (chave de _ADMIN_NAV) usado por
// authAdmin pra decidir se uma conta admin secundária (não-superadmin) pode
// acessar a rota pedida. Ordem não importa — _permissaoDaRota pega sempre o
// prefixo mais específico (mais longo) que bater. Rota /admin/* que não bate
// em nada aqui cai no fallback 'dashboard' (mesma permissão da tela
// principal, que já concentra as ações de gestão de usuário — editar,
// resetar senha, ajustar créditos).
const _ADMIN_ROTA_PERMISSAO = [
  ['/admin/disparos/optout', 'optout'],
  ['/admin/disparos', 'disparos'],
  ['/admin/demanda', 'demanda'],
  ['/admin/campanha', 'campanha'],
  ['/admin/captacao-campanha', 'captacao-campanha'],
  ['/admin/whatsapp-cloud', 'whatsapp-cloud'],
  ['/admin/cerebro', 'cerebro'],
  ['/admin/rematch', 'rematch'],
  ['/admin/quintoandar', 'quintoandar'],
  ['/admin/exclusao-solicitacoes', 'exclusao'],
  ['/admin/leads-auditoria', 'leads-auditoria'],
  ['/admin/buscar-imovel', 'buscar-imovel'],
  ['/admin/interesados', 'interesados'],
  ['/admin/online', 'online'],
  ['/admin/status', 'status']
];
function _permissaoDaRota(caminho) {
  const bateu = _ADMIN_ROTA_PERMISSAO
    .filter(([prefixo]) => caminho === prefixo || caminho.startsWith(prefixo + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return bateu ? bateu[1] : 'dashboard';
}
// Login (e "Entrar" a partir de /admin/contas-admin) não pode mandar todo
// mundo direto pra '/admin' — se a conta não tem a permissão 'dashboard'
// marcada, ela trava com "acesso negado" na primeira tela, sem nem chegar a
// ver o menu com o resto do que ela PODE acessar. Acha a 1ª página (na
// mesma ordem do menu) que a lista de permissões realmente libera.
function _primeiraPaginaPermitida(permissoes) {
  const set = new Set(permissoes || []);
  for (const sec of _ADMIN_NAV) {
    if (sec.sec === 'Administração') continue;
    for (const it of sec.items) {
      if (!it.externo && set.has(it.key)) return it.href;
    }
  }
  return null;
}
// Ações sensíveis demais pra depender só do checklist de páginas — mesmo uma
// conta admin com permissão de 'dashboard' NÃO alcança essas: gerenciar
// outras contas admin (evita auto-promoção), impersonar qualquer corretor
// logando como ele, deletar conta de corretor, e a rotina específica de
// cruzamento de dados do Alexandre. Só o superadmin (login via
// ADMIN_USER/ADMIN_PASSWORD) passa por aqui.
// Dentro de /admin/campanha (permissão 'campanha'), conta admin secundária
// só vê/usa os blocos "Base de contatos", "Validação de email" e "Contatos
// importados" — disparar campanha (iniciar/pausar o automático), importar
// nova planilha de contatos e mandar e-mail de teste ficam de fora, por
// pedido explícito (jul/2026): mexem direto nos 118k contatos/reputação do
// domínio de envio, então ficam restritas ao superadmin mesmo com a página
// liberada. GET /admin/campanha/status, /contatos e /preview/:id continuam
// liberados (é o que os 3 blocos permitidos usam). Mesma lógica em
// /admin/captacao-campanha (permissão 'captacao-campanha'): só o
// acompanhamento (progresso, funil, envios recentes) é liberado —
// iniciar/pausar o disparo em massa fica restrito.
const _ADMIN_ROTAS_SUPERADMIN_ONLY = [
  '/admin/contas-admin', '/admin/acessar', '/admin/deletar',
  '/admin/cruzar-proprietarios-alex', '/admin/executar-cruzar-alex',
  '/admin/campanha/importar', '/admin/campanha/teste',
  '/admin/campanha/iniciar', '/admin/campanha/pausar',
  '/admin/captacao-campanha/iniciar', '/admin/captacao-campanha/pausar'
];
function authAdmin(req, res, next) {
  if (!(req.session && req.session.admin)) return res.redirect('/admin/login');
  // !== false (não === true): sessão de admin aberta ANTES desse recurso
  // existir tem session.admin=true mas session.adminSuper undefined — trata
  // como superadmin (era o único tipo de sessão possível até aqui). Só uma
  // conta secundária de fato tem adminSuper=false explícito (setado no
  // login de /admin/contas-admin).
  if (req.session.adminSuper !== false) return next();
  if (_ADMIN_ROTAS_SUPERADMIN_ONLY.some(p => req.path === p || req.path.startsWith(p + '/'))) {
    return res.status(403).send('Acesso negado — essa área é restrita ao administrador principal.');
  }
  const permissoes = req.session.adminPermissoes || [];
  const chave = _permissaoDaRota(req.path);
  if (permissoes.includes(chave)) return next();
  res.status(403).send('Acesso negado — sua conta admin não tem permissão pra essa área. Fale com o administrador.');
}

app.get('/admin/login', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin · MatchImóveis</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#f8f8f7;display:flex;align-items:center;justify-content:center;min-height:100vh;}
.box{background:#fff;border:1px solid #e5e5e3;border-radius:16px;padding:32px;width:100%;max-width:360px;}
h1{font-size:18px;font-weight:700;color:#111;margin-bottom:4px;}
p{font-size:13px;color:#888;margin-bottom:24px;}
label{font-size:12px;font-weight:500;color:#555;display:block;margin-bottom:5px;}
input{width:100%;border:1px solid #e5e5e3;border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:16px;outline:none;}
input:focus{border-color:#111;}
button{width:100%;background:#111;color:#fff;border:none;border-radius:8px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;}
.err{color:#e8404a;font-size:12px;margin-bottom:12px;}
</style>
</head>
<body>
<div class="box">
  <h1>Admin</h1>
  <p>MatchImóveis — Área restrita</p>
  ${req.query.error ? '<div class="err">Credenciais inválidas</div>' : ''}
  <form method="POST" action="/admin/login">
    <label>Usuário</label>
    <input type="text" name="usuario" required autofocus>
    <label>Senha</label>
    <input type="password" name="senha" required>
    <button type="submit">Entrar</button>
  </form>
</div>
</body>
</html>`);
});

app.post('/admin/login', async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASSWORD;
    if (usuario === adminUser && senha === adminPass) {
      req.session.admin = true;
      req.session.adminSuper = true;
      req.session.adminPermissoes = null;
      req.session.adminNome = 'Superadmin';
      req.session.adminUsuario = usuario;
      return res.redirect('/admin');
    }
    const { buscarAdminConta, atualizarUltimoLoginAdminConta } = require('./services/salvarAdminConta');
    const conta = await buscarAdminConta(usuario);
    if (conta && conta.ativo && await bcrypt.compare(senha || '', conta.senhaHash)) {
      req.session.admin = true;
      req.session.adminSuper = false;
      req.session.adminPermissoes = conta.permissoes;
      req.session.adminNome = conta.nome || conta.usuario;
      req.session.adminUsuario = conta.usuario;
      atualizarUltimoLoginAdminConta(conta.id).catch(() => {});
      // '/admin' (dashboard) exige a permissão 'dashboard' — se essa conta
      // não tem ela marcada, manda direto pra 1ª página que ela realmente
      // acessa, senão ela trava em "acesso negado" na primeira tela depois
      // de logar (bug real: aconteceu com as contas do Rafael e do Bruno,
      // criadas sem Dashboard marcado).
      return res.redirect(_primeiraPaginaPermitida(conta.permissoes) || '/admin');
    }
  } catch (e) { console.error('[admin/login] erro:', e.message); }
  res.redirect('/admin/login?error=1');
});

app.get('/admin/logout', (req, res) => {
  req.session.admin = false;
  req.session.adminSuper = false;
  req.session.adminPermissoes = null;
  req.session.adminNome = null;
  req.session.adminUsuario = null;
  res.redirect('/admin/login');
});

// ── Gestão de contas admin secundárias (só superadmin — ver
// _ADMIN_ROTAS_SUPERADMIN_ONLY em authAdmin) ────────────────────────────────
function _escAdminHtml(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _checklistPermissoesHtml(marcadas) {
  const set = new Set(marcadas || []);
  return _ADMIN_NAV
    .filter(sec => sec.sec !== 'Administração')
    .map(sec => {
      const itens = sec.items.filter(it => !it.externo).map(it => {
        const checked = set.has(it.key) ? ' checked' : '';
        return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;cursor:pointer">
          <input type="checkbox" name="permissoes" value="${it.key}"${checked}>
          <span>${it.icon} ${_escAdminHtml(it.label)}</span>
        </label>`;
      }).join('');
      if (!itens) return '';
      return `<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-ter);margin-bottom:4px">${_escAdminHtml(sec.sec)}</div>${itens}</div>`;
    }).join('');
}

app.get('/admin/contas-admin', authAdmin, async (req, res) => {
  try {
    const { listarAdminContas } = require('./services/salvarAdminConta');
    const contas = await listarAdminContas();
    const linhas = contas.map(c => `
      <tr>
        <td>${_escAdminHtml(c.usuario)}</td>
        <td>${_escAdminHtml(c.nome || '—')}</td>
        <td>${(c.permissoes || []).length ? c.permissoes.map(p => `<span class="tag">${_escAdminHtml(p)}</span>`).join(' ') : '<span class="gray">nenhuma</span>'}</td>
        <td>${c.ativo ? '<span class="green">ativo</span>' : '<span class="red">desativado</span>'}</td>
        <td>${c.ultimoLogin ? new Date(c.ultimoLogin).toLocaleString('pt-BR') : '<span class="gray">nunca</span>'}</td>
        <td style="white-space:nowrap" data-id="${c.id}" data-usuario="${_escAdminHtml(c.usuario)}" data-permissoes="${_escAdminHtml((c.permissoes || []).join(','))}" data-ativo="${c.ativo ? '1' : '0'}">
          ${c.ativo ? `<a href="/admin/contas-admin/${c.id}/entrar" style="background:#111;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:11.5px;margin-right:4px;text-decoration:none;display:inline-block">🔓 Entrar</a>` : ''}
          <button type="button" class="btn-permissoes">✏️ Permissões</button>
          <button type="button" class="btn-senha">🔑 Senha</button>
          <button type="button" class="btn-ativo">${c.ativo ? '⛔ Desativar' : '✅ Ativar'}</button>
          <button type="button" class="btn-deletar" style="color:#e8404a">🗑️</button>
        </td>
      </tr>`).join('');

    res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Contas Admin · MatchImóveis</title>
<style>
*{box-sizing:border-box}body{font-family:'Inter',sans-serif;margin:0}
${_adminShellCss()}
.card{background:#fff;border:1px solid #e5e5e3;border-radius:12px;padding:20px;margin-bottom:20px}
h2{font-size:16px;margin:0 0 14px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px;font-size:11px;text-transform:uppercase;color:#888;border-bottom:1px solid #e5e5e3}
td{padding:8px;border-bottom:1px solid #f0f0ee;vertical-align:top}
.tag{display:inline-block;background:#f0f0ee;border-radius:6px;padding:2px 7px;font-size:11px;margin:1px}
.green{color:#16a34a;font-weight:600}.red{color:#e8404a;font-weight:600}.gray{color:#9ca3af}
input[type=text],input[type=password]{width:100%;border:1px solid #e5e5e3;border-radius:8px;padding:9px 10px;font-size:13px;margin-bottom:10px}
button{background:#111;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:11.5px;cursor:pointer;margin-right:4px}
button:hover{opacity:.85}
.checklist{max-height:340px;overflow-y:auto;border:1px solid #e5e5e3;border-radius:8px;padding:12px;margin-bottom:12px}
#status{font-size:13px;margin-top:8px}
</style></head>
<body>
<div class="admin-app">${_adminSidebarHtml('contas-admin', true)}
<main class="admin-content">
  <div class="card">
    <h2>➕ Nova conta admin</h2>
    <form id="formCriar">
      <label style="font-size:12px;color:#555">Nome</label>
      <input type="text" id="cNome" placeholder="Ex: Mariana">
      <label style="font-size:12px;color:#555">Usuário (login)</label>
      <input type="text" id="cUsuario" placeholder="Ex: mariana" required>
      <label style="font-size:12px;color:#555">Senha</label>
      <input type="password" id="cSenha" placeholder="Senha inicial" required>
      <div style="font-size:12px;color:#555;margin-bottom:6px">Páginas liberadas (checklist de permissões)</div>
      <div class="checklist">${_checklistPermissoesHtml([])}</div>
      <button type="submit">Criar conta</button>
      <div id="status"></div>
    </form>
  </div>

  <div class="card">
    <h2>👥 Contas existentes</h2>
    <table>
      <thead><tr><th>Usuário</th><th>Nome</th><th>Permissões</th><th>Status</th><th>Último login</th><th>Ações</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="6" class="gray">Nenhuma conta admin criada ainda.</td></tr>'}</tbody>
    </table>
  </div>
</main>
</div>
<script>
document.getElementById('formCriar').addEventListener('submit', async function(e){
  e.preventDefault();
  const nome = document.getElementById('cNome').value.trim();
  const usuario = document.getElementById('cUsuario').value.trim();
  const senha = document.getElementById('cSenha').value;
  const permissoes = Array.from(document.querySelectorAll('.checklist input[name=permissoes]:checked')).map(function(el){ return el.value; });
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Criando...';
  try {
    const r = await fetch('/admin/contas-admin/criar', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nome, usuario, senha, permissoes }) });
    const d = await r.json();
    if(!d.ok){ statusEl.innerHTML = '<span class="red">'+d.erro+'</span>'; return; }
    location.reload();
  } catch(e){ statusEl.innerHTML = '<span class="red">Erro ao criar conta.</span>'; }
});
const CHAVES_PERMISSOES = ${JSON.stringify(_ADMIN_NAV.filter(s => s.sec !== 'Administração').flatMap(s => s.items.filter(it => !it.externo).map(it => it.key + ' — ' + it.label)))};
async function editarPermissoes(id, permissoesAtuais){
  const atuais = permissoesAtuais.join(', ') || '(nenhuma)';
  const txt = prompt('Permissões atuais: ' + atuais + '\\n\\nPáginas disponíveis:\\n' + CHAVES_PERMISSOES.join('\\n') + '\\n\\nDigite as chaves separadas por vírgula:', permissoesAtuais.join(','));
  if(txt === null) return;
  const permissoes = txt.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  const r = await fetch('/admin/contas-admin/' + id + '/permissoes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ permissoes }) });
  const d = await r.json();
  if(!d.ok){ alert(d.erro || 'Erro'); return; }
  location.reload();
}
async function resetarSenha(id){
  const senha = prompt('Nova senha para essa conta:');
  if(!senha) return;
  const r = await fetch('/admin/contas-admin/' + id + '/senha', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ senha }) });
  const d = await r.json();
  if(!d.ok){ alert(d.erro || 'Erro'); return; }
  alert('Senha atualizada.');
}
async function toggleAtivo(id, ativo){
  const r = await fetch('/admin/contas-admin/' + id + '/ativo', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ativo: ativo }) });
  const d = await r.json();
  if(!d.ok){ alert(d.erro || 'Erro'); return; }
  location.reload();
}
async function deletarConta(id, usuario){
  if(!confirm('Excluir a conta admin "' + usuario + '"? Essa ação não pode ser desfeita.')) return;
  const r = await fetch('/admin/contas-admin/' + id + '/deletar', { method:'POST' });
  const d = await r.json();
  if(!d.ok){ alert(d.erro || 'Erro'); return; }
  location.reload();
}
document.querySelectorAll('td[data-id]').forEach(function(td){
  const id = td.getAttribute('data-id');
  const usuario = td.getAttribute('data-usuario');
  const permissoesAtuais = td.getAttribute('data-permissoes') ? td.getAttribute('data-permissoes').split(',') : [];
  const ativo = td.getAttribute('data-ativo') === '1';
  const btnP = td.querySelector('.btn-permissoes');
  if(btnP) btnP.addEventListener('click', function(){ editarPermissoes(id, permissoesAtuais); });
  const btnS = td.querySelector('.btn-senha');
  if(btnS) btnS.addEventListener('click', function(){ resetarSenha(id); });
  const btnA = td.querySelector('.btn-ativo');
  if(btnA) btnA.addEventListener('click', function(){ toggleAtivo(id, !ativo); });
  const btnD = td.querySelector('.btn-deletar');
  if(btnD) btnD.addEventListener('click', function(){ deletarConta(id, usuario); });
});
</script>
</body></html>`);
  } catch (e) {
    console.error('[admin/contas-admin]', e.message);
    res.status(500).send('Erro ao carregar contas admin: ' + e.message);
  }
});

app.post('/admin/contas-admin/criar', authAdmin, express.json(), async (req, res) => {
  try {
    const { nome, usuario, senha, permissoes } = req.body;
    const usuarioVal = String(usuario || '').trim();
    if (!usuarioVal || usuarioVal.length < 3) return res.json({ ok: false, erro: 'Usuário inválido (mínimo 3 caracteres).' });
    if (!senha || senha.length < 4) return res.json({ ok: false, erro: 'Senha muito curta (mínimo 4 caracteres).' });
    const { buscarAdminConta, criarAdminConta } = require('./services/salvarAdminConta');
    if (usuarioVal === process.env.ADMIN_USER || await buscarAdminConta(usuarioVal)) {
      return res.json({ ok: false, erro: 'Já existe uma conta admin com esse usuário.' });
    }
    const senhaHash = await bcrypt.hash(senha, 10);
    const permissoesValidas = (Array.isArray(permissoes) ? permissoes : []).filter(p =>
      _ADMIN_NAV.some(sec => sec.items.some(it => it.key === p && !it.externo && sec.sec !== 'Administração'))
    );
    await criarAdminConta({ usuario: usuarioVal, senhaHash, nome, permissoes: permissoesValidas, criadoPor: req.session.adminUsuario || 'superadmin' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/contas-admin/criar]', e.message);
    res.json({ ok: false, erro: 'Erro ao criar conta: ' + e.message });
  }
});

// Superadmin entra direto numa conta admin secundária (mesmo efeito de
// logar com o usuário/senha dela, sem precisar saber a senha) — útil pra
// conferir o que aquela conta enxerga de verdade. Rota já cai em
// _ADMIN_ROTAS_SUPERADMIN_ONLY (prefixo /admin/contas-admin), então só o
// superadmin chega aqui. Troca a sessão pra a identidade da conta secundária
// (sem volta automática — pra voltar a ser superadmin, é só logar de novo
// em /admin/login com o usuário/senha principal).
app.get('/admin/contas-admin/:id/entrar', authAdmin, async (req, res) => {
  try {
    const { buscarAdminContaPorId } = require('./services/salvarAdminConta');
    const conta = await buscarAdminContaPorId(req.params.id);
    if (!conta) return res.redirect('/admin/contas-admin');
    req.session.admin = true;
    req.session.adminSuper = false;
    req.session.adminPermissoes = conta.permissoes;
    req.session.adminNome = conta.nome || conta.usuario;
    req.session.adminUsuario = conta.usuario;
    // Mesmo motivo do login em si: '/admin' exige a permissão 'dashboard',
    // que essa conta pode não ter — manda pra 1ª página que ela acessa de
    // verdade, senão o superadmin cai direto num "acesso negado" ao entrar.
    res.redirect(_primeiraPaginaPermitida(conta.permissoes) || '/admin');
  } catch (e) {
    console.error('[admin/contas-admin/entrar]', e.message);
    res.redirect('/admin/contas-admin');
  }
});

app.post('/admin/contas-admin/:id/permissoes', authAdmin, express.json(), async (req, res) => {
  try {
    const { permissoes } = req.body;
    const permissoesValidas = (Array.isArray(permissoes) ? permissoes : []).filter(p =>
      _ADMIN_NAV.some(sec => sec.items.some(it => it.key === p && !it.externo && sec.sec !== 'Administração'))
    );
    const { atualizarPermissoesAdminConta } = require('./services/salvarAdminConta');
    await atualizarPermissoesAdminConta(req.params.id, permissoesValidas);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/admin/contas-admin/:id/senha', authAdmin, express.json(), async (req, res) => {
  try {
    const { senha } = req.body;
    if (!senha || senha.length < 4) return res.json({ ok: false, erro: 'Senha muito curta (mínimo 4 caracteres).' });
    const senhaHash = await bcrypt.hash(senha, 10);
    const { atualizarSenhaAdminConta } = require('./services/salvarAdminConta');
    await atualizarSenhaAdminConta(req.params.id, senhaHash);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/admin/contas-admin/:id/ativo', authAdmin, express.json(), async (req, res) => {
  try {
    const { atualizarAtivoAdminConta } = require('./services/salvarAdminConta');
    await atualizarAtivoAdminConta(req.params.id, !!req.body.ativo);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/admin/contas-admin/:id/deletar', authAdmin, async (req, res) => {
  try {
    const { deletarAdminConta } = require('./services/salvarAdminConta');
    await deletarAdminConta(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, erro: e.message }); }
});

// os.totalmem()/os.freemem() reportam a RAM do HOST físico (o Render roda em host
// compartilhado) — num container isso mostra dezenas de GB mesmo com o processo
// perto do limite real de memória do plano, mascarando o risco. Lê o limite real
// do cgroup (Linux/Render) quando disponível; local (Mac/dev) cai no os.totalmem().
function _limiteMemoriaContainer() {
  try {
    const fs = require('fs');
    if (fs.existsSync('/sys/fs/cgroup/memory.max')) {
      const v = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
      if (v !== 'max') { const n = parseInt(v); if (n > 0 && n < 1e15) return n; }
    }
    if (fs.existsSync('/sys/fs/cgroup/memory/memory.limit_in_bytes')) {
      const n = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim());
      if (n > 0 && n < 1e15) return n; // valor gigante (~9223372036854771712) = sem limite, ignora
    }
  } catch(e) {}
  return null;
}

app.get('/admin/status', authAdmin, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const os = require('os');

    // ── BANCO ─────────────────────────────────────────────
    const _pingStart = Date.now();
    await _q('SELECT 1');
    const _pingPG = Date.now() - _pingStart;
    const _totUsu   = await _q('SELECT COUNT(*) as total FROM usuarios');
    const _totLead  = await _q('SELECT COUNT(*) as total FROM leads');
    const _totImo   = await _q('SELECT COUNT(*) as total FROM imoveis');
    const _totVis   = await _q('SELECT COUNT(*) as total FROM visitas');
    const _semSaldo = await _q('SELECT COUNT(*) as total FROM usuarios WHERE match_coins <= 0');
    const _dbSize   = await _q("SELECT pg_size_pretty(pg_database_size(current_database())) as size, pg_database_size(current_database()) as bytes");
    const _conns    = await _q("SELECT count(*) as total FROM pg_stat_activity WHERE state='active'");
    const _dbMB     = Math.round(parseInt(_dbSize.rows[0].bytes) / 1024 / 1024);

    // ── SERVIDOR ──────────────────────────────────────────
    const _uptimeSec = process.uptime();
    const _uptimeStr = Math.floor(_uptimeSec/3600) + 'h ' + Math.floor((_uptimeSec%3600)/60) + 'm';
    const _memUsed   = Math.round(process.memoryUsage().heapUsed/1024/1024);
    const _memTotal  = Math.round(process.memoryUsage().heapTotal/1024/1024);
    const _memRSS    = Math.round(process.memoryUsage().rss/1024/1024);
    const _loadAvg   = os.loadavg()[0].toFixed(2);
    const _limiteContainer = _limiteMemoriaContainer();
    const _totalMem  = _limiteContainer ? Math.round(_limiteContainer/1024/1024) : Math.round(os.totalmem()/1024/1024);
    const _freeMem   = Math.max(0, _totalMem - _memRSS);
    const _memPct    = Math.round((_memRSS/_totalMem)*100);

    // ── EVOLUTION API ─────────────────────────────────────
    let _waInstancias = [];
    let _waPing = 0;
    let _waOk = false;
    try {
      const _waStart = Date.now();
      const _rWA = await fetch('https://match-evolution-api.onrender.com/instance/fetchInstances', { headers: { apikey: 'match2025evolution' } });
      _waPing = Date.now() - _waStart;
      _waInstancias = await _rWA.json();
      _waOk = true;
    } catch(e) { _waOk = false; }
    const _waOpen  = _waInstancias.filter(i=>i.connectionStatus==='open').length;
    const _waClose = _waInstancias.filter(i=>i.connectionStatus==='close').length;
    const _waConn  = _waInstancias.filter(i=>i.connectionStatus==='connecting').length;

    // ── SEMÁFOROS ─────────────────────────────────────────
    const _okPG     = _pingPG < 300;
    const _okMem    = _memPct < 80;
    const _okWA     = _waOk && _waOpen > 0;
    const _okDB     = _dbMB < 900;
    const _tudo_ok  = _okPG && _okMem && _okWA && _okDB;

    const _semaforo = (ok) => ok ? '🟢' : '🔴';
    const _badge = (ok, sim, nao) => '<span style="padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;background:' + (ok?'#f0fdf4':'#fef2f2') + ';color:' + (ok?'#16a34a':'#ef4444') + '">' + (ok?sim:nao) + '</span>';
    const _cor = s => s==='open'?'#16a34a':s==='connecting'?'#f59e0b':'#ef4444';
    const _bg  = s => s==='open'?'#f0fdf4':s==='connecting'?'#fefce8':'#fef2f2';

    const _waRows = _waInstancias.map(i =>
      '<tr style="border-bottom:1px solid #f3f4f6">' +
      '<td style="padding:10px 12px;font-size:13px;font-weight:600">' + i.name + '</td>' +
      '<td style="padding:10px 12px"><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:' + _bg(i.connectionStatus) + ';color:' + _cor(i.connectionStatus) + '">' + i.connectionStatus + '</span></td>' +
      '<td style="padding:10px 12px;font-size:12px;color:#888">' + (i.ownerJid?i.ownerJid.replace('@s.whatsapp.net',''):'-') + '</td>' +
      '<td style="padding:10px 12px;font-size:12px;color:#888">' + ((i._count&&i._count.Message)||0).toLocaleString('pt-BR') + ' msgs</td>' +
      '</tr>'
    ).join('');

    const _html =
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Status — MatchImóveis</title>' +
      '<meta http-equiv="refresh" content="30">' +
      '<style>body{font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0;color:#111}' +
      _adminShellCss() +
      '.admin-content{max-width:1100px}' +
      '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px}' +
      '.card{background:#fff;border-radius:14px;padding:18px;box-shadow:0 2px 8px rgba(0,0,0,.06)}' +
      '.card h3{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px}' +
      '.val{font-size:28px;font-weight:800;color:#111}.sub2{font-size:11px;color:#aaa;margin-top:4px}' +
      '.section{background:#fff;border-radius:14px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:16px}' +
      '.section h2{font-size:15px;font-weight:700;margin:0 0 16px;padding-bottom:12px;border-bottom:1px solid #f3f4f6}' +
      'table{width:100%;border-collapse:collapse}' +
      '.row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f3f4f6}' +
      '.row:last-child{border-bottom:none}' +
      '.lbl{font-size:13px;color:#555}.rval{font-size:13px;font-weight:700}' +
      '.alerta{border-radius:14px;padding:16px 20px;margin-bottom:20px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:10px}' +
      '</style></head><body>' +
      '<div class="admin-app">' + _adminSidebarHtml('status') + '<main class="admin-content">' +
      '<h1 style="font-size:22px;font-weight:800;margin-bottom:4px">🖥️ Diagnóstico de Capacidade</h1>' +
      '<p style="color:#888;font-size:13px;margin-bottom:20px">Atualiza a cada 30s · ' + new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) + '</p>' +

      // ALERTA GERAL
      '<div class="alerta" style="background:' + (_tudo_ok?'#f0fdf4':'#fef2f2') + ';color:' + (_tudo_ok?'#15803d':'#b91c1c') + '">' +
      (_tudo_ok ? '🟢 Sistema saudável — pronto para receber novos usuários' : '🔴 Atenção — verifique os itens abaixo antes de liberar novos usuários') +
      '</div>' +

      // RESUMO SEMÁFOROS
      '<div class="section">' +
      '<h2>🚦 Resumo Geral</h2>' +
      '<div class="row"><span class="lbl">Banco de dados (PostgreSQL)</span><span class="rval">' + _semaforo(_okPG) + ' ' + _badge(_okPG, 'Saudável', 'Lento') + ' ' + _pingPG + 'ms</span></div>' +
      '<div class="row"><span class="lbl">Servidor web (Render)</span><span class="rval">' + _semaforo(_okMem) + ' ' + _badge(_okMem, 'OK', 'Memória alta') + ' ' + _memPct + '% RAM</span></div>' +
      '<div class="row"><span class="lbl">Evolution API (WhatsApp)</span><span class="rval">' + _semaforo(_okWA) + ' ' + _badge(_okWA, 'Online', 'Offline') + ' ' + (_waOk?_waPing+'ms':'sem resposta') + '</span></div>' +
      '<div class="row"><span class="lbl">Banco de dados (tamanho)</span><span class="rval">' + _semaforo(_okDB) + ' ' + _badge(_okDB, 'OK', 'Próximo do limite') + ' ' + _dbMB + 'MB</span></div>' +
      '</div>' +

      // SERVIDOR
      '<div class="section">' +
      '<h2>⚙️ Servidor Web (Render)</h2>' +
      '<div class="row"><span class="lbl">Uptime</span><span class="rval">' + _uptimeStr + '</span></div>' +
      '<div class="row"><span class="lbl">Memória RSS (processo)</span><span class="rval" style="color:' + (_memPct>80?'#ef4444':_memPct>60?'#f59e0b':'#16a34a') + '">' + _memRSS + 'MB (' + _memPct + '%)</span></div>' +
      '<div class="row"><span class="lbl">Heap usado / total</span><span class="rval">' + _memUsed + 'MB / ' + _memTotal + 'MB</span></div>' +
      '<div class="row"><span class="lbl">Load average (1min)</span><span class="rval">' + _loadAvg + '</span></div>' +
      '<div class="row"><span class="lbl">RAM livre no servidor</span><span class="rval">' + _freeMem + 'MB de ' + _totalMem + 'MB</span></div>' +
      '<div class="row"><span class="lbl">Cache imóveis (em RAM)</span><span class="rval">' + ((_cacheImoveis||[]).length).toLocaleString('pt-BR') + ' registros</span></div>' +
      '<div class="row"><span class="lbl">Cache leads (em RAM)</span><span class="rval">' + ((_cacheLeads||[]).length).toLocaleString('pt-BR') + ' registros</span></div>' +
      '<div class="row"><span class="lbl">Cache usuários (em RAM)</span><span class="rval">' + ((_cacheUsuarios||[]).length).toLocaleString('pt-BR') + ' registros</span></div>' +
      '<div class="row"><span class="lbl">Cache visitas (em RAM)</span><span class="rval">' + ((_cacheVisitas||[]).length).toLocaleString('pt-BR') + ' registros</span></div>' +
      '</div>' +

      // BANCO
      '<div class="section">' +
      '<h2>🗄️ Banco de Dados (PostgreSQL)</h2>' +
      '<div class="row"><span class="lbl">Ping</span><span class="rval" style="color:' + (_pingPG<200?'#16a34a':_pingPG<500?'#f59e0b':'#ef4444') + '">' + _pingPG + 'ms</span></div>' +
      '<div class="row"><span class="lbl">Tamanho do banco</span><span class="rval">' + _dbSize.rows[0].size + ' (' + _dbMB + 'MB)</span></div>' +
      '<div class="row"><span class="lbl">Conexões ativas</span><span class="rval">' + _conns.rows[0].total + '</span></div>' +
      '<div class="row"><span class="lbl">Usuários</span><span class="rval">' + _totUsu.rows[0].total + '</span></div>' +
      '<div class="row"><span class="lbl">Leads</span><span class="rval">' + parseInt(_totLead.rows[0].total).toLocaleString('pt-BR') + '</span></div>' +
      '<div class="row"><span class="lbl">Imóveis</span><span class="rval">' + parseInt(_totImo.rows[0].total).toLocaleString('pt-BR') + '</span></div>' +
      '<div class="row"><span class="lbl">Visitas</span><span class="rval">' + parseInt(_totVis.rows[0].total).toLocaleString('pt-BR') + '</span></div>' +
      '<div class="row"><span class="lbl">Usuários sem saldo</span><span class="rval" style="color:' + (_semSaldo.rows[0].total>0?'#ef4444':'#16a34a') + '">' + _semSaldo.rows[0].total + '</span></div>' +
      '</div>' +

      // EVOLUTION
      '<div class="section">' +
      '<h2>📱 Evolution API — WhatsApp (' + _waInstancias.length + ' instâncias · <span style="color:#16a34a">' + _waOpen + ' open</span> · <span style="color:#f59e0b">' + _waConn + ' connecting</span> · <span style="color:#ef4444">' + _waClose + ' close</span>)</h2>' +
      '<table>' + _waRows + '</table>' +
      '<div style="margin-top:12px"><a href="https://match-evolution-api.onrender.com/manager" target="_blank" style="color:#25D366;font-weight:700;font-size:13px;text-decoration:none">📱 Abrir painel Evolution →</a></div>' +
      '</div>' +

      '</main></div></body></html>';

    res.send(_html);
  } catch(e) { res.send('Erro: ' + e.message); }
});


app.get('/admin/leads-auditoria', authAdmin, async (req, res) => {
  try {
    var qAud = require('./services/db').query;
    var fUser = (req.query.user_id || '').trim();
    var fAcao = (req.query.acao || '').trim();
    var sql = 'SELECT * FROM leads_auditoria WHERE 1=1';
    var pars = [];
    var ph;
    if (fUser) { pars.push(fUser); ph = pars.length; sql = sql + ' AND user_id='; sql = sql + ph; }
    if (fAcao) { pars.push(fAcao); ph = pars.length; sql = sql + ' AND acao='; sql = sql + ph; }
    sql = sql + ' ORDER BY criado_em DESC LIMIT 500';
    var resultado = await qAud(sql, pars);
    var html = '<html><head><meta charset=UTF-8><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auditoria de Leads</title><style>body{font-family:Arial,sans-serif;margin:0;padding:0}' + _adminShellCss() + '</style></head><body>';
    html = html + '<div class="admin-app">' + _adminSidebarHtml('leads-auditoria') + '<main class="admin-content">';
    html = html + '<h1>Auditoria de Leads</h1>';
    html = html + 'Total: ' + resultado.rows.length;
    html = html + '</main></div></body></html>';
    res.send(html);
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

// ── BUSCAR / EXCLUIR IMÓVEL (de todas as contas) ────────────────────────────

app.get('/admin/buscar-imovel', authAdmin, async (req, res) => {
  try {
    const { query: _qBI } = require('./services/db');
    const nomeT = (req.query.nome || '').trim();
    const celularT = (req.query.celular || '').trim();
    const codigoT = (req.query.codigo || '').trim();
    const enderecoT = (req.query.endereco || '').trim();
    const temFiltro = !!(nomeT || celularT || codigoT || enderecoT);
    let imoveis = [];
    if (temFiltro) {
      const conds = [];
      const pars = [];
      if (nomeT) { pars.push('%' + nomeT + '%'); conds.push(`proprietario->>'nome' ILIKE $${pars.length}`); }
      if (celularT) {
        const celDigits = celularT.replace(/\D/g, '');
        pars.push('%' + celDigits + '%');
        conds.push(`(regexp_replace(COALESCE(proprietario->>'celular',''),'\\D','','g') ILIKE $${pars.length} OR regexp_replace(COALESCE(proprietario->>'telefone',''),'\\D','','g') ILIKE $${pars.length})`);
      }
      if (codigoT) { pars.push(codigoT); conds.push(`(id=$${pars.length} OR id_externo=$${pars.length} OR id_interno=$${pars.length} OR codigo_imovel=$${pars.length})`); }
      if (enderecoT) { pars.push('%' + enderecoT + '%'); conds.push(`endereco ILIKE $${pars.length}`); }
      const sql = `SELECT id,id_externo,id_interno,codigo_imovel,endereco,numero,complemento,bairro,cidade,estado,proprietario,user_id
                   FROM imoveis WHERE ${conds.join(' AND ')} ORDER BY endereco LIMIT 300`;
      const r = await _qBI(sql, pars);
      const userIds = [...new Set(r.rows.map(row => row.user_id).filter(Boolean))];
      let usersMap = {};
      if (userIds.length) {
        const ru = await _qBI('SELECT codigo_usuario, id, nome FROM usuarios WHERE codigo_usuario = ANY($1) OR id = ANY($1)', [userIds]);
        ru.rows.forEach(u => { usersMap[u.codigo_usuario] = u.nome; usersMap[u.id] = u.nome; });
      }
      imoveis = r.rows.map(row => ({ ...row, corretorNome: usersMap[row.user_id] || row.user_id || '-' }));
    }
    const linhas = imoveis.map(im => {
      const p = im.proprietario || {};
      const cod = im.id_externo || im.id_interno || im.codigo_imovel || im.id;
      return `<tr>
        <td><input type="checkbox" name="ids" value="${im.id}"></td>
        <td style="font-family:monospace;font-size:11px">${cod}</td>
        <td>${im.endereco || ''} ${im.numero || ''} ${im.complemento ? '- ' + im.complemento : ''}</td>
        <td>${im.bairro || ''} / ${im.cidade || ''}</td>
        <td>${p.nome || '-'}</td>
        <td>${p.celular || p.telefone || '-'}</td>
        <td>${im.corretorNome} <span style="color:#9ca3af">(${im.user_id || ''})</span></td>
      </tr>`;
    }).join('');
    const msg = req.query.msg ? `<div style="background:#f0fdf4;color:#16a34a;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-weight:600;font-size:13px">${req.query.msg}</div>` : '';
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Buscar/Excluir Imóvel · Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#f8f8f7;color:#111;font-size:13px;}
${_adminShellCss()}
.admin-content{max-width:1200px}
.card{background:#fff;border:1px solid #e5e5e3;border-radius:12px;padding:16px;margin-bottom:16px}
.campo{display:flex;flex-direction:column;gap:4px}
.campo label{font-size:11px;font-weight:600;color:#666}
.campo input{padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:12px;}
th{text-align:left;padding:8px;font-size:10px;font-weight:600;color:#888;text-transform:uppercase;border-bottom:1px solid #f0f0ee;background:#fafafa;white-space:nowrap}
td{padding:8px;border-bottom:1px solid #f0f0ee;vertical-align:middle}
.table-wrap{overflow-x:auto}
</style>
</head>
<body>
<div class="admin-app">
${_adminSidebarHtml('buscar-imovel')}
<main class="admin-content">
  ${msg}
  <div class="card">
    <form method="GET" action="/admin/buscar-imovel">
      <div class="grid">
        <div class="campo"><label>Nome do proprietário</label><input type="text" name="nome" value="${nomeT}" placeholder="Ex: João Silva"></div>
        <div class="campo"><label>Celular</label><input type="text" name="celular" value="${celularT}" placeholder="Ex: 11999999999"></div>
        <div class="campo"><label>Código do imóvel</label><input type="text" name="codigo" value="${codigoT}" placeholder="Ex: CAPRAFA001"></div>
        <div class="campo"><label>Endereço</label><input type="text" name="endereco" value="${enderecoT}" placeholder="Ex: Rua Augusta"></div>
      </div>
      <button type="submit" style="background:#111;color:#fff;padding:9px 20px;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px">🔍 Buscar</button>
      ${temFiltro ? '<a href="/admin/buscar-imovel" style="margin-left:10px;font-size:12px;color:#888">Limpar</a>' : ''}
    </form>
  </div>
  ${temFiltro ? `
  <form method="POST" action="/admin/buscar-imovel/excluir" onsubmit="return _confirmarExclusao(this)">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-weight:700">${imoveis.length} imóvel(is) encontrado(s)</div>
        ${imoveis.length ? `<button type="submit" style="background:#dc2626;color:#fff;padding:8px 16px;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:12px">🗑️ Excluir selecionados (de todas as contas)</button>` : ''}
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th><input type="checkbox" onclick="document.querySelectorAll('input[name=ids]').forEach(c=>c.checked=this.checked)"></th>
          <th>Código</th><th>Endereço</th><th>Bairro/Cidade</th><th>Proprietário</th><th>Celular</th><th>Conta</th>
        </tr></thead>
        <tbody>${linhas || '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:24px">Nenhum imóvel encontrado.</td></tr>'}</tbody>
      </table></div>
    </div>
  </form>
  ` : ''}
</main>
</div>
<script>
function _confirmarExclusao(form){
  const marcados = form.querySelectorAll('input[name=ids]:checked').length;
  if(marcados === 0){ alert('Marque pelo menos um imóvel.'); return false; }
  return confirm('Excluir ' + marcados + ' imóvel(is) de TODAS as contas que tiverem? Essa ação não pode ser desfeita.');
}
</script>
</body>
</html>`);
  } catch(e) {
    res.status(500).send('Erro: ' + e.message);
  }
});

app.post('/admin/buscar-imovel/excluir', authAdmin, async (req, res) => {
  try {
    const { query: _qBIExc } = require('./services/db');
    let ids = req.body.ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids = ids.filter(Boolean);
    let excluidos = 0;
    if (ids.length) {
      const del = await _qBIExc('DELETE FROM imoveis WHERE id = ANY($1)', [ids]);
      excluidos = del.rowCount;
    }
    res.redirect('/admin/buscar-imovel?msg=' + encodeURIComponent(excluidos + ' imóvel(is) excluído(s) com sucesso.'));
  } catch(e) {
    res.status(500).send('Erro: ' + e.message);
  }
});

app.get('/admin', authAdmin, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const usuarios = await _q('SELECT codigo_usuario, nome, telefone, criado_em, senha, whatsapp_status, ultimo_acesso, match_coins, autoriza_quintoandar FROM usuarios ORDER BY criado_em DESC');
    const solQA = await _q('SELECT user_id, atendido FROM solicitacoes_quintoandar').catch(()=>({rows:[]}));
    const solQAMap = {}; solQA.rows.forEach(r => solQAMap[r.user_id] = r.atendido);
    const counts = await _q('SELECT user_id, COUNT(*) as total FROM imoveis GROUP BY user_id');
    const leads = await _q('SELECT user_id, COUNT(*) as total FROM leads GROUP BY user_id');
    const visitas = await _q('SELECT user_id, COUNT(*) as total FROM visitas GROUP BY user_id');
    const countMap = {}; counts.rows.forEach(r => countMap[r.user_id] = r.total);
    const leadsMap = {}; leads.rows.forEach(r => leadsMap[r.user_id] = r.total);
    const visitasMap = {}; visitas.rows.forEach(r => visitasMap[r.user_id] = r.total);
    const rows = usuarios.rows.map(u => `
      <tr>
        <td>${u.codigo_usuario||'-'}</td>
        <td>
          ${u.nome||'-'}
          <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">
            <a href="/admin/usuario/${u.codigo_usuario}" style="font-size:10px;color:#2563eb;text-decoration:none;background:#eff6ff;padding:2px 6px;border-radius:4px">Ver</a>
            <a href="/admin/acessar/${u.codigo_usuario}" style="font-size:10px;color:#7c3aed;text-decoration:none;background:#f5f3ff;padding:2px 6px;border-radius:4px">Acessar</a>
            <a href="/admin/regenerar-xml/${u.codigo_usuario}" style="font-size:10px;color:#16a34a;text-decoration:none;background:#f0fdf4;padding:2px 6px;border-radius:4px">XML</a>
            <form method="POST" action="/admin/deletar/${u.codigo_usuario}" onsubmit="return confirm('Deletar ${u.nome}?')" style="display:inline">
              <button type="submit" style="font:inherit;font-size:10px;color:#e8404a;background:#fef2f2;padding:2px 6px;border-radius:4px;border:none;cursor:pointer">Deletar</button>
            </form>
          </div>
        </td>
        <td>${u.telefone ? `<a href="https://wa.me/55${(u.telefone||'').replace(/\D/g,'')}" target="_blank" style="color:#25D366;font-weight:600;text-decoration:none;">📱 ${u.telefone}</a>` : '-'}</td>
        <td><span title="${u.senha||''}" style="cursor:pointer;letter-spacing:2px;color:#9ca3af;" onclick="this.textContent=this.textContent==='••••••'?'${u.senha||''}':'••••••'">••••••</span></td>
        <td style="text-align:center">${countMap[u.codigo_usuario]||0}</td>
        <td style="text-align:center">${leadsMap[u.codigo_usuario]||0}</td>
        <td style="text-align:center">${visitasMap[u.codigo_usuario]||0}</td>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;background:${u.whatsapp_status==='open'?'#f0fdf4':'#f9fafb'};color:${u.whatsapp_status==='open'?'#16a34a':'#888'}">${u.whatsapp_status==='open'?'open':u.whatsapp_status==='close'?'close':u.whatsapp_status==='connecting'?'conn...':'descon.'}</span></td>
        <td style="text-align:center">${u.autoriza_quintoandar?'<span style="color:#16a34a;font-size:11px;font-weight:600">✅ Ativo</span>':'<span style="color:#9ca3af;font-size:11px">Inativo</span>'}</td>
        <td style="text-align:center">${solQAMap[u.codigo_usuario]!==undefined?(solQAMap[u.codigo_usuario]?'<span style="color:#16a34a;font-size:11px;font-weight:600">✅ Liberado</span>':'<span style="color:#f59e0b;font-size:11px;font-weight:600">⏳ Aguard.</span>'):'-'}</td>
        <td>${u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleDateString('pt-BR') : '-'}</td>
        <td>${new Date(u.criado_em).toLocaleDateString('pt-BR')}</td>
        <td style="text-align:center">
          <span style="font-size:12px;font-weight:700;color:#FF385C;">${(u.match_coins||0).toLocaleString('pt-BR')}</span>
          <span style="font-size:10px;color:#9ca3af;display:block">coins</span>
        </td>
        <td>
          <form method="POST" action="/admin/usuario/${u.codigo_usuario}/creditos" style="display:flex;gap:4px;align-items:center;">
            <input type="number" name="creditos" value="1000" min="1" style="width:70px;padding:3px 6px;font-size:11px;border:1px solid #e5e5e3;border-radius:5px;">
            <input type="hidden" name="operacao" value="adicionar">
            <button type="submit" style="font-size:10px;padding:3px 8px;background:#16a34a;color:#fff;border:none;border-radius:5px;cursor:pointer;">+</button>
          </form>
        </td>
        <td>
          <a href="/admin/usuario/${u.codigo_usuario}" style="font-size:11px;color:#2563eb;text-decoration:none;">Ver</a>
          &nbsp;|&nbsp;
          <a href="/admin/acessar/${u.codigo_usuario}" style="font-size:11px;color:#7c3aed;text-decoration:none;">Acessar</a>
          &nbsp;|&nbsp;
          <a href="/admin/regenerar-xml/${u.codigo_usuario}" style="font-size:11px;color:#16a34a;text-decoration:none;">XML</a>
          &nbsp;|&nbsp;
          <form method="POST" action="/admin/deletar/${u.codigo_usuario}" onsubmit="return confirm('Deletar ${u.nome}?')" style="display:inline">
            <button type="submit" style="font:inherit;font-size:11px;color:#e8404a;background:none;border:none;text-decoration:underline;cursor:pointer;padding:0">Deletar</button>
          </form>
          ${solQAMap[u.codigo_usuario]!==undefined&&!solQAMap[u.codigo_usuario]?'&nbsp;|&nbsp;<a href="/admin/quintoandar-liberar/'+u.codigo_usuario+'" style="font-size:11px;color:#00a86b;font-weight:600;text-decoration:none;">Liberar QA</a>':''}
        </td>
      </tr>`).join('');
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin · MatchImóveis</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#f8f8f7;color:#111;font-size:13px;}
${_adminShellCss()}
.card{background:#fff;border:1px solid #e5e5e3;border-radius:12px;overflow:hidden;}.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}
table{width:100%;border-collapse:collapse;font-size:12px;}
th{text-align:left;padding:7px 8px;font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.3px;border-bottom:1px solid #f0f0ee;border-right:1px solid #e5e5e3;background:#fafafa;white-space:nowrap;}
td{padding:7px 8px;border-bottom:1px solid #f0f0ee;border-right:1px solid #f0f0ee;vertical-align:middle;white-space:nowrap;}
td:last-child,th:last-child{border-right:none;}
tr:last-child td{border-bottom:none;}
tr:hover td{background:#fafafa;}
</style>
</head>
<body>
<div class="admin-app">
${_adminSidebarHtml('dashboard', req.session.adminSuper !== false ? true : (req.session.adminPermissoes || []))}
<main class="admin-content">
  <div class="card" style="margin-bottom:16px;">
    <table>
      <thead><tr><th>Ação</th><th>Rota</th><th>Descrição</th></tr></thead>
      <tbody>
        <tr><td><span style="color:#888;font-size:11px;">Ver usuário</span></td><td style="font-family:monospace;font-size:11px;">/admin/usuario/:codigo</td><td>Ver detalhes, alterar senha e fazer upload de XML</td></tr>
        <tr><td><span style="color:#e8404a;font-size:11px;">⚠ Deletar</span></td><td style="font-family:monospace;font-size:11px;">/admin/deletar/:codigo</td><td>Deleta usuário e todos os dados</td></tr>
      </tbody>
    </table>
  </div>
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Cód.</th><th>Nome</th><th>Telefone</th><th>Senha</th><th>Imóv.</th><th>Leads</th><th>Visit.</th><th>WA</th><th>XML QA</th><th>Cart. QA</th><th>Último ac.</th><th>Cadastro</th><th>Coins</th><th>Créd.</th><th>Ações</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 24px;">
    <div style="font-weight:700;margin-bottom:12px;font-size:13px;">🌐 XML Global & Webhook ImovelWeb</div>
    <div style="margin-bottom:8px;font-size:12px;"><strong>XML Global (URL pública):</strong><span style="background:#f3f4f6;padding:3px 8px;border-radius:4px;font-size:11px;margin-left:8px;">https://www.matchimoveis.ia.br/xml/imovelweb-global</span><a href="/xml/imovelweb-global" target="_blank" style="color:#2563eb;margin-left:8px;font-size:11px;">Abrir →</a></div>
    <div style="font-size:12px;"><strong>Webhook Global:</strong><span style="background:#f3f4f6;padding:3px 8px;border-radius:4px;font-size:11px;margin-left:8px;">POST https://www.matchimoveis.ia.br/webhook/imovelweb-global</span></div>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 24px 16px;">
    <div style="font-weight:700;margin-bottom:12px;font-size:13px;">🏢 XML Global QuintoAndar</div>
    <div style="margin-bottom:8px;font-size:12px;"><strong>Ver XML:</strong><a href="/admin/xml/quintoandar-global" target="_blank" style="color:#2563eb;margin-left:8px;">/admin/xml/quintoandar-global</a></div>
    <div style="margin-bottom:8px;font-size:12px;"><strong>Baixar XML:</strong><a href="/admin/xml/quintoandar-global?download=1" style="background:#1D9E75;color:#fff;padding:4px 12px;border-radius:6px;text-decoration:none;font-size:11px;margin-left:8px;">⬇ Download XML</a></div>
    <div style="font-size:12px;"><strong>URL Pública:</strong><span style="background:#f3f4f6;padding:3px 8px;border-radius:4px;font-size:11px;margin-left:8px;">https://www.matchimoveis.ia.br/xml/quintoandar-global?token=match-qa-global-2025</span></div>
  </div>
</main>
</div>
</body>
</html>`);
  } catch(e) {
    res.send('Erro: ' + e.message);
  }
});

// ── USUÁRIOS ONLINE (tempo real) ─────────────────────────────────────────────
app.get('/admin/online/dados', authAdmin, (req, res) => {
  try {
    const { listarOnline } = require('./services/presencaOnline');
    const online = listarOnline();
    const porFuncionalidade = {};
    online.forEach(u => { porFuncionalidade[u.rotaLabel] = (porFuncionalidade[u.rotaLabel]||0) + 1; });
    const ranking = Object.entries(porFuncionalidade).sort((a,b) => b[1]-a[1]).map(([label, total]) => ({ label, total }));
    res.json({ total: online.length, usuarios: online, ranking });
  } catch(e) {
    res.json({ total: 0, usuarios: [], ranking: [] });
  }
});

app.get('/admin/online', authAdmin, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Usuários Online · MatchImóveis</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#f8f8f7;color:#111;font-size:13px}
${_adminShellCss()}
.wrap{display:grid;grid-template-columns:2fr 1fr;gap:20px;align-items:start}
@media(max-width:820px){.wrap{grid-template-columns:1fr}}
.card{background:#fff;border:1px solid #e5e5e3;border-radius:12px;padding:20px}
.card h2{font-size:14px;font-weight:700;margin-bottom:4px}
.card .sub{font-size:12px;color:#888;margin-bottom:16px}
.total-num{font-size:40px;font-weight:800;color:#16a34a;line-height:1}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:8px;font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.3px;border-bottom:1px solid #f0f0ee}
td{padding:8px;border-bottom:1px solid #f0f0ee;vertical-align:middle}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#16a34a;margin-right:6px;flex-shrink:0}
.pill{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;background:#f0fdf4;color:#16a34a;font-weight:600}
.vazio{padding:30px;text-align:center;color:#9ca3af}
.rank-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0ee}
.rank-row:last-child{border-bottom:none}
.rank-barra{background:#f3f4f6;border-radius:99px;height:6px;overflow:hidden;margin-top:4px}
.rank-fill{height:100%;background:#16a34a;border-radius:99px}
</style>
</head>
<body>
<div class="admin-app">
${_adminSidebarHtml('online')}
<main class="admin-content">
<div class="wrap">
  <div class="card">
    <h2>Quem está no sistema agora</h2>
    <div class="sub">Atualiza sozinho a cada 10s · considerado "online" quem teve atividade nos últimos 3 minutos</div>
    <div id="lista-usuarios"><div class="vazio">Carregando...</div></div>
  </div>
  <div>
    <div class="card" style="margin-bottom:20px;text-align:center">
      <div class="sub" style="margin-bottom:8px">Online agora</div>
      <div class="total-num" id="total-online">–</div>
    </div>
    <div class="card">
      <h2>Mais usado agora</h2>
      <div class="sub">Onde estão os usuários online neste momento</div>
      <div id="ranking-func"><div class="vazio">Carregando...</div></div>
    </div>
  </div>
</div>
<script>
function _tempoAtras(s){
  if(s < 60) return s + 's atrás';
  var m = Math.floor(s/60);
  return m + 'min atrás';
}
async function atualizar(){
  try{
    const r = await fetch('/admin/online/dados');
    const d = await r.json();
    document.getElementById('total-online').textContent = d.total;

    const listaEl = document.getElementById('lista-usuarios');
    if(!d.usuarios.length){
      listaEl.innerHTML = '<div class="vazio">Ninguém online no momento.</div>';
    } else {
      let html = '<table><thead><tr><th></th><th>Corretor</th><th>Tela atual</th><th>Última atividade</th></tr></thead><tbody>';
      d.usuarios.forEach(function(u){
        html += '<tr><td><span class="dot"></span></td><td>'+(u.nome||u.codigoUsuario||'-')+' <span style="color:#9ca3af;font-size:11px">('+u.codigoUsuario+')</span></td><td><span class="pill">'+u.rotaLabel+'</span></td><td>'+_tempoAtras(u.segundosAtras)+'</td></tr>';
      });
      html += '</tbody></table>';
      listaEl.innerHTML = html;
    }

    const rankEl = document.getElementById('ranking-func');
    if(!d.ranking.length){
      rankEl.innerHTML = '<div class="vazio">Sem dados.</div>';
    } else {
      const max = d.ranking[0].total;
      rankEl.innerHTML = d.ranking.map(function(r){
        const pct = Math.round((r.total/max)*100);
        return '<div class="rank-row" style="display:block"><div style="display:flex;justify-content:space-between"><span>'+r.label+'</span><strong>'+r.total+'</strong></div><div class="rank-barra"><div class="rank-fill" style="width:'+pct+'%"></div></div></div>';
      }).join('');
    }
  } catch(e) { console.error(e); }
}
atualizar();
setInterval(atualizar, 10000);
</script>
</main>
</div>
</body>
</html>`);
});
// ── FIM USUÁRIOS ONLINE ───────────────────────────────────────────────────────

// ── XML GLOBAL QUINTOANDAR ──────────────────────────────────────────────────
const QA_GLOBAL_TOKEN = process.env.QA_GLOBAL_TOKEN || 'match-qa-global-2025';
async function gerarXMLQuintoAndarGlobal() {
  const { query: _qQA } = require('./services/db');
  // Busca usuários autorizados
  const _usrs = await _qQA("SELECT codigo_usuario, nome, email, celular, telefone FROM usuarios WHERE autoriza_quintoandar=true");
  if (!_usrs.rows.length) return null;
  const _uids = _usrs.rows.map(u => u.codigo_usuario);
  const _usrMap = {}; _usrs.rows.forEach(u => { _usrMap[u.codigo_usuario] = u; });
  // Estado + Cidade onde QuintoAndar atua (validação conjunta)
  const _normQA = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const _siglaQA = {'ac':'acre','al':'alagoas','ap':'amapa','am':'amazonas','ba':'bahia','ce':'ceara','df':'distrito federal','es':'espirito santo','go':'goias','ma':'maranhao','mt':'mato grosso','ms':'mato grosso do sul','mg':'minas gerais','pa':'para','pb':'paraiba','pr':'parana','pe':'pernambuco','pi':'piaui','rj':'rio de janeiro','rn':'rio grande do norte','rs':'rio grande do sul','ro':'rondonia','rr':'roraima','sc':'santa catarina','sp':'sao paulo','se':'sergipe','to':'tocantins'};
  const _normEstadoQA = s => { const n=_normQA(s); return _siglaQA[n]||n; };
  const _cidadesQA = [
    // SC
    {e:'santa catarina', c:'florianopolis'},{e:'santa catarina', c:'joinville'},
    {e:'santa catarina', c:'blumenau'},{e:'santa catarina', c:'balneario camboriu'},
    {e:'santa catarina', c:'itajai'},{e:'santa catarina', c:'sao jose'},
    {e:'santa catarina', c:'palhoca'},{e:'santa catarina', c:'biguacu'},
    {e:'santa catarina', c:'criciuma'},{e:'santa catarina', c:'chapeco'},
    // SP
    {e:'sao paulo', c:'sao paulo'},{e:'sao paulo', c:'guarulhos'},
    {e:'sao paulo', c:'osasco'},{e:'sao paulo', c:'santo andre'},
    {e:'sao paulo', c:'campinas'},{e:'sao paulo', c:'sao bernardo do campo'},
    {e:'sao paulo', c:'sao caetano do sul'},{e:'sao paulo', c:'diadema'},
    {e:'sao paulo', c:'maua'},{e:'sao paulo', c:'ribeirao preto'},
    {e:'sao paulo', c:'sorocaba'},{e:'sao paulo', c:'sao jose dos campos'},
    {e:'sao paulo', c:'taubate'},{e:'sao paulo', c:'americana'},
    {e:'sao paulo', c:'sumare'},{e:'sao paulo', c:'taboao da serra'},
    {e:'sao paulo', c:'varzea paulista'},{e:'sao paulo', c:'embu das artes'},
    // RJ
    {e:'rio de janeiro', c:'rio de janeiro'},{e:'rio de janeiro', c:'niteroi'},
    {e:'rio de janeiro', c:'duque de caxias'},{e:'rio de janeiro', c:'nova iguacu'},
    {e:'rio de janeiro', c:'sao goncalo'},{e:'rio de janeiro', c:'petropolis'},
    {e:'rio de janeiro', c:'cabo frio'},{e:'rio de janeiro', c:'macae'},
    {e:'rio de janeiro', c:'marica'},{e:'rio de janeiro', c:'mesquita'},
    {e:'rio de janeiro', c:'nilopolis'},{e:'rio de janeiro', c:'belford roxo'},
    {e:'rio de janeiro', c:'rio das ostras'},
    // MG
    {e:'minas gerais', c:'belo horizonte'},{e:'minas gerais', c:'contagem'},
    {e:'minas gerais', c:'nova lima'},{e:'minas gerais', c:'betim'},
    {e:'minas gerais', c:'uberlandia'},{e:'minas gerais', c:'juiz de fora'},
    {e:'minas gerais', c:'ribeirao das neves'},{e:'minas gerais', c:'sabara'},
    {e:'minas gerais', c:'vespasiano'},{e:'minas gerais', c:'lagoa santa'},
    {e:'minas gerais', c:'brumadinho'},{e:'minas gerais', c:'itatiro'},
    // RS
    {e:'rio grande do sul', c:'porto alegre'},{e:'rio grande do sul', c:'canoas'},
    {e:'rio grande do sul', c:'sao leopoldo'},{e:'rio grande do sul', c:'novo hamburgo'},
    {e:'rio grande do sul', c:'caxias do sul'},{e:'rio grande do sul', c:'pelotas'},
    {e:'rio grande do sul', c:'santa maria'},{e:'rio grande do sul', c:'gravatai'},
    {e:'rio grande do sul', c:'viamao'},
    // PR
    {e:'parana', c:'curitiba'},{e:'parana', c:'sao jose dos pinhais'},
    {e:'parana', c:'londrina'},{e:'parana', c:'maringa'},
    {e:'parana', c:'foz do iguacu'},{e:'parana', c:'cascavel'},
    // GO
    {e:'goias', c:'goiania'},{e:'goias', c:'aparecida de goiania'},
    {e:'goias', c:'anapolis'},
    // DF
    {e:'distrito federal', c:'brasilia'},
    // BA
    {e:'bahia', c:'salvador'},{e:'bahia', c:'lauro de freitas'},
    {e:'bahia', c:'camacari'},{e:'bahia', c:'feira de santana'},
    // PE
    {e:'pernambuco', c:'recife'},{e:'pernambuco', c:'olinda'},
    {e:'pernambuco', c:'caruaru'},{e:'pernambuco', c:'jaboatao dos guararapes'},
    // CE
    {e:'ceara', c:'fortaleza'},{e:'ceara', c:'caucaia'},{e:'ceara', c:'maracanau'},
    // ES
    {e:'espirito santo', c:'vitoria'},{e:'espirito santo', c:'vila velha'},
    {e:'espirito santo', c:'cariacica'},{e:'espirito santo', c:'serra'},
    // PA
    {e:'para', c:'belem'},{e:'para', c:'ananindeua'},
    // AM
    {e:'amazonas', c:'manaus'}
  ];
  const _isQA = (estado, cidade) => _cidadesQA.some(x => x.e===_normEstadoQA(estado) && x.c===_normQA(cidade));

  // Busca imóveis com proprietário (nome + celular) dos usuários autorizados — apenas venda
  const _placeholders = _uids.map((_,i) => '$'+(i+1)).join(',');
  const _res = await _qQA(
    "SELECT * FROM imoveis WHERE status='ativo' AND transacao='venda' AND user_id IN ("+_placeholders+") AND cep IS NOT NULL AND cep != '' AND endereco IS NOT NULL AND endereco != '' AND numero IS NOT NULL AND numero != '' AND ((proprietario->>'nome' IS NOT NULL AND proprietario->>'nome' != '' AND (proprietario->>'celular' IS NOT NULL AND proprietario->>'celular' != '' OR proprietario->>'telefone' IS NOT NULL AND proprietario->>'telefone' != '')) OR (dados->>'proprietarioNome' IS NOT NULL AND dados->>'proprietarioNome' != '' AND dados->>'proprietarioTelefone' IS NOT NULL AND dados->>'proprietarioTelefone' != ''))",
    _uids
  );
  // Filtra por cidades onde QuintoAndar atua
  const _imoveisBrutos = _res.rows;
  const _res2 = { rows: _imoveisBrutos.filter(row => _isQA(row.estado||row.dados?.estado||'', row.cidade||row.dados?.cidade||'')) };
  const _res_final = _res2;
  const imoveis = _res_final.rows;
  const esc = v => String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ListingDataFeed>\n  <Header>\n    <Provider>Matchimoveis</Provider>\n    <Email>contato@matchimoveis.ia.br</Email>\n    <BatchId>matchimoveis-qa-'+Date.now()+'</BatchId>\n    <BatchName>MatchImoveis QuintoAndar '+new Date().toISOString()+'</BatchName>\n  </Header>\n  <Listings>\n';
  imoveis.forEach(row => {
    const i = { ...row, ...(row.dados||{}) };
    const prop = i.proprietario || {};
    const propNome = prop.nome || i.proprietarioNome || i.dados?.proprietarioNome || '';
    const propTel = prop.telefone || prop.celular || i.proprietarioTelefone || i.dados?.proprietarioTelefone || '';
    const propEmail = prop.email || i.proprietarioEmail || i.dados?.proprietarioEmail || '';
    const user = _usrMap[row.user_id] || {};
    const fotos = Array.isArray(i.fotos) ? i.fotos : [];
    xml += '\n    <Listing>\n';
    xml += '      <ListingID>'+esc(row.id_interno||row.id_externo||row.id)+'</ListingID>\n';
    xml += '      <Title>'+esc(i.titulo||((i.tipo||'Imóvel')+' em '+(i.bairro||'')))+'</Title>\n';
    xml += '      <TransactionType>'+(i.transacao==='aluguel'?'For Rent':'For Sale')+'</TransactionType>\n';
    xml += '      <PublicationType>STANDARD</PublicationType>\n';
    xml += '      <Details>\n';
    const _usageType = i.condicao==='lancamento'?'Launch':i.condicao==='novo'?'New':'Residential';
    xml += '        <UsageType>'+_usageType+'</UsageType>\n';
    xml += '        <PropertyType>'+esc(i.tipo||'Apartamento')+'</PropertyType>\n';
    xml += '        <Description>'+esc(i.descricao||'')+'</Description>\n';
    xml += '        <ListPrice currency="BRL">'+(i.valor_imovel||i.valor||0)+'</ListPrice>\n';
    xml += '        <LivingArea unit="square metres">'+(i.area_m2||i.area||0)+'</LivingArea>\n';
    xml += '        <LotArea unit="square metres">'+(i.area_total||i.area_m2||0)+'</LotArea>\n';
    xml += '        <PropertyAdministrationFee currency="BRL">'+(i.condominio||0)+'</PropertyAdministrationFee>\n';
    xml += '        <YearlyTax currency="BRL">'+(i.iptu||0)+'</YearlyTax>\n';
    xml += '        <Bedrooms>'+(i.quartos||0)+'</Bedrooms>\n';
    xml += '        <Bathrooms>'+(i.banheiros||0)+'</Bathrooms>\n';
    xml += '        <Suites>'+(i.suites||0)+'</Suites>\n';
    xml += '        <Garage>'+(i.vagas||0)+'</Garage>\n';
    xml += '        <UnitFloor>'+esc(i.andar||'')+'</UnitFloor>\n';
    if(i.diferenciais&&i.diferenciais.length){ xml += '        <Features>\n'; i.diferenciais.forEach(d=>{xml+='          <Feature>'+esc(d)+'</Feature>\n';}); xml += '        </Features>\n'; }
    xml += '      </Details>\n';
    xml += '      <Media>\n';
    fotos.forEach((f,idx)=>{ let url=typeof f==='string'?f:f.url; if(url&&url.startsWith('/')) url='https://www.matchimoveis.ia.br'+url; xml+='        <Item medium="image" caption="foto'+(idx+1)+'" primary="'+(idx===0?'true':'false')+'">'+esc(url)+'</Item>\n'; });
    xml += '      </Media>\n';
    xml += '      <Location>\n';
    xml += '        <Country abbreviation="BR">Brasil</Country>\n';
    xml += '        <State>'+esc(i.estado||'')+'</State>\n';
    xml += '        <City>'+esc(i.cidade||'')+'</City>\n';
    xml += '        <Neighborhood>'+esc(i.bairro||'')+'</Neighborhood>\n';
    xml += '        <Address>'+esc(i.endereco||i.logradouro||'')+'</Address>\n';
    xml += '        <StreetNumber>'+esc(i.numero||'')+'</StreetNumber>\n';
    xml += '        <Complement>'+esc(i.complemento||i.dados?.complemento||'')+'</Complement>\n';
    xml += '        <PostalCode>'+esc(String(i.cep||'').replace(/\D/g,''))+'</PostalCode>\n';
    xml += '        <Latitude>'+esc(i.latitude||'')+'</Latitude>\n';
    xml += '        <Longitude>'+esc(i.longitude||'')+'</Longitude>\n';
    xml += '      </Location>\n';
    xml += '      <ContactInfo>\n';
    xml += '        <Name>'+esc(user.nome||'')+'</Name>\n';
    xml += '        <Email>'+esc(user.email||'')+'</Email>\n';
    xml += '        <Telephone>'+esc(user.celular||user.telefone||'')+'</Telephone>\n';
    xml += '        <Website>https://www.matchimoveis.ia.br</Website>\n';
    xml += '      </ContactInfo>\n';
    xml += '      <Broker>\n';
    xml += '        <BrokerName>'+esc(user.nome||'')+'</BrokerName>\n';
    xml += '        <BrokerEmail>'+esc(user.email||'')+'</BrokerEmail>\n';
    xml += '        <BrokerTelephone>'+esc(user.celular||user.telefone||'')+'</BrokerTelephone>\n';
    xml += '      </Broker>\n';
    xml += '      <OwnerInfo>\n';
    xml += '        <Name>'+esc(propNome)+'</Name>\n';
    xml += '        <Email>'+esc(propEmail)+'</Email>\n';
    xml += '        <Telephone>'+esc(propTel)+'</Telephone>\n';
    xml += '      </OwnerInfo>\n';
    xml += '    </Listing>\n';
  });
  xml += '  </Listings>\n</ListingDataFeed>';
  return { xml, total: imoveis.length };
}

// Rota admin (autenticada)
// Página explicativa parceria QuintoAndar
app.get('/app/parceria-quintoandar', auth, async (req, res) => {
  try {
    const { query: _qQAP } = require('./services/db');
    const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
    const _normP = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    const _siglaParaNome = {'ac':'acre','al':'alagoas','ap':'amapa','am':'amazonas','ba':'bahia','ce':'ceara','df':'distrito federal','es':'espirito santo','go':'goias','ma':'maranhao','mt':'mato grosso','ms':'mato grosso do sul','mg':'minas gerais','pa':'para','pb':'paraiba','pr':'parana','pe':'pernambuco','pi':'piaui','rj':'rio de janeiro','rn':'rio grande do norte','rs':'rio grande do sul','ro':'rondonia','rr':'roraima','sc':'santa catarina','sp':'sao paulo','se':'sergipe','to':'tocantins'};
    const _normEstadoP = s => { const n=_normP(s); return _siglaParaNome[n]||n; };
    const _cidadesQAp = [
      {e:'santa catarina',c:'florianopolis'},{e:'santa catarina',c:'joinville'},{e:'santa catarina',c:'blumenau'},
      {e:'santa catarina',c:'balneario camboriu'},{e:'santa catarina',c:'itajai'},{e:'santa catarina',c:'sao jose'},
      {e:'santa catarina',c:'palhoca'},{e:'santa catarina',c:'biguacu'},{e:'santa catarina',c:'criciuma'},{e:'santa catarina',c:'chapeco'},
      {e:'sao paulo',c:'sao paulo'},{e:'sao paulo',c:'guarulhos'},{e:'sao paulo',c:'osasco'},{e:'sao paulo',c:'santo andre'},
      {e:'sao paulo',c:'campinas'},{e:'sao paulo',c:'sao bernardo do campo'},{e:'sao paulo',c:'sao caetano do sul'},
      {e:'sao paulo',c:'diadema'},{e:'sao paulo',c:'maua'},{e:'sao paulo',c:'ribeirao preto'},{e:'sao paulo',c:'sorocaba'},
      {e:'sao paulo',c:'sao jose dos campos'},{e:'sao paulo',c:'taubate'},{e:'sao paulo',c:'americana'},{e:'sao paulo',c:'sumare'},
      {e:'rio de janeiro',c:'rio de janeiro'},{e:'rio de janeiro',c:'niteroi'},{e:'rio de janeiro',c:'duque de caxias'},
      {e:'rio de janeiro',c:'nova iguacu'},{e:'rio de janeiro',c:'sao goncalo'},{e:'rio de janeiro',c:'petropolis'},
      {e:'minas gerais',c:'belo horizonte'},{e:'minas gerais',c:'contagem'},{e:'minas gerais',c:'nova lima'},
      {e:'minas gerais',c:'betim'},{e:'minas gerais',c:'uberlandia'},{e:'minas gerais',c:'juiz de fora'},
      {e:'rio grande do sul',c:'porto alegre'},{e:'rio grande do sul',c:'canoas'},{e:'rio grande do sul',c:'novo hamburgo'},
      {e:'parana',c:'curitiba'},{e:'parana',c:'londrina'},{e:'parana',c:'maringa'},
      {e:'goias',c:'goiania'},{e:'distrito federal',c:'brasilia'},
      {e:'bahia',c:'salvador'},{e:'pernambuco',c:'recife'},{e:'ceara',c:'fortaleza'},
      {e:'espirito santo',c:'vitoria'},{e:'espirito santo',c:'vila velha'},
      {e:'para',c:'belem'},{e:'amazonas',c:'manaus'}
    ];
    const _isQAp = (e,c) => _cidadesQAp.some(x => x.e===_normEstadoP(e) && x.c===_normP(c));
    const _imoveisUser = await _qQAP("SELECT estado, cidade, cep, endereco, numero, proprietario FROM imoveis WHERE (user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1) AND status='ativo' AND transacao='venda'", [uid]);
    const _emCidadeQA = _imoveisUser.rows.filter(r => _isQAp(r.estado||'', r.cidade||''));
    const _totalQA = _emCidadeQA.filter(r => {
      const prop = r.proprietario || {};
      const temProp = (prop.nome||'') !== '' && ((prop.celular||prop.telefone||'') !== '');
      const temEnd = (r.cep||'') !== '' && (r.endereco||'') !== '' && (r.numero||'') !== '';
      return temProp && temEnd;
    }).length;
    const _totalIncompletos = _emCidadeQA.filter(r => {
      const prop = r.proprietario || {};
      const temProp = (prop.nome||'') !== '' && ((prop.celular||prop.telefone||'') !== '');
      const temEnd = (r.cep||'') !== '' && (r.endereco||'') !== '' && (r.numero||'') !== '';
      return !(temProp && temEnd);
    }).length;
    const _totalVenda = _imoveisUser.rows.length;
    // Atualiza sessão com valor atual do banco
    const _qaUserRow = await _qQAP('SELECT autoriza_quintoandar FROM usuarios WHERE codigo_usuario=$1', [uid]);
    if (_qaUserRow.rows.length) {
      req.session.user.autoriza_quintoandar = _qaUserRow.rows[0].autoriza_quintoandar;
      req.session.user.autorizaQuintoandar = _qaUserRow.rows[0].autoriza_quintoandar;
    }
    // Status da solicitação de acesso à carteira QA
    const _solQA = await _qQAP('SELECT atendido FROM solicitacoes_quintoandar WHERE user_id=$1', [uid]).catch(()=>({rows:[]}));
    const _solicitouQA = _solQA.rows.length > 0;
    const _qaLiberado = _solQA.rows[0]?.atendido || false;
    res.render('parceria-quintoandar', { user: req.session.user, qaCount: _totalQA, vendaCount: _totalVenda, qaIncompletos: _totalIncompletos, solicitouQA: _solicitouQA, qaLiberado: _qaLiberado });
  } catch(e) {
    console.error('[parceria-qa]', e.message);
    res.render('parceria-quintoandar', { user: req.session.user, qaCount: 0, vendaCount: 0, qaIncompletos: 0, solicitouQA: false, qaLiberado: false });
  }
});

// Solicitação de acesso aos imóveis do QuintoAndar
app.post('/app/quintoandar/solicitar-acesso', auth, async (req, res) => {
  try {
    const user = req.session.user;
    const { query: _qQA } = require('./services/db');
    const jaExiste = await _qQA("SELECT id FROM solicitacoes_quintoandar WHERE user_id=$1", [user.codigoUsuario||user.id]);
    if (jaExiste.rows.length) return res.json({ ok: true, jaEnviado: true });
    await _qQA("INSERT INTO solicitacoes_quintoandar (user_id, nome, telefone, email, criado_em) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT DO NOTHING",
      [user.codigoUsuario||user.id, user.nome||'', user.celular||user.telefone||'', user.email||'']);
    // Notifica admin via WhatsApp
    const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
    const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
    const msg = `🏢 *Nova solicitação QuintoAndar*\n\n👤 *Nome:* ${user.nome||''}\n📱 *Telefone:* ${user.celular||user.telefone||''}\n📧 *Email:* ${user.email||''}\n🔑 *Código:* ${user.codigoUsuario||user.id}\n⏰ ${new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`;
    fetch(`${EU}/message/sendText/match-suporte`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': EK },
      body: JSON.stringify({ number: '5511951131609', text: msg })
    }).catch(()=>{});
    res.json({ ok: true });
  } catch(e) {
    console.error('[quintoandar-solicitacao]', e.message);
    res.json({ ok: false, erro: 'Erro ao registrar solicitação.' });
  }
});

// Admin: ver solicitações QuintoAndar
app.get('/admin/quintoandar-liberar/:codigo', authAdmin, async (req, res) => {
  try {
    const { query: _qQL } = require('./services/db');
    // Libera só o acesso à carteira do QuintoAndar (busca de matches) — autoriza_quintoandar
    // (envio dos próprios imóveis) é uma autorização separada, dada pelo corretor no perfil dele
    await _qQL("UPDATE solicitacoes_quintoandar SET atendido=TRUE WHERE user_id=$1", [req.params.codigo]);
    res.redirect('/admin?qa_liberado=1');
  } catch(e) { res.redirect('/admin?err='+encodeURIComponent(e.message)); }
});

app.get('/admin/quintoandar-solicitacoes', authAdmin, async (req, res) => {
  try {
    const { query: _qQAS } = require('./services/db');
    await _qQAS(`CREATE TABLE IF NOT EXISTS solicitacoes_quintoandar (
      id SERIAL PRIMARY KEY, user_id TEXT, nome TEXT, telefone TEXT, email TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW(), atendido BOOLEAN DEFAULT FALSE)`);
    // Combina solicitações de acesso à carteira (tabela solicitacoes_quintoandar) com
    // quem autorizou o envio dos próprios imóveis (usuarios.autoriza_quintoandar) —
    // um corretor pode ter feito só uma das duas coisas, nunca ambas, ou as duas
    const r = await _qQAS(`
      SELECT COALESCE(s.user_id, u.codigo_usuario) AS user_id,
             COALESCE(s.nome, u.nome) AS nome,
             COALESCE(s.telefone, u.telefone, u.celular) AS telefone,
             COALESCE(s.email, u.email) AS email,
             s.criado_em, s.atendido,
             COALESCE(u.autoriza_quintoandar, FALSE) AS autoriza_quintoandar
      FROM solicitacoes_quintoandar s
      FULL OUTER JOIN usuarios u ON u.codigo_usuario = s.user_id
      WHERE s.id IS NOT NULL OR u.autoriza_quintoandar = TRUE
      ORDER BY s.criado_em DESC NULLS LAST
    `);
    let html = `<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Solicitações QuintoAndar</title>
    <style>body{font-family:Arial;margin:0;padding:0}${_adminShellCss()}.admin-content{max-width:1000px}table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd;font-size:13px}th{background:#f3f4f6}tr:hover{background:#fafafa}</style></head>
    <body><div class="admin-app">${_adminSidebarHtml('quintoandar')}<main class="admin-content">
    <h2 style="margin-bottom:16px">Solicitações de acesso QuintoAndar (${r.rows.length})</h2>
    <table><tr><th>Data</th><th>Nome</th><th>Telefone</th><th>Email</th><th>Código</th><th>Acesso à carteira</th><th>Autorizou envio</th><th>Ação</th></tr>`;
    r.rows.forEach(row => {
      html += `<tr><td>${row.criado_em ? new Date(row.criado_em).toLocaleString('pt-BR') : '-'}</td><td>${row.nome||''}</td><td>${row.telefone||''}</td><td>${row.email||''}</td><td>${row.user_id||''}</td><td>${row.criado_em === null ? '<span style="color:#9ca3af;font-size:12px">Não solicitou</span>' : (row.atendido?'<span style="color:#16a34a;font-weight:600">✅ Liberado</span>':'<span style="color:#f59e0b;font-weight:600">⏳ Aguardando</span>')}</td><td>${row.autoriza_quintoandar?'<span style="color:#16a34a;font-weight:600">✅ Autorizou</span>':'<span style="color:#9ca3af;font-size:12px">Não autorizou</span>'}</td><td>${(row.criado_em!==null && !row.atendido)?'<a href="/admin/quintoandar-liberar/'+row.user_id+'" style="background:#00a86b;color:#fff;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">Liberar</a>':'<span style="color:#9ca3af;font-size:12px">-</span>'}</td></tr>`;
    });
    html += '</table></main></div></body></html>';
    res.send(html);
  } catch(e) { res.send('Erro: ' + e.message); }
});

app.get('/admin/exclusao-solicitacoes', authAdmin, async (req, res) => {
  try {
    const { query: _qExcA } = require('./services/db');
    await _qExcA(`CREATE TABLE IF NOT EXISTS solicitacoes_exclusao_conta (
      id SERIAL PRIMARY KEY, user_id TEXT, nome TEXT, email TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW(), atendido BOOLEAN DEFAULT FALSE)`);
    const r = await _qExcA('SELECT * FROM solicitacoes_exclusao_conta ORDER BY atendido ASC, criado_em DESC');
    let html = `<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Solicitações de exclusão de conta</title>
    <style>body{font-family:Arial;margin:0;padding:0}${_adminShellCss()}.admin-content{max-width:1000px}table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd;font-size:13px}th{background:#f3f4f6}tr:hover{background:#fafafa}</style></head>
    <body><div class="admin-app">${_adminSidebarHtml('exclusao')}<main class="admin-content">
    <h2 style="margin-bottom:16px">Solicitações de exclusão de conta (${r.rows.length})</h2>
    <table><tr><th>Data</th><th>Nome</th><th>Email</th><th>Código</th><th>Status</th><th>Ação</th></tr>`;
    r.rows.forEach(row => {
      html += `<tr><td>${new Date(row.criado_em).toLocaleString('pt-BR')}</td><td>${row.nome||''}</td><td>${row.email||''}</td><td>${row.user_id||''}</td><td>${row.atendido?'<span style="color:#16a34a;font-weight:600">✅ Excluída</span>':'<span style="color:#f59e0b;font-weight:600">⏳ Aguardando</span>'}</td><td>${row.atendido?'<span style="color:#9ca3af;font-size:12px">-</span>':'<form method="POST" action="/admin/deletar/'+row.user_id+'" onsubmit="return confirm(\'Excluir de vez a conta e todos os dados de '+(row.nome||row.user_id)+'? Não pode ser desfeito.\')" style="display:inline"><button type="submit" style="background:#dc2626;color:#fff;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;border:none;cursor:pointer">Excluir conta</button></form>'}</td></tr>`;
    });
    html += '</table></main></div></body></html>';
    res.send(html);
  } catch(e) { res.send('Erro: ' + e.message); }
});

app.get('/admin/xml/quintoandar-global', authAdmin, async (req, res) => {
  try {
    const result = await gerarXMLQuintoAndarGlobal();
    if (!result) return res.send('<p>Nenhum usuário autorizado ou imóvel com proprietário cadastrado.</p>');
    if (req.query.download === '1') {
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', 'attachment; filename="quintoandar-global-'+Date.now()+'.xml"');
      return res.send(result.xml);
    }
    res.setHeader('Content-Type', 'application/xml');
    return res.send(result.xml);
  } catch(e) { res.status(500).send('Erro: '+e.message); }
});

// URL pública com token
app.get('/xml/quintoandar-global', async (req, res) => {
  if (req.query.token !== QA_GLOBAL_TOKEN) return res.status(401).send('Unauthorized');
  try {
    const result = await gerarXMLQuintoAndarGlobal();
    if (!result) return res.send('<?xml version="1.0"?><ListingDataFeed><Listings></Listings></ListingDataFeed>');
    res.setHeader('Content-Type', 'application/xml');
    return res.send(result.xml);
  } catch(e) { res.status(500).send('Erro: '+e.message); }
});

// ── XML GLOBAL ADMIN ────────────────────────────────────────────────────────
app.get('/admin/xml/imovelweb-global', async (req, res) => {
  try {
    const { lerImoveis: _lerXG } = require('./services/salvarImovel');
    const { lerUsuarios: _lerUXG } = require('./services/salvarUsuario');
    const todos = await _lerXG();
    const usuarios = await _lerUXG();
    // Só publica o que o corretor marcou como "Publicado" (status='ativo'). Antes o filtro
    // era negativo (excluía só inativo/excluído), então rascunhos de captação com
    // status='nao_publicado' — ainda não revisados pelo corretor — vazavam pro feed público.
    const ativos = todos.filter(im => im.status === 'ativo' && im.fotos && im.fotos.length > 0);
    const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const linhas = [];
    linhas.push('<?xml version="1.0" encoding="UTF-8"?>');
    linhas.push('<ListingDataFeed xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">');
    linhas.push('<Header><Provider>MatchImoveis</Provider><Email>contato@matchimoveis.ia.br</Email></Header>');
    linhas.push('<Listings>');
    for (const im of ativos) {
      const uid = im.user_id || im.userId || im.codigoUsuario || '';
      const u = usuarios.find(u => u.id === uid || u.codigo_usuario === uid);
      const _id = im.id_interno || im.id_externo || im.id || '';
      const _fotos = (im.fotos||[]).slice(0,20);
      linhas.push('<Listing>');
      linhas.push('<ListingID>'+esc(_id)+'</ListingID>');
      linhas.push('<Title><![CDATA['+esc(im.titulo||im.tipo||'Imovel')+']]></Title>');
      linhas.push('<Description><![CDATA['+esc(im.descricao||'')+']]></Description>');
      linhas.push('<ContactInfo><Name>'+esc(u?.nome||'MatchImoveis')+'</Name><Email>'+esc(u?.email||'contato@matchimoveis.ia.br')+'</Email><Telephone>'+esc((u?.celular||u?.telefone||'').replace(/\D/g,''))+'</Telephone><Website>https://www.matchimoveis.ia.br</Website></ContactInfo>');
      const _transacaoIWG = im.transacao === 'aluguel' ? 'For Rent' : 'For Sale';
      linhas.push('<TransactionType>'+_transacaoIWG+'</TransactionType>');
      linhas.push('<Details><PropertyType>'+esc(im.tipo||'Apartamento')+'</PropertyType><ListPrice currency="BRL">'+(im.valor_imovel||0)+'</ListPrice><Bedrooms>'+esc(im.quartos||0)+'</Bedrooms><Suites>'+esc(im.suites||0)+'</Suites><Bathrooms>'+esc(im.banheiros||0)+'</Bathrooms><Garage>'+esc(im.vagas||0)+'</Garage><LivingArea>'+esc(im.area_m2||0)+'</LivingArea><Phase>'+esc(im.fase||'')+'</Phase></Details>');
      linhas.push('<Location><Country>Brasil</Country><State>'+esc(im.estado||'')+'</State><City>'+esc(im.cidade||'')+'</City><Neighborhood>'+esc(im.bairro||'')+'</Neighborhood><Address>'+esc(im.endereco||'')+'</Address>'+(im.latitude&&im.longitude?'<Latitude>'+im.latitude+'</Latitude><Longitude>'+im.longitude+'</Longitude>':'')+'</Location>');
      linhas.push('<Media>');
      _fotos.forEach(f => linhas.push('<Item medium="image"><![CDATA['+f+']]></Item>'));
      if(im.tourVirtual) linhas.push('<Item medium="video"><![CDATA['+im.tourVirtual+']]></Item>');
      linhas.push('</Media>');
      linhas.push('</Listing>');
    }
    linhas.push('</Listings></ListingDataFeed>');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(linhas.join('\n'));
  } catch(e) { res.status(500).send('Erro: '+e.message); }
});

// ── XML IMOVELWEB PÚBLICO ────────────────────────────────────────────────────
app.get('/xml/imovelweb-global', (req, res) => { req.url = '/admin/xml/imovelweb-global'; app.handle(req, res); });

// ── WEBHOOK IMOVELWEB GLOBAL ──────────────────────────────────────────────────
app.post('/webhook/imovelweb-global', express.json(), async (req, res) => {
  res.status(200).json({ ok: true });
  try {
    const body = req.body || {};
    const { query: _qWG } = require('./services/db');
    const reference = body.reference || body.listingId || body.listing_id || '';
    if (!reference) return;
    const _imRow = await _qWG('SELECT * FROM imoveis WHERE id_externo=$1 OR id_interno=$1 OR id=$1 LIMIT 1', [String(reference)]);
    const im = _imRow.rows[0];
    if (!im) { console.log('[webhook-global] imovel nao encontrado:', reference); return; }
    const userId = im.user_id || im.codigo_usuario || '';
    if (!userId) return;
    const phones = (body.phone || body.clientPhone || '').split('/');
    const telefone = phones[phones.length - 1].replace(/\D/g,'');
    const nome = body.name || body.clientName || '';
    const email = body.email || body.clientEmail || '';
    const mensagem = body.message || body.clientMessage || '';
    if (!telefone && !email) return;
    if (telefone && (_cacheUsuarios || []).some(u => (u.bloqueados || u.dados?.bloqueados || []).some(b => String(b).replace(/\D/g,'').slice(-8) === telefone.slice(-8)))) {
      console.log('[webhook-global] numero bloqueado:', telefone); return;
    }
    const lead = {
      id: Date.now().toString(),
      nome, email, telefone, whatsapp: telefone, contato: telefone,
      mensagem,
      idAnuncio: reference,
      fonte: 'ImovelWeb', origem: 'ImovelWeb', origemEntrada: 'webhook_imovelweb_global',
      userId, codigoUsuario: userId, user_id: userId,
      status: 'novo', score: 0, temperatura: 'frio', faseFunil: 'novo',
      mensagens: [], matches: [], timeline: [], eventos: [], followUps: [],
      criadoEm: new Date().toISOString(),
    };
    const { salvarLead: _slIWG } = require('./services/salvarLead');
    await _cruzarImovelWebhook(lead, userId);
    await _slIWG(lead);
    console.log('[webhook-global] lead salva | userId:', userId, '| tel:', telefone, '| nome:', nome);
    _notificarNovaLead(userId, lead.id, nome, 'ImovelWeb');
    const _snapIWG = { id: lead.id, userId, nome: lead.nome||'', telefone: lead.telefone||'', whatsapp: lead.whatsapp||'', contato: lead.contato||'', email: lead.email||'', mensagem: lead.mensagem||'', idAnuncio: lead.idAnuncio||'', perfilIA: lead.perfilIA||{}, origemEntrada: 'webhook_imovelweb_global', origem: 'ImovelWeb' };
    setTimeout(async () => {
      try {
        const { processarLeadPortal } = require('./cerebro/portal-processor');
        const { atualizarLead: _auIWG } = require('./services/salvarLead');
        const mapa = await processarLeadPortal(_snapIWG);
        if (mapa) {
          const _perfilIA = {
            tipo: im?.tipo || mapa.tipo_imovel?.[0]?.valor || '',
            intencao: (im?.transacao==='venda'?'comprar':im?.transacao==='aluguel'?'alugar':im?.transacao) || (mapa.transacao?.[0]?.valor==='venda'?'comprar':mapa.transacao?.[0]?.valor==='aluguel'?'alugar':mapa.transacao?.[0]?.valor) || '',
            bairro: im?.bairro || mapa.bairro?.[0]?.valor || '',
            cidade: im?.cidade || mapa.cidade?.[0]?.valor || '',
            estado: im?.estado || mapa.estado?.[0]?.valor || '',
            quartos: im?.quartos || mapa.quartos?.[0]?.valor || '',
            suites: im?.suites || mapa.suites?.[0]?.valor || '',
            vagas: im?.vagas || mapa.vagas?.[0]?.valor || '',
            banheiros: im?.banheiros || mapa.banheiros?.[0]?.valor || '',
            area: im?.area_m2 || (typeof mapa.area?.[0]?.valor === 'object' ? mapa.area?.[0]?.valor?.max : mapa.area?.[0]?.valor) || '',
            valorMax: im ? parseFloat(im.valor_imovel||0) : (mapa.valor?.[0]?.valor?.max || 0),
            valorMin: 0,
          };
          await _auIWG(lead.id, { mapaIntencao: mapa, perfilIA: _perfilIA, temperatura: mapa.temperatura||'frio', faseFunil: mapa.fase||'novo' });
          console.log('[webhook-global] perfilIA atualizado | userId:', userId);
          try {
            const mc = require('./cerebro/match-core');
            await mc.processar({ lead: { ..._snapIWG, mapaIntencao: mapa, perfilIA: _perfilIA }, mensagem: mensagem||'', canal: 'ImovelWeb', userId });
          } catch(e){ console.error('[webhook-global] erro match:', e.message); }
          await _duplicarLeadSaoPauloTIA({ ..._snapIWG, mapaIntencao: mapa, perfilIA: _perfilIA }, _perfilIA.cidade, mensagem);
        }
      } catch(e){ console.error('[webhook-global] erro setTimeout:', e.message); }
    }, 2000);

    // Mesmo imovel (id_externo) cadastrado em outras contas — duplica a lead pra cada uma
    try {
      const _dupRows = await _qWG('SELECT * FROM imoveis WHERE id_externo=$1 AND user_id != $2', [String(reference), userId]);
      for (const imDup of _dupRows.rows) {
        const userIdDup = imDup.user_id || imDup.codigo_usuario || '';
        if (!userIdDup) continue;
        const leadDup = {
          id: Date.now().toString() + Math.random().toString(36).substr(2,5),
          nome, email, telefone, whatsapp: telefone, contato: telefone,
          mensagem,
          idAnuncio: reference,
          fonte: 'ImovelWeb', origem: 'ImovelWeb', origemEntrada: 'webhook_imovelweb_global',
          userId: userIdDup, codigoUsuario: userIdDup, user_id: userIdDup,
          status: 'novo', score: 0, temperatura: 'frio', faseFunil: 'novo',
          mensagens: [], matches: [], timeline: [], eventos: [], followUps: [],
          criadoEm: new Date().toISOString(),
        };
        const { salvarLead: _slIWGDup } = require('./services/salvarLead');
        await _cruzarImovelWebhook(leadDup, userIdDup);
        await _slIWGDup(leadDup);
        console.log('[webhook-global] lead DUPLICADA salva | userId:', userIdDup, '| tel:', telefone, '| nome:', nome);
        _notificarNovaLead(userIdDup, leadDup.id, nome, 'ImovelWeb');
        const _snapDup = { id: leadDup.id, userId: userIdDup, nome: leadDup.nome||'', telefone: leadDup.telefone||'', whatsapp: leadDup.whatsapp||'', contato: leadDup.contato||'', email: leadDup.email||'', mensagem: leadDup.mensagem||'', idAnuncio: leadDup.idAnuncio||'', perfilIA: leadDup.perfilIA||{}, origemEntrada: 'webhook_imovelweb_global', origem: 'ImovelWeb' };
        setTimeout(async () => {
          try {
            const { processarLeadPortal } = require('./cerebro/portal-processor');
            const { atualizarLead: _auDup } = require('./services/salvarLead');
            const mapaDup = await processarLeadPortal(_snapDup);
            if (mapaDup) {
              const _perfilIADup = {
                tipo: imDup?.tipo || mapaDup.tipo_imovel?.[0]?.valor || '',
                intencao: (imDup?.transacao==='venda'?'comprar':imDup?.transacao==='aluguel'?'alugar':imDup?.transacao) || (mapaDup.transacao?.[0]?.valor==='venda'?'comprar':mapaDup.transacao?.[0]?.valor==='aluguel'?'alugar':mapaDup.transacao?.[0]?.valor) || '',
                bairro: imDup?.bairro || mapaDup.bairro?.[0]?.valor || '',
                cidade: imDup?.cidade || mapaDup.cidade?.[0]?.valor || '',
                estado: imDup?.estado || mapaDup.estado?.[0]?.valor || '',
                quartos: imDup?.quartos || mapaDup.quartos?.[0]?.valor || '',
                suites: imDup?.suites || mapaDup.suites?.[0]?.valor || '',
                vagas: imDup?.vagas || mapaDup.vagas?.[0]?.valor || '',
                banheiros: imDup?.banheiros || mapaDup.banheiros?.[0]?.valor || '',
                area: imDup?.area_m2 || (typeof mapaDup.area?.[0]?.valor === 'object' ? mapaDup.area?.[0]?.valor?.max : mapaDup.area?.[0]?.valor) || '',
                valorMax: imDup ? parseFloat(imDup.valor_imovel||0) : (mapaDup.valor?.[0]?.valor?.max || 0),
                valorMin: 0,
              };
              await _auDup(leadDup.id, { mapaIntencao: mapaDup, perfilIA: _perfilIADup, temperatura: mapaDup.temperatura||'frio', faseFunil: mapaDup.fase||'novo' });
              console.log('[webhook-global] perfilIA DUPLICADA atualizado | userId:', userIdDup);
              try {
                const mcDup = require('./cerebro/match-core');
                await mcDup.processar({ lead: { ..._snapDup, mapaIntencao: mapaDup, perfilIA: _perfilIADup }, mensagem: mensagem||'', canal: 'ImovelWeb', userId: userIdDup });
              } catch(e){ console.error('[webhook-global] erro match duplicata:', e.message); }
            }
          } catch(e){ console.error('[webhook-global] erro setTimeout duplicata:', e.message); }
        }, 2000);
      }
    } catch(e) { console.error('[webhook-global] erro ao buscar duplicatas:', e.message); }

  } catch(e) { console.error('[webhook-global] ERRO:', e.message); }
});
// ── FIM XML/WEBHOOK GLOBAL ────────────────────────────────────────────────────
// ── IMPORT JOBS STATUS ────────────────────────────────────────────────────────
app.get('/api/import/status/:jobId', auth, async (req, res) => {
  try {
    const { buscarJob } = require('./services/importJobs');
    const job = await buscarJob(req.params.jobId);
    if (!job) return res.json({ ok: false, erro: 'Job não encontrado' });
    res.json({ ok: true, job });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});
// ── FIM IMPORT JOBS STATUS ────────────────────────────────────────────────────


// Job reengajamento — roda todo dia às 10h
const _agendarReengajamento = () => {
  const agora = new Date();
  const amanha10h = new Date(agora);
  amanha10h.setDate(amanha10h.getDate() + (agora.getHours() >= 10 ? 1 : 0));
  amanha10h.setHours(10, 0, 0, 0);
  const msAte10h = amanha10h - agora;
  setTimeout(async () => {
    try {
      const { enviarEmailReengajamento } = require('./services/emailReengajamento');
      await enviarEmailReengajamento();
    } catch(e) { console.error('[JOB REENGAJAMENTO]', e.message); }
    setInterval(async () => {
      try {
        const { enviarEmailReengajamento } = require('./services/emailReengajamento');
        await enviarEmailReengajamento();
      } catch(e) { console.error('[JOB REENGAJAMENTO]', e.message); }
    }, 24 * 3600 * 1000);
  }, msAte10h);
  console.log('[JOB REENGAJAMENTO] agendado para:', amanha10h.toLocaleString('pt-BR'));
};
_agendarReengajamento();

// Job rematch de leads sem match — roda todo dia às 6h (services/matchPendentes.js).
// Restrito às leads criadas nos últimos 2 dias pra não pesar no servidor
// reprocessando a base toda todo dia (backfill de leads mais antigas é
// manual: node rodarMatchLeadsSemMatch.js no Render Shell).
const _agendarMatchPendentes = () => {
  const agora = new Date();
  const amanha6h = new Date(agora);
  amanha6h.setDate(amanha6h.getDate() + (agora.getHours() >= 6 ? 1 : 0));
  amanha6h.setHours(6, 0, 0, 0);
  const msAte6h = amanha6h - agora;
  setTimeout(async () => {
    try {
      const { rodarMatchLeadsSemMatch } = require('./services/matchPendentes');
      await rodarMatchLeadsSemMatch({ diasAtras: 2 });
    } catch(e) { console.error('[JOB MATCH PENDENTES]', e.message); }
    setInterval(async () => {
      try {
        const { rodarMatchLeadsSemMatch } = require('./services/matchPendentes');
        await rodarMatchLeadsSemMatch({ diasAtras: 2 });
      } catch(e) { console.error('[JOB MATCH PENDENTES]', e.message); }
    }, 24 * 3600 * 1000);
  }, msAte6h);
  console.log('[JOB MATCH PENDENTES] agendado para:', amanha6h.toLocaleString('pt-BR'));
};
_agendarMatchPendentes();

// Job da campanha global de captação (services/campanhaCaptacao.js) — só
// dispara de fato quando o admin ativa em /admin/captacao-campanha
// (enviarProximoEmail() já checa o flag "ativo" e não faz nada se pausada).
// Intervalo entre envios é ALEATÓRIO (1 a 3 min), nunca fixo — um padrão
// robótico de "exatamente a cada X segundos" é um sinal clássico de spam
// pros provedores de email.
function _agendarProximoEnvioCampanha() {
  const delayMs = (60 + Math.random() * 120) * 1000; // 60s a 180s
  setTimeout(async () => {
    try {
      const { enviarProximoEmail } = require('./services/campanhaCaptacao');
      await enviarProximoEmail();
    } catch (e) { console.error('[JOB CAMPANHA CAPTACAO]', e.message); }
    _agendarProximoEnvioCampanha();
  }, delayMs);
}
_agendarProximoEnvioCampanha();

// Job da campanha geral de email (services/campanha.js, base de ~118 mil
// contatos) — mesmo princípio: só dispara quando ativa em /admin/campanha,
// intervalo aleatório de 30s a 5min a cada envio (nunca fixo, sempre varia).
function _agendarProximoEnvioCampanhaGeral() {
  const delayMs = (30 + Math.random() * 270) * 1000; // 30s a 300s (5min)
  setTimeout(async () => {
    try {
      const { enviarProximo } = require('./services/campanha');
      await enviarProximo();
    } catch (e) { console.error('[JOB CAMPANHA GERAL]', e.message); }
    _agendarProximoEnvioCampanhaGeral();
  }, delayMs);
}
_agendarProximoEnvioCampanhaGeral();

// Job de validação de email da campanha geral — roda em paralelo ao envio,
// processando lotes pequenos (50 por vez, a cada 5s) pra ir verificando
// formato + registro MX do domínio de toda a base sem travar o servidor.
// Só quem tem email_valido=true entra na fila de envio (proximoLote em
// services/campanha.js) — descarta quem não existe de verdade.
setInterval(async () => {
  try {
    const { validarProximoLote } = require('./services/campanha');
    await validarProximoLote(50);
  } catch (e) { console.error('[JOB VALIDACAO EMAILS CAMPANHA]', e.message); }
}, 5000);

// Job onboarding — verifica a cada 30min se algum usuário completou um dos 3 passos
// (cadastrar imóvel / ativar WhatsApp / adicionar lead) e manda o email de parabéns
setTimeout(async () => {
  try {
    const { verificarOnboardingPassos } = require('./services/emailOnboardingPassos');
    await verificarOnboardingPassos();
  } catch(e) { console.error('[JOB ONBOARDING EMAIL]', e.message); }
  setInterval(async () => {
    try {
      const { verificarOnboardingPassos } = require('./services/emailOnboardingPassos');
      await verificarOnboardingPassos();
    } catch(e) { console.error('[JOB ONBOARDING EMAIL]', e.message); }
  }, 30 * 60 * 1000);
}, 60 * 1000);

app.get('/admin/regenerar-xml/:userId', authAdmin, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const userId = req.params.userId;
    const userR = await _q('SELECT * FROM usuarios WHERE codigo_usuario=$1', [userId]);
    if(!userR.rows.length) return res.send('Usuário não encontrado');
    const user = userR.rows[0];
    const imoveisR = await _q('SELECT * FROM imoveis WHERE user_id=$1 AND status IN ($2,$3)', [userId,'ativo','publicado']);
    const imoveis = imoveisR.rows.map(row => ({...((row.dados)||{}), ...row, idExterno: row.id_externo, portais: row.portais||[]}));
    const token = userId.replace(/[^a-z0-9]/gi,'-');
    const todosPortais = ['olx','zap','vivareal','chaves','imovelweb','123i','quintoandar'];
    const resultados = [];
    todosPortais.forEach(portal => {
      const filtrados = imoveis.filter(i => {
        const temPortal = Array.isArray(i.portais) ? i.portais.includes(portal) : !!(i.portais||{})[portal];
        return temPortal;
      }).map(i => ({
        ...i,
        corretorNome: user.nome||'',
        corretorEmail: user.email||'',
        corretorTelefone: user.celular||user.telefone||''
      }));
      const filename = 'feed-'+portal+'-'+token+'.xml';
      if(filtrados.length > 0){
        const _userXml = (_cacheUsuarios||[]).find(u => String(u.id||u.codigoUsuario||'') === String(userId||'')) || {};
        const xml = gerarXMLPortal(filtrados, portal, _userXml);
        fs.writeFileSync(dataPath(filename), xml, 'utf8');
        const _urlXml = BASE_URL+'/feed-xml/'+portal+'/'+token;
        _q('INSERT INTO xml_feeds (user_id, portal, url, total, arquivo, last_sync_at, ativo) VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT (user_id, portal) DO UPDATE SET arquivo=EXCLUDED.arquivo, url=EXCLUDED.url, total=EXCLUDED.total, last_sync_at=EXCLUDED.last_sync_at', [userId, portal, _urlXml, filtrados.length, xml, new Date().toISOString()]).catch(()=>{});
        resultados.push(portal+': '+filtrados.length+' imóveis → '+filename);
      } else {
        resultados.push(portal+': 0 imóveis (pulado)');
      }
    });
    res.send('<pre>XML regenerado para '+userId+':\n\n'+resultados.join('\n')+'</pre><br><a href="/admin">Voltar</a>');
  } catch(e) {
    res.send('Erro: '+e.message);
  }
});

// Ferramenta manual: roda o match (services/match-core.js) pra todas as
// leads de uma conta que ainda não têm nenhum match — antes só dava pra
// fazer isso via script no Render Shell (ver rodarMatchContaTiaA6pg.js),
// agora dá pra rodar direto do admin digitando o código da conta.
app.get('/admin/rematch', authAdmin, async (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gerar Match de Conta</title>
  <style>body{font-family:Arial,sans-serif;margin:0;padding:0}
  ${_adminShellCss()}
  .admin-content{max-width:640px}
  h1{color:#FF385C;font-size:20px}
  label{display:block;font-size:12px;font-weight:bold;color:#374151;margin:14px 0 4px}
  input[type=text],input[type=number],textarea{width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box;font-family:inherit}
  textarea{resize:vertical}
  .chk{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13px}
  button{background:#FF385C;color:#fff;padding:10px 20px;border:none;border-radius:6px;cursor:pointer;font-size:13px;margin-top:16px;font-weight:bold}
  button:disabled{opacity:.5;cursor:not-allowed}
  .box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0}
  .gray{color:#6b7280;font-size:12.5px}
  #resultado{margin-top:16px;font-size:13px}
  .stat{display:inline-block;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;margin:4px 6px 4px 0;text-align:center;min-width:70px}
  .stat strong{display:block;font-size:18px;color:#FF385C}
  table{border-collapse:collapse;width:100%;margin-top:14px;font-size:12.5px}
  th{text-align:left;padding:6px 8px;background:#f3f4f6;font-size:10.5px;text-transform:uppercase;color:#6b7280}
  td{padding:6px 8px;border-bottom:1px solid #f3f4f6}
  .busca-wrap{position:relative}
  .sugestoes{position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid #d1d5db;border-top:none;max-height:220px;overflow-y:auto;border-radius:0 0 6px 6px;box-shadow:0 4px 10px rgba(0,0,0,.08)}
  .sugestao-item{padding:8px 10px;cursor:pointer;font-size:13px}
  .sugestao-item:hover{background:#f3f4f6}
  .sugestao-item .cod{color:#6b7280;font-size:11px}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .chip{display:inline-flex;align-items:center;gap:6px;background:#fff1f2;color:#111827;border:1px solid #fecdd3;border-radius:999px;padding:4px 6px 4px 12px;font-size:12px}
  .chip button{all:unset;cursor:pointer;color:#6b7280;font-weight:bold;padding:0 6px;line-height:1;margin:0}
  .chip button:hover{color:#FF385C}</style></head>
  <body><div class="admin-app">${_adminSidebarHtml('rematch')}<main class="admin-content">
  <h1>🔄 Gerar Match de Conta</h1>
  <p class="gray">Roda o motor de match pra todas as leads das contas que ainda não têm nenhum match encontrado. Útil depois de importar imóveis novos ou corrigir um bug no match, sem precisar esperar o job automático.</p>
  <div class="box">
    <label>Buscar conta por nome ou código</label>
    <div class="busca-wrap">
      <input type="text" id="buscaConta" placeholder="Digite o nome do corretor..." autocomplete="off">
      <div id="sugestoesConta" class="sugestoes" style="display:none"></div>
    </div>
    <div id="contasChips" class="chips"></div>
    <label style="margin-top:18px">Ou cole código(s) direto (opcional)</label>
    <textarea id="userIds" rows="3" placeholder="Uma conta por linha ou separadas por vírgula, ex:&#10;TIA-A6PG&#10;JAN-MGF9, MAU-EHAM"></textarea>
    <div class="chk"><input type="checkbox" id="semVitrine"><label for="semVitrine" style="margin:0;font-weight:normal">Só leads que ainda não receberam vitrine</label></div>
    <label>Limitar a leads criadas nos últimos N dias (opcional)</label>
    <input type="number" id="diasAtras" placeholder="deixe em branco pra não limitar" min="1">
    <button type="button" id="btnRodar" onclick="rodar()">▶ Rodar match agora</button>
  </div>
  <div id="resultado"></div>
  <script>
  function escHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  let _contasSelecionadas = [];
  let _buscaTimer = null;
  document.getElementById('buscaConta').addEventListener('input', function(){
    clearTimeout(_buscaTimer);
    const termo = this.value.trim();
    const box = document.getElementById('sugestoesConta');
    if(termo.length < 2){ box.style.display = 'none'; return; }
    _buscaTimer = setTimeout(async function(){
      try {
        const r = await fetch('/admin/demanda/buscar-conta?q=' + encodeURIComponent(termo));
        const d = await r.json();
        const disponiveis = (d.contas || []).filter(function(c){ return !_contasSelecionadas.some(function(s){ return s.codigo_usuario === c.codigo_usuario; }); });
        if(!disponiveis.length){ box.innerHTML = '<div class="sugestao-item gray">Nenhuma conta encontrada</div>'; box.style.display = 'block'; return; }
        box.innerHTML = disponiveis.map(function(c){
          return '<div class="sugestao-item" data-codigo="'+escHtml(c.codigo_usuario)+'"><div>'+escHtml(c.nome)+'</div><div class="cod">'+escHtml(c.codigo_usuario)+' · '+escHtml(c.email||'')+'</div></div>';
        }).join('');
        box.style.display = 'block';
      } catch(e){}
    }, 250);
  });
  document.getElementById('sugestoesConta').addEventListener('click', function(e){
    const item = e.target.closest('[data-codigo]');
    if(!item) return;
    const codigo = item.getAttribute('data-codigo');
    if(!_contasSelecionadas.some(function(s){ return s.codigo_usuario === codigo; })){
      const nome = item.querySelector('div').textContent;
      _contasSelecionadas.push({ codigo_usuario: codigo, nome: nome });
      renderChips();
    }
    document.getElementById('buscaConta').value = '';
    document.getElementById('sugestoesConta').style.display = 'none';
  });
  document.addEventListener('click', function(e){
    if(!e.target.closest('#buscaConta') && !e.target.closest('#sugestoesConta')) document.getElementById('sugestoesConta').style.display = 'none';
  });
  function renderChips(){
    document.getElementById('contasChips').innerHTML = _contasSelecionadas.map(function(c){
      return '<span class="chip">'+escHtml(c.nome)+' ('+escHtml(c.codigo_usuario)+')<button type="button" data-remover="'+escHtml(c.codigo_usuario)+'">×</button></span>';
    }).join('');
  }
  document.getElementById('contasChips').addEventListener('click', function(e){
    const btn = e.target.closest('[data-remover]');
    if(!btn) return;
    const codigo = btn.getAttribute('data-remover');
    _contasSelecionadas = _contasSelecionadas.filter(function(c){ return c.codigo_usuario !== codigo; });
    renderChips();
  });
  async function rodar(){
    const dosChips = _contasSelecionadas.map(function(c){ return c.codigo_usuario; });
    const doTexto = document.getElementById('userIds').value.split(/[,\\n]/).map(function(s){ return s.trim(); }).filter(Boolean);
    const userIds = [...new Set(dosChips.concat(doTexto))];
    if(!userIds.length){ alert('Selecione ou digite ao menos uma conta.'); return; }
    const semVitrine = document.getElementById('semVitrine').checked;
    const diasAtras = document.getElementById('diasAtras').value;
    const btn = document.getElementById('btnRodar');
    btn.disabled = true; btn.textContent = '⏳ Rodando...';
    document.getElementById('resultado').innerHTML = '<p class="gray">Processando '+userIds.length+' conta'+(userIds.length>1?'s':'')+' — pode levar um tempo dependendo da quantidade de leads...</p>';
    try {
      const r = await fetch('/admin/rematch', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ userIds, semVitrine, diasAtras: diasAtras || null })
      });
      const d = await r.json();
      if(!d.ok){ document.getElementById('resultado').innerHTML = '<p style="color:#dc2626">Erro: '+d.erro+'</p>'; return; }
      const s = d.totais;
      let html =
        '<div class="stat"><strong>'+s.total+'</strong>Encontradas</div>'+
        '<div class="stat"><strong>'+s.processadas+'</strong>Processadas</div>'+
        '<div class="stat" style="border-color:#16a34a"><strong style="color:#16a34a">'+s.geraramMatch+'</strong>Geraram match</div>'+
        '<div class="stat"><strong>'+s.puladas+'</strong>Puladas</div>'+
        '<div class="stat" style="border-color:#dc2626"><strong style="color:#dc2626">'+s.erros+'</strong>Erros</div>';
      if(d.porConta.length > 1){
        html += '<table><tr><th>Conta</th><th>Encontradas</th><th>Processadas</th><th>Geraram match</th><th>Puladas</th><th>Erros</th></tr>' +
          d.porConta.map(function(c){
            if(c.erro) return '<tr><td>'+c.userId+'</td><td colspan="5" style="color:#dc2626">Erro: '+c.erro+'</td></tr>';
            const r = c.resumo;
            return '<tr><td>'+c.userId+'</td><td>'+r.total+'</td><td>'+r.processadas+'</td><td>'+r.geraramMatch+'</td><td>'+r.puladas+'</td><td>'+r.erros+'</td></tr>';
          }).join('') + '</table>';
      }
      document.getElementById('resultado').innerHTML = html;
    } catch(e){ document.getElementById('resultado').innerHTML = '<p style="color:#dc2626">Erro ao rodar.</p>'; }
    btn.disabled = false; btn.textContent = '▶ Rodar match agora';
  }
  </script>
  </main></div></body></html>`);
});
app.post('/admin/rematch', authAdmin, express.json(), async (req, res) => {
  try {
    let userIds = Array.isArray(req.body.userIds) ? req.body.userIds : (req.body.userId ? [req.body.userId] : []);
    userIds = [...new Set(userIds.map(u => String(u || '').trim()).filter(Boolean))];
    if (!userIds.length) return res.json({ ok: false, erro: 'Informe ao menos um código de conta.' });
    const semVitrine = !!req.body.semVitrine;
    const diasAtras = req.body.diasAtras ? parseInt(req.body.diasAtras, 10) : undefined;
    const { rodarMatchLeadsSemMatch } = require('./services/matchPendentes');

    const porConta = [];
    const totais = { total: 0, processadas: 0, geraramMatch: 0, puladas: 0, erros: 0 };
    for (const userId of userIds) {
      try {
        const resumo = await rodarMatchLeadsSemMatch({ userId, semVitrine, diasAtras });
        porConta.push({ userId, resumo });
        totais.total += resumo.total; totais.processadas += resumo.processadas;
        totais.geraramMatch += resumo.geraramMatch; totais.puladas += resumo.puladas; totais.erros += resumo.erros;
      } catch (eConta) {
        console.error('[admin/rematch] erro na conta', userId, eConta.message);
        porConta.push({ userId, erro: eConta.message });
      }
    }
    res.json({ ok: true, totais, porConta });
  } catch (e) {
    console.error('[admin/rematch]', e.message);
    res.json({ ok: false, erro: e.message });
  }
});

app.get('/admin/acessar/:codigo', authAdmin, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const u = (await _q('SELECT * FROM usuarios WHERE codigo_usuario=$1', [req.params.codigo])).rows[0];
    if(!u) return res.redirect('/admin');
    const { lerUsuarios: _lu } = require('./services/salvarUsuario');
    const users = await _lu();
    const user = users.find(u2 => u2.id === u.codigo_usuario || u2.codigoUsuario === u.codigo_usuario);
    req.session.admin = true; // mantém admin ativo
    req.session.user = user || { id: u.codigo_usuario, codigoUsuario: u.codigo_usuario, nome: u.nome, telefone: u.telefone, email: u.email };
    res.redirect('/app/leads');
  } catch(e) { res.send('Erro: '+e.message); }
});

app.post('/admin/usuario/:codigo/creditos', authAdmin, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const cod = req.params.codigo;
    const qtd = parseInt(req.body.creditos) || 0;
    const op = req.body.operacao || 'adicionar';
    if(op === 'adicionar'){
      await _q('UPDATE usuarios SET match_coins=COALESCE(match_coins,0)+$1, match_coins_total=COALESCE(match_coins_total,0)+$1 WHERE codigo_usuario=$2', [qtd, cod]);
    } else {
      await _q('UPDATE usuarios SET match_coins=GREATEST(0,COALESCE(match_coins,0)-$1) WHERE codigo_usuario=$2', [qtd, cod]);
    }
    const _novoSaldo = (await _q('SELECT match_coins FROM usuarios WHERE codigo_usuario=$1', [cod])).rows[0]?.match_coins || 0;

    // Persiste a transação no histórico (coluna dados) — senão some do /app/coins
    // assim que o _cacheUsuarios atualizar de novo (a cada 15s)
    const _rowDados = (await _q('SELECT dados FROM usuarios WHERE codigo_usuario=$1', [cod])).rows[0];
    const _dadosAtual = (_rowDados && _rowDados.dados) || {};
    const _transacoes = Array.isArray(_dadosAtual.matchCoinsTransacoes) ? _dadosAtual.matchCoinsTransacoes : [];
    _transacoes.push({
      data: new Date().toISOString(),
      motivo: op === 'adicionar' ? 'recarga manual' : 'debito manual',
      quantidade: op === 'adicionar' ? qtd : -qtd,
      saldoApos: _novoSaldo
    });
    _dadosAtual.matchCoinsTransacoes = _transacoes;
    await _q('UPDATE usuarios SET dados=$1 WHERE codigo_usuario=$2', [JSON.stringify(_dadosAtual), cod]);

    // Atualizar cache pra refletir na hora, sem esperar o próximo refresh de 15s
    if (_cacheUsuarios) {
      const _ci = _cacheUsuarios.findIndex(u => u.codigoUsuario === cod || u.codigo_usuario === cod);
      if (_ci >= 0) {
        _cacheUsuarios[_ci].matchCoins = _novoSaldo;
        _cacheUsuarios[_ci].matchCoinsTransacoes = _transacoes;
      }
    }
    res.redirect('/admin');
  } catch(e) { res.send('Erro: ' + e.message); }
});

// Era GET: ação destrutiva disparável por link/preview de email/scanner
// automático sem interação real (o confirm() do onclick só roda em clique de
// verdade num navegador, não protege contra fetch automático de link).
app.post('/admin/deletar/:codigo', authAdmin, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const cod = req.params.codigo;
    await _q('DELETE FROM usuarios WHERE codigo_usuario=$1', [cod]);
    await _q('DELETE FROM imoveis WHERE user_id=$1', [cod]);
    await _q('DELETE FROM leads WHERE user_id=$1', [cod]);
    await _q('DELETE FROM visitas WHERE user_id=$1', [cod]);
    await _q('DELETE FROM notificacoes WHERE user_id=$1', [cod]);
    await _q('UPDATE solicitacoes_exclusao_conta SET atendido=TRUE WHERE user_id=$1', [cod]).catch(()=>{});
    res.redirect('/admin');
  } catch(e) { res.send('Erro: ' + e.message); }
});

app.get('/admin/usuario/:codigo', authAdmin, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const cod = req.params.codigo;
    const u = (await _q('SELECT * FROM usuarios WHERE codigo_usuario=$1', [cod])).rows[0];
    if(!u) return res.redirect('/admin');
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${u.nome} · Admin</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',sans-serif;background:#f8f8f7;font-size:13px;}
${_adminShellCss()}
.admin-content{max-width:600px}.card{background:#fff;border:1px solid #e5e5e3;border-radius:12px;padding:20px;margin-bottom:16px;}
h2{font-size:14px;font-weight:600;margin-bottom:14px;}label{display:block;font-size:11px;font-weight:500;color:#888;margin-bottom:4px;}
input{width:100%;border:1px solid #e5e5e3;border-radius:8px;padding:9px 12px;font-size:13px;margin-bottom:12px;outline:none;}
input:focus{border-color:#111;}button{background:#111;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer;}
</style></head>
<body>
<div class="admin-app">
${_adminSidebarHtml('dashboard', req.session.adminSuper !== false ? true : (req.session.adminPermissoes || []))}
<main class="admin-content">
  <h1 style="font-size:18px;font-weight:700;margin-bottom:16px">${u.nome}</h1>
  <div class="card">
    <h2>Dados</h2>
    <label>Código</label><input value="${u.codigo_usuario||''}" readonly>
    <label>Nome</label><input value="${u.nome||''}" readonly>
    <label>Telefone</label><input value="${u.telefone||''}" readonly>
    <label>WhatsApp Status</label><input value="${u.whatsapp_status||''}" readonly>
  </div>
  <div class="card">
    <h2>Alterar Senha</h2>
    <form method="POST" action="/admin/usuario/${u.codigo_usuario}/senha">
      <label>Nova Senha</label>
      <input type="text" name="senha" value="${u.senha||''}" required>
      <button type="submit">Salvar</button>
    </form>
  </div>
  <div class="card">
    <h2>Importar XML de Imóveis</h2>
    <p style="font-size:12px;color:#888;margin-bottom:12px;">Padrão VivaReal/ZAP. Os imóveis serão importados para esta conta.</p>
    <form id="formXml" onsubmit="importarXml(event)">
      <label>Arquivo XML</label>
      <input type="file" id="arquivoXml" accept=".xml" required style="margin-bottom:12px;">
      <button type="submit" id="btnXml">Importar XML</button>
      <div id="xmlStatus" style="margin-top:10px;font-size:12px;color:#888;"></div>
    </form>
    <script>
    async function importarXml(e){
      e.preventDefault();
      const btn = document.getElementById('btnXml');
      const status = document.getElementById('xmlStatus');
      const file = document.getElementById('arquivoXml').files[0];
      if(!file) return;
      btn.disabled=true; btn.textContent='Importando...';
      status.textContent='Enviando arquivo...';
      const fd = new FormData();
      fd.append('arquivo', file);
      try {
        const r = await fetch('/app/importar-xml-upload?userId=${u.codigo_usuario}', {method:'POST',body:fd});
        const d = await r.json();
        status.textContent = d.ok ? '✅ '+d.mensagem : '❌ '+d.erro;
      } catch(err) {
        status.textContent = '❌ Erro: '+err.message;
      }
      btn.disabled=false; btn.textContent='Importar XML';
    }
    </script>
  </div>
</main>
</div>
</body></html>`);
  } catch(e) { res.send('Erro: ' + e.message); }
});

app.post('/admin/usuario/:codigo/senha', authAdmin, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const _hashAdmin = await bcrypt.hash(req.body.senha, 10);
    await _q('UPDATE usuarios SET senha=$1 WHERE codigo_usuario=$2', [_hashAdmin, req.params.codigo]);
    res.redirect('/admin');
  } catch(e) { res.send('Erro: ' + e.message); }
});
// ═══════════════════════════════════════════════════════

function _temPerfilMinimoLead(l) {
  const pf = l.perfilIA || {}; const d = l.dados || {}; const m = l.mapaIntencao || {};
  return !!(pf.tipo||d.tipo||l.tipo||(m.tipo_imovel||[]).length) &&
         !!(pf.intencao||d.intencao||l.intencao||(m.transacao||[]).length) &&
         !!(pf.cidade||d.cidade||l.cidade||(m.cidade||[]).length) &&
         !!(pf.bairro||d.bairro||l.bairro||(m.bairro||[]).length) &&
         !!(pf.valorMax||d.valorMax||l.valorMax||(m.valor||[]).length);
}
// Readiness check — usado pelo Render pra saber se pode trocar o tráfego
// pra essa instância no deploy. Checa o banco (cache de 5s pra não bater
// SELECT 1 a cada poll do Render).
let _healthDbOk = false;
let _healthCheckedAt = 0;
app.get('/health', async (req,res) => {
  try {
    if (Date.now() - _healthCheckedAt > 5000) {
      const { dbOk } = require('./services/db');
      _healthDbOk = await dbOk();
      _healthCheckedAt = Date.now();
    }
    if (!_healthDbOk) return res.status(503).json({ok:false, db:false, ts:new Date().toISOString()});
    res.json({ok:true, db:true, ts:new Date().toISOString()});
  } catch(e) {
    res.status(503).json({ok:false, erro:e.message});
  }
});
// Redirect onrender.com -> matchimoveis.ia.br para feeds XML
app.use('/feed-xml', (req, res, next) => {
  const host = req.headers.host || '';
  if (host.includes('onrender.com')) {
    return res.redirect(301, 'https://matchimoveis.ia.br/feed-xml' + req.path);
  }
  next();
});

app.get('/feed-xml/:portal/:token', async (req, res) => {
  req.setTimeout(900000);
  res.setTimeout(900000);
  try {
    const { query: _qfx } = require('./services/db');
    const userId = req.params.token.replace(/-/g, match => match);
    const r = await _qfx('SELECT arquivo FROM xml_feeds WHERE portal=$1 AND user_id=$2 AND ativo=true', [req.params.portal, req.params.token]);
    if(!r.rows.length || !r.rows[0].arquivo) return res.status(404).send('XML não encontrado');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(r.rows[0].arquivo);
  } catch(e) { res.status(500).send('Erro: '+e.message); }
});

function spawnAsync(cmd, args, opts){
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const p = spawn(cmd, args, { ...opts, stdio:'inherit' });
    p.on('close', c => c === 0 ? resolve() : reject(new Error('exit ' + c)));
    p.on('error', reject);
  });
}
// Download de arquivos .xlsx gerados na raiz do app por scripts manuais
// (ex: exportar-vitrines-enviadas.js) - protegido por login de admin.
// OBS: o Render Shell roda numa instância separada da que serve o site,
// então um arquivo gerado lá não fica visível aqui - preferir a rota
// /admin/export-vitrines/:userId abaixo, que gera tudo na própria requisição.
app.get('/admin/download-arquivo/:nome', authAdmin, (req, res) => {
  const nome = req.params.nome;
  if (!/^[\w.-]+\.xlsx$/.test(nome)) return res.status(400).send('Nome de arquivo inválido');
  const caminho = path.join(__dirname, nome);
  if (path.dirname(caminho) !== __dirname || !fs.existsSync(caminho)) {
    return res.status(404).send('Arquivo não encontrado');
  }
  res.download(caminho);
});

// Gera e baixa, na própria requisição (sem depender de arquivo em disco),
// a planilha de leads com vitrine enviada de uma conta - mesma logica de
// exportar-vitrines-enviadas.js e mesmas colunas do modelo de
// /app/modelo-leads.xlsx.
app.get('/admin/export-vitrines/:userId', authAdmin, async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { query: _qExpVit } = require('./services/db');
    const USER_ID = req.params.userId;

    const { rows } = await _qExpVit(
      `SELECT * FROM leads
       WHERE (user_id=$1 OR codigo_usuario=$1)
         AND vitrine_enviada = true
         AND NOT (deletado_por @> to_jsonb($1::text))
       ORDER BY vitrine_enviada_em DESC NULLS LAST, criado_em DESC`,
      [USER_ID]
    );

    const linhas = rows.map(r => {
      const perfil = r.perfil_ia || {};
      const dados = r.dados || {};
      return {
        Nome: r.nome || '',
        Telefone: r.telefone || r.whatsapp || r.contato || '',
        Email: dados.email || '',
        Origem: r.origem || '',
        Tipo: perfil.tipo || '',
        Transacao: perfil.intencao || '',
        Condicao: perfil.condicao || '',
        Bairro: perfil.bairro || '',
        Cidade: perfil.cidade || '',
        Estado: perfil.estado || '',
        Quartos: perfil.quartos || '',
        Suites: perfil.suites || '',
        Vagas: perfil.vagas || '',
        Banheiros: perfil.banheiros || '',
        Area_max: perfil.area || '',
        Valor_max: perfil.valorMax || '',
        Observacoes: ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="vitrines-enviadas-${USER_ID}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) {
    res.status(500).send('Erro ao gerar planilha: ' + e.message);
  }
});

app.get('/', (req,res)=>{
  if (req.session && req.session.user) {
    const ua = req.headers['user-agent'] || '';
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
    return res.redirect(isMobile ? '/app/feed' : '/app/leads');
  }
  res.render('landing', { error: req.query.erro || req.query.error || null, ref: (req.query.ref || '').trim(), msg: req.query.msg || null });
});

// Esqueci minha senha — gera senha nova e manda por e-mail. Resposta é sempre
// a mesma independente do telefone existir ou não (evita confirmar pra quem
// tenta adivinhar se um número está cadastrado).
app.post('/esqueci-senha', async (req, res) => {
  try {
    const telefone = String(req.body.telefone || '').replace(/\D/g, '');
    if (telefone) {
      const { lerUsuarios: _luEsq, atualizarUsuario: _auEsq } = require('./services/salvarUsuario');
      const users = await _luEsq();
      const user = users.find(u => String(u.telefone || u.celular || '').replace(/\D/g, '') === telefone);
      if (user && user.email) {
        const _chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let novaSenha = '';
        for (let i = 0; i < 8; i++) novaSenha += _chars[Math.floor(Math.random() * _chars.length)];
        const hash = await bcrypt.hash(novaSenha, 10);
        const uidEsq = user.codigoUsuario || user.id;
        await _auEsq(uidEsq, { senha: hash });
        if (_cacheUsuarios) { const idx = _cacheUsuarios.findIndex(u => u.id === uidEsq); if (idx >= 0) _cacheUsuarios[idx].senha = hash; }
        const { enviarEmail } = require('./services/email');
        await enviarEmail({
          para: user.email,
          assunto: '🔑 Redefinição de senha — MatchImóveis',
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
            <h2 style="color:#FF385C">Sua nova senha</h2>
            <p>Você solicitou a redefinição de senha da sua conta MatchImóveis.</p>
            <p style="font-size:24px;font-weight:bold;background:#f3f4f6;padding:16px;border-radius:8px;text-align:center;letter-spacing:2px">${novaSenha}</p>
            <p>Use essa senha pra entrar e depois troque por uma de sua preferência em <strong>Perfil → Alterar senha</strong>.</p>
            <p style="color:#b45309;background:#fffbeb;padding:12px 16px;border-radius:8px;margin-top:16px">⚠️ Não encontrou esse e-mail na caixa de entrada? Confira a pasta de <strong>spam / lixo eletrônico</strong>.</p>
          </div>`,
          texto: `Sua nova senha: ${novaSenha}. Se não encontrar este email na caixa de entrada, verifique a pasta de spam.`
        }).catch(e => console.error('[esqueci-senha] erro ao enviar email:', e.message));
      }
    }
  } catch (e) {
    console.error('[esqueci-senha]', e.message);
  }
  res.redirect('/?msg=senha_email_enviado');
});

app.get('/entrar', (req,res)=>{ res.redirect('/'); //
});

app.get('/politica-privacidade', (req,res)=>{
  res.render('politica-privacidade');
});

// Descadastro de email — link no rodapé de todo email da plataforma (lead,
// cliente/proprietário e corretor). Um clique já processa (padrão de
// unsubscribe de 1 clique), sem exigir login.
app.get('/email/descadastrar', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim();
    if (email) {
      const { descadastrarEmail } = require('./services/email');
      await descadastrarEmail(email);
    }
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Descadastro de email — MatchImóveis</title>
    <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;background:#f9fafb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;margin:0}
    .card{background:#fff;border-radius:16px;padding:32px;max-width:420px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .icon{font-size:40px;margin-bottom:12px}
    h2{color:#111827;font-size:18px;margin:0 0 8px}
    p{color:#6b7280;font-size:14px;margin:0}</style></head><body>
    <div class="card"><div class="icon">✅</div><h2>Pronto!</h2><p>Você não vai mais receber emails da MatchImóveis neste endereço.</p></div>
    </body></html>`);
  } catch(e) {
    console.error('[email/descadastrar]', e.message);
    res.status(500).send('Erro ao processar. Tente novamente em instantes.');
  }
});

app.get('/termos-de-uso', (req,res)=>{
  res.render('termos-de-uso');
});

// ── OPT-OUT DE E-MAIL — link no rodapé dos e-mails periódicos (resumo,
// indicação, reengajamento). Não fica em coluna própria — vai em
// usuarios.dados (JSONB) via atualizarUsuario, igual outras flags avulsas
// do sistema (ex: onboardingPerfilVisto) ──────────────────────────────────
function _paginaSimples(titulo, corpo) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',-apple-system,sans-serif;background:#FBF9F6;color:#16181A;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
  .box{max-width:440px}.ico{font-size:44px;margin-bottom:16px}h1{font-size:20px;margin-bottom:12px}p{color:#716C61;font-size:14px;line-height:1.6;margin-bottom:20px}
  .btn{display:inline-block;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none}
  .btn-perigo{background:#FF385C;color:#fff}.btn-outline{background:#fff;border:1px solid #E2DBCC;color:#16181A}</style></head>
  <body><div class="box">${corpo}</div></body></html>`;
}

app.get('/email/cancelar', async (req, res) => {
  try {
    const uid = (req.query.u || '').trim();
    const user = (_cacheUsuarios || []).find(u => (u.codigoUsuario || u.codigo_usuario || u.id) === uid);
    if (!uid || !user) return res.status(404).send(_paginaSimples('Link inválido', '<div class="ico">🔗</div><h1>Link inválido</h1><p>Esse link de cancelamento não é válido ou já expirou.</p>'));

    const { atualizarUsuario } = require('./services/salvarUsuario');
    await atualizarUsuario(user.id, { emailOptOut: true });
    if (_cacheUsuarios) { const idx = _cacheUsuarios.findIndex(u => u.id === user.id); if (idx >= 0) _cacheUsuarios[idx].emailOptOut = true; }

    res.send(_paginaSimples('E-mails cancelados', '<div class="ico">✅</div><h1>Pronto, ' + (user.nome || '') + '!</h1><p>Você não vai mais receber os e-mails periódicos do MatchImóveis (resumo da conta, indicação de parceiros e lembretes). Notificações importantes sobre a sua conta continuam chegando no sistema normalmente.</p>'));
  } catch (e) {
    console.error('[email/cancelar]', e.message);
    res.status(500).send(_paginaSimples('Erro', '<div class="ico">⚠️</div><h1>Erro</h1><p>Não conseguimos processar agora. Tenta de novo em alguns minutos.</p>'));
  }
});

// ── EXCLUSÃO DE CONTA — fluxo em 2 cliques (evita disparo por pré-fetch de
// e-mail): 1º link mostra confirmação, 2º de fato cria a solicitação e
// avisa o admin. A exclusão em si (services/salvarImovel etc) só acontece
// quando o admin aprovar manualmente em /admin/exclusao-solicitacoes ──────
app.get('/conta/excluir', async (req, res) => {
  const uid = (req.query.u || '').trim();
  const user = (_cacheUsuarios || []).find(u => (u.codigoUsuario || u.codigo_usuario || u.id) === uid);
  if (!uid || !user) return res.status(404).send(_paginaSimples('Link inválido', '<div class="ico">🔗</div><h1>Link inválido</h1><p>Esse link não é válido ou já expirou.</p>'));
  res.send(_paginaSimples('Excluir conta', '<div class="ico">⚠️</div><h1>Excluir sua conta, ' + (user.nome || '') + '?</h1><p>Isso vai apagar seu cadastro, seus imóveis, leads e visitas do MatchImóveis. <strong>Não pode ser desfeito.</strong> Sua solicitação vai passar por uma confirmação da nossa equipe antes de ser executada.</p><a class="btn btn-perigo" href="/conta/excluir/confirmar?u=' + encodeURIComponent(uid) + '">Sim, quero excluir minha conta</a>'));
});

app.get('/conta/excluir/confirmar', async (req, res) => {
  try {
    const uid = (req.query.u || '').trim();
    const user = (_cacheUsuarios || []).find(u => (u.codigoUsuario || u.codigo_usuario || u.id) === uid);
    if (!uid || !user) return res.status(404).send(_paginaSimples('Link inválido', '<div class="ico">🔗</div><h1>Link inválido</h1><p>Esse link não é válido ou já expirou.</p>'));

    const { query: _qExc } = require('./services/db');
    await _qExc(`CREATE TABLE IF NOT EXISTS solicitacoes_exclusao_conta (
      id SERIAL PRIMARY KEY, user_id TEXT, nome TEXT, email TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW(), atendido BOOLEAN DEFAULT FALSE)`);
    const jaExiste = await _qExc('SELECT id FROM solicitacoes_exclusao_conta WHERE user_id=$1 AND atendido=FALSE', [uid]);
    if (!jaExiste.rows.length) {
      await _qExc('INSERT INTO solicitacoes_exclusao_conta (user_id, nome, email, criado_em) VALUES ($1,$2,$3,NOW())', [uid, user.nome || '', user.email || '']);
      try { require('./services/monitor').enviarAlerta('🗑️ Pedido de exclusão de conta\nCorretor: ' + (user.nome || '') + '\nCódigo: ' + uid + '\nEmail: ' + (user.email || '') + '\n\nRevisar em /admin/exclusao-solicitacoes'); } catch(_) {}
    }

    res.send(_paginaSimples('Solicitação recebida', '<div class="ico">📩</div><h1>Recebemos seu pedido</h1><p>Sua solicitação de exclusão de conta foi registrada. Nossa equipe vai analisar e concluir a exclusão em breve.</p>'));
  } catch (e) {
    console.error('[conta/excluir/confirmar]', e.message);
    res.status(500).send(_paginaSimples('Erro', '<div class="ico">⚠️</div><h1>Erro</h1><p>Não conseguimos registrar seu pedido agora. Tenta de novo em alguns minutos.</p>'));
  }
});


const multer = require('multer');
const upload = multer({ dest: 'uploads/' });


app.get('/api/testar-xml', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.json({ ok: false, erro: 'URL não informada' });
    const https = require('https');
    const http = require('http');
    const client = url.startsWith('https') ? https : http;
    let total = 0, data = '', respondido = false;
    const request = client.get(url, (response) => {
      response.on('data', chunk => {
        data += chunk.toString();
        total = (data.match(/<[Ll]isting[^>]*>/g) || []).length;
        if (total >= 5 && !respondido) {
          respondido = true;
          request.destroy();
          return res.json({ ok: true, total: total + '+' });
        }
      });
      response.on('end', () => {
        if (!respondido) {
          if (total > 0) res.json({ ok: true, total });
          else res.json({ ok: false, erro: 'XML sem imóveis ou formato inválido' });
        }
      });
    });
    request.on('error', err => { if (!respondido) res.json({ ok: false, erro: err.message }); });
    request.setTimeout(15000, () => { request.destroy(); if (!respondido) res.json({ ok: false, erro: 'Timeout' }); });
  } catch (err) {
    res.json({ ok: false, erro: err.message });
  }
});




app.post('/app/importar', auth, upload.any(), async (req, res) => {
  const xmlUrl = req.body.xmlUrl;

  if (!xmlUrl) {
    return res.json({ ok:false, erro:'Informe a URL do XML' });
  }

  // userId só da sessão — antes aceitava req.body.userId/req.query.userId,
  // permitindo importar XML arbitrário pra dentro da conta de QUALQUER
  // corretor sem autenticação nenhuma. Nenhuma chamada legítima no código
  // (app-cadastro.ejs, app-assistente.ejs) manda userId — sempre veio da sessão.
  const _importUserId = req.session.user.id;
  const _importXmlUrl = xmlUrl;
  global.importStatus = {
    status: 'rodando',
    total: 0,
    mensagem: 'Importando XML...'
  };
  global.importUserId = _importUserId;
  global.importXmlUrl = _importXmlUrl;

  res.json({ ok:true, status:'rodando' });

  setTimeout(async () => {
    try {
      const userId = _importUserId || '';
      // créditos de importar_xml são cobrados por imóvel novo dentro do importXMLCompleto.js
      await spawnAsync('node', [path.join(__dirname,'importXMLCompleto.js'), xmlUrl, userId], { env: { ...process.env } });
      const _xmlOutput = '';
      const _importResultLine = (_xmlOutput||'').split('\n').find(l => l.startsWith('IMPORT_RESULT:'));
      const _importResult = _importResultLine ? JSON.parse(_importResultLine.replace('IMPORT_RESULT:','')) : null;
      if (_importResult && _importResult.naoImportados > 0) {
        global.importStatus = { status: 'finalizado_parcial', total: _importResult.importados, naoImportados: _importResult.naoImportados, mensagem: `${_importResult.importados} imóveis importados. ${_importResult.naoImportados} não importados por saldo insuficiente — compre mais créditos.` };
      }

      const fs = require('fs');
      const imoveis = fs.existsSync(dataFile('imoveis.json'))
        ? ((_cacheImoveis || []))
        : [];

      global.importStatus = {
        status: 'finalizado',
        total: imoveis.length,
        mensagem: 'Importação concluída'
      };
      try {
        const users = (_cacheUsuarios || []);
        const idx = users.findIndex(u => u.id === _importUserId);
        if (idx >= 0) {
          users[idx].xmlUrl = _importXmlUrl || users[idx].xmlUrl || '';
      // Adiciona/atualiza no xml_feeds — total = imóveis de fato dessa fonte (não do portfólio todo)
      try {
        const _url = _importXmlUrl;
        const _uid = users[idx].id;
        const { query: _qFeedTotal } = require('./services/db');
        const _rFeedTotal = await _qFeedTotal('SELECT COUNT(*) as n FROM imoveis WHERE user_id=$1 AND xml_url=$2', [_uid, _url]);
        const _feedTotal = parseInt(_rFeedTotal.rows[0]?.n) || 0;
        salvarFeedService({ userId: _uid, url: _url, lastSyncAt: new Date().toISOString(), total: _feedTotal, tipo: 'importado' }).then(() => console.log('[xml-feed] salvo:', _uid, _feedTotal)).catch(e=>console.error('[xml-feed]', e.message));
      } catch(e) { console.error('[xml-feed-total]', e.message); }
          users[idx].xmlAtualizadoEm = new Date().toISOString();
          users[idx].xmlTotal = imoveis.length;
          salvarTodosUsuarios(users).catch(e => console.log("Erro salvar users:", e.message));
        }
      } catch(e) { console.log('Erro ao salvar xmlUrl:', e.message); }

      console.log('Importação concluída:', imoveis.length, 'imóveis');
    } catch (err) {
      global.importStatus = {
        status: 'erro',
        total: 0,
        mensagem: err.message
      };
      console.error('Erro na importação:', err);
    }
  }, 100);
});


app.post('/app/importar-proprietarios', auth, upload.any(), async (req, res) => {
  try {
    const file = (req.files && req.files[0]) || req.file;
    const { execSync } = require('child_process');
    const resultado = execSync('node importarProprietarios.js "' + file.path + '"', { encoding: 'utf8' });
    const match = resultado.match(/CRUZADOS: (d+)/);
    const total = match ? match[1] : '?';
    res.send('<div style="font-family:sans-serif;padding:40px;text-align:center"><h2>✅ ' + total + ' imóveis atualizados com proprietário</h2><a href="/app/imoveis">Ver imóveis</a></div>');
  } catch (err) {
    res.send('Erro: ' + err.message);
  }
});




app.post('/app/assistente/upload', auth, upload.any(), async (req,res)=>{
  try{
    const file = (req.files || [])[0];

    if(!file){
      return res.json({ ok:false, resposta:'❌ Nenhum arquivo enviado.' });
    }

    const nome = (file.originalname || '').toLowerCase();

    if(nome.endsWith('.csv') || nome.endsWith('.xlsx') || nome.endsWith('.xls')){
      const { execSync } = require('child_process');
      const userId = req.session.user ? (req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id) : '';

      const { criarJob: _cjL1 } = require('./services/importJobs');
      const { dispararWorkerLeads: _dwL1 } = require('./services/workerDispatch');
      const _jobIdL1 = await _cjL1('csv', userId, file.path);
      _dwL1(_jobIdL1, file.path, userId);

      // Reprocessar match para leads novas importadas — via import-processor
      setTimeout(async () => {
        try {
          const { lerLeads, atualizarLead } = require('./services/salvarLead');
          const { processarLeadImportada } = require('./cerebro/import-processor');
          const matchCore = require('./cerebro/match-core');
          const _leads = await lerLeads(userId);
          const _novas = _leads.filter(l => !l.matches?.length && !l.matchesAuto?.length && l.perfilIA?.tipo && l.perfilIA?.bairro && l.perfilIA?.intencao && l.perfilIA?.valorMax);
          console.log(`[import-match] ${_novas.length} leads para processar`);
          for (const _lead of _novas) {
            try {
              const _mapa = await processarLeadImportada(_lead);
              if (!_mapa) continue;
              _lead.mapaIntencao = _mapa;
              // Garantir nome e telefone antes de processar
              const _nomeOrig = _lead.nome || '';
              const _telOrig = _lead.telefone || _lead.contato || '';
              // Setar fase/temperatura antes de processar
              // Não regride fase do funil
              const _ordemFases = ['novo','qualificando','match','vitrine_enviada','visitou','proposta','fechado'];
              const _faseAtual = _lead.faseFunil || 'novo';
              const _faseNova = _mapa.fase || 'qualificando';
              const _iAtual = _ordemFases.indexOf(_faseAtual);
              const _iNova = _ordemFases.indexOf(_faseNova);
              _lead.faseFunil = _iNova > _iAtual ? _faseNova : _faseAtual;
              _lead.temperatura = _mapa.temperatura || 'morno';
              _lead.mapaIntencao = _mapa;
              await atualizarLead(_lead.id, { mapaIntencao: _mapa, faseFunil: _lead.faseFunil, temperatura: _lead.temperatura });
              await matchCore.processar({ lead: { ..._lead, nome: _nomeOrig, telefone: _telOrig, contato: _telOrig, whatsapp: _telOrig, faseFunil: _lead.faseFunil, temperatura: _lead.temperatura }, mensagem: '', canal: 'importacao', userId, instancia: null });
              console.log(`[import-match] ✅ ${_lead.nome||_lead.id}`);
            } catch(e) { console.error('[import-match]', _lead.id, e.message); }
          }
        } catch(e) { console.error('[import-match]', e.message); }
      }, 5000);

      return res.json({
        ok:true,
        resposta:'✅ Planilha de leads importada com sucesso. Acesse Leads para conferir.'
      });
    }

    if(nome.endsWith('.xml')){
      return res.json({
        ok:false,
        resposta:'📥 Para importar XML de imóveis, envie a URL do feed XML no chat.'
      });
    }

    return res.json({
      ok:false,
      resposta:'❌ Formato não suportado. Envie CSV, XLS ou XLSX para leads.'
    });

  }catch(e){
    return res.json({
      ok:false,
      resposta:'❌ Erro ao importar arquivo: '+e.message
    });
  }
});

app.post('/app/leads', auth, upload.any(), async (req, res) => {
  try {
    const file = (req.files && req.files[0]) || req.file;
    if (!file) return res.send("Envie o arquivo");


    const { execSync } = require("child_process");

    const userId = req.session.user ? (req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id) : ""; const { criarJob: _cjL2 } = require('./services/importJobs');
    const { dispararWorkerLeads: _dwL2 } = require('./services/workerDispatch');
    const _jobIdL2 = await _cjL2('csv', userId, file.path);
    _dwL2(_jobIdL2, file.path, userId);
    // Nota: importar_lead já é cobrado dentro de processLeads.js (uma vez por lead
    // nova de verdade, deduplicada) — o worker roda esse script via execSync.

    // Reprocessar match — igual à rota /app/lead/:id/perfil
    setImmediate(async () => {
      try {
        const { lerLeads } = require('./services/salvarLead');
        const matchCore = require('./cerebro/match-core');
        const _leads = await lerLeads(userId);
        const _novas = _leads.filter(l => !l.matches?.length && !l.matchesAuto?.length && l.perfilIA?.tipo && l.perfilIA?.bairro && l.perfilIA?.intencao && l.perfilIA?.valorMax);
        console.log(`[import-match2] ${_novas.length} leads | userId: ${userId}`);
        for (const _lead of _novas) {
          try {
            const _msgImport = `${_lead.perfilIA?.tipo||''} ${_lead.perfilIA?.intencao||''} ${_lead.perfilIA?.cidade||''} ${_lead.perfilIA?.bairro||''} ${_lead.perfilIA?.quartos||''} quartos ${_lead.perfilIA?.valorMax||''} reais`.trim();
            await matchCore.processar({ lead: { ..._lead, perfilIA: _lead.perfilIA }, mensagem: _msgImport, canal: 'manual', userId: _lead.userId || _lead.codigoUsuario || userId });
            console.log(`[import-match2] ✅ ${_lead.nome||_lead.id}`);
          } catch(e) { console.error('[import-match2]', _lead.id, e.message); }
        }
      } catch(e) { console.error('[import-match2]', e.message); }
    });

    return res.redirect("/app/leads?jobId="+_jobIdL2);

  } catch (err) {
    return res.send("Erro: " + err.message);
  }
});

// CADASTRAR LEAD MANUAL (pelo chat ou formulário)
app.post("/app/leads/manual", auth, checarSaldo("Cadastrar lead manual", 20), async (req, res) => {
try {
const fs = require("fs");
const { resolverUsuario } = require("./services/usuarios/resolverUsuario");
const { resolverDestinoVisita } = require("./services/visita/resolverDestinoVisita");
const { nome, tipo, bairro, cidade, estado, valor_imovel, quartos, suites, vagas, area_m2, tipo_operacao } = req.body; const contato = req.body.contato || req.body.celular;
if (!nome || !contato) return res.json({ ok: false, erro: "Nome e contato são obrigatórios" });
const data = (_cacheLeads || []);
const userId = req.session.user.id;
const novoLead = {
nome: nome.trim(),
contato: _normTel(contato),
telefone: _normTel(contato),
whatsapp: _normTel(contato),
tipo: tipo || "",
tipo_operacao: tipo_operacao || "",
bairro: bairro || "",
cidade: cidade || "",
estado: estado || "",
valor_imovel: Number(valor_imovel) || 0,
quartos: Number(quartos) || 0,
suites: Number(suites) || 0,
vagas: Number(vagas) || 0,
area_m2: Number(area_m2) || 0,
id: Date.now().toString(),
createdAt: new Date().toISOString(),
userId,
usuarioId: userId,
corretorId: userId,
matchCount: 0,
matchesBase: [],
matchCountBase: 0,
indisponivel: false,
status: "novo"
};
data.push(novoLead);
salvarTodosLeads(data).catch(e=>console.error("[leads]",e.message));
console.log('[lead-manual] userId para consumir:', userId, '| session.user:', JSON.stringify(req.session.user?.id), req.session.user?.codigoUsuario);
consumir(userId, 'nova_lead').then(r => console.log('[lead-manual] consumir resultado:', r)).catch(e => console.error('[lead-manual] consumir ERRO:', e.message));
res.json({ ok: true, lead: novoLead });
} catch(e) {
res.json({ ok: false, erro: e.message });
}
});

//
////app.get('/app/portais', (req,res)=>{
//  const portais = JSON.parse(require('fs').readFileSync('portais.json','utf8'));
//  res.render('app-portais', { user: req.session.user,  portais });
//});

// Rota legada — o /app/portais real (GET, linha ~9106) usa xml_feeds no PG,
// nem lê esse portais.json. Mantida (não removida) por precaução, mas sem
// auth qualquer requisição reescrevia esse arquivo único compartilhado.
app.post('/app/portais', auth, async (req,res)=>{
  const ativos = [].concat(req.body.portais || []);
  const all = ['zap','vivareal','olx','imovelweb','chavesnamao','123i'];

  const config = {};
  all.forEach(p=>{
    config[p] = ativos.includes(p);
  });

  require('fs').writeFileSync(dataFile('portais.json'), JSON.stringify(config,null,2));

  res.redirect('/app/portais');
});

app.get('/feed/:portal', (req,res)=>{
  // Antes rodava `execSync('node exportXML.js ' + portal)` com o valor da URL
  // direto no shell — command injection não autenticado (o script nem existe
  // mais no repo, mas o injection continuava válido). O arquivo já é gerado
  // por /app/gerar-xml; aqui só serve o que já existe em disco, igual a
  // /feed-:portal.xml (rota irmã, mesmo propósito, já sem exec).
  const portal = req.params.portal;
  if (!/^[a-z0-9_-]+$/i.test(portal)) return res.status(400).send('Portal inválido');
  const file = dataPath(`feed-${portal}.xml`);
  if (!fs.existsSync(file)) return res.status(404).send('XML não encontrado');
  res.set('Content-Type', 'application/xml');
  res.send(fs.readFileSync(file, 'utf8'));
});


// Cadastro secreto
app.get('/cadastro-secreto', (req,res)=>{
  if((req.query.token||'') !== 'match2025') return res.status(403).send('Acesso negado');
  res.send('<html><head><meta charset="UTF-8"><title>Nova Conta</title></head><body style="font-family:Arial;max-width:420px;margin:60px auto;padding:20px"><h2 style="color:#ff385c">Nova Conta</h2><form method="POST" action="/cadastro-secreto?token=match2025"><p><input name="nome" placeholder="Nome" required style="width:100%;padding:10px;margin:5px 0;border:1px solid #ddd;border-radius:8px"></p><p><input name="telefone" placeholder="Telefone" required style="width:100%;padding:10px;margin:5px 0;border:1px solid #ddd;border-radius:8px"></p><p><input name="senha" type="password" placeholder="Senha" required style="width:100%;padding:10px;margin:5px 0;border:1px solid #ddd;border-radius:8px"></p><p><select name="tipoConta" style="width:100%;padding:10px;margin:5px 0;border:1px solid #ddd;border-radius:8px"><option value="imobiliaria">Imobiliaria</option><option value="corretor">Corretor</option></select></p><p><button type="submit" style="width:100%;padding:12px;background:#ff385c;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer">Criar Conta</button></p></form></body></html>');
});
app.post('/cadastro-secreto', async (req,res)=>{ return res.redirect('/'); // CADASTROS DESATIVADOS
  if((req.query.token||'') !== 'match2025') return res.status(403).send('Acesso negado');
  const {nome,telefone,senha,tipoConta} = req.body;
  const users = fs.existsSync(dataPath('users.json')) ? (_cacheUsuarios || []) : [];
  const prefixo = tipoConta==='imobiliaria' ? 'imob' : tipoConta==='corretor' ? 'cor' : 'usr';
  const uid = prefixo+'_'+Math.random().toString(36).substring(2,8)+Date.now().toString(36).slice(-4);
  const codigo = (nome||'USR').substring(0,3).toUpperCase()+'-'+Math.floor(1000+Math.random()*9000);
  users.push({id:uid,nome,telefone,celular:telefone,senha,tipo:tipoConta||'corretor',ativo:true,codigoUsuario:codigo,matchCoins:1000,matchCoinsTotal:1000,matchCoinsBonusInicial:1000});
  salvarTodosUsuarios(users).catch(e=>console.error("[users]",e.message));
  res.send('<h2 style="color:green;font-family:Arial">Conta criada!</h2><p>ID: '+uid+'</p><p>Codigo: '+codigo+'</p><a href="/login">Ir para login</a>');
});

// rota /login removida

// Botão de URL do template de disparo "leads garantidos" — clicou, já cria a
// conta (ou loga se já existir pelo telefone) e manda direto pro perfil
// completar os dados. contatoId é o uuid da linha em disparos_contatos (não
// usa telefone cru na URL, cada link só serve pra quem recebeu aquele disparo).
// Botão de URL dinâmica de template do WhatsApp: em vez de substituir o
// "{{1}}" configurado no botão pelo valor mandado na API, a Meta mantém o
// "{{1}}" literal e cola o valor logo em seguida (ex: "{{1}}abc123") — bug/
// comportamento observado na prática, contrário ao que a doc sugere. Em vez
// de reeditar o template (perde a aprovação, entra na fila de novo), o
// servidor já tolera esse prefixo em qualquer rota alimentada por botão
// dinâmico.
function _limparParamBotaoUrl(valor) {
  const v = String(valor || '');
  return v.startsWith('{{1}}') ? v.slice(5) : v;
}

app.get('/entrar/:contatoId', async (req, res) => {
  try {
    const { buscarContato, marcarContato } = require('./services/salvarDisparo');
    const contato = await buscarContato(_limparParamBotaoUrl(req.params.contatoId));
    if (!contato) {
      console.warn('[ENTRAR] contatoId não encontrado:', JSON.stringify(req.params.contatoId));
      return res.redirect('/');
    }

    // contato.telefone vem normalizado com "55" na frente (formato de envio do
    // WhatsApp) — mas o resto da plataforma guarda telefone/celular sem DDI,
    // então tira aqui antes de comparar/gravar (senão nunca acha usuário já
    // cadastrado, e conta nova salva com o 55 grudado no número).
    let telefone = String(contato.telefone || '').replace(/\D/g,'');
    if (telefone.startsWith('55') && telefone.length >= 12) telefone = telefone.slice(2);
    const { lerUsuarios: _luEntrar, salvarUsuario: _salvarEntrar } = require('./services/salvarUsuario');
    const users = await _luEntrar();
    let user = users.find(u => String(u.telefone || u.celular || '').replace(/\D/g,'') === telefone);

    if (!user) {
      const codigo = gerarCodigoUsuario(contato.nome || 'USR');
      const _charsSenha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let senhaGerada = '';
      for (let i=0; i<6; i++) senhaGerada += _charsSenha[Math.floor(Math.random()*_charsSenha.length)];
      const senhaHash = await bcrypt.hash(senhaGerada, 10);
      user = {
        id: codigo,
        nome: contato.nome || '',
        telefone, celular: telefone,
        email: '', tipo: 'corretor', ativo: true,
        codigoUsuario: codigo, senha: senhaHash,
        matchCoins: 1000, matchCoinsTotal: 1000, matchCoinsBonusInicial: 1000,
        origemCadastro: 'campanha_leads_garantidos',
        // Nome vindo da planilha é só provisório (ex: "Teste 1") — obriga
        // trocar por um nome de verdade, junto com e-mail e localização,
        // antes de liberar o resto da plataforma (ver middleware mais abaixo).
        precisaCompletarPerfil: true,
        nomeImportado: contato.nome || '',
        // Os 1.000 créditos de bônus são só pra poder mexer no sistema e ver
        // o valor — não substituem a compra. Só libera o resto da plataforma
        // depois de contratar um dos combos (ver middleware precisaComprarPlano).
        precisaComprarPlano: true
      };
      await _salvarEntrar(user);
      req.session.senhaInicialTemp = senhaGerada;
      console.log('[ENTRAR] conta criada via campanha de leads garantidos:', codigo, '| tel:', telefone);
      (async () => {
        try {
          const _msgAdmin = `🆕 *Novo usuário via campanha de leads garantidos!*\n\n👤 *Nome:* ${user.nome}\n📱 *Telefone:* ${telefone}\n🔑 *Código:* ${codigo}\n⏰ ${new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`;
          await fetch('https://match-evolution-api.onrender.com/message/sendText/match-suporte', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': 'match2025evolution' },
            body: JSON.stringify({ number: '5511951131609', text: _msgAdmin })
          });
        } catch(e) { console.error('[ENTRAR] erro notif admin:', e.message); }
      })();
      marcarContato(contato.id, { status: 'convertido' }).catch(()=>{});
    } else {
      marcarContato(contato.id, { status: 'convertido' }).catch(()=>{});
    }

    req.session.user = user;
    res.redirect('/app/perfil?bemvindo=1');
  } catch(e) {
    console.error('[ENTRAR] erro:', e.message);
    res.redirect('/');
  }
});

app.post('/login', async (req,res)=>{
  const { lerUsuarios: _luLogin } = require('./services/salvarUsuario');
  const users = await _luLogin();

  const telefone = String(req.body.telefone || '').replace(/\D/g,'');

  // CADASTRO
  if(req.body.nome && req.body.tipoConta){
    // Validação backend
    const nomeVal = (req.body.nome||'').trim();
    if (!nomeVal || nomeVal.length < 3) return res.render('login', { error: 'Nome inválido. Digite seu nome completo.' });
    if (!telefone || telefone.length < 10 || telefone.length > 13) return res.render('login', { error: 'Telefone inválido. Use o formato: 47999999999' });
    const existe = users.find(u => String(u.telefone || u.celular || '').replace(/\D/g,'') === telefone);
    if(existe) return res.redirect('/?erro=celular_existente');
    const _emailNovo = (req.body.email || '').trim().toLowerCase();
    if(_emailNovo){
      const existeEmail = users.find(u => (u.email||'').trim().toLowerCase() === _emailNovo);
      if(existeEmail) return res.redirect('/?erro=email_existente');
    }

    const prefixo = req.body.tipoConta === 'imobiliaria' ? 'imob' : req.body.tipoConta === 'corretor' ? 'cor' : 'usr';
    const uid = prefixo + '_' + Math.random().toString(36).substring(2,8) + Date.now().toString(36).slice(-4);
    const _codigoNovo = gerarCodigoUsuario(req.body.nome);

    // Indicação — grava só se o código informado corresponder a uma conta real existente
    const _refCode = String(req.body.indicadoPor || '').trim();
    const _indicador = _refCode ? users.find(u => (u.codigoUsuario || u.id) === _refCode) : null;

    // Hash da senha no cadastro — antes gravava em texto puro (só virava bcrypt
    // se o usuário trocasse a senha depois em /app/perfil/senha). Vazio fica
    // vazio de propósito: mantém o fluxo de "login sem senha" (telefone só)
    // pra quem se cadastra sem definir uma.
    const _senhaCadastro = (req.body.senha || '').trim();
    const _senhaCadastroHash = _senhaCadastro ? await bcrypt.hash(_senhaCadastro, 10) : '';

    const novo = {
      id: _codigoNovo,
      nome: req.body.nome,
      telefone,
      celular: telefone,
      email: req.body.email || '',
      tipo: req.body.tipoConta,
      ativo: true,
      codigoUsuario: _codigoNovo,
      senha: _senhaCadastroHash,
      matchCoins: 1000,
      matchCoinsTotal: 1000,
      matchCoinsBonusInicial: 1000,
      indicadoPor: _indicador ? (_indicador.codigoUsuario || _indicador.id) : ''
    };

    users.push(novo);
    salvarTodosUsuarios(users).catch(e=>console.error("[users]",e.message));

    // Notificar admin sobre novo cadastro
    (async () => {
      try {
        const _telNovo = (novo.telefone||novo.celular||'').replace(/\D/g,'');
        const _msgAdmin = `🆕 *Novo usuário cadastrado!*\n\n👤 *Nome:* ${novo.nome}\n📱 *Telefone:* ${_telNovo}\n🏷 *Tipo:* ${novo.tipo}\n🔑 *Código:* ${novo.codigoUsuario}\n⏰ ${new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}\n\n💬 Falar agora: https://wa.me/55${_telNovo}`;
        await fetch('https://match-evolution-api.onrender.com/message/sendText/match-suporte', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': 'match2025evolution' },
          body: JSON.stringify({ number: '5511951131609', text: _msgAdmin })
        }).catch(()=>{});

        // Onboarding — 6 passos reais (mesmos do GET /api/onboarding/status)
        const _telCorretor = '55' + (novo.telefone||novo.celular||'').replace(/\D/g,'');
        const _msgOnboarding = `Olá, ${novo.nome}! 👋 Seja bem-vindo ao *MatchImóveis*!\n\nSeus primeiros passos:\n\n📋 Importar XML de imóveis (ou cadastrar manualmente) — Menu → Imóveis\n📱 Conectar seu WhatsApp — Menu → Perfil\n📸 Conectar seu Instagram — Menu → Perfil\n🎯 Cadastrar uma lead manual — Menu → Leads\n🤖 Tirar uma dúvida com o Assistente IA — Menu → Assistente\n👤 Conhecer sua área de Perfil\n\nQuanto mais passos completos, mais o sistema trabalha por você — matches e vitrines automáticas!\n\n💡 Qualquer dúvida, é só abrir o *Assistente* no menu lateral, ele responde na hora.\n\n🔗 Acesse o sistema: https://matchimoveis.ia.br`;

        await fetch('https://match-evolution-api.onrender.com/message/sendText/match-suporte', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': 'match2025evolution' },
          body: JSON.stringify({ number: _telCorretor, text: _msgOnboarding })
        }).catch(()=>{});
      } catch(_e) { console.error('[notif-cadastro]', _e.message); }
    })();

    // Email de boas-vindas
    if (novo.email) {
      try {
        const { enviarEmail } = require('./services/email');
        await enviarEmail({
          para: novo.email,
          assunto: '👋 Bem-vindo ao MatchImóveis!',
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px"><h2 style="color:#FF385C">Olá, ${novo.nome}! 👋</h2><p>Seja bem-vindo ao <strong>MatchImóveis</strong>. Seus primeiros passos:</p><ul style="padding-left:20px;line-height:1.9"><li>📋 Importar XML de imóveis (ou cadastrar manualmente) — Menu → Imóveis</li><li>📱 Conectar seu WhatsApp — Menu → Perfil</li><li>📸 Conectar seu Instagram — Menu → Perfil</li><li>🎯 Cadastrar uma lead manual — Menu → Leads</li><li>🤖 Tirar uma dúvida com o Assistente IA — Menu → Assistente</li><li>👤 Conhecer sua área de Perfil</li></ul><p>Você recebe um email a cada passo concluído, com o que ainda falta.</p><a href="https://matchimoveis.ia.br" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Acessar o sistema →</a></div>`,
          texto: 'Bem-vindo ao MatchImóveis! Acesse: https://matchimoveis.ia.br'
        });
        console.log('[EMAIL] boas-vindas enviado para:', novo.email);
      } catch(_eEmail) { console.error('[EMAIL] erro:', _eEmail.message); }
    }

    req.session.user = novo;
    const _uaN = req.headers['user-agent']||'';
    return res.redirect(/Mobile|Android|iPhone|iPad/i.test(_uaN) ? '/app/feed' : '/app-home');
  }

  // LOGIN SEM SENHA
  const user = users.find(u => String(u.telefone || u.celular || '').replace(/\D/g,'') === telefone);

  if(!user) return res.redirect('/?error=nao_cadastrado');

  const _senhaSalva = (user.senha || '').trim();
  const _senhaInformada = (req.body.senha || '').trim();
  if (_senhaSalva) {
    const _senhaValida = _senhaSalva.startsWith('$2b$') ? await bcrypt.compare(_senhaInformada, _senhaSalva) : _senhaInformada === _senhaSalva;
    if (!_senhaValida) {
      await _registrarLoginFalho(req, (req.body.email || req.body.usuario || '').trim());
      return res.redirect('/?erro=senha_incorreta');
    }
  }

  req.session.user = user;
  const { query: _qlg } = require('./services/db');
  _qlg('UPDATE usuarios SET ultimo_acesso=$1 WHERE codigo_usuario=$2', [new Date().toISOString(), user.codigoUsuario||user.codigo||user.id]).catch(()=>{});
  const _uaL = req.headers['user-agent']||'';
  res.redirect(/Mobile|Android|iPhone|iPad/i.test(_uaL) ? '/app/feed' : '/app-home');
});










// ===== ROTAS APP UX NOVO =====




// rota importar leads removida para correção



// ===== REGRA PRIVACIDADE PROPRIETARIO =====
// IMPORTANTE:
// proprietario_nome, proprietario_whatsapp, proprietario_email e proprietario_doc
// só podem ser exibidos quando imovel.corretorId === usuarioLogado.id.
// Em carteiras compartilhadas, matches, outros corretores e usuários externos,
// esses campos devem ser ocultados.


// ===== LEADS + MATCH + OFERTA CLIENTE =====
async function carregarLeads(){
  try { const r = await _qL('SELECT dados FROM leads ORDER BY criado_em DESC'); return r.rows.map(r=>r.dados); } catch(e) { console.error('[carregarLeads]',e.message); return []; }
}

async function salvarLeads(leads){
  const fs = require('fs');
  salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));
}

// ── HELPERS_CENTRALIZADOS ─────────────────────────────────────────────────────
async function lerLeadsData() {
  try { const { query: _qLD } = require('./services/db'); const r = await _qLD('SELECT *, dados, follow_ups, vitrine_enviada, vitrine_enviada_em, matches, matches_auto, id, nome, telefone, whatsapp, contato, user_id, codigo_usuario, score, temperatura, fase_funil, perfil_ia, status, tipo_lead, historico, timeline, eventos, comportamento, mapa_intencao FROM leads ORDER BY criado_em DESC'); return r.rows.filter(r=>r.fase_funil!=='captacao'&&r.status!=='captacao').map(r=>({ ...(r.dados||{}), id: r.id, nome: r.nome, telefone: r.telefone, whatsapp: r.whatsapp, contato: r.contato, userId: r.user_id, codigoUsuario: r.codigo_usuario, followUps: r.follow_ups||[], vitrineEnviada: r.vitrine_enviada, vitrineEnviadaEm: r.vitrine_enviada_em, matches: r.matches||[], matchesAuto: (r.matches_auto && r.matches_auto.length) ? r.matches_auto : (r.matches||[]), score: r.score || (r.dados||{}).score || 0, temperatura: r.temperatura || (r.dados||{}).temperatura || 'frio', faseFunil: r.fase_funil || (r.dados||{}).faseFunil || 'novo', status: r.status || (r.dados||{}).status || 'novo', perfilIA: r.perfil_ia || (r.dados||{}).perfilIA || {}, mapaIntencao: r.mapa_intencao || (r.dados||{}).mapaIntencao || null, comportamento: r.comportamento || (r.dados||{}).comportamento || null, historico: r.historico || (r.dados||{}).historico || [], timeline: r.timeline || (r.dados||{}).timeline || [], eventos: r.eventos || (r.dados||{}).eventos || [] })); } catch(e) { console.error('[lerLeadsData]',e.message); return []; }
}

async function salvarLeadsData(leads) {
  try {
    salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));
  } catch(e) { console.error('[salvarLeadsData]', e.message); }
}

async function lerVisitasData() {
  try { const { query: _qV } = require('./services/db'); const r = await _qV('SELECT dados, imovel_id, imovel_bairro, status, data_visita, hora_visita, user_id, corretor_id, owner_user_id, lead_id, nome, telefone, imovel_titulo FROM visitas ORDER BY criado_em DESC'); return r.rows.map(r=>({...r.dados, imovelId: r.dados.imovelId||r.imovel_id, imovelBairro: r.dados.imovelBairro||r.imovel_bairro, imovelTitulo: r.dados.imovelTitulo||r.imovel_titulo||'', status: r.dados.status||r.status, dataVisita: r.dados.dataVisita||r.data_visita, horaVisita: r.dados.horaVisita||r.hora_visita||'', userId: r.dados.userId||r.user_id||'', corretorId: r.dados.corretorId||r.corretor_id||'', leadOwnerId: r.dados.leadOwnerId||r.owner_user_id||'', leadId: r.dados.leadId||r.lead_id||'', nome: r.dados.nome||r.nome||'', telefone: r.dados.telefone||r.telefone||''})); } catch(e) { console.error('[lerVisitasData]',e.message); return []; }
}

async function salvarVisitasData(visitas) {
  try {
    salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));
  } catch(e) { console.error('[salvarVisitasData]', e.message); }
}

async function atualizarLead(id, campos) {
  const leads = await lerLeadsData();
  const idx = leads.findIndex(l => String(l.id) === String(id));
  if (idx < 0) return null;
  leads[idx] = { ...leads[idx], ...campos };
  salvarLeadsData(leads);
  return leads[idx];
}

async function atualizarVisita(id, campos) {
  const visitas = await lerVisitasData();
  const idx = visitas.findIndex(v => String(v.id) === String(id));
  if (idx < 0) return null;
  visitas[idx] = { ...visitas[idx], ...campos };
  salvarVisitasData(visitas);
  return visitas[idx];
}

async function criarLead(payload) {
  const leads = await lerLeadsData();
  const novo = { id: Date.now().toString(), criadoEm: new Date().toISOString(), ...payload };
  leads.push(novo);
  salvarLeadsData(leads);
  // Cobra 10 créditos por nova lead
  const _userId = payload.userId || payload.corretorId || payload.usuarioDestinoId || '';
  if (_userId) consumir(_userId, 'nova_lead').catch(()=>{});
  return novo;
}

async function criarVisita(payload) {
  const visitas = await lerVisitasData();
  const nova = { id: Date.now().toString(), criadoEm: new Date().toISOString(), ...payload };
  visitas.push(nova);
  salvarVisitasData(visitas);
  return nova;
}
// ── FIM HELPERS_CENTRALIZADOS ─────────────────────────────────────────────────

function marcarEtapaLead(lead, etapa){
  lead.etapaAtual = etapa;
  lead.jornada = lead.jornada || [];
  const atual = lead.jornada.find(j => j.etapa === etapa);
  if(atual){ atual.feito = true; atual.data = new Date().toISOString(); }
  else lead.jornada.push({ etapa, feito:true, data:new Date().toISOString() });
}

// Acumula (sem duplicar) os imóveis que a lead clicou "Gostei" — usado tanto
// pela vitrine (/cliente/oferta) quanto pela página pública do imóvel (/imovel/:id)
function _registrarGostei(lead, imovelObj) {
  if (!imovelObj) return;
  const chave = String(imovelObj.idExterno || imovelObj.idInterno || imovelObj.id || '');
  if (!chave) return;
  if (!lead.imoveisGostei) lead.imoveisGostei = [];
  const jaTem = lead.imoveisGostei.some(g => String(g.idExterno||g.idInterno||g.id||'') === chave);
  if (jaTem) return;
  lead.imoveisGostei.push({
    id: imovelObj.id || imovelObj.idInterno || imovelObj.idExterno || '',
    idExterno: imovelObj.idExterno || '',
    idInterno: imovelObj.idInterno || '',
    titulo: imovelObj.titulo || imovelObj.tipo || 'Imóvel',
    bairro: imovelObj.bairro || '',
    cidade: imovelObj.cidade || '',
    valor_imovel: imovelObj.valor_imovel || imovelObj.valor || 0,
    foto: (imovelObj.fotos && imovelObj.fotos[0]) || '',
    userId: imovelObj.userId || imovelObj.user_id || imovelObj.usuarioId || imovelObj.codigoUsuario || '',
    clicadoEm: new Date().toISOString()
  });
  const _uidGostei = lead.userId || lead.codigoUsuario || lead.user_id || '';
  const _tituloGostei = imovelObj.titulo || imovelObj.tipo || 'imóvel';
  try {
    criarNotificacaoService({
      id: Date.now().toString() + '_gostei',
      tipo: 'lead_gostei',
      titulo: 'Lead curtiu um imóvel',
      mensagem: (lead.nome || 'Lead') + ' clicou "Gostei" em ' + _tituloGostei,
      usuarioId: _uidGostei,
      leadId: lead.id || lead.leadId || '',
      imovelId: chave,
      lida: false,
      criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
    });
  } catch(e) { console.error('[notif gostei]', e.message); }
}

app.get('/cliente/oferta/:leadId', (req,res)=>{
  const leads = (_cacheLeads || []);
  const userIdOferta = req.query.userId || req.query.uid || '';

  let lead = null;

  if (userIdOferta) {
    lead = leads.find(l =>
      String(l.id || l.leadId || '') === String(req.params.leadId) &&
      String(l.userId || l.usuarioId || l.corretorId || '') === String(userIdOferta)
    );
  }

  if (!lead) {
    lead = leads.find(l => String(l.id || l.leadId || '') === String(req.params.leadId));
  }

  if(!lead) return res.status(404).send('Lead não encontrado');

  lead.matches = ((lead.matchesBase && lead.matchesBase.length ? lead.matchesBase : null) ||
               (lead.matchesAuto && lead.matchesAuto.length ? lead.matchesAuto : null) ||
               (lead.matches && lead.matches.length ? lead.matches : null) || []).slice(0, 9); // vitrine: máximo de 9 imóveis (já vêm ordenados por score)
  
  // Marca vitrine como visualizada
  const idxLead = leads.findIndex(l => String(l.id||l.leadId||'') === String(req.params.leadId));
  if (idxLead >= 0) {
    leads[idxLead].vitrineVisualizada = true;
    leads[idxLead].vitrineVisualizadaEm = new Date().toISOString();
    if (false && !leads[idxLead].vitrineEnviada) {
      leads[idxLead].vitrineEnviada = true;
      leads[idxLead].vitrineEnviadaEm = new Date().toISOString();
    }
    lead = leads[idxLead];
  }
  registrarHistoricoImovelLead(lead, 'visualizou_vitrine', lead);
  salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));
  const _usersMapVitrine = {}; (_cacheUsuarios||[]).forEach(function(u){ _usersMapVitrine[u.codigo_usuario||u.codigoUsuario||u.id] = u.nome||u.name||''; });
  res.render('cliente-oferta', {
    user: null,
    lead,
    matchesParceiro: lead.matchesQuintoAndar || [],
    queryUserId: userIdOferta || lead.userId || lead.usuarioId || lead.corretorId || '',
    usersMap: _usersMapVitrine
  });
});

app.get('/cliente/oferta/:leadId/escolher/:idx', (req,res)=>{
  const leads = (_cacheLeads || []);
  const lead = leads.find(l => (l.id || l.leadId) === req.params.leadId);
  if(!lead) return res.status(404).send('Lead não encontrado');
  const idx = Number(req.params.idx);
  lead.imovelEscolhido = lead.matches && lead.matches[idx] ? lead.matches[idx] : null;
  _registrarGostei(lead, lead.imovelEscolhido);
  salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));
  res.redirect('/cliente/oferta/'+req.params.leadId);
});

// "Gostei" clicado na página pública do imóvel (/imovel/:id) — usa o mesmo
// acumulador da vitrine. imovelId aceita id/idExterno/idInterno/codigoImovel.
app.get('/cliente/gostei/:leadId/:imovelId', (req,res)=>{
  const leads = (_cacheLeads || []);
  const lead = leads.find(l => String(l.id||l.leadId||'') === String(req.params.leadId));
  if (lead) {
    const pid = req.params.imovelId;
    const imoveis = (_cacheImoveis || []);
    let imovelObj = imoveis.find(i => String(i.idExterno)===pid || String(i.idInterno)===pid || String(i.id)===pid || String(i.codigoImovel)===pid);
    if (!imovelObj) {
      const todosMatches = [...(lead.matches||[]), ...(lead.matchesBase||[]), ...(lead.matchesAuto||[])];
      imovelObj = todosMatches.find(m => String(m.idExterno)===pid || String(m.idInterno)===pid || String(m.id)===pid) || null;
    }
    _registrarGostei(lead, imovelObj);
    salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));
  }
  res.redirect(req.query.voltar || ('/cliente/oferta/'+req.params.leadId));
});

app.get('/cliente/oferta/:leadId/visita/:idx', (req,res)=>{
  const leads = (_cacheLeads || []);
  const lead = leads.find(l => (l.id || l.leadId) === req.params.leadId);
  if(!lead) return res.status(404).send('Lead não encontrado');
  const idx = Number(req.params.idx);
  const matchesDisp = lead.matchesBase || lead.matches || [];
  lead.imovelVisita = matchesDisp[idx] || null;
  lead.visitaSolicitadaEm = new Date().toISOString();
  registrarHistoricoImovelLead(lead, 'visita_solicitada', lead.imovelVisita);
  salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));

  // Gravar em visitas.json vinculado ao dono da lead
  const imovel = lead.imovelVisita || {};
  // Busca proprietario no imoveis.json
  const imoveisBase = fs.existsSync(dataFile('imoveis.json')) ? ((_cacheImoveis || [])) : [];
  const imovelBase = imoveisBase.find(i => String(i.idExterno||i.id) === String(imovel.idExterno||imovel.id||imovel.id_anuncio||''));
  const proprietario = imovelBase ? (imovelBase.proprietario || {}) : (imovel.proprietario || {});
  const userFinal = user || { id: "TESTE-LOCAL", nome: "Usuário Teste", celular: "11999999999", telefone: "11999999999" };

  const novaVisita = {
    id: Date.now().toString(),
    leadId: lead.id || lead.leadId,
    nome: lead.nome || lead.name || '',
    telefone: lead.telefone || lead.phone || '',
    contato: lead.telefone || lead.phone || '',
    imovelId: imovel.id || imovel.codigo || '',
    imovelTitulo: imovel.titulo || imovel.title || '',
    imovelBairro: imovel.bairro || '',
    imovelCidade: imovel.cidade || '',
    imovelEstado: imovel.estado || '',
    usuarioDestinoId: lead.usuarioDestinoId || lead.userId || lead.codigoUsuario || '',
    userId: lead.userId || lead.codigoUsuario || '',
    corretorId: lead.userId || lead.codigoUsuario || '',
    proprietarioNome: proprietario.nome || '',
    proprietarioTelefone: (proprietario.telefone || proprietario.celular || '').replace(/\D/g,''),
    imovelUsuarioId: imovelBase ? (imovelBase.user_id || imovelBase.userId || imovelBase.usuarioId || '') : '',
    imovelUsuarioNome: (() => {
      const _imOwnerId = imovelBase ? (imovelBase.user_id || imovelBase.userId || imovelBase.usuarioId || '') : '';
      const _imOwner = (_cacheUsuarios||[]).find(u => (u.codigo_usuario||u.codigoUsuario||u.codigo||u.id) === _imOwnerId);
      return _imOwner ? (_imOwner.nome||'') : (imovelBase ? (imovelBase.fonte||'') : '');
    })(),
    imovelUsuarioTelefone: (() => {
      const _imOwnerId = imovelBase ? (imovelBase.user_id || imovelBase.userId || imovelBase.usuarioId || '') : '';
      const _imOwner = (_cacheUsuarios||[]).find(u => (u.codigo_usuario||u.codigoUsuario||u.codigo||u.id) === _imOwnerId);
      return _imOwner ? ((_imOwner.celular||_imOwner.telefone||'').replace(/\D/g,'')) : '';
    })(),
    usuarioDestinoNome: (() => {
      const _uid = lead.usuarioDestinoId || lead.userId || lead.codigoUsuario || '';
      const _u = (_cacheUsuarios||[]).find(u => (u.codigo_usuario||u.codigoUsuario||u.codigo||u.id) === _uid);
      return _u ? (_u.nome||'') : '';
    })(),
    usuarioDestinoPerfil: '',
    usuarioDestinoTelefone: (() => {
      const _uid = lead.usuarioDestinoId || lead.userId || lead.codigoUsuario || '';
      const _u = (_cacheUsuarios||[]).find(u => (u.codigo_usuario||u.codigoUsuario||u.codigo||u.id) === _uid);
      return _u ? ((_u.celular||_u.telefone||'').replace(/\D/g,'')) : '';
    })(),
    corretorNome: (() => {
      const _uid = lead.userId || lead.codigoUsuario || '';
      const _u = (_cacheUsuarios||[]).find(u => (u.codigo_usuario||u.codigoUsuario||u.codigo||u.id) === _uid);
      return _u ? (_u.nome||'') : '';
    })(),
    corretorTelefone: (() => {
      const _uid = lead.userId || lead.codigoUsuario || '';
      const _u = (_cacheUsuarios||[]).find(u => (u.codigo_usuario||u.codigoUsuario||u.codigo||u.id) === _uid);
      return _u ? ((_u.celular||_u.telefone||'').replace(/\D/g,'')) : '';
    })(),
    dataVisita: lead.dataVisita || lead.dataPreferida || '',
    horaVisita: lead.horaVisita || lead.horarioPreferido || '',
    imovelUrl: imovel.url || '',
    status: 'solicitada',
    origem: 'vitrine_cliente',
    fonte: 'MatchImóveis',
    data: new Date().toISOString(),
    data_br: new Date().toLocaleString('pt-BR')
  };
  const visitas = (_cacheVisitas || []);
  // Busca userId no banco se não estiver no cache
  try { const { query: _qVAI } = require('./services/db'); _qVAI('SELECT user_id FROM leads WHERE id=$1', [lead?.id||'']).then(r => { const _uid = r.rows[0]?.user_id || (lead&&(lead.userId||lead.codigoUsuario||lead.corretorId)) || ''; if(_uid) consumir(_uid,'visita_agendada_ia').catch(()=>{}); }).catch(()=>{}); } catch(e) {}
  const visitaComWorkflow = aplicarWorkflowVisita(novaVisita);
  visitas.push(visitaComWorkflow);
  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/cliente/oferta/'+req.params.leadId+'?visita=ok');
});


// ===== REGRA DONO DO LEAD =====

// Sempre que importar leads:
function aplicarDonoLead(lead, usuario){
  lead.corretorId = usuario.id || 'mario-11999965998';
  lead.corretorNome = usuario.nome || 'MARIO SERGIO DE SOUZA';
  lead.corretorCelular = usuario.celular || '11999965998';
  return lead;
}

// Filtrar leads do corretor logado
function filtrarLeadsPorCorretor(leads, usuario){
  return leads.filter(l => l.corretorId === (usuario.id || 'mario-11999965998'));
}

// Quando cliente pedir visita
function registrarVisita(lead){
  lead.visita = {
    status: 'solicitada',
    data: new Date().toISOString()
  };
  lead.etapaAtual = 'Visita solicitada';
  return lead;
}










// Página de confirmação do proprietário









// Página do corretor para confirmar/recusar visita (sem login)
app.get('/corretor/visita/:id', async (req, res) => {
  try {
    const { lerVisitas } = require('./services/salvarVisita');
    const todas = await lerVisitas();
    const visita = todas.find(v => String(v.id) === String(req.params.id));
    if (!visita) return res.status(404).send('<h2>Visita não encontrada</h2>');
    res.render('corretor-visita', { visita });
  } catch(e) {
    res.status(500).send('<h2>Erro: ' + e.message + '</h2>');
  }
});

app.post('/corretor/visita/:id/responder', async (req, res) => {
  try {
    const { resposta } = req.body;
    const { lerVisitas, salvarTodasVisitas: _salvarVisitas } = require('./services/salvarVisita');
    const todas = await lerVisitas();
    const idx = todas.findIndex(v => String(v.id) === String(req.params.id));
    if (idx < 0) return res.status(404).send('<h2>Visita não encontrada</h2>');

    const _EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
    const _EK = process.env.EVOLUTION_KEY || 'match2025evolution';
    const _BASE = process.env.RENDER ? 'https://matchimoveis.ia.br' : 'http://localhost:3000';
    const _v = todas[idx];
    const _telCliente = String(_v.telefone || _v.contato || '').replace(/\D/g,'');
    // Busca instância do corretor dono da visita
    const _userId = _v.userId || _v.user_id || _v.corretorId || _v.corretor_id || '';
    const { lerUsuarios: _luCV } = require('./services/salvarUsuario');
    const _usersCV = await _luCV();
    const _corrCV = _usersCV.find(u => u.id === _userId);
    const _instancia = _corrCV?.whatsappInstance || 'match-corretor';
    const _imovel = _v.imovelTitulo || _v.imovel_titulo || _v.imovelBairro || _v.imovel_bairro || 'imóvel';
    const _data = (_v.dataVisita || _v.data_visita) ? ' para ' + (_v.dataVisita || _v.data_visita) + ((_v.horaVisita || _v.hora_visita) ? ' às ' + (_v.horaVisita || _v.hora_visita) : '') : '';

    async function _enviarWA(numero, texto) {
      try {
        await fetch(_EU + '/message/sendText/' + _instancia, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': _EK },
          body: JSON.stringify({ number: '55' + numero.replace(/^55/,''), text: texto })
        });
      } catch(e) { console.error('[WA corretor-visita]', e.message); }
    }

    if (resposta === 'confirmar') {
      todas[idx].status = 'confirmada';
      todas[idx].respostaCorretor = 'confirmar';
      todas[idx].corretorConfirmouEm = new Date().toISOString();
      // WA para o cliente confirmar presença
      if (_telCliente) {
        const _linkConfirmar = _BASE + '/cliente/visita/' + _v.id + '/confirmar';
        const _linkRecusar = _BASE + '/cliente/visita/' + _v.id + '/recusar';
        const _msg = 'Olá *' + (_v.nome||'') + '*! Sua visita ao imóvel *' + _imovel + '*' + _data + ' foi confirmada!\n\nConfirme sua presença:\n✅ Confirmar: ' + _linkConfirmar + '\n❌ Não posso ir: ' + _linkRecusar;
        await _enviarWA(_telCliente, _msg);
        consumir(_v.userId || _v.corretorId || '', 'confirmacao_auto').catch(e=>console.error('[creditos] confirmacao_auto falhou:', e.message));
        const _emailC1 = _v.email || _v.emailCliente || '';
        if (_emailC1) { try { const { enviarEmail: _eE1 } = require('./services/email'); await _eE1({ para: _emailC1, assunto: '✅ Sua visita foi confirmada!', html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><pre style="font-family:Arial,sans-serif;white-space:pre-wrap">' + _msg + '</pre></div>', texto: _msg }); } catch(_e1){} }
      }
    } else if (resposta === 'indisponivel') {
      todas[idx].status = 'imovel_indisponivel';
      todas[idx].respostaCorretor = 'indisponivel';
      todas[idx].corretorRecusouEm = new Date().toISOString();
      // Inativa o imóvel no PG
      try {
        const { query: _qInat } = require('./services/db');
        const _agora = new Date().toISOString();
        await _qInat("UPDATE imoveis SET status='inativo', dados = dados || jsonb_build_object('status','inativo','inativadoEm',$2,'inativadoPor','corretor') WHERE id=$1 OR id_externo=$1 OR id_interno=$1", [_v.imovelId, _agora]);
        console.log('[corretor] Imóvel inativado:', _v.imovelId);
        // Invalida cache para não entrar na vitrine
        if (_cacheImoveis) {
          const _ci = _cacheImoveis.findIndex(i => i.id === _v.imovelId || i.idExterno === _v.imovelId || i.idInterno === _v.imovelId);
          if (_ci >= 0) _cacheImoveis[_ci].status = 'inativo';
        }
      } catch(_e) { console.error('[inativar]', _e.message); }
      // WA para o cliente com link da vitrine
      if (_telCliente) {
        const _leadId = _v.leadId || '';
        const _linkVitrine = _leadId ? _BASE + '/cliente/oferta/' + _leadId : _BASE;
        const _msg = 'Olá *' + (_v.nome||'') + '*! Infelizmente o imóvel *' + _imovel + '* não está mais disponível.\n\nAcesse a vitrine e escolha outra opção: ' + _linkVitrine;
        await _enviarWA(_telCliente, _msg);
        consumir(_v.userId || _v.corretorId || '', 'notificacao_prop').catch(e=>console.error('[creditos] notificacao_prop falhou:', e.message));
        const _emailC2 = _v.email || _v.emailCliente || '';
        if (_emailC2) { try { const { enviarEmail: _eE2 } = require('./services/email'); await _eE2({ para: _emailC2, assunto: '❌ Imóvel indisponível', html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><pre style="font-family:Arial,sans-serif;white-space:pre-wrap">' + _msg + '</pre></div>', texto: _msg }); } catch(_e2){} }
      }
    } else if (resposta === 'remarcar') {
      todas[idx].status = 'pendente_remarcar';
      todas[idx].respostaCorretor = 'remarcar';
      todas[idx].corretorRemarcarEm = new Date().toISOString();
      // WA para o cliente remarcar
      if (_telCliente) {
        const _leadId = _v.leadId || '';
        const _imovelIdEnc = encodeURIComponent(_v.imovelId || '');
        const _linkRemarcar = _BASE + '/cliente/visita/' + _v.id + '/remarcar';
        const _msgRemarcar = 'Olá *' + (_v.nome||'') + '*! O corretor solicitou uma remarcação da visita ao imóvel *' + _imovel + '*.\n\nEscolha uma nova data: ' + _linkRemarcar;
        await _enviarWA(_telCliente, _msgRemarcar);
      }
    }

    await _salvarVisitas(todas);
    const _msgSucesso = resposta === 'remarcar' ? '✅ Solicitação de remarcação enviada ao cliente!' : '';
    res.render('corretor-visita', { visita: todas[idx], sucesso: _msgSucesso });
  } catch(e) {
    console.error('[corretor-visita]', e.message);
    res.status(500).send('<h2>Erro: ' + e.message + '</h2>');
  }
});

app.post('/proprietario/visita/:visitaId/responder', async (req, res) => {
  const visitas = (_cacheVisitas || []);
  const idx = visitas.findIndex(v => v.id === req.params.visitaId);
  if (idx === -1) return res.status(404).send('Visita não encontrada');
  
  const { resposta } = req.body;
  consumir(visitas[idx]?.ownerUserId || visitas[idx]?.corretorId, 'confirmacao_auto').catch(e=>console.error('[creditos] confirmacao_auto falhou:', e.message));
  visitas[idx].respostaProprietario = resposta;
  visitas[idx].respostaEm = new Date().toISOString();

  if (resposta === 'confirmar') {
    visitas[idx].status = 'confirmada';
    const telCliente = String(visitas[idx].telefone || visitas[idx].contato || '').replace(/\D/g,'');
    const dataVisita = visitas[idx].dataVisita || 'em breve';
    const horaVisita = visitas[idx].horaVisita || '';
    const imovelTitulo = visitas[idx].imovelTitulo || visitas[idx].imovelBairro || 'o imóvel';
    const msgCliente = 'Olá ' + (visitas[idx].nome || '') + '! Sua visita ao imóvel *' + imovelTitulo + '* foi confirmada para ' + dataVisita + (horaVisita ? ' às ' + horaVisita : '') + '. Qualquer dúvida, entre em contato!';
    visitas[idx].whatsappClienteLink = telCliente ? 'https://wa.me/55' + telCliente + '?text=' + encodeURIComponent(msgCliente) : '';
    visitas[idx].clienteNotificado = false;
  } else if (resposta === 'indisponivel') {
    visitas[idx].status = 'cancelada';
    // Marca imóvel como inativo
    try {
      const _iid = visitas[idx].imovelId;
      const _agora = new Date().toISOString();
      const _qInativar = `UPDATE imoveis SET dados = dados || jsonb_build_object('status','inativo','inativadoEm',$2,'inativadoPor','proprietario') WHERE id_externo=$1 OR id_interno=$1`;
      await _qExcluir(_qInativar, [_iid, _agora]);
      console.log('Imóvel inativado via PG:', _iid);
    } catch(_e) { console.error('[inativar imovel]', _e.message); }
  } else if (resposta === 'remarcar') {
    visitas[idx].status = 'pendente_remarcar';
  }

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));
  try {
    const _v = visitas[idx];
    const _uid = _v.userId || _v.corretorId || '';
    const _imovel = _v.imovelTitulo || _v.imovelBairro || 'imovel';
    const _cliente = _v.nome || 'cliente';
    const _data = _v.dataVisita || '';
    const _hora = _v.horaVisita || '';
    const _msgs = {
      confirmar: { titulo: 'Visita confirmada pelo proprietario', msg: 'O proprietario confirmou a visita de ' + _cliente + ' ao imovel ' + _imovel + ' para ' + _data + ' as ' + _hora + '.' },
      indisponivel: { titulo: 'Imovel indisponivel', msg: 'O proprietario informou que o imovel ' + _imovel + ' nao esta disponivel. Imovel inativado.' },
      remarcar: { titulo: 'Proprietario pediu remarcacao', msg: 'O proprietario do imovel ' + _imovel + ' nao pode receber ' + _cliente + ' no dia ' + _data + '. Peca ao cliente uma nova data.' }
    };
    const _info = _msgs[resposta];
    if (_info && _uid) {
      // Notifica corretor dono da lead
      criarNotificacaoService({ id: Date.now().toString(), tipo: 'visita_proprietario', titulo: _info.titulo, mensagem: _info.msg, usuarioId: _uid, lida: false, criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) });
      // Notifica parceiro dono do imóvel (se diferente do corretor)
      const _parcId = _v.imovelUsuarioId || '';
      if (_parcId && _parcId !== _uid) {
        const _msgParc = {
          confirmar: 'Você confirmou a visita de ' + _cliente + ' ao imóvel ' + _imovel + ' para ' + _data + ' às ' + _hora + '.',
          indisponivel: 'Você informou indisponibilidade do imóvel ' + _imovel + '. O imóvel foi inativado.',
          remarcar: 'Você pediu remarcação da visita de ' + _cliente + ' ao imóvel ' + _imovel + '.'
        }[resposta];
        if (_msgParc) criarNotificacaoService({ id: (Date.now()+1).toString(), tipo: 'visita_proprietario', titulo: _info.titulo, mensagem: _msgParc, usuarioId: _parcId, lida: false, criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) });
      }
      // notificações salvas via criarNotificacaoService (PG)
    }
  } catch(e) { console.log('Erro notif proprietario:', e.message); }
  consumir(_uid || '', 'notificacao_prop').catch(e=>console.error('[creditos] notificacao_prop falhou:', e.message));
  res.render('proprietario-confirmado', { resposta, visita: visitas[idx] });
})



// Antes com auth (qualquer corretor logado): a resposta usava `todos` (base
// inteira, sem filtrar por dono) em "ultimas3" — vazava nome/id/dono das 3
// leads mais recentes de QUALQUER corretor pra qualquer um autenticado.
app.get('/dev/diagnostico-leads', authAdmin, (req,res)=>{
  // authAdmin garante session.admin, não session.user (só existe se o admin
  // também tiver entrado como um corretor via /admin/acessar/:codigo) — trata
  // os dois casos em vez de assumir que user sempre existe.
  const user = req.session.user || null;
  const todos = (_cacheLeads || []);
  const uid = user ? user.id : null;
  const filtrados = user ? filtrarPorUsuario(todos, user) : todos;
  res.json({
    userId: uid,
    totalNoArquivo: todos.length,
    totalFiltrados: filtrados.length,
    ultimas3: todos.slice(-3).map(l=>({id:l.id,nome:l.nome,userId:l.userId,codigoUsuario:l.codigoUsuario,corretorId:l.corretorId}))
  });
});

function gerarCodigoUsuario(nome) {
  const ini = (nome||'USR').substring(0,3).toUpperCase().replace(/[^A-Z]/g,'').padEnd(3,'X');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i=0; i<4; i++) rand += chars[Math.floor(Math.random()*chars.length)];
  return ini + '-' + rand;
}


// ===== APP ROUTES =====





// ===== ROTAS APP =====


function readJsonSafe(file, fallback){
  try {
    if(!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file,'utf8'));
  } catch(e) {
    return fallback;
  }
}



// ===== ADMIN: ACOMPANHAR LISTAS POR CORRETOR =====
function safeReadJsonAdmin(file, fallback){
  try {
    if(!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file,'utf8'));
  } catch(e) {
    return fallback;
  }
}

function salvarHistoricoUpload(payload){
  const file = 'uploads-admin.json';
  const historico = safeReadJsonAdmin(file, []);
  historico.push({
    id: 'upload-' + Date.now(),
    data: new Date().toISOString(),
    ...payload
  });
  fs.writeFileSync(file, JSON.stringify(historico,null,2));
}


// ===== CORRETOR: MEUS LEADS + FAZER MATCH =====


// Antes sem auth: sem sessão, o código assumia a identidade de uma pessoa
// real (nome/telefone hardcoded) — parecia leftover de debug, mas ficava
// acessível em produção e vazava PII de terceiro no próprio código-fonte.
app.post('/app-leads/:idx/match', auth, async (req,res)=>{
  const usuario = req.session.user;

  const dataRaw = safeReadJsonAdmin(dataPath('data.json'), []);
  const data = Array.isArray(dataRaw) ? dataRaw : (dataRaw.results || []);

  const meusIndices = [];
  data.forEach((item, index)=>{
    const celularItem = String(item.corretorCelular || item.celularCorretor || '');
    const idItem = String(item.corretorId || '');
    const telUser = String(usuario.celular || usuario.telefone || '');
    if(idItem === usuario.id || celularItem === telUser) meusIndices.push(index);
  });

  const realIndex = meusIndices[Number(req.params.idx)];
  const item = data[realIndex];

  if(!item) return res.status(404).send('Lead não encontrado para este corretor.');

  try {
    const { searchQuintoAndar } = require('./services/quintoandar');
    const { searchRemax } = require('./services/remax');
    const { findTopMatches } = require('./services/matcher');

    const origin = item.origin || item;

    if((origin.cidade || '').toLowerCase() !== 'são paulo' && (origin.cidade || '').toLowerCase() !== 'sao paulo'){
      return res.send('Este lead não é de São Paulo/SP e não será processado para match.');
    }

    let candidatos = [];

    try {
      const qa = await searchQuintoAndar(origin);
      candidatos = candidatos.concat(qa || []);
    } catch(e) {
      console.log('Erro QuintoAndar:', e.message);
    }

    try {
      const rx = await searchRemax(origin);
      candidatos = candidatos.concat(rx || []);
    } catch(e) {
      console.log('Erro REMAX:', e.message);
    }

    const matches = findTopMatches(origin, candidatos, 8);

    item.matches = matches;
    item.matchCount = matches.length;
    item.bestScore = matches[0] ? matches[0].score : 0;
    item.matchedAt = new Date().toISOString();
    item.corretorId = usuario.id;
    item.corretorNome = usuario.nome;
    item.corretorCelular = usuario.celular || usuario.telefone;

    if(!item.leadId){
      item.leadId = 'lead-' + realIndex + '-' + Date.now();
    }

    salvarTodosLeads(data).catch(e=>console.error("[leads]",e.message));

    res.redirect('/app-leads');
  } catch(err) {
    console.error(err);
    res.status(500).send('Erro ao fazer match: ' + err.message);
  }
});

app.get('/import-status',(req,res)=>{
  res.json(global.importStatus || {status:'idle', total:0, mensagem:'Aguardando importação'});
});

app.get('/import-status',(req,res)=>{res.json({status:global.importStatus||'idle'});});

app.get('/logout', (req,res)=>{
  req.session.destroy(()=>res.redirect('/'));
});


// ===== ROTAS CORRETAS CORRETOR / ADMIN =====
app.get('/logout', (req,res)=>{
  req.session.destroy(()=>res.redirect('/'));
});

function usuarioLogado(req){
  return req.session.user || null;
}





// Meus imóveis = carteira do corretor, NÃO match


// Meus leads = leads/matches do corretor logado


// Admin match = somente painel de match


// ===== ROTAS CORRETAS CORRETOR / ADMIN =====
app.get('/logout', (req,res)=>{
  req.session.destroy(()=>res.redirect('/'));
});

function usuarioLogado(req){
  return req.session.user || null;
}

app.get('/app', (req,res)=>{
  if(!req.session.user) return res.redirect('/');
  res.redirect('/app-home');
});

// rota app-home removida (duplicada)

// Meus imóveis = carteira do corretor, NÃO match
app.get('/app-imoveis', (req,res)=>{
  return res.redirect('/app/imoveis');
});

////app.get('/app/portais', auth, (req,res)=>{
//  const portais = JSON.parse(require('fs').readFileSync('portais.json','utf8'));
//  res.render('app-portais', { user: req.session.user, portais });
//});

app.get('/app-xml', (req,res)=> res.redirect('/app-portais-xml'));
app.get('/app-portais', (req,res)=> res.redirect('/app-portais-xml'));


app.get('/app-perfil', (req,res)=>{
  renderAppPage(res, 'app-perfil', { title: 'Perfil' });
});

app.get('/logout', (req,res)=> res.redirect('/'));

// ===== ROTAS FINAIS LIMPAS DO APP =====

function auth(req,res,next){
  if(!req.session || !req.session.user) return res.redirect('/');
  // rotas liberadas mesmo sem saldo
  const _rotasLivres = ['/app/coins', '/app/perfil', '/pagamento', '/webhook', '/app/notificacoes', '/sair', '/app/whatsapp'];
  const _isLivre = _rotasLivres.some(r => req.path.startsWith(r));
  if(!_isLivre){
    const _userId = req.session.user.codigoUsuario || req.session.user.codigo || req.session.user.id;
    const _saldo = req.session.user.matchCoins || 0;
    if(_saldo !== undefined && _saldo <= 0 && req.session.user.tipo !== 'admin'){
      if(req.xhr || req.headers.accept?.includes('application/json')){
        return res.status(402).json({ok:false, erro:'Saldo insuficiente', redirect:'/app/coins'});
      }
      return res.redirect('/app/coins?sem_saldo=1');
    }
  }
  next();
}

function filtrarPorUsuario(lista, user){
  if (!Array.isArray(lista)) return [];
  if (user && user.tipo === 'admin') return lista;
  const uid = String(user && user.id || '');
  const tel = String(user && (user.celular || user.telefone) || '').replace(/\D/g,'');
  const cod = String(user && user.codigoUsuario || '');
  return lista.filter(item =>
    String(item.corretorId || '') === uid ||
    String(item.userId || '') === uid ||
    String(item.usuarioId || '') === uid ||
    String(item.corretorCelular || '').replace(/\D/g,'') === tel ||
    String(item.usuarioTelefone || '').replace(/\D/g,'') === tel ||
    (cod && String(item.codigoUsuario || '') === cod)
  );
}



// HELPERS DE LEITURA COM FILTRO AUTOMÁTICO
function lerImoveis(user) {
  const todos = _cacheImoveis || [];
  if (!user) return todos;
  const uid = user.id || user;
  return todos.filter(i =>
    String(i.userId||'') === String(uid) ||
    String(i.usuarioId||'') === String(uid) ||
    String(i.codigoUsuario||'') === String(uid) ||
    String(i.corretorId||'') === String(uid)
  );
}
// Cache em memória — sincronizado com PostgreSQL
// Full reload (não incremental): leads tem ~20 pontos no server.js que fazem
// UPDATE direto na tabela sem tocar em atualizado_em (ex: workflow de visita,
// captação, tipo_lead) — um cache incremental baseado nesse campo ficaria
// desatualizado nesses casos. Intervalo alongado pra reduzir carga no PG.
let _cacheLeads = null;
let _cacheLeadsAt = 0;
let _leadsEmExecucao = false;
async function _recarregarLeads() {
  if (_leadsEmExecucao) { console.log('[cache leads] execução anterior ainda rodando, pulando esta'); return; }
  _leadsEmExecucao = true;
  try {
    const { lerLeads: _llSvc } = require('./services/salvarLead');
    _cacheLeads = await _llSvc();
    _cacheLeadsAt = Date.now();
  } catch(e) {
    if (!_cacheLeads) _cacheLeads = (_cacheLeads || []);
  } finally {
    _leadsEmExecucao = false;
  }
}
setTimeout(() => { _recarregarLeads(); setInterval(_recarregarLeads, 30000); }, 0);


// Cache imóveis em memória
let _cacheImoveis = null;
let _imoveisEmExecucao = false;
// O cache em RAM guarda no máximo 20 fotos por imóvel (cobre listagem, mapa, feed,
// matches, WhatsApp, Instagram — nenhum desses mostra mais que isso). Quem precisa
// do array completo (editar imóvel, página pública, gerar XML manual, upload/excluir/
// capa de foto) busca a linha inteira direto do banco — ver _buscarImovelCompleto.
const _MAX_FOTOS_CACHE = 20;
function _capFotosCache(im) {
  if (im && Array.isArray(im.fotos) && im.fotos.length > _MAX_FOTOS_CACHE) im.fotos = im.fotos.slice(0, _MAX_FOTOS_CACHE);
  return im;
}
async function _recarregarImoveis() {
  if (_imoveisEmExecucao) { console.log('[cache imoveis] execução anterior ainda rodando, pulando esta'); return; }
  _imoveisEmExecucao = true;
  try {
    _cacheImoveis = (await lerImoveisService()).map(_capFotosCache);
  } catch(e) {
    if (!_cacheImoveis) _cacheImoveis = (_cacheImoveis || []);
  } finally {
    _imoveisEmExecucao = false;
  }
}
let _cacheImoveisAt = null;
let _imoveisIncrementalEmExecucao = false;
async function _recarregarImoveisIncremental() {
  if (_imoveisIncrementalEmExecucao) { console.log('[cache imoveis] incremental anterior ainda rodando, pulando esta'); return; }
  _imoveisIncrementalEmExecucao = true;
  try {
    if (!_cacheImoveis || !_cacheImoveisAt) { await _recarregarImoveis(); return; }
    const { query: _qInc } = require('./services/db');
    const { rowToImovel: _rtiInc } = require('./services/salvarImovel');
    const desde = _cacheImoveisAt;
    const res = await _qInc('SELECT * FROM imoveis WHERE atualizado_em > $1', [desde]);
    _cacheImoveisAt = new Date();
    if (!res.rows.length) return;
    const mapa = new Map(_cacheImoveis.map(i => [String(i.id), i]));
    res.rows.forEach(r => { mapa.set(String(r.id), _capFotosCache(_rtiInc(r))); });
    _cacheImoveis = Array.from(mapa.values());
    console.log('[cache imoveis] incremental:', res.rows.length, 'atualizados');
  } catch(e) { console.error('[cache imoveis incremental]', e.message); } finally {
    _imoveisIncrementalEmExecucao = false;
  }
}
let _exclusoesImoveisEmExecucao = false;
async function _detectarExclusoesImoveis() {
  if (_exclusoesImoveisEmExecucao) { console.log('[cache imoveis] checagem de exclusões anterior ainda rodando, pulando esta'); return; }
  _exclusoesImoveisEmExecucao = true;
  try {
    if (!_cacheImoveis) return;
    const { query: _qDel } = require('./services/db');
    const res = await _qDel('SELECT id FROM imoveis');
    const idsAtuais = new Set(res.rows.map(r => String(r.id)));
    const antes = _cacheImoveis.length;
    _cacheImoveis = _cacheImoveis.filter(i => idsAtuais.has(String(i.id)));
    const removidos = antes - _cacheImoveis.length;
    if (removidos > 0) console.log('[cache imoveis] exclusoes detectadas:', removidos);
  } catch(e) { console.error('[cache imoveis exclusoes]', e.message); } finally {
    _exclusoesImoveisEmExecucao = false;
  }
}
(function _agendarRecargaCompletaImoveis() {
  const agora = new Date();
  const proxima = new Date(agora);
  proxima.setHours(3, 30, 0, 0);
  if (proxima <= agora) proxima.setDate(proxima.getDate() + 1);
  const ms = proxima - agora;
  setTimeout(() => {
    _recarregarImoveis();
    setInterval(_recarregarImoveis, 24 * 60 * 60 * 1000);
  }, ms);
})();
setTimeout(() => {
  _recarregarImoveis();
  _cacheImoveisAt = new Date();
  setInterval(async () => {
    await _recarregarImoveisIncremental();
    await _detectarExclusoesImoveis();
  }, 15000);
}, 3000);
// Cache usuários
let _cacheUsuarios = null;
let _usuariosEmExecucao = false;
async function _recarregarUsuarios() {
  if (_usuariosEmExecucao) { console.log('[cache usuarios] execução anterior ainda rodando, pulando esta'); return; }
  _usuariosEmExecucao = true;
  try {
    const { lerUsuarios: _luSvc } = require('./services/salvarUsuario');
    _cacheUsuarios = await _luSvc();
  } catch(e) {
    if (!_cacheUsuarios) _cacheUsuarios = fs.existsSync(dataPath('users.json')) ? (_cacheUsuarios || []) : [];
  } finally {
    _usuariosEmExecucao = false;
  }
}
setTimeout(() => { _recarregarUsuarios(); setInterval(_recarregarUsuarios, 15000); }, 6000);

function lerLeads(user) {
  const uid = user && (user.id || user);
  const todos = _cacheLeads || ((_cacheLeads || []));
  const filtradas = filtrarPorUsuario(todos, user);
  if (!uid) return filtradas;
  return filtradas.filter(l => !(l.deletadoPor && l.deletadoPor.includes(uid)));
}
let _cacheVisitas = null;
let _visitasEmExecucao = false;
async function _recarregarVisitas() {
  if (_visitasEmExecucao) { console.log('[cache visitas] execução anterior ainda rodando, pulando esta'); return; }
  _visitasEmExecucao = true;
  try {
    const { lerVisitas: _lvSvc } = require('./services/salvarVisita');
    _cacheVisitas = await _lvSvc();
  } catch(e) {
    if (!_cacheVisitas) _cacheVisitas = (_cacheVisitas || []);
  } finally {
    _visitasEmExecucao = false;
  }
}
setTimeout(() => { _recarregarVisitas(); setInterval(_recarregarVisitas, 15000); }, 9000);

function lerVisitas(user) {
  const todos = _cacheVisitas || ((_cacheVisitas || []));
  return filtrarPorUsuario(todos, user);
}
async function lerNotificacoes(user) {
  try {
    const uid = user?.id || user;
    const result = await lerNotificacoesService(uid);
    return Array.isArray(result) ? result : [];
  } catch(e) { return []; }
}

app.get('/app', auth, (req,res)=> res.redirect('/app-home'));

app.get('/app/notificacoes', auth, async (req,res)=>{
  try {
    const notificacoes = await lerNotificacoes(req.session.user);
    res.render('app-notificacoes', { user: req.session.user, notificacoes });
  } catch(e) {
    res.render('app-notificacoes', { user: req.session.user, notificacoes: [] });
  }
});


app.get('/app-home', auth, async (req,res)=>{
  const user = req.session.user;
  const { lerLeads: _llSvc2 } = require('./services/salvarLead');
  const todosImoveis = await lerImoveis(req.session.user.id);
  const todosLeads = await _llSvc2(req.session.user.id);
  const todasVisitas = await lerVisitas(req.session.user.id);
  const notificacoes = await lerNotificacoes(req.session.user);
  const imoveis = filtrarPorUsuario(todosImoveis, user);
  const leadsArr = filtrarPorUsuario(Array.isArray(todosLeads) ? todosLeads : (todosLeads.results || []), user)
    .filter(l => !(l.leadOculta === true && !((l.matches||[]).length || (l.matchesBase||[]).length)));
  const visitas = user.tipo === 'admin' ? todasVisitas : todasVisitas.filter(v =>
    String(v.ownerUserId || v.corretorId || v.usuarioDestinoId || "") === String(user.id || "") ||
    String(v.corretorTelefone || v.usuarioDestinoTelefone || '').replace(/\D/g,'') === String(user.celular || user.telefone || '').replace(/\D/g,'')
  );
  const minhasNotificacoes = notificacoes.filter(n => String(n.usuarioId) === String(user.id));
  const naoLidas = minhasNotificacoes.filter(n => !n.lida);
  const comMatch = leadsArr.filter(l => (l.matches && l.matches.length > 0) || (l.matchesBase && l.matchesBase.length > 0));
  const totalMatches = leadsArr.reduce((s,l) => s + ((l.matches&&l.matches.length)||0) + ((l.matchesBase&&l.matchesBase.length)||0), 0);
  const hoje = new Date().toDateString();
  const visitasHoje = visitas.filter(v => new Date(v.data).toDateString() === hoje);
  const recentes = leadsArr.slice(-5).reverse();
  res.render('app-home', {
    user: req.session.user,
    stats: {
      imoveisAtivos: imoveis.length,
      leadsNovos: leadsArr.length,
      visitasAgendadas: visitas.length,
      matchesGerados: totalMatches,
      comMatch: comMatch.length,
      visitasHoje: visitasHoje.length,
      taxaMatch: leadsArr.length > 0 ? Math.round((comMatch.length / leadsArr.length) * 100) : 0,
      // Funil
      funnelLeads: leadsArr.length,
      funnelMatch: comMatch.length,
      funnelVisitaAgendada: visitas.length,
      funnelVisitaConfirmada: visitas.filter(v => ['confirmada','lead_confirmou','realizada'].includes(v.status)).length,
      funnelPctMatch: leadsArr.length > 0 ? Math.round(comMatch.length / leadsArr.length * 100) : 0,
      funnelPctVisita: comMatch.length > 0 ? Math.round(visitas.length / comMatch.length * 100) : 0,
      funnelPctConfirmada: visitas.length > 0 ? Math.round(visitas.filter(v => ['confirmada','lead_confirmou','realizada'].includes(v.status)).length / visitas.length * 100) : 0,
      // Insights
      leadsQuentesSemVisita: leadsArr.filter(l => {
        const temMatch = (l.matches&&l.matches.length>0)||(l.matchesBase&&l.matchesBase.length>0);
        const temVisita = visitas.some(v => String(v.leadId)===String(l.id||l._id));
        return temMatch && !temVisita;
      }).length,
      imoveisSemLead: imoveis.filter(im => !leadsArr.some(l => {
        const ids = [...(l.matches||[]),...(l.matchesBase||[])].map(m=>String(m.idInterno||m.id||m.imovelId||''));
        return ids.includes(String(im.idInterno||im.id||''));
      })).length,
      bairroMaisDemandado: (() => {
        const map = {};
        leadsArr.forEach(l => { const b=l.bairro||l.perfilIA?.bairro||''; if(b) map[b]=(map[b]||0)+1; });
        return Object.entries(map).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
      })(),
      bairroMaisOferta: (() => {
        const map = {};
        imoveis.forEach(im => { const b=im.bairro||''; if(b) map[b]=(map[b]||0)+1; });
        return Object.entries(map).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
      })(),
      // Ranking imóveis mais matcheados
      rankingImoveis: (() => {
        const map = {};
        leadsArr.forEach(l => {
          [...(l.matches||[]),...(l.matchesBase||[])].forEach(m => {
            const id = String(m.idInterno||m.id||m.imovelId||'');
            if(id) map[id] = (map[id]||0) + 1;
          });
        });
        return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id,cnt]) => {
          const im = imoveis.find(i => String(i.idInterno||i.id||'')===id) || {};
          return { id, cnt, titulo: im.titulo||im.tipo||'Imóvel', bairro: im.bairro||'', foto: (im.fotos&&im.fotos[0])||'', valor: im.valor_imovel||0 };
        });
      })(),
      // Temperatura das leads
      leadsQuentes: leadsArr.filter(l => {
        const temMatch = (l.matches&&l.matches.length>0)||(l.matchesBase&&l.matchesBase.length>0);
        const dias = l.criadoEm||l.data_cadastro ? Math.floor((Date.now()-new Date(l.criadoEm||l.data_cadastro).getTime())/86400000) : 99;
        return temMatch && dias <= 2;
      }).length,
      leadsMornas: leadsArr.filter(l => {
        const temMatch = (l.matches&&l.matches.length>0)||(l.matchesBase&&l.matchesBase.length>0);
        const dias = l.criadoEm||l.data_cadastro ? Math.floor((Date.now()-new Date(l.criadoEm||l.data_cadastro).getTime())/86400000) : 99;
        return temMatch && dias > 2 && dias <= 7;
      }).length,
      leadsFrias: leadsArr.filter(l => {
        const temMatch = (l.matches&&l.matches.length>0)||(l.matchesBase&&l.matchesBase.length>0);
        const dias = l.criadoEm||l.data_cadastro ? Math.floor((Date.now()-new Date(l.criadoEm||l.data_cadastro).getTime())/86400000) : 99;
        return temMatch && dias > 7;
      }).length,
      // Próximas visitas (hoje + amanhã)
      proximasVisitas: (() => {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
        const depois = new Date(hoje); depois.setDate(depois.getDate()+2);
        return visitas.filter(v => {
          if(!v.dataVisita) return false;
          const d = new Date(v.dataVisita); d.setHours(0,0,0,0);
          return d >= hoje && d < depois && !['cancelada','recusada'].includes(v.status);
        }).sort((a,b) => new Date(a.dataVisita)-new Date(b.dataVisita)).slice(0,5).map(v => ({
          nome: v.nome||v.nomeCliente||'Cliente',
          bairro: v.imovelBairro||v.bairro||'',
          titulo: v.imovelTitulo||'Imóvel',
          data: v.dataVisita,
          hora: v.horaVisita||'',
          status: v.status||'solicitada',
          hoje: new Date(v.dataVisita).setHours(0,0,0,0) === hoje.getTime()
        }));
      })(),
      // Evolução semanal de leads (últimas 4 semanas)
      evolucaoSemanal: (() => {
        const semanas = [0,0,0,0];
        const agora = Date.now();
        leadsArr.forEach(l => {
          const d = new Date(l.criadoEm||l.data_cadastro||0).getTime();
          const diasAtras = Math.floor((agora-d)/86400000);
          if(diasAtras < 7) semanas[3]++;
          else if(diasAtras < 14) semanas[2]++;
          else if(diasAtras < 21) semanas[1]++;
          else if(diasAtras < 28) semanas[0]++;
        });
        return JSON.stringify(semanas);
      })(),
      // Score de saúde da carteira (0-100)
      scoreCarteira: (() => {
        let score = 0;
        if(imoveis.length > 0) score += 20;
        if(imoveis.length >= 10) score += 10;
        const pctFoto = imoveis.filter(i=>i.fotos&&i.fotos.length>0).length / Math.max(imoveis.length,1);
        score += Math.round(pctFoto * 20);
        const pctProp = imoveis.filter(i=>i.proprietario&&i.proprietario.telefone).length / Math.max(imoveis.length,1);
        score += Math.round(pctProp * 15);
        if(leadsArr.length > 0) score += 10;
        if(comMatch.length > 0) score += 10;
        const visitasRecentes = visitas.filter(v => {
          const d = new Date(v.data||v.dataVisita||0);
          return (Date.now()-d.getTime()) < 30*86400000;
        }).length;
        if(visitasRecentes > 0) score += 15;
        return Math.min(score, 100);
      })(),
      // Imóveis sem foto
      imoveisSemFoto: imoveis.filter(i => !i.fotos || i.fotos.length === 0).length,
      // Imóveis sem proprietário
      imoveisSemProprietario: imoveis.filter(i => !i.proprietario || !i.proprietario.telefone).length,
      // BI Visitas
      visitasPorStatus: (() => {
        const map = { solicitada:0, confirmada:0, realizada:0, cancelada:0, recusada:0 };
        visitas.forEach(v => {
          const st = ['confirmada','lead_confirmou'].includes(v.status) ? 'confirmada'
            : v.status === 'realizada' ? 'realizada'
            : ['cancelada','recusada'].includes(v.status) ? 'cancelada'
            : 'solicitada';
          map[st] = (map[st]||0) + 1;
        });
        return JSON.stringify(map);
      })(),
      visitasTaxaConfirmacao: visitas.length > 0 ? Math.round(
        visitas.filter(v => ['confirmada','lead_confirmou','realizada'].includes(v.status)).length / visitas.length * 100
      ) : 0,
      visitasRealizadasMes: (() => {
        const ini = new Date(); ini.setDate(1); ini.setHours(0,0,0,0);
        return visitas.filter(v => v.status==='realizada' && new Date(v.dataVisita||v.data||0) >= ini).length;
      })(),
      visitasRealizadasMesPassado: (() => {
        const ini = new Date(); ini.setDate(1); ini.setHours(0,0,0,0);
        const fim = new Date(ini); fim.setDate(0);
        const iniMp = new Date(fim); iniMp.setDate(1);
        return visitas.filter(v => {
          const d = new Date(v.dataVisita||v.data||0);
          return v.status==='realizada' && d >= iniMp && d <= fim;
        }).length;
      })(),
      imovelMaisVisitado: (() => {
        const map = {};
        visitas.forEach(v => {
          const id = String(v.imovelId||v.imovelBairro||'');
          if(id) map[id] = (map[id]||0) + 1;
        });
        const top = Object.entries(map).sort((a,b)=>b[1]-a[1])[0];
        if(!top) return null;
        const im = imoveis.find(i => String(i.idInterno||i.id||i.idExterno||'')===top[0]) || {};
        return { titulo: im.titulo||im.tipo||top[0], bairro: im.bairro||'', cnt: top[1] };
      })(),
      // Lead mais antiga sem resposta
      leadMaisAntigaSemVisita: (() => {
        const semVisita = leadsArr.filter(l => !visitas.some(v => String(v.leadId)===String(l.id||l._id)));
        if(!semVisita.length) return null;
        const mais = semVisita.sort((a,b) => new Date(a.criadoEm||a.data_cadastro||0)-new Date(b.criadoEm||b.data_cadastro||0))[0];
        const dias = mais.criadoEm||mais.data_cadastro ? Math.floor((Date.now()-new Date(mais.criadoEm||mais.data_cadastro).getTime())/86400000) : 0;
        return { nome: mais.nome||'Lead', dias };
      })(),
    },
    recentes,
    topImoveis: (() => { const map = {}; leadsArr.forEach(l => { [...(l.matches||[]),...(l.matchesAuto||[]),...(l.matchesBase||[])].forEach(m => { const id = String(m.idInterno||m.id||m.imovelId||''); if(id) map[id]=(map[id]||0)+1; }); }); return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,cnt]) => { const im = imoveis.find(i => String(i.idInterno||i.id||'')===id)||{}; return {id,cnt,titulo:im.titulo||im.tipo||'Imóvel',bairro:im.bairro||'',cidade:im.cidade||''}; }); })(),
    naoLidas,
    topMatches: comMatch.slice(0,3),
    notificacoes: minhasNotificacoes.slice(-5).reverse(),
    notificacoesNaoLidas: naoLidas.length,

    // Gráficos
    graficoVisitasStatus: (() => {
      const map = {};
      visitas.forEach(v => { const s=v.status||'solicitada'; map[s]=(map[s]||0)+1; });
      return JSON.stringify(map);
    })(),
    graficoLeadsStatus: (() => {
      const map = {ok:0,incompleto:0,semStatus:0};
      leadsArr.forEach(l => {
        if(l.status==='ok') map.ok++;
        else if(l.status==='incompleto') map.incompleto++;
        else map.semStatus++;
      });
      return JSON.stringify(map);
    })(),
    graficoImoveisTipo: (() => {
      const map = {};
      imoveis.forEach(i => { const t=i.tipo||'Outro'; map[t]=(map[t]||0)+1; });
      const sorted = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,6);
      return JSON.stringify(Object.fromEntries(sorted));
    })(),
    graficoImoveisBairro: (() => {
      const map = {};
      imoveis.forEach(i => { const b=i.bairro||'Outro'; map[b]=(map[b]||0)+1; });
      const sorted = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8);
      return JSON.stringify(Object.fromEntries(sorted));
    })(),
    graficoLeadsBairro: (() => {
      const map = {};
      leadsArr.forEach(l => { const b=l.bairro||'Outro'; map[b]=(map[b]||0)+1; });
      const sorted = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8);
      return JSON.stringify(Object.fromEntries(sorted));
    })(),
    graficoLeadsOrigem: (() => {
      const rotulos = {
        manual: 'Manual', whatsapp: 'WhatsApp',
        webhook_imovelweb_global: 'ImovelWeb', webhook_imovelweb: 'ImovelWeb',
        webhook_grupoolx: 'ZAP/OLX/VivaReal', webhook_123i: '123i', webhook_chaves: 'Chaves na Mão',
        captacao_link: 'Captação', importado: 'Planilha'
      };
      const map = {};
      leadsArr.forEach(l => {
        const key = l.origem || l.origemEntrada || 'outro';
        const label = rotulos[key] || (key.charAt(0).toUpperCase()+key.slice(1));
        map[label] = (map[label]||0) + 1;
      });
      const sorted = Object.entries(map).sort((a,b)=>b[1]-a[1]);
      return JSON.stringify(Object.fromEntries(sorted));
    })()
  });
});


// Exportar imóveis do usuário em Excel
app.get('/app/imoveis/exportar-excel', auth, (req, res) => {
  try {
    const XLSX = require('xlsx');
    const fs = require('fs');

    const user = req.session.user || {};
    const userId = user.id || user.celular || user.telefone || user.email || '';

    const imoveis = fs.existsSync(dataFile('imoveis.json'))
      ? ((_cacheImoveis || []))
      : [];

    const meusImoveis = filtrarPorUsuario(imoveis, user);

    const rows = meusImoveis.map(i => {
      const prop = i.proprietario || {};
      const estado = typeof i.estado === 'object' ? (i.estado['#text'] || i.estado.abbreviation || i.estado.uf || '') : (i.estado || '');

      const id = i.id || i.idExterno || i.idOriginal || i.codigo || '';
      const _baseExp = process.env.RENDER ? 'https://matchimoveis.ia.br' : 'http://localhost:3000';
      const urlPublica = id ? `${_baseExp}/imovel/${id}` : '';

      return {
        'ID imóvel': id,
        'Tipo': i.tipo || '',
        'Transação': i.transacao || '',
        'Bairro': i.bairro || '',
        'Cidade': i.cidade || '',
        'Estado': estado,
        'Valor': i.valor_imovel || i.valor || '',
        'Área m²': i.area_m2 || i.area || '',
        'Quartos': i.quartos || '',
        'Suítes': i.suites || '',
        'Banheiros': i.banheiros || '',
        'Vagas': i.vagas || '',
        'URL do imóvel': urlPublica,
        'Nome proprietário': prop.nome || prop.nomeProprietario || i.proprietarioNome || i.nomeProprietario || '',
        'Email proprietário': prop.email || i.proprietarioEmail || i.emailProprietario || '',
        'Celular proprietário': prop.celular || prop.whatsapp || prop.contato || i.proprietarioCelular || i.celularProprietario || i.proprietarioContato || '',
        'Telefone proprietário': prop.telefone || prop.fone || i.proprietarioTelefone || i.telefoneProprietario || '',
        'Status proprietário': prop.status || '',
        'Fonte': i.source || i.fonte || '',
        'Atualizado em': i.lastUpdate || i.updatedAt || ''
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Imoveis');

    const file = `meus-imoveis-${new Date().toISOString().slice(0,10)}.xlsx`;
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('Erro ao exportar imóveis:', err);
    res.status(500).send('Erro ao exportar imóveis.');
  }
});

// Filtra + ordena + pagina uma lista de imoveis a partir de query params.
// Usado por /app/imoveis (dashboard) e pelas rotas publicas /site/:codigoUsuario.
function _filtrarEPaginarImoveis(imoveisBase, q, perPage) {
  let imoveis = imoveisBase;
  const _page = Math.max(1, parseInt(q.page) || 1);
  const _totalImoveis = imoveis.length;
  const _totalPages = Math.ceil(_totalImoveis / perPage);
  // Chave accent/hífen/case-insensitive — usada só pra comparar (agrupar e
  // filtrar), nunca pra exibir. Garante que "SANTA-CATARINA" e "Santa Catarina"
  // caem na mesma chave mesmo em imóveis antigos ainda não regravados com a
  // normalização de services/salvarImovel.js (normalizarEstadoBR/normalizarCidadeBR/normalizarBairroBR,
  // que cruzam contra a tabela `localidades` IBGE/OSM pra recuperar até acento faltando).
  const _chaveLoc = s => (s||'').toString().normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
  const { normalizarEstadoBR: _normEstadoDisp, normalizarCidadeBR: _normCidadeDisp, normalizarBairroBR: _normBairroDisp } = require('./services/salvarImovel');
  // Monta dados para filtros em cascata — agrupa por chave normalizada, mas
  // exibe o nome canônico (evita "SANTA CATARINA" e "SANTA-CATARINA" como
  // opções separadas no dropdown)
  const estadosPorChave = {};
  const cidadesPorEstado = {};
  const bairrosPorCidade = {};
  imoveis.forEach(i => {
    const estDisp = _normEstadoDisp(i.estado);
    const cidDisp = _normCidadeDisp(estDisp, i.cidade);
    const baiDisp = _normBairroDisp(cidDisp, i.bairro);
    const estChave = _chaveLoc(estDisp);
    const cidChave = _chaveLoc(cidDisp);
    if (estChave) estadosPorChave[estChave] = estDisp;
    if (estChave && cidChave) {
      if (!cidadesPorEstado[estChave]) cidadesPorEstado[estChave] = {};
      cidadesPorEstado[estChave][cidChave] = cidDisp;
    }
    if (cidChave && baiDisp) {
      if (!bairrosPorCidade[cidChave]) bairrosPorCidade[cidChave] = new Set();
      bairrosPorCidade[cidChave].add(baiDisp);
    }
  });
  const estados = Object.values(estadosPorChave).sort();
  const cidades = {};
  Object.keys(cidadesPorEstado).forEach(chaveEst => {
    cidades[estadosPorChave[chaveEst]] = Object.values(cidadesPorEstado[chaveEst]).sort();
  });
  const bairros = {};
  Object.keys(bairrosPorCidade).forEach(chaveCid => {
    // acha o nome de exibição da cidade a partir de qualquer entrada com essa chave
    let nomeCidade = chaveCid;
    Object.values(cidadesPorEstado).forEach(mapa => { if (mapa[chaveCid]) nomeCidade = mapa[chaveCid]; });
    bairros[nomeCidade] = [...bairrosPorCidade[chaveCid]].sort();
  });
  // Filtros do servidor
  const _fEstado = (q.estado||'').trim();
  const _fCidade = (q.cidade||'').trim();
  const _fBairro = (q.bairro||'').trim();
  const _fBusca  = (q.busca||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const _norm = s => (s||'').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  if (_fEstado) imoveis = imoveis.filter(i => _chaveLoc(i.estado) === _chaveLoc(_fEstado));
  if (_fCidade) imoveis = imoveis.filter(i => _chaveLoc(i.cidade) === _chaveLoc(_fCidade));
  if (_fBairro) imoveis = imoveis.filter(i => _chaveLoc(i.bairro) === _chaveLoc(_fBairro));
  if (_fBusca)  imoveis = imoveis.filter(i => _norm(JSON.stringify(i)).includes(_fBusca));
  const _fCorretor = (q.corretor||'').trim();
  if (_fCorretor) imoveis = imoveis.filter(i => String(i.userId||i.user_id) === _fCorretor);

  const _fTipo = _norm(q.tipo||'');
  const _fOperacao = _norm(q.operacao||'');
  const _fStatus = _norm(q.status||'');
  const _fCondicao = _norm(q.condicao||'');
  const _fFase = _norm(q.fase||'');
  const _fProprietario = (q.proprietario||'').trim();
  const _fFotos = (q.fotos||'').trim();
  const _fValorMin = Number((q.valorMin||'').toString().replace(/\./g,'').replace(',','.'))||0;
  const _fValorMax = Number((q.valorMax||'').toString().replace(/\./g,'').replace(',','.'))||0;
  const _fAreaMin = Number(q.areaMin)||0;
  const _fAreaMax = Number(q.areaMax)||0;
  const _fQuartosMin = Number(q.quartosMin)||0;
  const _fQuartosMax = Number(q.quartosMax)||0;
  const _fSuitesMin = Number(q.suitesMin)||0;
  const _fSuitesMax = Number(q.suitesMax)||0;
  const _fBanheiros = Number(q.banheiros)||0;
  const _fVagasMin = Number(q.vagasMin)||0;
  const _fVagasMax = Number(q.vagasMax)||0;

  if (_fTipo) imoveis = imoveis.filter(i => _norm(i.tipo) === _fTipo);
  if (_fOperacao) imoveis = imoveis.filter(i => _norm(i.transacao||i.operacao).includes(_fOperacao));
  if (_fStatus) imoveis = imoveis.filter(i => _norm(i.status||'ativo') === _fStatus);
  if (_fCondicao) imoveis = imoveis.filter(i => _norm(i.condicao).includes(_fCondicao));
  if (_fFase) imoveis = imoveis.filter(i => _norm(i.fase || (i.dados && i.dados.fase)).includes(_fFase));
  if (_fValorMin) imoveis = imoveis.filter(i => Number(i.valor_imovel||0) >= _fValorMin);
  if (_fValorMax) imoveis = imoveis.filter(i => Number(i.valor_imovel||0) <= _fValorMax);
  if (_fAreaMin) imoveis = imoveis.filter(i => Number(i.area_m2||0) >= _fAreaMin);
  if (_fAreaMax) imoveis = imoveis.filter(i => Number(i.area_m2||0) <= _fAreaMax);
  if (_fQuartosMin) imoveis = imoveis.filter(i => Number(i.quartos||0) >= _fQuartosMin);
  if (_fQuartosMax) imoveis = imoveis.filter(i => Number(i.quartos||0) <= _fQuartosMax);
  if (_fSuitesMin) imoveis = imoveis.filter(i => Number(i.suites||0) >= _fSuitesMin);
  if (_fSuitesMax) imoveis = imoveis.filter(i => Number(i.suites||0) <= _fSuitesMax);
  if (_fBanheiros) imoveis = imoveis.filter(i => Number(i.banheiros||0) >= _fBanheiros);
  if (_fVagasMin) imoveis = imoveis.filter(i => Number(i.vagas||0) >= _fVagasMin);
  if (_fVagasMax) imoveis = imoveis.filter(i => Number(i.vagas||0) <= _fVagasMax);
  if (_fProprietario === 'sim') imoveis = imoveis.filter(i => i.proprietario && i.proprietario.nome);
  if (_fProprietario === 'nao') imoveis = imoveis.filter(i => !(i.proprietario && i.proprietario.nome));
  if (_fFotos === 'sim') imoveis = imoveis.filter(i => i.fotos && i.fotos.length > 0);
  if (_fFotos === 'nao') imoveis = imoveis.filter(i => !(i.fotos && i.fotos.length > 0));

  const _fOrdenar = (q.ordenar || 'menor-preco').trim();
  if (_fOrdenar === 'maior-preco') {
    imoveis.sort((a, b) => (Number(b.valor_imovel)||0) - (Number(a.valor_imovel)||0));
  } else if (_fOrdenar === 'recentes') {
    imoveis.sort((a, b) => new Date(b.criadoEm||b.dataCadastro||b.data_cadastro||0) - new Date(a.criadoEm||a.dataCadastro||a.data_cadastro||0));
  } else {
    imoveis.sort((a, b) => (Number(a.valor_imovel)||0) - (Number(b.valor_imovel)||0));
  }
  const _totalImoveisFiltrado = imoveis.length;
  const _totalPagesFiltrado = Math.ceil(_totalImoveisFiltrado / perPage);
  const _temFiltro = _fEstado || _fCidade || _fBairro || _fBusca || _fCorretor;
  imoveis = imoveis.slice((_page-1)*perPage, _page*perPage);
  const _queryPagina = new URLSearchParams(q);
  _queryPagina.delete('page');
  return {
    imoveisPagina: imoveis, estados, cidades, bairros, page: _page,
    totalPages: _temFiltro ? _totalPagesFiltrado : _totalPages,
    totalImoveis: _temFiltro ? _totalImoveisFiltrado : _totalImoveis,
    filtros: { estado: _fEstado, cidade: _fCidade, bairro: _fBairro },
    queryPagina: _queryPagina.toString()
  };
}

app.get('/app/imoveis', auth, async (req,res)=>{
  const _rede = req.query.rede === '1';
  let imoveis;
  if (_rede) {
    if (!global._cacheRede || !global._cacheRedeTTL || Date.now() > global._cacheRedeTTL) {
      global._cacheRede = await lerImoveis(null);
      global._cacheRedeTTL = Date.now() + 5 * 60 * 1000; // 5 min
    }
    imoveis = global._cacheRede;
  } else {
    imoveis = await lerImoveis(req.session.user.id);
  }
  const _usersRede = _rede ? (_cacheUsuarios || []) : [];
  const qaIncompleto = req.query.qa_incompleto === '1';
  if (qaIncompleto) {
    const _nQA = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    const _cQA = [{e:'santa catarina',c:'florianopolis'},{e:'santa catarina',c:'joinville'},{e:'santa catarina',c:'blumenau'},{e:'santa catarina',c:'balneario camboriu'},{e:'santa catarina',c:'itajai'},{e:'santa catarina',c:'sao jose'},{e:'santa catarina',c:'palhoca'},{e:'santa catarina',c:'biguacu'},{e:'santa catarina',c:'criciuma'},{e:'santa catarina',c:'chapeco'},{e:'sao paulo',c:'sao paulo'},{e:'sao paulo',c:'guarulhos'},{e:'sao paulo',c:'osasco'},{e:'sao paulo',c:'santo andre'},{e:'sao paulo',c:'campinas'},{e:'sao paulo',c:'sao bernardo do campo'},{e:'sao paulo',c:'sao caetano do sul'},{e:'sao paulo',c:'diadema'},{e:'sao paulo',c:'maua'},{e:'sao paulo',c:'ribeirao preto'},{e:'sao paulo',c:'sorocaba'},{e:'sao paulo',c:'sao jose dos campos'},{e:'sao paulo',c:'taubate'},{e:'sao paulo',c:'americana'},{e:'sao paulo',c:'sumare'},{e:'rio de janeiro',c:'rio de janeiro'},{e:'rio de janeiro',c:'niteroi'},{e:'rio de janeiro',c:'duque de caxias'},{e:'rio de janeiro',c:'nova iguacu'},{e:'rio de janeiro',c:'sao goncalo'},{e:'rio de janeiro',c:'petropolis'},{e:'minas gerais',c:'belo horizonte'},{e:'minas gerais',c:'contagem'},{e:'minas gerais',c:'nova lima'},{e:'minas gerais',c:'betim'},{e:'minas gerais',c:'uberlandia'},{e:'minas gerais',c:'juiz de fora'},{e:'rio grande do sul',c:'porto alegre'},{e:'rio grande do sul',c:'canoas'},{e:'rio grande do sul',c:'novo hamburgo'},{e:'parana',c:'curitiba'},{e:'parana',c:'londrina'},{e:'parana',c:'maringa'},{e:'goias',c:'goiania'},{e:'distrito federal',c:'brasilia'},{e:'bahia',c:'salvador'},{e:'pernambuco',c:'recife'},{e:'ceara',c:'fortaleza'},{e:'espirito santo',c:'vitoria'},{e:'espirito santo',c:'vila velha'},{e:'para',c:'belem'},{e:'amazonas',c:'manaus'}];
    imoveis = imoveis.filter(i => {
      const prop = (typeof i.proprietario === 'string' ? JSON.parse(i.proprietario||'{}') : i.proprietario) || {};
      const temProp = (prop.nome||'').trim() !== '' && ((prop.celular||prop.telefone||'').trim() !== '');
      const temEnd = (i.cep||'').trim() !== '' && (i.endereco||'').trim() !== '' && (i.numero||'').trim() !== '';
      return !(temProp && temEnd);
    });
  }
  const _r = _filtrarEPaginarImoveis(imoveis, req.query, 60);
  res.render('app-imoveis', { user: req.session.user, imoveis: _r.imoveisPagina, estados: _r.estados, cidades: _r.cidades, bairros: _r.bairros, qaIncompleto, rede: _rede, usersRede: _usersRede, page: _r.page, totalPages: _r.totalPages, totalImoveis: _r.totalImoveis, filtros: _r.filtros, queryPagina: _r.queryPagina, embed: req.query.embed === '1' });
});

app.post('/app/atualizar-xml', auth, checarSaldo('Importar XML', 2), async (req, res) => {
  const xmlUrl = req.body.xmlUrl;
  const userId = req.session.user.id;
  if (!xmlUrl) return res.json({ ok: false, erro: 'URL não informada' });
  try {
    const { execSync } = require('child_process');
    const path = require('path');
    const { criarJob: _cjX2 } = require('./services/importJobs');
    const { dispararWorkerXml: _dwX2 } = require('./services/workerDispatch');
    const _jobIdX2 = await _cjX2('xml', userId, xmlUrl);
    _dwX2(_jobIdX2, xmlUrl, userId);
    _cacheImoveis = null;
    await _recarregarImoveis();
    const total = (_cacheImoveis || []).filter(im => (im.userId||im.usuarioId) === userId).length;
    await salvarFeedService({ userId, url: xmlUrl, lastSyncAt: new Date().toISOString(), total, tipo: 'importado' });
    res.json({ ok: true });
  } catch(e) {
    console.error('[atualizar-xml]', e.message);
    res.json({ ok: false, erro: e.message });
  }
});

app.post('/app/excluir-xml', auth, async (req,res)=>{
  try {
    console.log('[excluir-xml] body:', JSON.stringify(req.body));
    const { lerUsuarios: _luXml, salvarTodosUsuarios: _stuXml } = require('./services/salvarUsuario');
    const users = await _luXml();
    const idx = users.findIndex(u => u.id === req.session.user.id);
    if (idx >= 0) {
      delete users[idx].xmlUrl;
      delete users[idx].xmlAtualizadoEm;
      delete users[idx].xmlTotal;
      await _stuXml(users);
    }
    // Remove feed do PostgreSQL
    await removerFeedService(req.session.user.id, req.body.xmlUrl).catch(e=>console.error('[xml-feed]',e.message));
    // Remove imóveis do PostgreSQL se solicitado
    if (req.body.removerImoveis === 'true') {
      const { query: _q } = require('./services/db');
      const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
      const xmlUrl = req.body.xmlUrl;
      // Exclui por xml_url ou por user_id se xml_url estiver vazio
      const _countByUrl = await _q('SELECT COUNT(*) as n FROM imoveis WHERE user_id=$1 AND xml_url=$2', [uid, xmlUrl]);
      if(parseInt(_countByUrl.rows[0].n) > 0) {
        await _q('DELETE FROM imoveis WHERE user_id=$1 AND xml_url=$2', [uid, xmlUrl]).catch(()=>{});
      } else {
        await _q("DELETE FROM imoveis WHERE user_id=$1 AND (xml_url=$2 OR xml_url='' OR xml_url IS NULL) AND source='xml'", [uid, xmlUrl]).catch(()=>{});
      }
      // Atualiza cache
      _cacheImoveis = (_cacheImoveis||[]).filter(i => !(i.userId===uid && i.xmlUrl===xmlUrl));
      console.log('[excluir-xml] imóveis removidos do PostgreSQL para:', uid);
    }
  } catch(e) { console.error('[excluir-xml]', e.message); }
  res.redirect('/app/cadastro');
});

app.get('/app/cadastro', auth, async (req,res)=>{
  const users = (_cacheUsuarios || []);
  const u = users.find(u => u.id === req.session.user.id) || {};
  const xmlFeeds = (await lerFeedsService(req.session.user.id)).filter(f => f.url && !f.url.includes('/feed-xml')).map(f => ({
    url: f.url, lastSyncAt: f.lastSyncAt, total: f.total || 0
  }));
  res.render('app-cadastro', { user: req.session.user, xmlFeeds });
});

////app.get('/app/portais', auth, (req,res)=>{
//  const portais = fs.existsSync(dataFile('portais.json')) ? JSON.parse(fs.readFileSync(dataFile('portais.json'),'utf8')) : [];
//  res.render('app-portais', { user: req.session.user, portais });
//});

// Onboarding inteligente — status ao vivo dos 6 passos, consultado em
// qualquer página (evita depender de cada rota passar dado pro shell)
app.get('/api/onboarding/status', auth, (req,res) => {
  try {
    const user = req.session.user;
    const leadsDoUser = filtrarPorUsuario(_cacheLeads || [], user);
    const temLeadManual = leadsDoUser.some(l => (l.origemEntrada || l.origem || '') === 'manual');
    const passos = [
      { key: 'xml', label: 'Importar XML de imóveis', desc: 'Suba um arquivo XML padrão do seu sistema pra trazer sua carteira de uma vez.', feito: !!user.xmlUrl, acao: 'Ir para Imóveis', link: '/app/imoveis' },
      { key: 'whatsapp', label: 'Conectar WhatsApp', desc: 'Escaneie o QR Code pra capturar leads e enviar vitrines automaticamente.', feito: user.whatsappStatus === 'open', acao: 'Conectar agora', link: '/app/perfil#secao-whatsapp' },
      { key: 'instagram', label: 'Conectar Instagram', desc: 'Publique seus imóveis direto no feed/stories do Instagram.', feito: !!user.instagramContaId, acao: 'Conectar agora', link: '/app/perfil#secao-instagram' },
      { key: 'leadManual', label: 'Cadastrar uma lead manual', desc: 'Cadastre uma lead direto no app pra ver o match acontecendo.', feito: temLeadManual, acao: 'Ir para Leads', link: '/app/leads' },
      { key: 'assistente', label: 'Tirar uma dúvida com o assistente', desc: 'Pergunte qualquer coisa sobre o sistema — ele responde na hora.', feito: (user.historicoAssistente||[]).length > 0, acao: 'Abrir assistente', link: '/app/assistente' },
      { key: 'perfil', label: 'Conhecer sua área de perfil', desc: 'Veja onde configurar seus dados, WhatsApp, Instagram e mais.', feito: !!user.onboardingPerfilVisto, acao: 'Ir para Perfil', link: '/app/perfil' },
    ];
    const feitos = passos.filter(p => p.feito).length;
    res.json({ passos, total: passos.length, feitos, completo: feitos === passos.length });
  } catch(e) {
    console.error('[onboarding-status]', e.message);
    res.json({ passos: [], total: 0, feitos: 0, completo: false });
  }
});

app.get('/app/perfil', auth, async (req,res)=>{
  try {
    const { query: _qPerfil } = require('./services/db');
    const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;

    // A baixa de precisaComprarPlano acontece via webhook do Mercado Pago (sem
    // sessão) — reconsulta o banco aqui pra tirar o banner assim que o pagamento
    // cair, mesmo que o usuário nunca tenha saído dessa página.
    if (req.session.user.precisaComprarPlano) {
      const { lerUsuarios: _luPerfilPlano } = require('./services/salvarUsuario');
      const _uPlano = (await _luPerfilPlano()).find(x => x.id === uid);
      if (_uPlano && !_uPlano.precisaComprarPlano) req.session.user.precisaComprarPlano = false;
    }

    // Onboarding — marca "conheceu a área de perfil" na 1ª visita
    if (!req.session.user.onboardingPerfilVisto) {
      req.session.user.onboardingPerfilVisto = true;
      const { atualizarUsuario: _auOnb } = require('./services/salvarUsuario');
      _auOnb(uid, { onboardingPerfilVisto: true }).catch(e => console.error('[onboarding-perfil]', e.message));
    }
    const _normP = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    const _siglaParaNome = {'ac':'acre','al':'alagoas','ap':'amapa','am':'amazonas','ba':'bahia','ce':'ceara','df':'distrito federal','es':'espirito santo','go':'goias','ma':'maranhao','mt':'mato grosso','ms':'mato grosso do sul','mg':'minas gerais','pa':'para','pb':'paraiba','pr':'parana','pe':'pernambuco','pi':'piaui','rj':'rio de janeiro','rn':'rio grande do norte','rs':'rio grande do sul','ro':'rondonia','rr':'roraima','sc':'santa catarina','sp':'sao paulo','se':'sergipe','to':'tocantins'};
    const _normEstadoP = s => { const n=_normP(s); return _siglaParaNome[n]||n; };
    const _cidadesQAp = [
      {e:'santa catarina',c:'florianopolis'},{e:'santa catarina',c:'joinville'},{e:'santa catarina',c:'blumenau'},
      {e:'santa catarina',c:'balneario camboriu'},{e:'santa catarina',c:'itajai'},{e:'santa catarina',c:'sao jose'},
      {e:'santa catarina',c:'palhoca'},{e:'santa catarina',c:'biguacu'},{e:'santa catarina',c:'criciuma'},{e:'santa catarina',c:'chapeco'},
      {e:'sao paulo',c:'sao paulo'},{e:'sao paulo',c:'guarulhos'},{e:'sao paulo',c:'osasco'},{e:'sao paulo',c:'santo andre'},
      {e:'sao paulo',c:'campinas'},{e:'sao paulo',c:'sao bernardo do campo'},{e:'sao paulo',c:'sao caetano do sul'},
      {e:'sao paulo',c:'diadema'},{e:'sao paulo',c:'maua'},{e:'sao paulo',c:'ribeirao preto'},{e:'sao paulo',c:'sorocaba'},
      {e:'sao paulo',c:'sao jose dos campos'},{e:'sao paulo',c:'taubate'},{e:'sao paulo',c:'americana'},{e:'sao paulo',c:'sumare'},
      {e:'rio de janeiro',c:'rio de janeiro'},{e:'rio de janeiro',c:'niteroi'},{e:'rio de janeiro',c:'duque de caxias'},
      {e:'rio de janeiro',c:'nova iguacu'},{e:'rio de janeiro',c:'sao goncalo'},{e:'rio de janeiro',c:'petropolis'},
      {e:'minas gerais',c:'belo horizonte'},{e:'minas gerais',c:'contagem'},{e:'minas gerais',c:'nova lima'},
      {e:'minas gerais',c:'betim'},{e:'minas gerais',c:'uberlandia'},{e:'minas gerais',c:'juiz de fora'},
      {e:'rio grande do sul',c:'porto alegre'},{e:'rio grande do sul',c:'canoas'},{e:'rio grande do sul',c:'novo hamburgo'},
      {e:'parana',c:'curitiba'},{e:'parana',c:'londrina'},{e:'parana',c:'maringa'},
      {e:'goias',c:'goiania'},{e:'distrito federal',c:'brasilia'},
      {e:'bahia',c:'salvador'},{e:'pernambuco',c:'recife'},{e:'ceara',c:'fortaleza'},
      {e:'espirito santo',c:'vitoria'},{e:'espirito santo',c:'vila velha'},
      {e:'para',c:'belem'},{e:'amazonas',c:'manaus'}
    ];
    const _isQAp = (e,c) => _cidadesQAp.some(x => x.e===_normEstadoP(e) && x.c===_normP(c));
    const _imoveisUser = await _qPerfil("SELECT estado, cidade, cep, endereco, numero, proprietario FROM imoveis WHERE (user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1) AND status='ativo' AND transacao='venda'", [uid]);
    const _emCidadeQA = _imoveisUser.rows.filter(r => _isQAp(r.estado||'', r.cidade||''));
    const _totalQA = _emCidadeQA.filter(r => {
      const prop = r.proprietario || {};
      const temProp = (prop.nome||'') !== '' && ((prop.celular||prop.telefone||'') !== '');
      const temEnd = (r.cep||'') !== '' && (r.endereco||'') !== '' && (r.numero||'') !== '';
      return temProp && temEnd;
    }).length;
    const _totalIncompletos = _emCidadeQA.filter(r => {
      const prop = r.proprietario || {};
      const temProp = (prop.nome||'') !== '' && ((prop.celular||prop.telefone||'') !== '');
      const temEnd = (r.cep||'') !== '' && (r.endereco||'') !== '' && (r.numero||'') !== '';
      return !(temProp && temEnd);
    }).length;
    const _totalVenda = _imoveisUser.rows.length;
    const _senhaInicial = req.session.senhaInicialTemp || null;
    delete req.session.senhaInicialTemp;
    res.render('app-perfil', { user: req.session.user, qaCount: _totalQA, vendaCount: _totalVenda, qaIncompletos: _totalIncompletos, senhaErro: req.query.senhaErro||null, senhaSucesso: req.query.senhaSucesso||null, bemvindo: req.query.bemvindo === '1', senhaInicial: _senhaInicial, planoSucesso: req.query.planoSucesso === '1', completarPerfil: !!req.session.user.precisaCompletarPerfil, comprarPlano: !!req.session.user.precisaComprarPlano });
  } catch(e) {
    res.render('app-perfil', { user: req.session.user, qaCount: 0, vendaCount: 0, senhaErro: null, senhaSucesso: null, bemvindo: false, senhaInicial: null, planoSucesso: false, completarPerfil: !!req.session.user.precisaCompletarPerfil, comprarPlano: !!req.session.user.precisaComprarPlano });
  }
});

app.post('/app/perfil/quintoandar', auth, async (req, res) => {
  try {
    const { query: _qQA } = require('./services/db');
    const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
    const autoriza = req.body.autoriza_quintoandar === '1';
    console.log('[QA] uid:', uid, '| autoriza:', autoriza, '| body:', req.body.autoriza_quintoandar);
    const _rQA = await _qQA('UPDATE usuarios SET autoriza_quintoandar=$1 WHERE codigo_usuario=$2', [autoriza, uid]);
    console.log('[QA] rows updated:', _rQA.rowCount);
    req.session.user.autoriza_quintoandar = autoriza;
    if (_cacheUsuarios) { const _uIdx = _cacheUsuarios.findIndex(u=>u.codigoUsuario===uid||u.codigo_usuario===uid); if(_uIdx>=0) _cacheUsuarios[_uIdx].autoriza_quintoandar = autoriza; }
    const _referer = req.headers.referer || '';
    if (_referer.includes('parceria-quintoandar')) {
      res.redirect('/app/parceria-quintoandar#secao-quintoandar');
    } else {
      res.redirect('/app/perfil?msg=quintoandar_salvo');
    }
  } catch(e) {
    const _referer = req.headers.referer || '';
    if (_referer.includes('parceria-quintoandar')) {
      res.redirect('/app/parceria-quintoandar#secao-quintoandar');
    } else {
      res.redirect('/app/perfil?err='+encodeURIComponent(e.message));
    }
  }
});

// Confere se a conta criada via campanha de aquisição já cumpriu os 3
// requisitos obrigatórios (nome trocado do provisório da planilha, e-mail e
// localização) e libera o resto da plataforma (desliga precisaCompletarPerfil)
// quando completar. Retorna null se a conta não estava nessa pendência.
async function _verificarPerfilCompleto(uid) {
  try {
    const { lerUsuarios: _luVpc, atualizarUsuario: _auVpc } = require('./services/salvarUsuario');
    const users = await _luVpc();
    const u = users.find(x => x.id === uid);
    if (!u || !u.precisaCompletarPerfil) return null;
    const nomeTrocado = !!(u.nome && u.nome.trim() && u.nome.trim() !== (u.nomeImportado || '').trim());
    const completo = !!(nomeTrocado && u.email && u.lat && u.lng);
    if (completo) {
      await _auVpc(uid, { precisaCompletarPerfil: false });
      if (_cacheUsuarios) { const idx = _cacheUsuarios.findIndex(x => x.id === uid); if (idx >= 0) _cacheUsuarios[idx].precisaCompletarPerfil = false; }
    }
    return completo;
  } catch(e) { console.error('[perfil-completo]', e.message); return null; }
}

app.post('/app/perfil', auth, async (req,res)=>{
  const { atualizarUsuario: _auPerfil } = require('./services/salvarUsuario');
  let uid = String(req.session.user.id || '');
  const novoNome = (req.body.nome || '').trim();

  // Renomeação obrigatória de conta criada via campanha: troca o código de
  // usuário pra refletir o nome real (mesmo padrão gerarCodigoUsuario do
  // cadastro normal), só nessa janela de "precisa completar perfil" — antes
  // do usuário ter qualquer imóvel/lead vinculado. Depois de completar, o
  // código nunca mais muda (trocar depois quebraria os vínculos existentes).
  if (req.session.user.precisaCompletarPerfil && novoNome && novoNome !== (req.session.user.nomeImportado || '') && novoNome.length >= 3) {
    const novoCodigo = gerarCodigoUsuario(novoNome);
    try {
      const { query: _qRename } = require('./services/db');
      await _qRename('UPDATE usuarios SET id=$1, codigo_usuario=$1 WHERE id=$2', [novoCodigo, uid]);
      if (_cacheUsuarios) { const idx = _cacheUsuarios.findIndex(u => u.id === uid); if (idx >= 0) { _cacheUsuarios[idx].id = novoCodigo; _cacheUsuarios[idx].codigoUsuario = novoCodigo; } }
      req.session.user.id = novoCodigo;
      req.session.user.codigoUsuario = novoCodigo;
      uid = novoCodigo;
      console.log('[perfil] código de usuário atualizado pro novo nome:', novoCodigo);
    } catch(e) { console.error('[perfil] erro ao renomear código:', e.message); }
  }

  const dados = {
    nome: req.body.nome || '',
    creci: req.body.creci || '',
    cpf: req.body.cpf || '',
    email: req.body.email || '',
    celular: req.body.celular || '',
    telefone: req.body.celular || ''
  };
  await _auPerfil(uid, dados).catch(e=>console.error("[perfil]",e.message));
  req.session.user = { ...req.session.user, ...dados };

  if (req.session.user.precisaCompletarPerfil) {
    const completo = await _verificarPerfilCompleto(uid);
    if (completo) req.session.user.precisaCompletarPerfil = false;
  }

  res.redirect('/app/perfil' + (req.session.user.precisaCompletarPerfil ? '?completarPerfil=1' : ''));
});

// ── MEU SITE (white-label público) ────────────────────────────────────────────
const _SITE_CONFIG_PADRAO = { cor_primaria: '#FF385C', cor_cabecalho: '', cor_rodape: '', cor_texto_rodape: '', logo_url: '', rodape_nome: '', rodape_telefone: '', rodape_endereco: '', rodape_cep: '', rodape_rua: '', rodape_numero: '', rodape_complemento: '', rodape_cidade: '', rodape_estado: '', rodape_texto: '', rodape_instagram: '', rodape_facebook: '', site_ativo: true, dominio_personalizado: '', dominio_status: 'nao_configurado', meta_pixel_id: '', google_analytics_id: '', financiamento_url: '', financiamento_ativo: false };
const _DOMINIO_REGEX = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

app.get('/app/meu-site', auth, async (req, res) => {
  try {
    const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
    const { buscarConfig } = require('./services/salvarSiteConfig');
    const configSalva = await buscarConfig(uid).catch(() => null);
    const siteConfig = configSalva || _SITE_CONFIG_PADRAO;
    res.render('app-meu-site', { user: req.session.user, siteConfig, codigoUsuario: uid, msg: req.query.msg || null, fallbackOrigin: process.env.CLOUDFLARE_FALLBACK_ORIGIN || '' });
  } catch(e) {
    console.error('[meu-site]', e.message);
    res.render('app-meu-site', { user: req.session.user, siteConfig: _SITE_CONFIG_PADRAO, codigoUsuario: req.session.user.codigoUsuario || req.session.user.id, msg: null, fallbackOrigin: process.env.CLOUDFLARE_FALLBACK_ORIGIN || '' });
  }
});

app.post('/app/meu-site', auth, async (req, res) => {
  try {
    const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
    const { salvarConfig } = require('./services/salvarSiteConfig');
    await salvarConfig(uid, {
      cor_primaria: req.body.cor_primaria || '#FF385C',
      cor_cabecalho: /^#[0-9a-f]{6}$/i.test(req.body.cor_cabecalho||'') ? req.body.cor_cabecalho : '',
      cor_rodape: /^#[0-9a-f]{6}$/i.test(req.body.cor_rodape||'') ? req.body.cor_rodape : '',
      cor_texto_rodape: /^#[0-9a-f]{6}$/i.test(req.body.cor_texto_rodape||'') ? req.body.cor_texto_rodape : '',
      rodape_nome: req.body.rodape_nome || '',
      rodape_telefone: req.body.rodape_telefone || '',
      rodape_cep: req.body.rodape_cep || '',
      rodape_rua: req.body.rodape_rua || '',
      rodape_numero: req.body.rodape_numero || '',
      rodape_complemento: req.body.rodape_complemento || '',
      rodape_cidade: req.body.rodape_cidade || '',
      rodape_estado: req.body.rodape_estado || '',
      rodape_endereco: [
        [req.body.rodape_rua||'', req.body.rodape_numero||'', req.body.rodape_complemento||''].filter(Boolean).join(', '),
        [req.body.rodape_cidade||'', req.body.rodape_estado||''].filter(Boolean).join('/')
      ].filter(Boolean).join(' - '),
      rodape_texto: req.body.rodape_texto || '',
      rodape_instagram: req.body.rodape_instagram || '',
      rodape_facebook: req.body.rodape_facebook || '',
      meta_pixel_id: /^\d{10,20}$/.test((req.body.meta_pixel_id||'').trim()) ? req.body.meta_pixel_id.trim() : '',
      google_analytics_id: /^G-[A-Z0-9]{6,12}$/i.test((req.body.google_analytics_id||'').trim()) ? req.body.google_analytics_id.trim() : '',
      financiamento_url: /^https?:\/\/.+/i.test((req.body.financiamento_url||'').trim()) ? req.body.financiamento_url.trim() : '',
      financiamento_ativo: req.body.financiamento_ativo === '1',
      site_ativo: req.body.site_ativo === '1'
    });
    res.redirect('/app/meu-site?msg=salvo');
  } catch(e) {
    console.error('[meu-site/salvar]', e.message);
    res.redirect('/app/meu-site?msg=erro');
  }
});

app.post('/app/meu-site/dominio', auth, async (req, res) => {
  try {
    const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
    const dominio = String(req.body.dominio || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!_DOMINIO_REGEX.test(dominio)) return res.redirect('/app/meu-site?msg=dominio_invalido');

    const { salvarConfig, buscarConfig } = require('./services/salvarSiteConfig');
    const { criarCustomHostname, deletarCustomHostname } = require('./services/cloudflareDominio');

    // Se já tinha um domínio diferente configurado, remove o hostname antigo da Cloudflare antes de trocar
    const atual = await buscarConfig(uid).catch(() => null);
    if (atual && atual.cloudflare_hostname_id && atual.dominio_personalizado !== dominio) {
      await deletarCustomHostname(atual.cloudflare_hostname_id);
    }

    const hostnameCf = await criarCustomHostname(dominio);
    await salvarConfig(uid, {
      dominio_personalizado: dominio,
      dominio_status: 'aguardando_dns',
      dominio_verificado_em: null,
      cloudflare_hostname_id: hostnameCf.id
    });
    res.redirect('/app/meu-site?msg=dominio_salvo');
  } catch(e) {
    console.error('[meu-site/dominio]', e.message);
    res.redirect('/app/meu-site?msg=dominio_erro&erro=' + encodeURIComponent(e.message));
  }
});

app.post('/app/meu-site/dominio/verificar', auth, async (req, res) => {
  try {
    const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
    const { salvarConfig, buscarConfig } = require('./services/salvarSiteConfig');
    const { buscarCustomHostname, interpretarStatus } = require('./services/cloudflareDominio');

    const atual = await buscarConfig(uid).catch(() => null);
    if (!atual || !atual.cloudflare_hostname_id) return res.redirect('/app/meu-site?msg=dominio_erro');

    const hostnameCf = await buscarCustomHostname(atual.cloudflare_hostname_id);
    const { dominioStatus } = interpretarStatus(hostnameCf);
    await salvarConfig(uid, {
      dominio_status: dominioStatus,
      dominio_verificado_em: dominioStatus === 'verificado' ? new Date() : atual.dominio_verificado_em
    });
    res.redirect('/app/meu-site?msg=dominio_verificado');
  } catch(e) {
    console.error('[meu-site/dominio/verificar]', e.message);
    res.redirect('/app/meu-site?msg=dominio_erro&erro=' + encodeURIComponent(e.message));
  }
});

app.post('/app/meu-site/dominio/remover', auth, async (req, res) => {
  try {
    const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
    const { salvarConfig, buscarConfig } = require('./services/salvarSiteConfig');
    const { deletarCustomHostname } = require('./services/cloudflareDominio');

    const atual = await buscarConfig(uid).catch(() => null);
    if (atual && atual.cloudflare_hostname_id) {
      await deletarCustomHostname(atual.cloudflare_hostname_id);
    }
    await salvarConfig(uid, { dominio_personalizado: '', dominio_status: 'nao_configurado', dominio_verificado_em: null, cloudflare_hostname_id: '' });
    res.redirect('/app/meu-site?msg=dominio_removido');
  } catch(e) {
    console.error('[meu-site/dominio/remover]', e.message);
    res.redirect('/app/meu-site?msg=dominio_erro');
  }
});

// (rota /app/meu-site/logo fica registrada mais abaixo, junto de uploadImoveis)
// ── FIM MEU SITE ────────────────────────────────────────────────────────────

// ── INDICAÇÕES (programa de indicação de parceiros) ───────────────────────────
app.get('/app/indicacoes', auth, async (req, res) => {
  const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
  try {
    const indicados = (_cacheUsuarios || [])
      .filter(u => u.indicadoPor === uid)
      .map(u => ({ nome: u.nome || '-', telefone: u.celular || u.telefone || '', criadoEm: u.criadoEm, ativo: u.ativo !== false }))
      .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));
    const { listarBonusPorIndicador, totalBonusPorIndicador } = require('./services/salvarIndicacao');
    const bonusHistorico = await listarBonusPorIndicador(uid).catch(() => []);
    const totalGanho = await totalBonusPorIndicador(uid).catch(() => 0);
    res.render('app-indicacoes', { user: req.session.user, codigoUsuario: uid, indicados, bonusHistorico, totalGanho });
  } catch(e) {
    console.error('[indicacoes]', e.message);
    res.render('app-indicacoes', { user: req.session.user, codigoUsuario: uid, indicados: [], bonusHistorico: [], totalGanho: 0 });
  }
});
// ── FIM INDICAÇÕES ─────────────────────────────────────────────────────────────

app.post('/app/perfil/vitrine', auth, async (req,res)=>{
  const { atualizarUsuario: _auVitrine } = require('./services/salvarUsuario');
  const uid = String(req.session.user.id || '');
  const val = req.body.vitrineApenasPropriosImoveis === 'true';
  await _auVitrine(uid, { vitrineApenasPropriosImoveis: val }).catch(e=>console.error("[perfil/vitrine]",e.message));
  req.session.user = { ...req.session.user, vitrineApenasPropriosImoveis: val };
  res.redirect('/app/perfil');
});

app.get('/app/instagram/conectar', auth, (req,res)=>{
  const { getAuthUrl } = require('./services/instagram');
  const crypto = require('crypto');
  const state = crypto.randomBytes(16).toString('hex');
  req.session.igOAuthState = state;
  res.redirect(getAuthUrl(state));
});

app.get('/app/instagram/callback', auth, async (req,res)=>{
  try {
    if (req.query.error) {
      return res.redirect('/app/perfil?err=' + encodeURIComponent('Autorização do Instagram cancelada.'));
    }
    if (!req.query.state || req.query.state !== req.session.igOAuthState) {
      return res.redirect('/app/perfil?err=' + encodeURIComponent('Sessão de autorização inválida, tente novamente.'));
    }
    delete req.session.igOAuthState;
    const code = req.query.code;
    if (!code) return res.redirect('/app/perfil?err=' + encodeURIComponent('Código de autorização não recebido.'));

    const { trocarCodePorToken, obterTokenLongoPrazo, obterUsername } = require('./services/instagram');
    const { atualizarUsuario: _auInstaOn } = require('./services/salvarUsuario');
    const uid = String(req.session.user.id || '');

    const { accessToken: shortToken, igUserId } = await trocarCodePorToken(code);
    if (!igUserId) {
      return res.redirect('/app/perfil?err=' + encodeURIComponent('Não foi possível identificar a conta Instagram Business. Verifique se a conta é comercial/criador.'));
    }
    const longToken = await obterTokenLongoPrazo(shortToken);
    const igUsername = await obterUsername(igUserId, longToken);

    const dadosInsta = {
      instagramToken: longToken,
      instagramContaId: igUserId,
      instagramUsername: igUsername
    };
    await _auInstaOn(uid, dadosInsta);
    req.session.user = { ...req.session.user, ...dadosInsta };
    if (_cacheUsuarios) { const _uIdx = _cacheUsuarios.findIndex(u=>u.codigoUsuario===uid||u.codigo_usuario===uid||u.id===uid); if(_uIdx>=0) Object.assign(_cacheUsuarios[_uIdx], dadosInsta); }
    res.redirect('/app/perfil?msg=' + encodeURIComponent('Instagram conectado com sucesso!'));
  } catch(e) {
    console.error('[instagram/callback]', e.message);
    res.redirect('/app/perfil?err=' + encodeURIComponent('Erro ao conectar Instagram: ' + e.message));
  }
});

app.post('/app/instagram/desconectar', auth, async (req,res)=>{
  const { atualizarUsuario: _auInstaOff } = require('./services/salvarUsuario');
  const uid = String(req.session.user.id || '');
  const dadosInsta = { instagramToken: null, instagramContaId: null, instagramUsername: null };
  await _auInstaOff(uid, dadosInsta).catch(e=>console.error("[instagram/desconectar]",e.message));
  req.session.user = { ...req.session.user, ...dadosInsta };
  if (_cacheUsuarios) { const _uIdx = _cacheUsuarios.findIndex(u=>u.codigoUsuario===uid||u.codigo_usuario===uid||u.id===uid); if(_uIdx>=0) Object.assign(_cacheUsuarios[_uIdx], dadosInsta); }
  res.redirect('/app/perfil');
});

// ── META ADS (campanha de anúncio pago) — OAuth padrão do Facebook, precisa
// de Conta de Anúncios + Página do próprio corretor (com pagamento configurado
// do lado dele). Usa META_ADS_APP_ID/SECRET (env vars próprias — diferente do
// FACEBOOK_APP_ID/SECRET do Instagram Login, são apps distintos no Meta), pedindo
// permissões extras que exigem aprovação separada do Meta (App Review):
// ads_management, pages_manage_ads, leads_retrieval, business_management ──
app.get('/app/meta-ads/conectar', auth, (req,res)=>{
  const { getAuthUrl } = require('./services/metaAds');
  const crypto = require('crypto');
  const state = crypto.randomBytes(16).toString('hex');
  req.session.metaAdsOAuthState = state;
  res.redirect(getAuthUrl(state));
});

app.get('/app/meta-ads/callback', auth, async (req,res)=>{
  try {
    if (req.query.error) {
      return res.redirect('/app/redes-sociais/campanha?err=' + encodeURIComponent('Autorização do Meta cancelada.'));
    }
    if (!req.query.state || req.query.state !== req.session.metaAdsOAuthState) {
      return res.redirect('/app/redes-sociais/campanha?err=' + encodeURIComponent('Sessão de autorização inválida, tente novamente.'));
    }
    delete req.session.metaAdsOAuthState;
    const code = req.query.code;
    if (!code) return res.redirect('/app/redes-sociais/campanha?err=' + encodeURIComponent('Código de autorização não recebido.'));

    const { trocarCodePorToken, obterTokenLongoPrazo } = require('./services/metaAds');
    const { atualizarUsuario: _auMetaOn } = require('./services/salvarUsuario');
    const uid = String(req.session.user.id || '');

    const shortToken = await trocarCodePorToken(code);
    const longToken = await obterTokenLongoPrazo(shortToken);

    const dadosMeta = { metaAdsToken: longToken };
    await _auMetaOn(uid, dadosMeta);
    req.session.user = { ...req.session.user, ...dadosMeta };
    if (_cacheUsuarios) { const _uIdx = _cacheUsuarios.findIndex(u=>u.codigoUsuario===uid||u.codigo_usuario===uid||u.id===uid); if(_uIdx>=0) Object.assign(_cacheUsuarios[_uIdx], dadosMeta); }
    res.redirect('/app/redes-sociais/campanha?msg=' + encodeURIComponent('Conta do Meta conectada! Escolha a Conta de Anúncios e a Página.'));
  } catch(e) {
    console.error('[meta-ads/callback]', e.message);
    res.redirect('/app/redes-sociais/campanha?err=' + encodeURIComponent('Erro ao conectar com o Meta: ' + e.message));
  }
});

app.post('/app/meta-ads/desconectar', auth, async (req,res)=>{
  const { atualizarUsuario: _auMetaOff } = require('./services/salvarUsuario');
  const uid = String(req.session.user.id || '');
  const dadosMeta = { metaAdsToken: null };
  await _auMetaOff(uid, dadosMeta).catch(e=>console.error("[meta-ads/desconectar]",e.message));
  req.session.user = { ...req.session.user, ...dadosMeta };
  if (_cacheUsuarios) { const _uIdx = _cacheUsuarios.findIndex(u=>u.codigoUsuario===uid||u.codigo_usuario===uid||u.id===uid); if(_uIdx>=0) Object.assign(_cacheUsuarios[_uIdx], dadosMeta); }
  res.redirect('/app/redes-sociais/campanha');
});

// Lista as Contas de Anúncio e Páginas do corretor logado — usado pelos
// selects da tela de criação de campanha
app.get('/app/meta-ads/contas', auth, async (req,res)=>{
  try {
    const user = req.session.user;
    if (!user.metaAdsToken) return res.status(400).json({ ok:false, erro:'Conta do Meta não conectada.' });
    const { listarContasAnuncio, listarPaginas } = require('./services/metaAds');
    const [contas, paginas] = await Promise.all([
      listarContasAnuncio(user.metaAdsToken),
      listarPaginas(user.metaAdsToken)
    ]);
    res.json({ ok:true, contas, paginas: paginas.map(p=>({id:p.id, name:p.name})) });
  } catch(e) {
    res.status(500).json({ ok:false, erro: e.message });
  }
});

// Públicos salvos (Saved Audiences) que o corretor já configurou na Conta de
// Anúncios pelo próprio Gerenciador de Anúncios — pra escolher em vez de
// montar público na mão toda vez que cria uma campanha
app.get('/app/meta-ads/publicos-salvos', auth, async (req,res)=>{
  try {
    if (!_podeUsarPosts(req.session.user)) return res.status(403).json({ ok:false, erro:'Sem acesso.' });
    const user = req.session.user;
    if (!user.metaAdsToken) return res.status(400).json({ ok:false, erro:'Conta do Meta não conectada.' });
    const { contaAnuncioId } = req.query;
    if (!contaAnuncioId) return res.status(400).json({ ok:false, erro:'Informe a conta de anúncios.' });
    const { listarPublicosSalvos } = require('./services/metaAds');
    const publicos = await listarPublicosSalvos(contaAnuncioId, user.metaAdsToken);
    res.json({ ok:true, publicos: publicos.map(p=>({id:p.id, name:p.name})) });
  } catch(e) {
    res.status(500).json({ ok:false, erro: e.message });
  }
});

app.post('/app/meta-ads/campanha', auth, async (req,res)=>{
  try {
    if (!_podeUsarPosts(req.session.user)) return res.status(403).json({ ok:false, erro:'Sem acesso.' });
    const user = req.session.user;
    const uid = String(user.id || user.codigoUsuario || '');
    if (!user.metaAdsToken) return res.status(400).json({ ok:false, erro:'Conecte sua conta do Meta primeiro.' });

    const { imovelId, objetivo, contaAnuncioId, pageId, orcamentoDiario, publico, publicoSalvoId, whatsappNumero, tituloAnuncio, descricaoAnuncio, tituloSecundario, ctaLeadForm } = req.body;
    if (!imovelId || !objetivo || !contaAnuncioId || !pageId || !orcamentoDiario) {
      return res.status(400).json({ ok:false, erro:'Imóvel, objetivo, conta de anúncio, página e orçamento são obrigatórios.' });
    }
    if (!['lead_form','trafego','whatsapp'].includes(objetivo)) {
      return res.status(400).json({ ok:false, erro:'Objetivo inválido.' });
    }

    const imoveis = lerImoveis(user);
    const imovel = imoveis.find(i => String(i.idExterno)===String(imovelId) || String(i.idInterno)===String(imovelId) || String(i.id)===String(imovelId));
    if (!imovel) return res.status(404).json({ ok:false, erro:'Imóvel não encontrado na sua carteira.' });
    if (!(imovel.fotos||[]).length) return res.status(400).json({ ok:false, erro:'O imóvel precisa ter pelo menos 1 foto pra criar o anúncio.' });

    const { listarPaginas, criarCampanhaCompleta } = require('./services/metaAds');
    const paginas = await listarPaginas(user.metaAdsToken);
    const pagina = paginas.find(p => String(p.id) === String(pageId));
    if (!pagina) return res.status(400).json({ ok:false, erro:'Página não encontrada ou sem permissão.' });

    let numeroWA = whatsappNumero;
    if (objetivo === 'whatsapp' && !numeroWA) {
      numeroWA = (user.whatsappNumero || user.celular || user.telefone || '').replace(/\D/g,'');
    }
    if (objetivo === 'whatsapp' && !numeroWA) {
      return res.status(400).json({ ok:false, erro:'Não encontramos um número de WhatsApp pra receber os leads. Conecte o WhatsApp em Perfil ou informe um número.' });
    }

    const orcamentoDiarioCentavos = Math.round(Number(orcamentoDiario) * 100);
    if (!orcamentoDiarioCentavos || orcamentoDiarioCentavos < 100) {
      return res.status(400).json({ ok:false, erro:'Orçamento diário mínimo é R$1.' });
    }

    // Centro do raio de público = localização do próprio imóvel (geocodifica
    // na hora se ainda não tiver, mesmo fallback usado na página pública)
    const publicoFinal = { ...(publico || {}) };
    // "outros" (checkbox do corretor) vira Rede de Audiência + Messenger pro
    // Meta — as únicas 4 plataformas de publisher_platforms que existem
    const PLATAFORMAS_VALIDAS = { facebook: ['facebook'], instagram: ['instagram'], outros: ['audience_network', 'messenger'] };
    if (Array.isArray(publicoFinal.plataformas)) {
      publicoFinal.plataformas = [...new Set(publicoFinal.plataformas.flatMap(p => PLATAFORMAS_VALIDAS[p] || []))];
      if (!publicoFinal.plataformas.length) delete publicoFinal.plataformas;
    } else {
      delete publicoFinal.plataformas;
    }

    // Público salvo (Saved Audience) que o corretor já configurou no
    // Gerenciador de Anúncios do Meta substitui o público montado na mão
    // (raio/idade/gênero/locais) — usa o targeting spec dele direto
    if (publicoSalvoId) {
      const { buscarPublicoSalvo } = require('./services/metaAds');
      const salvo = await buscarPublicoSalvo(publicoSalvoId, user.metaAdsToken);
      if (!salvo || !salvo.targeting) return res.status(400).json({ ok:false, erro:'Público salvo não encontrado ou sem permissão.' });
      publicoFinal.targetingSalvo = salvo.targeting;
      // Guarda o ID separado (não só o targeting resolvido) pra pré-selecionar
      // o mesmo público salvo no dropdown quando o corretor for editar depois
      publicoFinal.publicoSalvoId = publicoSalvoId;
    } else {
      if (publicoFinal.raioKm && (!imovel.latitude || !imovel.longitude)) {
        const { _geocodificarEndereco } = require('./services/salvarImovel');
        const geo = await _geocodificarEndereco(imovel);
        if (geo) { imovel.latitude = geo.latitude; imovel.longitude = geo.longitude; }
      }
      if (publicoFinal.raioKm && imovel.latitude && imovel.longitude) {
        publicoFinal.latitude = imovel.latitude;
        publicoFinal.longitude = imovel.longitude;
      }
    }

    // Link do anúncio prioriza o domínio próprio do corretor (feature "Meu Site")
    // quando ele já tiver um domínio configurado e verificado — senão cai no
    // matchimoveis.ia.br (comportamento padrão já tratado dentro de metaAds.js)
    const idPublicoImovel = imovel.idInterno || imovel.id_interno || imovel.id;
    let linkAnuncio = null;
    try {
      const { buscarConfig } = require('./services/salvarSiteConfig');
      const siteConfig = await buscarConfig(uid);
      if (siteConfig && siteConfig.dominio_personalizado && siteConfig.dominio_status === 'verificado') {
        linkAnuncio = `https://${siteConfig.dominio_personalizado}/imovel/${idPublicoImovel}`;
      }
    } catch (e) { console.error('[meta-ads/campanha] falha ao resolver domínio próprio:', e.message); }

    const CTAS_LEAD_VALIDOS = ['SIGN_UP','LEARN_MORE','CONTACT_US','GET_QUOTE','APPLY_NOW','REGISTER_NOW','MAKE_AN_APPOINTMENT','GET_IN_TOUCH'];
    const resultado = await criarCampanhaCompleta({
      contaAnuncioId, pageId, pageToken: pagina.access_token, token: user.metaAdsToken,
      imovel, objetivo, orcamentoDiarioCentavos, publico: publicoFinal, whatsappNumero: numeroWA,
      tituloAnuncio: (tituloAnuncio||'').trim(), descricaoAnuncio: (descricaoAnuncio||'').trim(),
      tituloSecundario: (tituloSecundario||'').trim(),
      ctaLeadForm: CTAS_LEAD_VALIDOS.includes(ctaLeadForm) ? ctaLeadForm : 'SIGN_UP',
      linkAnuncio
    });

    const { criarCampanhaRegistro } = require('./services/salvarCampanhaMeta');
    const registro = await criarCampanhaRegistro({
      userId: uid, imovelId: String(imovelId), objetivo, orcamentoDiarioCentavos, publico: publicoFinal,
      contaAnuncioId, pageId, campaignId: resultado.campaignId, adsetId: resultado.adsetId,
      creativeId: resultado.creativeId, adId: resultado.adId, leadformId: resultado.leadFormId, status: 'pausada',
      tituloAnuncio: (tituloAnuncio||'').trim(), descricaoAnuncio: (descricaoAnuncio||'').trim(),
      tituloSecundario: (tituloSecundario||'').trim(),
      ctaLeadForm: CTAS_LEAD_VALIDOS.includes(ctaLeadForm) ? ctaLeadForm : 'SIGN_UP'
    });

    consumir(uid, 'campanha_meta_criada').catch(e=>console.error('[creditos] campanha_meta_criada falhou:', e.message));

    res.json({ ok:true, campanha: registro });
  } catch(e) {
    console.error('[meta-ads/campanha]', e.message);
    res.status(500).json({ ok:false, erro: e.message });
  }
});

// Edita uma campanha já criada. Orçamento e público (targeting) são editáveis
// de verdade no adset. Status ativa/pausa a campanha. Título/descrição/título
// secundário/CTA do anúncio — o criativo é imutável no Meta, então "editar"
// texto na prática cria um criativo novo (mesmo leadform/link/objetivo) e
// troca o anúncio existente pra apontar pra ele; campanha/adset continuam os
// mesmos, só o creative_id do anúncio muda.
app.post('/app/meta-ads/campanha/:id/editar', auth, async (req,res)=>{
  try {
    if (!_podeUsarPosts(req.session.user)) return res.status(403).json({ ok:false, erro:'Sem acesso.' });
    const user = req.session.user;
    const uid = String(user.id || user.codigoUsuario || '');
    if (!user.metaAdsToken) return res.status(400).json({ ok:false, erro:'Conecte sua conta do Meta primeiro.' });

    const { buscarCampanha, atualizarOrcamentoCampanha, atualizarPublicoCampanha, atualizarStatusCampanha, atualizarCreativeCampanha } = require('./services/salvarCampanhaMeta');
    const { atualizarAdSet, atualizarAdCreative, criarCreative, buscarPublicoSalvo, montarTargeting, listarPaginas, ativarCampanha, pausarCampanha } = require('./services/metaAds');
    const campanha = await buscarCampanha(req.params.id, uid);
    if (!campanha) return res.status(404).json({ ok:false, erro:'Campanha não encontrada.' });

    const { orcamentoDiario, status, publico, publicoSalvoId, tituloAnuncio, descricaoAnuncio, tituloSecundario, ctaLeadForm } = req.body;

    // Orçamento e/ou público (targeting) — os 2 vivem no adset, dá pra
    // atualizar num só POST se os dois mudaram
    let centavos = null;
    if (orcamentoDiario) {
      centavos = Math.round(Number(orcamentoDiario) * 100);
      if (!centavos || centavos < 100) return res.status(400).json({ ok:false, erro:'Orçamento diário mínimo é R$1.' });
    }
    let publicoFinal = null;
    if (publico || publicoSalvoId) {
      publicoFinal = { ...(publico || {}) };
      const PLATAFORMAS_VALIDAS = { facebook: ['facebook'], instagram: ['instagram'], outros: ['audience_network', 'messenger'] };
      if (Array.isArray(publicoFinal.plataformas)) {
        publicoFinal.plataformas = [...new Set(publicoFinal.plataformas.flatMap(p => PLATAFORMAS_VALIDAS[p] || []))];
        if (!publicoFinal.plataformas.length) delete publicoFinal.plataformas;
      } else {
        delete publicoFinal.plataformas;
      }
      if (publicoSalvoId) {
        const salvo = await buscarPublicoSalvo(publicoSalvoId, user.metaAdsToken);
        if (!salvo || !salvo.targeting) return res.status(400).json({ ok:false, erro:'Público salvo não encontrado ou sem permissão.' });
        publicoFinal.targetingSalvo = salvo.targeting;
        publicoFinal.publicoSalvoId = publicoSalvoId;
      }
    }
    if (centavos || publicoFinal) {
      const targeting = publicoFinal ? (publicoFinal.targetingSalvo || montarTargeting(publicoFinal)) : undefined;
      await atualizarAdSet({ adsetId: campanha.adsetId, token: user.metaAdsToken, orcamentoDiarioCentavos: centavos || undefined, targeting });
      if (centavos) await atualizarOrcamentoCampanha(campanha.id, centavos);
      if (publicoFinal) await atualizarPublicoCampanha(campanha.id, publicoFinal);
    }

    // Texto/CTA do anúncio — cria criativo novo e troca no anúncio existente
    if (tituloAnuncio !== undefined || descricaoAnuncio !== undefined || tituloSecundario !== undefined || ctaLeadForm !== undefined) {
      const imoveis = lerImoveis(user);
      const imovel = imoveis.find(i => String(i.idExterno)===String(campanha.imovelId) || String(i.idInterno)===String(campanha.imovelId) || String(i.id)===String(campanha.imovelId));
      if (!imovel) return res.status(404).json({ ok:false, erro:'Imóvel da campanha não encontrado na sua carteira.' });

      const paginas = await listarPaginas(user.metaAdsToken);
      const pagina = paginas.find(p => String(p.id) === String(campanha.pageId));
      if (!pagina) return res.status(400).json({ ok:false, erro:'Página não encontrada ou sem permissão.' });

      const idPublicoImovel = imovel.idInterno || imovel.id_interno || imovel.id;
      let linkAnuncio = null;
      try {
        const { buscarConfig } = require('./services/salvarSiteConfig');
        const siteConfig = await buscarConfig(uid);
        if (siteConfig && siteConfig.dominio_personalizado && siteConfig.dominio_status === 'verificado') {
          linkAnuncio = `https://${siteConfig.dominio_personalizado}/imovel/${idPublicoImovel}`;
        }
      } catch (e) {}

      const CTAS_LEAD_VALIDOS = ['SIGN_UP','LEARN_MORE','CONTACT_US','GET_QUOTE','APPLY_NOW','REGISTER_NOW','MAKE_AN_APPOINTMENT','GET_IN_TOUCH'];
      const tituloFinal = (tituloAnuncio !== undefined ? tituloAnuncio : campanha.tituloAnuncio) || '';
      const descricaoFinal = (descricaoAnuncio !== undefined ? descricaoAnuncio : campanha.descricaoAnuncio) || '';
      const secundarioFinal = (tituloSecundario !== undefined ? tituloSecundario : campanha.tituloSecundario) || '';
      const ctaFinal = CTAS_LEAD_VALIDOS.includes(ctaLeadForm) ? ctaLeadForm : (campanha.ctaLeadForm || 'SIGN_UP');
      const nomeBase = `MatchImoveis - ${imovel.titulo || 'Imovel'}`.slice(0, 100);

      const novoCreativeId = await criarCreative({
        contaAnuncioId: campanha.contaAnuncioId, token: user.metaAdsToken, pageId: campanha.pageId,
        nome: nomeBase + ' - ' + Date.now(), imovel, objetivo: campanha.objetivo,
        leadFormId: campanha.leadformId, whatsappNumero: (user.whatsappNumero||user.celular||user.telefone||'').replace(/\D/g,''),
        tituloAnuncio: tituloFinal.trim(), descricaoAnuncio: descricaoFinal.trim(), tituloSecundario: secundarioFinal.trim(),
        ctaLeadForm: ctaFinal, link: linkAnuncio
      });
      await atualizarAdCreative({ adId: campanha.adId, token: user.metaAdsToken, creativeId: novoCreativeId });
      await atualizarCreativeCampanha(campanha.id, {
        creativeId: novoCreativeId, tituloAnuncio: tituloFinal.trim(), descricaoAnuncio: descricaoFinal.trim(),
        tituloSecundario: secundarioFinal.trim(), ctaLeadForm: ctaFinal
      });
    }

    if (status === 'ativa' || status === 'pausada') {
      if (status === 'ativa') await ativarCampanha({ campaignId: campanha.campaignId, token: user.metaAdsToken });
      else await pausarCampanha({ campaignId: campanha.campaignId, token: user.metaAdsToken });
      await atualizarStatusCampanha(campanha.id, status);
    }
    res.json({ ok:true });
  } catch(e) {
    console.error('[meta-ads/campanha/editar]', e.message);
    res.status(500).json({ ok:false, erro: e.message });
  }
});

// Exclui a campanha de verdade no Meta (não só o registro local) — senão
// ela continuaria pausada no Gerenciador de Anúncios do corretor
app.post('/app/meta-ads/campanha/:id/excluir', auth, async (req,res)=>{
  try {
    if (!_podeUsarPosts(req.session.user)) return res.status(403).json({ ok:false, erro:'Sem acesso.' });
    const user = req.session.user;
    const uid = String(user.id || user.codigoUsuario || '');
    if (!user.metaAdsToken) return res.status(400).json({ ok:false, erro:'Conecte sua conta do Meta primeiro.' });

    const { buscarCampanha, excluirCampanhaRegistro } = require('./services/salvarCampanhaMeta');
    const { excluirCampanha } = require('./services/metaAds');
    const campanha = await buscarCampanha(req.params.id, uid);
    if (!campanha) return res.status(404).json({ ok:false, erro:'Campanha não encontrada.' });
    await excluirCampanha({ campaignId: campanha.campaignId, token: user.metaAdsToken });
    await excluirCampanhaRegistro(campanha.id, uid);
    res.json({ ok:true });
  } catch(e) {
    console.error('[meta-ads/campanha/excluir]', e.message);
    res.status(500).json({ ok:false, erro: e.message });
  }
});

// Gera título + descrição do anúncio via IA — corretor pode usar direto ou editar depois
app.post('/app/meta-ads/gerar-texto', auth, async (req,res)=>{
  try {
    if (!_podeUsarPosts(req.session.user)) return res.status(403).json({ ok:false, erro:'Sem acesso.' });
    const { imovelId } = req.body;
    const imoveis = lerImoveis(req.session.user);
    const imovel = imoveis.find(i => String(i.idExterno)===String(imovelId) || String(i.idInterno)===String(imovelId) || String(i.id)===String(imovelId));
    if (!imovel) return res.status(404).json({ ok:false, erro:'Imóvel não encontrado.' });

    const { gerarTextoAnuncio } = require('./services/postsIA');
    const { titulo, descricao } = await gerarTextoAnuncio({
      titulo: imovel.titulo, tipo: imovel.tipo, bairro: imovel.bairro, cidade: imovel.cidade,
      valor: imovel.valor_imovel, quartos: imovel.quartos
    });
    res.json({ ok:true, titulo, descricao });
  } catch(e) {
    console.error('[meta-ads/gerar-texto]', e.message);
    res.status(500).json({ ok:false, erro: e.message || 'Falha ao gerar texto com IA.' });
  }
});

// Dados pra montar o preview no modal antes de publicar (fotos + legenda sugerida)
app.get('/app/instagram/preview/:imovelId', auth, (req,res)=>{
  try {
    const { montarLegenda } = require('./services/instagram');
    const user = req.session.user;
    const imovelId = req.params.imovelId;
    const imoveis = (_cacheImoveis || []);
    const imovel = imoveis.find(i => String(i.id)===String(imovelId) || String(i.idExterno)===String(imovelId) || String(i.idInterno)===String(imovelId) || String(i.codigoImovel)===String(imovelId));
    if (!imovel) return res.status(404).json({ ok:false, erro: 'Imóvel não encontrado.' });

    const uidLogado = user.id || user.codigoUsuario || user.codigo_usuario;
    const ownerImovel = imovel.userId || imovel.user_id || imovel.usuarioId;
    if (String(ownerImovel) !== String(uidLogado)) {
      return res.status(403).json({ ok:false, erro: 'Você só pode publicar imóveis da sua própria carteira.' });
    }

    const fotos = Array.isArray(imovel.fotos) ? imovel.fotos : [];
    if (!fotos.length) return res.status(400).json({ ok:false, erro: 'Este imóvel não tem fotos cadastradas.' });

    const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
    const imageUrls = fotos.slice(0, 10).map(f => f.startsWith('http') ? f : (BASE_URL + f));
    const legenda = montarLegenda(imovel, uidLogado, BASE_URL);

    res.json({ ok:true, fotos: imageUrls, legenda, username: user.instagramUsername || '' });
  } catch(e) {
    console.error('[instagram/preview]', e.message);
    res.status(500).json({ ok:false, erro: e.message });
  }
});

// Gera uma legenda alternativa via IA (Groq) pro imóvel, pro botão "Gerar
// legenda com IA" no modal — separado do texto padrão de montarLegenda()
app.post('/app/instagram/legenda-ia', auth, express.json(), async (req,res)=>{
  try {
    const { gerarLegenda } = require('./services/postsIA');
    const user = req.session.user;
    const imovelId = String(req.body.imovelId || '').trim();
    const imoveis = (_cacheImoveis || []);
    const imovel = imoveis.find(i => String(i.id)===String(imovelId) || String(i.idExterno)===String(imovelId) || String(i.idInterno)===String(imovelId) || String(i.codigoImovel)===String(imovelId));
    if (!imovel) return res.status(404).json({ ok:false, erro: 'Imóvel não encontrado.' });

    const uidLogado = user.id || user.codigoUsuario || user.codigo_usuario;
    const ownerImovel = imovel.userId || imovel.user_id || imovel.usuarioId;
    if (String(ownerImovel) !== String(uidLogado)) {
      return res.status(403).json({ ok:false, erro: 'Você só pode publicar imóveis da sua própria carteira.' });
    }

    const local = imovel.bairro || imovel.cidade || '';
    const titulo = imovel.titulo || `${imovel.tipo || 'Imóvel'}${local ? ' em ' + local : ''}`;
    const valorFmt = imovel.valor_imovel ? `R$ ${Number(imovel.valor_imovel).toLocaleString('pt-BR')}` : '';
    const partes = [
      titulo,
      imovel.quartos ? `${imovel.quartos} quarto(s)` : '',
      imovel.suites ? `${imovel.suites} suíte(s)` : '',
      imovel.vagas ? `${imovel.vagas} vaga(s)` : '',
      imovel.area_m2 ? `${imovel.area_m2}m²` : '',
      imovel.descricao || ''
    ].filter(Boolean);
    const dados = { titulo, descricao: imovel.descricao || partes.join(' · '), valor: valorFmt, textoBruto: partes.join('\n') };
    const { legenda } = await gerarLegenda(dados);
    res.json({ ok:true, legenda });
  } catch(e) {
    console.error('[instagram/legenda-ia]', e.message);
    res.status(500).json({ ok:false, erro: e.message || 'Não foi possível gerar a legenda.' });
  }
});

app.post('/app/instagram/postar', auth, async (req,res)=>{
  try {
    const { publicarFeed, publicarStory, montarLegenda } = require('./services/instagram');
    const user = req.session.user;
    if (!user.instagramToken || !user.instagramContaId) {
      return res.status(400).json({ ok:false, erro: 'Instagram não conectado. Conecte sua conta em /app/perfil.' });
    }
    const imovelId = req.body.imovelId;
    const destino = req.body.destino;
    const imoveis = (_cacheImoveis || []);
    const imovel = imoveis.find(i => String(i.id)===String(imovelId) || String(i.idExterno)===String(imovelId) || String(i.idInterno)===String(imovelId) || String(i.codigoImovel)===String(imovelId));
    if (!imovel) return res.status(404).json({ ok:false, erro: 'Imóvel não encontrado.' });

    const uidLogado = user.id || user.codigoUsuario || user.codigo_usuario;
    const ownerImovel = imovel.userId || imovel.user_id || imovel.usuarioId;
    if (String(ownerImovel) !== String(uidLogado)) {
      return res.status(403).json({ ok:false, erro: 'Você só pode publicar imóveis da sua própria carteira.' });
    }

    const _custoInsta = CUSTO.postar_instagram;
    const _saldoInsta = await saldoCreditos(uidLogado);
    if (_saldoInsta < _custoInsta) {
      return res.status(400).json({ ok:false, erro: `Saldo insuficiente para publicar no Instagram. Você tem ${_saldoInsta} coins e precisa de ${_custoInsta}.` });
    }

    const fotos = Array.isArray(imovel.fotos) ? imovel.fotos : [];
    if (!fotos.length) return res.status(400).json({ ok:false, erro: 'Este imóvel não tem fotos cadastradas.' });

    const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
    const fotosOriginais = fotos.slice(0, 10).map(f => f.startsWith('http') ? f : (BASE_URL + f));
    // Modal deixa o corretor escolher quais fotos entram e editar a legenda —
    // se vier do body, usa; senão cai no padrão (todas as fotos + legenda auto)
    const fotosEscolhidas = Array.isArray(req.body.fotos) ? req.body.fotos.filter(f => fotosOriginais.includes(f)) : null;
    const imageUrls = (fotosEscolhidas && fotosEscolhidas.length) ? fotosEscolhidas : fotosOriginais;
    const legendaCustom = typeof req.body.legenda === 'string' ? req.body.legenda.trim() : '';
    const legenda = legendaCustom || montarLegenda(imovel, uidLogado, BASE_URL);

    const resultados = {};
    if (destino === 'feed' || destino === 'ambos') {
      resultados.feed = await publicarFeed(user.instagramContaId, user.instagramToken, imageUrls, legenda);
    }
    if (destino === 'story' || destino === 'ambos') {
      resultados.story = await publicarStory(user.instagramContaId, user.instagramToken, imageUrls[0]);
    }
    if (!resultados.feed && !resultados.story) {
      return res.status(400).json({ ok:false, erro: 'Destino de publicação inválido.' });
    }
    // 30 créditos por publicação no Instagram — espera terminar antes de responder,
    // pra não perder a cobrança se o processo reiniciar logo em seguida
    const _debitouInsta = await consumir(uidLogado, 'postar_instagram').catch(e => { console.error('[instagram/postar] erro ao debitar:', e.message); return false; });
    if (!_debitouInsta) console.error('[instagram/postar] cobranca nao efetivada:', uidLogado);
    res.json({ ok:true, resultados });
  } catch(e) {
    console.error('[instagram/postar]', e.message);
    res.status(500).json({ ok:false, erro: e.message || 'Erro ao publicar no Instagram.' });
  }
});

// ── POSTS (MVP) ────────────────────────────────────────────────────────────
// TEMP (jul/2026): liberado só pras contas da lista pra teste — mesmo padrão
// usado antes pro Meu Site/Instagram. Remover o gate quando liberar geral.
const _CONTAS_POSTS_LIBERADAS = ['REN-G9K6', 'ROD-P3V3', 'MAU-EHAM'];
function _podeUsarPosts(user) {
  return !!user && _CONTAS_POSTS_LIBERADAS.includes(user.codigoUsuario || user.id);
}

app.get('/app/redes-sociais/campanha', auth, async (req, res) => {
  if (!_podeUsarPosts(req.session.user)) return res.redirect('/app-home');
  try {
    const user = req.session.user;
    const { listarCampanhas } = require('./services/salvarCampanhaMeta');
    const uidLogado = user.id || user.codigoUsuario || user.codigo_usuario;
    const imoveisComFoto = lerImoveis(user)
      .filter(i => i.status !== 'inativo' && i.status !== 'excluido' && (i.fotos||[]).length)
      .map(i => ({
        id: i.idExterno || i.idInterno || i.id,
        titulo: i.titulo || [i.tipo, i.bairro].filter(Boolean).join(' em '),
        tipo: i.tipo, bairro: i.bairro, cidade: i.cidade,
        valorImovel: i.valor_imovel, foto: (i.fotos||[])[0],
        fotos: (i.fotos||[]).filter(Boolean).slice(0, 10)
      }));
    const campanhas = await listarCampanhas(String(uidLogado));
    // Domínio que vai aparecer no link do anúncio (site próprio quando
    // configurado e verificado, senão a plataforma) — só pra exibir na prévia
    let dominioAnuncio = 'matchimoveis.ia.br';
    try {
      const { buscarConfig } = require('./services/salvarSiteConfig');
      const siteConfig = await buscarConfig(String(uidLogado));
      if (siteConfig && siteConfig.dominio_personalizado && siteConfig.dominio_status === 'verificado') {
        dominioAnuncio = siteConfig.dominio_personalizado;
      }
    } catch (e) {}
    res.render('app-meta-campanha', { user, active: 'meta-campanha', imoveis: imoveisComFoto, campanhas, msg: req.query.msg||'', err: req.query.err||'', dominioAnuncio });
  } catch(e) {
    console.error('[app/redes-sociais/campanha]', e.message);
    res.render('app-meta-campanha', { user: req.session.user, active: 'meta-campanha', imoveis: [], campanhas: [], msg:'', err: e.message, dominioAnuncio: 'matchimoveis.ia.br' });
  }
});

app.get('/app/posts', auth, async (req, res) => {
  if (!_podeUsarPosts(req.session.user)) return res.redirect('/app-home');
  try {
    const { listarPosts } = require('./services/salvarPost');
    const uidLogado = req.session.user.id || req.session.user.codigoUsuario || req.session.user.codigo_usuario;
    const [agendados, postados, ignorados] = await Promise.all([
      listarPosts(uidLogado, 'agendado'),
      listarPosts(uidLogado, 'postado'),
      listarPosts(uidLogado, 'ignorado')
    ]);
    const imoveis = lerImoveis(req.session.user)
      .filter(i => i.status !== 'inativo' && i.status !== 'excluido' && (i.fotos||[]).length)
      .map(i => ({
        id: i.idExterno || i.idInterno || i.id,
        titulo: i.titulo || [i.tipo, i.bairro].filter(Boolean).join(' em '),
        foto: (i.fotos||[])[0]
      }));
    res.render('app-posts', { user: req.session.user, active: 'posts', agendados, postados, ignorados, imoveis });
  } catch (e) {
    console.error('[app/posts]', e.message);
    res.render('app-posts', { user: req.session.user, active: 'posts', agendados: [], postados: [], ignorados: [], imoveis: [] });
  }
});

app.post('/app/posts/analisar', auth, express.json(), async (req, res) => {
  if (!_podeUsarPosts(req.session.user)) return res.status(403).json({ ok: false, erro: 'Sem acesso.' });
  try {
    const { analisarSite, gerarLegenda } = require('./services/postsIA');
    const { criarPost } = require('./services/salvarPost');
    const url = String(req.body.url || '').trim();
    const imovelId = String(req.body.imovelId || '').trim();
    if (!url && !imovelId) return res.json({ ok: false, erro: 'Informe a URL do site ou escolha um imóvel.' });

    let dados;
    if (imovelId) {
      const imoveis = lerImoveis(req.session.user);
      const imovel = imoveis.find(i => String(i.idExterno)===String(imovelId) || String(i.idInterno)===String(imovelId) || String(i.id)===String(imovelId));
      if (!imovel) return res.json({ ok: false, erro: 'Imóvel não encontrado na sua carteira.' });
      if (!(imovel.fotos||[]).length) return res.json({ ok: false, erro: 'Esse imóvel não tem fotos cadastradas.' });
      const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
      const local = imovel.bairro || imovel.cidade || '';
      const titulo = imovel.titulo || `${imovel.tipo || 'Imóvel'}${local ? ' em ' + local : ''}`;
      const valorFmt = imovel.valor_imovel ? `R$ ${Number(imovel.valor_imovel).toLocaleString('pt-BR')}` : '';
      const partes = [
        titulo,
        imovel.quartos ? `${imovel.quartos} quarto(s)` : '',
        imovel.area_m2 ? `${imovel.area_m2}m²` : '',
        imovel.descricao || ''
      ].filter(Boolean);
      dados = {
        titulo,
        descricao: imovel.descricao || partes.join(' · '),
        valor: valorFmt,
        textoBruto: partes.join('\n'),
        imagens: imovel.fotos.slice(0, 10).map(f => f.startsWith('http') ? f : (BASE_URL + f))
      };
    } else {
      dados = await analisarSite(url);
    }
    let legenda = '';
    try {
      const gerado = await gerarLegenda(dados);
      legenda = gerado.legenda;
    } catch (e) { legenda = [dados.titulo, dados.descricao, dados.valor].filter(Boolean).join('\n'); }
    const uidLogado = req.session.user.id || req.session.user.codigoUsuario || req.session.user.codigo_usuario;
    const post = await criarPost({ userId: uidLogado, url, titulo: dados.titulo, descricao: dados.descricao, valor: dados.valor, textoBruto: dados.textoBruto, imagens: dados.imagens, legenda });
    res.json({ ok: true, postId: post.id, titulo: dados.titulo, descricao: dados.descricao, valor: dados.valor, textoBruto: dados.textoBruto, imagens: dados.imagens, legenda });
  } catch (e) {
    console.error('[posts/analisar]', e.message);
    res.json({ ok: false, erro: e.message || 'Não foi possível analisar esse site.' });
  }
});

app.post('/app/posts/legenda', auth, express.json(), async (req, res) => {
  if (!_podeUsarPosts(req.session.user)) return res.status(403).json({ ok: false, erro: 'Sem acesso.' });
  try {
    const { gerarLegenda } = require('./services/postsIA');
    const { atualizarPost } = require('./services/salvarPost');
    const { postId, titulo, descricao, valor, textoBruto } = req.body;
    const { legenda } = await gerarLegenda({ titulo, descricao, valor, textoBruto });
    if (postId) await atualizarPost(postId, { legenda }).catch(()=>{});
    res.json({ ok: true, legenda });
  } catch (e) {
    console.error('[posts/legenda]', e.message);
    res.json({ ok: false, erro: e.message || 'Não foi possível gerar a legenda.' });
  }
});

app.post('/app/posts/ignorar', auth, express.json(), async (req, res) => {
  if (!_podeUsarPosts(req.session.user)) return res.status(403).json({ ok: false, erro: 'Sem acesso.' });
  try {
    const { postId } = req.body;
    if (!postId) return res.json({ ok: false, erro: 'Post não encontrado.' });
    const { atualizarPost } = require('./services/salvarPost');
    await atualizarPost(postId, { status: 'ignorado', dataIgnorado: new Date().toISOString() });
    res.json({ ok: true });
  } catch (e) {
    console.error('[posts/ignorar]', e.message);
    res.json({ ok: false, erro: e.message || 'Não foi possível ignorar o post.' });
  }
});

app.get('/app/posts/:id', auth, async (req, res) => {
  if (!_podeUsarPosts(req.session.user)) return res.status(403).json({ ok: false, erro: 'Sem acesso.' });
  try {
    const { buscarPost } = require('./services/salvarPost');
    const uidLogado = req.session.user.id || req.session.user.codigoUsuario || req.session.user.codigo_usuario;
    const post = await buscarPost(req.params.id, uidLogado);
    if (!post) return res.status(404).json({ ok: false, erro: 'Post não encontrado.' });
    res.json({ ok: true, post });
  } catch (e) {
    console.error('[posts/:id]', e.message);
    res.status(500).json({ ok: false, erro: e.message || 'Erro ao buscar post.' });
  }
});

app.post('/app/posts/excluir', auth, express.json(), async (req, res) => {
  if (!_podeUsarPosts(req.session.user)) return res.status(403).json({ ok: false, erro: 'Sem acesso.' });
  try {
    const { postId } = req.body;
    if (!postId) return res.json({ ok: false, erro: 'Post não encontrado.' });
    const { excluirPost } = require('./services/salvarPost');
    const uidLogado = req.session.user.id || req.session.user.codigoUsuario || req.session.user.codigo_usuario;
    await excluirPost(postId, uidLogado);
    res.json({ ok: true });
  } catch (e) {
    console.error('[posts/excluir]', e.message);
    res.json({ ok: false, erro: e.message || 'Não foi possível excluir o post.' });
  }
});

// imagemEscolhida é TEXT — grava plain url (1 foto) ou JSON de array (carrossel)
function _codificarImagemEscolhida(imagens) {
  if (!Array.isArray(imagens)) return imagens || '';
  return imagens.length === 1 ? imagens[0] : JSON.stringify(imagens);
}

app.post('/app/posts/agendar', auth, express.json(), async (req, res) => {
  if (!_podeUsarPosts(req.session.user)) return res.status(403).json({ ok: false, erro: 'Sem acesso.' });
  try {
    const { postId, imagemUrl, imagens, legenda, dataAgendada } = req.body;
    const listaImagens = Array.isArray(imagens) ? imagens.filter(Boolean) : (imagemUrl ? [imagemUrl] : []);
    if (!postId) return res.json({ ok: false, erro: 'Post não encontrado.' });
    if (!listaImagens.length) return res.json({ ok: false, erro: 'Selecione ao menos uma imagem antes de agendar.' });
    if (!dataAgendada) return res.json({ ok: false, erro: 'Escolha data e hora do agendamento.' });
    const dataObj = new Date(dataAgendada);
    if (isNaN(dataObj.getTime()) || dataObj <= new Date()) {
      return res.json({ ok: false, erro: 'Escolha uma data e hora no futuro.' });
    }
    const { atualizarPost } = require('./services/salvarPost');
    await atualizarPost(postId, { imagemEscolhida: _codificarImagemEscolhida(listaImagens), legenda: legenda || '', status: 'agendado', dataAgendada: dataObj.toISOString() });
    res.json({ ok: true });
  } catch (e) {
    console.error('[posts/agendar]', e.message);
    res.json({ ok: false, erro: e.message || 'Não foi possível agendar o post.' });
  }
});

app.post('/app/posts/publicar', auth, express.json(), async (req, res) => {
  if (!_podeUsarPosts(req.session.user)) return res.status(403).json({ ok: false, erro: 'Sem acesso.' });
  try {
    const user = req.session.user;
    if (!user.instagramToken || !user.instagramContaId) {
      return res.status(400).json({ ok: false, erro: 'Instagram não conectado. Conecte sua conta em /app/perfil.' });
    }
    const { postId, imagemUrl, imagens, legenda } = req.body;
    const listaImagens = Array.isArray(imagens) ? imagens.filter(Boolean) : (imagemUrl ? [imagemUrl] : []);
    if (!listaImagens.length) return res.json({ ok: false, erro: 'Selecione ao menos uma imagem antes de publicar.' });

    const uidLogado = user.id || user.codigoUsuario || user.codigo_usuario;
    const _saldoPost = await saldoCreditos(uidLogado);
    if (_saldoPost < CUSTO.postar_instagram) {
      return res.status(400).json({ ok: false, erro: `Saldo insuficiente. Você tem ${_saldoPost} coins e precisa de ${CUSTO.postar_instagram}.` });
    }

    const { publicarFeed } = require('./services/instagram');
    const resultado = await publicarFeed(user.instagramContaId, user.instagramToken, listaImagens, legenda || '');
    // espera terminar antes de responder, pra não perder a cobrança se o processo reiniciar logo em seguida
    const _debitouPost = await consumir(uidLogado, 'postar_instagram').catch(e => { console.error('[posts/publicar] erro ao debitar:', e.message); return false; });
    if (!_debitouPost) console.error('[posts/publicar] cobranca nao efetivada:', uidLogado);
    if (postId) {
      const { atualizarPost } = require('./services/salvarPost');
      await atualizarPost(postId, { imagemEscolhida: _codificarImagemEscolhida(listaImagens), legenda: legenda || '', status: 'postado', dataPublicado: new Date().toISOString(), resultado }).catch(()=>{});
    }
    res.json({ ok: true, resultado });
  } catch (e) {
    console.error('[posts/publicar]', e.message);
    res.status(500).json({ ok: false, erro: e.message || 'Erro ao publicar no Instagram.' });
  }
});
// ── FIM POSTS ──────────────────────────────────────────────────────────────

app.post('/app/perfil/senha', auth, async (req, res) => {
  const nova_senha = (req.body.nova_senha || '').trim();
  const confirmar_senha = (req.body.confirmar_senha || '').trim();
  const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || String(req.session.user.id || '');
  if (!nova_senha || !confirmar_senha)
    return res.redirect('/app/perfil?senhaErro=Preencha+todos+os+campos');
  if (nova_senha.length < 6)
    return res.redirect('/app/perfil?senhaErro=A+nova+senha+deve+ter+pelo+menos+6+caracteres');
  if (nova_senha !== confirmar_senha)
    return res.redirect('/app/perfil?senhaErro=As+senhas+nao+coincidem');
  try {
    const { query: _qSenha } = require('./services/db');
    const result = await _qSenha('SELECT codigo_usuario FROM usuarios WHERE codigo_usuario = $1', [uid]);
    if (!result.rows.length)
      return res.redirect('/app/perfil?senhaErro=Usuario+nao+encontrado');
    const _hashNova = await bcrypt.hash(nova_senha, 10);
    await _qSenha('UPDATE usuarios SET senha = $1 WHERE codigo_usuario = $2', [_hashNova, uid]);
    if (_cacheUsuarios) { const _uIdx = _cacheUsuarios.findIndex(u=>u.codigoUsuario===uid||u.codigo_usuario===uid); if(_uIdx>=0) _cacheUsuarios[_uIdx].senha = _hashNova; }
    req.session.user.senha = _hashNova;
    return res.redirect('/app/perfil?senhaSucesso=1');
  } catch(e) {
    console.error('[senha]', e.message);
    return res.redirect('/app/perfil?senhaErro=Erro+ao+alterar+senha');
  }
});

app.get('/app-importar-leads', auth, (req,res)=>{
  res.render('app-importar-leads', { user: req.session.user, usuario: req.session.user });
});

app.get('/app/importar-leads', auth, (req,res)=>{
  res.redirect('/app-importar-leads');
});


// ── MODELO PLANILHA LEADS ─────────────────────────────────────
app.get('/app/modelo-leads.xlsx', auth, (req, res) => {
  const XLSX = require('xlsx');
  const modelo = [{
    Nome: 'João Silva',
    Telefone: '47999999999',
    Email: 'joao@email.com',
    Origem: 'portal',
    Tipo: 'apartamento',
    Transacao: 'compra',
    Condicao: 'usado',
    Bairro: 'Centro',
    Cidade: 'Itajaí',
    Estado: 'SC',
    Quartos: 2,
    Suites: 1,
    Vagas: 1,
    Banheiros: 2,
    Area_max: 100,
    Valor_max: 500000,
    Observacoes: 'Prefere andar alto'
  }];
  const ws = XLSX.utils.json_to_sheet(modelo);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="modelo-leads.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Lead de captação (proprietário que se auto-cadastrou pra anunciar o
// imóvel, via /captar/:userId) é um tipo diferente de "lead" — não é quem
// tá procurando comprar/alugar, é quem quer vender/alugar o próprio
// imóvel. Tem tela própria (/app/captacao) desde antes; esse helper
// garante que ela não apareça duplicada na Planilha de Leads/kanban geral.
// Mesmos 3 campos já checados em services/salvarLead.js (linha ~205).
function _ehLeadCaptacao(l) {
  return l.tipoLead === 'cliente_vendedor' || l.tipo_lead === 'cliente_vendedor' || l.origem === 'captacao_link' || (l.dados && l.dados.temImovelParaCaptar === true);
}

app.get('/app/leads', auth, async (req,res)=>{
  const { lerLeads: _lerLeadsService } = require('./services/salvarLead');
  const raw = await _lerLeadsService(req.session.user.id);
  const data = Array.isArray(raw) ? raw : (raw.results || []);
  const _todasVisitas = (_cacheVisitas || []);
  const leads = filtrarPorUsuario(data, req.session.user)
    .filter(l => l.tipoLead !== 'corretor')
    .filter(l => !_ehLeadCaptacao(l))
    .filter(l => !(l.leadOculta === true && !((l.matches||[]).length || (l.matchesBase||[]).length)))
    .filter(l => {
      // Se tem qualquer visita → some do kanban de leads
      const temVisita = _todasVisitas.some(v =>
        String(v.leadId||'') === String(l.id) &&
        String(v.userId||v.ownerUserId||v.corretorId||'') === String(req.session.user.id)
      );
      return !temVisita;
    });
  // usa matchesBase (base interna) ou matches (externos)
  leads.forEach(l => {
    if (!l.matches || l.matches.length === 0) {
      l.matches = l.matchesBase || [];
      l.matchCount = l.matchCountBase || 0;
    }
  });
  // Conta quantas vezes cada telefone gerou lead
  const _foneCount = {};
  const _todasLeadsCount = Array.isArray(raw) ? raw : (raw.results || []);
  _todasLeadsCount.filter(l => l.tipoLead !== 'corretor').forEach(l => {
    const fone = (l.telefone||l.whatsapp||l.contato||'').replace(/\D/g,'').slice(-8);
    if(fone) _foneCount[fone] = (_foneCount[fone]||0) + 1;
  });
  leads.forEach(l => {
    const fone = (l.telefone||l.whatsapp||l.contato||'').replace(/\D/g,'').slice(-8);
    l._vezesEntrou = fone ? (_foneCount[fone]||1) : 1;
  });

  // Leads com match primeiro, depois por data
  leads.sort((a, b) => {
    const da = new Date(a.ultimaMensagemEm || a.scoreAtualizadoEm || a.criadoEm || a.data_cadastro || 0);
    const db = new Date(b.ultimaMensagemEm || b.scoreAtualizadoEm || b.criadoEm || b.data_cadastro || 0);
    return db - da;
  });
  const totalMatches = leads.reduce((sum,item)=> sum + ((item.matches && item.matches.length) || 0), 0);
  res.render('app-leads', {
    user: req.session.user,
    userId: req.session.user ? req.session.user.id : '',
    active: 'leads',
    leads,
    stats: {
      totalLeads: leads.length,
      comMatch: leads.filter(i => i.matches && i.matches.length).length,
      totalMatches,
      pendentes: leads.filter(i => !i.matches || !i.matches.length).length
    }
  });
});

// Helper compartilhado: monta a lista de leads da planilha já filtrada/ordenada
async function _leadsParaPlanilha(user, query) {
  const { lerLeads: _lerLeadsPlan } = require('./services/salvarLead');
  const raw = await _lerLeadsPlan(user.id);
  const data = Array.isArray(raw) ? raw : (raw.results || []);
  const base = filtrarPorUsuario(data, user)
    .filter(l => l.tipoLead !== 'corretor')
    .filter(l => !_ehLeadCaptacao(l))
    .filter(l => !(l.leadOculta === true && !((l.matches||[]).length || (l.matchesBase||[]).length)));

  const { origem, status, busca, de, ate } = query || {};
  let leads = base;
  if (origem) leads = leads.filter(l => (l.origem || l.origemEntrada || '') === origem);
  if (status) leads = leads.filter(l => (l.faseFunil || 'novo') === status);
  if (busca) {
    const b = busca.toLowerCase();
    const bNum = busca.replace(/\D/g,'');
    leads = leads.filter(l =>
      (l.nome||'').toLowerCase().includes(b) ||
      (bNum && (l.telefone||l.whatsapp||l.contato||'').replace(/\D/g,'').includes(bNum)) ||
      ((l.perfilIA||{}).bairro||l.bairro||'').toLowerCase().includes(b)
    );
  }
  if (de) leads = leads.filter(l => new Date(l.criadoEm||l.data_cadastro||0) >= new Date(de+'T00:00:00'));
  if (ate) leads = leads.filter(l => new Date(l.criadoEm||l.data_cadastro||0) <= new Date(ate+'T23:59:59'));

  leads = leads.slice().sort((a,b) => new Date(b.criadoEm||b.data_cadastro||0) - new Date(a.criadoEm||a.data_cadastro||0));

  const canaisDisponiveis = [...new Set(base.map(l => l.origem || l.origemEntrada || 'outro'))].sort();

  // Pra leads sem imóvel de referência já vinculado (idAnuncio), tenta achar um
  // imóvel parcialmente cadastrado do mesmo dono (telefone/email) — mesmo padrão
  // usado em /app/captacao — pra oferecer "editar para completar" com o % já preenchido.
  const uid = user.codigoUsuario || user.id;
  const { query: _qPlanIm } = require('./services/db');
  const { calcularPercentualPerfil: _cppPlan } = require('./services/salvarImovel');
  leads = await Promise.all(leads.map(async (l) => {
    if (l.idAnuncio) return l;
    try {
      let tel = (l.telefone||l.whatsapp||l.contato||'').replace(/\D/g,''); if(tel.startsWith('55') && tel.length>=12) tel = tel.slice(2);
      const email = (l.email||'').toLowerCase().trim();
      const conds = []; const pars = [uid];
      if(tel){ pars.push('%'+tel+'%'); conds.push(`proprietario->>'telefone' ILIKE $${pars.length} OR proprietario->>'celular' ILIKE $${pars.length}`); }
      if(email){ pars.push(email); conds.push(`proprietario->>'email' ILIKE $${pars.length}`); }
      if(!conds.length) return l;
      const ir = await _qPlanIm(`SELECT id,id_interno,titulo,tipo,bairro,cidade,estado,cep,endereco,valor_imovel,condominio,iptu,area_m2,quartos,suites,banheiros,vagas,descricao,fotos,proprietario,transacao,criado_em FROM imoveis WHERE (user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1) AND (${conds.join(' OR ')}) LIMIT 1`, pars);
      if(!ir.rows.length) return l;
      return { ...l, imovelParcial: { ...ir.rows[0], percentual: _cppPlan(ir.rows[0]) } };
    } catch(_eIm){ return l; }
  }));

  return { leads, canaisDisponiveis };
}

app.get('/app/leads/planilha', auth, async (req,res)=>{
  const { origem, status, busca, de, ate } = req.query;
  const { leads, canaisDisponiveis } = await _leadsParaPlanilha(req.session.user, req.query);
  const filtros = { origem: origem||'', status: status||'', busca: busca||'', de: de||'', ate: ate||'' };
  const filtrosQS = new URLSearchParams(Object.fromEntries(Object.entries(filtros).filter(([,v]) => v))).toString();
  res.render('app-leads-planilha', {
    user: req.session.user,
    active: 'leads-planilha',
    leads,
    filtros,
    filtrosQS,
    canaisDisponiveis
  });
});

app.get('/app/leads/planilha/exportar-excel', auth, async (req,res)=>{
  try {
    const XLSX = require('xlsx');
    const { leads } = await _leadsParaPlanilha(req.session.user, req.query);
    const linhas = leads.map(l => {
      const p = l.perfilIA || {};
      const d = l.criadoEm ? new Date(l.criadoEm) : null;
      const _mat = (l.matchesAuto||l.matches||[]).length;
      const _vitrineLink = _mat>0 ? (l.vitrineLink || (BASE_URL+'/cliente/oferta/'+(l.leadId||l.id)+'?userId='+encodeURIComponent(l.userId||l.usuarioId||l.corretorId||''))) : '';
      return {
        Data: d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
        Nome: l.nome || '',
        Telefone: l.telefone || l.whatsapp || l.contato || '',
        Email: l.email || '',
        Origem: l.origem || l.origemEntrada || '',
        Tipo: p.tipo || '',
        Transacao: p.intencao || '',
        Bairro: p.bairro || '',
        Cidade: p.cidade || '',
        Estado: p.estado || '',
        Quartos: p.quartos || '',
        Valor_max: p.valorMax || '',
        Status: l.faseFunil || '',
        Temperatura: l.temperatura || '',
        Link_vitrine: _vitrineLink,
        Link_imovel_referencia: l.idAnuncio ? (BASE_URL+'/app/imovel/'+l.idAnuncio) : ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="planilha-leads.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch(e) {
    console.error('[exportar planilha leads]', e.message);
    res.status(500).send('Erro ao exportar leads.');
  }
});



app.get('/app/visitas', auth, async (req,res)=>{
  const todasVisitas = await lerVisitas(req.session.user.id);
  const user = req.session.user;
  let visitas = user.tipo === 'admin' ? todasVisitas : todasVisitas.filter(v =>
    String(v.ownerUserId || v.corretorId || v.usuarioDestinoId || "") === String(user.id || "") ||
    String(v.corretorTelefone || v.usuarioDestinoTelefone || '').replace(/\D/g,'') === String(user.celular || user.telefone || '').replace(/\D/g,'')
  );
  const { status, busca, data } = req.query;
  if (status && status !== 'todos') visitas = visitas.filter(v => v.status === status);
  if (busca) { const b = busca.toLowerCase(); visitas = visitas.filter(v => (v.nome||v.leadNome||'').toLowerCase().includes(b)||(v.imovelBairro||v.bairro||'').toLowerCase().includes(b)); }
  if (data) visitas = visitas.filter(v => (v.dataVisita||v.dataPreferida||'').startsWith(data));
  const visitasOrdenadas = visitas.sort((a,b)=>new Date(b.data||0)-new Date(a.data||0));
  res.render('app-visitas', { user: req.session.user, visitas: visitasOrdenadas, filtros: { status: status||'todos', busca: busca||'', data: data||'' }, baseUrl: BASE_URL });
});

app.get('/logout', (req,res)=>{
  if (req.session) req.session.destroy(()=>res.redirect('/'));
  else res.redirect('/');
});


// WEBHOOK IMOVELWEB / GRUPO QUINTOANDAR - RECEBE LEADS
// WEBHOOK IMOVELWEB — recebe lead do portal por userId

// Auxiliar: cruzar idAnuncio com imóvel cadastrado e montar perfil da lead
async function _cruzarImovelWebhook(lead, userId) {
  const idAnuncio = lead.idAnuncio || '';
  if (!idAnuncio) return;
  try {
    const { query: _qCruz } = require('./services/db');
    const _res = await _qCruz('SELECT * FROM imoveis WHERE user_id=$1 AND (id_externo=$2 OR id_interno=$2 OR id=$2) LIMIT 1', [userId, idAnuncio]);
    if (!_res.rows.length) return;
    const _im = _res.rows[0];
    const _d = _im.dados || {};
    lead.tipo = _im.tipo || _d.tipo || lead.tipo || '';
    lead.tipo_operacao = _im.transacao || _d.transacao || lead.tipo_operacao || 'comprar';
    lead.bairro = _im.bairro || _d.bairro || lead.bairro || '';
    lead.cidade = _im.cidade || _d.cidade || lead.cidade || '';
    lead.estado = _im.estado || _d.estado || lead.estado || '';
    lead.quartos = _im.quartos || _d.quartos || lead.quartos || '';
    lead.suites = _im.suites || _d.suites || lead.suites || '';
    lead.vagas = _im.vagas || _d.vagas || lead.vagas || '';
    lead.banheiros = _im.banheiros || _d.banheiros || lead.banheiros || '';
    lead.area_min = _im.area_m2 || _d.area_m2 || lead.area_min || '';
    lead.area_max = _im.area_total || _d.area_total || lead.area_max || '';
    lead.valorMax = parseFloat(_im.valor_imovel || _d.valor_imovel || 0);
    lead.valorMin = 0;
    lead.imovelInteresse = _im.id;
    lead.perfilIA = {
      tipo: lead.tipo, intencao: lead.tipo_operacao,
      bairro: lead.bairro, cidade: lead.cidade, estado: lead.estado,
      quartos: lead.quartos, suites: lead.suites, vagas: lead.vagas,
      banheiros: lead.banheiros, area_min: lead.area_min, area_max: lead.area_max,
      valorMin: lead.valorMin, valorMax: lead.valorMax,
    };
    console.log('[WEBHOOK] imóvel cruzado:', _im.titulo || idAnuncio, '| bairro:', lead.bairro, '| cidade:', lead.cidade);
  } catch(e) { console.error('[WEBHOOK] erro cruzar imóvel:', e.message); }
}

// Toda lead de webhook de portal com cidade = São Paulo também vira uma lead na conta TIA-A6PG
// (perfil de busca — não amarrada ao anúncio original, que é de outra conta)
// Contador persistente genérico (sobrevive restart do processo) — usado pra
// controlar proporções tipo "a cada N eventos, faz 1 ação". UPSERT atômico via
// ON CONFLICT, sem race condition entre chamadas concorrentes.
let _contadorTabelaPronta = false;
async function _proximoContador(chave) {
  const { query } = require('./services/db');
  if (!_contadorTabelaPronta) {
    await query(`CREATE TABLE IF NOT EXISTS contadores_sistema (chave TEXT PRIMARY KEY, valor INTEGER NOT NULL DEFAULT 0)`);
    _contadorTabelaPronta = true;
  }
  const r = await query(
    `INSERT INTO contadores_sistema (chave, valor) VALUES ($1, 1)
     ON CONFLICT (chave) DO UPDATE SET valor = contadores_sistema.valor + 1
     RETURNING valor`,
    [chave]
  );
  return r.rows[0].valor;
}

// Duplica leads de São Paulo pra 3 contas: TIA-A6PG recebe cópia de TODAS,
// ALE-ZVA9 e GAB-3NVV recebem cópia de 1 a cada 2 (contador persistente
// próprio pra cada uma controla a proporção). Chamado pelos 5 webhooks de portal.
async function _duplicarLeadSaoPauloTIA(leadOriginal, cidade, mensagem) {
  try {
    const TIA = 'TIA-A6PG';
    const ALE = 'ALE-ZVA9';
    const GAB = 'GAB-3NVV';
    const donoOriginal = String(leadOriginal.userId || leadOriginal.codigoUsuario || leadOriginal.user_id || '');
    if (!donoOriginal) return;
    const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
    if (norm(cidade) !== 'sao paulo') return;

    // Lead de aluguel não duplica pra TIA-A6PG/ALE-ZVA9 — só venda
    const _ehAluguel = leadOriginal.perfilIA?.intencao === 'alugar' || norm(leadOriginal.mapaIntencao?.transacao?.[0]?.valor||'') === 'aluguel';
    if (_ehAluguel) return;

    const { salvarLead: _slDupTIA } = require('./services/salvarLead');
    const _duplicarPara = async (destino) => {
      const leadDup = {
        ...leadOriginal,
        id: Date.now().toString() + Math.random().toString(36).substr(2,5),
        userId: destino, codigoUsuario: destino, user_id: destino,
        criadoEm: new Date().toISOString(),
        matches: [], matchesAuto: [], matchesBase: [],
        idAnuncio: '', imovelInteresse: '', imovelId: '',
      };
      await _slDupTIA(leadDup);
      console.log('[DUP-SP] lead duplicada p/', destino, '| origem:', donoOriginal, '| tel:', leadDup.telefone);
      _notificarNovaLead(destino, leadDup.id, leadDup.nome, leadDup.origem || 'Portal');
      try {
        const matchCore = require('./cerebro/match-core');
        await matchCore.processar({ lead: { ...leadDup }, mensagem: mensagem || '', canal: 'portal', userId: destino });
      } catch(e) { console.error('[DUP-SP] erro match', destino, ':', e.message); }
    };

    if (donoOriginal !== TIA) await _duplicarPara(TIA);

    if (donoOriginal !== ALE) {
      const n = await _proximoContador('dup_sp_ale_zva9');
      if (n % 2 === 0) await _duplicarPara(ALE); // a cada 2 leads de SP geradas, 1 vai pra ALE-ZVA9
    }

    if (donoOriginal !== GAB) {
      const nGab = await _proximoContador('dup_sp_gab_3nvv');
      if (nGab % 2 === 0) await _duplicarPara(GAB); // a cada 2 leads de SP geradas, 1 vai pra GAB-3NVV
    }
  } catch(e) { console.error('[DUP-SP-TIA] erro:', e.message); }
}

app.post('/webhook/imovelweb/:userId', async (req, res) => {
  res.status(200).send('OK');
  try {
    const body = req.body || {};
    const userId = req.params.userId || '';
    console.log('[WEBHOOK IMOVELWEB] userId:', userId, '| body:', JSON.stringify(body));
    require('fs').writeFileSync('/tmp/imovelweb-payload.json', JSON.stringify(body, null, 2));
    const { lerUsuarios: _luIW } = require('./services/salvarUsuario');
    const _users = await _luIW();
    const _user = _users.find(u => u.id === userId);
    if (!_user) { console.warn('[WEBHOOK IMOVELWEB] userId nao encontrado:', userId); return; }
    if (!_webhookTokenValido(userId, req)) { console.warn('[WEBHOOK IMOVELWEB] token invalido para', userId); return; }
    const eventId = body.idEvento || body.eventId || body.eventoId || body.id || '';
    const _msgRaw = body.mensagem || body.message || body.txtMensagem || '';
    const mensagemLimpa = _msgRaw.replace(/https?:\/\/[^\s]+/g, '').replace(/¡[^!]+!/g, '').trim();
    const _phones = (body.phone || '').split('/');
    const telefone = (body.telefone || body.phoneNumber || _phones[_phones.length - 1] || body.txtTelefone || '').replace(/\D/g,'');
    if (telefone && _users.some(u => (u.bloqueados || u.dados?.bloqueados || []).some(b => String(b).replace(/\D/g,'').slice(-8) === telefone.slice(-8)))) {
      console.log('[WEBHOOK IMOVELWEB] numero bloqueado:', telefone); return;
    }
    const nome = body.nome || body.name || body.txtNome || body.firstName || telefone || '';
    const email = body.email || body.txtEmail || '';
    const lead = {
      id: Date.now().toString(),
      eventId,
      nome,
      email: body.email || body.txtEmail || '',
      telefone, whatsapp: telefone, contato: telefone,
      mensagem: mensagemLimpa,
      idAnuncio: body.idAnuncio || body.referencia || body.reference || body.internalReference || body.clientListingId || body.codigoAnuncio || body.originListingId || '',
      eventId: body.eventId || body.idEvento || body.eventoId || body.id || '',
      fonte: 'ImovelWeb', origem: 'ImovelWeb', origemEntrada: 'webhook_imovelweb',
      userId, codigoUsuario: userId,
      status: 'novo', score: 0, temperatura: 'frio', faseFunil: 'novo',
      mensagens: [], matches: [], timeline: [], eventos: [], followUps: [],
      criadoEm: new Date().toISOString(),
    };
    const { lerLeads: _llIW, salvarLead: _slIW } = require('./services/salvarLead');
    const _leads = await _llIW();
    const _dup = _leads.find(l =>
      (eventId && String(l.eventId||'') === String(eventId)) ||
      (telefone && String(l.telefone||'').replace(/\D/g,'').slice(-8) === telefone.slice(-8) && l.userId === userId) ||
      (lead.idAnuncio && String(l.idAnuncio||'') === String(lead.idAnuncio) && l.userId === userId)
    );
    const _ehNovaLeadIW = !_dup || _temPerfilMinimoLead(_dup);
    if (_dup && _temPerfilMinimoLead(_dup)) {
      console.log('[WEBHOOK IMOVELWEB] perfil minimo — cria nova lead:', telefone);
      lead.id = Date.now().toString();
    } else if (_dup) {
      // Atualiza lead existente com dados do webhook
      console.log('[WEBHOOK IMOVELWEB] lead existente — atualizando dados:', _dup.id);
      lead.id = _dup.id;
    }
    await _cruzarImovelWebhook(lead, userId);
    console.log('[WEBHOOK IMOVELWEB] antes salvar | nome:', lead.nome, '| tel:', lead.telefone, '| origem:', lead.origem);
    await _slIW(lead);
    console.log('[WEBHOOK IMOVELWEB] lead salva:', nome, '|', telefone, '| userId:', userId);
    if (_ehNovaLeadIW) _notificarNovaLead(userId, lead.id, nome, 'ImovelWeb');
    const _snapIW = { id: lead.id, userId, nome: lead.nome||'', telefone: lead.telefone||'', whatsapp: lead.whatsapp||'', contato: lead.contato||'', email: lead.email||'', mensagem: lead.mensagem||'', idAnuncio: lead.idAnuncio||'', perfilIA: lead.perfilIA||{}, origemEntrada: lead.origemEntrada||'webhook_imovelweb', origem: lead.origem||'ImovelWeb' };
    console.log('[SNAPIW] mensagem:', (_snapIW.mensagem||'').substring(0,60), '| idAnuncio:', _snapIW.idAnuncio);

    setTimeout(async () => {
      try {
        const { processarLeadPortal } = require('./cerebro/portal-processor');
        const { atualizarLead: _atualizarIMOVELWEB } = require('./services/salvarLead');
        const mapa = await processarLeadPortal(_snapIW);
        if (mapa) {
          lead.mapaIntencao = mapa;
          // Buscar imóvel pelo idAnuncio para completar perfilIA
          let _imIW = null;
          if (_snapIW.idAnuncio) {
            const { query: _qImIW } = require('./services/db');
            const _rIW = await _qImIW('SELECT * FROM imoveis WHERE id_externo=$1 OR id_interno=$1 OR id=$1 LIMIT 1', [_snapIW.idAnuncio]);
            _imIW = _rIW.rows[0] || null;
          }
          const _perfilIAIW = {
            tipo: _imIW?.tipo || mapa.tipo_imovel?.[0]?.valor || '',
            intencao: (_imIW?.transacao==='venda'?'comprar':_imIW?.transacao==='aluguel'?'alugar':_imIW?.transacao) || (mapa.transacao?.[0]?.valor==='venda'?'comprar':mapa.transacao?.[0]?.valor==='aluguel'?'alugar':mapa.transacao?.[0]?.valor) || '',
            bairro: _imIW?.bairro || mapa.bairro?.[0]?.valor || '',
            cidade: _imIW?.cidade || mapa.cidade?.[0]?.valor || '',
            estado: _imIW?.estado || mapa.estado?.[0]?.valor || '',
            quartos: _imIW?.quartos || mapa.quartos?.[0]?.valor || '',
            suites: _imIW?.suites || mapa.suites?.[0]?.valor || '',
            vagas: _imIW?.vagas || mapa.vagas?.[0]?.valor || '',
            banheiros: _imIW?.banheiros || mapa.banheiros?.[0]?.valor || '',
            area: _imIW?.area_m2 || (typeof mapa.area?.[0]?.valor === 'object' ? mapa.area?.[0]?.valor?.max : mapa.area?.[0]?.valor) || '',
            valorMax: _imIW ? parseFloat(_imIW.valor_imovel||0) : (mapa.valor?.[0]?.valor?.max || 0),
            valorMin: 0,
          };
          // Buscar perfilIA atual — se já tem dados do imóvel, não sobrescrever
          const { query: _qMergeIW } = require('./services/db');
          const _rMergeIW = await _qMergeIW('SELECT perfil_ia FROM leads WHERE id=$1', [lead.id]);
          const _perfilAtualIW = _rMergeIW.rows[0]?.perfil_ia || {};
          // Se já tem bairro e cidade do imóvel, preservar — só complementar campos vazios
          const _perfilFinalIW = { ..._perfilIAIW, ..._perfilAtualIW };
          // Garantir que campos do imóvel (alta confiança) prevalecem sobre IA
          if (_perfilIAIW.bairro) _perfilFinalIW.bairro = _perfilIAIW.bairro;
          if (_perfilIAIW.cidade) _perfilFinalIW.cidade = _perfilIAIW.cidade;
          if (_perfilIAIW.tipo) _perfilFinalIW.tipo = _perfilIAIW.tipo;
          if (_perfilIAIW.quartos) _perfilFinalIW.quartos = _perfilIAIW.quartos;
          if (_perfilIAIW.suites) _perfilFinalIW.suites = _perfilIAIW.suites;
          if (_perfilIAIW.vagas) _perfilFinalIW.vagas = _perfilIAIW.vagas;
          if (_perfilIAIW.banheiros) _perfilFinalIW.banheiros = _perfilIAIW.banheiros;
          if (_perfilIAIW.area) _perfilFinalIW.area = parseFloat(_perfilIAIW.area) || _perfilIAIW.area;
          if (_perfilIAIW.valorMax) _perfilFinalIW.valorMax = _perfilIAIW.valorMax;
          // Remover area_max/area_min — usar só area
          delete _perfilFinalIW.area_max;
          delete _perfilFinalIW.area_min;
          await _atualizarIMOVELWEB(lead.id, { mapaIntencao: mapa, faseFunil: mapa.fase, temperatura: mapa.temperatura, perfilIA: _perfilFinalIW, bairro: _perfilFinalIW.bairro||'', cidade: _perfilFinalIW.cidade||'', estado: _perfilFinalIW.estado||'', tipo: _perfilFinalIW.tipo||'', tipo_operacao: _perfilFinalIW.intencao||'', idAnuncio: _snapIW.idAnuncio||'' });
          console.log('[WEBHOOK IMOVELWEB] mapa salvo | fase:', mapa.fase, '| temp:', mapa.temperatura);
          await _duplicarLeadSaoPauloTIA({ ..._snapIW, mapaIntencao: mapa, perfilIA: _perfilFinalIW }, _perfilFinalIW.cidade, _snapIW.mensagem);
          // Roda match se perfil suficiente
          const temMinimo = mapa.transacao.length && mapa.tipo_imovel.length && mapa.cidade.length && mapa.bairro.length && mapa.valor.length;
          if (temMinimo) {
            const matchCore = require('./cerebro/match-core');
            const _leadComMapa = { ..._snapIW, mapaIntencao: mapa, userId: _snapIW.userId };
            await matchCore.processar({ lead: _leadComMapa, mensagem: _snapIW.mensagem||'', canal: 'portal', userId: _snapIW.userId });
          }
        }
      } catch(e) { console.error('[WEBHOOK IMOVELWEB] erro portal-processor:', e.message); }
    }, 8000);
  } catch(err) { console.error('[WEBHOOK IMOVELWEB] erro:', err.message); }
});
app.post('/webhook/imovelweb', (req, res) => res.status(200).send('OK'));

// WEBHOOK GRUPO OLX — ZAP Imóveis, VivaReal e OLX (mesmo formato)
app.post('/webhook/grupoolx/:userId', async (req, res) => {
  res.status(200).send('OK');
  try {
    const body = req.body || {};
    const userId = req.params.userId || '';
    const portal = (body.leadOrigin || 'Grupo OLX').includes('Zap') ? 'ZAP Imóveis' : (body.leadOrigin || 'Grupo OLX').includes('Viva') ? 'VivaReal' : 'Grupo OLX';
    console.log('[WEBHOOK GRUPOOLX] userId:', userId, '| portal:', portal, '| lead:', body.name);
    const { lerUsuarios: _luOLX } = require('./services/salvarUsuario');
    const _users = await _luOLX();
    const _user = _users.find(u => u.id === userId);
    if (!_user) { console.warn('[WEBHOOK GRUPOOLX] userId nao encontrado:', userId); return; }
    if (!_webhookTokenValido(userId, req)) { console.warn('[WEBHOOK GRUPOOLX] token invalido para', userId); return; }
    const telefone = (body.phoneNumber || (body.ddd||'') + (body.phone||'')).replace(/\D/g,'');
    if (telefone && _users.some(u => (u.bloqueados || u.dados?.bloqueados || []).some(b => String(b).replace(/\D/g,'').slice(-8) === telefone.slice(-8)))) {
      console.log('[WEBHOOK GRUPOOLX] numero bloqueado:', telefone); return;
    }
    const originLeadId = body.originLeadId || body.originListingId || '';
    const lead = {
      id: Date.now().toString(),
      eventId: originLeadId,
      originLeadId,
      nome: body.name || telefone || '',
      email: body.email || '',
      telefone, whatsapp: telefone, contato: telefone,
      mensagem: body.message || '',
      idAnuncio: body.clientListingId || body.originListingId || '',
      temperatura: body.temperature === 'Alta' ? 'quente' : body.temperature === 'Média' ? 'morno' : 'frio',
      transacao: body.transactionType === 'SELL' ? 'venda' : body.transactionType === 'RENT' ? 'aluguel' : '',
      tipoLead: body.extraData?.leadType || '',
      fonte: portal, origem: portal, origemEntrada: 'webhook_grupoolx',
      userId, codigoUsuario: userId,
      status: 'novo', score: 0, faseFunil: 'novo',
      mensagens: [], matches: [], timeline: [], eventos: [], followUps: [],
      criadoEm: body.timestamp || new Date().toISOString(),
    };
    const { lerLeads: _llOLX, salvarLead: _slOLX } = require('./services/salvarLead');
    const _leads = await _llOLX();
    const _dup = _leads.find(l =>
      (originLeadId && String(l.eventId||l.originLeadId||'') === String(originLeadId)) ||
      (telefone && String(l.telefone||'').replace(/\D/g,'').slice(-8) === telefone.slice(-8) && l.userId === userId)
    );
    if (_dup && !_temPerfilMinimoLead(_dup)) { console.log('[WEBHOOK GRUPOOLX] duplicata ignorada:', telefone); return; }
    if (_dup && _temPerfilMinimoLead(_dup)) { console.log('[WEBHOOK GRUPOOLX] perfil minimo — cria nova lead:', telefone); lead.id = Date.now().toString(); }
    await _cruzarImovelWebhook(lead, userId);
    await _slOLX(lead);
    console.log('[WEBHOOK GRUPOOLX] lead salva:', lead.nome, '|', telefone, '| portal:', portal);
    _notificarNovaLead(userId, lead.id, lead.nome, portal);

    const _msgOLX = body.message || body.mensagem || lead.mensagem || '';
    const _leadSnapshotGRUPOOLX = { id: lead.id, userId: lead.userId||lead.codigoUsuario||userId||'', mensagem: _msgOLX, idAnuncio: lead.idAnuncio||'', perfilIA: lead.perfilIA||{}, origemEntrada: lead.origemEntrada||'webhook_grupoolx', origem: lead.origem||portal };
    setTimeout(async () => {
      try {
        const { processarLeadPortal } = require('./cerebro/portal-processor');
        const { atualizarLead: _atualizarGRUPOOLX } = require('./services/salvarLead');
        const mapa = await processarLeadPortal(_leadSnapshotGRUPOOLX);
        if (mapa) {
          lead.mapaIntencao = mapa;

          // Buscar imóvel pelo idAnuncio para completar perfilIA
          let _imPortal = null;
          if (_leadSnapshotGRUPOOLX.idAnuncio) {
            const { query: _qImPortal } = require('./services/db');
            const _rPortal = await _qImPortal('SELECT * FROM imoveis WHERE id_externo=$1 OR id_interno=$1 OR id=$1 LIMIT 1', [_leadSnapshotGRUPOOLX.idAnuncio]);
            _imPortal = _rPortal.rows[0] || null;
          }
          const _perfilIA = {
            tipo: _imPortal?.tipo || mapa.tipo_imovel?.[0]?.valor || '',
            intencao: (_imPortal?.transacao==='venda'?'comprar':_imPortal?.transacao==='aluguel'?'alugar':_imPortal?.transacao) || (mapa.transacao?.[0]?.valor==='venda'?'comprar':mapa.transacao?.[0]?.valor==='aluguel'?'alugar':mapa.transacao?.[0]?.valor) || '',
            bairro: _imPortal?.bairro || mapa.bairro?.[0]?.valor || '',
            cidade: _imPortal?.cidade || mapa.cidade?.[0]?.valor || '',
            estado: _imPortal?.estado || mapa.estado?.[0]?.valor || '',
            quartos: _imPortal?.quartos || mapa.quartos?.[0]?.valor || '',
            suites: _imPortal?.suites || mapa.suites?.[0]?.valor || '',
            vagas: _imPortal?.vagas || mapa.vagas?.[0]?.valor || '',
            banheiros: _imPortal?.banheiros || mapa.banheiros?.[0]?.valor || '',
            area: _imPortal?.area_m2 || (typeof mapa.area?.[0]?.valor === 'object' ? mapa.area?.[0]?.valor?.max : mapa.area?.[0]?.valor) || '',
            valorMax: _imPortal ? parseFloat(_imPortal.valor_imovel||0) : (mapa.valor?.[0]?.valor?.max || 0),
            valorMin: 0,
          };
          const { query: _qMergeOLX } = require('./services/db');
          const _rMergeOLX = await _qMergeOLX('SELECT perfil_ia FROM leads WHERE id=$1', [lead.id]);
          const _perfilAtualOLX = _rMergeOLX.rows[0]?.perfil_ia || {};
          const _perfilFinalOLX = { ..._perfilAtualOLX, ..._perfilIA };
          Object.keys(_perfilFinalOLX).forEach(k => { if(!_perfilFinalOLX[k] && _perfilAtualOLX[k]) _perfilFinalOLX[k] = _perfilAtualOLX[k]; });
          if (_perfilIA.area) _perfilFinalOLX.area = parseFloat(_perfilIA.area) || _perfilIA.area;
          delete _perfilFinalOLX.area_max; delete _perfilFinalOLX.area_min;
          await _atualizarGRUPOOLX(lead.id, { mapaIntencao: mapa, faseFunil: mapa.fase, temperatura: mapa.temperatura, perfilIA: _perfilFinalOLX, bairro: _perfilFinalOLX.bairro||'', cidade: _perfilFinalOLX.cidade||'', estado: _perfilFinalOLX.estado||'', tipo: _perfilFinalOLX.tipo||'', tipo_operacao: _perfilFinalOLX.intencao||'', idAnuncio: _leadSnapshotGRUPOOLX.idAnuncio||'' });
          console.log('[WEBHOOK GRUPOOLX] mapa salvo | fase:', mapa.fase, '| temp:', mapa.temperatura);
          await _duplicarLeadSaoPauloTIA({ ..._leadSnapshotGRUPOOLX, mapaIntencao: mapa, perfilIA: _perfilFinalOLX }, _perfilFinalOLX.cidade, _leadSnapshotGRUPOOLX.mensagem);
          // Roda match se perfil suficiente
          const temMinimo = mapa.transacao.length && mapa.tipo_imovel.length && mapa.cidade.length && mapa.bairro.length && mapa.valor.length;
          if (temMinimo) {
            const matchCore = require('./cerebro/match-core');
            const _leadComMapaGRUPOOLX = { ..._leadSnapshotGRUPOOLX, mapaIntencao: mapa };
            await matchCore.processar({ lead: _leadComMapaGRUPOOLX, mensagem: _leadSnapshotGRUPOOLX.mensagem||'', canal: 'portal', userId: _leadSnapshotGRUPOOLX.userId||userId });
          }
        }
      } catch(e) { console.error('[WEBHOOK GRUPOOLX] erro portal-processor:', e.message); }
    }, 8000);
  } catch(err) { console.error('[WEBHOOK GRUPOOLX] erro:', err.message); }
});
// Aliases para ZAP, VivaReal e OLX individualmente
app.post('/webhook/zap/:userId', (req, res, next) => { req.url = req.url.replace('/webhook/zap/', '/webhook/grupoolx/'); next(); });
app.post('/webhook/vivareal/:userId', (req, res, next) => { req.url = req.url.replace('/webhook/vivareal/', '/webhook/grupoolx/'); next(); });
app.post('/webhook/olx/:userId', (req, res, next) => { req.url = req.url.replace('/webhook/olx/', '/webhook/grupoolx/'); next(); });

// WEBHOOK CHAVES NA MÃO
// WEBHOOK 123i / LOFT — mesmo formato do Grupo OLX
app.post('/webhook/123i/:userId', async (req, res) => {
  res.status(200).send('OK');
  try {
    const body = req.body || {};
    const userId = req.params.userId || '';
    console.log('[WEBHOOK 123i] userId:', userId, '| lead:', body.name);
    const { lerUsuarios: _lu123 } = require('./services/salvarUsuario');
    const _users = await _lu123();
    const _user = _users.find(u => u.id === userId);
    if (!_user) { console.warn('[WEBHOOK 123i] userId nao encontrado:', userId); return; }
    if (!_webhookTokenValido(userId, req)) { console.warn('[WEBHOOK 123i] token invalido para', userId); return; }
    const telefone = (body.phoneNumber || (body.ddd||'') + (body.phone||'')).replace(/\D/g,'');
    if (telefone && _users.some(u => (u.bloqueados || u.dados?.bloqueados || []).some(b => String(b).replace(/\D/g,'').slice(-8) === telefone.slice(-8)))) {
      console.log('[WEBHOOK 123i] numero bloqueado:', telefone); return;
    }
    const originLeadId = body.originLeadId || body.originListingId || '';
    const lead = {
      id: Date.now().toString(),
      eventId: originLeadId,
      nome: body.name || telefone || '',
      email: body.email || '',
      telefone, whatsapp: telefone, contato: telefone,
      mensagem: body.message || '',
      idAnuncio: body.idAnuncio || body.clientListingId || body.originListingId || '',
      fonte: '123i', origem: '123i', origemEntrada: 'webhook_123i',
      userId, codigoUsuario: userId,
      status: 'novo', score: 0, temperatura: 'frio', faseFunil: 'novo',
      mensagens: [], matches: [], timeline: [], eventos: [], followUps: [],
      criadoEm: body.timestamp || new Date().toISOString(),
    };
    const { lerLeads: _ll123, salvarLead: _sl123 } = require('./services/salvarLead');
    const _leads = await _ll123();
    const _dup = _leads.find(l =>
      (originLeadId && String(l.eventId||'') === String(originLeadId)) ||
      (telefone && String(l.telefone||'').replace(/\D/g,'').slice(-8) === telefone.slice(-8) && l.userId === userId)
    );
    if (_dup) { console.log('[WEBHOOK 123i] duplicata ignorada:', telefone); return; }
    await _cruzarImovelWebhook(lead, userId);
    await _sl123(lead);
    console.log('[WEBHOOK 123i] lead salva:', lead.nome, '|', telefone);
    _notificarNovaLead(userId, lead.id, lead.nome, '123i');

    const _msg123 = body.message || body.mensagem || lead.mensagem || '';
    const _leadSnapshot123i = { id: lead.id, userId: lead.userId||lead.codigoUsuario||userId||'', mensagem: _msg123, idAnuncio: lead.idAnuncio||'', perfilIA: lead.perfilIA||{}, origemEntrada: lead.origemEntrada||'webhook_123i', origem: lead.origem||'123i' };
    setTimeout(async () => {
      try {
        const { processarLeadPortal } = require('./cerebro/portal-processor');
        const { atualizarLead: _atualizar123i } = require('./services/salvarLead');
        const mapa = await processarLeadPortal(_leadSnapshot123i);
        if (mapa) {
          lead.mapaIntencao = mapa;

          // Buscar imóvel pelo idAnuncio para completar perfilIA
          let _imPortal = null;
          if (_leadSnapshot123i.idAnuncio) {
            const { query: _qImPortal } = require('./services/db');
            const _rPortal = await _qImPortal('SELECT * FROM imoveis WHERE id_externo=$1 OR id_interno=$1 OR id=$1 LIMIT 1', [_leadSnapshot123i.idAnuncio]);
            _imPortal = _rPortal.rows[0] || null;
          }
          const _perfilIA = {
            tipo: _imPortal?.tipo || mapa.tipo_imovel?.[0]?.valor || '',
            intencao: (_imPortal?.transacao==='venda'?'comprar':_imPortal?.transacao==='aluguel'?'alugar':_imPortal?.transacao) || (mapa.transacao?.[0]?.valor==='venda'?'comprar':mapa.transacao?.[0]?.valor==='aluguel'?'alugar':mapa.transacao?.[0]?.valor) || '',
            bairro: _imPortal?.bairro || mapa.bairro?.[0]?.valor || '',
            cidade: _imPortal?.cidade || mapa.cidade?.[0]?.valor || '',
            estado: _imPortal?.estado || mapa.estado?.[0]?.valor || '',
            quartos: _imPortal?.quartos || mapa.quartos?.[0]?.valor || '',
            suites: _imPortal?.suites || mapa.suites?.[0]?.valor || '',
            vagas: _imPortal?.vagas || mapa.vagas?.[0]?.valor || '',
            banheiros: _imPortal?.banheiros || mapa.banheiros?.[0]?.valor || '',
            area: _imPortal?.area_m2 || (typeof mapa.area?.[0]?.valor === 'object' ? mapa.area?.[0]?.valor?.max : mapa.area?.[0]?.valor) || '',
            valorMax: _imPortal ? parseFloat(_imPortal.valor_imovel||0) : (mapa.valor?.[0]?.valor?.max || 0),
            valorMin: 0,
          };
          const { query: _qMerge123 } = require('./services/db');
          const _rMerge123 = await _qMerge123('SELECT perfil_ia FROM leads WHERE id=$1', [lead.id]);
          const _perfilAtual123 = _rMerge123.rows[0]?.perfil_ia || {};
          const _perfilFinal123 = { ..._perfilAtual123, ..._perfilIA };
          Object.keys(_perfilFinal123).forEach(k => { if(!_perfilFinal123[k] && _perfilAtual123[k]) _perfilFinal123[k] = _perfilAtual123[k]; });
          if (_perfilIA.area) _perfilFinal123.area = parseFloat(_perfilIA.area) || _perfilIA.area;
          delete _perfilFinal123.area_max; delete _perfilFinal123.area_min;
          await _atualizar123i(lead.id, { mapaIntencao: mapa, faseFunil: mapa.fase, temperatura: mapa.temperatura, perfilIA: _perfilFinal123, bairro: _perfilFinal123.bairro||'', cidade: _perfilFinal123.cidade||'', estado: _perfilFinal123.estado||'', tipo: _perfilFinal123.tipo||'', tipo_operacao: _perfilFinal123.intencao||'', idAnuncio: _leadSnapshot123i.idAnuncio||'' });
          console.log('[WEBHOOK 123i] mapa salvo | fase:', mapa.fase, '| temp:', mapa.temperatura);
          await _duplicarLeadSaoPauloTIA({ ..._leadSnapshot123i, mapaIntencao: mapa, perfilIA: _perfilFinal123 }, _perfilFinal123.cidade, _leadSnapshot123i.mensagem);
          // Roda match se perfil suficiente
          const temMinimo = mapa.transacao.length && mapa.tipo_imovel.length && mapa.cidade.length && mapa.bairro.length && mapa.valor.length;
          if (temMinimo) {
            const matchCore = require('./cerebro/match-core');
            const _leadComMapa123i = { ..._leadSnapshot123i, mapaIntencao: mapa };
            await matchCore.processar({ lead: _leadComMapa123i, mensagem: _leadSnapshot123i.mensagem||'', canal: 'portal', userId: _leadSnapshot123i.userId||userId });
          }
        }
      } catch(e) { console.error('[WEBHOOK 123i] erro portal-processor:', e.message); }
    }, 8000);
  } catch(err) { console.error('[WEBHOOK 123i] erro:', err.message); }
});

app.post('/webhook/chaves/:userId', async (req, res) => {
  res.status(200).send('OK');
  try {
    const body = req.body || {};
    const userId = req.params.userId || '';
    console.log('[WEBHOOK CHAVES] userId:', userId, '| lead:', body.name);
    const { lerUsuarios: _luCH } = require('./services/salvarUsuario');
    const _users = await _luCH();
    const _user = _users.find(u => u.id === userId);
    if (!_user) { console.warn('[WEBHOOK CHAVES] userId nao encontrado:', userId); return; }
    if (!_webhookTokenValido(userId, req)) { console.warn('[WEBHOOK CHAVES] token invalido para', userId); return; }
    const telefone = (body.phone || '').replace(/\D/g,'');
    if (telefone && _users.some(u => (u.bloqueados || u.dados?.bloqueados || []).some(b => String(b).replace(/\D/g,'').slice(-8) === telefone.slice(-8)))) {
      console.log('[WEBHOOK CHAVES] numero bloqueado:', telefone); return;
    }
    const lead = {
      id: Date.now().toString(),
      nome: body.name || telefone || '',
      email: body.email || '',
      telefone, whatsapp: telefone, contato: telefone,
      mensagem: body.message || '',
      idAnuncio: body.idAnuncio || body.reference || body.clientListingId || '',
      fonte: 'Chaves na Mão', origem: 'Chaves na Mão', origemEntrada: 'webhook_chaves',
      userId, codigoUsuario: userId,
      status: 'novo', score: 0, temperatura: 'frio', faseFunil: 'novo',
      mensagens: [], matches: [], timeline: [], eventos: [], followUps: [],
      criadoEm: new Date().toISOString(),
    };
    const { lerLeads: _llCH, salvarLead: _slCH } = require('./services/salvarLead');
    const _leads = await _llCH();
    const _dup = _leads.find(l =>
      telefone && String(l.telefone||'').replace(/\D/g,'').slice(-8) === telefone.slice(-8) && l.userId === userId
    );
    if (_dup && !_temPerfilMinimoLead(_dup)) { console.log('[WEBHOOK CHAVES] duplicata ignorada:', telefone); return; }
    if (_dup && _temPerfilMinimoLead(_dup)) { console.log('[WEBHOOK CHAVES] perfil minimo — cria nova lead:', telefone); lead.id = Date.now().toString(); }
    await _cruzarImovelWebhook(lead, userId);
    await _slCH(lead);
    console.log('[WEBHOOK CHAVES] lead salva:', lead.nome, '|', telefone);
    _notificarNovaLead(userId, lead.id, lead.nome, 'Chaves na Mão');

    const _msgCH = String(body.message || body.mensagem || lead.mensagem || '');
    const _refCH = String(body.reference || lead.idAnuncio || '');
    const _leadSnapshotCHAVES = { id: lead.id, userId: lead.userId||lead.codigoUsuario||userId||'', mensagem: _msgCH, idAnuncio: lead.idAnuncio||'', perfilIA: lead.perfilIA||{}, origemEntrada: lead.origemEntrada||'webhook_chaves', origem: lead.origem||'Chaves na Mão' };
    const _idCH = String(lead.id);
    const _uidCH = String(userId);
    console.log('[CHAVES SNAP] msg:', _msgCH.substring(0,50), '| id:', _idCH, '| userId:', _uidCH);
    if (_msgCH) {
      try {
        const { query: _qCH } = require('./services/db');
        await _qCH("UPDATE leads SET dados = jsonb_set(COALESCE(dados,'{}'), '{mensagem}', $1::jsonb) WHERE id=$2", [JSON.stringify(_msgCH), _idCH]);
      } catch(e) {}
    }

    setTimeout(async () => {
      try {
        const { processarLeadPortal } = require('./cerebro/portal-processor');
        const { atualizarLead: _atualizarCHAVES } = require('./services/salvarLead');
        const mapa = await processarLeadPortal(_leadSnapshotCHAVES);
        if (mapa) {
          lead.mapaIntencao = mapa;

          // Buscar imóvel pelo idAnuncio para completar perfilIA
          let _imPortal = null;
          if (_leadSnapshotCHAVES.idAnuncio) {
            const { query: _qImPortal } = require('./services/db');
            const _rPortal = await _qImPortal('SELECT * FROM imoveis WHERE id_externo=$1 OR id_interno=$1 OR id=$1 LIMIT 1', [_leadSnapshotCHAVES.idAnuncio]);
            _imPortal = _rPortal.rows[0] || null;
          }
          const _perfilIA = {
            tipo: _imPortal?.tipo || mapa.tipo_imovel?.[0]?.valor || '',
            intencao: (_imPortal?.transacao==='venda'?'comprar':_imPortal?.transacao==='aluguel'?'alugar':_imPortal?.transacao) || (mapa.transacao?.[0]?.valor==='venda'?'comprar':mapa.transacao?.[0]?.valor==='aluguel'?'alugar':mapa.transacao?.[0]?.valor) || '',
            bairro: _imPortal?.bairro || mapa.bairro?.[0]?.valor || '',
            cidade: _imPortal?.cidade || mapa.cidade?.[0]?.valor || '',
            estado: _imPortal?.estado || mapa.estado?.[0]?.valor || '',
            quartos: _imPortal?.quartos || mapa.quartos?.[0]?.valor || '',
            suites: _imPortal?.suites || mapa.suites?.[0]?.valor || '',
            vagas: _imPortal?.vagas || mapa.vagas?.[0]?.valor || '',
            banheiros: _imPortal?.banheiros || mapa.banheiros?.[0]?.valor || '',
            area: _imPortal?.area_m2 || (typeof mapa.area?.[0]?.valor === 'object' ? mapa.area?.[0]?.valor?.max : mapa.area?.[0]?.valor) || '',
            valorMax: _imPortal ? parseFloat(_imPortal.valor_imovel||0) : (mapa.valor?.[0]?.valor?.max || 0),
            valorMin: 0,
          };
          const { query: _qMergeCH } = require('./services/db');
          const _rMergeCH = await _qMergeCH('SELECT perfil_ia FROM leads WHERE id=$1', [lead.id]);
          const _perfilAtualCH = _rMergeCH.rows[0]?.perfil_ia || {};
          const _perfilFinalCH = { ..._perfilAtualCH, ..._perfilIA };
          Object.keys(_perfilFinalCH).forEach(k => { if(!_perfilFinalCH[k] && _perfilAtualCH[k]) _perfilFinalCH[k] = _perfilAtualCH[k]; });
          if (_perfilIA.area) _perfilFinalCH.area = parseFloat(_perfilIA.area) || _perfilIA.area;
          delete _perfilFinalCH.area_max; delete _perfilFinalCH.area_min;
          await _atualizarCHAVES(lead.id, { mapaIntencao: mapa, faseFunil: mapa.fase, temperatura: mapa.temperatura, perfilIA: _perfilFinalCH, bairro: _perfilFinalCH.bairro||'', cidade: _perfilFinalCH.cidade||'', estado: _perfilFinalCH.estado||'', tipo: _perfilFinalCH.tipo||'', tipo_operacao: _perfilFinalCH.intencao||'', idAnuncio: _leadSnapshotCHAVES.idAnuncio||'' });
          console.log('[WEBHOOK CHAVES] mapa salvo | fase:', mapa.fase, '| temp:', mapa.temperatura);
          await _duplicarLeadSaoPauloTIA({ ..._leadSnapshotCHAVES, mapaIntencao: mapa, perfilIA: _perfilFinalCH }, _perfilFinalCH.cidade, _leadSnapshotCHAVES.mensagem);
          // Roda match se perfil suficiente
          const temMinimo = mapa.transacao.length && mapa.tipo_imovel.length && mapa.cidade.length && mapa.bairro.length && mapa.valor.length;
          if (temMinimo) {
            const matchCore = require('./cerebro/match-core');
            const _leadComMapaCHAVES = { ..._leadSnapshotCHAVES, mapaIntencao: mapa };
            await matchCore.processar({ lead: _leadComMapaCHAVES, mensagem: _leadSnapshotCHAVES.mensagem||'', canal: 'portal', userId: _leadSnapshotCHAVES.userId||userId });
          }
        }
      } catch(e) { console.error('[WEBHOOK CHAVES] erro portal-processor:', e.message); }
    }, 8000);
  } catch(err) { console.error('[WEBHOOK CHAVES] erro:', err.message); }
});

const PORT = process.env.PORT || port || 3000;

app.post('/app/perfil/localizacao', auth, express.json(), async (req,res)=>{
  const { lat, lng, endereco, cep, rua, numero, bairro, cidade, estado } = req.body;
  const isJson = (req.headers['content-type']||'').includes('application/json');
  try {
    const { query: _qLoc } = require('./services/db');
    const latNum = parseFloat(lat), lngNum = parseFloat(lng);
    const r = await _qLoc(
      'UPDATE usuarios SET lat=COALESCE(' + String.fromCharCode(36) + '1,lat), lng=COALESCE(' + String.fromCharCode(36) + '2,lng), endereco=' + String.fromCharCode(36) + '3 WHERE id=' + String.fromCharCode(36) + '4 RETURNING lat,lng,endereco',
      [Number.isFinite(latNum)?latNum:null, Number.isFinite(lngNum)?lngNum:null, endereco||'', req.session.user.id]
    );
    const extras = {};
    if (cep !== undefined) extras.cep = cep;
    if (rua !== undefined) extras.rua = rua;
    if (numero !== undefined) extras.numero = numero;
    if (bairro !== undefined) extras.bairro = bairro;
    if (cidade !== undefined) extras.cidade = cidade;
    if (estado !== undefined) extras.estado = estado;
    if (Object.keys(extras).length) {
      const { atualizarUsuario } = require('./services/salvarUsuario');
      await atualizarUsuario(req.session.user.id, extras);
    }
    const row = r.rows[0] || {};
    const users = (_cacheUsuarios || []);
    const idx = users.findIndex(u => u.id === req.session.user.id);
    if(idx >= 0) {
      users[idx].lat = row.lat;
      users[idx].lng = row.lng;
      users[idx].endereco = row.endereco;
      Object.assign(users[idx], extras);
      req.session.user = { ...req.session.user, ...users[idx] };
    }
    if (req.session.user.precisaCompletarPerfil) {
      const completo = await _verificarPerfilCompleto(req.session.user.id);
      if (completo) req.session.user.precisaCompletarPerfil = false;
    }
  } catch(e) { console.error('[localizacao]', e.message); }
  if(isJson) return res.json({ok:true, perfilCompleto: !req.session.user.precisaCompletarPerfil});
  res.redirect('/app/perfil');
});





// Servir XML dos portais
app.get('/feed-:portal.xml', (req,res)=>{
  const fs = require('fs');
  const portal = req.params.portal;
  const file = dataPath(`feed-${portal}.xml`);

  if(fs.existsSync(file)){
    res.set('Content-Type','application/xml');
    return res.send(fs.readFileSync(file,'utf8'));
  }

  res.status(404).send('XML não encontrado');
});


// Buscar match no QuintoAndar a partir da tela de detalhes da lead
app.post('/app/lead/:id/buscar-quintoandar', auth, async (req, res) => {
  const leadIdParam = req.params.id;

  // responde rápido para o usuário poder navegar
  res.redirect('/app/lead/' + leadIdParam);

  setImmediate(async () => {
    try {
      console.log('🔎 Match QuintoAndar em background iniciado:', leadIdParam);

      const leads = (_cacheLeads || []);
      const imoveis = fs.existsSync(dataFile('imoveis.json')) ? ((_cacheImoveis || [])) : [];

      const lead = leads.find(l =>
        String(l.leadId) === String(leadIdParam) ||
        String(l.id) === String(leadIdParam) ||
        String(l.idAnuncio) === String(leadIdParam) ||
        String(l.imovel_interesse) === String(leadIdParam)
      );

      if (!lead) {
        console.log('Lead não encontrada no background:', leadIdParam);
        return;
      }

      lead.matchQuintoAndarStatus = 'processando';
      salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));

      const idOrigem = lead.imovel_interesse || lead.idAnuncio || lead.id_anuncio || lead.id;
      const imovelOrigem = imoveis.find(im =>
        String(im.idExterno || im.id || im.codigo || im.idOriginal) === String(idOrigem)
      );

      const origem = imovelOrigem || lead;

      const { searchQuintoAndar } = require('./services/quintoandar');
      const candidatos = await searchQuintoAndar(origem);

      function norm(v = '') {
        return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      }

      function normalizeTipo(tipo = '') {
        const t = String(tipo || '').toLowerCase();
        if (t.includes('apart')) return 'apartamento';
        if (t.includes('condo')) return 'apartamento';
        if (t.includes('cobertura') || t.includes('penthouse')) return 'cobertura';
        if (t.includes('loft')) return 'loft';
        if (t.includes('studio') || t.includes('flat')) return 'studio';
        if (t.includes('kitnet') || t.includes('kitinete') || t.includes('conjugado')) return 'kitnet';
        if (t.includes('sobrado')) return 'casa';
        if (t.includes('casa')) return 'casa';
        return t.trim();
      }

      const { filtrarCandidatosPelaRegraInterna } = require('./matchBaseInterna');
      const usersData = fs.existsSync(dataPath('users.json')) ? (_cacheUsuarios || []) : [];

      function calcularScoreInterno(origem, cand) {
        let score = 0;

        const valorOrigem = Number(origem.valor_imovel || origem.valor || 0);
        const valorCand = Number(cand.valor_imovel || cand.valor || 0);
        if (valorOrigem && valorCand) {
          const diff = Math.abs(valorCand - valorOrigem) / valorOrigem;
          score += Math.max(0, Math.round(35 - diff * 100));
        }

        const areaOrigem = Number(origem.area_m2 || origem.area || 0);
        const areaCand = Number(cand.area_m2 || cand.area || 0);
        if (areaOrigem && areaCand) {
          const diff = Math.abs(areaCand - areaOrigem) / areaOrigem;
          score += Math.max(0, Math.round(25 - diff * 100));
        }

        if (norm(cand.bairro) === norm(origem.bairro || lead.bairro)) score += 15;
        if (normalizeTipo(cand.tipo) === normalizeTipo(origem.tipo || lead.tipo)) score += 10;

        const qOrigem = Number(origem.quartos || lead.quartos || 0);
        const qCand = Number(cand.quartos || 0);
        if (qOrigem && qCand === qOrigem) score += 10;
        else if (qOrigem && qCand === qOrigem + 1) score += 8;

        if (Number(cand.vagas || 0) >= Number(origem.vagas || lead.vagas || 0)) score += 5;

        return Math.max(1, Math.round(score));
      }

      const filtrados = filtrarCandidatosPelaRegraInterna(lead, candidatos, imoveis).map(i => {
        const score = calcularScoreInterno(origem || lead, i);
        return {
          ...i,
          fonte: (usersData.find(u => u.id === i.userId) || {}).nome || i.fonte || i.source || 'Carteira',
          score,
          bestScore: score
        };
      }).sort((a,b) => (b.score || 0) - (a.score || 0));

      /* REGRA ANTIGA DESATIVADA
      const filtradosAntigos = (candidatos || []).filter(i => {
        if (norm(i.cidade || origem.cidade) !== norm(origem.cidade)) return false;
        if (norm(i.estado || origem.estado) !== norm(origem.estado)) return false;

        const bairroCandidato = norm(i.bairro);
        const bairroOrigem = norm(origem.bairro);
        const bairroLead = norm(lead.bairro || '');

        if (!bairroCandidato) return false;
        if (bairroCandidato !== bairroOrigem && bairroCandidato !== bairroLead) return false;

        if (normalizeTipo(i.tipo) !== normalizeTipo(origem.tipo)) return false;

        const quartosOrigem = Number(origem.quartos || 0);
        const quartosCand = Number(i.quartos || 0);
        if (quartosOrigem > 0 && (quartosCand < quartosOrigem || quartosCand > quartosOrigem + 1)) return false;

        const valorOrigem = Number(origem.valor_imovel || origem.valor || 0);
        const valorCand = Number(i.valor_imovel || i.valor || 0);
        if (valorOrigem > 0 && (valorCand < valorOrigem * 0.70 || valorCand > valorOrigem * 1.20)) return false;

        const areaOrigem = Number(origem.area_m2 || origem.area || 0);
        const areaCand = Number(i.area_m2 || i.area || 0);
        if (areaOrigem > 0 && (areaCand < areaOrigem * 0.90 || areaCand > areaOrigem * 1.20)) return false;

        const suitesOrigem = Number(origem.suites || 0);
        const suitesCand = Number(i.suites || 0);
        if (suitesOrigem > 0 && (suitesCand < suitesOrigem || suitesCand > suitesOrigem + 1)) return false;

        const vagasOrigem = Number(origem.vagas || 0);
        const vagasCand = Number(i.vagas || 0);
        if (vagasOrigem > 0 && vagasCand < vagasOrigem) return false;

        const banheirosOrigem = Number(origem.banheiros || 0);
        const banheirosCand = Number(i.banheiros || 0);
        if (banheirosOrigem > 0 && banheirosCand < banheirosOrigem) return false;

        i.fonte = i.fonte || 'QuintoAndar';
        return true;
      });

      const leadsAtualizados = (_cacheLeads || []);
      const idx = leadsAtualizados.findIndex(l =>
        String(l.leadId) === String(leadIdParam) ||
        String(l.id) === String(leadIdParam) ||
        String(l.idAnuncio) === String(leadIdParam) ||
        String(l.imovel_interesse) === String(leadIdParam)
      );

      */
      if (idx >= 0) {
        leadsAtualizados[idx].matchesQuintoAndar = filtrados;
        leadsAtualizados[idx].matchQuintoAndarCount = filtrados.length;
        leadsAtualizados[idx].matchQuintoAndarAt = new Date().toISOString();
        leadsAtualizados[idx].matchQuintoAndarStatus = 'finalizado';
        salvarTodosLeads(leadsAtualizados).catch(e=>console.error("[leads]",e.message));
      }

      console.log('✅ Match QuintoAndar finalizado em background:', leadIdParam, filtrados.length);
    } catch (e) {
      console.error('Erro buscar QuintoAndar background:', e.message);
    }
  });
});






// AJUDA GLOBAL INTELIGENTE COMPLETA
app.post('/api/ajuda', (req, res) => {
  const perguntaOriginal = (req.body && req.body.pergunta ? req.body.pergunta : '').toString();

  function normalizar(txt){
    return txt.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9\s]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  const pergunta = normalizar(perguntaOriginal);

  const baseAjuda = [
    {
      tema:'Dashboard',
      palavras:['dashboard','inicio','home','painel inicial','app home','tela inicial','resumo'],
      resposta:`O Dashboard é a tela inicial da conta.

Ele mostra o resumo do usuário logado, como imóveis cadastrados, leads, visitas e matches. Cada usuário deve ver somente os próprios dados.`
    },
    {
      tema:'Cadastrar imóvel',
      palavras:['cadastrar imovel','cadastro imovel','novo imovel','adicionar imovel','subir imovel','criar imovel','colocar imovel','cadstro iovel','cadastra iovel'],
      resposta:`Para cadastrar um imóvel, clique em "Cadastrar Imóvel" no menu lateral.

Você pode cadastrar manualmente preenchendo os dados do imóvel, proprietário, fotos e informações principais.

Todo imóvel cadastrado pertence automaticamente ao usuário logado.`
    },
    {
      tema:'Meus imóveis',
      palavras:['meus imoveis','carteira','carteira publicada','imoveis ativos','listar imoveis','ver imoveis','imoveis cadastrados'],
      resposta:`A tela "Meus imóveis" mostra os imóveis cadastrados ou importados pelo usuário.

Ali você pode acompanhar a carteira, abrir detalhes, editar dados e acessar a página pública do imóvel.`
    },
    {
      tema:'Editar imóvel',
      palavras:['editar imovel','alterar imovel','mudar foto','atualizar imovel','dados do imovel','corrigir imovel'],
      resposta:`Para editar um imóvel, entre em "Meus imóveis" e clique para abrir ou editar o imóvel.

Você pode atualizar dados, fotos, proprietário, publicação e informações usadas nos portais e na página pública.`
    },
    {
      tema:'Fotos do imóvel',
      palavras:['foto','fotos','imagem','imagens','upload foto','adicionar fotos','fotos do imovel'],
      resposta:`As fotos do imóvel são usadas na página pública, na vitrine e na apresentação para o cliente.

Quando cadastrar ou editar um imóvel, adicione fotos boas para melhorar a conversão de leads e visitas.`
    },
    {
      tema:'Página pública do imóvel',
      palavras:['pagina publica','link do imovel','imovel externo','cliente ver imovel','pagina externa','/imovel','ver imovel'],
      resposta:`A página pública do imóvel é o link externo que o cliente pode acessar.

Nessa página, o cliente pode ver os dados do imóvel e demonstrar interesse. Quando ele se cadastra pela página pública, a fonte correta do lead deve ser MatchImoveis.`
    },
    {
      tema:'Falar no WhatsApp',
      palavras:['whatsapp','falar whatsapp','botao whatsapp','chamar whatsapp','contato whatsapp'],
      resposta:`O botão de WhatsApp deve abrir o contato direto depois de pegar os dados básicos do cliente.

Esse botão não precisa pedir data e horário. Data e horário são usados apenas no fluxo de agendamento de visita.`
    },
    {
      tema:'Importar leads',
      palavras:['importar leads','subir leads','planilha leads','excel leads','csv leads','upload leads','lista leads','importar planilha'],
      resposta:`Para importar leads, vá em "Importar Leads".

A planilha deve ter principalmente:
- Nome do cliente
- Telefone ou contato
- Email, se tiver
- URL do anúncio de interesse ou ID do anúncio + portal

A URL é a fonte principal para o sistema extrair o perfil do imóvel de interesse.`
    },
    {
      tema:'Campos da planilha de leads',
      palavras:['campos planilha','colunas planilha','nome telefone email id url','id anuncio','url anuncio','telefone 2'],
      resposta:`Na importação de leads, o sistema considera apenas os campos importantes:
- Nome
- Telefone / contato
- Telefone 2, se existir
- Email
- ID do anúncio
- URL do anúncio
- Cidade, estado, bairro, se vierem na planilha

Campos extras devem ser ignorados.`
    },
    {
      tema:'Extração do imóvel de interesse',
      palavras:['extrair','extrator','imovelweb','extracao','buscar dados url','url do anuncio','perfil do imovel'],
      resposta:`A extração usa a URL do anúncio para montar o perfil do imóvel que o cliente procurou.

O sistema tenta identificar bairro, cidade, estado, tipo, valor, área, quartos, suítes, banheiros e vagas.

A extração deve considerar somente imóveis de São Paulo/SP.`
    },
    {
      tema:'Match',
      palavras:['match','matches','fazer match','buscar match','imoveis parecidos','oportunidades','compatibilidade'],
      resposta:`O match compara o imóvel de interesse do lead com outros imóveis disponíveis.

A lógica usa regras como:
- Cidade e estado iguais
- Bairro compatível
- Tipo normalizado igual
- Quartos compatíveis
- Valor dentro da faixa
- Área dentro da faixa
- Suítes, banheiros e vagas conforme regra

Depois mostra os melhores imóveis encontrados para aquele lead.`
    },
    {
      tema:'Regras de match',
      palavras:['regras match','como calcula match','score','pontuacao','criterio match','criterios'],
      resposta:`As regras principais do match são:

- Somente São Paulo/SP
- Não comparar o imóvel com ele mesmo
- Tipo precisa ser compatível
- Bairro deve bater com a origem ou lead
- Quartos podem ser iguais ou próximos conforme regra
- Valor e área têm limite de variação
- Suítes, banheiros e vagas ajudam na pontuação

O score indica a qualidade do match.`
    },
    {
      tema:'QuintoAndar',
      palavras:['quintoandar','quinto andar','matches quintoandar','buscar quintoandar'],
      resposta:`O QuintoAndar é uma das fontes usadas para buscar imóveis candidatos ao match.

O sistema procura imóveis no mesmo bairro e depois filtra conforme as regras de compatibilidade.`
    },
    {
      tema:'REMAX',
      palavras:['remax','re max','matches remax','buscar remax'],
      resposta:`A RE/MAX é uma fonte adicional de imóveis para aumentar o volume de matches.

A busca RE/MAX deve preservar a lógica principal do sistema e funcionar como módulo separado.`
    },
    {
      tema:'OLX',
      palavras:['olx','matches olx','proprietario olx','telefone olx','anunciante'],
      resposta:`A OLX foi criada como fonte estratégica para encontrar imóveis e, quando possível, dados do anunciante.

A prioridade é encontrar imóveis em São Paulo/SP, preferindo anúncios diretos de proprietários, depois corretores parceiros e depois imobiliárias.`
    },
    {
      tema:'Oferta do cliente',
      palavras:['oferta cliente','espelho cliente','pagina de oferta','cliente oferta','matches para cliente','enviar matches'],
      resposta:`A página de oferta do cliente mostra somente os imóveis que deram match.

Ela não precisa mostrar o imóvel de origem. O cliente pode avaliar os imóveis, clicar para ver detalhes e solicitar visita.`
    },
    {
      tema:'Solicitar visita',
      palavras:['solicitar visita','quero visitar','agendar visita','cliente quer visitar','pedir visita'],
      resposta:`Quando o cliente clica em "Quero visitar", o sistema deve criar uma solicitação de visita.

A visita deve ir para o usuário dono do imóvel cadastrado ou importado.`
    },
    {
      tema:'Visitas',
      palavras:['visitas','minhas visitas','confirmar visita','recusar visita','solicitacoes de visita','agenda'],
      resposta:`A tela "Visitas" mostra as solicitações recebidas.

O usuário pode acompanhar os pedidos de visita e confirmar ou recusar conforme disponibilidade.`
    },
    {
      tema:'Dono do imóvel',
      palavras:['dono imovel','usuario dono','quem recebe visita','quem cadastrou','proprietario usuario','imovel pertence'],
      resposta:`Todo imóvel pertence ao usuário que cadastrou ou importou.

Se o usuário cadastrou manualmente, o imóvel é dele.
Se importou via XML, todos os imóveis daquele XML pertencem a ele.

As visitas e leads desse imóvel devem ir para esse usuário.`
    },
    {
      tema:'Portais e XML',
      palavras:['xml','portais','portal','vivareal','zap','olx xml','chaves na mao','feed xml','publicar portal'],
      resposta:`Na tela "Portais / XML", o usuário pode gerar links XML para enviar imóveis aos portais.

A ideia é ter XML por canal, como VivaReal, ZAP, OLX, Chaves na Mão ou outros parceiros.`
    },
    {
      tema:'Importar XML',
      palavras:['importar xml','subir xml','xml imoveis','carteira xml','feed de imoveis'],
      resposta:`A importação XML serve para trazer uma carteira de imóveis para dentro do sistema.

Os imóveis importados ficam vinculados ao usuário logado e podem ser usados em páginas públicas, visitas, portais e match.`
    },
    {
      tema:'Notificações',
      palavras:['notificacao','notificacoes','sino','alerta','central notificacoes','avisos'],
      resposta:`A Central de Notificações mostra avisos importantes da conta.

A rotina ideal é o usuário entrar no sistema, olhar primeiro as notificações e resolver pendências como visitas, novos leads e novos matches.`
    },
    {
      tema:'Perfil',
      palavras:['perfil','minha conta','tipo de conta','corretor','imobiliaria','construtora','proprietario','foto usuario','dados usuario'],
      resposta:`A tela de Perfil mostra os dados da conta do usuário.

O usuário pode ser corretor, imobiliária, construtora ou proprietário. As contas funcionam de forma parecida; o tipo serve para identificação e contexto.`
    },
    {
      tema:'Login',
      palavras:['login','entrar','celular','acesso','senha','usuario'],
      resposta:`O login do MatchImoveis usa principalmente o celular do usuário.

Depois de entrar, cada usuário deve ver somente os próprios imóveis, leads, visitas e dados.`
    },
    {
      tema:'Fonte do lead',
      palavras:['fonte lead','fonte matchimoveis','lead matchimoveis','fonte imovelweb','origem lead'],
      resposta:`Quando o lead vem de uma página externa do próprio MatchImoveis, a fonte correta deve ser MatchImoveis.

Quando o lead vem de uma planilha ou portal externo, a fonte pode ser o portal de origem, como ImovelWeb, OLX, QuintoAndar ou outro.`
    },
    {
      tema:'Ajuda global',
      palavras:['ajuda','duvida','como funciona','icone ajuda','suporte','pergunta'],
      resposta:`A Ajuda Global serve para responder dúvidas sobre qualquer funcionalidade da app.

Clique no ícone de ajuda, digite a dúvida e o sistema busca a melhor resposta na memória de funcionalidades.`
    }
  ];

  function scoreItem(item){
    let score = 0;
    const perguntaTokens = pergunta.split(' ').filter(t => t.length >= 3);

    for(const palavra of item.palavras){
      const p = normalizar(palavra);

      if(pergunta === p) score += 200;
      if(pergunta.includes(p)) score += 120;

      const termos = p.split(' ').filter(t => t.length >= 3);
      for(const termo of termos){
        if(pergunta.includes(termo)) score += 18;
      }
    }

    for(const token of perguntaTokens){
      const tema = normalizar(item.tema);
      if(tema.includes(token)) score += 15;
    }

    if(pergunta.includes('cad') && (pergunta.includes('imov') || pergunta.includes('iovel'))) {
      if(item.tema === 'Cadastrar imóvel') score += 120;
    }
    if(pergunta.includes('lead') && item.tema.includes('lead')) score += 70;
    if(pergunta.includes('visit') && item.tema.includes('Visita')) score += 70;
    if(pergunta.includes('xml') && item.tema.includes('XML')) score += 70;
    if(pergunta.includes('match') && item.tema.includes('Match')) score += 70;
    if(pergunta.includes('whats') && item.tema.includes('WhatsApp')) score += 70;
    if(pergunta.includes('portal') && item.tema.includes('Portais')) score += 70;
    if(pergunta.includes('foto') && item.tema.includes('Fotos')) score += 70;

    return score;
  }

  if(!pergunta){
    return res.json({resposta:'Digite sua dúvida sobre a app MatchImoveis.'});
  }

  const ranking = baseAjuda
    .map(item => ({...item, score: scoreItem(item)}))
    .sort((a,b) => b.score - a.score);

  const melhor = ranking[0];

  if(!melhor || melhor.score <= 0){
    return res.json({
      resposta:`Ainda não encontrei uma resposta exata para essa dúvida.

Tente perguntar de outra forma, por exemplo:
- Como cadastrar um imóvel?
- Como importar leads?
- Como gerar XML?
- Como funciona o match?
- Como confirmar uma visita?
- Como editar meu perfil?`
    });
  }

  res.json({
    tema: melhor.tema,
    score: melhor.score,
    resposta: melhor.resposta
  });
});




// MIDDLEWARE — injeta mensagensNaoLidas em todas as rotas auth
app.use((req, res, next) => {
  if (!req.session || !req.session.user) return next();
  try {
    const user = req.session.user;
    const leads = (_cacheLeads || []);
    let total = 0;
    leads
      .filter(l => !l.codigoUsuario || l.codigoUsuario === user.id || l.userId === user.id || l.usuarioId === user.id || l.corretorId === user.id)
      .forEach(l => {
        if (l.mensagens) {
          total += l.mensagens.filter(m => !m.lida && m.de === 'cliente').length;
        }
      });
    res.locals.mensagensNaoLidas = total;
  } catch(e) {
    res.locals.mensagensNaoLidas = 0;
  }
  next();
});



// LIMPAR DADOS DE UMA CONTA — ADMIN

// ZERAR LEADS + MENSAGENS WA + NOTIFICACOES DE UMA CONTA

// ── KEEP-ALIVE RENDER — auto-ping a cada 4 minutos ──────────────────────────
setInterval(() => {
  const _BASE = process.env.RENDER ? 'https://matchimoveis.ia.br' : null;
  if (!_BASE) return;
  fetch(_BASE + '/health').catch(() => {});
}, 4 * 60 * 1000);

// ── HEALTH CHECK ─────────────────────────────────────────────────────────────
// KEEP-ALIVE Evolution API — acorda a cada 4 minutos
setInterval(() => {
  const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
  const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
  fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
    headers: { 'apikey': EVOLUTION_KEY }
  }).then(() => console.log('[KEEP-ALIVE] Evolution API acordada'))
    .catch(() => console.log('[KEEP-ALIVE] Evolution API nao respondeu'));
}, 4 * 60 * 1000); // 4 minutos — mantém Evolution API acordada
// 
// ── WA_RECONECTOR — verifica e reconecta WhatsApp a cada 5 minutos ───────────
// setInterval(async () => {
//   if (!process.env.RENDER) return; // só no Render
//   try {
//     const _EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
//     const _EK = process.env.EVOLUTION_KEY || 'match2025evolution';
//     const _users = (_cacheUsuarios || []);
// 
//     for (const user of _users) {
//       if (!user.whatsappInstance) continue;
//       try {
//         const r = await fetch(_EU + '/instance/connectionState/' + user.whatsappInstance, {
//           headers: { 'apikey': _EK }
//         });
//         const d = await r.json();
//         const status = d?.instance?.state || d?.state || '';
// 
//         if (status !== 'open') {
//           console.log('[WA_RECONECTOR] instancia desconectada:', user.whatsappInstance, '| status:', status);
//           // Tenta reconectar
//           await fetch(_EU + '/instance/connect/' + user.whatsappInstance, {
//             method: 'GET',
//             headers: { 'apikey': _EK }
//           });
//           console.log('[WA_RECONECTOR] tentativa de reconexao enviada para:', user.whatsappInstance);
//         }
//       } catch(e) {
//         console.log('[WA_RECONECTOR] erro instancia', user.whatsappInstance, ':', e.message);
//       }
//     }
//   } catch(e) {
//     console.error('[WA_RECONECTOR] erro geral:', e.message);
//   }
// }, 5 * 60 * 1000); // verifica a cada 5 minutos
// ── FIM WA_RECONECTOR ────────────────────────────────────────────────────────
// 
// ── JOB_FOLLOWUPS — processa followUps pendentes vencidos ────────────────────
setInterval(async () => {
  try {
    const _leads = await lerLeadsData();
    const _users = (_cacheUsuarios || []);
    const _agora = Date.now();
    const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
    const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
    const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
    let _salvou = false;

    async function _enviarWA(instancia, numero, texto) {
      try {
        await fetch(EU + '/message/sendText/' + instancia, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EK },
          body: JSON.stringify({ number: numero, text: texto })
        });
      } catch(e) { console.error('[JOB FU] erro envio WA:', e.message); }
    }

    for (let i = 0; i < _leads.length; i++) {
      const lead = _leads[i];
      if (!lead.followUps || !lead.followUps.length) continue;

      const _userId = lead.userId || lead.corretorId || lead.codigoUsuario || '';
      const _user = _users.find(u => u.id === _userId);
      const _instancia = _user?.whatsappInstance || 'match-corretor';
      const _contato = (lead.telefone || lead.whatsapp || lead.contato || '').replace(/\D/g, '');

      let _mudou = false;

      for (let j = 0; j < lead.followUps.length; j++) {
        const fu = lead.followUps[j];
        if (fu.status !== 'pendente') continue;
        if (!fu.prazo || new Date(fu.prazo).getTime() > _agora) continue;

        console.log('[JOB FU] disparando:', fu.tipo, '| lead:', lead.nome || _contato);

        _leads[i].followUps[j].status = 'executado';
        _leads[i].followUps[j].executadoEm = new Date().toISOString();
        _mudou = true;

        if (!_contato || !_instancia) continue;

        consumir(_leads[i].userId || _leads[i].corretorId, 'followup_auto').catch(()=>{});
        if (fu.tipo === 'enviar_vitrine') {
          if (_leads[i].vitrineEnviada) continue;
          const _matches = (_leads[i].matchesAuto || _leads[i].matches || []).length;
          if (_matches === 0) continue; // não envia vitrine vazia
          const _link = BASE_URL + '/cliente/oferta/' + lead.id + '?userId=' + _userId;
          const _msg = 'Ola ' + (lead.nome || '') + '! Encontramos '
            + _matches + ' imove' + (_matches === 1 ? 'l' : 'is')
            + ' que combinam com o seu perfil.\n\nAcesse sua selecao personalizada:\n'
            + _link + '\n\nEscolha o imovel que mais gostou e agende sua visita! \n\n' + ((_user && _user.nome) ? _user.nome : 'Seu corretor') + ' - MatchImoveis';
          await _enviarWA(_instancia, _contato, _msg);
          // Envia por email se lead tiver email
          const _emailLead = lead.email || lead.dados?.email || '';
          if (_emailLead) {
            try {
              const { enviarEmail } = require('./services/email');
              await enviarEmail({
                para: _emailLead,
                assunto: '🏠 Encontramos imóveis para você!',
                html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
                  <h2 style="color:#FF385C">Olá, ${lead.nome||''}! 🏠</h2>
                  <p>Encontramos <strong>${_matches} imóvel(is)</strong> que combinam com o seu perfil.</p>
                  <a href="${_link}" style="display:inline-block;margin-top:16px;padding:14px 28px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px">Ver minha seleção personalizada →</a>
                  <p style="margin-top:24px;color:#888;font-size:12px">Escolha o imóvel que mais gostou e agende sua visita!</p>
                </div>`,
                texto: _msg
              });
              console.log('[VITRINE EMAIL] enviado para:', _emailLead);
            } catch(_eVit){ console.error('[VITRINE EMAIL] erro:', _eVit.message); }
          }
          _leads[i].vitrineEnviada = true;
          consumir(_leads[i].userId || _leads[i].corretorId, 'vitrine_whatsapp').catch(()=>{});
          _leads[i].vitrineEnviadaEm = new Date().toISOString();
          _leads[i].vitrineLink = _link;
          // Criar follow-up automático de 6h se não tiver visita
          if (!_leads[i].followUps) _leads[i].followUps = [];
          const _jaTemFUVitrine = _leads[i].followUps.some(f => f.tipo==='followup_vitrine' && f.status==='pendente');
          if (!_jaTemFUVitrine) {
            const _agora6h = Date.now();
            _leads[i].followUps.push({
              id: _agora6h.toString(),
              tipo: 'followup_vitrine',
              status: 'pendente',
              criadoEm: new Date(_agora6h).toISOString(),
              prazo: new Date(_agora6h + 6*3600*1000).toISOString()
            });
          }

        } else if (fu.tipo === 'followup_vitrine') {
          // Proteção — não envia se já tem visita agendada
          const _jaTemVisita = _leads[i].visitaSolicitada || (_leads[i].visitaStatus && !['cancelada','recusada'].includes(_leads[i].visitaStatus||''));
          if (_jaTemVisita) { console.log('[JOB FU] followup_vitrine ignorado — visita ja agendada:', lead.nome); continue; }
          _leads[i].waFollowupVitrineEnviadoEm = new Date().toISOString();
          const _link = BASE_URL + '/cliente/oferta/' + lead.id + '?userId=' + _userId;
          const _nomeCorretor = _user && _user.nome ? _user.nome : 'Seu corretor';
          const _qtdMatches = (_leads[i].matchesAuto || _leads[i].matches || []).length;
          const _msg = 'Oi ' + (lead.nome || '') + '! Vi que ainda nao agendou uma visita.\n\n'
            + 'Separamos ' + _qtdMatches + ' imovel(is) para voce. Entre no link, escolha o que mais gostou e solicite a visita:\n\n'
            + _link + '\n\n'
            + 'Caso ja esteja conversando com ' + _nomeCorretor + ', pode desconsiderar esta mensagem. '
            + 'Mas se quiser, pode entrar no link e agendar diretamente por la! 😊';
          await _enviarWA(_instancia, _contato, _msg);
          const _emailFU = lead.email || '';
          if (_emailFU) { try { const { enviarEmail: _eEFU } = require('./services/email'); await _eEFU({ para: _emailFU, assunto: '🏠 Seus imóveis estão esperando por você!', html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><pre style="font-family:Arial,sans-serif;white-space:pre-wrap">' + _msg + '</pre></div>', texto: _msg }); } catch(_eFU){} }

        } else if (fu.tipo === 'qualificar_lead') {
          // DESATIVADO — qualificação agora é imediata no webhook
          console.log('[JOB FU] qualificar_lead ignorado — já enviado pelo webhook:', lead.nome);

        } else if (fu.tipo === 'agendar_visita') {
          _leads[i].waAgendarVisitaEnviadoEm = new Date().toISOString();
          const _imovel = (_leads[i].matchesAuto || _leads[i].matches || [])[0];
          const _msg = 'Olá ' + (lead.nome || '') + '! Que tal agendarmos uma visita? 🏠\n\n'
            + (_imovel ? 'Temos ' + _imovel.tipo + ' em ' + _imovel.bairro + ' disponível.\n\n' : '')
            + 'Qual dia e horário ficaria melhor para você?';
          await _enviarWA(_instancia, _contato, _msg);
          const _emailFU = lead.email || '';
          if (_emailFU) { try { const { enviarEmail: _eEFU } = require('./services/email'); await _eEFU({ para: _emailFU, assunto: '📅 Que tal agendar uma visita?', html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><pre style="font-family:Arial,sans-serif;white-space:pre-wrap">' + _msg + '</pre></div>', texto: _msg }); } catch(_eFU){} }

        } else if (fu.tipo === 'followup_visita') {
          _leads[i].waFollowupVisitaEnviadoEm = new Date().toISOString();
          const _msg = 'Olá ' + (lead.nome || '') + '! Como foi a visita? Gostou do imóvel? 🏠\n\nPosso te ajudar com alguma dúvida ou mostrar outras opções?';
          await _enviarWA(_instancia, _contato, _msg);
          const _emailFU = lead.email || '';
          if (_emailFU) { try { const { enviarEmail: _eEFU } = require('./services/email'); await _eEFU({ para: _emailFU, assunto: '🏠 Como foi a visita?', html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><pre style="font-family:Arial,sans-serif;white-space:pre-wrap">' + _msg + '</pre></div>', texto: _msg }); } catch(_eFU){} }

        } else if (fu.tipo === 'proposta_negocio') {
          _leads[i].waPropostaEnviadoEm = new Date().toISOString();
          const _msg = 'Olá ' + (lead.nome || '') + '! Ótimo momento para darmos o próximo passo! 🎯\n\nVocê tem interesse em fazer uma proposta? Posso te ajudar com todo o processo.';
          await _enviarWA(_instancia, _contato, _msg);
        }

        console.log('[JOB FU] ✓ tipo:', fu.tipo, '| lead:', lead.nome || _contato);
      }

      if (_mudou) _salvou = true;
    }

    if (_salvou) {
      salvarTodosLeads(_leads).catch(e=>console.error("[leads]",e.message));
      console.log('[JOB FU] leads atualizados');
    }
  } catch(e) {
    console.error('[JOB FU] erro geral:', e.message);
  }
}, 5 * 60 * 1000); // roda a cada 5 minutos
// ── FIM JOB_FOLLOWUPS ────────────────────────────────────────────────────────

// ── JOB_JOBS_TRAVADOS — relança import de XML/leads e disparos WhatsApp que ──
// ficaram presos em "processando"/"enviando" (worker_thread morto no meio de um
// deploy — o Render manda SIGTERM na instância antiga, mas worker_threads não
// recebem esse sinal e são encerrados abruptamente junto do processo pai,
// deixando o job/campanha "travado" pra sempre sem essa checagem). Roda a cada
// 5 min (mesma cadência do JOB_FOLLOWUPS), só mexe em quem está sem atualização
// há 10+ min e ainda não foi relançado 2x (evita loop em job com causa real de
// erro, ex.: arquivo/URL que não existe mais).
setInterval(async () => {
  try {
    const { listarJobsTravados, atualizarJob } = require('./services/importJobs');
    const { dispararWorkerXml, dispararWorkerLeads } = require('./services/workerDispatch');
    const _jobsTravados = await listarJobsTravados(10, 2);
    for (const job of _jobsTravados) {
      console.log('[JOB TRAVADOS] relançando import job:', job.id, '| tipo:', job.tipo, '| relancamentos:', job.relancamentos || 0);
      await atualizarJob(job.id, { relancamentos: (job.relancamentos || 0) + 1 });
      if (job.tipo === 'xml') {
        dispararWorkerXml(job.id, job.arquivo, job.usuario_id);
      } else if (job.tipo === 'csv') {
        dispararWorkerLeads(job.id, job.arquivo, job.usuario_id);
      }
    }
  } catch(e) {
    console.error('[JOB TRAVADOS] erro import_jobs:', e.message);
  }

  try {
    const { listarCampanhasTravadas, atualizarCampanha } = require('./services/salvarDisparo');
    const { dispararWorkerDisparo } = require('./services/workerDispatch');
    const _campanhasTravadas = await listarCampanhasTravadas(10, 2);
    for (const campanha of _campanhasTravadas) {
      console.log('[JOB TRAVADOS] relançando disparo:', campanha.id, '| nome:', campanha.nome_campanha, '| relancamentos:', campanha.relancamentos || 0);
      await atualizarCampanha(campanha.id, { relancamentos: (campanha.relancamentos || 0) + 1 });
      dispararWorkerDisparo(campanha.id);
    }
  } catch(e) {
    console.error('[JOB TRAVADOS] erro disparos_campanhas:', e.message);
  }
}, 5 * 60 * 1000); // roda a cada 5 minutos
// ── FIM JOB_JOBS_TRAVADOS ─────────────────────────────────────────────────────

// INBOX WHATSAPP
app.get('/app/whatsapp', auth, async (req, res) => {
  const user = req.session.user;
  const { lerLeads: _llWA } = require('./services/salvarLead');
  const leadsFiltrados = await _llWA(user.id);
  res.render('app-whatsapp-inbox', { user, leads: leadsFiltrados, active: 'whatsapp', baseUrl: process.env.BASE_URL || 'http://localhost:3000' });
});


// ENVIAR MENSAGEM WHATSAPP pelo corretor
app.post('/app/lead/:id/whatsapp/enviar', auth, checarSaldo('Enviar vitrine WhatsApp', 30), async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ erro: 'texto obrigatorio' });

    const leads = (_cacheLeads || []);
    const idx = leads.findIndex(l => String(l.id) === String(req.params.id));
    if (idx < 0) return res.status(404).json({ erro: 'lead nao encontrado' });

    const lead = leads[idx];
    const telefone = (lead.contato || lead.telefone || '').replace(/\D/g, '');
    if (!telefone) return res.status(400).json({ erro: 'lead sem telefone' });

    // Enviar via Evolution API
    const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
    const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
    const INSTANCE = process.env.EVOLUTION_INSTANCE || 'match-corretor';

    const resp = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number: '55' + telefone, text: texto })
    });
    const data = await resp.json();

    if (!resp.ok) {
      console.error('[ENVIAR WA] erro:', data);
      return res.status(500).json({ erro: 'falha ao enviar', detalhe: data });
    }

    // Salvar mensagem enviada no lead
    if (!leads[idx].mensagens) leads[idx].mensagens = [];
    leads[idx].mensagens.push({
      id: Date.now().toString(),
      origem: 'whatsapp',
      de: 'corretor',
      telefone,
      texto,
      timestamp: new Date().toISOString(),
      lida: true
    });
    leads[idx].ultimaMensagem = texto;
    leads[idx].ultimaMensagemEm = new Date().toISOString();
    salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));
    consumir(req.session.user.id, 'vitrine_whatsapp').catch(()=>{}); // 30 créditos por envio manual de WhatsApp pro lead

    console.log('[ENVIAR WA] mensagem enviada para:', telefone);
    return res.json({ ok: true, telefone, texto });

  } catch(e) {
    console.error('[ENVIAR WA] erro:', e.message);
    return res.status(500).json({ erro: e.message });
  }
});

// ============================================================
// WEBHOOK WHATSAPP — Evolution API
// ============================================================
// NOVO WEBHOOK — usa match-core.js como ponto único
// Cache anti-duplicação de mensagens WhatsApp
const _msgCache = new Set();
setInterval(() => { if (_msgCache.size > 500) _msgCache.clear(); }, 60000);

async function _enviarFollowupSemImoveis() {
  try {
    const { query: _qFU } = require('./services/db');
    const usuariosSemImovel = await _qFU(
      "SELECT codigo_usuario, nome, email, telefone, celular, dados FROM usuarios WHERE NOT EXISTS (SELECT 1 FROM imoveis i WHERE i.user_id = usuarios.codigo_usuario)"
    );
    const agora = Date.now();
    const tresDias = 7 * 24 * 60 * 60 * 1000;
    for (const u of usuariosSemImovel.rows) {
      const dados = u.dados || {};
      const ultimoEnvio = dados.ultimoFollowupSemImovel ? new Date(dados.ultimoFollowupSemImovel).getTime() : 0;
      if (agora - ultimoEnvio < tresDias) continue;
      const tel = (u.celular || u.telefone || '').replace(/\D/g, '');
      const msgWA = 'Ola, ' + (u.nome||'') + '! ' + String.fromCodePoint(128640) + '\n\nCadastre seus imoveis e deixe a IA trabalhar por voce!\n\nFortaleca suas vendas com os parceiros da rede — o MatchImoveis e a unica plataforma inteligente do mercado imobiliario que une tudo que ha de melhor e mais avancado em tecnologia.\n\nAcesse o sistema e cadastre seu XML agora, ou cadastre manualmente.\n\nwww.matchimoveis.ia.br';
      if (tel) {
        try {
          await fetch('https://match-evolution-api.onrender.com/message/sendText/match-suporte', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': 'match2025evolution' },
            body: JSON.stringify({ number: '55' + tel, text: msgWA })
          });
        } catch(e) { console.error('[followup-sem-imovel] erro WA:', e.message); }
      }
      if (u.email) {
        try {
          const { enviarEmail } = require('./services/email');
          await enviarEmail({
            para: u.email,
            assunto: 'Cadastre seus imoveis e deixe a IA trabalhar por voce — MatchImoveis',
            html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><h2 style="color:#FF385C">Ola, ' + (u.nome||'') + '!</h2><p>Cadastre seus imoveis e deixe a IA trabalhar por voce.</p><p>Fortaleca suas vendas com os parceiros da rede — o MatchImoveis e a unica plataforma inteligente do mercado imobiliario que une tudo que ha de melhor e mais avancado em tecnologia.</p><p>Acesse o sistema e cadastre seu XML agora, ou cadastre manualmente.</p><a href="https://www.matchimoveis.ia.br" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Acessar o sistema →</a></div>',
            texto: msgWA
          });
        } catch(e) { console.error('[followup-sem-imovel] erro email:', e.message); }
      }
      try {
        await _qFU("UPDATE usuarios SET dados = jsonb_set(COALESCE(dados,'{}'), '{ultimoFollowupSemImovel}', $1::jsonb) WHERE codigo_usuario=$2", [JSON.stringify(new Date().toISOString()), u.codigo_usuario]);
      } catch(e) {}
      console.log('[followup-sem-imovel] enviado para:', u.codigo_usuario);
    }
  } catch(e) { console.error('[followup-sem-imovel] erro geral:', e.message); }
}
setTimeout(() => { _enviarFollowupSemImoveis(); setInterval(_enviarFollowupSemImoveis, 6 * 60 * 60 * 1000); }, 30000);

app.post(['/webhook/whatsapp', '/webhook/whatsapp/*'], async (req, res) => {
  try {
    const body = req.body;
    const event = body.event;
    const instance = body.instance;
    const data = body.data;
    // JSON.stringify do body inteiro só roda depois de passar pelos filtros de
    // grupo/duplicata/fromMe, mais abaixo — um grupo movimentado gera dezenas de
    // messages.upsert por segundo (inclusive duplicados), e serializar o payload
    // inteiro de cada um antes de descartar foi o que causou o OOM de novo
    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
      console.log('[WEBHOOK WA] evento ignorado (sem log completo):', event, '| instancia:', instance);
    }

    
      // Captura QR code enviado via webhook (Evolution v2.2.3)
      const _qrB64 = body.data?.qrcode?.base64 || body.data?.base64 || body.qrcode?.base64;
      if (_qrB64) {
        _qrCache[body.instance] = { base64: _qrB64, ts: Date.now() };
        console.log('[QR_CACHE] QR salvo para instância:', body.instance, '| evento:', body.event);
      }
      // Log completo quando vier qualquer dado de qrcode
      if (body.event === 'qrcode.updated' || body.event === 'QRCODE_UPDATED' || body.data?.qrcode) {
        console.log('[QR_DEBUG] evento qrcode:', JSON.stringify(body.data).substring(0, 300));
      }

    // Trata CONNECTION_UPDATE — atualiza status no banco
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const _connState = data?.state || data?.connection || '';
      const _connStatus = (_connState === 'open') ? 'open' : 'close';
      console.log('[WEBHOOK WA] CONNECTION_UPDATE | instancia:', instance, '| state:', _connState, '| status:', _connStatus);
      try {
        const { query: _qConn } = require('./services/db');
        await _qConn("UPDATE usuarios SET whatsapp_status=$1 WHERE whatsapp_instance=$2", [_connStatus, instance]);
        const _uIdx = (_cacheUsuarios||[]).findIndex(u=>u.whatsappInstance===instance||u.whatsapp_instance===instance);
        if (_uIdx>=0) { _cacheUsuarios[_uIdx].whatsappStatus = _connStatus; _cacheUsuarios[_uIdx].whatsapp_status = _connStatus; }
        console.log('[WEBHOOK WA] status atualizado:', instance, '->', _connStatus);
      } catch(e) { console.error('[WEBHOOK WA] erro CONNECTION_UPDATE:', e.message); }
      return res.status(200).json({ ok: true, connection: _connStatus });
    }

    // Só processa mensagens recebidas
    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
      return res.status(200).json({ ok: true, ignorado: event });
    }

    const msg = data?.message;
    if (!msg) return res.status(200).json({ ok: true, sem_mensagem: true });

    const fromJid = data.key?.remoteJid || '';
    const fromMe = data.key?.fromMe || false;
    const telefone = fromJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const texto = msg.conversation || msg.extendedTextMessage?.text || msg.buttonsResponseMessage?.selectedDisplayText || '';
    const pushName = data.pushName || '';
    const msgId = data.key?.id || '';
    if (msgId && _msgCache.has(msgId)) {
      return res.status(200).json({ ok: true, ignorado: 'duplicado' });
    }
    if (msgId) _msgCache.add(msgId);
    const timestamp = data.messageTimestamp ? new Date(data.messageTimestamp * 1000).toISOString() : new Date().toISOString();

    // Ignorar mensagens de grupos e broadcast
    if (fromJid.includes('@g.us') || fromJid.includes('@broadcast') || fromJid.includes('@newsletter')) {
      return res.status(200).json({ ok: true, ignorado: 'grupo' });
    }
    if (fromMe) return res.status(200).json({ ok: true, ignorado: 'fromMe' });
    if (!telefone || !texto) return res.status(200).json({ ok: true, ignorado: 'sem_telefone_ou_texto' });

    // Só chega aqui — e só agora serializa o body inteiro — mensagem individual,
    // não-duplicada, que vai ser processada de verdade
    console.log('[WEBHOOK WA] body completo:', JSON.stringify(body).substring(0, 500));

    // Pré-aquece Evolution API em background -- só quando a mensagem vai ser
    // processada de verdade (não em todo evento recebido: contacts.update,
    // chats.update, duplicata, mensagem de grupo etc). Um grupo movimentado
    // gera dezenas de eventos por segundo; disparar isso pra cada um deles
    // empilhava requests em memória e contribuiu pro heap out of memory.
    const _EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
    const _EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
    fetch(`${_EVOLUTION_URL}/instance/fetchInstances`, {
      headers: { 'apikey': _EVOLUTION_KEY }
    }).catch(() => {});

    // ── VERIFICAR BLOQUEADOS ─────────────────────────────────
    try {
      const _usersBlk = (_cacheUsuarios || []);
      const _bloqueado = _usersBlk.some(u => (u.bloqueados || u.dados?.bloqueados || []).includes(telefone));
      if (_bloqueado) {
        console.log('[WEBHOOK WA] numero bloqueado:', telefone);
        return res.status(200).json({ ok: true, ignorado: 'bloqueado' });
      }
    } catch(e) {}

    // ── DETECTAR SE É CORRETOR OU LEAD ───────────────────────
    let _usersWH = [];
    try { const { lerUsuarios: _luWH } = require('./services/salvarUsuario'); _usersWH = await _luWH(); } catch(e) {}
    const _corretorWH = _usersWH.find(u => {
      // Prioriza telefone real antes do id
      const fontesPrioritarias = [u.telefone, u.phone, u.contato].filter(Boolean);
      if (fontesPrioritarias.some(f => String(f).replace(/\D/g,'').slice(-8) === telefone.slice(-8))) return true;
      // Só verifica id se nao achou pelo telefone
      const foneId = String(u.id || '').replace(/\D/g,'');
      return foneId.length <= 11 && foneId.slice(-8) === telefone.slice(-8);
    });

    if (_corretorWH) {
      console.log('[WEBHOOK WA] CORRETOR detectado:', _corretorWH.nome || _corretorWH.id);
      res.status(200).json({ ok: true, modo: 'corretor', usuario: _corretorWH.id });
      setImmediate(async () => {
        try {
          const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
          const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
          const EI = await (async () => { try { const { lerUsuarios: _lu } = require('./services/salvarUsuario'); const _u2 = await _lu(); const _uc = _u2.find(u=>u.id===(_corretorWH?.id)); return _uc?.whatsappInstance||instance||'match-corretor'; } catch(e){return instance||'match-corretor';} })();
          let leads = [];
          try { const { lerLeads: _llWH } = require('./services/salvarLead'); leads = await _llWH(); } catch(e) {}
          const uid = _corretorWH.id;
          const meus = leads.filter(l => l.userId === uid || l.codigoUsuario === uid);
          const total = meus.length;
          const comMatch = meus.filter(l => (l.matches||[]).length > 0).length;
          const quentes = meus.filter(l => l.temperatura === 'quente');
          const mornos = meus.filter(l => l.temperatura === 'morno');
          const txt = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
          let resp = '';
          if (txt.match(/oi|ola|bom dia|boa tarde|boa noite|hello/)) {
            resp = 'Ola ' + (_corretorWH.nome||'corretor') + '! Sou sua assistente MatchImoveis.\n\nResumo:\n- ' + total + ' leads\n- ' + comMatch + ' com match\n- ' + quentes.length + ' quentes\n- ' + mornos.length + ' mornos\n\nComandos: "leads quentes", "sem match", "resumo"';
          } else if (txt.match(/quente|urgente/)) {
            resp = quentes.length ? 'Leads quentes (' + quentes.length + '):\n\n' + quentes.slice(0,5).map(l => '- ' + (l.nome||l.telefone) + ' | Score ' + (l.score||0) + '%').join('\n') : 'Nenhum lead quente no momento.';
          } else if (txt.match(/sem match|pendente/)) {
            const sl = meus.filter(l => !(l.matches||[]).length).slice(0,5);
            resp = sl.length + ' leads sem match:\n' + sl.map(l => '- ' + (l.nome||l.telefone)).join('\n');
          } else if (txt.match(/resumo|dia|hoje/)) {
            resp = 'Resumo do dia:\n- Total: ' + total + '\n- Com match: ' + comMatch + '\n- Quentes: ' + quentes.length + '\n- Mornos: ' + mornos.length + '\n- Frios: ' + (total - quentes.length - mornos.length);
          } else {
            resp = 'Posso te ajudar com:\n- "leads quentes"\n- "sem match"\n- "resumo do dia"\n- Acesse: matchimoveis.onrender.com';
          }
          // RESPOSTA AUTOMÁTICA DESATIVADA — corretor responde manualmente
          console.log('[WEBHOOK WA] resposta corretor enviada');
        } catch(e) { console.error('[WEBHOOK WA] erro corretor:', e.message); }
      });
      return;
    }

    console.log('[WEBHOOK WA] de:', telefone, '| texto:', texto);

    // ── IDENTIFICAR USERID PELO INSTANCE ─────────────────────
    let _webhookUserId = '';
    try {
      const { lerUsuarios: _luWH2 } = require('./services/salvarUsuario');
      const _users = await _luWH2();
      const _userByInstance = _users.find(u => u.whatsappInstance === instance);
      if (_userByInstance) {
        _webhookUserId = _userByInstance.id;
      } else {
        const _userByPhone = _users.find(u => {
          const t = String(u.whatsappNumero || u.telefone || '').replace(/\D/g,'');
          return t && t.slice(-8) === telefone.slice(-8);
        });
        if (_userByPhone) _webhookUserId = _userByPhone.id;
      }
      if (_webhookUserId) {
      console.log('[WEBHOOK WA] userId identificado:', _webhookUserId);
      // Se lead existia e estava deletada por este userId — restaura
      try {
        const _leadsRestore = await lerLeads();
        const _tel = telefone;
        const _idxRestore = _leadsRestore.findIndex(l => {
          const t = String(l.telefone||l.whatsapp||l.contato||'').replace(/\D/g,'');
          return t.slice(-8) === _tel.slice(-8) && (l.deletadoPor||[]).includes(_webhookUserId);
        });
        if (_idxRestore >= 0) {
          _leadsRestore[_idxRestore].deletadoPor = (_leadsRestore[_idxRestore].deletadoPor||[]).filter(u => u !== _webhookUserId);
          await salvarTodosLeads(_leadsRestore);
          console.log('[WEBHOOK WA] lead restaurada para:', _webhookUserId);
        }
      } catch(e) {}
    }
      else console.warn('[WEBHOOK WA] userId NAO identificado | instance:', instance, '| telefone:', telefone);
    } catch(e) { console.error('[WEBHOOK WA] erro userId:', e.message); }
    // Se não identificou userId — tenta pelo número da instância diretamente
    if (!_webhookUserId) {
      try {
        const { lerUsuarios: _luWH3 } = require('./services/salvarUsuario');
        const _users3 = await _luWH3();
        // Tenta match parcial no nome da instância
        const _userByInst2 = _users3.find(u => {
          const inst = (u.whatsappInstance||'').toLowerCase();
          const inc = (instance||'').toLowerCase();
          return inst && inc && (inst.includes(inc) || inc.includes(inst));
        });
        if (_userByInst2) {
          _webhookUserId = _userByInst2.id;
          console.log('[WEBHOOK WA] userId por match parcial instancia:', _webhookUserId);
        }
      } catch(e) {}
    }

    // ── ENCONTRAR LEAD PELO TELEFONE ──────────────────────────
    const { lerLeads: _lerLeadsWH, salvarTodosLeads: _salvarLeadsWH } = require('./services/salvarLead');
    let leadEncontrado = null;
    let leadsPathAtual = 'service';
    try {
      const todosLeads = await _lerLeadsWH();
      // Busca lead pelo telefone E userId da instância — evita vazamento entre contas
      console.log('[WEBHOOK WA DEBUG] total leads:', todosLeads.length, '| buscando telefone:', telefone.slice(-8), '| userId:', _webhookUserId);
      leadEncontrado = todosLeads.find(l => {
        const fone = (l.telefone || l.whatsapp || l.contato || l.phone || '').replace(/\D/g, '');
        const leadUserId = String(l.userId || l.codigoUsuario || l.corretorId || '');
        const fonesIgual = fone && fone.slice(-8) === telefone.slice(-8);
        const contaIgual = !_webhookUserId || !leadUserId || leadUserId === _webhookUserId;
        if (fonesIgual) console.log('[WEBHOOK WA DEBUG] fone match:', fone, '| contaIgual:', contaIgual, '| leadUserId:', leadUserId);
        if (!fonesIgual || !contaIgual) return false;
        // Se ja tem perfil minimo, nao usar esta lead — vai criar nova
        const pf = l.perfilIA || {}; const d = l.dados || {}; const m = l.mapaIntencao || {};
        const temPerfilMinimo = !!(pf.tipo||d.tipo) &&
          !!(pf.intencao||d.intencao) &&
          !!(pf.cidade||d.cidade) &&
          !!(pf.bairro||d.bairro) &&
          !!(pf.valorMax||d.valorMax);
        if (temPerfilMinimo) { console.log('[WEBHOOK WA] lead com perfil minimo — vai criar nova para:', telefone); return false; }
        // Se lead tem visita cancelada — vai criar nova
        const _visitaCancelada = l.visitaStatus && ['cancelada','recusada','cancelado'].includes((l.visitaStatus||'').toLowerCase());
        if (_visitaCancelada) { console.log('[WEBHOOK WA] lead com visita cancelada — vai criar nova para:', telefone); return false; }
        return true;
      }) || null;
    } catch(e) { console.error('[WEBHOOK WA] erro ao buscar lead:', e.message); }

    // ── RESPONDE IMEDIATAMENTE ────────────────────────────────
    res.status(200).json({
      ok: true,
      telefone,
      texto,
      leadEncontrado: !!leadEncontrado,
      lead: leadEncontrado?.nome || null
    });

    if (!leadEncontrado) {
      // ── ANÚNCIO CLIQUE-PARA-WHATSAPP (Meta Ads) — a 1ª mensagem de uma
      // conversa iniciada por um anúncio desse tipo carrega o ID do anúncio
      // em contextInfo.externalAdReplyInfo (Baileys/Evolution). Se bater com
      // uma campanha nossa, pula o filtro de palavra-chave (pode vir com
      // mensagem pré-preenchida genérica) e atribui a lead à campanha.
      // NOTA: não testado contra um clique real ainda — validar o campo
      // exato assim que a 1ª campanha desse tipo rodar de verdade.
      let _campanhaMetaWA = null;
      try {
        const _adRef = msg?.extendedTextMessage?.contextInfo?.externalAdReplyInfo
          || msg?.contextInfo?.externalAdReplyInfo
          || data?.contextInfo?.externalAdReplyInfo || null;
        const _adSourceId = _adRef?.sourceId || _adRef?.source_id;
        if (_adSourceId) {
          const { buscarCampanhaPorAdId } = require('./services/salvarCampanhaMeta');
          _campanhaMetaWA = await buscarCampanhaPorAdId(_adSourceId);
        }
      } catch(e) { console.error('[WEBHOOK WA] erro detectar anuncio meta:', e.message); }

      // ── FILTRO_CAPTURA_LEADS — só captura se mensagem tem palavras imobiliárias
      const _palavrasImoveis = [
        // Tipos de imóvel
        'imovel','imóvel','apartamento','apto','ap ','casa','sobrado','cobertura','kitnet',
        'kit','studio','flat','loft','terreno','lote','chacara','chácara','sitio','sítio',
        'fazenda','sala comercial','sala','loja','galpao','galpão','escritorio','escritório',
        'predio','prédio','edificio','edifício','condominio','condomínio','residencial',
        // Cômodos
        'quarto','quartos','qto','qtos','suite','suíte','suites','suítes','dormitorio',
        'dormitório','banheiro','banheiros','lavabo','dependencia','dependência',
        'varanda','sacada','quintal','jardim','piscina','area de lazer',
        // Transação
        'alugar','aluguel','aluga','comprar','compra','venda','vender','financiar',
        'financiamento','parcelar','entrada','sinal','permuta','troca',
        // Busca/interesse
        'procurando','procuro','busco','buscar','quero','preciso','interesse','interessado',
        'interessada','gostaria','queria','tem algo','tem algum','tem imovel','tem imóvel',
        'voce tem','você tem','vc tem','disponivel','disponível','tem disponivel',
        // Localização
        'bairro','regiao','região','zona','centro','metro','metrô','avenida','rua','cep',
        // Características
        'metragem','metro quadrado','m2','m²','area','área','vaga','vagas','garagem',
        'garagens','andar','pavimento','elevador','mobiliado','semi mobiliado','reformado',
        // Valores
        'valor','preco','preço','quanto','orcamento','orçamento','budget','investimento',
        'custo','mensalidade','taxa','iptu',
        // Ação/visita
        'visita','visitar','agendar','ver o imovel','ver o imóvel','conhecer','quero ver',
        'posso ver','quando posso','horario','horário',
        // Anúncio
        'anuncio','anúncio','oferta','oportunidade','lancamento','lançamento','entrega',
        'novo','planta','projeto','construcao','construção',
        // Gírias/abreviações comuns
        'aptto','appto','knet','kitinete','tstudio','qd','qds','wc'
      ];
      const _textoNorm = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const _temPalavraImovel = _palavrasImoveis.some(p => _textoNorm.includes(p));
      if (!_temPalavraImovel && !_campanhaMetaWA) {
        console.log('[WEBHOOK WA] filtro: mensagem sem palavras imobiliárias — ignorando:', telefone, '|', texto.substring(0,50));
        return;
      }
      // Não criar lead pelo WhatsApp se mensagem veio de portal
      if (!_campanhaMetaWA && (texto.includes('imovelweb.com.br') || texto.includes('Quero ser contatado sobre este imóvel') || texto.includes('vivareal.com') || texto.includes('zapimoveis.com'))) {
        console.log('[WEBHOOK WA] mensagem de portal detectada — ignorando criação de lead pelo WA:', telefone);
        return;
      }
      console.log('[WEBHOOK WA] lead nao encontrado — criando novo lead automatico (oculta ate ter match):', telefone, _campanhaMetaWA ? '| via campanha Meta Ads #'+_campanhaMetaWA.id : '');
      // Cria lead novo automaticamente a partir do WhatsApp — fica oculta ate gerar match
      const novoLead = {
        id: Date.now().toString(),
        nome: pushName || telefone,
        telefone,
        whatsapp: telefone,
        origem: _campanhaMetaWA ? 'Meta Ads' : 'whatsapp',
        origemEntrada: _campanhaMetaWA ? 'meta_ads_whatsapp' : undefined,
        imovel_interesse: _campanhaMetaWA ? _campanhaMetaWA.imovelId : undefined,
        imovelId: _campanhaMetaWA ? _campanhaMetaWA.imovelId : undefined,
        status: 'novo',
        userId: _webhookUserId || '',
        codigoUsuario: _webhookUserId || '',
        userId: _webhookUserId || '',
        criadoEm: new Date().toISOString(),
        mensagens: [],
        perfilIA: {},
        score: 0,
        temperatura: 'frio',
        timeline: [],
        eventos: [],
        followUps: [],
        leadOculta: true
      };
      // Salva no PostgreSQL
      try {
        const { salvarLead: _salvarLeadPG } = require('./services/salvarLead');
        await _salvarLeadPG(novoLead);
        leadEncontrado = novoLead;
        console.log('[WEBHOOK WA] novo lead criado no PG:', telefone, '| id:', novoLead.id);
        // Lead fica oculta (leadOculta:true) até gerar o 1º match — notificação
        // de "novo lead" só é criada quando a lead é revelada (cerebro/match-core.js)
        if (_campanhaMetaWA) {
          const { incrementarLeadsRecebidos } = require('./services/salvarCampanhaMeta');
          incrementarLeadsRecebidos(_campanhaMetaWA.id).catch(()=>{});
          consumir(_campanhaMetaWA.userId, 'lead_meta_recebido').catch(e=>console.error('[creditos] lead_meta_recebido (whatsapp) falhou:', e.message));
        }
      } catch(e) {
        console.error('[WEBHOOK WA] erro ao criar lead no PG:', e.message);
        return;
      }
    }

    // ── QUALIFICAÇÃO IMEDIATA — envia msg assim que lead chega sem perfil ──────
    try {
      const _pf = novoLead && novoLead.perfilIA ? novoLead.perfilIA : {};
      const _temPerfilMinimo = !!(_pf.intencao) && !!(_pf.tipo) && !!(_pf.bairro || _pf.cidade) && !!(_pf.valorMax);
      if (!_temPerfilMinimo && _webhookUserId && telefone) {
        const _userCorretor = (_cacheUsuarios||[]).find(function(u){ return u.id === _webhookUserId; });
        const _nomeCorretor = (_userCorretor && _userCorretor.nome) ? _userCorretor.nome : 'MatchImoveis';
        const _instanciaCorretor = (_userCorretor && _userCorretor.whatsappInstance) ? _userCorretor.whatsappInstance : instance;
        const _txtNorm = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
        const _ehComercial = /sala|loja|galpao|comercial|predio|escritorio/.test(_txtNorm);
        const _ehTerreno = /terreno|lote|chacara|sitio|fazenda/.test(_txtNorm);
        const _ehResidencial = /apartamento|apto|casa|sobrado|cobertura|kitnet|studio|flat|loft/.test(_txtNorm);
        const _nomeLead = (novoLead.nome && novoLead.nome !== telefone) ? novoLead.nome.split(' ')[0] : '';
        const _ola = 'Ola' + (_nomeLead ? ' ' + _nomeLead : '') + '! \nSou assistente de *' + _nomeCorretor + '* - MatchImoveis.\n\n';
        let _msgQ = '';
        if (_ehComercial) {
          _msgQ = _ola + 'Para encontrar o imovel comercial ideal, me conta:\n\n' +
            '1 - Transacao: compra ou aluguel?\n' +
            '2 - Tipo: sala, loja, galpao ou escritorio?\n' +
            '3 - Tamanho: quantos m2?\n' +
            '4 - Localizacao: qual bairro ou regiao?\n' +
            '5 - Orcamento: qual valor maximo?\n\n' +
            'Exemplo: Quero alugar sala comercial no Itaim, 80m2, ate R$ 5.000/mes';
        } else if (_ehTerreno) {
          _msgQ = _ola + 'Para encontrar o terreno ideal, me conta:\n\n' +
            '1 - Transacao: compra ou locacao?\n' +
            '2 - Tipo: terreno, lote ou chacara?\n' +
            '3 - Tamanho: quantos m2?\n' +
            '4 - Localizacao: qual bairro ou regiao?\n' +
            '5 - Orcamento: qual valor maximo?\n\n' +
            'Exemplo: Quero comprar terreno em Alphaville, 500m2, ate R$ 400.000';
        } else if (_ehResidencial) {
          _msgQ = _ola + 'Para encontrar o imovel ideal, me conta:\n\n' +
            '1 - Transacao: compra ou aluguel?\n' +
            '2 - Quantos quartos?\n' +
            '3 - Localizacao: qual bairro ou regiao?\n' +
            '4 - Orcamento: qual valor maximo?\n\n' +
            'Exemplo: Quero comprar apartamento em Moema, 2 quartos, ate R$ 780.000';
        } else {
          _msgQ = _ola + 'Para encontrar o imovel ideal para voce, me conta:\n\n' +
            '1 - Transacao: compra ou aluguel?\n' +
            '2 - Tipo: apartamento, casa, terreno ou comercial?\n' +
            '3 - Localizacao: qual bairro ou regiao?\n' +
            '4 - Tamanho:\n' +
            '   Residencial: quantos quartos?\n' +
            '   Comercial ou Terreno: quantos m2?\n' +
            '5 - Orcamento: qual valor maximo?\n\n' +
            'Exemplos:\n' +
            'Quero comprar apartamento em Moema, 2 quartos, ate R$ 780.000\n' +
            'Quero alugar sala comercial no Itaim, 80m2, ate R$ 5.000/mes\n' +
            'Quero comprar terreno em Alphaville, 500m2, ate R$ 400.000';
        }
        const _EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
        const _EK = process.env.EVOLUTION_KEY || 'match2025evolution';
        await fetch(_EU + '/message/sendText/' + _instanciaCorretor, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': _EK },
          body: JSON.stringify({ number: '55' + telefone, text: _msgQ })
        });
        consumir(_webhookUserId, 'ia_qualifica_lead').catch(function(e){console.error('[creditos] ia_qualifica_lead falhou:', e.message);});
        console.log('[QUALIF IMEDIATA] msg enviada:', telefone, _ehComercial ? 'comercial' : _ehTerreno ? 'terreno' : _ehResidencial ? 'residencial' : 'generico');
      }
    } catch(e) { console.error('[QUALIF IMEDIATA] erro:', e.message); }

    // ── MATCH-CORE: 10 CAMADAS EM BACKGROUND ─────────────────
    setImmediate(async () => {
      try {
        const matchCore = require('./cerebro/match-core');
        const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
        const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
        const INSTANCE = process.env.EVOLUTION_INSTANCE || 'match-corretor';

        // Recarrega lead do PG para garantir mensagens anteriores
        try {
          const { lerLeads: _llReload } = require('./services/salvarLead');
          const _todasReload = await _llReload();
          const _leadReload = _todasReload.find(l => String(l.id) === String(leadEncontrado.id));
          if (_leadReload) leadEncontrado = { ..._leadReload, ...{ userId: leadEncontrado.userId || _leadReload.userId } };
        } catch(e) { console.error('[WEBHOOK WA] erro reload lead:', e.message); }
        // Passa lead pelo match-core (10 camadas)
        const _resultado = await matchCore.processar({
          lead: leadEncontrado,
          mensagem: texto,
          canal: 'whatsapp',
          userId: leadEncontrado.codigoUsuario || leadEncontrado.userId || '',
          leadsPath: leadsPathAtual,
          instancia: INSTANCE
        });
        const leadAtualizado = _resultado?.lead || leadEncontrado;
        // Só cobra ia_responde_whatsapp a partir do momento em que a lead já tem match
        // gerado — antes disso (qualificação inicial) não cobra
        const _jaTemMatchWA = ((leadAtualizado.matchesAuto||[]).length || (leadAtualizado.matches||[]).length || (leadAtualizado.matchesBase||[]).length) > 0;
        if (_jaTemMatchWA) consumir(leadAtualizado.userId || leadAtualizado.codigoUsuario, 'ia_responde_whatsapp').catch(e=>console.error('[creditos] ia_responde_whatsapp falhou:', e.message));

        console.log('[WEBHOOK WA] match-core concluido | score:', leadAtualizado.score, '| temperatura:', leadAtualizado.temperatura, '| matches:', (leadAtualizado.matchesAuto || []).length);
        // notificação sino — match gerado
        const _qtdMatches = (leadAtualizado.matchesAuto || leadAtualizado.matches || []).length;
        if(_qtdMatches > 0){
          try {
            criarNotificacaoService({
              id: (Date.now()+2).toString(),
              tipo: 'match_gerado',
              titulo: 'Match encontrado',
              mensagem: _qtdMatches + ' imóvel(is) compatível(is) com ' + (leadAtualizado.nome||'lead'),
              usuarioId: _webhookUserId,
              leadId: leadAtualizado.id,
              lida: false,
              criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
            });
          } catch(e) { console.error('[notif match]', e.message); }
          // notificação sino — lead ficou quente (só depois de revelada, com match)
          if (leadEncontrado.temperatura !== 'quente' && leadAtualizado.temperatura === 'quente' && leadAtualizado.leadOculta !== true) {
            try {
              criarNotificacaoService({
                id: (Date.now()+3).toString(),
                tipo: 'lead_quente',
                titulo: 'Lead ficou quente',
                mensagem: (leadAtualizado.nome||'Lead') + ' está com alto interesse — vale a pena priorizar',
                usuarioId: _webhookUserId,
                leadId: leadAtualizado.id,
                lida: false,
                criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
              });
            } catch(e) { console.error('[notif quente]', e.message); }
          }
        }
        // Salva perfil, score e temperatura no lead via PostgreSQL
        try {
          const { atualizarLead: _atualizarLeadWH } = require('./services/salvarLead');
          await _atualizarLeadWH(leadAtualizado.id, {
            nome: leadAtualizado.nome || pushName || telefone,
            score: leadAtualizado.score || 0,
            temperatura: leadAtualizado.temperatura || 'frio',
            faseFunil: leadAtualizado.faseFunil || 'novo',
            perfilIA: leadAtualizado.perfilIA || {},
            mapaIntencao: leadAtualizado.mapaIntencao || null,
            tipo: leadAtualizado.tipo || leadAtualizado.perfilIA?.tipo || '',
            quartos: leadAtualizado.quartos || leadAtualizado.perfilIA?.quartos || 0,
            bairro: leadAtualizado.bairro || leadAtualizado.perfilIA?.bairro || '',
            valorMax: leadAtualizado.valorMax || leadAtualizado.perfilIA?.valorMax || 0,
            mensagens: leadAtualizado.mensagens || [],
            matchesAuto: leadAtualizado.matchesAuto || [],
            matchCount: (leadAtualizado.matchesAuto || []).length,
          });
          console.log('[WEBHOOK WA] perfil salvo no PG:', leadAtualizado.nome, '| score:', leadAtualizado.score, '| temp:', leadAtualizado.temperatura);
        } catch(e) { console.error('[WEBHOOK WA] erro salvar perfil PG:', e.message); }
        // match_encontrado já é cobrado dentro de cerebro/match-core.js (só quando o
        // número de matches realmente aumenta) -- cobrar de novo aqui duplicava o débito


      } catch(e) {
        console.error('[WEBHOOK WA] erro background match-core:', e.message);
      }
    });

  } catch (err) {
    console.error('[WEBHOOK WA] erro geral:', err.message);
    res.status(200).json({ ok: false, erro: err.message });
  }
});


// Geocodifica bairros em background e salva cache
app.get('/api/geocodificar-bairros', auth, async (req, res) => {
  const path2 = require('path');
  const fs2 = require('fs');
  const DATA_DIR2 = process.env.RENDER ? '/opt/render/project/src/data' : __dirname;
  const cacheFile = path2.join(DATA_DIR2, 'bairros-coords.json');
  const imoveis = (_cacheImoveis || []);
  const cache = fs2.existsSync(cacheFile) ? JSON.parse(fs2.readFileSync(cacheFile,'utf8')) : {};
  
  // Pega bairros únicos
  const bairros = [...new Set(imoveis.filter(i=>i.bairro&&i.cidade).map(i=>i.bairro+'|'+i.cidade))];
  res.json({ ok: true, total: bairros.length, cached: Object.keys(cache).length });
  
  // Geocodifica em background
  setImmediate(async () => {
    for (const key of bairros) {
      if (cache[key]) continue;
      const [bairro, cidade] = key.split('|');
      await new Promise(r => setTimeout(r, 1200));
      try {
        // Pega o endereço do primeiro imóvel desse bairro
        const imBairro = imoveis.find(i => i.bairro === bairro && i.cidade === cidade);
        const rua = imBairro?.endereco || '';
        const queryParts = [rua, bairro, cidade, 'Brasil'].filter(Boolean).join(', ');
        const q = encodeURIComponent(queryParts);
        const r = await fetch('https://nominatim.openstreetmap.org/search?q='+q+'&format=json&limit=1',{headers:{'Accept-Language':'pt-BR','User-Agent':'MatchImoveis/1.0'}});
        const d = await r.json();
        if (d&&d[0]) { cache[key]={lat:parseFloat(d[0].lat),lng:parseFloat(d[0].lon)}; fs2.writeFileSync(cacheFile,JSON.stringify(cache)); }
      } catch(e) {}
    }
    console.log('[GEO] cache completo:', Object.keys(cache).length, 'bairros');
  });
});

// Retorna cache de coords dos bairros
app.get('/api/bairros-coords', auth, (req, res) => {
  const path2 = require('path');
  const fs2 = require('fs');
  const DATA_DIR2 = process.env.RENDER ? '/opt/render/project/src/data' : __dirname;
  const cacheFile = path2.join(DATA_DIR2, 'bairros-coords.json');
  const cache = fs2.existsSync(cacheFile) ? JSON.parse(fs2.readFileSync(cacheFile,'utf8')) : {};
  res.json(cache);
});

// Garante schema do banco atualizado no boot
try {
  const _setupDB = require('./setupDB');
  if (typeof _setupDB === 'function') _setupDB().catch(e => console.error('[setupDB]', e.message));
} catch(e) { console.error('[setupDB]', e.message); }


// ── WA MONITOR — reconexão automática ───────────────────────────────────────
const waMonitor = require('./cerebro/wa-monitor');

// Verificar a cada 5 minutos
setInterval(function() {
  waMonitor.monitorar();
}, 5 * 60 * 1000);

// Primeira verificação após 2 minutos do boot
setTimeout(function() {
  waMonitor.monitorar();
}, 2 * 60 * 1000);

console.log('[WA-MONITOR] monitoramento iniciado — verificação a cada 5min');


// Service Worker
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(`
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.registration.unregister()); });
`);
});

const _httpServer = app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  // Roda cerebro-scanner.js e cerebro.js em background, sem bloquear o boot
  setTimeout(() => {
    try {
      const { spawn: _spawnCerebro } = require('child_process');
      const _pScanner = _spawnCerebro('node', ['cerebro-scanner.js'], { stdio: 'inherit', env: { ...process.env } });
      _pScanner.on('close', () => {
        const _pCerebro = _spawnCerebro('node', ['cerebro.js'], { stdio: 'inherit', env: { ...process.env } });
        _pCerebro.on('error', (e) => console.error('[cerebro.js background]', e.message));
      });
      _pScanner.on('error', (e) => console.error('[cerebro-scanner.js background]', e.message));
    } catch(e) { console.error('[cerebro background]', e.message); }
  }, 20000);
  // Inicia atualizacao automatica do XML a cada 12h
  try {
    const { iniciarScheduler } = require('./services/xmlScheduler'); iniciarScheduler();
    const { iniciarJobCreditos } = require('./services/jobCreditos'); iniciarJobCreditos();
    const { iniciarTopupPlanoLeads } = require('./services/topupPlanoLeads'); iniciarTopupPlanoLeads();
    // DESATIVADO (jul/2026): fazerBackup() faz "SELECT *" de leads/visitas/usuarios/
    // imoveis/notificacoes inteiros a cada 1 minuto e monta tudo num JSON.stringify só
    // — com a base atual isso estoura o heap do processo (FATAL ERROR: JavaScript heap
    // out of memory, visto nos logs do Render). listarBackups()/restaurarBackup() não
    // são chamados por nenhuma rota hoje (não tem UI usando isso), e já existe backup
    // de verdade via pg_dump horário + on push (GitHub Actions) — reativar isso exige
    // antes reescrever fazerBackup() pra não segurar as 5 tabelas inteiras em memória
    // de uma vez, e rodar bem menos que 1x/min.
    // const { iniciarBackup } = require('./services/backup'); iniciarBackup();
    const { iniciarMonitor } = require('./services/monitor'); iniciarMonitor();
    const { iniciarPostsScheduler } = require('./services/postsScheduler'); iniciarPostsScheduler();
  } catch(e) {
    console.error('[server] Erro ao iniciar autoUpdateXML:', e.message);
  }
});

// Graceful shutdown — no deploy o Render manda SIGTERM na instância antiga
// depois de trocar o tráfego. Sem isso, requisições em andamento são
// cortadas na marra. Aqui: para de aceitar conexão nova, espera as em
// andamento terminarem, fecha o pool do banco e só então sai do processo.
let _encerrando = false;
function _shutdownGracioso(sinal) {
  if (_encerrando) return;
  _encerrando = true;
  console.log(`[shutdown] ${sinal} recebido — encerrando graciosamente...`);
  _httpServer.close(() => {
    console.log('[shutdown] servidor HTTP fechado, sem conexões pendentes');
    try {
      const { getPool } = require('./services/db');
      const _pool = getPool();
      if (_pool) _pool.end().catch(() => {});
    } catch(e) {}
    process.exit(0);
  });
  // Failsafe — força saída se alguma conexão não fechar a tempo
  setTimeout(() => {
    console.error('[shutdown] timeout — forçando saída');
    process.exit(1);
  }, 10000).unref();
}
process.on('SIGTERM', () => _shutdownGracioso('SIGTERM'));
process.on('SIGINT', () => _shutdownGracioso('SIGINT'));

// ROTA DA TELA IMPORTAR LEADS
app.post('/process', auth, upload.any(), async (req, res) => {
  try {
    const file = (req.files && req.files[0]) || req.file;
    if (!file) return res.send('Envie o arquivo');

    const { execSync } = require('child_process');
    const uid = req.session.user ? req.session.user.id : ""; const { criarJob: _cjL3 } = require('./services/importJobs');
    const { dispararWorkerLeads: _dwL3 } = require('./services/workerDispatch');
    const _jobIdL3 = await _cjL3('csv', uid, file.path);
    _dwL3(_jobIdL3, file.path, uid);

    return res.redirect('/app/leads');
  } catch (err) {
    return res.send('Erro ao importar leads: ' + err.message);
  }
});

// ====== ROTA MAPA ======
app.get('/app/mapa', auth, async (req, res) => {
  const fs2 = require('fs');
  const path2 = require('path');
  const DATA_DIR2 = process.env.RENDER ? '/opt/render/project/src/data' : __dirname;
  const userId = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
  const hoje = new Date().toISOString().split('T')[0];
  const imoveis = (_cacheImoveis || []);
  // Visitas do dia
  const todasVisitas = await lerVisitasData();
  const amanha = new Date(Date.now()+86400000).toISOString().split('T')[0];
  const _statusAtivos = ['solicitada','pendente','confirmada','lead_confirmou','aguard_cliente','remarcacao'];
  const visitasHoje = todasVisitas.filter(v =>
    (v.userId===userId||v.corretorId===userId||v.leadOwnerId===userId||v.imovelOwnerId===userId) &&
    (v.dataVisita===hoje || v.dataVisita===amanha || _statusAtivos.includes(v.status))
  ).sort((a,b)=>(a.dataVisita||'').localeCompare(b.dataVisita||'') || (a.horaVisita||'').localeCompare(b.horaVisita||''));
  // Leads ativas do corretor
  const todasLeads = _cacheLeads || await lerLeadsData();
  const leadsCorretor = todasLeads.filter(l => (l.userId===userId||l.codigoUsuario===userId) && l.status!=='arquivado');
  // Imóveis com visita hoje
  const imoveisVisita = [];
  const _cidadeCoords = {'balneário camboriú':{lat:-26.9906,lng:-48.6348},'balneario camboriu':{lat:-26.9906,lng:-48.6348},'itajaí':{lat:-26.9078,lng:-48.6619},'itajai':{lat:-26.9078,lng:-48.6619},'florianópolis':{lat:-27.5954,lng:-48.5480},'florianopolis':{lat:-27.5954,lng:-48.5480},'navegantes':{lat:-26.8986,lng:-48.6539},'itapema':{lat:-27.0906,lng:-48.6119}};
  const _normC = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  visitasHoje.forEach(v => {
    const im = imoveis.find(i => i.id===v.imovelId || i.idOriginal===v.imovelId || i.idExterno===v.imovelId || i.id_interno===v.imovelId);
    let lat, lng;
    if(im && (im.latitude||im.lat) && (im.longitude||im.lng)) {
      lat = im.latitude||im.lat; lng = im.longitude||im.lng;
    } else {
      const bairro = _normC(v.imovelBairro||im?.bairro||'');
      const cidade = _normC(v.imovelCidade||im?.cidade||'');
      const coords = _cidadeCoords[bairro] || _cidadeCoords[cidade] || null;
      if(coords){ lat=coords.lat; lng=coords.lng; }
    }
    if(lat && lng) {
      imoveisVisita.push({ lat, lng, titulo:v.imovelTitulo||v.imovelBairro||im?.titulo||'Imóvel', bairro:v.imovelBairro||im?.bairro||'', valor:im?.valor_imovel||0, visita:v, tipo:'visita' });
    }
  });
  // Imóveis com interesse/match de leads
  const imoveisInteresse = [];
  leadsCorretor.forEach(l => {
    const matches = l.matchesAuto||l.matches||[];
    matches.slice(0,2).forEach(m => {
      const im = imoveis.find(i => i.id===m.id||i.idOriginal===m.id||i.idExterno===m.id);
      if(im && (im.latitude||im.lat) && (im.longitude||im.lng)) {
        imoveisInteresse.push({ lat:im.latitude||im.lat, lng:im.longitude||im.lng, titulo:im.titulo||im.tipo||'Imóvel', bairro:im.bairro||'', valor:im.valor_imovel||0, leadNome:l.nome||l.telefone, leadTemp:l.temperatura, score:m.score||0, tipo:'interesse' });
      }
    });
  });
  // Leads com bairro para mostrar onde buscam
  const leadsAtivas = leadsCorretor.filter(l => l.bairro||l.perfilIA?.bairro).map(l => ({ id:l.id, nome:l.nome, telefone:l.telefone, bairro:l.bairro||l.perfilIA?.bairro||'', cidade:l.cidade||l.perfilIA?.cidade||'', temperatura:l.temperatura||'frio', score:l.score||0, matchCount:(l.matchesAuto||l.matches||[]).length }));
  const proximaVisita = visitasHoje.find(v => v.status!=='realizada'&&v.status!=='cancelada')||null;
  res.render('app-mapa', {
    user: req.session.user,
    visitasJSON: _jsonScript(visitasHoje),
    leadsJSON: _jsonScript(leadsAtivas),
    imoveisVisitaJSON: _jsonScript(imoveisVisita),
    imoveisInteresseJSON: _jsonScript(imoveisInteresse),
    proximaVisitaJSON: _jsonScript(proximaVisita),
    total: imoveis.length,
    hoje
  });
});

app.get('/mapa', (req, res) => {
  const imoveis = loadImoveis();
  const { tipo } = req.query;
  let filtrados = imoveis;
  if (tipo) filtrados = filtrados.filter(i => i.tipo === tipo);
  res.render('mapa', {
    user: req.session.user,
    imoveisJSON: _jsonScript(filtrados),
    total: filtrados.length
  });
});

// ====== FEED REELS ======
// rota /feed removida — usar /app/feed

app.get('/api/imoveis', auth, async (req, res) => {
  const imoveis = await lerImoveis(req.session.user.id);
  res.json(imoveis.slice(0, 50));
});

// Antes essas duas rotas ficavam registradas DENTRO do handler acima (chave
// nunca fechada) — cada chamada a /api/imoveis cadastrava 2 handlers novos de
// /imovel/:id/status no Express, sem nunca remover os antigos (vazamento de
// memória sem limite, cresce a cada request). Também trocado salvarTodosImoveis
// (regravava os 62 mil imóveis do banco inteiro a cada clique) por salvarImovel
// (grava só o imóvel editado).
// Antes sem auth: qualquer um mudava status de qualquer imóvel de qualquer
// corretor sabendo/tentando um id. Agora exige sessão e só acha o imóvel
// dentro da lista já filtrada pro dono logado (mesmo padrão de lerImoveis()
// usado em /app/imovel/:id/editar).
app.post('/imovel/:id/status', auth, (req,res)=>{
  const imoveis = lerImoveis(req.session.user);
  const { status } = req.body;

  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id) || String(i.id) === String(req.params.id));
  if(idx<0) return res.status(404).json({ok:false, erro:'Imóvel não encontrado'});

  imoveis[idx].status = status;
  salvarImovel(imoveis[idx]).catch(e=>console.error("[imoveis]",e.message));
  gerarXMLPortais();

  res.json({ok:true});
});


// Cadastro manual de imóvel
const UPLOADS_IMOVEIS_DIR = process.env.RENDER
  ? '/opt/render/project/src/data/uploads/imoveis'
  : path.join(__dirname, 'public', 'uploads', 'imoveis');
if (!fs.existsSync(UPLOADS_IMOVEIS_DIR)) fs.mkdirSync(UPLOADS_IMOVEIS_DIR, { recursive: true });

// Antes aceitava qualquer extensão do nome original do arquivo (controlado
// pelo atacante) e servia o resultado publicamente em /data-uploads — dava
// pra subir um .html/.svg com <script> como "foto" e ele ficar acessível na
// origem confiável do site (XSS armazenado). Agora só aceita as extensões
// realmente usadas por essas rotas (fotos de imóvel/logo + planilha de
// contatos da campanha em /admin/campanha/importar).
const _EXTENSOES_PERMITIDAS_IMOVEIS = ['jpg','jpeg','png','gif','webp','xlsx','xls','csv'];
const storageImoveis = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_IMOVEIS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = (file.originalname.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    cb(null, Date.now() + '-' + Math.floor(Math.random()*1000) + '.' + ext);
  }
});
const uploadImoveis = multer({
  storage: storageImoveis,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!_EXTENSOES_PERMITIDAS_IMOVEIS.includes(ext)) return cb(new Error('Tipo de arquivo não permitido: ' + ext));
    cb(null, true);
  }
});

app.post('/app/meu-site/logo', auth, uploadImoveis.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.redirect('/app/meu-site?msg=erro');
    const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
    const { salvarConfig } = require('./services/salvarSiteConfig');
    const url = '/data-uploads/' + req.file.filename;
    await salvarConfig(uid, { logo_url: url });
    res.redirect('/app/meu-site?msg=salvo');
  } catch(e) {
    console.error('[meu-site/logo]', e.message);
    res.redirect('/app/meu-site?msg=erro');
  }
});

app.post('/app/meu-site/logo/excluir', auth, async (req, res) => {
  try {
    const uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
    const { buscarConfig, salvarConfig } = require('./services/salvarSiteConfig');
    const config = await buscarConfig(uid);
    if (config && config.logo_url && config.logo_url.startsWith('/data-uploads/')) {
      const arquivoPath = path.join(UPLOADS_IMOVEIS_DIR, path.basename(config.logo_url));
      fs.unlink(arquivoPath, () => {});
    }
    await salvarConfig(uid, { logo_url: '' });
    res.redirect('/app/meu-site?msg=salvo');
  } catch(e) {
    console.error('[meu-site/logo/excluir]', e.message);
    res.redirect('/app/meu-site?msg=erro');
  }
});

app.post('/app/imoveis/portais-lote', auth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const ids = JSON.parse(req.body.ids || '[]');
    const portais = JSON.parse(req.body.portais || '[]');
    if (!ids.length) return res.json({ ok: false, erro: 'Nenhum imóvel selecionado' });
    const imoveis = await lerImoveis(userId);
    let atualizados = 0;
    for (const pid of ids) {
      const idx = imoveis.findIndex(i =>
        String(i.idExterno) === pid || String(i.idInterno) === pid ||
        String(i.codigoImovel) === pid || String(i.id) === pid
      );
      if (idx < 0) continue;
      imoveis[idx].portais = portais;
      imoveis[idx].last_update = new Date().toISOString();
      await salvarImovel(imoveis[idx]);
      if (_cacheImoveis) {
        const _ci = _cacheImoveis.findIndex(i => i.id === imoveis[idx].id);
        if (_ci >= 0) _cacheImoveis[_ci] = imoveis[idx];
      }
      atualizados++;
    }
    setTimeout(() => regenerarXMLUsuario(userId).catch(e => console.error('[xml-lote]', e.message)), 500);
    res.json({ ok: true, atualizados });
  } catch(e) {
    console.error('[portais-lote]', e.message);
    res.json({ ok: false, erro: e.message });
  }
});

app.post('/app/imovel/cadastrar', auth, uploadImoveis.array('fotos', 20), async (req, res) => {
  // verifica saldo antes de cadastrar
  const _userCad = (_cacheUsuarios||[]).find(u => u.id === req.session.user?.id || u.codigoUsuario === req.session.user?.codigoUsuario);
  const _saldoCad = _userCad?.matchCoins || req.session.user?.matchCoins || 0;
  if(_saldoCad < 15) return res.redirect('/app/coins?erro=saldo_insuficiente');
  if(!req.body.numero || !req.body.numero.trim()) return res.status(400).send('Número do endereço é obrigatório. Volte e preencha o número do imóvel.');
  const idInterno = 'MI-' + Date.now() + '-' + Math.random().toString(36).substr(2,6).toUpperCase();
  const imoveis = (_cacheImoveis || []);
  const b = req.body;
  // diferenciais
  const difs = [];
  Object.keys(b).forEach(k => { if(k.startsWith('dif_') && b[k]==='on') difs.push(k.replace('dif_','')); });
  // portais
  const portais = [];
  ['vivareal','zap','olx','chaves','imovelweb','123i','quintoandar'].forEach(p => { if(b['portal_'+p]==='on') portais.push(p); });
  const novo = {
    idInterno: idInterno,
    codigoImovel: idInterno,
    idExterno: '',
    titulo: b.titulo || '',
    tipo: b.tipo || 'Apartamento',
    transacao: b.transacao || 'venda',
    condicao: b.condicao || '',
    fase: b.fase || '',
    status: b.status || 'nao_publicado',
    // localização
    cep: b.cep || '',
    endereco: b.endereco || '',
    numero: b.numero || '',
    complemento: b.complemento || '',
    bairro: b.bairro || '',
    cidade: b.cidade || 'São Paulo',
    estado: b.estado || 'SP',
    latitude: parseFloat(b.latitude) || null,
    longitude: parseFloat(b.longitude) || null,
    // valores
    valor_imovel: parseFloat(b.valor_imovel) || 0,
    condominio: parseFloat(b.condominio) || 0,
    iptu: parseFloat(b.iptu) || 0,
    aceita_financiamento: b.aceita_financiamento || 'a_combinar',
    aceita_permuta: b.aceita_permuta || 'nao',
    // areas
    area_m2: parseFloat(b.area_m2) || 0,
    area_total: parseFloat(b.area_total) || 0,
    area_construida: parseFloat(b.area_construida) || 0,
    andar: parseInt(b.andar) || 0,
    total_andares: parseInt(b.total_andares) || 0,
    unidades_por_andar: parseInt(b.unidades_por_andar) || 0,
    posicao_solar: b.posicao_solar || '',
    // cômodos
    quartos: parseInt(b.quartos) || 0,
    suites: parseInt(b.suites) || 0,
    banheiros: parseInt(b.banheiros) || 0,
    vagas: parseInt(b.vagas) || 0,
    // diferenciais e portais
    diferenciais: difs,
    portais: portais,
    // proprietário
    proprietario: (b.proprietario || b.proprietario_celular || b.proprietario_email) ? {
      nome: b.proprietario || '',
      telefone: b.proprietario_celular || '',
      celular: b.proprietario_celular || '',
      email: b.proprietario_email || '',
      cpf: b.proprietario_cpf || '',
      status: 'vinculado'
    } : {},
    // descrição e mídia
    descricao: b.descricao || '',
    fotos: (req.files || []).map(f => '/data-uploads/' + f.filename),
    // meta
    usuarioId: req.session.user.id,
    usuarioNome: req.session.user.nome || req.session.user.nomeCompleto || '',
    usuarioPerfil: req.session.user.perfil || req.session.user.tipoConta || '',
    usuarioTelefone: req.session.user.celular || req.session.user.telefone || '',
    source: 'manual',
    lastUpdate: new Date().toISOString(),
    // campos obrigatórios banco
    user_id: req.session.user.id,
    userId: req.session.user.id,
    condominio_nome: b.condominio_nome || '',
    torre: b.torre || '',
    unidade: b.unidade || '',
    ano_construcao: b.ano_construcao || '',
    corretor_nome: req.session.user.nome || '',
    corretor_email: req.session.user.email || '',
    corretor_telefone: req.session.user.telefone || req.session.user.celular || '',
    corretor_id: req.session.user.id,
    // campos banco corretos
    id: idInterno,
    usuario_id: req.session.user.id,
    codigo_usuario: req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id,
    usuario_nome: req.session.user.nome || '',
    usuario_perfil: req.session.user.tipo || req.session.user.tipoConta || 'corretor',
    usuario_telefone: req.session.user.telefone || req.session.user.celular || '',
    categoria: b.categoria || 'residencial',
    salas: parseInt(b.salas) || 0,
    descricao_editada: false,
    fonte: 'manual',
    url: '',
    url_publica: '/imovel/' + idInterno,
    tour_virtual: b.tour_virtual || '',
    corretor: {
      id: req.session.user.id,
      nome: req.session.user.nome || '',
      email: req.session.user.email || '',
      telefone: req.session.user.telefone || req.session.user.celular || ''
    }
  };
  const { salvarImovel: _salvarImovelNovo } = require('./services/salvarImovel');
  await _salvarImovelNovo(novo);
  if(_cacheImoveis) _cacheImoveis.push(novo);
  consumir(req.session.user.id, 'cadastrar_imovel').catch(()=>{}); // 15 créditos por imóvel novo
  res.redirect('/app/imovel/' + idInterno + '/editar?salvo=1');
  setTimeout(() => regenerarXMLUsuario(req.session.user.id).catch(e => console.error('[xml-cadastro]', e.message)), 1000);
});

// Detalhe do imóvel


// Salva lead vindo da página pública do imóvel
app.post('/api/lead-interesse', async (req, res) => {
  try {
    const { nome, celular, email, imovelId, imovelTitulo, leadId: leadIdOrigem, userId: userIdOrigem } = req.body;

    if (!nome || !celular || !imovelId) {
      return res.json({ ok: false, error: 'Dados obrigatórios ausentes' });
    }

    const agora = new Date();

    const leads = (_cacheLeads || []);

    const imoveis = fs.existsSync(dataFile('imoveis.json'))
      ? ((_cacheImoveis || []))
      : [];

    const imovelRef = imoveis.find(i =>
      String(i.idExterno) === String(imovelId) ||
      String(i.id) === String(imovelId) ||
      String(i.idOriginal) === String(imovelId)
    ) || {};

    // Dono da lead/vitrine: quem gerou/importou a lead
    let leadOrigem = {};
    if (leadIdOrigem) {
      try {
        const { query: _qLO } = require('./services/db');
        const _rLO = await _qLO('SELECT * FROM leads WHERE id=$1 LIMIT 1', [String(leadIdOrigem)]);
        if (_rLO.rows[0]) {
          const row = _rLO.rows[0];
          leadOrigem = { ...(row.dados||{}), id: row.id, nome: row.nome, telefone: row.telefone, whatsapp: row.whatsapp, userId: row.user_id, codigoUsuario: row.codigo_usuario };
        }
      } catch(e) {}
      if (!leadOrigem.id) {
        leadOrigem = leads.find(l => String(l.id || l.leadId || '') === String(leadIdOrigem)) || {};
      }
    }

    const usuarioDestinoId =
      userIdOrigem || leadOrigem.userId || leadOrigem.usuarioId || leadOrigem.corretorId ||
      imovelRef.usuarioId || imovelRef.corretorId || imovelRef.codigoUsuario || imovelRef.userId || '';

    const usuarioDestinoNome =
      leadOrigem.usuarioNome || leadOrigem.corretorNome ||
      imovelRef.usuarioNome || imovelRef.corretorNome || '';

    const usuarioDestinoPerfil =
      leadOrigem.usuarioPerfil || leadOrigem.perfil ||
      imovelRef.usuarioPerfil || imovelRef.perfil || '';

    const usuarioDestinoTelefone =
      leadOrigem.usuarioTelefone || leadOrigem.corretorTelefone ||
      imovelRef.usuarioTelefone || imovelRef.corretorTelefone || '';

    const imovelOwnerId = imovelRef.usuarioId || imovelRef.corretorId || imovelRef.codigoUsuario || imovelRef.userId || '';

    const celularLimpo = String(celular || '').replace(/\D/g,'');

    const idxExiste = leads.findIndex(l =>
      String(l.contato || l.telefone || '').replace(/\D/g,'') === celularLimpo &&
      String(l.imovel_interesse || '') === String(imovelId)
    );

    // Atribuição ao objetivo "Página do imóvel" do Meta Ads — sem parâmetro de
    // rastreio na URL, casa pelo próprio imóvel: se existe campanha de tráfego
    // pra esse imóvel, a lead conta como vinda do Facebook (ver decisão do Renato)
    let _campanhaMetaTrafego = null;
    try {
      const { buscarCampanhaAtivaPorImovel } = require('./services/salvarCampanhaMeta');
      _campanhaMetaTrafego = await buscarCampanhaAtivaPorImovel(imovelId, 'trafego');
    } catch(e) { console.error('[lead-interesse] erro ao buscar campanha meta:', e.message); }

    const _baseLI = process.env.RENDER ? 'https://matchimoveis.ia.br' : 'http://localhost:3000';
    const _intencaoLI = imovelRef.transacao === 'venda' ? 'comprar' : imovelRef.transacao === 'aluguel' ? 'alugar' : '';

    const leadPayload = {
      nome,
      contato: celular,
      telefone: celular,
      email: email || '',
      fonte: _campanhaMetaTrafego ? 'Meta Ads' : 'MatchImóveis',
      origem: _campanhaMetaTrafego ? 'Meta Ads' : 'MatchImóveis',
      origemEntrada: _campanhaMetaTrafego ? 'meta_ads_trafego' : undefined,
      extractionStatus: 'ok',
      canal: 'WhatsApp',
      imovel_interesse: imovelId,
      idAnuncio: imovelId,
      titulo_interesse: imovelTitulo || imovelRef.titulo || '',
      tipo: imovelRef.tipo || '',
      bairro: imovelRef.bairro || '',
      cidade: imovelRef.cidade || 'São Paulo',
      estado: imovelRef.estado || 'SP',
      valor_imovel: imovelRef.valor_imovel || 0,
      area_m2: imovelRef.area_m2 || 0,
      quartos: imovelRef.quartos || 0,
      suites: imovelRef.suites || 0,
      banheiros: imovelRef.banheiros || 0,
      vagas: imovelRef.vagas || 0,
      perfilIA: {
        tipo: imovelRef.tipo || '',
        intencao: _intencaoLI,
        bairro: imovelRef.bairro || '',
        cidade: imovelRef.cidade || 'São Paulo',
        estado: imovelRef.estado || 'SP',
        quartos: imovelRef.quartos || '',
        suites: imovelRef.suites || '',
        vagas: imovelRef.vagas || '',
        banheiros: imovelRef.banheiros || '',
        area: imovelRef.area_m2 || '',
        valorMax: imovelRef.valor_imovel || 0,
        valorMin: 0,
      },
      url: _baseLI + '/imovel/' + imovelId,

      // Lead pertence ao dono do imóvel
      usuarioId: usuarioDestinoId,
      usuarioNome: usuarioDestinoNome,
      usuarioPerfil: usuarioDestinoPerfil,
      usuarioTelefone: usuarioDestinoTelefone,
      corretorId: usuarioDestinoId,
      corretorNome: usuarioDestinoNome,
      corretorTelefone: usuarioDestinoTelefone,

      data_cadastro: agora.toISOString(),
      data_cadastro_br: agora.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' }),
      matches: [],
      matchCount: 0
    };

    let leadId;
    if (leadIdOrigem && leadOrigem.id) {
      leadId = leadOrigem.id;
      try {
        const { atualizarLead: _atualizarLO } = require('./services/salvarLead');
        await _atualizarLO(leadId, { visitaSolicitada: true, visitaSolicitadaEm: new Date().toISOString() });
      } catch(e) {}
      console.log('[API] visita vinculada lead original:', leadId);
    } else if (idxExiste === -1) {
      leadId = Date.now().toString();
      leads.push({
        id: leadId,
        ...leadPayload
      });
      console.log('✅ Novo lead salvo para o dono da lead/vitrine:', usuarioDestinoNome || usuarioDestinoId || 'sem dono');
    } else {
      leadId = leads[idxExiste].id || Date.now().toString();
      leads[idxExiste] = {
        ...leads[idxExiste],
        ...leadPayload,
        id: leadId
      };
      console.log('✅ Lead existente atualizado para o dono da lead/vitrine:', usuarioDestinoNome || usuarioDestinoId || 'sem dono');
    }

    salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));

    // Lead atribuída a uma campanha de tráfego do Meta Ads — credita a campanha
    // (mesmo padrão do Formulário e do WhatsApp) e roda o match automático.
    // leadPayload já tem imovel_interesse/idAnuncio setado, então match-core
    // detecta Caso 1 sozinho e monta o mapaIntencao a partir do próprio imóvel
    // âncora (funciona igual pra residencial/comercial/terreno, sem distinção
    // aqui — quem decide quais campos usar é o _matchCaso1)
    if (_campanhaMetaTrafego) {
      try {
        const { incrementarLeadsRecebidos } = require('./services/salvarCampanhaMeta');
        incrementarLeadsRecebidos(_campanhaMetaTrafego.id).catch(()=>{});
        consumir(_campanhaMetaTrafego.userId, 'lead_meta_recebido').catch(e=>console.error('[creditos] lead_meta_recebido (trafego) falhou:', e.message));
        const matchCore = require('./cerebro/match-core');
        const leadParaMatch = { id: leadId, ...leadPayload };
        matchCore.processar({ lead: leadParaMatch, mensagem: '', canal: 'meta_ads_trafego', userId: _campanhaMetaTrafego.userId })
          .catch(e => console.error('[meta-ads-trafego] erro ao rodar match:', e.message));
      } catch(e) { console.error('[lead-interesse] erro ao processar campanha meta:', e.message); }
    }

    // Só cria visita quando a ação for solicitação de visita
    const querVisita =
      req.body.querVisita === 'true' ||
      req.body.solicitarVisita === 'true' ||
      req.body.visita === 'true' ||
      req.body.tipo === 'visita' ||
      req.body.acao === 'visita' ||
      req.body.acao === 'solicitar_visita';

    if (querVisita) {
      const _dv = req.body.dataVisita || '';
      const _hv = req.body.horaVisita || '00:00';
      if (_dv) {
        const _dtVisita = new Date(_dv + 'T' + _hv + ':00');
        if (_dtVisita < new Date()) {
          return res.json({ ok: false, error: 'Data e horário da visita não podem ser no passado.' });
        }
      }
      const visitas = (_cacheVisitas || []);

      visitas.push({
        id: Date.now().toString(),
        leadId,
        nome,
        telefone: celular,
        contato: celular,
        imovelId,
        imovelTitulo: imovelTitulo || imovelRef.titulo || '',
        imovelBairro: imovelRef.bairro || '',
        imovelCidade: imovelRef.cidade || 'São Paulo',
        imovelEstado: imovelRef.estado || 'SP',
        proprietarioNome: (imovelRef.proprietario && imovelRef.proprietario.nome) || '',
        proprietarioTelefone: ((imovelRef.proprietario && (imovelRef.proprietario.telefone || imovelRef.proprietario.celular)) || '').replace(/\D/g,''),

        // Visita vai somente para o dono da lead/vitrine
        leadOwnerId: usuarioDestinoId,
        imovelOwnerId,
        imovelUsuarioId: imovelRef.userId || imovelRef.codigoUsuario || imovelRef.usuarioId || imovelOwnerId || '',
        imovelUsuarioNome: (function(){ var _oid = imovelRef.user_id||imovelRef.userId||imovelRef.usuarioId||imovelOwnerId||''; var _ou = (_cacheUsuarios||[]).find(function(u){ return (u.codigo_usuario||u.codigoUsuario||u.id)===_oid; }); return _ou ? (_ou.nome||'') : ''; })(),
        imovelUsuarioTelefone: (function(){ var _oid = imovelRef.user_id||imovelRef.userId||imovelRef.usuarioId||imovelOwnerId||''; var _ou = (_cacheUsuarios||[]).find(function(u){ return (u.codigo_usuario||u.codigoUsuario||u.id)===_oid; }); return _ou ? ((_ou.celular||_ou.telefone||'').replace(/D/g,'')) : ''; })(),
        usuarioDestinoId,
        usuarioDestinoNome,
        usuarioDestinoPerfil,
        usuarioDestinoTelefone,
        userId: usuarioDestinoId,
        corretorId: usuarioDestinoId,
        corretorNome: usuarioDestinoNome,
        corretorTelefone: usuarioDestinoTelefone,

        dataVisita: req.body.dataVisita || '',
        horaVisita: req.body.horaVisita || '',
        status: 'solicitada',
        origem: 'pagina_externa_imovel', extractionStatus: 'ok',
        fonte: 'MatchImóveis',
        data: agora.toISOString(),
        data_br: agora.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' })
      });

      salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

      // Notifica corretor via WhatsApp sobre nova visita solicitada
      (async () => {
        try {
          const _EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
          const _EK = process.env.EVOLUTION_KEY || 'match2025evolution';
          const _BASE = process.env.RENDER ? 'https://matchimoveis.ia.br' : 'http://localhost:3000';
          const _corrUsers = (_cacheUsuarios || []);
          const _corrUser = _corrUsers.find(u => u.id === usuarioDestinoId);
          const _instancia = _corrUser?.whatsappInstance || 'match-corretor';
          const _telCorretor = (_corrUser?.celular || _corrUser?.telefone || '').replace(/\D/g,'');
          if (_telCorretor) {
            const _visitaId = visitas[visitas.length - 1].id;
            const _linkConfirmar = _BASE + '/corretor/visita/' + _visitaId;
            // contato do responsável pelo imóvel
            const _novaVisita = visitas[visitas.length - 1];
            const _isParceiro = (_novaVisita.imovelUsuarioId || '') !== usuarioDestinoId;
            const _temProprietario = !!(_novaVisita.proprietarioTelefone);
            let _contatoExtra = '';
            if(_isParceiro){
              const _parcNome = _novaVisita.imovelUsuarioNome || '';
              const _parcTel = _novaVisita.imovelUsuarioTelefone || '';
              const _parcWA = _parcTel ? 'https://wa.me/55'+_parcTel.replace(/\D/g,'').replace(/^55/,'') : ''; if(_parcNome || _parcWA) _contatoExtra = '\n\n📋 *Imóvel de parceiro*\nCorretor: *' + (_parcNome||'parceiro') + '*' + (_parcWA ? '\n📲 ' + _parcWA : '');
            } else if(_temProprietario){
              const _propNome = _novaVisita.proprietarioNome || 'Proprietário';
              const _propTel = _novaVisita.proprietarioTelefone || '';
              const _propWA = _propTel ? 'https://wa.me/55'+_propTel.replace(/\D/g,'').replace(/^55/,'') : ''; _contatoExtra = '\n\n🏠 *Proprietário cadastrado*\nNome: *' + _propNome + '*' + (_propWA ? '\n📲 ' + _propWA : '');
            }
            const _linkImovel = (_novaVisita.imovelId||imovelId) ? '\n🔗 '+_BASE+'/imovel/'+encodeURIComponent(_novaVisita.imovelId||imovelId)+'?userId='+encodeURIComponent(usuarioDestinoId||'') : '';
            const _dataVisitaBR = _novaVisita.dataVisita ? _novaVisita.dataVisita.split('-').reverse().join('/') : '';
            const _dataHora = _dataVisitaBR ? '\n📅 '+_dataVisitaBR+(_novaVisita.horaVisita?' às '+_novaVisita.horaVisita:'') : '';
            const _avisoContato = _contatoExtra ? '\n\n⚠️ *Fale com o responsável antes de confirmar a visita.*' : '';
            const _nomeCorretor = (_corrUser?.nome || '').split(' ')[0] || 'Corretor';
            const _msg = 'Olá *' + _nomeCorretor + '*! Você recebeu uma nova solicitação de visita. 🏠'
              + _linkImovel
              + _dataHora
              + _contatoExtra
              + _avisoContato
              + '\n\n✅ Confirmar, remarcar ou informar imóvel indisponível: ' + _linkConfirmar
              + '\n📋 Painel: ' + _BASE + '/app/visitas';
            await fetch(_EU + '/message/sendText/' + _instancia, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': _EK },
              body: JSON.stringify({ number: '55' + _telCorretor.replace(/^55/,''), text: _msg })
            });
            console.log('[visita] WA corretor notificado:', _telCorretor);
          }
          try {
            const _corrUserEmail = _corrUser?.email || '';
            if (_corrUserEmail) {
              const { enviarEmail } = require('./services/email');
              await enviarEmail({ para: _corrUserEmail, assunto: '📅 Nova solicitação de visita — MatchImóveis', html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px"><pre style="font-family:Arial,sans-serif;white-space:pre-wrap">' + _msg + '</pre><br><a href="https://matchimoveis.ia.br/app/visitas" style="display:inline-block;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Ver no painel →</a></div>', texto: _msg });
              console.log('[visita] email corretor:', _corrUserEmail);
            }
          } catch(_eVE) { console.error('[visita] erro email:', _eVE.message); }
        } catch(e) { console.error('[visita] erro WA corretor:', e.message); }
      })();

      try {
        const notificacoes = await lerNotificacoesService(req.session?.user?.id) || [];

        criarNotificacaoService({
          id: Date.now().toString(),
          tipo: 'nova_visita',
          titulo: 'Nova solicitação de visita',
          mensagem: nome + ' solicitou visita para ' + (imovelTitulo || imovelRef.titulo || 'um imóvel'),
          usuarioId: usuarioDestinoId,
          usuarioNome: usuarioDestinoNome,
          leadId,
          imovelId,
          lida: false,
          criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
        });

        console.log('🔔 Notificação criada: nova visita (PG)');
      } catch(e) {
        console.log('Erro ao criar notificação:', e.message);
      }

      console.log('📅 Visita criada para o dono da lead/vitrine:', usuarioDestinoNome || usuarioDestinoId || 'sem dono');
      console.log('[visita-debito] querVisita:', querVisita, '| usuarioDestinoId:', usuarioDestinoId);
      if(querVisita && usuarioDestinoId) { try { const { consumir: _cV } = require('./services/creditos'); _cV(usuarioDestinoId, 'visita_agendada_ia').then(()=>console.log('[visita-debito] OK')).catch(e=>console.error('[visita-debito] ERRO:', e.message)); } catch(e) { console.error('[visita-debito] catch:', e.message); } }
    }

    return res.json({ ok: true, leadId, visitaCriada: querVisita });
  } catch(e) {
    console.log('Erro em /api/lead-interesse:', e.message);
    return res.json({ ok: false, error: e.message });
  }
});

// ── SITE PÚBLICO WHITE-LABEL POR USUÁRIO ──────────────────────────────────────
function _paginaManutencaoSite(res, corretor) {
  res.status(503).send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Site em manutenção</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',-apple-system,sans-serif;background:#FBF9F6;color:#16181A;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
  .box{max-width:420px}.ico{font-size:44px;margin-bottom:16px}h1{font-size:20px;margin-bottom:8px}p{color:#716C61;font-size:14px;line-height:1.6}</style></head>
  <body><div class="box"><div class="ico">🛠️</div><h1>Site temporariamente indisponível</h1><p>${corretor && corretor.nome ? 'O site de ' + corretor.nome : 'Este site'} está em manutenção no momento. Volte em breve.</p></div></body></html>`);
}

function _resolverCorretorPublico(codigoUsuario) {
  const users = (_cacheUsuarios || []);
  return users.find(u => (u.codigoUsuario || u.id) === codigoUsuario) || null;
}

async function _carregarSiteConfigPublico(codigoUsuario, corretor) {
  const { buscarConfig } = require('./services/salvarSiteConfig');
  const configSalva = await buscarConfig(codigoUsuario).catch(() => null);
  return {
    corPrimaria: (configSalva && configSalva.cor_primaria) || '#FF385C',
    corCabecalho: (configSalva && configSalva.cor_cabecalho) || '',
    corRodape: (configSalva && configSalva.cor_rodape) || '',
    corTextoRodape: (configSalva && configSalva.cor_texto_rodape) || '',
    logoUrl: (configSalva && configSalva.logo_url) || '',
    rodapeNome: (configSalva && configSalva.rodape_nome) || corretor.nome || '',
    rodapeTelefone: (configSalva && configSalva.rodape_telefone) || corretor.celular || corretor.telefone || '',
    rodapeEndereco: (configSalva && configSalva.rodape_endereco) || '',
    rodapeTexto: (configSalva && configSalva.rodape_texto) || '',
    rodapeInstagram: (configSalva && configSalva.rodape_instagram) || '',
    rodapeFacebook: (configSalva && configSalva.rodape_facebook) || '',
    metaPixelId: (configSalva && configSalva.meta_pixel_id) || '',
    googleAnalyticsId: (configSalva && configSalva.google_analytics_id) || '',
    financiamentoUrl: (configSalva && configSalva.financiamento_url) || '',
    financiamentoAtivo: !!(configSalva && configSalva.financiamento_ativo),
    siteAtivo: configSalva ? configSalva.site_ativo !== false : true
  };
}

function _pagina404Site(res, opts) {
  return res.status(404).render('site-404', Object.assign({ titulo: 'Página não encontrada', mensagem: 'O link que você acessou não existe ou não está mais disponível.', siteConfig: null, siteBasePath: null }, opts || {}));
}

// siteBasePath: '' quando servido por domínio próprio (raiz), '/site/:codigoUsuario' quando servido pelo path da plataforma
async function _handlerSitePublico(req, res, codigoUsuario, siteBasePath) {
  try {
    const corretor = _resolverCorretorPublico(codigoUsuario);
    if (!corretor) return _pagina404Site(res, { titulo: 'Site não encontrado', mensagem: 'Este site não existe ou não está mais disponível.' });

    const siteConfig = await _carregarSiteConfigPublico(codigoUsuario, corretor);
    if (!siteConfig.siteAtivo) return _paginaManutencaoSite(res, corretor);

    // Hard-filter: só imóveis deste codigoUsuario, nunca confiar em parâmetro do client
    const imoveisDoUsuario = lerImoveis(codigoUsuario).filter(i => i.status !== 'inativo' && i.status !== 'excluido');
    const _r = _filtrarEPaginarImoveis(imoveisDoUsuario, req.query, 24);

    res.render('site-publico', {
      corretor, siteConfig, codigoUsuario, siteBasePath,
      siteOrigin: req.protocol + '://' + req.get('host'),
      imoveis: _r.imoveisPagina, estados: _r.estados, cidades: _r.cidades, bairros: _r.bairros,
      page: _r.page, totalPages: _r.totalPages, totalImoveis: _r.totalImoveis,
      filtros: req.query, queryPagina: _r.queryPagina
    });
  } catch(e) {
    console.error('[site-publico]', e.message);
    res.status(500).send('Erro ao carregar site');
  }
}

async function _handlerSiteImovelPublico(req, res, codigoUsuario, imovelId, siteBasePath) {
  try {
    const corretor = _resolverCorretorPublico(codigoUsuario);
    if (!corretor) return _pagina404Site(res, { titulo: 'Site não encontrado', mensagem: 'Este site não existe ou não está mais disponível.' });

    const siteConfig = await _carregarSiteConfigPublico(codigoUsuario, corretor);
    if (!siteConfig.siteAtivo) return _paginaManutencaoSite(res, corretor);

    // Hard-filter: o imóvel só é exibido se pertencer a este codigoUsuario — nunca cruzar carteiras
    const imoveisDoUsuario = lerImoveis(codigoUsuario);
    const imovel = imoveisDoUsuario.find(i => String(i.idExterno) === String(imovelId) || String(i.idInterno) === String(imovelId) || String(i.codigoImovel) === String(imovelId) || String(i.id) === String(imovelId));
    if (!imovel) return _pagina404Site(res, { titulo: 'Imóvel não encontrado', mensagem: 'Este imóvel não existe mais ou foi removido.', siteConfig, siteBasePath });

    const pub = Object.assign({}, imovel);
    delete pub.proprietario;
    delete pub.proprietario_celular;
    delete pub.proprietario_email;

    if (!pub.latitude || !pub.longitude) {
      const { _geocodificarEndereco } = require('./services/salvarImovel');
      const _geo = await _geocodificarEndereco(pub);
      if (_geo) { pub.latitude = _geo.latitude; pub.longitude = _geo.longitude; }
    }

    const parecidos = imoveisDoUsuario
      .filter(i => i.status !== 'inativo' && i.status !== 'excluido' && String(i.id) !== String(imovel.id) && (i.bairro === imovel.bairro || i.tipo === imovel.tipo))
      .slice(0, 4);

    res.render('imovel-publico', {
      imovel: pub, corretor, leadDados: { nome: '', telefone: '' }, temLeadId: false, leadId: '',
      usuarioLogado: req.session && req.session.user ? req.session.user : null,
      userId: codigoUsuario, compartilhador: null, siteConfig, siteVoltarUrl: siteBasePath || '/',
      siteOrigin: req.protocol + '://' + req.get('host'), parecidos
    });
  } catch(e) {
    console.error('[site-publico-imovel]', e.message);
    res.status(500).send('Erro ao carregar imóvel');
  }
}

async function _handlerSiteSitemap(req, res, codigoUsuario, origem) {
  try {
    const corretor = _resolverCorretorPublico(codigoUsuario);
    if (!corretor) return res.status(404).send('Site não encontrado');
    const base = origem.replace(/\/$/, '');
    const imoveisDoUsuario = lerImoveis(codigoUsuario).filter(i => i.status !== 'inativo' && i.status !== 'excluido');
    const urls = [base + '/'].concat(imoveisDoUsuario.map(i => base + '/imovel/' + (i.idExterno || i.idInterno || i.id)));
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(u => '  <url><loc>' + u.replace(/&/g,'&amp;') + '</loc></url>').join('\n') +
      '\n</urlset>';
    res.set('Content-Type', 'application/xml').send(xml);
  } catch(e) {
    console.error('[site-sitemap]', e.message);
    res.status(500).send('Erro ao gerar sitemap');
  }
}

function _handlerSiteRobots(req, res, origem) {
  const base = origem.replace(/\/$/, '');
  res.set('Content-Type', 'text/plain').send('User-agent: *\nAllow: /\nSitemap: ' + base + '/sitemap.xml\n');
}

app.get('/site/:codigoUsuario', (req, res) => _handlerSitePublico(req, res, req.params.codigoUsuario, '/site/' + req.params.codigoUsuario));
app.get('/site/:codigoUsuario/imovel/:id', (req, res) => _handlerSiteImovelPublico(req, res, req.params.codigoUsuario, req.params.id, '/site/' + req.params.codigoUsuario));
app.get('/site/:codigoUsuario/sitemap.xml', (req, res) => _handlerSiteSitemap(req, res, req.params.codigoUsuario, req.protocol + '://' + req.get('host') + '/site/' + req.params.codigoUsuario));
app.get('/site/:codigoUsuario/robots.txt', (req, res) => _handlerSiteRobots(req, res, req.protocol + '://' + req.get('host') + '/site/' + req.params.codigoUsuario));
// ── FIM SITE PÚBLICO ───────────────────────────────────────────────────────────

// Página pública do imóvel — sem login
app.get('/imovel/:id', async (req, res) => {
  const imoveis = ((_cacheImoveis || []));
  const users = (_cacheUsuarios || []);


  // Busca na base interna primeiro
  let imovel = imoveis.find(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id) || String(i.id) === String(req.params.id));
  const _uidQuery = req.query.userId || '';
  const _uid2 = imovel ? (imovel.user_id || imovel.userId || '') : '';
  const corretor = users.find(function(u){ return (u.codigo_usuario||u.codigoUsuario||u.id) === _uid2; }) || users.find(function(u){ return u.ativo; }) || {};
  // userId da query serve só para atribuir lead — não muda o corretor exibido
  const _uidLead = _uidQuery || _uid2;

  if (imovel) {
    // Cache guarda só as 20 primeiras fotos — busca a linha completa pra mostrar todas
    const _completoPub = await _buscarImovelCompleto(imovel.id);
    if (_completoPub) imovel = { ...imovel, ...(_completoPub.fotos ? { fotos: _completoPub.fotos } : {}), descricao: _completoPub.descricao };
    const pub = Object.assign({}, imovel);
    delete pub.proprietario;
    delete pub.proprietario_celular;
    delete pub.proprietario_email;
    if (!pub.latitude || !pub.longitude) {
      const { _geocodificarEndereco } = require('./services/salvarImovel');
      const _geo = await _geocodificarEndereco(pub);
      if (_geo) { pub.latitude = _geo.latitude; pub.longitude = _geo.longitude; }
    }
    // Busca dados da lead para preencher formulário
    let leadDados = { nome: '', telefone: '', email: '' };
    const _leadId = req.query.leadId || req.query.lid || '';
    if (_leadId) {
      const _leads = (_cacheLeads || []);
      const _lead = _leads.find(l => String(l.id) === String(_leadId));
      if (_lead) leadDados = { nome: _lead.nome||'', telefone: (_lead.telefone||_lead.whatsapp||'').replace(/\D/g,'').replace(/^55/,''), email: _lead.email||'' };
    }
    const _usuarioLogado = req.session && req.session.user ? req.session.user : null;
    const _compartilhador = (_uidLead && _uidLead !== _uid2) ? ((_cacheUsuarios||[]).find(u=>(u.id===_uidLead||u.codigoUsuario===_uidLead||u.codigo_usuario===_uidLead)) || null) : null;
    const _parecidos = imoveis
      .filter(i => i.status !== 'inativo' && i.status !== 'excluido' && String(i.id) !== String(imovel.id) && String(i.userId||i.user_id) === String(_uid2) && (i.bairro === imovel.bairro || i.tipo === imovel.tipo))
      .slice(0, 4);
    return res.render('imovel-publico', { imovel: pub, corretor, leadDados, temLeadId: !!_leadId, leadId: _leadId, usuarioLogado: _usuarioLogado, userId: _uidLead, compartilhador: _compartilhador, siteOrigin: req.protocol + '://' + req.get('host'), parecidos: _parecidos });
  }

  // Busca nos matches do QuintoAndar
  const leads = (_cacheLeads || []);
  let qaImovel = null;
  for (const lead of leads) {
    const matches = lead.matchesBase || [];
    const m = matches.find(m => m && (String(m.id_anuncio) === String(req.params.id) || String(m.id_anuncio_quintoandar) === String(req.params.id)));
    if (m) { qaImovel = m; break; }
  }

  if (!qaImovel) return _pagina404Site(res, { titulo: 'Imóvel não encontrado', mensagem: 'Este imóvel não existe mais ou foi removido.' });

  // Monta objeto compatível com imovel-publico
  const pub = {
    idExterno: qaImovel.id_anuncio || qaImovel.id_anuncio_quintoandar,
    titulo: qaImovel.titulo || (qaImovel.tipo + ' em ' + qaImovel.bairro),
    tipo: qaImovel.tipo || 'Apartamento',
    bairro: qaImovel.bairro || '',
    cidade: qaImovel.cidade || '',
    estado: qaImovel.estado || '',
    valor_imovel: qaImovel.valor_imovel || qaImovel.valor || 0,
    area_m2: qaImovel.area_m2 || qaImovel.area || 0,
    quartos: qaImovel.quartos || 0,
    suites: qaImovel.suites || 0,
    banheiros: qaImovel.banheiros || 0,
    vagas: qaImovel.vagas || 0,
    descricao: qaImovel.descricao || '',
    fotos: qaImovel.fotos || [],
    fonte: 'QuintoAndar',
    url: qaImovel.url || ''
  };

  if (!pub.latitude || !pub.longitude) {
    const { _geocodificarEndereco } = require('./services/salvarImovel');
    const _geo = await _geocodificarEndereco(pub);
    if (_geo) { pub.latitude = _geo.latitude; pub.longitude = _geo.longitude; }
  }

  res.render('imovel-publico', { imovel: pub, corretor, siteOrigin: req.protocol + '://' + req.get('host') });
});


// Detalhe da lead
app.get('/app/lead/:id', auth, async (req, res) => {
  const uid = String(req.session.user.id || '');
  const { lerLeads: _llSvcDetalhe, salvarTodosLeads: _slSvcDetalhe } = require('./services/salvarLead');
  const leads = await _llSvcDetalhe(req.session.user.id);
  const lead = leads.find(l => String(l.id) === String(req.params.id));
  if (!lead) return res.status(404).send('Lead não encontrada');

  if (!Array.isArray(lead.historico)) lead.historico = [];
  lead.historico.push({
    acao: 'visualizou_detalhes_lead',
    data: new Date().toISOString()
  });

  // Marcar mensagens WhatsApp como lidas
  if (lead.mensagens && lead.mensagens.length) {
    lead.mensagens = lead.mensagens.map(m => ({
      ...m,
      lida: m.de === 'cliente' ? true : m.lida
    }));
  }

  // Marca como "em atendimento" — o corretor abriu os detalhes ao menos uma vez.
  // Card/linha da planilha ficam com fundo vermelho claro pra sinalizar isso.
  lead.emAtendimento = true;
  lead.atendidoEm = lead.atendidoEm || new Date().toISOString();

  atualizarLeadService(lead.id, { historico: lead.historico, mensagens: lead.mensagens, emAtendimento: true, atendidoEm: lead.atendidoEm }).catch(e=>console.error("[leads]",e.message));

  const visitas = (_cacheVisitas || []);

  const visitasDaLead = visitas.filter(v =>
    String(v.leadId || v.lead_id || '') === String(lead.id) &&
    String(v.userId || v.codigoUsuario || '') === uid
  );

  // Imóveis relacionados por telefone/email
  let imoveisRelacionados = [];
  try {
    const { query: _qIR } = require('./services/db');
    let _tel = (lead.telefone||lead.whatsapp||'').replace(/\D/g,''); if(_tel.startsWith('55') && _tel.length>=12) _tel = _tel.slice(2);
    const _email = (lead.email||'').toLowerCase().trim();
    const conds = []; const pars = [uid];
    if(_tel){ pars.push('%'+_tel+'%'); conds.push(`proprietario->>'telefone' ILIKE $${pars.length} OR proprietario->>'celular' ILIKE $${pars.length}`); }
    if(_email){ pars.push(_email); conds.push(`proprietario->>'email' ILIKE $${pars.length}`); }
    if(conds.length){ const _r = await _qIR(`SELECT id,id_interno,titulo,tipo,bairro,cidade,valor_imovel,transacao,status FROM imoveis WHERE (user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1) AND (${conds.join(' OR ')}) LIMIT 10`, pars); imoveisRelacionados = _r.rows; }
  } catch(_eIR){}

  // Se perfilIA vazio mas mapaIntencao preenchido — converte para perfilIA
  // Normalizar tipo para capitalizado
  if (lead.perfilIA && lead.perfilIA.tipo) {
    const _tipoMap = {'apartamento':'Apartamento','casa':'Casa','cobertura':'Cobertura','sobrado':'Sobrado','loft':'Loft','studio':'Studio / Flat','flat':'Studio / Flat','kitnet':'Kitnet / Conjugado','conjugado':'Kitnet / Conjugado','duplex':'Duplex','mansao':'Mansão','mansão':'Mansão','chacara':'Chácara','chácara':'Chácara','sitio':'Sítio','sítio':'Sítio','fazenda':'Fazenda','terreno':'Terreno','sala':'Sala Comercial','loja':'Loja','galpao':'Galpão','galpão':'Galpão','conjunto':'Conjunto','predio':'Prédio','prédio':'Prédio'};
    lead.perfilIA.tipo = _tipoMap[lead.perfilIA.tipo.toLowerCase()] || lead.perfilIA.tipo;
  }

  if ((!lead.perfilIA || Object.keys(lead.perfilIA).length === 0) && lead.mapaIntencao) {
    const mi = lead.mapaIntencao;
    const _v = (arr) => arr && arr.length ? arr[0].valor : null;
    lead.perfilIA = {};
    if (_v(mi.tipo_imovel)) lead.perfilIA.tipo = _v(mi.tipo_imovel);
    if (_v(mi.transacao))   lead.perfilIA.intencao = _v(mi.transacao);
    if (_v(mi.bairro))      lead.perfilIA.bairro = _v(mi.bairro);
    if (_v(mi.cidade))      lead.perfilIA.cidade = _v(mi.cidade);
    if (_v(mi.estado))      lead.perfilIA.estado = _v(mi.estado);
    if (_v(mi.quartos))     lead.perfilIA.quartos = _v(mi.quartos);
    if (_v(mi.suites))      lead.perfilIA.suites = _v(mi.suites);
    if (_v(mi.vagas))       lead.perfilIA.vagas = _v(mi.vagas);
    if (_v(mi.banheiros))   lead.perfilIA.banheiros = _v(mi.banheiros);
    if (_v(mi.valor))       lead.perfilIA.valorMax = _v(mi.valor)?.max || null;
    if (mi.fase)            lead.perfilIA.faseFunil = mi.fase;
    if (mi.temperatura)     lead.perfilIA.temperatura = mi.temperatura;
  }

  // Usa matches já salvos no PG (gerados pelo motor de intenção)
  let matchesInternos = lead.matches || lead.matchesAuto || [];
  console.log(`[LEAD DETALHE] matches do PG: ${matchesInternos.length}`);

  let sugestoesCopiloto = [];
  try {
    const { gerarSugestoes } = require('./cerebro/copiloto');
    sugestoesCopiloto = gerarSugestoes(lead);
  } catch(e) { console.error('copiloto erro:', e.message); }

  // Contato do corretor responsável (imóvel da rede) — pros cards de match/gostei
  const _uidLogadoLead = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
  const _donoUidDe = (o) => o.userId || o.user_id || o.usuarioId || o.codigoUsuario || o.codigo_usuario || o.corretorId || '';
  [['matches',lead.matches], ['matchesAuto',lead.matchesAuto], ['imoveisGostei',lead.imoveisGostei]].forEach(([label, arr]) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(item => {
      const donoUid = _donoUidDe(item);
      item.imovelProprio = !!donoUid && String(donoUid) === String(_uidLogadoLead);
      item.donoContato = _resolverDonoContato(donoUid, _uidLogadoLead);
      if (!item.donoContato && donoUid && !item.imovelProprio) {
        console.log(`[donoContato] ${label} | imovel:${item.id||item.idExterno||''} | donoUid:${donoUid} | uidLogado:${_uidLogadoLead} | usuarioEncontrado:${(_cacheUsuarios||[]).some(u=>String(u.codigoUsuario||u.id)===String(donoUid))}`);
      }
    });
  });

  res.render('app-lead-detalhe', { user: req.session.user, lead, visitasDaLead, matchesInternos, sugestoesCopiloto, imoveisRelacionados });
});
// Dono real do imóvel = mesmo critério usado em lerImoveis()/salvarImovel.js — userId/usuarioId/codigoUsuario/corretorId
function _ehDonoDoImovel(imovel, user) {
  const uid = String(user.codigoUsuario || user.codigo_usuario || user.id || '');
  return String(imovel.userId||'') === uid ||
    String(imovel.usuarioId||'') === uid ||
    String(imovel.codigoUsuario||'') === uid ||
    String(imovel.corretorId||'') === uid;
}

// Contato do corretor responsável por um imóvel que não é do usuário logado (imóvel da rede) —
// mesmo critério usado em /app/imovel/:id (donoContato); reaproveitado nos cards de match/gostei
// da tela de detalhe da lead.
function _resolverDonoContato(donoUid, uidLogado) {
  if (!donoUid || String(donoUid) === String(uidLogado)) return null;
  const donoUser = (_cacheUsuarios || []).find(u => String(u.codigoUsuario || u.id) === String(donoUid));
  if (!donoUser) return null;
  return { nome: donoUser.nome || 'Corretor parceiro', celular: donoUser.celular || donoUser.telefone || '', codigoUsuario: donoUser.codigoUsuario || donoUser.id };
}

// Busca a linha COMPLETA do imóvel direto do banco (fotos sem o corte de 20 que o
// cache em RAM aplica) — usar nas telas que precisam mostrar/editar todas as fotos:
// página pública, detalhe interno, editar, upload/excluir/capa de foto, gerar XML manual.
async function _buscarImovelCompleto(id) {
  try {
    const { query: _qBIC } = require('./services/db');
    const { rowToImovel: _rtiBIC } = require('./services/salvarImovel');
    const idStr = String(id);
    const r = await _qBIC('SELECT * FROM imoveis WHERE id=$1 OR id_externo=$1 OR id_interno=$1 OR codigo_imovel=$1 LIMIT 1', [idStr]);
    return r.rows[0] ? _rtiBIC(r.rows[0]) : null;
  } catch(e) { console.error('[_buscarImovelCompleto]', e.message); return null; }
}

app.get('/app/imovel/:id', auth, async (req, res) => {
  const imoveis = ((_cacheImoveis || []));
  const user = req.session.user;
  let imovel = imoveis.find(i => String(i.id) === String(req.params.id) || String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id));
  if (!imovel) return res.status(404).send('Imóvel não encontrado');
  // Cache guarda só as 20 primeiras fotos — busca a linha completa pra mostrar todas
  const _completo1 = await _buscarImovelCompleto(imovel.id);
  if (_completo1) imovel = { ...imovel, ...(_completo1.fotos ? { fotos: _completo1.fotos } : {}), descricao: _completo1.descricao };

  const isAdmin = user.tipo === 'admin';
  const isDono = _ehDonoDoImovel(imovel, user);
  const verProprietario = isAdmin || isDono;

  // Se não for o dono, resolve o contato do corretor responsável (conta dona do imóvel na rede)
  // pra permitir contato de parceria — nunca expõe o proprietário/dono real (esse fica preso ao verProprietario)
  let donoContato = null;
  if (!isDono) {
    const donoUid = imovel.userId || imovel.usuarioId || imovel.codigoUsuario || imovel.corretorId || '';
    const donoUser = (_cacheUsuarios || []).find(u => String(u.codigoUsuario || u.id) === String(donoUid));
    if (donoUser && (donoUser.celular || donoUser.telefone)) {
      donoContato = { nome: donoUser.nome || 'Corretor parceiro', celular: donoUser.celular || donoUser.telefone, codigoUsuario: donoUser.codigoUsuario || donoUser.id };
    }
  }

  res.render('app-imovel-detalhe', { user, imovel, verProprietario, isDono, donoContato });
});

// Editar imóvel - tela
app.get('/app/imovel/:id/editar', auth, async (req,res)=>{
  const fs = require('fs');
  const imoveis = fs.existsSync(dataFile('imoveis.json')) ? ((_cacheImoveis || [])) : [];
  let imovel = imoveis.find(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id) || String(i.id) === String(req.params.id));

  if(!imovel){
    return res.send('Imóvel não encontrado. <a href="/app/imoveis">Voltar</a>');
  }
  if(!_ehDonoDoImovel(imovel, req.session.user) && req.session.user.tipo !== 'admin'){
    return res.status(403).send('Você não tem permissão pra editar esse imóvel. <a href="/app/imovel/'+req.params.id+'">Voltar</a>');
  }
  // Cache guarda só as 20 primeiras fotos — busca a linha completa pra poder editar todas
  const _completo2 = await _buscarImovelCompleto(imovel.id);
  if (_completo2) imovel = { ...imovel, ...(_completo2.fotos ? { fotos: _completo2.fotos } : {}), descricao: _completo2.descricao };

  const idImovelEdit = (imovel.idExterno && imovel.idExterno.trim()) ? imovel.idExterno : (imovel.idInterno || String(imovel.id) || ''); res.render('app-editar-imovel', { user: req.session.user, imovel, salvo: req.query.salvo === '1', idImovel: idImovelEdit });
});

// Editar imóvel - salvar
app.post('/app/imovel/:id/editar', auth, async (req,res)=>{
  const userId = req.session.user.id;
  const imoveis = await lerImoveis(userId);
  const _pid = decodeURIComponent(req.params.id);
  const idx = imoveis.findIndex(i =>
    String(i.idExterno) === _pid ||
    String(i.idInterno) === _pid ||
    String(i.codigoImovel) === _pid ||
    String(i.id) === _pid
  );
  if(idx < 0) return res.send('Imóvel não encontrado. <a href="/app/imoveis">Voltar</a>');
  if(!req.body.numero || !req.body.numero.trim()) return res.status(400).send('Número do endereço é obrigatório. <a href="javascript:history.back()">Voltar</a>');

  // Essa tela não mexe em fotos, mas o cache só guarda as 20 primeiras — busca a base
  // completa antes de sobrescrever, senão o save apagaria as fotos além da 20ª.
  const _baseCompletaEdit = await _buscarImovelCompleto(imoveis[idx].id);
  if (_baseCompletaEdit && _baseCompletaEdit.fotos) imoveis[idx] = { ...imoveis[idx], fotos: _baseCompletaEdit.fotos };

  const b = req.body;
  const difs = Object.keys(b).filter(k => k.startsWith('dif_') && b[k]==='on').map(k => k.replace('dif_',''));
  const portais = ['olx','zap','vivareal','chaves','imovelweb','123i','quintoandar'].filter(p => !!b['portal_'+p]);

  // Proprietario: se usuario preencheu qualquer campo usa novo, se limpou tudo limpa
  const proprietario = {
    nome: b.proprietario || '',
    telefone: b.proprietario_celular || '',
    celular: b.proprietario_celular || '',
    email: b.proprietario_email || '',
    cpf: b.proprietario_cpf || '',
    status: (b.proprietario || b.proprietario_celular) ? 'vinculado' : ''
  };

  imoveis[idx] = {
    ...imoveis[idx],
    titulo: b.titulo || imoveis[idx].titulo || '',
    status: b.status || 'nao_publicado',
    tipo: b.tipo || '',
    categoria: b.categoria || imoveis[idx].categoria || 'residencial',
    transacao: b.transacao || 'venda',
    condicao: b.condicao || '',
    fase: b.fase || '',
    cep: b.cep || '',
    endereco: b.endereco || '',
    numero: b.numero || '',
    complemento: b.complemento || '',
    bairro: b.bairro || '',
    cidade: b.cidade || '',
    estado: b.estado || '',
    latitude: Number(b.latitude || 0) || null,
    longitude: Number(b.longitude || 0) || null,
    valor_imovel: Number(b.valor_imovel || 0),
    condominio: Number(b.condominio || 0),
    iptu: Number(b.iptu || 0),
    aceita_financiamento: b.aceita_financiamento || 'a_combinar',
    aceita_permuta: b.aceita_permuta || 'nao',
    area_m2: Number(b.area_m2 || 0),
    area_total: Number(b.area_total || 0),
    area_construida: Number(b.area_construida || 0),
    andar: b.andar || '',
    total_andares: Number(b.total_andares || 0),
    unidades_por_andar: Number(b.unidades_por_andar || 0),
    posicao_solar: b.posicao_solar || '',
    torre: b.torre || '',
    unidade: b.unidade || '',
    condominio_nome: b.condominio_nome || '',
    ano_construcao: b.ano_construcao || '',
    tour_virtual: b.tour_virtual || '',
    quartos: Number(b.quartos || 0),
    suites: Number(b.suites || 0),
    banheiros: Number(b.banheiros || 0),
    vagas: Number(b.vagas || 0),
    salas: Number(b.salas || 0),
    proprietario: proprietario,
    descricao: b.descricao || '',
    descricao_editada: true,
    descricaoEditada: true,
    diferenciais: difs,
    portais: portais,
    user_id: userId,
    userId: userId,
    updatedAt: new Date().toISOString(),
    last_update: new Date().toISOString()
  };

  await salvarImovel(imoveis[idx]);
  if(_cacheImoveis) { const _ci = _cacheImoveis.findIndex(i => i.id === imoveis[idx].id); if(_ci >= 0) _cacheImoveis[_ci] = _capFotosCache({ ...imoveis[idx] }); }
  setTimeout(() => regenerarXMLUsuario(userId).catch(e => console.error('[xml-editar]', e.message)), 1000);
  // Renderiza direto sem redirect para evitar problema de sessao
  const idImovelEdit = (imoveis[idx].idExterno&&imoveis[idx].idExterno.trim())?imoveis[idx].idExterno:(imoveis[idx].idInterno||String(imoveis[idx].id)||'');
  res.render('app-editar-imovel', { user: req.session.user, imovel: imoveis[idx], salvo: true, idImovel: idImovelEdit });
});


// Upload de foto
app.post('/app/imovel/:id/upload-foto', auth, uploadImoveis.single('foto'), async (req,res)=>{
  try {
    const pid = req.params.id;
    if(!req.file) return res.redirect('/app/imovel/' + pid + '/editar?erro=foto');
    const imoveis = (_cacheImoveis || []);
    const idx = imoveis.findIndex(i => String(i.idExterno)===pid || String(i.idInterno)===pid || String(i.codigoImovel)===pid || String(i.id)===pid);
    if(idx >= 0){
      // Cache só guarda as 20 primeiras fotos — busca a lista completa antes de adicionar
      const _completoUp = await _buscarImovelCompleto(imoveis[idx].id);
      const url = '/data-uploads/' + req.file.filename;
      const _imovelCompletoUp = { ...imoveis[idx], fotos: (_completoUp?.fotos || imoveis[idx].fotos || []) };
      _imovelCompletoUp.fotos = [..._imovelCompletoUp.fotos, url];
      await salvarImovel(_imovelCompletoUp);
      if(_cacheImoveis) { const _ci = _cacheImoveis.findIndex(i => i.id === imoveis[idx].id); if(_ci >= 0) _cacheImoveis[_ci] = _capFotosCache({ ..._imovelCompletoUp }); }
    }
    res.redirect('/app/imovel/' + pid + '/editar?salvo=1');
  } catch(e) {
    console.error('[upload-foto]', e.message);
    res.redirect('/app/imovel/' + req.params.id + '/editar?erro=foto');
  }
});

// Excluir foto

// Excluir imóvel
app.post('/app/imovel/:id/excluir', auth, async (req, res) => {
  try {
    console.log('[excluir-imovel] pid:', req.params.id, 'uid:', req.session.user.id);
    const uid = req.session.user.id;
    const pid = req.params.id;
    // PostgreSQL
    const { query: _qExcluir } = require('./services/db');
    await _qExcluir('DELETE FROM imoveis WHERE (id_externo=$1 OR id_interno=$1 OR id=$1) AND user_id=$2', [pid, uid]);

    // Cache
    if (_cacheImoveis) {
      _cacheImoveis = _cacheImoveis.filter(i =>
        String(i.idExterno) !== pid &&
        String(i.idInterno) !== pid &&
        String(i.id) !== pid
      );
    }
    regenerarXMLUsuario(uid).catch(()=>{});
    res.redirect('/app/imoveis?excluido=1');
  } catch(e) {
    console.error('[excluir-imovel]', e.message);
    res.redirect('/app/imoveis?erro=1');
  }
});
app.post('/app/imovel/:id/excluir-foto', auth, async (req,res)=>{
  const fs = require('fs');
  const { foto } = req.body;

  const imoveis = ((_cacheImoveis || []));
  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id));

  if(idx >= 0){
    // Cache só guarda as 20 primeiras fotos — busca a lista completa antes de excluir
    const _completoDel = await _buscarImovelCompleto(imoveis[idx].id);
    const _imovelCompletoDel = { ...imoveis[idx], fotos: (_completoDel?.fotos || imoveis[idx].fotos || []) };
    _imovelCompletoDel.fotos = _imovelCompletoDel.fotos.filter(f => f !== foto);
    await salvarImovel(_imovelCompletoDel).catch(e=>console.error("[imoveis]",e.message));
    if(_cacheImoveis) { const _ci = _cacheImoveis.findIndex(i => i.id === imoveis[idx].id); if(_ci >= 0) _cacheImoveis[_ci] = _capFotosCache({ ..._imovelCompletoDel }); }
  }

  res.redirect('/app/imovel/' + req.params.id + '/editar');
});

// Definir foto de capa
app.post('/app/imovel/:id/capa-foto', auth, async (req,res)=>{
  const fs = require('fs');
  const { foto } = req.body;

  const imoveis = ((_cacheImoveis || []));
  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id));

  if(idx >= 0){
    // Cache só guarda as 20 primeiras fotos — busca a lista completa antes de reordenar
    const _completoCapa = await _buscarImovelCompleto(imoveis[idx].id);
    let fotos = _completoCapa?.fotos || imoveis[idx].fotos || [];
    fotos = fotos.filter(f => f !== foto);
    fotos.unshift(foto);
    const _imovelCompletoCapa = { ...imoveis[idx], fotos };
    await salvarImovel(_imovelCompletoCapa).catch(e=>console.error("[imoveis]",e.message));
    if(_cacheImoveis) { const _ci = _cacheImoveis.findIndex(i => i.id === imoveis[idx].id); if(_ci >= 0) _cacheImoveis[_ci] = _capFotosCache({ ..._imovelCompletoCapa }); }
  }

  res.redirect('/app/imovel/' + req.params.id + '/editar');
});

// Regenera XMLs por usuário após cadastro/edição
async function regenerarXMLUsuario(userId) {
  try {
    const { query: _qXml } = require('./services/db');
    const result = await _qXml('SELECT * FROM imoveis WHERE user_id=$1', [userId]);
    const imoveis = result.rows.map(r => ({
      ...r,
      id: r.id,
      idExterno: r.id_externo || '',
      idOriginal: r.id_original || '',
      idInterno: r.id_interno || '',
      codigoImovel: r.codigo_imovel || '',
      titulo: r.titulo || '',
      tipo: r.tipo || '',
      transacao: r.transacao || '',
      condicao: r.condicao || '',
      status: r.status || '',
      bairro: r.bairro || '',
      cidade: r.cidade || '',
      estado: r.estado || '',
      endereco: r.endereco || '',
      numero: r.numero || '',
      complemento: r.complemento || '',
      cep: r.cep || '',
      latitude: r.latitude || '',
      longitude: r.longitude || '',
      valor_imovel: r.valor_imovel || 0,
      condominio: r.condominio || 0,
      iptu: r.iptu || 0,
      area_m2: r.area_m2 || 0,
      area_total: r.area_total || 0,
      quartos: r.quartos || 0,
      suites: r.suites || 0,
      banheiros: r.banheiros || 0,
      vagas: r.vagas || 0,
      descricao: r.descricao || '',
      fotos: r.fotos || [],
      portais: r.portais || [],
      userId: r.user_id,
      usuarioId: r.usuario_id,
      usuarioNome: r.usuario_nome || '',
      lastUpdate: r.last_update || '',
      createdAt: r.criado_em || '',
      updatedAt: r.atualizado_em || ''
    }));
    const users = (_cacheUsuarios || []);
    const user = users.find(u => u.id === userId) || {};
    const token = userId.replace(/[^a-z0-9]/gi,'-');
    const todosPortais = ['olx','zap','vivareal','chaves','imovelweb','123i','quintoandar'];
    todosPortais.forEach(portal => {
      const filtrados = imoveis.filter(i => {
        const temPortal = Array.isArray(i.portais) ? i.portais.includes(portal) : !!(i.portais||{})[portal];
        const ativo = i.status === 'ativo' || i.status === 'publicado';
        return ativo && temPortal;
      }).map(i => ({
        ...i,
        corretorNome: user.nome || user.name || '',
        corretorEmail: user.email || '',
        corretorTelefone: user.celular || user.telefone || ''
      }));
      const filename = 'feed-'+portal+'-'+token+'.xml';
      if(filtrados.length > 0) {
        const xml = gerarXMLPortal(filtrados, portal, user);
        fs.writeFileSync(dataPath(filename), xml, 'utf8');
        console.log('[xml] '+filename+': '+filtrados.length+' imóveis');
        const _urlXmlE = BASE_URL+'/feed-xml/'+portal+'/'+token;
        const { query: _qXml } = require('./services/db');
        _qXml('INSERT INTO xml_feeds (user_id, portal, url, total, arquivo, last_sync_at, ativo) VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT (user_id, portal) DO UPDATE SET arquivo=EXCLUDED.arquivo, url=EXCLUDED.url, total=EXCLUDED.total, last_sync_at=EXCLUDED.last_sync_at', [userId, portal, _urlXmlE, filtrados.length, xml, new Date().toISOString()]).catch(()=>{});
      } else {
        // Remove XML se não tem imóveis para esse portal
        const filepath = dataPath(filename);
        if(fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
          console.log('[xml] removido '+filename+' (0 imóveis)');
        }
      }
    });
  } catch(e) {
    console.error('[regenerarXMLUsuario]', e.message);
  }
}

// =========================
// GERAR XML PORTAIS (VivaReal padrão)
// =========================

// =========================
// GERAR XML PORTAIS (VivaReal padrão)
// =========================
function gerarXMLPortais(){
  const fs = require('fs');
  const imoveis = ((_cacheImoveis || []));

  const portais = ['olx','zap','vivareal','chaves','imovelweb','123i','quintoandar'];

  portais.forEach(portal => {

    const filtrados = imoveis.filter(i => {
      if(!i.portais) return false;
      const temPortal = Array.isArray(i.portais)
        ? i.portais.includes(portal)
        : !!i.portais[portal];
      const ativo = i.status === 'ativo' || i.status === 'publicado';
      return ativo && temPortal;
    });

    const xml = gerarXMLPortal(filtrados, portal);
    fs.writeFileSync(dataPath(`feed-${portal}.xml`), xml);
    console.log(`XML gerado: feed-${portal}.xml (${filtrados.length} imóveis)`);
  });
}


















app.post('/api/gerar-descricao-imovel', (req,res)=>{
  const { tipo, bairro, cidade, quartos, suites, banheiros, vagas, area, valor } = req.body || {};

  const partes = [];
  if (quartos) partes.push(quartos + ' dormitório(s)');
  if (suites) partes.push(suites + ' suíte(s)');
  if (banheiros) partes.push(banheiros + ' banheiro(s)');
  if (vagas) partes.push(vagas + ' vaga(s)');
  if (area) partes.push(area + 'm²');

  const local = bairro ? bairro + ', ' + (cidade || 'São Paulo') : (cidade || 'São Paulo');

  const descricao = `Excelente ${tipo || 'imóvel'} localizado em ${local}, ideal para quem busca conforto, praticidade e uma ótima oportunidade de moradia ou investimento.

O imóvel conta com ${partes.length ? partes.join(', ') : 'ambientes bem distribuídos'}, oferecendo uma planta funcional e agradável para o dia a dia.

A região possui fácil acesso a comércios, serviços, transporte e tudo o que você precisa para viver com mais comodidade.

${valor ? 'Valor de oportunidade: R$ ' + Number(valor).toLocaleString('pt-BR') + '.' : ''}

Agende sua visita e conheça de perto essa oportunidade.`;

  res.json({ descricao });
});



function registrarHistoricoImovelLead(lead, tipoEvento, imovel){
  if (!lead || !imovel) return;

  lead.historicoImoveis = Array.isArray(lead.historicoImoveis)
    ? lead.historicoImoveis
    : [];

  const idImovel =
    imovel.id ||
    imovel.idExterno ||
    imovel.listingId ||
    imovel.id_anuncio_quintoandar ||
    imovel.imovel_interesse ||
    imovel.url ||
    '';

  lead.historicoImoveis.push({
    tipoEvento,
    data: new Date().toISOString(),
    idImovel,
    imovel: {
      id: idImovel,
      tipo: imovel.tipo || '',
      bairro: imovel.bairro || '',
      cidade: imovel.cidade || '',
      valor: imovel.valor_imovel || imovel.valor || '',
      url: imovel.url || ''
    }
  });
}


// Retorna IDs de todos os imóveis ativos do usuário (para gerar XML pelo chat)
app.get('/app/imoveis-ids', auth, (req, res) => {
  const todos = (_cacheImoveis || []);
  const filtrados = filtrarPorUsuario(todos, req.session.user);
  const ativos = filtrados.filter(i => (i.status||'ativo').toLowerCase() === 'ativo');
  const ids = ativos.map(i => String(i.idExterno || i.id));
  res.json({ ids, total: ids.length });
});

app.post('/app/gerar-xml', auth, checarSaldo('Gerar XML para portais', 10), async (req,res)=>{
  const { portal, ids } = req.body;
  const todos = await lerImoveis(req.session.user.id);
  const imoveis = filtrarPorUsuario(todos, req.session.user);
  const selecionados = imoveis.filter(i => ids.includes(String(i.id)) || ids.includes(String(i.idExterno)) || ids.includes(String(i.idOriginal)));
  const token = req.session.user.id.replace(/[^a-z0-9]/gi,'-');
  const filename = 'feed-'+portal+'-'+token+'.xml';
  // Cache só guarda as 20 primeiras fotos — busca a lista completa de cada selecionado
  // pra não publicar o feed do portal com menos fotos do que o imóvel realmente tem.
  const _fotosCompletas = await Promise.all(selecionados.map(i => _buscarImovelCompleto(i.id)));
  const selecionadosComCorretor = selecionados.map((i, idx) => ({
    ...i,
    fotos: _fotosCompletas[idx]?.fotos || i.fotos,
    corretorNome: req.session.user.nome || req.session.user.name || '',
    corretorEmail: req.session.user.email || '',
    corretorTelefone: req.session.user.celular || req.session.user.telefone || ''
  }));

  const xml = gerarXMLPortal(selecionadosComCorretor, portal);
  fs.writeFileSync(dataPath(filename), xml, 'utf8');
  consumir(req.session.user.id, 'gerar_xml_portal').catch(()=>{}); // 10 créditos por geração de XML
  res.json({ url: '/'+filename, total: selecionados.length });
});

function gerarXMLPortal(imoveis, portal, user){

  if(portal === 'quintoandar'){
    const esc = v => String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ListingDataFeed>\n  <Header>\n    <Provider>Matchimoveis</Provider>\n    <Email>contato@matchimoveis.ia.br</Email>\n    <BatchId>matchimoveis-'+Date.now()+'</BatchId>\n    <BatchName>MatchImoveis QuintoAndar '+new Date().toISOString()+'</BatchName>\n  </Header>\n  <Listings>\n';

    imoveis.forEach(i => {
      const prop = i.proprietario || {};
      const fotos = Array.isArray(i.fotos) ? i.fotos : [];
      const transacaoQA = i.transacao === 'aluguel' ? 'For Rent' : 'For Sale';
      xml += '\n    <Listing>\n';
      xml += '      <ListingID>'+esc(i.id_interno || i.idExterno || i.idOriginal || i.id)+'</ListingID>\n';
      xml += '      <Title>'+esc(i.titulo || ((i.tipo || 'Imóvel')+' em '+(i.bairro || '')))+'</Title>\n';
      xml += '      <TransactionType>'+transacaoQA+'</TransactionType>\n';
      xml += '      <PublicationType>STANDARD</PublicationType>\n';
      xml += '      <Created_at>'+esc(i.createdAt || i.dataCadastro || '')+'</Created_at>\n';
      xml += '      <Updated_at>'+esc(i.lastUpdate || i.updatedAt || i.ultimaAtualizacao || '')+'</Updated_at>\n';
      xml += '      <DetailViewUrl>'+esc(i.url || i.link || '')+'</DetailViewUrl>\n';
      xml += '      <VirtualTourLink>'+esc(i.tourVirtual || '')+'</VirtualTourLink>\n';
      xml += '      <Details>\n';
      const _usageType = i.condicao === 'lancamento' ? 'Launch' : i.condicao === 'novo' ? 'New' : 'Residential';
      xml += '        <UsageType>'+_usageType+'</UsageType>\n';
      xml += '        <PropertyType>'+esc(i.tipo || 'Apartamento')+'</PropertyType>\n';
      xml += '        <Description>'+esc(i.descricao || '')+'</Description>\n';
      xml += '        <ListPrice currency="BRL">'+(i.valor_imovel || i.valor || 0)+'</ListPrice>\n';
      xml += '        <LotArea unit="square metres">'+(i.area_total || i.area_m2 || 0)+'</LotArea>\n';
      xml += '        <UnitFloor>'+esc(i.andar || '')+'</UnitFloor>\n';
      xml += '        <LivingArea unit="square metres">'+(i.area_m2 || i.area || 0)+'</LivingArea>\n';
      xml += '        <PropertyAdministrationFee currency="BRL">'+(i.condominio || 0)+'</PropertyAdministrationFee>\n';
      xml += '        <YearlyTax currency="BRL">'+(i.iptu || 0)+'</YearlyTax>\n';
      xml += '        <Bedrooms>'+(i.quartos || 0)+'</Bedrooms>\n';
      xml += '        <Bathrooms>'+(i.banheiros || 0)+'</Bathrooms>\n';
      xml += '        <Room>'+(i.salas || i.rooms || 1)+'</Room>\n';
      xml += '        <Suites>'+(i.suites || 0)+'</Suites>\n';
      xml += '        <Garage>'+(i.vagas || 0)+'</Garage>\n';
      xml += '        <YearBuilt>'+esc(i.anoContrucao || i.anoConstrucao || i.ano_construcao || '')+'</YearBuilt>\n';
      xml += '        <Phase>'+esc(i.fase || '')+'</Phase>\n';
      xml += '        <AcceptsFinancing>'+(i.aceitaFinanciamento || i.aceita_financiamento || 'a_combinar')+'</AcceptsFinancing>\n';
      xml += '        <AcceptsExchange>'+(i.aceitaPermuta || i.aceita_permuta || 'nao')+'</AcceptsExchange>\n';
      xml += '        <SolarPosition>'+esc(i.posicaoSolar || i.posicao_solar || '')+'</SolarPosition>\n';
      xml += '        <TotalFloors>'+(i.totalAndares || i.total_andares || 0)+'</TotalFloors>\n';
      xml += '        <UnitsPerFloor>'+(i.unidadesPorAndar || i.unidades_por_andar || 0)+'</UnitsPerFloor>\n';
      xml += '        <BuiltArea unit="square metres">'+(i.area_construida || i.areaConstruida || 0)+'</BuiltArea>\n';
      if (i.diferenciais && i.diferenciais.length) {
        xml += '        <Features>\n';
        i.diferenciais.forEach(d => { xml += '          <Feature>'+esc(d)+'</Feature>\n'; });
        xml += '        </Features>\n';
      }
      xml += '      </Details>\n';
      xml += '      <Media>\n';
      if (i.tourVirtual) xml += '        <Item medium="video">'+esc(i.tourVirtual)+'</Item>\n';
      fotos.forEach((f, idx) => {
        let url = typeof f === 'string' ? f : f.url;
        if (url && url.startsWith('/')) url = 'https://matchimoveis.ia.br' + url;
        xml += '        <Item medium="image" caption="foto'+(idx+1)+'" primary="'+(idx===0?'true':'false')+'">'+esc(url)+'</Item>\n';
      });
      xml += '      </Media>\n';
      xml += '      <Location>\n';
      xml += '        <Country abbreviation="BR">Brasil</Country>\n';
      xml += '        <State abbreviation="'+(i.estado||'SP').toUpperCase()+'">'+esc(i.estado||'São Paulo')+'</State>\n';
      xml += '        <City>'+esc(i.cidade || 'São Paulo')+'</City>\n';
      xml += '        <Neighborhood>'+esc(i.bairro || '')+'</Neighborhood>\n';
      xml += '        <Address>'+esc(i.endereco || i.logradouro || '')+'</Address>\n';
      xml += '        <StreetNumber>'+esc(i.numero || '')+'</StreetNumber>\n';
      xml += '        <Complement>'+esc(i.complemento || '')+'</Complement>\n';
      xml += '        <PostalCode>'+esc(String(i.cep || '').replace(/\\D/g,''))+'</PostalCode>\n';
      xml += '        <Latitude>'+esc(i.latitude || '')+'</Latitude>\n';
      xml += '        <Longitude>'+esc(i.longitude || '')+'</Longitude>\n';
      xml += '        <AddresType>Rua</AddresType>\n';
      xml += '        <Floor>'+esc(i.andar || '')+'</Floor>\n';
      xml += '        <Tower>'+esc(i.torre || '')+'</Tower>\n';
      xml += '        <Unity>'+esc(i.unidade || '')+'</Unity>\n';
      xml += '        <CondominiumName>'+esc(i.condominioNome || i.condominio_name || '')+'</CondominiumName>\n';
      xml += '      </Location>\n';
      xml += '      <ContactInfo>\n';
      xml += '        <Name>'+esc(i.corretor_nome || i.usuario_nome || (user&&user.nome) || 'Corretor')+'</Name>\n';
      xml += '        <Email>'+esc(i.corretor_email || i.usuario_email || (user&&user.email) || '')+'</Email>\n';
      xml += '        <Website>'+esc((user&&user.website)||'https://matchimoveis.ia.br')+'</Website>\n';
      xml += '        <Logo></Logo>\n';
      xml += '        <OfficeName>'+esc(i.corretor_nome || i.usuario_nome || (user&&user.nome) || 'Corretor')+'</OfficeName>\n';
      xml += '        <Telephone>'+esc(i.corretor_telefone || i.usuario_telefone || (user&&(user.celular||user.telefone)) || '')+'</Telephone>\n';
      xml += '      </ContactInfo>\n';
      xml += '      <OwnerInfo>\n';
      xml += '        <Name>'+esc(prop.nome || i.proprietarioNome || '')+'</Name>\n';
      xml += '        <Email>'+esc(prop.email || i.proprietarioEmail || '')+'</Email>\n';
      xml += '        <Telephone>'+esc(prop.telefone || prop.celular || i.proprietarioTelefone || '')+'</Telephone>\n';
      xml += '      </OwnerInfo>\n';
      xml += '      <Broker>\n';
      xml += '        <BrokerName>'+esc(i.corretorNome || '')+'</BrokerName>\n';
      xml += '        <BrokerEmail>'+esc(i.corretorEmail || '')+'</BrokerEmail>\n';
      xml += '        <BrokerTelephone>'+esc(i.corretorTelefone || '')+'</BrokerTelephone>\n';
      xml += '      </Broker>\n';
      xml += '    </Listing>\n';
    });

    xml += '  </Listings>\n</ListingDataFeed>\n';
    return xml;
  }

  const esc = v => String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync"\n';
  xml += '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
  xml += '  xsi:schemaLocation="http://www.vivareal.com/schemas/1.0/VRSync http://xml.vivareal.com/vrsync.xsd">\n';
  xml += '  <Header>\n';
  xml += '    <Provider>Matchimoveis</Provider>\n';
  xml += '    <Email>contato@matchimoveis.ia.br</Email>\n';
  xml += '    <PublishDate>'+new Date().toISOString()+'</PublishDate>\n';
  xml += '  </Header>\n';
  xml += '  <Listings>\n';

  imoveis.forEach(i => {
    const prop = (i.proprietario && typeof i.proprietario === 'object') ? i.proprietario : {};
    const fotos = Array.isArray(i.fotos) ? i.fotos : [];
    const transacao = i.transacao === 'aluguel' ? 'For Rent' : 'For Sale';
    const usageType = (i.tipo||'').toLowerCase().match(/sala|loja|galpao|galpão|comercial|escritorio|escritório|ponto/) ? 'Commercial' : 'Residential';
    xml += '\n    <Listing>\n';
    xml += '      <ListingID>'+esc(i.id_interno || i.idInterno || i.idExterno || i.idOriginal || i.id)+'</ListingID>\n';
    xml += '      <Title><![CDATA['+( i.titulo || ((i.tipo||'Imóvel')+' em '+(i.bairro||'')))+']]></Title>\n';
    xml += '      <TransactionType>'+transacao+'</TransactionType>\n';
    xml += '      <PublicationType>STANDARD</PublicationType>\n';
    xml += '      <DetailViewUrl>'+esc(i.url || i.urlPublica || i.url_publica || '')+'</DetailViewUrl>\n';
    xml += '      <VirtualTourLink>'+esc(i.tourVirtual || i.tour_virtual || '')+'</VirtualTourLink>\n';
    xml += '      <Details>\n';
    xml += '        <UsageType>'+usageType+'</UsageType>\n';
    xml += '        <PropertyType>'+esc(i.tipo || 'Apartamento')+'</PropertyType>\n';
    xml += '        <Description><![CDATA['+( i.descricao || '')+']]></Description>\n';
    xml += '        <ListPrice currency="BRL">'+(i.valor_imovel || i.valor || 0)+'</ListPrice>\n';
    if(transacao === 'For Rent') xml += '        <RentalPrice currency="BRL">'+(i.valor_imovel || i.valor || 0)+'</RentalPrice>\n';
    xml += '        <Iptu currency="BRL" period="Yearly">'+(i.iptu || 0)+'</Iptu>\n';
    xml += '        <PropertyAdministrationFee currency="BRL">'+(i.condominio || 0)+'</PropertyAdministrationFee>\n';
    xml += '        <LivingArea unit="square metres">'+(i.area_m2 || i.area || 0)+'</LivingArea>\n';
    xml += '        <LotArea unit="square metres">'+(i.area_total || i.area_m2 || 0)+'</LotArea>\n';
    xml += '        <BuiltArea unit="square metres">'+(i.area_construida || 0)+'</BuiltArea>\n';
    xml += '        <Bedrooms>'+(i.quartos || 0)+'</Bedrooms>\n';
    xml += '        <Bathrooms>'+(i.banheiros || 0)+'</Bathrooms>\n';
    xml += '        <Suite>'+(i.suites || 0)+'</Suite>\n';
    xml += '        <Garage>'+(i.vagas || 0)+'</Garage>\n';
    xml += '        <YearBuilt>'+esc(i.anoConstrucao || i.anoContrucao || i.ano_construcao || '')+'</YearBuilt>\n';
    xml += '        <TotalFloors>'+(i.totalAndares || i.total_andares || 0)+'</TotalFloors>\n';
    xml += '        <UnitFloor>'+esc(i.andar || '')+'</UnitFloor>\n';
    xml += '        <AcceptsFinancing>'+esc(i.aceitaFinanciamento || i.aceita_financiamento || 'a_combinar')+'</AcceptsFinancing>\n';
    xml += '        <AcceptsExchange>'+esc(i.aceitaPermuta || i.aceita_permuta || 'nao')+'</AcceptsExchange>\n';
    if (i.diferenciais && i.diferenciais.length) {
      xml += '        <Features>\n';
      i.diferenciais.forEach(d => { xml += '          <Feature>'+esc(d)+'</Feature>\n'; });
      xml += '        </Features>\n';
    }
    xml += '      </Details>\n';
    xml += '      <Media>\n';
    if (i.tourVirtual) xml += '        <Item medium="video">'+esc(i.tourVirtual)+'</Item>\n';
    fotos.forEach((f, idx) => {
      const url = typeof f === 'string' ? f : (f.url || '');
      if(url) xml += '        <Item medium="image" caption="foto'+(idx+1)+'" primary="'+(idx===0?'true':'false')+'">'+esc(url)+'</Item>\n';
    });
    xml += '      </Media>\n';
    xml += '      <Location>\n';
    xml += '        <Country abbreviation="BR">Brasil</Country>\n';
    xml += '        <State abbreviation="'+esc((i.estado||'SP').toUpperCase())+'"><![CDATA['+( i.estado||'SP')+']]></State>\n';
    xml += '        <City><![CDATA['+( i.cidade||'')+']]></City>\n';
    xml += '        <Neighborhood><![CDATA['+( i.bairro||'')+']]></Neighborhood>\n';
    xml += '        <Address><![CDATA['+( i.endereco || i.logradouro ||'')+']]></Address>\n';
    xml += '        <StreetNumber>'+esc(i.numero || '')+'</StreetNumber>\n';
    xml += '        <Complement>'+esc(i.complemento || '')+'</Complement>\n';
    xml += '        <PostalCode>'+esc(String(i.cep||'').replace(/\D/g,''))+'</PostalCode>\n';
    xml += '        <Latitude>'+esc(i.latitude || '')+'</Latitude>\n';
    xml += '        <Longitude>'+esc(i.longitude || '')+'</Longitude>\n';
    xml += '      </Location>\n';
    xml += '      <ContactInfo>\n';
    xml += '        <Name>'+esc(i.corretor_nome || i.usuario_nome || (user&&user.nome) || 'Corretor')+'</Name>\n';
    xml += '        <Email>'+esc(i.corretor_email || i.usuario_email || (user&&user.email) || '')+'</Email>\n';
    xml += '        <Website>'+esc((user&&user.website)||'https://matchimoveis.ia.br')+'</Website>\n';
    xml += '        <Telephone>'+esc(i.corretor_telefone || i.usuario_telefone || (user&&(user.celular||user.telefone)) || '')+'</Telephone>\n';
    xml += '      </ContactInfo>\n';
    xml += '    </Listing>\n';
  });

  xml += '  </Listings>\n</ListingDataFeed>';
  return xml;
}



app.get('/app/portais', auth, async (req,res)=>{
  const portais = ['olx','zap','vivareal','chaves','imovelweb','123i','quintoandar'];
  const token = req.session.user.id.replace(/[^a-z0-9]/gi,'-');
  const { query: _qp } = require('./services/db');
  const pgFeeds = await _qp('SELECT portal, url, total, last_sync_at FROM xml_feeds WHERE user_id=$1 AND ativo=true', [req.session.user.id]).catch(()=>({rows:[]}));
  const pgMap = {};
  pgFeeds.rows.forEach(r => { pgMap[r.portal] = r; });
  const xmlFeeds = portais.map(portal => {
    const filename = 'feed-'+portal+'-'+token+'.xml';
    const filepath = dataPath(filename);
    const pgEntry = pgMap[portal];
    let existe = false, total = 0, geradoEm = null, url = '/'+filename;
    if(pgEntry){ existe = true; total = pgEntry.total||0; geradoEm = pgEntry.last_sync_at ? new Date(pgEntry.last_sync_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) : null; url = pgEntry.url||url; }
    else if(fs.existsSync(filepath)){ existe = true; const stat = fs.statSync(filepath); geradoEm = new Date(stat.mtime).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}); const conteudo = fs.readFileSync(filepath,'utf8'); total = (conteudo.match(/<[Ll]isting>/g)||[]).length; }
    return { portal, filename, url, existe, total, geradoEm };
  });
  res.render('app-portais', { user: req.session.user, xmlFeeds });
});

// Limpar descrições de imóveis de uma conta
// Diagnostico descricoes
// Limpar descricoes
// Reativar todos imóveis de uma conta
// Backup leads por conta
// Backup de imóveis por conta
// Página de upload XML
// Antes sem auth: userId vinha de ?userId= na URL (controlado pelo visitante,
// sem checar sessão) — dava pra importar/sobrescrever XML na conta de
// QUALQUER corretor, e o mesmo valor ainda era refletido sem escapar no HTML
// (XSS). Agora exige sessão e usa só o usuário logado.
app.get('/app/importar-xml-upload', auth, (req, res) => {
  const userId = req.session.user.codigoUsuario || req.session.user.id;
  const nomeExibicao = req.session.user.nome || userId;
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Importar XML</title>
  <style>body{font-family:Arial;max-width:500px;margin:60px auto;padding:20px}
  h2{color:#ff385c}input,button{width:100%;padding:12px;margin:8px 0;border-radius:8px;border:1px solid #ddd;font-size:15px}
  button{background:#ff385c;color:white;border:none;cursor:pointer;font-weight:700}
  .msg{padding:12px;border-radius:8px;margin-top:12px}</style></head>
  <body><h2>📥 Importar XML</h2>
  <p>Conta: <strong>${_escapeHtml(nomeExibicao)}</strong></p>
  <form id="f" enctype="multipart/form-data">
    <input type="file" name="arquivo" accept=".xml" required>
    <button type="submit">Importar XML</button>
  </form>
  <div id="msg"></div>
  <script>
    document.getElementById('f').onsubmit = async function(e){
      e.preventDefault();
      document.getElementById('msg').innerHTML = '<div class="msg" style="background:#fff3cd">⏳ Importando, aguarde...</div>';
      const fd = new FormData(this);
      const r = await fetch('/app/importar-xml-upload', {method:'POST',body:fd});
      const d = await r.json();
      document.getElementById('msg').innerHTML = d.ok
        ? '<div class="msg" style="background:#d4edda">✅ '+d.mensagem+'</div>'
        : '<div class="msg" style="background:#f8d7da">❌ '+d.erro+'</div>';
    };
  </script></body></html>`);
});

// Upload de XML local
app.post('/app/importar-xml-upload', auth, async (req, res) => {
  const upload2 = require('multer')({ dest: dataPath('uploads/') });
  upload2.single('arquivo')(req, res, async (err) => {
    if(err) return res.json({ ok: false, erro: err.message });
    if(!req.file) return res.json({ ok: false, erro: 'Nenhum arquivo enviado' });
    const userId = req.session.user.codigoUsuario || req.session.user.id;
    try {
      const xmlPath = req.file.path;
      const { criarJob: _cjX3 } = require('./services/importJobs');
      const { dispararWorkerXml: _dwX3 } = require('./services/workerDispatch');
      const _jobIdX3 = await _cjX3('xml', userId, xmlPath);
      _dwX3(_jobIdX3, xmlPath, userId);
      // Não apagar o arquivo aqui — o worker roda em background e ainda vai lê-lo;
      // apagar na hora causava "Arquivo não encontrado" dentro do worker (import
      // falhava silenciosamente mesmo com essa resposta dizendo sucesso). A limpeza
      // agora é feita pelo próprio worker depois que termina de importar.
      res.json({ ok: true, mensagem: 'XML importado com sucesso!' });
    } catch(e) {
      res.json({ ok: false, erro: e.message });
    }
  });
});

// Removido middleware "AUTO LOGIN ADMIN": criava req.session.user fake
// (tipo:'admin') pra QUALQUER request sem sessão que batesse em /admin/*,
// mesmo uma rota inexistente (404). Esse session.user fake passava livre
// pelo middleware `auth` (só checa se session.user existe) e fazia
// filtrarPorUsuario() devolver a base inteira sem filtro (user.tipo==='admin'
// → bypass). Resultado: 1 request anônima a qualquer /admin/... e navegação
// normal em /app/* vazava leads/imóveis/visitas de TODOS os corretores.
// A autenticação real de admin é via authAdmin (req.session.admin), que
// nunca dependeu desse middleware — nenhuma rota legítima usava session.user
// aqui (confirmado: tipo:'admin' só era atribuído neste bloco removido).


// ROTA TEMPORÁRIA — zerar visitas e notificações
// ADMIN — Zerar visitas por userId
// ADMIN — Zerar notificações por userId
// ADMIN — Zerar tudo por userId
// Página confirmação de presença do lead










// Match Coins

// ── MERCADO PAGO ─────────────────────────────────────────────────────────────
// Pix no Brasil exige o CPF do pagador (identificação obrigatória em
// transações Pix) — sem `payer.identification` na preferência, o botão
// "Criar Pix" do Checkout Pro fica travado/inativo (o campo de CPF nem
// aparece pro comprador preencher). Helpers reaproveitados em toda criação
// de preferência (/pagamento/criar, /pagamento/criar-plano, /demanda/comprar).
function _limparCpf(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}
function _cpfValido(cpf) {
  const c = _limparCpf(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(c[i], 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(c[9], 10)) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(c[i], 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === parseInt(c[10], 10);
}
function _montarPayerMP(nome, email, cpf) {
  const payer = { name: nome || '', email: email || '' };
  if (_cpfValido(cpf)) payer.identification = { type: 'CPF', number: _limparCpf(cpf) };
  return payer;
}
app.post('/pagamento/criar', auth, express.json(), async (req, res) => {
  try {
    const { valor } = req.body;
    const user = req.session.user;
    if(!valor || Number(valor) < 50) return res.json({ok:false, erro:'Valor mínimo R$ 50'});

    const preference = new Preference(_mpClient);
    const BASE = process.env.RENDER ? 'https://matchimoveis.onrender.com' : 'http://localhost:3000';

    // CPF direto do banco (não confia só na sessão, que pode estar
    // desatualizada se o usuário preencheu o CPF no perfil depois de logar)
    // — sem ele, o Pix do Checkout Pro fica travado (ver nota acima).
    let _cpfAtual = user.cpf || '';
    try {
      const { query: _qCpf1 } = require('./services/db');
      const _rCpf1 = await _qCpf1('SELECT cpf FROM usuarios WHERE codigo_usuario=$1', [user.codigoUsuario || user.codigo || user.id]);
      if (_rCpf1.rows[0]?.cpf) _cpfAtual = _rCpf1.rows[0].cpf;
    } catch (eCpf1) {}

    const result = await preference.create({
      body: {
        items: [{
          title: 'Créditos MatchImóveis',
          quantity: 1,
          unit_price: Number(valor),
          currency_id: 'BRL'
        }],
        payer: _montarPayerMP(user.nome, user.email, _cpfAtual),
        back_urls: {
          success: BASE + '/pagamento/sucesso',
          failure: BASE + '/app/coins',
          pending: BASE + '/app/coins'
        },
        auto_return: 'approved',
        notification_url: BASE + '/webhook/mercadopago',
        payment_methods: {
          excluded_payment_types: [
            { id: 'ticket' }
          ]
        },
        metadata: {
          userId: user.codigoUsuario || user.codigo || user.id,
          valor: Number(valor),
          creditos: Math.floor(Number(valor) * 20)
        }
      }
    });

    res.json({ ok: true, url: result.init_point, id: result.id });
  } catch(e) {
    console.error('[MP] erro criar preferencia:', e.message);
    res.json({ ok: false, erro: e.message });
  }
});

// Combos "leads garantidos" (100/200/300) — na prática é recarga de coins com
// bônus: mesma taxa da recarga avulsa (valor×20, igual /pagamento/criar) mais
// 35% de bônus. Ex: R$400 → 400×20=8.000 base ×1,35 = 10.800 coins. Não é uma
// entrega de lead de verdade — é crédito suficiente pra cobrir ações da
// plataforma (match, qualificação IA, vitrine etc) na faixa de cada combo.
const PLANOS_LEADS = {
  '100': { qtd: 100, valor: 400, creditos: 10800, label: '100 leads/mês' },
  '200': { qtd: 200, valor: 700, creditos: 18900, label: '200 leads/mês' },
  '300': { qtd: 300, valor: 1000, creditos: 27000, label: '300 leads/mês' },
  // Combo de entrada (bônus menor: 25% em vez dos 35% dos combos acima).
  // R$200×20=4.000 base ×1,25 = 5.000 coins.
  'r200': { qtd: 50, valor: 200, creditos: 5000, label: '50 leads/mês' },
  // Plano ilimitado — quando a busca em /demanda encontra mais que o topo
  // dos combos fechados (300), não faz sentido oferecer um combo fixo que
  // não cobre tudo; qtd:0 aqui tem o mesmo significado usado em
  // buscarDemandaParaEntrega (limite<=0 = sem limite) — entrega TODOS os
  // leads encontrados na busca, não só até 300.
  // R$2.000×20=40.000 base ×1,35 = 54.000 coins (mesmo bônus dos combos 100/200/300).
  'ilimitado': { qtd: 0, ilimitado: true, valor: 2000, creditos: 54000, label: 'Leads ilimitados/mês' }
};

app.post('/pagamento/criar-plano', auth, express.json(), async (req, res) => {
  try {
    const plano = String(req.body.plano || '');
    const pacote = PLANOS_LEADS[plano];
    if (!pacote) return res.json({ ok: false, erro: 'Plano inválido' });
    const user = req.session.user;
    const userId = user.codigoUsuario || user.codigo || user.id;

    const preference = new Preference(_mpClient);
    const BASE = process.env.RENDER ? 'https://matchimoveis.onrender.com' : 'http://localhost:3000';
    const _origemCoins = (req.headers.referer || '').includes('/app/coins');
    const _voltaPara = _origemCoins ? '/app/coins' : '/app/perfil';

    let _cpfAtual2 = user.cpf || '';
    try {
      const { query: _qCpf2 } = require('./services/db');
      const _rCpf2 = await _qCpf2('SELECT cpf FROM usuarios WHERE codigo_usuario=$1', [userId]);
      if (_rCpf2.rows[0]?.cpf) _cpfAtual2 = _rCpf2.rows[0].cpf;
    } catch (eCpf2) {}

    const result = await preference.create({
      body: {
        items: [{
          title: `${pacote.label} (${pacote.creditos} créditos) — MatchImóveis`,
          quantity: 1,
          unit_price: pacote.valor,
          currency_id: 'BRL'
        }],
        payer: _montarPayerMP(user.nome, user.email, _cpfAtual2),
        back_urls: {
          success: BASE + '/pagamento/sucesso-plano?voltar=' + encodeURIComponent(_voltaPara),
          failure: BASE + _voltaPara,
          pending: BASE + _voltaPara
        },
        auto_return: 'approved',
        notification_url: BASE + '/webhook/mercadopago',
        payment_methods: { excluded_payment_types: [{ id: 'ticket' }] },
        metadata: { userId, tipo: 'plano_leads', plano, qtd: pacote.qtd || 0, label: pacote.label, valor: pacote.valor, creditos: pacote.creditos }
      }
    });

    res.json({ ok: true, url: result.init_point, id: result.id });
  } catch(e) {
    console.error('[MP] erro criar preferencia plano_leads:', e.message);
    res.json({ ok: false, erro: e.message });
  }
});

app.get('/pagamento/sucesso-plano', auth, async (req, res) => {
  const _destino = req.query.voltar === '/app/coins' ? '/app/coins' : '/app/perfil';
  res.redirect(_destino + '?planoSucesso=1');
});

app.post('/pagamento/processar', auth, express.json(), async (req, res) => {
  try {
    const payment = new Payment(_mpClient);
    const result = await payment.create({ body: req.body });
    const userId = req.session.user?.codigoUsuario || req.session.user?.codigo;
    const valor = result.transaction_amount || 0;
    const creditos = Math.floor(valor * 20);
    if(result.status === 'approved' && creditos > 0){
      const { tentarMarcarProcessado } = require('./services/salvarPagamentoMP');
      const _primeiraVez = await tentarMarcarProcessado(result.id);
      if(_primeiraVez){
        await adicionarCreditos(userId, creditos, 'recarga_mp');
        criarNotificacaoService({
          id: Date.now().toString(),
          tipo: 'recarga',
          titulo: 'Recarga aprovada',
          mensagem: creditos + ' créditos adicionados',
          usuarioId: userId,
          lida: false,
          criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
        });
        await _processarBonusIndicacao(userId, creditos);
      } else {
        console.log('[MP] pagamento já processado antes, ignorando duplicata:', result.id);
      }
    }
    res.json({ status: result.status, id: result.id });
  } catch(e) {
    console.error('[MP] processar erro:', e.message);
    res.json({ status: 'error', erro: e.message });
  }
});

app.get('/pagamento/sucesso', auth, async (req, res) => {
  res.redirect('/app/coins?sucesso=1');
});

// Bônus de indicação: 10% dos créditos comprados vão pro indicador, sempre que o indicado recarrega
async function _processarBonusIndicacao(userId, creditosComprados) {
  try {
    const comprador = (_cacheUsuarios || []).find(u => (u.codigoUsuario || u.id) === userId);
    if (!comprador || !comprador.indicadoPor) return;
    const indicadorCodigo = comprador.indicadoPor;
    const indicador = (_cacheUsuarios || []).find(u => (u.codigoUsuario || u.id) === indicadorCodigo);
    if (!indicador) return;
    const bonus = Math.floor(creditosComprados * 0.10);
    if (bonus <= 0) return;
    await adicionarCreditos(indicadorCodigo, bonus, 'bonus_indicacao');
    const { registrarBonus } = require('./services/salvarIndicacao');
    await registrarBonus({ indicadorCodigo, indicadoCodigo: userId, valorCompraCoins: creditosComprados, bonusCoins: bonus });
    criarNotificacaoService({
      id: Date.now().toString(),
      tipo: 'indicacao_bonus',
      titulo: '🎁 Bônus de indicação!',
      mensagem: (comprador.nome || 'Seu indicado') + ' comprou ' + creditosComprados + ' créditos — você ganhou ' + bonus + ' de bônus!',
      usuarioId: indicadorCodigo,
      lida: false,
      criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
    });
  } catch(e) { console.error('[bonus-indicacao]', e.message); }
}

app.post('/webhook/mercadopago', express.json(), async (req, res) => {
  try {
    const { type, data } = req.body;
    if(type !== 'payment') return res.sendStatus(200);

    const payment = new Payment(_mpClient);
    const pagamento = await payment.get({ id: data.id });

    if(pagamento.status !== 'approved') return res.sendStatus(200);

    const { tentarMarcarProcessado } = require('./services/salvarPagamentoMP');
    const _primeiraVez = await tentarMarcarProcessado(data.id);
    if(!_primeiraVez){
      console.log('[MP webhook] pagamento já processado antes, ignorando reenvio:', data.id);
      return res.sendStatus(200);
    }

    const meta = pagamento.metadata || {};
    console.log('[MP webhook] metadata:', JSON.stringify(meta), '| status:', pagamento.status, '| valor:', pagamento.transaction_amount);
    const userId = meta.user_id || meta.userId || '';

    if (meta.tipo === 'plano_leads') {
      const qtd = parseInt(meta.qtd) || 0;
      const label = meta.label || (qtd ? `${qtd} leads/mês` : 'Combo de créditos');
      const valor = parseFloat(meta.valor) || pagamento.transaction_amount || 0;
      const creditos = parseInt(meta.creditos) || 0;
      if (userId && creditos > 0) {
        await adicionarCreditos(userId, creditos, 'combo_leads_promo');
        const { atualizarUsuario: _auPlano } = require('./services/salvarUsuario');
        await _auPlano(userId, {
          planoLeadsAtivo: meta.plano || '',
          planoLeadsQtd: qtd,
          planoLeadsLabel: label,
          planoLeadsValor: valor,
          planoLeadsCreditos: creditos,
          planoLeadsComprasEm: new Date().toISOString(),
          // Libera o resto da plataforma pra contas que ainda estavam presas no
          // gate obrigatório de compra (campanha de leads garantidos) — não
          // afeta quem não tinha essa pendência (fica undefined/ignorado).
          precisaComprarPlano: false
        });
        if (_cacheUsuarios) { const _uIdxPlano = _cacheUsuarios.findIndex(u => u.id === userId); if (_uIdxPlano >= 0) _cacheUsuarios[_uIdxPlano].precisaComprarPlano = false; }
        console.log('[MP] combo leads garantidos — creditos adicionados:', userId, '| creditos:', creditos, '| label:', label, '| valor:', valor);
        criarNotificacaoService({
          id: Date.now().toString(),
          tipo: 'recarga',
          titulo: 'Combo de leads ativado! 🎉',
          mensagem: `${creditos} créditos adicionados (${label}).`,
          usuarioId: userId,
          lida: false,
          criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
        });
        await _processarBonusIndicacao(userId, creditos);
        (async () => {
          try {
            const _msgAdmin = `💰 *Combo de leads garantidos contratado!*\n\n👤 *Usuário:* ${userId}\n📦 *Combo:* ${label}\n🪙 *Créditos:* ${creditos}\n💵 *Valor:* R$ ${valor}\n⏰ ${new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`;
            await fetch('https://match-evolution-api.onrender.com/message/sendText/match-suporte', {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': 'match2025evolution' },
              body: JSON.stringify({ number: '5511951131609', text: _msgAdmin })
            });
          } catch(e) { console.error('[MP] erro notif admin plano_leads:', e.message); }
        })();
      }
      return res.sendStatus(200);
    }

    // Combo comprado a partir de /demanda (POST /demanda/comprar) — além dos
    // créditos (igual plano_leads), entrega de verdade até `qtd` interessados
    // reais (nome/telefone/email sem máscara) achados com os critérios da
    // busca direto na conta recém-criada do comprador — "quando ele comprar
    // as leads já vão para a conta dele".
    if (meta.tipo === 'combo_demanda') {
      const qtd = parseInt(meta.qtd) || 0;
      const label = meta.label || (qtd ? `${qtd} leads/mês` : 'Combo de créditos');
      const valor = parseFloat(meta.valor) || pagamento.transaction_amount || 0;
      const creditos = parseInt(meta.creditos) || 0;
      let entreguesQtd = 0;
      if (userId) {
        try {
          const { buscarDemandaParaEntrega } = require('./services/buscaDemanda');
          const { salvarLead: _salvarLeadDemanda } = require('./services/salvarLead');
          let pares = [], transacoes = [];
          try { pares = JSON.parse(meta.pares || '[]'); } catch(e2) {}
          try { transacoes = JSON.parse(meta.transacoes || '[]'); } catch(e2) {}
          const horas = parseInt(meta.horas) || 720;
          const encontrados = await buscarDemandaParaEntrega({ estado: meta.estado || '', pares, transacoes, horas, limite: qtd });

          for (const l of encontrados) {
            try {
              await _salvarLeadDemanda({
                id: 'DEMANDA-' + l._rowId + '-' + userId,
                nome: l.Nome || 'Interessado', telefone: l.Telefone, whatsapp: l.Telefone, email: l.Email,
                user_id: userId, userId, codigoUsuario: userId,
                origem: 'compra_demanda', status: 'novo', faseFunil: 'novo', fase_funil: 'novo',
                perfilIA: {
                  tipo: l.Tipo || '', intencao: l.Transacao === 'aluguel' ? 'alugar' : 'comprar',
                  cidade: l.Cidade, estado: l.Estado, bairro: l.Bairro, valorMax: l.Valor_max || undefined
                },
                dados: { origemCompraDemanda: true, dataOriginalPortal: l.criadoEm },
                _lote: true
              });
              entreguesQtd++;
            } catch (eLead) { console.error('[MP] erro ao entregar lead combo_demanda:', eLead.message); }
          }
        } catch (eDem) { console.error('[MP] erro ao entregar leads combo_demanda:', eDem.message); }

        if (creditos > 0) {
          await adicionarCreditos(userId, creditos, 'combo_demanda');
          const { atualizarUsuario: _auDemanda } = require('./services/salvarUsuario');
          // Guarda os critérios da busca + prazo de 30 dias da compra: se o
          // combo não cobriu tudo que foi encontrado (qtd < total), o job
          // diário de topupPlanoLeads.js continua entregando leads novas que
          // batem com esses mesmos critérios, debitando o custo normal de
          // nova_lead em créditos por cada uma — não é uma cota fixa, para
          // sozinho quando o crédito acabar ou vencer os 30 dias, o que vier
          // primeiro. Ver services/topupPlanoLeads.js.
          let _paresTopup = [], _transacoesTopup = [];
          try { _paresTopup = JSON.parse(meta.pares || '[]'); } catch(e3) {}
          try { _transacoesTopup = JSON.parse(meta.transacoes || '[]'); } catch(e3) {}
          await _auDemanda(userId, {
            planoLeadsAtivo: meta.plano || '', planoLeadsQtd: qtd, planoLeadsLabel: label,
            planoLeadsValor: valor, planoLeadsCreditos: creditos, planoLeadsComprasEm: new Date().toISOString(),
            planoLeadsCriterios: { estado: meta.estado || '', pares: _paresTopup, transacoes: _transacoesTopup },
            planoLeadsEntreguesQtd: entreguesQtd,
            planoLeadsExpiraEm: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            precisaComprarPlano: false
          });
          if (_cacheUsuarios) { const _uIdxDem = _cacheUsuarios.findIndex(u => u.id === userId); if (_uIdxDem >= 0) _cacheUsuarios[_uIdxDem].precisaComprarPlano = false; }
        }
        console.log('[MP] combo demanda — leads entregues:', userId, '| entregues:', entreguesQtd, '/', qtd, '| creditos:', creditos);
        criarNotificacaoService({
          id: Date.now().toString(),
          tipo: 'recarga',
          titulo: 'Combo comprado! 🎉',
          mensagem: `${entreguesQtd} lead${entreguesQtd===1?'':'s'} da sua busca já ${entreguesQtd===1?'está':'estão'} na sua conta, mais ${creditos} créditos (${label}).`,
          usuarioId: userId,
          lida: false,
          criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
        });
        (async () => {
          try {
            const _msgAdmin = `💰 *Combo comprado via /demanda!*\n\n👤 *Usuário:* ${userId}\n📦 *Combo:* ${label}\n📇 *Leads entregues:* ${entreguesQtd}${qtd ? '/' + qtd : ' (ilimitado)'}\n🪙 *Créditos:* ${creditos}\n💵 *Valor:* R$ ${valor}\n⏰ ${new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`;
            await fetch('https://match-evolution-api.onrender.com/message/sendText/match-suporte', {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': 'match2025evolution' },
              body: JSON.stringify({ number: '5511951131609', text: _msgAdmin })
            });
          } catch(e) { console.error('[MP] erro notif admin combo_demanda:', e.message); }
        })();
      }
      return res.sendStatus(200);
    }

    const creditos = parseInt(meta.creditos) || Math.floor((pagamento.transaction_amount||0) * 20);

    if(userId && creditos > 0){
      await adicionarCreditos(userId, creditos, 'recarga_mp');
      console.log('[MP] créditos adicionados:', userId, creditos);
      criarNotificacaoService({
        id: Date.now().toString(),
        tipo: 'recarga',
        titulo: 'Recarga aprovada',
        mensagem: creditos + ' créditos adicionados à sua conta',
        usuarioId: userId,
        lida: false,
        criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
      });
      await _processarBonusIndicacao(userId, creditos);
    }
    res.sendStatus(200);
  } catch(e) {
    console.error('[MP] webhook erro:', e.message);
    res.sendStatus(200);
  }
});

// ── WEBHOOK META LEADS — leadgen de campanha Lead Ads nativa ────────────────
// GET: handshake de verificação exigido pelo Meta ao configurar o webhook no
// App Dashboard. POST: evento real toda vez que alguém preenche o formulário.
app.get('/webhook/meta-leads', (req, res) => {
  const verifyToken = process.env.META_ADS_WEBHOOK_VERIFY_TOKEN || 'matchimoveis-meta-leads';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

async function _processarLeadMeta({ leadgenId, formId, adId }) {
  try {
    const { buscarCampanhaPorLeadformId, buscarCampanhaPorAdId, incrementarLeadsRecebidos } = require('./services/salvarCampanhaMeta');
    let campanha = formId ? await buscarCampanhaPorLeadformId(formId) : null;
    if (!campanha && adId) campanha = await buscarCampanhaPorAdId(adId);
    if (!campanha) { console.warn('[meta-leads] campanha não encontrada pra leadform/ad:', formId, adId); return; }

    const users = (_cacheUsuarios || []);
    const dono = users.find(u => (u.codigoUsuario||u.codigo_usuario||u.id) === campanha.userId);
    if (!dono || !dono.metaAdsToken) { console.warn('[meta-leads] dono da campanha sem token Meta:', campanha.userId); return; }

    const { listarPaginas, buscarDadosLead } = require('./services/metaAds');
    const paginas = await listarPaginas(dono.metaAdsToken);
    const pagina = paginas.find(p => String(p.id) === String(campanha.pageId));
    if (!pagina) { console.warn('[meta-leads] página não encontrada:', campanha.pageId); return; }

    const dadosLead = await buscarDadosLead(leadgenId, pagina.access_token);

    const { salvarLead } = require('./services/salvarLead');
    const id = Date.now().toString();
    const lead = {
      id, nome: dadosLead.nome || '',
      telefone: _normTel(dadosLead.telefone), whatsapp: _normTel(dadosLead.telefone), contato: _normTel(dadosLead.telefone),
      email: dadosLead.email || '', origem: 'Meta Ads', origemEntrada: 'meta_ads_leadform',
      status: 'novo', faseFunil: 'novo', temperatura: 'frio', score: 0,
      userId: campanha.userId, codigoUsuario: campanha.userId,
      imovel_interesse: campanha.imovelId, imovelId: campanha.imovelId,
      perfilIA: {}, mensagens: [], matches: [], matchesAuto: [],
      timeline: [], eventos: [], followUps: [],
      criadoEm: new Date().toISOString(),
      dados: { origemEntrada: 'meta_ads_leadform', campanhaMetaId: campanha.id }
    };
    await salvarLead(lead);
    await incrementarLeadsRecebidos(campanha.id);
    consumir(campanha.userId, 'lead_meta_recebido').catch(e=>console.error('[creditos] lead_meta_recebido falhou:', e.message));

    const matchCore = require('./cerebro/match-core');
    await matchCore.processar({ lead, mensagem: '', canal: 'meta_ads', userId: campanha.userId });
    console.log('[meta-leads] lead criada + match rodado:', id, '| campanha:', campanha.id);
  } catch(e) { console.error('[meta-leads] erro ao processar lead:', e.message); }
}

app.post('/webhook/meta-leads', express.json(), async (req, res) => {
  res.sendStatus(200); // responde rápido — Meta reenvia se demorar ou der erro
  try {
    const entries = req.body.entry || [];
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'leadgen') continue;
        const { leadgen_id, form_id, ad_id } = change.value || {};
        if (leadgen_id) setImmediate(() => _processarLeadMeta({ leadgenId: leadgen_id, formId: form_id, adId: ad_id }));
      }
    }
  } catch(e) { console.error('[webhook meta-leads]', e.message); }
});

// Webhook do número Cloud API oficial (usado pelos disparos em /admin/disparos) —
// só trata resposta rápida "Não tenho imóvel" pra marcar opt-out. Endpoint novo,
// não existia nenhum recebendo mensagem desse número antes (diferente do
// /webhook/whatsapp, que é da Evolution API/WhatsApp pessoal dos corretores).
app.get('/webhook/whatsapp-cloud', (req, res) => {
  const verifyToken = process.env.META_WA_WEBHOOK_VERIFY_TOKEN || 'matchimoveis-wa-cloud';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook/whatsapp-cloud', express.json(), async (req, res) => {
  res.sendStatus(200); // responde rápido — Meta reenvia se demorar ou der erro
  try {
    const { marcarOptout } = require('./services/salvarDisparo');
    const { _normalizarTelefone } = require('./services/metaWhatsapp');
    const { salvarMensagem: _salvarMsgCloud } = require('./services/salvarWhatsappCloudMsg');
    const entries = req.body.entry || [];
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        const mensagens = change.value?.messages || [];
        const phoneNumberId = change.value?.metadata?.phone_number_id || null;
        const _contatosMap = {};
        (change.value?.contacts || []).forEach(c => { _contatosMap[c.wa_id] = c.profile?.name || ''; });
        for (const msg of mensagens) {
          const telefone = _normalizarTelefone(msg.from);
          const nomeContato = _contatosMap[msg.from] || null;
          // Grava TODA mensagem recebida (texto livre, botão, mídia etc) na
          // caixa de entrada do admin (/admin/whatsapp-cloud) — não só os
          // cliques de botão tratados abaixo.
          if (msg.type === 'text') {
            await _salvarMsgCloud({ phoneNumberId, telefone, nome: nomeContato, direcao: 'entrada', tipo: 'texto', texto: msg.text?.body || '', messageId: msg.id }).catch(()=>{});
          } else if (msg.type === 'button') {
            await _salvarMsgCloud({ phoneNumberId, telefone, nome: nomeContato, direcao: 'entrada', tipo: 'botao', texto: msg.button?.text || '', messageId: msg.id }).catch(()=>{});
          } else if (msg.type === 'audio') {
            // Baixa o áudio da Meta (a URL deles expira e exige token, não dá
            // pra tocar direto no navegador) e guarda uma cópia local servida
            // por /data-uploads-audio.
            (async () => {
              try {
                const { baixarMedia } = require('./services/metaWhatsapp');
                const { buffer, mimeType } = await baixarMedia(msg.audio.id, phoneNumberId);
                const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : 'audio';
                const nomeArq = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
                fs.writeFileSync(path.join(UPLOADS_AUDIO_DIR, nomeArq), buffer);
                await _salvarMsgCloud({ phoneNumberId, telefone, nome: nomeContato, direcao: 'entrada', tipo: 'audio', texto: '[áudio]', messageId: msg.id, midiaUrl: '/data-uploads-audio/' + nomeArq, midiaMime: mimeType }).catch(()=>{});
              } catch(e) {
                console.error('[whatsapp-cloud] erro baixando audio:', e.message);
                await _salvarMsgCloud({ phoneNumberId, telefone, nome: nomeContato, direcao: 'entrada', tipo: 'audio', texto: '[áudio — falha ao baixar]', messageId: msg.id }).catch(()=>{});
              }
            })();
          } else {
            await _salvarMsgCloud({ phoneNumberId, telefone, nome: nomeContato, direcao: 'entrada', tipo: msg.type || 'outro', texto: `[${msg.type || 'mídia'}]`, messageId: msg.id }).catch(()=>{});
          }
          if (msg.type !== 'button') continue;
          const texto = (msg.button?.text || '').trim().toLowerCase();
          if (texto === 'não tenho imóvel' || texto === 'nao tenho imovel') {
            await marcarOptout(telefone, 'whatsapp_botao_nao_tenho');
            console.log('[whatsapp-cloud] opt-out registrado:', telefone);
          } else if (texto === 'não tenho interesse' || texto === 'nao tenho interesse') {
            await marcarOptout(telefone, 'whatsapp_botao_nao_interesse');
            console.log('[whatsapp-cloud] opt-out registrado (leads garantidos):', telefone);
          } else if (texto === 'falar com humano') {
            console.log('[whatsapp-cloud] pedido de atendimento humano:', telefone);
            // Não dá pra usar botão de URL/call pro WhatsApp de suporte (Meta
            // bloqueia wa.me em botão de URL, e call button pede Calling API,
            // ver incidente anterior) — em vez disso o clique é resposta rápida,
            // chega aqui no webhook, e a gente avisa o suporte pra ligar/chamar
            // esse telefone e confirma pro lead que alguém vai chamar.
            (async () => {
              try {
                const _msgSuporte = `🆘 *Pedido de atendimento humano (campanha WhatsApp)*\n\n📱 *Telefone:* ${telefone}\n⏰ ${new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}\n\nChama esse número direto no WhatsApp.`;
                await fetch('https://match-evolution-api.onrender.com/message/sendText/match-suporte', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'apikey': 'match2025evolution' },
                  body: JSON.stringify({ number: '5511951131609', text: _msgSuporte })
                });
              } catch(e) { console.error('[whatsapp-cloud] erro notif suporte:', e.message); }
              try {
                const _msgAutoResposta = 'Recebemos seu pedido! Um atendente da MatchImóveis vai te chamar aqui mesmo em instantes. 🙂';
                const { enviarTexto } = require('./services/metaWhatsapp');
                await enviarTexto({ telefone, texto: _msgAutoResposta, phoneNumberId });
                await _salvarMsgCloud({ phoneNumberId, telefone, nome: nomeContato, direcao: 'saida', tipo: 'texto', texto: _msgAutoResposta }).catch(()=>{});
              } catch(e) { console.error('[whatsapp-cloud] erro auto-resposta humano:', e.message); }
            })();
          } else {
            console.log('[whatsapp-cloud] botão não reconhecido pra opt-out:', JSON.stringify(msg.button), '| telefone:', telefone);
          }
        }
        // Status de entrega (sent/delivered/read/failed) — o POST /messages só
        // confirma que a Meta aceitou o pedido, não que chegou de verdade no
        // aparelho. Esses eventos assíncronos são a única forma real de saber
        // — casados pelo message_id com a linha do contato em disparos_contatos
        // (visível na tela da campanha, coluna "Entrega").
        const statuses = change.value?.statuses || [];
        for (const st of statuses) {
          const { marcarEntregaPorMessageId } = require('./services/salvarDisparo');
          if (st.status === 'failed') {
            const msgErro = (st.errors && st.errors[0] && st.errors[0].title) || 'Falha na entrega';
            console.error('[whatsapp-cloud] FALHA DE ENTREGA:', JSON.stringify({ telefone: st.recipient_id, messageId: st.id, erros: st.errors }));
            marcarEntregaPorMessageId(st.id, 'failed', msgErro).catch(()=>{});
          } else {
            console.log('[whatsapp-cloud] status:', st.status, '| telefone:', st.recipient_id, '| messageId:', st.id);
            marcarEntregaPorMessageId(st.id, st.status, null).catch(()=>{});
          }
        }
      }
    }
  } catch(e) { console.error('[webhook whatsapp-cloud]', e.message); }
});

// ─── INBOX ADMIN — responder conversas dos números Cloud API (campanha) ────
// Os 2 números da campanha (+55 11 97860-0214 e +55 11 95665-5428) não têm
// inbox própria dentro da plataforma — antes só dava pra ver pelo WhatsApp
// Manager da Meta. Aqui lê/responde direto usando os mesmos serviços do
// disparo (services/metaWhatsapp.js enviarTexto/enviarAudio, dentro da
// janela de 24h). Lista e conversa fazem polling (5-6s) pra atualizar sozinho.
const _escHtmlWaCloud = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _linkifyWaCloud = s => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" style="color:inherit;text-decoration:underline">$1</a>');
const _uploadAudioMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Mensagem de follow-up (dispara dentro da janela de 24h pra quem respondeu
// uma campanha) — texto padrão só usado se ninguém salvou um customizado
// ainda (services/salvarDisparo.js: buscarFollowupMensagem/salvarFollowupMensagem,
// editável pela tela em /admin/whatsapp-cloud).
const _MSG_BOAS_VINDAS_PADRAO = `🎉 Você ganhou 1.000 créditos de bônus pra conhecer a MatchImóveis!

É rapidinho: primeiro faça seu cadastro na nossa página inicial 👇
https://www.matchimoveis.ia.br

Depois é só colocar seus imóveis na plataforma — pode importar tudo de uma vez via XML (se seu sistema atual gera um) ou cadastrar manualmente um por um. Qualquer dúvida, é só me chamar aqui!`;

// campanhaId opcional — quando informado, só considera elegível quem faz
// parte dessa campanha específica (disparos_contatos), em vez de qualquer
// contato que respondeu qualquer campanha.
// ignorarCadastrados (default true) — se false, manda pra quem já tem conta
// na plataforma também (tem campanha que faz sentido mandar pra todo mundo,
// cadastrado ou não; por padrão continua pulando quem já é cliente).
async function _elegiveisBoasVindas(campanhaId, ignorarCadastrados) {
  if (ignorarCadastrados === undefined) ignorarCadastrados = true;
  const { listarConversas, listarMensagens } = require('./services/salvarWhatsappCloudMsg');
  const { listarOptout, buscarFollowupMensagem, listarTelefonesDaCampanha } = require('./services/salvarDisparo');
  const { query: _qElegiveis } = require('./services/db');

  const mensagemAtual = (await buscarFollowupMensagem()) || _MSG_BOAS_VINDAS_PADRAO;
  const telsDaCampanhaSet = campanhaId ? await listarTelefonesDaCampanha(campanhaId) : null;

  let conversas = await listarConversas();
  if (telsDaCampanhaSet) {
    conversas = conversas.filter(c => telsDaCampanhaSet.has(String(c.contato_telefone || '').replace(/\D/g, '').slice(-8)));
  }
  const telefones = conversas.map(c => c.contato_telefone);
  const optadosSet = new Set(await listarOptout(telefones));

  const usuariosR = await _qElegiveis('SELECT telefone, celular FROM usuarios');
  const telsCadastrados = new Set();
  usuariosR.rows.forEach(u => {
    const t1 = String(u.telefone || '').replace(/\D/g, '').slice(-8);
    const t2 = String(u.celular || '').replace(/\D/g, '').slice(-8);
    if (t1) telsCadastrados.add(t1);
    if (t2) telsCadastrados.add(t2);
  });

  const agora = Date.now();
  const elegiveis = [];
  const contagem = { total_inbox: conversas.length, pulados_optout: 0, pulados_ja_cadastrado: 0, pulados_fora_janela_24h: 0, pulados_duplicado: 0 };

  for (const c of conversas) {
    const tel = c.contato_telefone;
    if (optadosSet.has(tel)) { contagem.pulados_optout++; continue; }
    const sufixo = tel.replace(/\D/g, '').slice(-8);
    if (ignorarCadastrados && telsCadastrados.has(sufixo)) { contagem.pulados_ja_cadastrado++; continue; }

    const mensagens = await listarMensagens(tel);
    const ultimaMsg = mensagens[mensagens.length - 1];
    if (ultimaMsg && ultimaMsg.direcao === 'saida' && ultimaMsg.tipo === 'texto' && ultimaMsg.texto === mensagemAtual) { contagem.pulados_duplicado++; continue; }

    const recebidas = mensagens.filter(m => m.direcao === 'entrada');
    const ultimoRecebido = recebidas.length ? recebidas[recebidas.length - 1] : null;
    if (!ultimoRecebido) { contagem.pulados_fora_janela_24h++; continue; }
    const horasDesde = (agora - new Date(ultimoRecebido.criado_em).getTime()) / 3600000;
    if (horasDesde >= 24) { contagem.pulados_fora_janela_24h++; continue; }

    elegiveis.push({ telefone: tel, phoneNumberId: ultimoRecebido.phone_number_id, nome: ultimoRecebido.contato_nome });
  }

  return { elegiveis, contagem, mensagem: mensagemAtual };
}

app.get('/admin/whatsapp-cloud/followup-mensagem', authAdmin, async (req, res) => {
  try {
    const { buscarFollowupMensagem } = require('./services/salvarDisparo');
    const mensagem = (await buscarFollowupMensagem()) || _MSG_BOAS_VINDAS_PADRAO;
    res.json({ ok: true, mensagem });
  } catch(e) { res.status(500).json({ ok:false, erro: e.message }); }
});

app.post('/admin/whatsapp-cloud/followup-mensagem', authAdmin, express.json(), async (req, res) => {
  try {
    const mensagem = String(req.body.mensagem || '').trim();
    if (!mensagem) return res.json({ ok: false, erro: 'Mensagem vazia' });
    const { salvarFollowupMensagem } = require('./services/salvarDisparo');
    await salvarFollowupMensagem(mensagem);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok:false, erro: e.message }); }
});

// Gera um texto de mensagem WhatsApp a partir do que o admin descrever —
// reaproveita a mesma GROQ_API_KEY do assistente (cerebro/groq-ia.js), mas
// com um prompt próprio (esse aqui não tem nada a ver com o contexto do
// corretor, é só "escreva essa mensagem"). O texto gerado só preenche o
// textarea — continua editável e só é usado de fato depois de "Salvar".
app.post('/admin/whatsapp-cloud/gerar-mensagem-ia', authAdmin, express.json(), async (req, res) => {
  try {
    const pedido = String(req.body.pedido || '').trim();
    if (!pedido) return res.json({ ok: false, erro: 'Descreva o que a mensagem deve dizer' });
    const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
    if (!GROQ_API_KEY) return res.json({ ok: false, erro: 'GROQ_API_KEY não configurada' });
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'Você escreve mensagens de WhatsApp curtas e diretas em português do Brasil pra MatchImóveis, uma plataforma de CRM imobiliário. Tom amigável, sem formalidade excessiva, pode usar 1-2 emojis. Responda só com o texto final da mensagem, sem aspas, sem explicação, sem markdown.' },
          { role: 'user', content: pedido }
        ],
        max_tokens: 400,
        temperature: 0.6
      })
    });
    const json = await r.json();
    const texto = json.choices?.[0]?.message?.content?.trim();
    if (!texto) return res.json({ ok: false, erro: 'A IA não devolveu texto' });
    res.json({ ok: true, texto });
  } catch(e) { res.status(500).json({ ok:false, erro: e.message }); }
});

app.get('/admin/whatsapp-cloud/campanha-boas-vindas/preview', authAdmin, async (req, res) => {
  try {
    const ignorarCadastrados = req.query.ignorarCadastrados !== 'false';
    const { elegiveis, contagem } = await _elegiveisBoasVindas(req.query.campanhaId || null, ignorarCadastrados);
    res.json({ ok: true, elegiveis: elegiveis.length, ...contagem });
  } catch(e) { res.status(500).json({ ok:false, erro: e.message }); }
});

let _envioBoasVindasEmAndamento = false;
app.post('/admin/whatsapp-cloud/campanha-boas-vindas/enviar', authAdmin, express.json(), async (req, res) => {
  try {
    if (_envioBoasVindasEmAndamento) return res.json({ ok:false, erro: 'Já tem um envio em andamento, aguarde terminar.' });
    const ignorarCadastrados = req.body.ignorarCadastrados !== false;
    const { elegiveis, contagem, mensagem } = await _elegiveisBoasVindas(req.body.campanhaId || null, ignorarCadastrados);
    res.json({ ok: true, elegiveis: elegiveis.length, ...contagem });
    if (!elegiveis.length) return;
    _envioBoasVindasEmAndamento = true;
    const { enviarTexto } = require('./services/metaWhatsapp');
    const { salvarMensagem } = require('./services/salvarWhatsappCloudMsg');
    (async () => {
      for (const c of elegiveis) {
        try {
          await enviarTexto({ telefone: c.telefone, texto: mensagem, phoneNumberId: c.phoneNumberId });
          await salvarMensagem({ phoneNumberId: c.phoneNumberId, telefone: c.telefone, nome: c.nome, direcao: 'saida', tipo: 'texto', texto: mensagem });
        } catch(e) { console.error('[campanha boas-vindas] erro ao enviar pra', c.telefone, e.message); }
        await new Promise(r => setTimeout(r, 2500));
      }
      _envioBoasVindasEmAndamento = false;
      console.log('[campanha boas-vindas] envio concluido');
    })();
  } catch(e) { _envioBoasVindasEmAndamento = false; res.status(500).json({ ok:false, erro: e.message }); }
});

app.get('/admin/whatsapp-cloud', authAdmin, async (req, res) => {
  try {
    const { listarCampanhas, buscarCampanha, buscarFollowupMensagem } = require('./services/salvarDisparo');
    const campanhaIdFiltro = req.query.campanhaId ? String(req.query.campanhaId) : '';
    const [campanhas, campanhaFiltro, mensagemSalva] = await Promise.all([
      listarCampanhas(),
      campanhaIdFiltro ? buscarCampanha(campanhaIdFiltro) : Promise.resolve(null),
      buscarFollowupMensagem()
    ]);
    const optionsCampanhas = '<option value="">— nenhuma (não filtra por campanha) —</option>' + campanhas.map(c => '<option value="'+c.id+'"'+(c.id===campanhaIdFiltro?' selected':'')+'>'+_escHtmlWaCloud(c.nome_campanha)+'</option>').join('');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Inbox WhatsApp Cloud</title>
    <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:0;overflow-x:hidden}
    ${_adminShellCss()}
    .admin-content{max-width:720px}
    textarea{width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:inherit;margin-top:6px}
    select{padding:6px;border:1px solid #ddd;border-radius:6px;font-size:12px}
    h1{color:#FF385C;font-size:20px}
    .box{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-top:16px}
    .linha{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #e5e7eb;text-decoration:none;color:inherit;flex-wrap:wrap}
    @media(max-width:520px){
      .linha{flex-direction:column;align-items:stretch}
      .linha > div:last-child{width:100%;justify-content:flex-start;flex-wrap:wrap!important}
    }
    </style></head><body>
    <div class="admin-app">
    ${_adminSidebarHtml('whatsapp-cloud')}
    <main class="admin-content">
    <h1>💬 Inbox WhatsApp Cloud <span style="font-size:13px;color:#6b7280;font-weight:400">(campanha — Meta Cloud API)</span></h1>
    <p><a href="/admin/whatsapp-cloud/exportar.csv" style="font-size:12px;color:#6b7280;text-decoration:underline">📥 Exportar contatos da inbox (.csv) — pra usar num disparo novo</a></p>
    ${campanhaFiltro ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-top:10px;font-size:12px;color:#1e3a8a">
      🔎 Mostrando só a inbox da campanha <strong>${_escHtmlWaCloud(campanhaFiltro.nome_campanha)}</strong> — <a href="/admin/whatsapp-cloud" style="color:#1e3a8a">ver inbox completa</a>
    </div>` : ''}
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;margin-top:12px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#111">🎁 Mensagem de follow-up (dentro da janela de 24h) pra quem respondeu</p>
      <p style="margin:0 0 10px;font-size:11px;color:#6b7280">Manda só pra quem: está dentro da janela de 24h, não foi excluído da lista e ainda não recebeu essa mesma mensagem.</p>
      <label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-top:8px">Texto da mensagem (editável)</label>
      <textarea id="txtFollowup" rows="5">${_escHtmlWaCloud(mensagemSalva || _MSG_BOAS_VINDAS_PADRAO)}</textarea>
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">
        <input type="text" id="pedidoIA" placeholder="Descreva o que você quer que a IA escreva..." style="flex:1;min-width:200px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:11px">
        <button type="button" onclick="gerarComIA()" id="btnGerarIA" style="background:#7c3aed;color:#fff;padding:6px 12px;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">✨ Gerar com IA</button>
      </div>
      <button type="button" onclick="salvarFollowup()" style="background:#111827;color:#fff;padding:6px 12px;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;margin-top:8px">💾 Salvar mensagem</button>
      <span id="statusFollowup" style="font-size:11px;color:#16a34a;margin-left:8px"></span>
      <label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-top:14px">Disparar só pra quem respondeu esta campanha (opcional)</label>
      <select id="selCampanhaFollowup">${optionsCampanhas}</select>
      <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#374151;margin-top:10px;font-weight:normal">
        <input type="checkbox" id="chkIgnorarCadastrados" checked> Não disparar pra quem já se cadastrou na plataforma
      </label>
      <div style="margin-top:10px">
        <button type="button" onclick="previewBoasVindas()" style="background:#111827;color:#fff;padding:7px 14px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">👁️ Ver quantos vão receber</button>
        <button type="button" onclick="enviarBoasVindas()" style="background:#FF385C;color:#fff;padding:7px 14px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;margin-left:8px">🚀 Enviar agora</button>
      </div>
      <p id="statusBoasVindas" style="margin:10px 0 0;font-size:12px;color:#374151"></p>
    </div>
    <div class="box" id="lista"><p style="padding:20px;color:#6b7280">Carregando...</p></div>
    <script>
    function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    const _campanhaIdFiltro = ${JSON.stringify(campanhaIdFiltro)};
    async function salvarFollowup(){
      const status = document.getElementById('statusFollowup');
      const mensagem = document.getElementById('txtFollowup').value.trim();
      if(!mensagem){ status.style.color = '#dc2626'; status.textContent = 'Mensagem vazia'; return; }
      status.style.color = '#6b7280'; status.textContent = 'Salvando...';
      try {
        const r = await fetch('/admin/whatsapp-cloud/followup-mensagem', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mensagem }) });
        const d = await r.json();
        status.style.color = d.ok ? '#16a34a' : '#dc2626';
        status.textContent = d.ok ? 'Salvo!' : ('Erro: ' + (d.erro||''));
      } catch(e){ status.style.color = '#dc2626'; status.textContent = 'Erro ao salvar.'; }
    }
    function _resumoBoasVindas(d){
      return 'Na inbox: '+d.total_inbox+' · pulados (já tem conta): '+d.pulados_ja_cadastrado+' · pulados (fora da janela 24h): '+d.pulados_fora_janela_24h+' · pulados (excluídos da lista): '+d.pulados_optout+' · pulados (já receberam): '+d.pulados_duplicado;
    }
    async function previewBoasVindas(){
      const status = document.getElementById('statusBoasVindas');
      status.textContent = 'Calculando...';
      const campanhaId = document.getElementById('selCampanhaFollowup').value;
      const ignorarCadastrados = document.getElementById('chkIgnorarCadastrados').checked;
      try {
        const qs = new URLSearchParams();
        if(campanhaId) qs.set('campanhaId', campanhaId);
        qs.set('ignorarCadastrados', ignorarCadastrados ? 'true' : 'false');
        const r = await fetch('/admin/whatsapp-cloud/campanha-boas-vindas/preview?' + qs.toString());
        const d = await r.json();
        if(!d.ok){ status.textContent = 'Erro: ' + (d.erro||''); return; }
        status.innerHTML = '<strong>'+d.elegiveis+' vão receber</strong> se você clicar em Enviar agora.<br>'+_resumoBoasVindas(d);
      } catch(e){ status.textContent = 'Erro ao calcular.'; }
    }
    async function enviarBoasVindas(){
      if(!confirm('Confirma o envio da mensagem de follow-up pra todos os elegíveis? Isso manda mensagem de verdade pelo WhatsApp, não dá pra desfazer.')) return;
      const status = document.getElementById('statusBoasVindas');
      status.textContent = 'Calculando quem vai receber...';
      const campanhaId = document.getElementById('selCampanhaFollowup').value;
      const ignorarCadastrados = document.getElementById('chkIgnorarCadastrados').checked;
      try {
        const r = await fetch('/admin/whatsapp-cloud/campanha-boas-vindas/enviar', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ campanhaId: campanhaId || null, ignorarCadastrados }) });
        const d = await r.json();
        if(!d.ok){ status.textContent = 'Erro: ' + (d.erro||''); return; }
        if(!d.elegiveis){ status.innerHTML = 'Ninguém elegível agora.<br>'+_resumoBoasVindas(d); return; }
        status.innerHTML = '<strong>Envio iniciado para '+d.elegiveis+' contatos</strong> (1 a cada ~2,5s, vai aparecer aos poucos na inbox de cada um).<br>'+_resumoBoasVindas(d);
      } catch(e){ status.textContent = 'Erro ao iniciar envio.'; }
    }
    async function gerarComIA(){
      const pedido = document.getElementById('pedidoIA').value.trim();
      if(!pedido){ alert('Descreve o que você quer que a IA escreva.'); return; }
      const btn = document.getElementById('btnGerarIA');
      btn.disabled = true; btn.textContent = '✨ Gerando...';
      try {
        const r = await fetch('/admin/whatsapp-cloud/gerar-mensagem-ia', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pedido }) });
        const d = await r.json();
        btn.disabled = false; btn.textContent = '✨ Gerar com IA';
        if(!d.ok){ alert('Erro: ' + (d.erro||'')); return; }
        document.getElementById('txtFollowup').value = d.texto;
      } catch(e){ btn.disabled = false; btn.textContent = '✨ Gerar com IA'; alert('Erro ao gerar mensagem.'); }
    }
    async function carregar(){
      try {
        const r = await fetch('/admin/whatsapp-cloud/lista.json' + (_campanhaIdFiltro ? '?campanhaId='+encodeURIComponent(_campanhaIdFiltro) : ''));
        const conversas = await r.json();
        const box = document.getElementById('lista');
        if(!conversas.length){ box.innerHTML = '<p style="padding:20px;color:#6b7280">Nenhuma conversa ainda.</p>'; return; }
        box.innerHTML = conversas.map(c => {
          const prevista = escHtml((c.tipo==='botao'?'🔘 ':c.tipo==='audio'?'🎤 ':'') + (c.direcao==='saida'?'Você: ':'') + (c.texto||'').slice(0,60));
          const telLimpo = String(c.contato_telefone||'').replace(/\\D/g,'');
          const waLink = 'https://wa.me/'+telLimpo+'?text='+encodeURIComponent('Olá! Somos do suporte da MatchImóveis e vamos te ajudar!');
          return '<div class="linha" style="cursor:pointer' + (c.naoLidas>0?';background:#fff7f0':'') + '" onclick="location.href=\\'/admin/whatsapp-cloud/'+encodeURIComponent(c.contato_telefone)+'\\'"' + '>' +
            '<div><p style="margin:0;font-weight:700;font-size:14px;color:#111">'+escHtml(c.contato_nome||c.contato_telefone)+(c.naoLidas>0?' <span style="background:#FF385C;color:#fff;border-radius:20px;padding:1px 8px;font-size:11px;margin-left:6px">'+c.naoLidas+'</span>':'')+'</p>' +
            '<p style="margin:2px 0 0;font-size:12px;color:#6b7280">'+escHtml(c.contato_telefone)+' · '+prevista+'</p></div>' +
            '<div style="display:flex;align-items:center;gap:10px">' +
            '<a href="'+waLink+'" target="_blank" onclick="event.stopPropagation()" style="background:#25D366;color:#fff;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;white-space:nowrap">💬 WhatsApp</a>' +
            '<button type="button" class="btn-excluir-lista" data-tel="'+escHtml(c.contato_telefone)+'" style="background:#fef2f2;color:#dc2626;padding:5px 8px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid #fca5a5;cursor:pointer;white-space:nowrap">🚫 Excluir da lista</button>' +
            '<span style="font-size:11px;color:#9ca3af;white-space:nowrap">'+new Date(c.criado_em).toLocaleString('pt-BR')+'</span>' +
            '</div></div>';
        }).join('');
        box.querySelectorAll('.btn-excluir-lista').forEach(btn => {
          btn.addEventListener('click', e => { e.stopPropagation(); excluirDaLista(btn.dataset.tel, btn); });
        });
      } catch(e) {}
    }
    async function excluirDaLista(tel, btnEl){
      if(!confirm('Excluir esse contato da lista? Ele não vai mais receber campanhas nem a mensagem automática.')) return;
      btnEl.disabled = true;
      try {
        const r = await fetch('/admin/whatsapp-cloud/'+encodeURIComponent(tel)+'/excluir-lista', { method:'POST' });
        const d = await r.json();
        if(d.ok){
          const linha = btnEl.closest('.linha');
          if(linha){ linha.style.opacity = '0.45'; setTimeout(() => linha.remove(), 400); }
        }
        else { alert(d.erro || 'Erro ao excluir'); btnEl.disabled = false; }
      } catch(e){ alert('Erro ao excluir'); btnEl.disabled = false; }
    }
    carregar();
    setInterval(carregar, 6000);
    </script>
    </main>
    </div>
    </body></html>`);
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

// CSV com telefone/nome de todo contato que já apareceu na inbox — pronto
// pra subir direto em /admin/disparos e criar uma campanha de remarketing
// (junto com o checkbox "Ignorar histórico", já que essas pessoas já
// receberam mensagem antes).
app.get('/admin/whatsapp-cloud/exportar.csv', authAdmin, async (req, res) => {
  try {
    const { listarConversas } = require('./services/salvarWhatsappCloudMsg');
    const conversas = await listarConversas().catch(()=>[]);
    const _csvEsc = s => '"' + String(s == null ? '' : s).replace(/"/g,'""') + '"';
    const linhas = ['Telefone,Nome']
      .concat(conversas.map(c => `${_csvEsc(c.contato_telefone)},${_csvEsc(c.contato_nome || '')}`));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contatos-inbox.csv"');
    res.send(linhas.join('\n'));
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

// Exclusão manual de um contato da inbox — usa o mesmo opt-out global já
// respeitado em qualquer campanha nova (services/salvarDisparo.js) e em
// qualquer envio manual/automático que checar listarOptout().
app.post('/admin/whatsapp-cloud/:telefone/excluir-lista', authAdmin, async (req, res) => {
  try {
    const { marcarOptout } = require('./services/salvarDisparo');
    await marcarOptout(req.params.telefone, 'exclusao_manual_admin');
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok:false, erro: e.message }); }
});

app.get('/admin/whatsapp-cloud/lista.json', authAdmin, async (req, res) => {
  try {
    const { listarConversas } = require('./services/salvarWhatsappCloudMsg');
    const { query: _qListaExcl } = require('./services/db');
    let conversas = await listarConversas().catch(()=>[]);
    // "Excluir da lista" (botão manual, diferente do opt-out por clique de botão
    // do lead) grava em disparos_optout com origem própria — filtra aqui pra
    // sumir de fato da inbox, não só bloquear campanha futura.
    const excluidos = await _qListaExcl(`SELECT telefone FROM disparos_optout WHERE origem='exclusao_manual_admin'`).catch(()=>({rows:[]}));
    const excluidosSet = new Set(excluidos.rows.map(r => r.telefone));
    conversas = conversas.filter(c => !excluidosSet.has(c.contato_telefone));
    // ?campanhaId= — inbox de uma campanha específica (link "Ver inbox dessa
    // campanha" em /admin/disparos/:id), em vez da inbox global de sempre.
    if (req.query.campanhaId) {
      const { listarTelefonesDaCampanha } = require('./services/salvarDisparo');
      const telsSet = await listarTelefonesDaCampanha(req.query.campanhaId);
      conversas = conversas.filter(c => telsSet.has(String(c.contato_telefone || '').replace(/\D/g, '').slice(-8)));
    }
    res.json(conversas);
  } catch(e) { res.status(500).json([]); }
});

app.get('/admin/whatsapp-cloud/:telefone', authAdmin, async (req, res) => {
  try {
    const telefone = req.params.telefone;
    const { listarMensagens, marcarLidas } = require('./services/salvarWhatsappCloudMsg');
    const mensagens = await listarMensagens(telefone).catch(()=>[]);
    await marcarLidas(telefone).catch(()=>{});
    const nome = _escHtmlWaCloud(mensagens.find(m => m.contato_nome)?.contato_nome || telefone);
    const _bolha = m => {
      const minha = m.direcao === 'saida';
      const corpo = m.tipo === 'audio' && m.midia_url
        ? `<audio controls preload="none" src="${m.midia_url}" style="max-width:220px"></audio>`
        : (m.tipo === 'botao' ? '<span style="opacity:.8;font-size:12px">🔘 clicou:</span><br>' : '') + _linkifyWaCloud(_escHtmlWaCloud(m.texto||''));
      return `<div class="bolha-wrap" data-id="${m.id}" style="display:flex;justify-content:${minha?'flex-end':'flex-start'};margin:6px 0">
        <div style="max-width:70%;padding:10px 14px;border-radius:14px;background:${minha?'#FF385C':'#f3f4f6'};color:${minha?'#fff':'#111'};font-size:14px">
          ${corpo}
          <div style="font-size:10px;opacity:.7;margin-top:4px">${new Date(m.criado_em).toLocaleString('pt-BR')}</div>
        </div>
      </div>`;
    };
    const bolhas = mensagens.map(_bolha).join('');
    const _ultimaData = mensagens.length ? mensagens[mensagens.length-1].criado_em : new Date(0).toISOString();
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conversa — ${nome}</title>
    <style>body{font-family:Arial,sans-serif;margin:0;padding:0}
    ${_adminShellCss()}
    .admin-content{max-width:720px}
    h1{color:#FF385C;font-size:18px;margin-bottom:4px}
    #chat{border:1px solid #e5e7eb;border-radius:10px;padding:16px;height:420px;overflow-y:auto;margin-top:12px;background:#fff}
    textarea{width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;font-size:14px;margin-top:10px}
    button{background:#FF385C;color:#fff;padding:10px 22px;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin-top:8px}
    button:disabled{opacity:.5;cursor:not-allowed}
    button.sec{background:#111827}
    button.rec{background:#dc2626}
    .barra{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .aviso{font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;margin-top:10px}
    </style></head><body>
    <div class="admin-app">
    ${_adminSidebarHtml('whatsapp-cloud')}
    <main class="admin-content">
    <a href="/admin/whatsapp-cloud" style="color:#6b7280;text-decoration:none;font-size:12px">← Inbox</a>
    <h1>${nome}</h1>
    <p style="font-size:12px;color:#6b7280;margin:0">${_escHtmlWaCloud(telefone)}</p>
    <div id="chat">${bolhas}</div>
    <textarea id="msgTexto" rows="3" placeholder="Escreva a resposta... (Enter envia, Shift+Enter quebra linha)" onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();enviar();}"></textarea>
    <div class="barra">
      <button id="btnEnviar" onclick="enviar()">Enviar</button>
      <button id="btnGravar" class="sec" onclick="alternarGravacao()">🎤 Gravar áudio</button>
      <button class="sec" onclick="document.getElementById('arquivoAudio').click()">📎 Enviar arquivo de áudio</button>
      <input type="file" id="arquivoAudio" accept="audio/*" style="display:none" onchange="enviarArquivoAudio(this.files[0])">
      <span id="statusAudio" style="font-size:12px;color:#6b7280"></span>
    </div>
    <p class="aviso">⚠️ Só funciona dentro da janela de 24h desde a última mensagem do contato. Depois disso, só reabre com um template aprovado.</p>
    <script>
    const _telefone = ${JSON.stringify(telefone)};
    let _ultimaData = ${JSON.stringify(_ultimaData)};
    const chat = document.getElementById('chat');
    chat.scrollTop = chat.scrollHeight;
    function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function linkify(s){ return s.replace(/(https?:\\/\\/[^\s<]+)/g, '<a href="$1" target="_blank" style="color:inherit;text-decoration:underline">$1</a>'); }
    function montarBolha(m){
      const minha = m.direcao === 'saida';
      const corpo = (m.tipo === 'audio' && m.midia_url)
        ? '<audio controls preload="none" src="'+m.midia_url+'" style="max-width:220px"></audio>'
        : (m.tipo === 'botao' ? '<span style="opacity:.8;font-size:12px">🔘 clicou:</span><br>' : '') + linkify(escHtml(m.texto||''));
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;justify-content:'+(minha?'flex-end':'flex-start')+';margin:6px 0';
      div.setAttribute('data-id', m.id);
      div.innerHTML = '<div style="max-width:70%;padding:10px 14px;border-radius:14px;background:'+(minha?'#FF385C':'#f3f4f6')+';color:'+(minha?'#fff':'#111')+';font-size:14px">'+corpo+
        '<div style="font-size:10px;opacity:.7;margin-top:4px">'+new Date(m.criado_em).toLocaleString('pt-BR')+'</div></div>';
      return div;
    }
    async function verificarNovas(){
      try {
        const r = await fetch('/admin/whatsapp-cloud/'+encodeURIComponent(_telefone)+'/novas?apos='+encodeURIComponent(_ultimaData));
        const novas = await r.json();
        if(!novas.length) return;
        const pertoDoFim = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 60;
        novas.forEach(m => {
          // O filtro "criado_em > apos" já devolveu essa mensagem antes por
          // algum motivo (fuso, corrida entre polls) — não duplica na tela
          // mesmo que o backend tenha mandado ela de novo.
          if (!chat.querySelector('[data-id="'+m.id+'"]')) chat.appendChild(montarBolha(m));
          _ultimaData = m.criado_em;
        });
        if(pertoDoFim) chat.scrollTop = chat.scrollHeight;
      } catch(e) {}
    }
    setInterval(verificarNovas, 5000);

    let _enviandoAgora = false;
    async function enviar(){
      if(_enviandoAgora) return;
      const texto = document.getElementById('msgTexto').value.trim();
      if(!texto) return;
      _enviandoAgora = true;
      const btn = document.getElementById('btnEnviar');
      btn.disabled = true; btn.textContent = 'Enviando...';
      try {
        const r = await fetch(window.location.pathname + '/responder', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ texto })
        });
        const d = await r.json();
        if(d.ok){ document.getElementById('msgTexto').value=''; verificarNovas(); }
        else { alert(d.erro || 'Erro ao enviar'); }
      } catch(e){ alert('Erro ao enviar — se realmente falhou, tenta de novo; se já tinha ido, o sistema evita duplicar.'); }
      finally { _enviandoAgora = false; btn.disabled = false; btn.textContent = 'Enviar'; }
    }

    async function enviarBlobAudio(blob, nomeArquivo){
      const status = document.getElementById('statusAudio');
      status.textContent = 'Enviando áudio...';
      try {
        const fd = new FormData();
        fd.append('audio', blob, nomeArquivo || 'audio.webm');
        const r = await fetch(window.location.pathname + '/responder-audio', { method:'POST', body: fd });
        const d = await r.json();
        if(d.ok){ status.textContent = ''; verificarNovas(); }
        else { status.textContent = ''; alert(d.erro || 'Erro ao enviar áudio'); }
      } catch(e){ status.textContent = ''; alert('Erro ao enviar áudio'); }
    }
    function enviarArquivoAudio(file){
      if(!file) return;
      enviarBlobAudio(file, file.name);
    }

    let _gravador = null, _chunks = [];
    async function alternarGravacao(){
      const btn = document.getElementById('btnGravar');
      if(_gravador && _gravador.state === 'recording'){
        _gravador.stop();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
        _gravador = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        _chunks = [];
        _gravador.ondataavailable = e => { if(e.data.size>0) _chunks.push(e.data); };
        _gravador.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          btn.textContent = '🎤 Gravar áudio'; btn.classList.remove('rec');
          const blob = new Blob(_chunks, { type: _gravador.mimeType || 'audio/webm' });
          if(blob.size > 500) enviarBlobAudio(blob, 'gravacao.' + (blob.type.includes('ogg')?'ogg':'webm'));
        };
        _gravador.start();
        btn.textContent = '⏹ Parar (gravando...)'; btn.classList.add('rec');
      } catch(e) {
        alert('Não consegui acessar o microfone: ' + e.message);
      }
    }
    </script>
    </main>
    </div>
    </body></html>`);
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.get('/admin/whatsapp-cloud/:telefone/novas', authAdmin, async (req, res) => {
  try {
    const telefone = req.params.telefone;
    const apos = req.query.apos || new Date(0).toISOString();
    const { listarMensagensApos, marcarLidas } = require('./services/salvarWhatsappCloudMsg');
    const novas = await listarMensagensApos(telefone, apos).catch(()=>[]);
    if (novas.some(m => m.direcao === 'entrada')) marcarLidas(telefone).catch(()=>{});
    res.json(novas);
  } catch(e) { res.status(500).json([]); }
});

app.post('/admin/whatsapp-cloud/:telefone/responder', authAdmin, express.json(), async (req, res) => {
  try {
    const telefone = req.params.telefone;
    const texto = (req.body.texto || '').trim();
    if (!texto) return res.status(400).json({ ok:false, erro:'Mensagem vazia' });
    const { listarMensagens, salvarMensagem } = require('./services/salvarWhatsappCloudMsg');
    const mensagens = await listarMensagens(telefone).catch(()=>[]);
    // Trava de reenvio duplicado (duplo-clique, reinício do Render bem na hora,
    // ou reenvio de origem desconhecida horas depois — já visto acontecer) —
    // se a ÚLTIMA mensagem da conversa (qualquer direção, não importa há
    // quanto tempo) já for exatamente esse mesmo texto nosso, não manda de
    // novo. Só libera repetir o mesmo texto se o lead tiver escrito algo depois
    // (aí a última mensagem já não é mais 'saida' com esse texto).
    const ultimaMsg = mensagens[mensagens.length - 1];
    if (ultimaMsg && ultimaMsg.direcao === 'saida' && ultimaMsg.tipo === 'texto' && ultimaMsg.texto === texto) {
      return res.json({ ok:true, duplicado: true });
    }
    const ultimoRecebido = [...mensagens].reverse().find(m => m.direcao === 'entrada');
    const phoneNumberId = ultimoRecebido?.phone_number_id || null;
    if (!phoneNumberId) return res.status(400).json({ ok:false, erro:'Não achei por qual número esse contato falou com a gente.' });
    const { enviarTexto } = require('./services/metaWhatsapp');
    await enviarTexto({ telefone, texto, phoneNumberId });
    await salvarMensagem({ phoneNumberId, telefone, nome: ultimoRecebido?.contato_nome, direcao: 'saida', tipo: 'texto', texto });
    res.json({ ok:true });
  } catch(e) {
    res.status(500).json({ ok:false, erro: e.message });
  }
});

app.post('/admin/whatsapp-cloud/:telefone/responder-audio', authAdmin, _uploadAudioMem.single('audio'), async (req, res) => {
  try {
    const telefone = req.params.telefone;
    if (!req.file) return res.status(400).json({ ok:false, erro:'Nenhum áudio recebido' });
    const { listarMensagens, salvarMensagem } = require('./services/salvarWhatsappCloudMsg');
    const mensagens = await listarMensagens(telefone).catch(()=>[]);
    const ultimoRecebido = [...mensagens].reverse().find(m => m.direcao === 'entrada');
    const phoneNumberId = ultimoRecebido?.phone_number_id || null;
    if (!phoneNumberId) return res.status(400).json({ ok:false, erro:'Não achei por qual número esse contato falou com a gente.' });

    const { enviarAudio } = require('./services/metaWhatsapp');
    const mimeType = req.file.mimetype || 'audio/ogg';
    await enviarAudio({ telefone, buffer: req.file.buffer, mimeType, nomeArquivo: req.file.originalname, phoneNumberId });

    // Guarda cópia local pra tocar de volta na inbox (mídia da Meta expira).
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('webm') ? 'webm' : mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('mp4')||mimeType.includes('m4a') ? 'm4a' : 'audio';
    const nomeArq = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_AUDIO_DIR, nomeArq), req.file.buffer);

    await salvarMensagem({ phoneNumberId, telefone, nome: ultimoRecebido?.contato_nome, direcao: 'saida', tipo: 'audio', texto: '[áudio]', midiaUrl: '/data-uploads-audio/' + nomeArq, midiaMime: mimeType });
    res.json({ ok:true });
  } catch(e) {
    res.status(500).json({ ok:false, erro: e.message });
  }
});

app.get('/app/coins', auth, (req, res) => {
  const users = (_cacheUsuarios || []);
  const user = users.find(u => u.id === req.session.user.id) || req.session.user;
  // historicoCompleto (sem corte) alimenta os totais de Hoje/Semana/Mês e por
  // categoria -- limitar a 50 ali sub-contava contas com mais atividade que isso.
  // historico (só os 50 mais recentes) continua sendo o usado pra lista visível.
  const historicoCompleto = (user.matchCoinsTransacoes || []).slice().reverse();
  const historico = historicoCompleto.slice(0, 50);
  // Reflete a baixa vinda do webhook do Mercado Pago (sem sessão) — ver
  // comprarPlano em /app/perfil pro mesmo motivo.
  if (req.session.user.precisaComprarPlano && user && !user.precisaComprarPlano) req.session.user.precisaComprarPlano = false;
  res.render('app-coins', { user, mpPublicKey: process.env.MP_PUBLIC_KEY || '', historico, historicoCompleto, planoSucesso: req.query.planoSucesso === '1', comprarPlano: !!req.session.user.precisaComprarPlano });
});

// ===== REMARCAÇÃO DE VISITA PELO CLIENTE =====










// DEBUG TEMP
// DEBUG LEADS
// TEMP - Substituir data.json pelo do repositório
app.get('/app/assistente', auth, (req, res) => {
  // Assistente liberado para todos os usuários

  const imoveis = filtrarPorUsuario(_cacheImoveis || [], req.session.user);
  const leads = filtrarPorUsuario(_cacheLeads || [], req.session.user);
  const stats = { imoveis: imoveis.length, ativos: imoveis.filter(i => i.status !== 'inativo').length, leads: leads.length };
  res.render('app-assistente', { user: req.session.user, stats });
});


// ─── CÉREBRO DO ASSISTENTE ───────────────────────────────────────────────────

// ─── API interna do Assistente — dados reais ─────────────────────────────────
app.get('/api/assistente/dados', auth, (req, res) => {
  const user = req.session.user;
  const imoveis = filtrarPorUsuario(_cacheImoveis || [], user);
  const leads   = filtrarPorUsuario(_cacheLeads || [], user);
  const visitas = (_cacheVisitas || []).filter(v =>
    String(v.ownerUserId || v.corretorId || v.usuarioDestinoId || v.userId || '') === String(user.id || '') ||
    String(v.corretorTelefone || v.usuarioDestinoTelefone || '').replace(/\D/g,'') === String(user.celular || user.telefone || '').replace(/\D/g,'')
  );

  const hoje = new Date().toLocaleDateString('pt-BR');

  res.json({
    imoveis: {
      total: imoveis.length,
      ativos: imoveis.filter(i=>i.status!=='inativo').length,
      inativos: imoveis.filter(i=>i.status==='inativo').length,
      tipos: [...new Set(imoveis.map(i=>i.tipo).filter(Boolean))].slice(0,10),
      bairros: [...new Set(imoveis.map(i=>i.bairro).filter(Boolean))].slice(0,10)
    },
    leads: {
      total: leads.length,
      organicas: leads.filter(l=>l.extractionStatus==='ok').length,
      importadas: leads.filter(l=>l.extractionStatus!=='ok').length,
      comMatch: leads.filter(l=>l.matchesBase&&l.matchesBase.length>0).length,
      semMatch: leads.filter(l=>!l.matchesBase||l.matchesBase.length===0).length,
      recentes: leads.slice(-5).map(l=>({nome:l.nome,bairro:l.bairro,tipo:l.tipo,quartos:l.quartos}))
    },
    visitas: {
      total: visitas.length,
      hoje: visitas.filter(v=>v.dataVisita===hoje).length,
      pendentes: visitas.filter(v=>v.status==='solicitada').length,
      confirmadas: visitas.filter(v=>v.status==='confirmada'||v.status==='lead_confirmou').length,
      proximas: visitas.filter(v=>v.status==='confirmada'||v.status==='lead_confirmou').slice(-3).map(v=>({
        imovel:v.imovelTitulo||v.imovelId,
        data:v.dataVisita,
        hora:v.horaVisita,
        status:v.status
      }))
    }
  });
});

// ─── ASSISTENTE ───────────────────────────────────────────────────────────────
app.get('/app/assistente', auth, (req, res) => {
  const imoveis = filtrarPorUsuario(_cacheImoveis || [], req.session.user);
  const leads = filtrarPorUsuario(_cacheLeads || [], req.session.user);
  const stats = { imoveis: imoveis.length, ativos: imoveis.filter(i => i.status !== 'inativo').length, leads: leads.length, comMatch: leads.filter(l=>l.matchesBase&&l.matchesBase.length>0).length, visitas: 0, visitasHoje: 0 };
  res.render('app-assistente', { user: req.session.user, stats });
});

// Rota admin — top perguntas não entendidas
// Rota admin — funil de leads por conta
app.post('/app/assistente/chat', auth, async (req, res) => {
  const { mensagem } = req.body;
  if (!mensagem) return res.json({ resposta: 'Digite uma mensagem.' });

  const uid  = req.session.user.id || req.session.user.userId;
  const user = req.session.user;

  const imoveis = filtrarPorUsuario(_cacheImoveis || [], user);
  const leads   = filtrarPorUsuario(_cacheLeads || [], user);
  const visitas = (_cacheVisitas || []).filter(v =>
    String(v.ownerUserId || v.corretorId || v.usuarioDestinoId || v.userId || '') === String(user.id || '') ||
    String(v.corretorTelefone || v.usuarioDestinoTelefone || '').replace(/\D/g,'') === String(user.celular || user.telefone || '').replace(/\D/g,'')
  );

  const hoje = new Date().toLocaleDateString('pt-BR');
  const d = {
    ativos:      imoveis.filter(i=>i.status!=='inativo').length,
    inativos:    imoveis.filter(i=>i.status==='inativo').length,
    bairros:     [...new Set(imoveis.map(i=>i.bairro).filter(Boolean))],
    tipos:       [...new Set(imoveis.map(i=>i.tipo).filter(Boolean))],
    leads:       leads.length,
    organicas:   leads.filter(l=>l.extractionStatus==='ok').length,
    importadas:  leads.filter(l=>l.extractionStatus!=='ok').length,
    comMatch:    leads.filter(l=>l.matchesBase&&l.matchesBase.length>0).length,
    semMatch:    leads.filter(l=>!l.matchesBase||l.matchesBase.length===0).length,
    quentes:     leads.filter(l=>l.temperatura==='quente').length,
    mornos:      leads.filter(l=>l.temperatura==='morno').length,
    comPerfilIA: leads.filter(l=>l.perfilIA&&Object.keys(l.perfilIA).length>0).length,
    comMensagensWA: leads.filter(l=>l.mensagens&&l.mensagens.length>0).length,
    leadsQuentes: leads.filter(l=>l.temperatura==='quente').slice(0,5).map(l=>({nome:l.nome||l.contato, temperatura:l.temperatura, faseFunil:l.faseFunil, ultimaMensagem:l.ultimaMensagem})),
    visitas:     visitas.length,
    hoje:        visitas.filter(v=>v.dataVisita===hoje).length,
    pendentes:   visitas.filter(v=>v.status==='solicitada').length,
    confirmadas:    visitas.filter(v=>v.status==='confirmada'||v.status==='lead_confirmou').length,
    realizadas:     visitas.filter(v=>v.status==='realizada').length,
    canceladas:     visitas.filter(v=>v.status==='cancelada').length,
    // Leads detalhes
    superQuentes:   leads.filter(l=>l.temperatura==='super_quente').length,
    frias:          leads.filter(l=>!l.temperatura||l.temperatura==='frio').length,
    comVisita:      leads.filter(l=>l.faseFunil==='visita').length,
    comProposta:    leads.filter(l=>l.faseFunil==='proposta').length,
    fechadas:       leads.filter(l=>l.faseFunil==='fechado').length,
    semProprietario: imoveis.filter(i=>i.status!=='inativo'&&(!i.proprietario||(!i.proprietario.nome&&!i.proprietario.telefone))).length,
    semFoto:        imoveis.filter(i=>i.status!=='inativo'&&(!i.fotos||i.fotos.length===0)).length,
    semCep:         imoveis.filter(i=>i.status!=='inativo'&&!i.cep).length,
    topBairrosDemanda: (() => {
      const bairroCount = {};
      leads.forEach(l=>{ if(l.bairro) bairroCount[l.bairro]=(bairroCount[l.bairro]||0)+1; });
      return Object.entries(bairroCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([b,n])=>({bairro:b,total:n}));
    })(),
    topTiposDemanda: (() => {
      const tipoCount = {};
      leads.forEach(l=>{ if(l.tipo) tipoCount[l.tipo]=(tipoCount[l.tipo]||0)+1; });
      return Object.entries(tipoCount).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,n])=>({tipo:t,total:n}));
    })(),
    leadsRecentes:  leads.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,5).map(l=>({nome:l.nome||l.contato||'Lead',bairro:l.bairro,tipo:l.tipo,temperatura:l.temperatura})),
    visitasHoje:    visitas.filter(v=>{
      if(!v.dataVisita) return false;
      const d = new Date(v.dataVisita);
      const hoje2 = new Date();
      return d.toDateString()===hoje2.toDateString();
    }).length,
    whatsappConectado: !!(user && user.whatsappStatus==='connected'),
    temPerfil:      !!(user && user.celular && user.nome),
    vitrinesEnviadas: leads.filter(l=>l.vitrineEnviada).length,
  };

  const memoriaPath = path.join(__dirname,'assistente-memoria.json');
  let memoria = fs.existsSync(memoriaPath)
    ? JSON.parse(fs.readFileSync(memoriaPath,'utf8'))
    : { historico:[] };
  memoria.historico = memoria.historico || [];
  const historicoUsuario = memoria.historico.filter(h=>h.userId===uid).slice(-5);
  const contexto = {
    ultimoTema: historicoUsuario.length>0
      ? cerebroApp.detectarTema(historicoUsuario[historicoUsuario.length-1].pergunta)
      : null
  };

  let resposta = null;

  const msgNorm = String(mensagem || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const usarCentral = /(whatsapp|zap|mensagem|manda|enviar|falar|ele|ela|lead|leads|cliente|clientes|quente|quentes|match|matches|visita|visitas|notificacao|notificacoes|pendente|pendentes)/.test(msgNorm);

  if (usarCentral) {
    try {
      const central = centralOperacional.responderCentral(user, mensagem, { leads: _cacheLeads||[], imoveis: _cacheImoveis||[], visitas: _cacheVisitas||[], notificacoes: _cacheNotificacoes||[] });

      if (central && central.resposta) {
        resposta = central.resposta;

        if (central.itens && central.itens.length) {
          resposta += "\n\n" + central.itens.map((i)=>{
            return "• " + (i.nome || i.titulo || i.title || i.cliente || "Item")
              + (i.bairro ? " — " + i.bairro : "")
              + (i.label ? " | " + i.label : "")
              + (i.prioridade !== undefined ? " | Prioridade: " + i.prioridade : "")
              + (i.matches !== undefined ? " | Matches: " + i.matches : "")
              + (i.bestScore !== undefined ? " | Score: " + i.bestScore : "");
          }).join("\n");
        }

        if (central.acao && central.acao.tipo === "whatsapp") {
          resposta += "\n\n📲 WhatsApp preparado.";
          if (central.acao.url) resposta += "\n" + central.acao.url;
        }
      }
    } catch(e) {
      console.error("Erro central operacional:", e.message);
    }
  }

  if (!resposta) {
    const _resRaw = cerebroApp.responder(mensagem, d, user, imoveis, leads, visitas, contexto);
    resposta = (_resRaw && typeof _resRaw.then === "function") ? await _resRaw : _resRaw;
  }

  memoria.historico.push({ userId:uid, pergunta:mensagem, resposta, data:new Date().toISOString() });
  if (memoria.historico.length>500) memoria.historico = memoria.historico.slice(-500);
  fs.writeFileSync(memoriaPath, JSON.stringify(memoria,null,2));
  // Salvar historico no cache de usuarios
  try {
    const users = (_cacheUsuarios || []);
    const uIdx = users.findIndex(u=>u.id===uid||u.userId===uid);
    if (uIdx>=0) {
      users[uIdx].historicoAssistente = users[uIdx].historicoAssistente || [];
      users[uIdx].historicoAssistente.push({pergunta:mensagem,resposta,data:new Date().toISOString()});
      if (users[uIdx].historicoAssistente.length>50) users[uIdx].historicoAssistente=users[uIdx].historicoAssistente.slice(-50);
      salvarTodosUsuarios(users).catch(e=>console.error("[users]",e.message));
    }
  } catch(e){}

  res.json({ resposta, fonte:'cerebro' });
});

// ─── Histórico do assistente por usuário ─────────────────────────────────────
app.get('/app/assistente/historico', auth, (req, res) => {
  const uid = req.session.user.id || req.session.user.userId;
  let historico = [];
  // Tentar users.json primeiro (persiste no Render)
  try {
    const users = (_cacheUsuarios || []);
    const u = users.find(u=>u.id===uid||u.userId===uid);
    if (u && u.historicoAssistente && u.historicoAssistente.length>0) {
      historico = u.historicoAssistente.slice(-20);
    }
  } catch(e){}
  // Fallback para assistente-memoria.json
  if (!historico.length) {
    const memPath = require('path').join(__dirname,'assistente-memoria.json');
    const mem = fs.existsSync(memPath) ? JSON.parse(fs.readFileSync(memPath,'utf8')) : { historico:[] };
    historico = (mem.historico||[]).filter(h=>h.userId===uid).slice(-20).map(h=>({pergunta:h.pergunta,resposta:h.resposta,data:h.data}));
  }
  res.json({ historico });
});


// =========================
// IMPORT SYNC RAN 0888/9191
// =========================
// ===============================




// Sync leads extraídas localmente para o Render
// Rodar match interno por userId direto no Render
// Mensagem de abertura proativa do assistente
app.get('/app/assistente/abertura', auth, (req, res) => {
  try {
    const proatividade = require('./cerebro/proatividade');
    const userId = req.session.user.id;
    const leads = (_cacheLeads||[]).filter(l => String(l.userId||l.usuarioId||l.corretorId||'') === userId);
    const imoveis = (_cacheImoveis||[]).filter(i => String(i.userId||i.usuarioId||i.corretorId||'') === userId);
    const visitas = (_cacheVisitas||[]).filter(v => String(v.userId||v.usuarioId||v.corretorId||'') === userId);
    const notificacoes = (_cacheNotificacoes||[]).filter(n => String(n.userId||n.usuarioId||n.corretorId||'') === userId);
    const mensagem = proatividade.gerarAbertura(req.session.user, leads, imoveis, visitas, notificacoes);
    res.json({ ok: true, mensagem });
  } catch(e) {
    res.json({ ok: true, mensagem: 'Olá! Como posso ajudar você hoje?' });
  }
});


// Executa ações diretas pelo assistente
app.post('/app/assistente/acao-direta', auth, express.json(), async (req, res) => {
  try {
    const { acao, dados } = req.body || {};
    const userId = req.session.user.id;

    if (acao === 'fazer_match') {
      const { buscarMatchesBaseInterna } = require('./matchBaseInterna.js');
      const todasLeads = await lerLeadsData();
      const todosIm = _cacheImoveis || [];
      const minhasLeads = todasLeads.filter(l => String(l.userId||l.usuarioId||l.corretorId||'') === userId && l.extractionStatus === 'ok');
      let comMatch = 0, semMatch = 0;
      minhasLeads.forEach(lead => {
        const matches = buscarMatchesBaseInterna(lead, todosIm);
        lead.matchesBase = matches; lead.matchCountBase = matches.length;
        if (matches.length > 0) comMatch++; else semMatch++;
      });
      const outras = todasLeads.filter(l => String(l.userId||l.usuarioId||l.corretorId||'') !== userId);
      const restantes = todasLeads.filter(l => String(l.userId||l.usuarioId||l.corretorId||'') === userId && !minhasLeads.find(x => x.id === l.id));
      salvarTodosLeads([...outras,...restantes,...minhasLeads]).catch(e=>console.error("[leads]",e.message));
      return res.json({ ok: true, comMatch, semMatch, total: minhasLeads.length });
    }

    res.json({ ok: false, erro: 'Ação não reconhecida: ' + acao });
  } catch(e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});


// Métricas do assistente por conta

// Feedback do assistente — positivo ou negativo
app.post('/app/assistente/feedback', auth, express.json(), (req, res) => {
  // Salvar no formato novo para o Groq aprender
  try {
    const { util, pergunta, resposta } = req.body;
    const fbPath = path.join(__dirname, 'assistente-feedbacks.json');
    let fb = { positivos:[], negativos:[] };
    try { fb = JSON.parse(fs.readFileSync(fbPath,'utf8')); } catch(e) {}
    const item = { pergunta: String(pergunta||'').slice(0,200), resposta: String(resposta||'').replace(/<[^>]+>/g,'').slice(0,300), at: new Date().toISOString() };
    if (util) {
      fb.positivos.push(item);
      if (fb.positivos.length > 100) fb.positivos = fb.positivos.slice(-100);
    } else {
      fb.negativos.push(item);
      if (fb.negativos.length > 100) fb.negativos = fb.negativos.slice(-100);
    }
    fs.writeFileSync(fbPath, JSON.stringify(fb, null, 2));
  } catch(e) { console.error('[feedback-novo]', e.message); }
  // Continua com o feedback antigo também
  try {
    const feedbackLoop = require('./cerebro/feedback-loop');
    const { mensagem, resposta, tipo, detalhe } = req.body || {};
    const userId = req.session.user.id;
    feedbackLoop.registrarFeedback(userId, mensagem, resposta, tipo, detalhe);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Análise de feedback — admin
// Notas do usuário — preferências aprendidas
// CENTRAL OPERACIONAL CONVERSACIONAL
// ===============================
app.post('/api/central-operacional', auth, express.json(), (req, res) => {
  try {
    const texto = req.body.texto || req.body.mensagem || req.body.message || '';
    if (!texto.trim()) {
      return res.json({
        ok: false,
        resposta: 'Digite uma pergunta ou comando para a central operacional.'
      });
    }

    const resultado = centralOperacional.responderCentral(req.session.user, texto, { leads: _cacheLeads||[], imoveis: _cacheImoveis||[], visitas: _cacheVisitas||[], notificacoes: _cacheNotificacoes||[] });
    res.json({
      ok: true,
      ...resultado
    });
  } catch (err) {
    console.error('Erro central operacional:', err);
    res.status(500).json({
      ok: false,
      resposta: 'Erro ao consultar a central operacional.',
      erro: err.message
    });
  }
});

// ===============================
// TELA CENTRAL OPERACIONAL
// ===============================
app.get('/app/central', auth, (req, res) => {
  res.render('app-central', { user: req.session.user, active: 'central' });
});

// =====================================================
// WORKFLOW VISITAS OPERACIONAL
// =====================================================

app.post('/api/visita/:id/workflow', auth, async (req,res)=>{
  try{
    const id = req.params.id;

    const {
      workflowStatus,
      workflowResponsavel,
      workflowLabel,
      workflowProximaAcao
    } = req.body;

    const visita = atualizarWorkflowVisita(id, workflowStatus, {
      workflowResponsavel,
      workflowLabel,
      workflowProximaAcao
    });

    return res.json({
      ok: true,
      visita
    });

  }catch(err){
    console.log(err);

    return res.status(500).json({
      ok:false,
      erro: err.message
    });
  }
});

// =====================================================
// MEMORIA OPERACIONAL
// =====================================================

app.get('/api/memoria-operacional', auth, (req,res)=>{
  try{

    const DATA_DIR =
      process.env.RENDER
        ? '/opt/render/project/src/data'
        : '.';

    const memoriaFile = path.join(DATA_DIR, 'memoria-operacional.json');

    if(!fs.existsSync(memoriaFile)){
      return res.json([]);
    }

    const memoria = JSON.parse(fs.readFileSync(memoriaFile,'utf8'));

    return res.json(memoria);

  }catch(err){

    console.log(err);

    return res.status(500).json({
      ok:false,
      erro: err.message
    });
  }
});


// =====================================================
// WORKFLOW VISITAS OPERACIONAL
// =====================================================






// =====================================================
// MEMORIA OPERACIONAL
// =====================================================

app.get('/api/memoria-operacional', auth, (req,res)=>{
  try{

    const DATA_DIR =
      process.env.RENDER
        ? '/opt/render/project/src/data'
        : '.';

    const memoriaFile = path.join(DATA_DIR, 'memoria-operacional.json');

    if(!fs.existsSync(memoriaFile)){
      return res.json([]);
    }

    const memoria = JSON.parse(fs.readFileSync(memoriaFile,'utf8'));

    return res.json(memoria);

  }catch(err){

    console.log(err);

    return res.status(500).json({
      ok:false,
      erro: err.message
    });
  }
});


// =====================================================
// ACAO RAPIDA VISITA
// =====================================================

app.post('/api/visita/:id/confirmar', auth, async (req,res)=>{
  try{

    const visita = atualizarWorkflowVisita(
      req.params.id,
      'CONFIRMADA',
      {
        workflowResponsavel: req.session.user.nome || '',
        workflowLabel: 'Visita confirmada',
        workflowProximaAcao: 'Definir corretor acompanhante'
      }
    );

    registrarEvento({
      tipo: 'VISITA_CONFIRMADA',
      visitaId: visita.id,
      leadId: visita.leadId || '',
      imovelId: visita.imovelId || '',
      userId: req.session.user.id || '',
      descricao: 'Visita confirmada pelo usuário'
    });

    return res.json({
      ok:true,
      visita
    });

  }catch(err){

    console.log(err);

    return res.status(500).json({
      ok:false,
      erro: err.message
    });
  }
});

app.post('/api/visita/:id/remarcar', auth, async (req,res)=>{
  try{

    const visita = atualizarWorkflowVisita(
      req.params.id,
      'REMARCAR',
      {
        workflowResponsavel: req.session.user.nome || '',
        workflowLabel: 'Remarcação solicitada',
        workflowProximaAcao: 'Definir nova data'
      }
    );

    registrarEvento({
      tipo: 'VISITA_REMARCAR',
      visitaId: visita.id,
      leadId: visita.leadId || '',
      imovelId: visita.imovelId || '',
      userId: req.session.user.id || '',
      descricao: 'Usuário solicitou remarcação'
    });

    return res.json({
      ok:true,
      visita
    });

  }catch(err){

    console.log(err);

    return res.status(500).json({
      ok:false,
      erro: err.message
    });
  }
});


app.get('/api/visita/:id/whatsapp', auth, async (req,res)=>{

  try {

    const visitas = (_cacheVisitas || []);
    const v = visitas.find(x => String(x.id) === String(req.params.id));

    if(!v) return res.json({ ok:false, erro:'Visita não encontrada' });

    const destino = resolverDestinoVisita(v, req.session.user);

    if(!destino.telefone){
      return res.json({ ok:false, erro:'Sem telefone destino' });
    }

    const msg =
`Olá ${destino.nome}! 
Temos uma visita agendada para:
${v.imovelTitulo}
Data: ${v.dataVisita} às ${v.horaVisita}
Confirme aqui: https://matchimoveis.onrender.com/visita/${v.id}`;

    const link = `https://wa.me/55${destino.telefone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`;

    return res.json({
      ok:true,
      destino,
      link
    });

  } catch(err){
    console.log(err);
    return res.json({ ok:false, erro: err.message });
  }

});


function resolverUsuarioPorId(id){
  try {
    return (_cacheUsuarios || []).find(u => String(u.id) === String(id)) || null;
  } catch(e){ return null; }
}

function resolverUsuarioPorId(id){
  try {
    return (_cacheUsuarios || []).find(u => String(u.id) === String(id)) || null;
  } catch(e){ return null; }
}

// ===============================
// NOVO FLUXO DE VISITAS (LIMPO)
// ===============================

app.post('/app/visitas/remarcar/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {
    if(String(v.id) === String(req.params.id)){
      v.status = 'REMARCAR';
      v.remarcarAt = new Date().toISOString();
    }
    return v;
  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/cancelar/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {
    if(String(v.id) === String(req.params.id)){
      v.status = 'CANCELADA';
      v.canceladaAt = new Date().toISOString();
    }
    return v;
  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/concluir/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {
    if(String(v.id) === String(req.params.id)){
      v.status = 'realizada';
      v.concluidaAt = new Date().toISOString();
    }
    return v;
  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});


















app.post('/app/visitas/observacao/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {
    if(String(v.id) === String(req.params.id)){

      if(!v.observacoes){
        v.observacoes = [];
      }

      v.observacoes.unshift({
        texto: req.body.observacao || '',
        user: req.session.user ? req.session.user.nome : 'Sistema',
        createdAt: new Date().toISOString()
      });

    }
    return v;
  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/prioridade/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.prioridade = req.body.prioridade || 'NORMAL';

      v.prioridadeUpdatedAt = new Date().toISOString();

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/responsavel/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.responsavelOperacional = req.body.responsavel || '';

      v.responsavelUpdatedAt = new Date().toISOString();

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/cliente-gostou/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.status = 'CONCLUIDA';
      v.pipelineStatus = 'CLIENTE_GOSTOU';

      v.clienteGostouAt = new Date().toISOString();

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/proposta/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.status = 'CONCLUIDA';
      v.pipelineStatus = 'PROPOSTA';

      v.propostaAt = new Date().toISOString();

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/fechado/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.status = 'CONCLUIDA';
      v.pipelineStatus = 'FECHADO';

      v.fechadoAt = new Date().toISOString();

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});


app.get('/app/visitas-kanban', auth, (req,res)=>{

  const fs = require('fs');

  const visitas = (_cacheVisitas || []);

  const colunas = {
    AGUARDANDO: [],
    CONFIRMADA: [],
    CONCLUIDA: [],
    CLIENTE_GOSTOU: [],
    POS_VISITA: [],
    PROPOSTA: [],
    NEGOCIACAO: [],
    FECHADO: [],
    PERDIDO: []
  };

  visitas.forEach(v => {

    if(v.pipelineStatus === 'FECHADO'){
      colunas.FECHADO.push(v);
    }
    else if(v.pipelineStatus === 'PROPOSTA'){
      colunas.PROPOSTA.push(v);
    }
    else if(v.pipelineStatus === 'NEGOCIACAO'){
      colunas.NEGOCIACAO.push(v);
    }
    else if(v.pipelineStatus === 'PERDIDO'){
      colunas.PERDIDO.push(v);
    }
    else if(v.pipelineStatus === 'CLIENTE_GOSTOU'){
      colunas.CLIENTE_GOSTOU.push(v);
    }
    else if(v.pipelineStatus === 'POS_VISITA'){
      colunas.POS_VISITA.push(v);
    }
    else if(v.status === 'CONCLUIDA'){
      colunas.CONCLUIDA.push(v);
    }
    else if(v.status === 'CONFIRMADA'){
      colunas.CONFIRMADA.push(v);
    }
    else {
      colunas.AGUARDANDO.push(v);
    }

  });

  res.render('app-visitas-kanban',{
    user:req.session.user,
    colunas
  });

});



app.post('/app/visita/:id/confirmar-caso2', auth, async (req, res) => {
  try {
    const { query: _qVC } = require('./services/db');
    const { id } = req.params;
    const { nome, telefone } = req.body;

    // Atualiza status da visita
    await _qVC("UPDATE visitas SET status='confirmada', dados=jsonb_set(COALESCE(dados,'{}'),'{confirmadaEm}',$1::jsonb) WHERE id=$2", [JSON.stringify(new Date().toISOString()), id]);

    // Busca dados da visita para montar link
    const r = await _qVC('SELECT * FROM visitas WHERE id=$1', [id]);
    const visita = r.rows[0];
    const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
    const link = BASE_URL + '/cliente/visita/' + id;
    const imovel = visita?.imovel_titulo || visita?.imovel_bairro || 'o imóvel';
    const data = visita?.data_visita || '';
    const hora = visita?.hora_visita || '';

    const msg = 'Olá ' + (nome||'') + '! Sua visita ao imóvel *' + imovel + '* foi confirmada' + (data?' para '+data:'') + (hora?' às '+hora:'') + '.\n\nAcesse o link para confirmar presença, remarcar ou cancelar:\n' + link;

    // Envia WhatsApp pelo corretor logado
    const userId = req.session.user.id;
    const { lerUsuarios: _luVC } = require('./services/salvarUsuario');
    const users = await _luVC();
    const user = users.find(u => u.id === userId);
    const instancia = user?.whatsappInstance;
    const numero = '55' + (telefone||'').replace(/\D/g,'').replace(/^55/,'');

    if (instancia && numero) {
      const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
      const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
      await fetch(EU + '/message/sendText/' + instancia, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': EK },
        body: JSON.stringify({ number: numero, text: msg })
      });
      await _qVC("UPDATE visitas SET dados=jsonb_set(COALESCE(dados,'{}'),'{waClienteEnviadoEm}',$1::jsonb) WHERE id=$2", [JSON.stringify(new Date().toISOString()), id]);
    }

    res.json({ ok: true });
  } catch(e) {
    console.error('[confirmar-caso2]', e.message);
    res.json({ ok: false, erro: e.message });
  }
});
app.post('/app/visitas/agendar/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.dataVisita = req.body.dataVisita || '';
      v.horaVisita = req.body.horaVisita || '';

      v.agendadaAt = new Date().toISOString();

      if(v.status === 'AGUARDANDO'){
        v.status = 'CONFIRMADA';
      }

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});


app.get('/cliente/visita/:id', async (req, res) => {
  try {
    const { query: _qV } = require('./services/db');
    const r = await _qV('SELECT * FROM visitas WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).send('Visita não encontrada');
    const row = r.rows[0];
    const visita = {
      id: row.id, leadId: row.lead_id, nome: row.nome, telefone: row.telefone,
      imovelId: row.imovel_id, imovelTitulo: row.imovel_titulo, imovelBairro: row.imovel_bairro,
      dataVisita: row.data_visita, horaVisita: row.hora_visita, status: row.status,
      userId: row.user_id, corretorId: row.corretor_id, obs: row.obs,
      proprietarioNome: row.proprietario_nome, proprietarioTelefone: row.proprietario_telefone,
      respostaProprietario: row.resposta_proprietario, confirmacaoClienteStatus: row.confirmacao_cliente_status,
      ...(row.dados || {})
    };
    res.render('cliente-visita-confirmar', { visita, user: null });
  } catch(e) {
    console.error('[cliente-visita]', e.message);
    res.status(500).send('Erro: ' + e.message);
  }
});


app.get('/cliente/visita/:id/confirmar', async (req, res) => {
  try {
    const { query: _qGC } = require('./services/db');
    await _qGC("UPDATE visitas SET status='lead_confirmou', confirmacao_cliente_status='CONFIRMADO' WHERE id=$1", [req.params.id]);
    const _v = (await _qGC('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (_v) {
      const { lerUsuarios: _lu } = require('./services/salvarUsuario');
      const _user = (await _lu()).find(u => u.id === (_v.user_id || _v.corretor_id));
      const _instancia = _user?.whatsappInstance;
      const _num = (_user?.celular || _user?.telefone || '').replace(/\D/g,'');
      if (_instancia && _num) {
        const _nome = _v.nome || 'Cliente';
        const _imovel = _v.imovel_titulo || _v.imovel_bairro || 'o imóvel';
        const _tel = (_v.telefone || '').replace(/\D/g,'');
        const _waLink = _tel ? 'https://wa.me/55' + _tel : '';
        const _msg = '*' + _nome + '* confirmou presença na visita de *' + _imovel + '*.' + (_waLink ? '\n\nWhatsApp do cliente: ' + _waLink : '');
        const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
        const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
        await fetch(EU + '/message/sendText/' + _instancia, { method:'POST', headers:{'Content-Type':'application/json','apikey':EK}, body: JSON.stringify({ number:'55'+_num.replace(/^55/,''), text:_msg }) });
      }
    }
    res.render('cliente-confirmado', { visita: { id: req.params.id, imovelTitulo: _v?.imovel_titulo||'', dataVisita: _v?.data_visita||'' }, status:'confirmado', user: null });
  } catch(e) { console.error('[get-confirmar]', e.message); res.status(500).send('Erro: '+e.message); }
});
app.get('/cliente/visita/:id/recusar', async (req, res) => {
  try {
    const { query: _qGR } = require('./services/db');
    await _qGR("UPDATE visitas SET status='lead_recusou', confirmacao_cliente_status='RECUSADO' WHERE id=$1", [req.params.id]);
    const _v = (await _qGR('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (_v) {
      const { lerUsuarios: _lu } = require('./services/salvarUsuario');
      const _user = (await _lu()).find(u => u.id === (_v.user_id || _v.corretor_id));
      const _instancia = _user?.whatsappInstance;
      const _num = (_user?.celular || _user?.telefone || '').replace(/\D/g,'');
      if (_instancia && _num) {
        const _nome = _v.nome || 'Cliente';
        const _imovel = _v.imovel_titulo || _v.imovel_bairro || 'o imóvel';
        const _tel = (_v.telefone || '').replace(/\D/g,'');
        const _waLink = _tel ? 'https://wa.me/55' + _tel : '';
        const _msg = '*' + _nome + '* não poderá comparecer na visita de *' + _imovel + '*.' + (_waLink ? '\n\nWhatsApp do cliente: ' + _waLink : '');
        const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
        const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
        await fetch(EU + '/message/sendText/' + _instancia, { method:'POST', headers:{'Content-Type':'application/json','apikey':EK}, body: JSON.stringify({ number:'55'+_num.replace(/^55/,''), text:_msg }) });
      }
    }
    res.render('cliente-confirmado', { visita: { id: req.params.id, imovelTitulo: _v?.imovel_titulo||'', dataVisita: _v?.data_visita||'' }, status:'recusado', user: null });
  } catch(e) { console.error('[get-recusar]', e.message); res.status(500).send('Erro: '+e.message); }
});

app.post('/cliente/visita/:id/confirmar', async (req, res) => {
  try {
    const { query: _qC } = require('./services/db');
    await _qC("UPDATE visitas SET status='lead_confirmou', confirmacao_cliente_status='CONFIRMADO' WHERE id=$1", [req.params.id]);
    const _v = (await _qC('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (_v) {
      const { lerUsuarios: _lu } = require('./services/salvarUsuario');
      const _user = (await _lu()).find(u => u.id === (_v.user_id || _v.corretor_id));
      const _instancia = _user?.whatsappInstance;
      const _num = (_user?.celular || _user?.telefone || '').replace(/\D/g,'');
      if (_instancia && _num) {
        const _nome = _v.nome || 'Cliente';
        const _tel = (_v.telefone || '').replace(/\D/g,'');
        const _imovel = _v.imovel_titulo || _v.imovel_bairro || 'o imóvel';
        const _waLink = _tel ? 'https://wa.me/55' + _tel : '';
        const _msg = '*' + _nome + '* confirmou presença na visita de *' + _imovel + '*.' + (_waLink ? '\n\nWhatsApp do cliente: ' + _waLink : '');
        const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
        const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
        await fetch(EU + '/message/sendText/' + _instancia, { method:'POST', headers:{'Content-Type':'application/json','apikey':EK}, body: JSON.stringify({ number:'55'+_num.replace(/^55/,''), text:_msg }) });
      }
    }
    res.render('cliente-confirmado', { visita: { id: req.params.id, imovelTitulo: _v?.imovel_titulo||'', dataVisita: _v?.data_visita||'' }, status:'confirmado', user: null });
  } catch(e) { console.error('[confirmar]', e.message); res.status(500).send('Erro: '+e.message); }
});

app.post('/cliente/visita/:id/recusar', async (req, res) => {
  try {
    const { query: _qR } = require('./services/db');
    await _qR("UPDATE visitas SET status='lead_recusou', confirmacao_cliente_status='RECUSADO' WHERE id=$1", [req.params.id]);
    const _v = (await _qR('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (_v) {
      const { lerUsuarios: _lu } = require('./services/salvarUsuario');
      const _user = (await _lu()).find(u => u.id === (_v.user_id || _v.corretor_id));
      const _instancia = _user?.whatsappInstance;
      const _num = (_user?.celular || _user?.telefone || '').replace(/\D/g,'');
      if (_instancia && _num) {
        const _nome = _v.nome || 'Cliente';
        const _tel = (_v.telefone || '').replace(/\D/g,'');
        const _imovel = _v.imovel_titulo || _v.imovel_bairro || 'o imóvel';
        const _waLink = _tel ? 'https://wa.me/55' + _tel : '';
        const _msg = '*' + _nome + '* não poderá comparecer na visita de *' + _imovel + '*.' + (_waLink ? '\n\nWhatsApp do cliente: ' + _waLink : '');
        const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
        const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
        await fetch(EU + '/message/sendText/' + _instancia, { method:'POST', headers:{'Content-Type':'application/json','apikey':EK}, body: JSON.stringify({ number:'55'+_num.replace(/^55/,''), text:_msg }) });
      }
    }
    res.render('cliente-confirmado', { visita: { id: req.params.id, imovelTitulo: _v?.imovel_titulo||'', dataVisita: _v?.data_visita||'' }, status:'recusado', user: null });
  } catch(e) { console.error('[recusar]', e.message); res.status(500).send('Erro: '+e.message); }
});

app.post('/cliente/visita/:id/responder', async (req, res) => {
  const { lerVisitas, salvarTodasVisitas } = require('./services/salvarVisita');
  const visitas = await lerVisitas();
  const idx = visitas.findIndex(v => String(v.id) === String(req.params.id));
  if (idx < 0) return res.status(404).send('Visita não encontrada');
  const acao = req.body.acao || 'confirmar';
  visitas[idx].status = acao === 'confirmar' ? 'lead_confirmou' : 'lead_recusou';
  visitas[idx].confirmacaoClienteStatus = acao === 'confirmar' ? 'CONFIRMADO' : 'RECUSADO';
  visitas[idx].confirmacaoClienteEm = new Date().toISOString();
  await salvarTodasVisitas(visitas);

  // Notifica corretor via WhatsApp
  try {
    const { query: _qResp } = require('./services/db');
    const _vRow = await _qResp('SELECT * FROM visitas WHERE id=$1', [req.params.id]);
    const _v = _vRow.rows[0];
    if (_v) {
      const { lerUsuarios: _luResp } = require('./services/salvarUsuario');
      const _users = await _luResp();
      const _user = _users.find(u => u.id === (_v.user_id || _v.corretor_id));
      const _instancia = _user?.whatsappInstance;
      const _numCorretor = (_user?.celular || _user?.telefone || '').replace(/\D/g,'');
      if (_instancia && _numCorretor) {
        const _nome = _v.nome || 'Cliente';
        const _tel = (_v.telefone || _v.contato || '').replace(/\D/g,'');
        const _imovel = _v.imovel_titulo || _v.imovel_bairro || 'o imóvel';
        const _data = _v.data_visita || '';
        const _waLink = _tel ? 'https://wa.me/55' + _tel : '';
        const _msg = acao === 'confirmar'
          ? '*' + _nome + '* confirmou presença na visita de *' + _imovel + '*' + (_data ? ' para ' + _data : '') + '.\n\n' + (_waLink ? 'WhatsApp do cliente: ' + _waLink : '')
          : '*' + _nome + '* não poderá comparecer na visita de *' + _imovel + '*' + (_data ? ' marcada para ' + _data : '') + '.\n\n' + (_waLink ? 'WhatsApp do cliente: ' + _waLink : '');
        const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
        const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
        await fetch(EU + '/message/sendText/' + _instancia, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EK },
          body: JSON.stringify({ number: '55' + _numCorretor.replace(/^55/,''), text: _msg })
        });
      }
    }
  } catch(e) { console.error('[responder-visita] erro WA corretor:', e.message); }
  res.render('cliente-confirmado', { visita: visitas[idx], user: null });
});

app.get('/cliente/visita/:id/remarcar', (req,res)=>{

  const fs = require('fs');

  const visitas = (_cacheVisitas || []);

  const visita = visitas.find(v =>
    String(v.id) === String(req.params.id)
  );

  if(!visita){
    return res.send('Visita não encontrada');
  }

  res.render('cliente-remarcar-visita',{
    visita
  });

});

app.post('/cliente/visita/:id/remarcar', async (req,res)=>{
  try {
    const { query: _qRem } = require('./services/db');
    const novaData = req.body.dataVisita || '';
    const novaHora = req.body.horaVisita || '';
    await _qRem("UPDATE visitas SET status='remarcado', data_visita=$2, hora_visita=$3 WHERE id=$1", [req.params.id, novaData, novaHora]);
    const _vRow = await _qRem('SELECT * FROM visitas WHERE id=$1', [req.params.id]);
    const _v = _vRow.rows[0];
    if (_v) {
      const { lerUsuarios: _luRem } = require('./services/salvarUsuario');
      const _users = await _luRem();
      const _user = _users.find(u => u.id === (_v.user_id || _v.corretor_id));
      const _instancia = _user?.whatsappInstance || 'match-corretor';
      const _numCorretor = (_user?.celular || _user?.telefone || '').replace(/\D/g,'');
      if (_numCorretor) {
        const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
        const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
        const BASE = 'https://matchimoveis.ia.br';
        const _imovel = _v.imovel_titulo || _v.imovel_bairro || 'imovel';
        const _linkConfirmar = BASE + '/corretor/visita/' + _v.id;
        const _msg = (_v.nome||'Cliente') + ' remarcou a visita ao imovel ' + _imovel + ' para ' + novaData + (novaHora ? ' as ' + novaHora : '') + '. Confirme: ' + _linkConfirmar;
        await fetch(EU + '/message/sendText/' + _instancia, { method:'POST', headers:{'Content-Type':'application/json','apikey':EK}, body: JSON.stringify({ number:'55'+_numCorretor.replace(/^55/,''), text:_msg }) });
        console.log('[remarcar] WA corretor notificado');
      }
    }
    res.render('cliente-confirmado', { visita: { id: req.params.id, imovelTitulo: _v?.imovel_titulo||'', dataVisita: novaData }, status:'remarcado', user: null });
  } catch(e) { console.error('[remarcar]', e.message); res.status(500).send('Erro: '+e.message); }
});
app.post('/app/visitas/checkin/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.checkinAt = new Date().toISOString();

      v.status = 'VISITA_INICIADA';

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/finalizar/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.visitaFinalizadaAt = new Date().toISOString();

      v.status = 'VISITA_FINALIZADA';

      v.pipelineStatus = 'POS_VISITA';

      v.proximaAcao = 'Entrar em contato para entender percepção do cliente';

      v.prioridade = 'QUENTE';

      v.alertaOperacional = true;

      if(!v.observacoes){
        v.observacoes = [];
      }

      v.observacoes.unshift({
        texto:'Sistema iniciou fluxo automático de pós-visita',
        user:'IA Operacional',
        createdAt:new Date().toISOString()
      });

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/negociacao/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.pipelineStatus = 'NEGOCIACAO';

      v.proximaAcao = 'Acompanhar negociação com cliente';

      v.negociacaoAt = new Date().toISOString();

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas-kanban');
});

app.post('/app/visitas/perdido/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.pipelineStatus = 'PERDIDO';

      v.proximaAcao = 'Lead perdido';

      v.perdidoAt = new Date().toISOString();

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas-kanban');
});


app.post('/app/visitas/parceiro-confirmou/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.parceiroConfirmouAt = new Date().toISOString();

      if(!v.observacoes){
        v.observacoes = [];
      }

      v.observacoes.unshift({
        texto:'Parceiro confirmou disponibilidade da visita',
        user:'Sistema',
        createdAt:new Date().toISOString()
      });

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/proprietario-confirmou/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.proprietarioConfirmouAt = new Date().toISOString();
      v.proprietarioConfirmou = true;
      v.confirmacaoProprietarioStatus = 'CONFIRMADO';

      if(!v.observacoes){
        v.observacoes = [];
      }

      v.observacoes.unshift({
        texto:'Proprietário confirmou disponibilidade da visita',
        user:'Sistema',
        createdAt:new Date().toISOString()
      });

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/cliente-chegou/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.clienteChegouAt = new Date().toISOString();

      v.status = 'CLIENTE_CHEGOU';

      v.proximaAcao = 'Iniciar visita ao imóvel';

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/no-show/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.status = 'NO_SHOW';

      v.noShowAt = new Date().toISOString();

      v.proximaAcao = 'Entrar em contato para reagendar';

      v.prioridade = 'MORNA';

      if(!v.observacoes){
        v.observacoes = [];
      }

      v.observacoes.unshift({
        texto:'Cliente não compareceu na visita',
        user:'Sistema',
        createdAt:new Date().toISOString()
      });

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/proposta-valor/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.valorProposta = req.body.valorProposta || '';

      v.propostaUpdatedAt = new Date().toISOString();

      v.pipelineStatus = 'PROPOSTA';

      v.proximaAcao = 'Aguardar retorno da proposta';

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/perda-motivo/:id', auth, async (req,res)=>{
  const fs = require('fs');

  let visitas = (_cacheVisitas || []);

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.pipelineStatus = 'PERDIDO';

      v.motivoPerda = req.body.motivoPerda || '';

      v.perdidoAt = new Date().toISOString();

      v.proximaAcao = 'Lead perdido';

    }

    return v;

  });

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/app/visitas');
});


// ── WHATSAPP CONEXÃO POR USUÁRIO ─────────────────────────────
app.get('/app/whatsapp/qrcode', auth, async (req, res) => {
  const userId = req.session.user.id;
  const { lerUsuarios: _luQR2, salvarTodosUsuarios: _salvarQR2 } = require('./services/salvarUsuario');
  const _usersQR2 = await _luQR2();
  const _userQR2 = _usersQR2.find(u => u.id === userId);
  const EVOLUTION_URL2 = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
  const EVOLUTION_KEY2 = process.env.EVOLUTION_KEY || 'match2025evolution';
  let instanceName2 = 'match-' + userId.replace(/[^a-z0-9]/gi,'').toLowerCase().substring(0,20);
  try {
    // Deleta instância antiga e recria limpa
    await fetch(EVOLUTION_URL2 + '/instance/delete/' + instanceName2, { method: 'DELETE', headers: { 'apikey': EVOLUTION_KEY2 } }).catch(()=>{});
    delete _qrCache[instanceName2];
    await new Promise(r => setTimeout(r, 1000));
    // Cria instância nova com webhook configurado para receber QR
    const createRes = await fetch(EVOLUTION_URL2 + '/instance/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY2 },
      body: JSON.stringify({
        instanceName: instanceName2,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhook: {
          url: (process.env.BASE_URL || 'https://matchimoveis.onrender.com') + '/webhook/whatsapp',
          enabled: true,
          byEvents: true,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED']
        }
      })
    });
    const createData = await createRes.json();
    // Busca token: vem no create ou busca via fetchInstances se já existia
    let instanceToken = createData?.hash;
    if (!instanceToken) {
      try {
        const fetchRes = await fetch(EVOLUTION_URL2 + '/instance/fetchInstances', { headers: { 'apikey': EVOLUTION_KEY2 } });
        const fetchData = await fetchRes.json();
        const instList = Array.isArray(fetchData) ? fetchData : (fetchData?.data || []);
        const inst = instList.find(i => i.name === instanceName2);
        instanceToken = inst?.token || null;
        console.log('[QRCODE2] fetchInstances: lista=', instList.length, '| inst encontrada=', !!inst, '| token=', instanceToken?.substring(0,8));
      } catch(e) { console.log('[QRCODE2] erro fetchInstances:', e.message); }
    }
    console.log('[QRCODE2] instância criada:', instanceName2, '| status:', createData?.instance?.status, '| token:', instanceToken?.substring(0,8));
    // QR já vem na resposta do create
    const qrDireto = createData?.qrcode?.base64 || createData?.instance?.qrcode?.base64;
    if (qrDireto) {
      console.log('[QRCODE2] QR encontrado direto no create!');
      const _usersQR3b = await _luQR2();
      const _idxQR3b = _usersQR3b.findIndex(u => u.id === userId);
      if (_idxQR3b >= 0) { _usersQR3b[_idxQR3b].whatsappInstance = instanceName2; _usersQR3b[_idxQR3b].whatsappStatus = 'connecting'; await _salvarQR2(_usersQR3b).catch(()=>{}); }
      return res.json({ ok: true, base64: qrDireto, instanceName: instanceName2 });
    }
    // Salva instância no usuário
    const _usersQR3 = await _luQR2();
    const _idxQR = _usersQR3.findIndex(u => u.id === userId);
    if (_idxQR >= 0) { _usersQR3[_idxQR].whatsappInstance = instanceName2; _usersQR3[_idxQR].whatsappStatus = 'connecting'; await _salvarQR2(_usersQR3).catch(()=>{}); }
    // Polling: busca QR via /instance/connect a cada 3s
    for (let _wi = 0; _wi < 10; _wi++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const qrRes = await fetch(EVOLUTION_URL2 + '/instance/connect/' + instanceName2, {
          headers: { 'apikey': instanceToken }
        });
        const qrData = await qrRes.json();
        const directQR = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.code;
        if (directQR) {
          console.log('[QRCODE2] QR encontrado via connect tentativa', _wi+1);
          return res.json({ ok: true, base64: directQR, instanceName: instanceName2 });
        }
        console.log('[QRCODE2] connect tentativa', _wi+1, ':', JSON.stringify(qrData).substring(0,80));
      } catch(_qrErr) { console.log('[QRCODE2] erro connect:', _qrErr.message); }
      if (_qrCache[instanceName2]?.base64) {
        return res.json({ ok: true, base64: _qrCache[instanceName2].base64, instanceName: instanceName2 });
      }
    }
    return res.json({ ok: false, erro: 'QR não gerado em 30s — tente novamente' });
  } catch(e) {
    return res.json({ ok: false, erro: e.message });
  }
});
// ROTA_QRCODE_ANTIGA_DESATIVADA
app.get('/app/whatsapp/qrcode_old_disabled', auth, async (req, res) => {
  const userId = req.session.user.id;
  console.log('[QRCODE] userId:', userId);
  // Usa instância salva no user ou gera nova
  const { lerUsuarios: _luQR } = require('./services/salvarUsuario');
  const _usersQR = await _luQR();
  const _userQR = _usersQR.find(u => u.id === userId);
  let instanceName = _userQR?.whatsappInstance || ('match-' + userId.replace(/[^a-z0-9]/gi, '').toLowerCase().substring(0, 20));
  const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
  const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';

  try {
    // Cria instância se não existir
    await fetch(EVOLUTION_URL + '/instance/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          url: (process.env.BASE_URL || 'https://matchimoveis.onrender.com') + '/webhook/whatsapp',
          enabled: true,
          byEvents: true,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']
        }
      })
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    // Gera QR Code
    // v2.2.3: tenta até 5x com intervalo de 3s para gerar o QR
    let qrData = {};
    for (let _i = 0; _i < 5; _i++) {
      await new Promise(r => setTimeout(r, 3000));
      const qrRes = await fetch(EVOLUTION_URL + '/instance/connect/' + instanceName, {
        headers: { 'apikey': EVOLUTION_KEY }
      });
      qrData = await qrRes.json();
      const _b64 = qrData.base64 || qrData.qrcode?.base64 || qrData.code || qrData.qrcode?.code;
      console.log('[QRCODE] tentativa', _i+1, '| instanceName:', instanceName, '| keys:', Object.keys(qrData), '| base64:', !!_b64);
      if (_b64) break;
    }
    const _qrFinal = qrData.base64 || qrData.qrcode?.base64 || qrData.code || qrData.qrcode?.code;
    console.log('[QRCODE] instanceName:', instanceName, '| qrData keys:', Object.keys(qrData), '| base64 existe:', !!_qrFinal, '| code existe:', !!qrData.code);
    // Se não gerou QR — instância travada, recria com nome novo
    if (!_qrFinal) {
      const novoNome = 'match-' + userId.replace(/[^a-z0-9]/gi,'').toLowerCase().substring(0,15) + '-' + Date.now().toString().slice(-4);
      console.log('[QRCODE] instância travada, recriando como:', novoNome);
      await fetch(EVOLUTION_URL + '/instance/delete/' + instanceName, { method: 'DELETE', headers: { 'apikey': EVOLUTION_KEY } }).catch(()=>{});
      await new Promise(r => setTimeout(r, 1500));
      await fetch(EVOLUTION_URL + '/instance/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
        body: JSON.stringify({ instanceName: novoNome, integration: 'WHATSAPP-BAILEYS', webhook: { url: (process.env.BASE_URL || 'https://matchimoveis.onrender.com') + '/webhook/whatsapp', enabled: true, byEvents: true, events: ['MESSAGES_UPSERT','CONNECTION_UPDATE'] } })
      }).catch(()=>{});
      await new Promise(r => setTimeout(r, 2000));
      const qrRes2 = await fetch(EVOLUTION_URL + '/instance/connect/' + novoNome, { headers: { 'apikey': EVOLUTION_KEY } });
      const qrData2 = await qrRes2.json();
      if (qrData2.base64 || qrData2.code) {
        instanceName = novoNome;
        Object.assign(qrData, qrData2);
        console.log('[QRCODE] nova instância gerou QR:', novoNome);
      }
    }

    // Salva instanceName no usuário
    const { lerUsuarios: _lerU, salvarTodosUsuarios: _salvarU } = require('./services/salvarUsuario');
    const users = await _lerU();
    const idx = users.findIndex(u => u.id === userId);
    if (idx >= 0) {
      users[idx].whatsappInstance = instanceName;
      users[idx].whatsappStatus = 'connecting';
      _salvarU(users).catch(e=>console.error("[users]",e.message));
    }

    res.json({ ok: true, base64: qrData.base64 || qrData.qrcode?.base64 || qrData.code || qrData.qrcode?.code, instanceName });
  } catch(e) {
    res.json({ ok: false, erro: e.message });
  }
});

app.get('/app/whatsapp/status', auth, async (req, res) => {
  const user = req.session.user;
  const { lerUsuarios: _luSt } = require("./services/salvarUsuario"); const _uSt = await _luSt(); const _uStFind = _uSt.find(u => u.id === req.session.user.id); const instanceName = _uStFind?.whatsappInstance || req.session.user.whatsappInstance || ("match-" + req.session.user.id.replace(/[^a-z0-9]/gi, "").toLowerCase().substring(0, 20));
  const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
  const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';

  try {
    const r = await fetch(EVOLUTION_URL + '/instance/connectionState/' + instanceName, {
      headers: { 'apikey': EVOLUTION_KEY }
    });
    const d = await r.json();
    const _statusEvo = d.instance?.state || 'close';
    const _statusBanco = _uStFind?.whatsapp_status || _uStFind?.whatsappStatus || '';
    const status = (_statusBanco === 'disconnected') ? 'close' : _statusEvo;

    // Atualiza status no users.json
    if (status === 'open') {
      const { lerUsuarios: _luS, salvarTodosUsuarios: _suS } = require('./services/salvarUsuario');
      const users = await _luS();
      const idx = users.findIndex(u => u.id === user.id);
      if (idx >= 0) {
        users[idx].whatsappStatus = 'open';
        users[idx].whatsappInstance = instanceName;
        // Pega ownerJid
        const instRes = await fetch(EVOLUTION_URL + '/instance/fetchInstances', { headers: { 'apikey': EVOLUTION_KEY } });
        const instData = await instRes.json();
        const inst = instData.find(i => i.name === instanceName);
        if (inst && inst.ownerJid) {
          users[idx].whatsappNumero = inst.ownerJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        }
        await _suS(users);
        req.session.user = { ...req.session.user, ...users[idx] };
      }
    }

    res.json({ ok: true, status, instanceName });
  } catch(e) {
    res.json({ ok: false, status: 'close', erro: e.message });
  }
});

app.post('/app/whatsapp/desconectar', auth, async (req, res) => {
  const user = req.session.user;
  const instanceName = user.whatsappInstance;
  if (!instanceName) return res.json({ ok: false, erro: 'sem instancia' });
  const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
  const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';

  try {
    await fetch(EVOLUTION_URL + '/instance/logout/' + instanceName, {
      method: 'DELETE', headers: { 'apikey': EVOLUTION_KEY }
    });
    const users = (_cacheUsuarios || []);
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) {
      users[idx].whatsappStatus = 'disconnected';
      users[idx].whatsappNumero = '';
      salvarTodosUsuarios(users).catch(e=>console.error("[users]",e.message));
      req.session.user = users[idx];
    }
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, erro: e.message });
  }
});

// ── EXCLUIR LEAD ─────────────────────────────────────────────
app.delete('/app/lead/:id', auth, async (req, res) => {
  try {
    const uid = String(req.session.user.id || '');
    const leads = await lerLeads(req.session.user.id);
    const idx = leads.findIndex(l => String(l.id) === String(req.params.id));
    if (idx < 0) return res.status(404).json({ erro: 'lead nao encontrada' });
    const lead = leads[idx];
    const telefone = String(lead.telefone || lead.whatsapp || lead.contato || '').replace(/\D/g,'');
    // Deleta a lead do banco
    await deletarLead(req.params.id, uid);
    console.log('[LEAD] deletada:', req.params.id, '| userId:', uid);
    try {
      var aud1 = require('./services/db').query;
      var D1 = String.fromCharCode(36);
      var sqlIns1 = 'INSERT INTO leads_auditoria (lead_id, nome, telefone, user_id, acao) VALUES (' + D1 + '1,' + D1 + '2,' + D1 + '3,' + D1 + '4,' + D1 + '5)';
      await aud1(sqlIns1, [req.params.id, lead.nome||'', telefone, uid, 'excluir']);
    } catch(e1) { console.error('[AUDITORIA]', e1.message); }
    // Histórico WhatsApp: não deletar na Evolution para não bloquear novas mensagens
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── BLOQUEAR NÚMERO ──────────────────────────────────────────
app.post('/app/lead/:id/bloquear', auth, async (req, res) => {
  try {
    const uid = String(req.session.user.id || '');
    const { query: _qBlk } = require('./services/db');
    // Busca telefone direto do banco
    const _leadRow = await _qBlk('SELECT telefone, whatsapp, contato FROM leads WHERE id=$1', [req.params.id]);
    const _leadDb = _leadRow.rows[0] || {};
    const leads = (_cacheLeads || []);
    const idx = leads.findIndex(l => String(l.id) === String(req.params.id));
    const lead = idx >= 0 ? leads[idx] : {};
    const telefone = String(_leadDb.telefone || _leadDb.whatsapp || _leadDb.contato || lead.telefone || lead.whatsapp || lead.contato || '').replace(/\D/g,'');
    console.log('[BLOQUEAR] telefone:', telefone, '| uid:', uid);
    // Salva na lista negra do usuário no banco
    if (telefone) {
      await _qBlk("UPDATE usuarios SET dados = jsonb_set(COALESCE(dados,'{}'), '{bloqueados}', COALESCE(dados->'bloqueados','[]')::jsonb || $1::jsonb) WHERE id=$2", [JSON.stringify([telefone]), uid]);
      console.log('[BLOQUEAR] salvo no banco!');
    }
    // Remove a lead do banco
    await deletarLead(req.params.id, uid);
    console.log('[LEAD] bloqueada:', telefone, 'por:', uid);
    try {
      var aud2 = require('./services/db').query;
      var D2 = String.fromCharCode(36);
      var sqlIns2 = 'INSERT INTO leads_auditoria (lead_id, nome, telefone, user_id, acao) VALUES (' + D2 + '1,' + D2 + '2,' + D2 + '3,' + D2 + '4,' + D2 + '5)';
      await aud2(sqlIns2, [req.params.id, lead.nome||'', telefone, uid, 'excluir_bloquear']);
    } catch(e2) { console.error('[AUDITORIA]', e2.message); }
    res.json({ ok: true, bloqueado: telefone });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});


// ── EDITAR PERFIL IA DA LEAD ─────────────────────────────────────────
app.post('/app/lead/:id/perfil', auth, async (req, res) => {
  try {
    const { atualizarLead, lerLeads } = require('./services/salvarLead');
    const { perfilIA } = req.body;
    if (!perfilIA) return res.status(400).json({ erro: 'perfilIA obrigatório' });
    await atualizarLead(req.params.id, { perfilIA });
    res.json({ ok: true });
    // Roda match em background
    setImmediate(async () => {
      try {
        const leads = await lerLeads();
        const lead = leads.find(l => String(l.id) === String(req.params.id));
        if (!lead) return;
        const matchCore = require('./cerebro/match-core');
        await matchCore.processar({ lead: { ...lead, perfilIA }, mensagem: '', canal: 'manual', userId: lead.userId || lead.codigoUsuario });
        console.log('[PERFIL EDIT] match rodado para lead:', req.params.id);
      } catch(e) { console.error('[PERFIL EDIT] erro match:', e.message); }
    });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});
// ── CADASTRO MANUAL DE LEAD ─────────────────────────────────────────
app.post('/app/lead/manual', auth, async (req, res) => {
  try {
    const uid = req.session.user.id || req.session.user.codigo_usuario;
    const { nome, telefone, email, tipo, transacao, estado, cidade, bairro,
            valorMax, valorMin, quartos, suites, vagas, banheiros, area, fase,
            origem, origemEntrada } = req.body;

    const { salvarLead } = require('./services/salvarLead');
    const id = Date.now().toString();

    const perfilIA = {
      tipo, intencao: transacao, estado, cidade, bairro,
      valorMax: parseFloat(valorMax)||0, valorMin: parseFloat(valorMin)||0,
      quartos: parseInt(quartos)||0, suites: parseInt(suites)||0,
      vagas: parseInt(vagas)||0, banheiros: parseInt(banheiros)||0,
      area: parseFloat(area)||0, fase: fase||''
    };

    const lead = {
      id, nome: nome||'',
      telefone: _normTel(telefone),
      whatsapp: _normTel(telefone),
      contato: _normTel(telefone),
      email: email||'', origem: origem||'manual',
      origemEntrada: origemEntrada||'manual',
      status: 'novo', faseFunil: 'novo', temperatura: 'frio', score: 0,
      userId: uid, codigoUsuario: uid,
      perfilIA, mensagens: [], matches: [], matchesAuto: [],
      timeline: [], eventos: [], followUps: [],
      criadoEm: new Date().toISOString(),
      dados: { origemEntrada: 'manual', mensagem: '', matchAutoEm: null }
    };

    await salvarLead(lead);
    consumir(uid, 'nova_lead').catch(e => console.error('[nova_lead]', e.message));

    // Roda match via import-processor
    setTimeout(async () => {
      try {
        const { processarLeadImportada } = require('./cerebro/import-processor');
        const { atualizarLead } = require('./services/salvarLead');
        const matchCore = require('./cerebro/match-core');
        const _mapa = await processarLeadImportada(lead);
        if (_mapa) {
          lead.mapaIntencao = _mapa;
          await atualizarLead(lead.id, { mapaIntencao: _mapa });
          await matchCore.processar({ lead, mensagem: '', canal: 'manual', userId: uid, instancia: null });
          console.log('[LEAD MANUAL] match rodado:', id);
        }
      } catch(e) { console.error('[LEAD MANUAL] erro match:', e.message); }
    }, 2000);

    res.json({ ok: true, id });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── CLASSIFICAR LEAD ─────────────────────────────────────────
app.post('/app/lead/:id/classificar', auth, async (req, res) => {
  try {
    const uid = String(req.session.user.id || '');
    const { tipoLead } = req.body;
    if (!['cliente','vendedor','corretor'].includes(tipoLead)) return res.status(400).json({ erro: 'tipo invalido' });
    const leads = (_cacheLeads || []);
    const idx = leads.findIndex(l => String(l.id) === String(req.params.id));
    if (idx < 0) return res.status(404).json({ erro: 'lead nao encontrada' });
    leads[idx].tipoLead = tipoLead;
    leads[idx].tipoLeadAtualizadoEm = new Date().toISOString();
    leads[idx].tipoLeadAtualizadoPor = uid;
    await salvarTodosLeads(leads);
    // Salva no banco PG
    try {
      const { query: _qCL } = require('./services/db');
      await _qCL('UPDATE leads SET tipo_lead=$1 WHERE id=$2', [tipoLead, String(req.params.id)]);
    } catch(_eCL){ console.error('[LEAD] erro classificar PG:', _eCL.message); }
    console.log('[LEAD] classificada como:', tipoLead, '| id:', req.params.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── IMÓVEL DO VENDEDOR ───────────────────────────────────────
app.post('/app/lead/:id/imovel-vendedor', auth, async (req, res) => {
  try {
    const leads = (_cacheLeads || []);
    const idx = leads.findIndex(l => String(l.id) === String(req.params.id));
    if (idx < 0) return res.status(404).json({ erro: 'lead nao encontrada' });
    leads[idx].imovelVendedor = {
      tipo: req.body.tipo || 'apartamento',
      finalidade: req.body.finalidade || 'venda',
      bairro: req.body.bairro || '',
      quartos: Number(req.body.quartos) || 0,
      area: Number(req.body.area) || 0,
      valor: Number(req.body.valor) || 0,
      obs: req.body.obs || '',
      cadastradoEm: new Date().toISOString()
    };
    await _slVend(leads);
    console.log('[LEAD] imovel vendedor salvo | lead:', req.params.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── COMPORTAMENTO DO LEAD (Fase 4 — Motor de Intenção) ─────────
// Recebe eventos de comportamento: visualizou_imovel, salvou_imovel,
// compartilhou, abriu_mapa, clicou_contato, viu_vitrine
app.post('/app/lead/:id/comportamento', auth, async (req, res) => {
  try {
    const { registrarComportamento } = require('./cerebro/motor-intencao');
    const { atualizarLead, lerLeads } = require('./services/salvarLead');
    const userId = req.session.user.id;
    const leads = await lerLeads(userId);
    const lead = leads.find(l => String(l.id) === String(req.params.id));
    if (!lead) return res.status(404).json({ erro: 'lead nao encontrada' });

    const evento = {
      tipo:              req.body.tipo,
      duracao_segundos:  Number(req.body.duracao_segundos) || 0,
      em:                new Date().toISOString(),
      imovel: req.body.imovel || null
    };

    const leadAtualizado = registrarComportamento(lead, evento);
    await atualizarLead(leadAtualizado.id, {
      comportamento:    leadAtualizado.comportamento,
      mapaIntencao:     leadAtualizado.mapaIntencao,
      intencoesOcultas: leadAtualizado.intencoesOcultas
    });

    console.log(`[COMPORTAMENTO] lead:${lead.id} | evento:${evento.tipo} | ocultos:${JSON.stringify(Object.fromEntries(Object.entries(leadAtualizado.intencoesOcultas||{}).filter(([,v])=>v.score>0).map(([k,v])=>[k,v.score])))}`);
    res.json({ ok: true, fase: leadAtualizado.mapaIntencao?.fase, temperatura: leadAtualizado.mapaIntencao?.temperatura });
  } catch(e) {
    console.error('[COMPORTAMENTO] erro:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// ── RECOMENDAÇÕES PROATIVAS (Fase 5 — Recommendation Engine) ────
app.get('/app/lead/:id/recomendacoes', auth, async (req, res) => {
  try {
    const { recomendar, inferirOcultos } = require('./cerebro/motor-intencao');
    const { lerLeads } = require('./services/salvarLead');
    const { query: _q } = require('./services/db');
    const userId = req.session.user.id;
    const leads = await lerLeads(userId);
    const lead = leads.find(l => String(l.id) === String(req.params.id));
    if (!lead) return res.status(404).json({ erro: 'lead nao encontrada' });

    const resIm = await _q("SELECT * FROM imoveis WHERE status='ativo'");
    const imoveis = resIm.rows;

    lead.intencoesOcultas = inferirOcultos(lead);
    const recomendacoes = recomendar(lead, imoveis, { limite: 8, diversidade: true });

    console.log(`[RECOMENDACOES] lead:${lead.id} | total:${recomendacoes.length}`);
    res.json({ ok: true, recomendacoes, intencoesOcultas: lead.intencoesOcultas });
  } catch(e) {
    console.error('[RECOMENDACOES] erro:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// ── STATUS HASH — detecta mudanças nas leads sem recarregar ──
app.get('/api/leads/status-hash', auth, async (req, res) => {
  try {
    const { query: _qHash } = require('./services/db');
    const r = await _qHash(
      "SELECT COUNT(*) as total, MAX(atualizado_em) as ultima FROM leads WHERE user_id=$1 OR codigo_usuario=$1",
      [req.session.user.id]
    );
    const { total, ultima } = r.rows[0];
    const hash = `${total}-${ultima}`;
    res.json({ ok: true, hash });
  } catch(e) {
    res.json({ ok: false, hash: '' });
  }
});

// ── PARCEIROS ────────────────────────────────────────────────
app.get('/app/feed', auth, async (req, res) => {
  try {
    const myId = req.session.user?.codigoUsuario || req.session.user?.codigo;
    const { lerImoveis: _lerFeed } = require('./services/salvarImovel');
    const { lerUsuarios: _lerUsrFeed } = require('./services/salvarUsuario');
    const todos = await _lerFeed();
    const usuarios = await _lerUsrFeed();

    // mapa userId -> nome — testa todos os campos possíveis
    const nomeMap = {};
    usuarios.forEach(u => {
      const nome = u.nome || u.name || '';
      const ids = [u.codigo_usuario, u.codigoUsuario, u.codigo, u.id, u._id, u.dados?.user_id_legado].filter(Boolean);
      ids.forEach(uid => { if(uid && nome) nomeMap[String(uid)] = nome; });
    });
    console.log('[feed] nomeMap:', JSON.stringify(nomeMap));
    // REGRAS DO FEED — baseado na carteira do corretor, sem GPS
    const _feedLeads = _cacheLeads || [];
    const meusLeads = _feedLeads.filter(l => (l.userId||l.codigoUsuario||l.user_id) === myId);
    const demandaMap = {};
    meusLeads.forEach(lead => {
      const perfil = lead.perfilIa || lead.perfil_ia || lead.dados || {};
      const cidade = (perfil.cidade||'').toLowerCase().trim();
      const bairro = (perfil.bairro||'').toLowerCase().trim();
      const tipo   = (perfil.tipo||perfil.tipo_imovel||'').toLowerCase().trim();
      if(cidade) demandaMap[cidade] = (demandaMap[cidade]||0) + 2;
      if(bairro) demandaMap[bairro] = (demandaMap[bairro]||0) + 3;
      if(tipo)   demandaMap[tipo]   = (demandaMap[tipo]||0)   + 1;
    });
    const leadsMap = {};
    meusLeads.forEach(lead => {
      const matches = lead.matchesBase || lead.matchesAuto || lead.matches || [];
      matches.forEach(m => {
        const mids = [m.id, m.id_externo, m.id_interno, m.imovelId, m.idInterno].filter(Boolean).map(String);
        mids.forEach(mid => {
          if(!leadsMap[mid]) leadsMap[mid] = [];
          leadsMap[mid].push({id: lead.id, nome: lead.nome||'Lead', tel: (lead.telefone||lead.whatsapp||lead.contato||'').replace(/\D/g,'')});
        });
      });
    });
    // mapa de bairros/cidades da carteira do usuário logado
    const _meusImoveis = todos.filter(im => (im.user_id||im.userId||im.codigoUsuario) === myId);
    const _carteiraMap = {};
    _meusImoveis.forEach(im => {
      const b = (im.bairro||'').toLowerCase().trim();
      const c = (im.cidade||'').toLowerCase().trim();
      if(b) _carteiraMap[b] = (_carteiraMap[b]||0) + 1;
      if(c) _carteiraMap[c] = (_carteiraMap[c]||0) + 0.5;
    });
    // normaliza para score 0-100
    const _carteiraMax = Math.max(...Object.values(_carteiraMap), 1);
    const _carteiraScore = (key) => Math.round(((_carteiraMap[key]||0) / _carteiraMax) * 100);

    // extrai cidade/estado dominante da CARTEIRA do corretor (mais preciso que o endereço do perfil)
    const _cidadesCarteira = {};
    const _estadosCarteira = {};
    _meusImoveis.forEach(im => {
      const _c = (im.cidade||'').toLowerCase().trim();
      const _e = (im.estado||'').toLowerCase().trim();
      if(_c) _cidadesCarteira[_c] = (_cidadesCarteira[_c]||0) + 1;
      if(_e) _estadosCarteira[_e] = (_estadosCarteira[_e]||0) + 1;
    });
    const _cidadeUser = Object.entries(_cidadesCarteira).sort((a,b)=>b[1]-a[1])[0]?.[0] || (req.session.user?.cidade||'').toLowerCase().trim();
    const _estadoUser = Object.entries(_estadosCarteira).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';

    const { query: _qVF } = require('./services/db');
    const _vistosRow2 = await (async()=>{ try{ const rv=await _qVF('SELECT feed_vistos FROM usuarios WHERE id=$1',[req.session.user.id]); return rv.rows[0]?.feed_vistos||[]; }catch(e){return[];} })();
    let _todosValidos = todos.filter(im => im.status !== 'inativo' && im.status !== 'excluido' && (im.user_id || im.userId || im.codigoUsuario) && ((im.fotos && im.fotos.length > 0) || (im.tourVirtual && im.tourVirtual !== '')));
    let _naoVistos = _todosValidos.filter(im => !_vistosRow2.includes(String(im.id||im.id_externo||im.id_interno||'')));
    // Se menos de 10 não vistos, reseta o baralho
    if (_naoVistos.length < 10) {
      await _qVF("UPDATE usuarios SET feed_vistos='[]'::jsonb WHERE id=$1", [req.session.user.id]);
      _naoVistos = _todosValidos;
    }
    let imoveis = _naoVistos;
    imoveis = imoveis.map(im => {
      const uid = im.user_id || im.userId || im.codigoUsuario;
      const nomeUsuario = nomeMap[uid] || '';
      const _uObj = (_cacheUsuarios||[]).find(u=>u.id===uid||u.codigo_usuario===uid);
      const _uTel = (_uObj?.celular||_uObj?.telefone||'').replace(/\D/g,'');
      const mid = String(im.id || im.id_externo || '');
      const mid2 = String(im.id_externo || '');
      const lc = [...(leadsMap[mid]||[]), ...(mid2 && mid2!==mid ? (leadsMap[mid2]||[]) : [])];
      const _cidade = (im.cidade||'').toLowerCase().trim();
      const _bairro = (im.bairro||'').toLowerCase().trim();
      const _tipo   = (im.tipo||'').toLowerCase().trim();
      const _demanda = (demandaMap[_cidade]||0) + (demandaMap[_bairro]||0) + (demandaMap[_tipo]||0);
      // proximidade
      const _imEstado = (im.estado||'').toLowerCase().trim();
      const _proxEstado = _estadoUser && _imEstado && (_imEstado.includes(_estadoUser) || _estadoUser.includes(_imEstado)) ? 80 : 0;
      const _proxCidade = _cidadeUser && _cidade && _cidade.includes(_cidadeUser) ? 120 : 0;
      // recencia (dias desde criacao, max 30 pontos)
      const _criado = im.criado_em ? new Date(im.criado_em).getTime() : 0;
      const _diasAtras = _criado ? Math.max(0, (Date.now() - _criado) / 86400000) : 999;
      const _recencia = Math.max(0, 30 - _diasAtras);
      const _carteiraBairro = _carteiraScore(_bairro);
      const _carteiraCidade = _carteiraScore(_cidade);
      const _score = (lc.length * 10) + _demanda + _proxEstado + _proxCidade + _recencia + _carteiraBairro + (_carteiraCidade * 0.5);
      const _likesCount = Array.isArray(im.dados?.likes) ? im.dados.likes.length : 0;
      return {...im, _nomeUsuario: nomeUsuario, _userTelefone: _uTel, _dist: 9999, _leadsCompativeis: lc.length, _leadsNomes: lc.slice(0,3).map(l=>({nome:l.nome,tel:l.tel||''})), _demanda, _score, _likesCount};
    });
    // intercala 1x1 por usuario — cada grupo ordenado por data desc
    const _porUser = {};
    imoveis.forEach(im => {
      const uid = im.user_id||im.userId||im.codigoUsuario||'sem_id';
      if(!_porUser[uid]) _porUser[uid] = [];
      _porUser[uid].push(im);
    });
    const _grupos = Object.values(_porUser);
    // embaralha a ordem dos grupos (usuários) a cada requisição
    for(let i=_grupos.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[_grupos[i],_grupos[j]]=[_grupos[j],_grupos[i]];}
    // dentro de cada grupo: vídeos primeiro, resto embaralhado
    _grupos.forEach(g => {
      const comVid = g.filter(i => i.tourVirtual && i.tourVirtual !== '');
      let semVid = g.filter(i => !i.tourVirtual || i.tourVirtual === '');
      // embaralha os sem vídeo
      for(let i=semVid.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[semVid[i],semVid[j]]=[semVid[j],semVid[i]];}
      g.length = 0; comVid.forEach(i => g.push(i)); semVid.forEach(i => g.push(i));
    });
    const _mix = [];
    const _max = Math.max(..._grupos.map(g => g.length));
    for(let i=0; i<_max; i++){ _grupos.forEach(g => { if(g[i]) _mix.push(g[i]); }); }
    imoveis = _mix.slice(0, 500);

    res.render('app-feed', { user: req.session.user, imoveis });
  } catch(e) {
    console.error('feed error:', e);
    res.status(500).send('Erro no feed');
  }
});

// API polling novos imóveis

// ── FEED LIKES ──────────────────────────────────────────────────────────────
app.post('/api/feed/like', auth, express.json(), async (req, res) => {
  try {
    const { imovelId, acao } = req.body; // acao: 'like' ou 'unlike'
    const userId = req.session.user?.codigoUsuario || req.session.user?.codigo;
    const nome = req.session.user?.nome || 'Corretor';
    if(!imovelId) return res.json({ok:false});

    const {query} = require('./services/db');

    // upsert no jsonb de likes do imóvel
    if(acao === 'like'){
      await query(
        "UPDATE imoveis SET dados = jsonb_set(COALESCE(dados,'{}'), '{likes}', COALESCE(dados->'likes','[]')::jsonb || $1::jsonb) WHERE id=$2 AND NOT (dados->'likes' @> $1::jsonb)",
        [JSON.stringify([{userId, nome, em: new Date().toISOString()}]), imovelId]
      );
      // notifica dono do imóvel
      const imRes = await query("SELECT user_id FROM imoveis WHERE id=$1", [imovelId]);
      if(imRes.rows[0]){
        const donoId = imRes.rows[0].user_id;
        if(donoId !== userId){
          criarNotificacaoService({
            id: Date.now().toString(),
            tipo: 'feed_like',
            titulo: nome + ' curtiu seu imóvel',
            mensagem: nome + ' curtiu seu imóvel',
            usuarioId: donoId,
            imovelId,
            lida: false,
            criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
          });
        }
      }
    } else {
      // unlike — remove do array
      await query(
        "UPDATE imoveis SET dados = jsonb_set(COALESCE(dados,'{}'), '{likes}', (SELECT jsonb_agg(l) FROM jsonb_array_elements(COALESCE(dados->'likes','[]'::jsonb)) l WHERE l->>'userId' != $1)) WHERE id=$2",
        [userId, imovelId]
      );
    }
    // retorna contagem atual
    const r = await query("SELECT jsonb_array_length(COALESCE(dados->'likes','[]'::jsonb)) as total, dados->'likes' as likes FROM imoveis WHERE id=$1", [imovelId]);
    res.json({ok:true, total: r.rows[0]?.total||0, likes: r.rows[0]?.likes||[]});
  } catch(e) {
    console.error('[feed like]', e.message);
    res.json({ok:false});
  }
});

app.get('/api/feed/likes/:imovelId', auth, async (req, res) => {
  try {
    const {query} = require('./services/db');
    const r = await query("SELECT dados->'likes' as likes FROM imoveis WHERE id=$1", [req.params.imovelId]);
    const likes = r.rows[0]?.likes || [];
    res.json({ok:true, likes, total: likes.length});
  } catch(e) {
    res.json({ok:true, likes:[], total:0});
  }
});

app.get('/api/feed/com-lead', auth, async (req, res) => {
  try {
    const myId = req.session.user?.codigoUsuario || req.session.user?.codigo;
    const { lerLeads: _llCL } = require('./services/salvarLead');
    const { lerImoveis: _lerImCL } = require('./services/salvarImovel');
    const { lerUsuarios: _lerUsrCL } = require('./services/salvarUsuario');
    const meusLeads = (await _llCL(myId)) || [];
    const usuarios = await _lerUsrCL();
    const nomeMap = {};
    usuarios.forEach(u => {
      const nome = u.nome || u.name || '';
      const ids = [u.codigo_usuario, u.codigoUsuario, u.codigo, u.id].filter(Boolean);
      ids.forEach(uid => { if(uid && nome) nomeMap[String(uid)] = nome; });
    });
    // monta mapa id_externo -> leads
    const leadsMap = {};
    meusLeads.forEach(lead => {
      const matches = lead.matchesBase || lead.matchesAuto || lead.matches || [];
      matches.forEach(m => {
        const mids = [m.id, m.id_externo, m.id_interno, m.imovelId, m.idInterno].filter(Boolean).map(String);
        mids.forEach(mid => {
          if(!leadsMap[mid]) leadsMap[mid] = [];
          leadsMap[mid].push({id: lead.id, nome: lead.nome||'Lead', tel: (lead.telefone||lead.whatsapp||lead.contato||'').replace(/\D/g,'')});
        });
      });
    });
    const todosIds = Object.keys(leadsMap);
    if(!todosIds.length) return res.json({ imoveis: [] });
    // busca imóveis por id OU id_externo
    const todos = await _lerImCL();
    const imoveis = todos.filter(im => {
      if(im.status === 'inativo' || im.status === 'excluido') return false;
      const imId = String(im.id || '');
      const imIdExt = String(im.id_externo || '');
      return todosIds.includes(imId) || todosIds.includes(imIdExt);
    }).map(im => {
      const uid = im.user_id || im.userId || im.codigoUsuario;
      const nomeUsuario = nomeMap[uid] || '';
      const imId = String(im.id || '');
      const imIdExt = String(im.id_externo || '');
      const lc = [...(leadsMap[imId]||[]), ...(leadsMap[imIdExt]||[])];
      const unique = lc.filter((l,i,a) => a.findIndex(x=>x.id===l.id)===i);
      return {...im, _nomeUsuario: nomeUsuario, _userTelefone: _uTel, _dist: 9999, _leadsCompativeis: unique.length, _leadsNomes: unique.slice(0,3).map(l=>({nome:l.nome,tel:l.tel||''})), _score: unique.length * 10};
    });
    res.json({ imoveis });
  } catch(e) {
    console.error('[api/feed/com-lead]', e.message);
    res.json({ imoveis: [] });
  }
});

app.get('/api/feed/novos', auth, async (req, res) => {
  try {
    // reutiliza a mesma logica do /app/feed
    const myId = req.session.user?.codigoUsuario || req.session.user?.codigo;
    const { lerImoveis: _lerFeedApi } = require('./services/salvarImovel');
    const { lerUsuarios: _lerUsrApi } = require('./services/salvarUsuario');
    let todos = await _lerFeedApi();
    // embaralha o pool antes de processar
    for(let i=todos.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[todos[i],todos[j]]=[todos[j],todos[i]];}
    const usuarios = await _lerUsrApi();
    const nomeMap = {};
    usuarios.forEach(u => {
      const nome = u.nome || u.name || '';
      const ids = [u.codigo_usuario, u.codigoUsuario, u.codigo, u.id].filter(Boolean);
      ids.forEach(uid => { if(uid && nome) nomeMap[String(uid)] = nome; });
    });
    const _feedLeads = _cacheLeads || [];
    const meusLeads = _feedLeads.filter(l => (l.userId||l.codigoUsuario||l.user_id) === myId);
    const leadsMap = {};
    meusLeads.forEach(lead => {
      const matches = lead.matchesBase || lead.matchesAuto || lead.matches || [];
      matches.forEach(m => {
        const mids = [m.id, m.id_externo, m.id_interno, m.imovelId, m.idInterno].filter(Boolean).map(String);
        mids.forEach(mid => {
          if(!leadsMap[mid]) leadsMap[mid] = [];
          leadsMap[mid].push({id: lead.id, nome: lead.nome||'Lead', tel: (lead.telefone||lead.whatsapp||lead.contato||'').replace(/\D/g,'')});
        });
      });
    });
    let imoveis = todos.filter(im => im.status !== 'inativo' && im.status !== 'excluido' && (im.user_id || im.userId || im.codigoUsuario));
    imoveis = imoveis.map(im => {
      const uid = im.user_id || im.userId || im.codigoUsuario;
      const nomeUsuario = nomeMap[uid] || '';
      const mid = String(im.id || im.id_externo || '');
      const mid2 = String(im.id_externo || '');
      const lc = [...(leadsMap[mid]||[]), ...(mid2 && mid2!==mid ? (leadsMap[mid2]||[]) : [])];
      const _score = lc.length * 10;
      const _uObjN = (_cacheUsuarios||[]).find(u=>u.id===uid||u.codigo_usuario===uid);
      const _uTelN = (_uObjN?.celular||_uObjN?.telefone||'').replace(/\D/g,'');
      return {...im, _nomeUsuario: nomeUsuario, _userTelefone: _uTelN, _dist: 9999, _leadsCompativeis: lc.length, _leadsNomes: lc.slice(0,3).map(l=>({nome:l.nome,tel:l.tel||''})), _score};
    });
    const _porUser = {};
    imoveis.forEach(im => {
      const uid = im.user_id||im.userId||im.codigoUsuario||'sem_id';
      if(!_porUser[uid]) _porUser[uid] = [];
      _porUser[uid].push(im);
    });
    const since = parseInt(req.query.since) || 0;
    const _grupos = Object.values(_porUser);
    _grupos.forEach(g => {
      // embaralha sempre
      for(let i=g.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[g[i],g[j]]=[g[j],g[i]];}
      // coloca imóveis novos na frente se tiver
      if(since > 0) {
        const novos = g.filter(im => Math.max(new Date(im.criado_em||0).getTime(), new Date(im.last_update||im.updatedAt||0).getTime()) > since);
        const resto = g.filter(im => Math.max(new Date(im.criado_em||0).getTime(), new Date(im.last_update||im.updatedAt||0).getTime()) <= since);
        g.length=0; novos.forEach(x=>g.push(x)); resto.forEach(x=>g.push(x));
      }
    });
    const _mix = [];
    const _max = Math.max(..._grupos.map(g => g.length));
    for(let i=0; i<_max; i++){
      _grupos.forEach(g => { if(g[i]) _mix.push(g[i]); });
    }
    res.json({ imoveis: _mix.slice(0, 50) });
  } catch(e) {
    console.error('[api/feed/novos]', e.message);
    res.json({ imoveis: [] });
  }
});

app.get('/app/parceiros', auth, async (req, res) => {
  const uid = req.session.user.id || req.session.user.codigoUsuario;
  const { query: _qParc } = require('./services/db');
  const _resParc = await _qParc(
    "SELECT u.codigo_usuario, u.nome, u.email, u.celular, u.telefone, u.endereco, (SELECT COUNT(*) FROM imoveis i WHERE i.user_id=u.codigo_usuario) as total_imoveis FROM usuarios u WHERE u.codigo_usuario != $1 ORDER BY u.nome ASC",
    [uid]
  );
  const lista = _resParc.rows.map(function(u) {
    var partes = (u.endereco || '').split(',').map(function(s){return s.trim();});
    var bairro = partes.length >= 5 ? partes[partes.length-5] : '';
    var cidade = partes.length >= 4 ? partes[partes.length-4] : '';
    var estado = partes.length >= 3 ? partes[partes.length-3] : '';
    return {
      id: u.codigo_usuario,
      nome: u.nome || u.codigo_usuario,
      email: u.email || '',
      telefone: (u.celular || u.telefone || '').replace(/\D/g,''),
      bairro: bairro,
      cidade: cidade,
      estado: estado,
      totalImoveis: Number(u.total_imoveis) || 0
    };
  });
  res.render('app-parceiros', { user: req.session.user, parceiros: lista });
});

app.post('/app/parceiro/:id/comissao', auth, async (req, res) => {
  try {
    const leads = (_cacheLeads || []);
    const idx = leads.findIndex(l => String(l.id) === String(req.params.id));
    if (idx < 0) return res.status(404).json({ erro: 'nao encontrado' });
    leads[idx].comissaoParceiro = req.body.comissao || '';
    await salvarTodosLeads(leads);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── REPROCESSAR PERFIL DE TODAS AS LEADS ─────────────────────
// ── AGENDAR VISITA PELO CORRETOR ─────────────────────────────
app.post('/app/visita/agendar-corretor', auth, async (req, res) => {
  try {
    const uid = req.session.user.id;
    const { leadId, imovelId, nome, telefone, dataVisita, horaVisita, obs } = req.body;
    if (!imovelId || !dataVisita || !horaVisita) return res.status(400).json({ erro: 'dados incompletos' });
    const imoveis = ((_cacheImoveis || []));
    const imovel = imoveis.find(i => String(i.id||i.codigoInterno||'') === String(imovelId));
    if (!imovel) return res.status(404).json({ erro: 'imovel nao encontrado' });
    const novaVisita = {
      id: String(Date.now()),
      leadId,
      nome: nome || '',
      telefone: (telefone||'').replace(/\D/g,''),
      contato: (telefone||'').replace(/\D/g,''),
      imovelId,
      imovelTitulo: imovel.titulo || imovel.tipo || 'Imóvel',
      imovelBairro: imovel.bairro || '',
      dataVisita,
      horaVisita,
      obs: obs || '',
      userId: uid,
      corretorId: uid,
      ownerUserId: uid,
      imovelUsuarioId: imovel.userId || imovel.codigoUsuario || uid,
      proprietarioNome: (imovel.proprietario && imovel.proprietario.nome) || '',
      proprietarioTelefone: ((imovel.proprietario && (imovel.proprietario.celular||imovel.proprietario.telefone))||'').replace(/\D/g,''),
      status: 'solicitada',
      origem: 'corretor_manual',
      data: new Date().toISOString(),
      data_br: new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})
    };
    await salvarTodasVisitas([...await lerVisitas(req.session.user.id), novaVisita]);
    // Marca lead como visitaAgendada
    if (leadId) {
      const leads = (_cacheLeads || []);
      const idx = leads.findIndex(l => String(l.id) === String(leadId));
      if (idx >= 0) {
        leads[idx].visitaAgendada = true;
        leads[idx].visitaAgendadaEm = new Date().toISOString();
        await salvarTodosLeads(leads);
      }
    }
    console.log('[VISITA] agendada pelo corretor | lead:', leadId, '| imovel:', imovelId);
    res.json({ ok: true, visita: novaVisita });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── DIAGNÓSTICO COMPLETO ─────────────────────────────────────
// ── LEADS RAW ────────────────────────────────────────────────
// ── NOTIFICAÇÕES — MARCAR LIDA ─────────────────────────────
app.post('/app/notificacoes/:id/lida', auth, async (req, res) => {
  try {
    const { marcarLida } = require('./services/salvarNotificacao');
    await marcarLida(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/app/notificacoes/marcar-todas-lidas', auth, async (req, res) => {
  try {
    const { marcarTodasLidas } = require('./services/salvarNotificacao');
    await marcarTodasLidas(req.session.user.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

// ── NOTIFICAÇÕES — MARCAR LIDA ─────────────────────────────
app.post('/app/notificacoes/:id/lida', auth, async (req, res) => {
  try {
    const { marcarLida } = require('./services/salvarNotificacao');
    await marcarLida(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/app/notificacoes/marcar-todas-lidas', auth, async (req, res) => {
  try {
    const { marcarTodasLidas } = require('./services/salvarNotificacao');
    await marcarTodasLidas(req.session.user.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

// ── JOB_VISITA_REALIZADA — 5h após visita confirmada ─────────────────────────
setInterval(async () => {
  try {
    const { query: _qJob } = require('./services/db');
    const _vRows = await _qJob("SELECT * FROM visitas WHERE status IN ('confirmada','confirmado','lead_confirmou') AND (dados->>'confirmacaoEnviada') IS NULL");
    const _visitas = _vRows.rows;
    const _users = (_cacheUsuarios || []);
    const _agora = Date.now();
    const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
    const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
    const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
    async function _envWAVisita(inst, num, txt) {
      try { await fetch(EU+'/message/sendText/'+inst,{method:'POST',headers:{'Content-Type':'application/json','apikey':EK},body:JSON.stringify({number:num,text:txt})}); } catch(e){}
    }
    for (const v of _visitas) {
      const dataHora = v.data_visita || '';
      if (!dataHora) continue;
      const [h,m] = (v.hora_visita||'00:00').split(':').map(Number);
      const dt = new Date(dataHora); dt.setHours(h||0,m||0,0,0);
      if (_agora - dt.getTime() < 5*60*60*1000) continue;
      const uid = v.user_id || v.corretor_id || '';
      const _user = _users.find(u=>u.id===uid);
      const _inst = _user?.whatsappInstance||'match-corretor';
      const _imovel = v.imovel_titulo||v.imovel_bairro||'imóvel';
      const _cliente = v.nome||'cliente';
      const _linkCorretor = BASE_URL+'/visita/'+v.id+'/realizada-corretor';
      // WA para o CORRETOR
      const _telC = (_user?.celular||_user?.telefone||'').replace(/\D/g,'');
      if(_telC) await _envWAVisita(_inst, '55'+_telC.replace(/^55/,''),
        'Ola ' + (_user?.nome||'Corretor') + '!\n\nA visita de *' + _cliente + '* ao imovel *' + _imovel + '* ja aconteceu?\n\nInforme aqui:\n' + _linkCorretor);
      // Salva flag no banco
      await _qJob("UPDATE visitas SET dados=jsonb_set(COALESCE(dados,'{}'),'{confirmacaoEnviada}',$1::jsonb) WHERE id=$2", [JSON.stringify(true), v.id]);
      console.log('[JOB VISITA] mensagens enviadas | visita:', v.id, '| lead:', _cliente);
    }
  } catch(e) { console.error('[JOB VISITA REALIZADA]', e.message); }
}, 15*60*1000);

// ── JOB_LEADS_DIA — processa 20 leads de planilha por usuário às 8h ──────────
(function _agendarLeadsDia() {
  function _msAte8h() {
    const agora = new Date();
    const prox = new Date();
    prox.setHours(8, 0, 0, 0);
    if (prox <= agora) prox.setDate(prox.getDate() + 1);
    return prox - agora;
  }
  async function _processarLeadsDia() {
    try {
      const { query: _qLD } = require('./services/db');
      const matchCore = require('./cerebro/index');
      const LIMITE = 20;
      // Pega todos os usuários ativos
      const _users = (_cacheUsuarios || []).filter(u => u.ativo !== false);
      for (const user of _users) {
        const uid = user.codigoUsuario || user.codigo_usuario || user.id;
        if (!uid) continue;
        try {
          // Busca leads de planilha não processadas (sem match ainda)
          const _res = await _qLD(
            `SELECT * FROM leads WHERE user_id=$1 AND origem='planilha' AND (dados->>'matchProcessado') IS NULL AND deletado_por IS NULL ORDER BY criado_em ASC LIMIT $2`,
            [uid, LIMITE]
          );
          const _leads = _res.rows;
          if (!_leads.length) continue;
          console.log(`[leads-dia] ${uid}: ${_leads.length} leads para processar`);
          for (const row of _leads) {
            try {
              const _lead = { ...row, ...(row.dados || {}), id: row.id, userId: uid };
              await matchCore.processar({ lead: _lead, mensagem: '', canal: 'importacao', userId: uid, instancia: null });
              // Marca como processada
              await _qLD(
                `UPDATE leads SET dados = jsonb_set(COALESCE(dados,'{}'), '{matchProcessado}', 'true') WHERE id=$1`,
                [row.id]
              );
              // lead_ativo_dia já é cobrado uma vez por dia por lead ativa no job
              // dedicado (services/jobCreditos.js) — cobrar aqui também duplicava o débito.
              console.log(`[leads-dia] ✅ ${_lead.nome || row.id}`);
            } catch(e) { console.error('[leads-dia] erro lead', row.id, e.message); }
          }
        } catch(e) { console.error('[leads-dia] erro usuario', uid, e.message); }
      }
    } catch(e) { console.error('[leads-dia] erro geral', e.message); }
    // Agenda para o próximo dia às 8h
    setTimeout(_processarLeadsDia, _msAte8h());
  }
  // Primeira execução
  setTimeout(_processarLeadsDia, _msAte8h());
  console.log('[leads-dia] job agendado para as 8h');
})();
// ── FIM JOB_LEADS_DIA ────────────────────────────────────────────────────────

// ── FIM JOB_VISITA_REALIZADA ─────────────────────────────────────────────────

// ── JOB_LEMBRETE_VISITA — 4h antes da visita confirmada ──────────────────────
setInterval(async () => {
  try {
    const { query: _qLV } = require('./services/db');
    const _agora = Date.now();
    const _4h = 4 * 60 * 60 * 1000;
    const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
    const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
    const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
    async function _envWA(inst, num, txt) {
      try { await fetch(EU+'/message/sendText/'+inst,{method:'POST',headers:{'Content-Type':'application/json','apikey':EK},body:JSON.stringify({number:num,text:txt})}); } catch(e){}
    }
    // Busca visitas confirmadas que ainda nao receberam lembrete
    const _vRows = await _qLV("SELECT * FROM visitas WHERE status IN ('confirmada','confirmado','lead_confirmou') AND (lembrete_enviado IS NULL OR lembrete_enviado=false)");
    for (const v of _vRows.rows) {
      if (!v.data_visita || !v.hora_visita) continue;
      const [h,m] = v.hora_visita.split(':').map(Number);
      const dtVisita = new Date(v.data_visita);
      dtVisita.setHours(h||0, m||0, 0, 0);
      const _msAteVisita = dtVisita.getTime() - _agora;
      // Só envia se faltam entre 4h e 5h para a visita
      if (_msAteVisita > _4h + 60*60*1000 || _msAteVisita < 0) continue;
      const _uid = v.user_id || v.corretor_id || '';
      const _user = (_cacheUsuarios||[]).find(u => u.id === _uid);
      const _inst = _user?.whatsappInstance || 'match-corretor';
      const _nomeCorretor = _user?.nome || 'Seu corretor';
      const _nomeLead = v.nome || 'cliente';
      const _imovel = v.imovel_titulo || v.imovel_bairro || 'imovel';
      const _hora = v.hora_visita || '';
      const _linkConfLead = BASE_URL + '/visita/' + v.id + '/confirmar-lead';
      const _linkConfCorretor = BASE_URL + '/visita/' + v.id + '/confirmar-corretor';
      // WA para a LEAD
      const _telLead = (v.telefone||v.contato||'').replace(/D/g,'');
      if (_telLead) {
        await _envWA(_inst, '55'+_telLead.replace(/^55/,''),
          'Oi ' + _nomeLead + '!\n\n' +
          'Lembrando que sua visita ao imovel *' + _imovel + '* esta confirmada para hoje as *' + _hora + '*. \n\n' +
          'Voce vai comparecer? Confirme aqui:\n' + _linkConfLead);
      }
      // WA para o CORRETOR
      const _telC = (_user?.celular||_user?.telefone||'').replace(/D/g,'');
      if (_telC) {
        await _envWA(_inst, '55'+_telC.replace(/^55/,''),
          'Oi ' + _nomeCorretor + '!\n\n' +
          'Lembrete: visita de *' + _nomeLead + '* ao imovel *' + _imovel + '* hoje as *' + _hora + '*. \n\n' +
          'Voce vai comparecer? Confirme aqui:\n' + _linkConfCorretor);
      }
      // Marca lembrete enviado
      await _qLV("UPDATE visitas SET lembrete_enviado=true WHERE id=$1", [v.id]);
      console.log('[JOB LEMBRETE] enviado | visita:', v.id, '| lead:', _nomeLead);
    }
  } catch(e) { console.error('[JOB LEMBRETE VISITA]', e.message); }
}, 15*60*1000);
// ── FIM JOB_LEMBRETE_VISITA ───────────────────────────────────────────────────

// ── JOB_VISITA_ATRASADA — cancela visitas atrasadas e notifica lead ──────────
setInterval(async () => {
  try {
    const { query: _qAT } = require('./services/db');
    const _agora = new Date();
    const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
    const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
    const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
    async function _envWA(inst, num, txt) {
      try { await fetch(EU+'/message/sendText/'+inst,{method:'POST',headers:{'Content-Type':'application/json','apikey':EK},body:JSON.stringify({number:num,text:txt})}); } catch(e){}
    }
    // Busca visitas atrasadas que ainda nao foram canceladas/realizadas
    const _vRows = await _qAT("SELECT * FROM visitas WHERE status NOT IN ('cancelada','realizada','nao_realizada') AND data_visita IS NOT NULL AND (dados->>'atrasadaNotificada') IS NULL");
    for (const v of _vRows.rows) {
      if (!v.data_visita || !v.hora_visita) continue;
      const [h,m] = v.hora_visita.split(':').map(Number);
      const dtVisita = new Date(v.data_visita);
      dtVisita.setHours(h||0, m||0, 0, 0);
      // Só processa se já passou da data/hora da visita
      if (_agora <= dtVisita) continue;
      const _uid = v.user_id || v.corretor_id || '';
      const _user = (_cacheUsuarios||[]).find(u => u.id === _uid);
      const _inst = _user?.whatsappInstance || 'match-corretor';
      const _nomeCorretor = _user?.nome || 'Seu corretor';
      const _nomeLead = v.nome || '';
      const _imovel = v.imovel_titulo || v.imovel_bairro || 'imovel';
      const _telLead = (v.telefone||v.contato||'').replace(/D/g,'');
      const _linkVitrine = BASE_URL + '/cliente/oferta/' + (v.lead_id||'') + '?userId=' + _uid;
      // Cancela a visita
      await _qAT("UPDATE visitas SET status='cancelada', dados=jsonb_set(COALESCE(dados,'{}'),'{atrasadaNotificada}',$1::jsonb) WHERE id=$2", [JSON.stringify(new Date().toISOString()), v.id]);
      if (_cacheVisitas) { const _ci = _cacheVisitas.findIndex(vv=>String(vv.id)===String(v.id)); if(_ci>=0) _cacheVisitas[_ci].status='cancelada'; }
      // Manda msg para a lead
      if (_telLead) {
        await _envWA(_inst, '55'+_telLead.replace(/^55/,''),
          'Oi ' + _nomeLead + '!\n\n' +
          'Sua visita ao imovel *' + _imovel + '* nao foi confirmada e acabou expirando.\n\n' +
          'Mas nao se preocupe! Acesse sua selecao de imoveis e agende uma nova visita quando quiser:\n' +
          _linkVitrine + '\n\n' +
          _nomeCorretor + ' - MatchImoveis');
      }
      console.log('[JOB ATRASADA] visita cancelada + lead notificada | visita:', v.id, '| lead:', _nomeLead);
    }
  } catch(e) { console.error('[JOB VISITA ATRASADA]', e.message); }
}, 30*60*1000);
// ── FIM JOB_VISITA_ATRASADA ──────────────────────────────────────────────────

// ── ROTAS CONFIRMACAO PRE-VISITA ──────────────────────────────────────────────
app.get('/visita/:id/confirmar-lead', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (!visita) return res.status(404).send('Visita nao encontrada');
    const respondido = visita.confirmacao_cliente_status === 'confirmado';
    res.render('visita-confirmar', { visita, tipo: 'lead', respondido, msg: respondido ? 'Presenca confirmada! Te esperamos.' : null });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.post('/visita/:id/confirmar-lead', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    await _q("UPDATE visitas SET confirmacao_cliente_status='confirmado', dados=jsonb_set(COALESCE(dados,'{}'),'{confirmacaoLeadEm}',$1::jsonb) WHERE id=$2", [JSON.stringify(new Date().toISOString()), req.params.id]);
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (_cacheVisitas) { const _ci = _cacheVisitas.findIndex(v=>String(v.id)===String(req.params.id)); if(_ci>=0){ _cacheVisitas[_ci].confirmacao_cliente_status='confirmado'; _cacheVisitas[_ci].confirmacaoClienteStatus='confirmado'; } }
    res.render('visita-confirmar', { visita, tipo: 'lead', respondido: true, msg: 'Presenca confirmada! Te esperamos.' });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.get('/visita/:id/confirmar-corretor', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (!visita) return res.status(404).send('Visita nao encontrada');
    const respondido = visita.confirmacao_corretor_status === 'confirmado';
    res.render('visita-confirmar', { visita, tipo: 'corretor', respondido, msg: respondido ? 'Presenca confirmada!' : null });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.post('/visita/:id/confirmar-corretor', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    await _q("UPDATE visitas SET confirmacao_corretor_status='confirmado', dados=jsonb_set(COALESCE(dados,'{}'),'{confirmacaoCorretorEm}',$1::jsonb) WHERE id=$2", [JSON.stringify(new Date().toISOString()), req.params.id]);
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (_cacheVisitas) { const _ci = _cacheVisitas.findIndex(v=>String(v.id)===String(req.params.id)); if(_ci>=0){ _cacheVisitas[_ci].confirmacao_corretor_status='confirmado'; _cacheVisitas[_ci].confirmacaoCorretorStatus='confirmado'; } }
    res.render('visita-confirmar', { visita, tipo: 'corretor', respondido: true, msg: 'Presenca confirmada!' });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});
// ── FIM ROTAS CONFIRMACAO PRE-VISITA ─────────────────────────────────────────

// ── ROTAS FAVORITOS ──────────────────────────────────────────────────────────
app.get('/api/favoritos', auth, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const r = await _q('SELECT favoritos FROM usuarios WHERE id=$1', [req.session.user.id]);
    res.json({ ok: true, favoritos: r.rows[0]?.favoritos || [] });
  } catch(e) { res.json({ ok: false, favoritos: [] }); }
});

app.post('/api/favoritos/toggle', auth, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const { imovelId } = req.body;
    const r = await _q('SELECT favoritos FROM usuarios WHERE id=$1', [req.session.user.id]);
    let favs = r.rows[0]?.favoritos || [];
    const idx = favs.indexOf(String(imovelId));
    if (idx === -1) favs.push(String(imovelId));
    else favs.splice(idx, 1);
    await _q('UPDATE usuarios SET favoritos=$1 WHERE id=$2', [JSON.stringify(favs), req.session.user.id]);
    res.json({ ok: true, favoritos: favs, acao: idx === -1 ? 'adicionado' : 'removido' });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

// ── ROTAS FEED VISTOS ────────────────────────────────────────────────────────
app.post('/api/feed/marcar-visto', auth, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const { ids } = req.body;
    if (!ids || !ids.length) return res.json({ ok: true });
    const r = await _q('SELECT feed_vistos FROM usuarios WHERE id=$1', [req.session.user.id]);
    let vistos = r.rows[0]?.feed_vistos || [];
    ids.forEach(id => { if (!vistos.includes(String(id))) vistos.push(String(id)); });
    if (vistos.length > 500) vistos = vistos.slice(-500);
    await _q('UPDATE usuarios SET feed_vistos=$1 WHERE id=$2', [JSON.stringify(vistos), req.session.user.id]);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false }); }
});

app.post('/api/feed/limpar-vistos', auth, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    await _q("UPDATE usuarios SET feed_vistos='[]'::jsonb WHERE id=$1", [req.session.user.id]);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false }); }
});
// ── FIM ROTAS FEED ────────────────────────────────────────────────────────────

// ── ROTAS VISITA REALIZADA CORRETOR ──────────────────────────────────────────
app.get('/visita/:id/realizada-corretor', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (!visita) return res.status(404).send('Visita não encontrada');
    const respondido = ['realizada','nao_realizada'].includes(visita.status);
    const msg = visita.status === 'realizada' ? '✅ Visita marcada como realizada!' : '❌ Visita marcada como não realizada.';
    res.render('visita-realizada-corretor', { visita, respondido, msg });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.post('/visita/:id/marcar-realizada', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    await _q("UPDATE visitas SET status='realizada', dados=jsonb_set(COALESCE(dados,'{}'),'{realizadaEm}',$1::jsonb) WHERE id=$2", [JSON.stringify(new Date().toISOString()), req.params.id]);
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (visita?.lead_id) await _q("UPDATE leads SET fase_funil='visitou', status='visitou', atualizado_em=NOW() WHERE id=$1", [visita.lead_id]);
    if (_cacheVisitas) { const _ci = _cacheVisitas.findIndex(v=>String(v.id)===String(req.params.id)); if(_ci>=0) _cacheVisitas[_ci].status='realizada'; }
    res.render('visita-realizada-corretor', { visita, respondido: true, msg: '✅ Visita marcada como realizada!' });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.post('/visita/:id/marcar-nao-realizada', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    // Move para cancelada
    await _q("UPDATE visitas SET status='cancelada', dados=jsonb_set(COALESCE(dados,'{}'),'{naoRealizadaEm}',$1::jsonb) WHERE id=$2", [JSON.stringify(new Date().toISOString()), req.params.id]);
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (_cacheVisitas) { const _ci = _cacheVisitas.findIndex(v=>String(v.id)===String(req.params.id)); if(_ci>=0) _cacheVisitas[_ci].status='cancelada'; }
    // Manda msg para a lead com link da vitrine para reagendar
    try {
      const _BASE = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : (process.env.BASE_URL || 'http://localhost:3000');
      const _EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
      const _EK = process.env.EVOLUTION_KEY || 'match2025evolution';
      const _uid = visita.user_id || visita.corretor_id || '';
      const _userV = (_cacheUsuarios||[]).find(u => u.id === _uid);
      const _inst = _userV?.whatsappInstance || 'match-corretor';
      const _telLead = (visita.telefone_lead || visita.contato_lead || '').replace(/D/g,'');
      const _nomeLead = visita.nome || '';
      const _linkVitrine = _BASE + '/cliente/oferta/' + (visita.lead_id||'') + '?userId=' + _uid;
      const _nomeCorretor = _userV?.nome || 'Seu corretor';
      if (_telLead) {
        const _msgLead = 'Oi ' + _nomeLead + '!\n\n'
          + 'Que pena que nao conseguimos nos encontrar para a visita. \n\n'
          + 'Mas nao desanime! Acesse sua selecao de imoveis e escolha um novo horario:\n'
          + _linkVitrine + '\n\n'
          + 'Estamos a disposicao para te ajudar!\n\n'
          + _nomeCorretor + ' - MatchImoveis';
        await fetch(_EU + '/message/sendText/' + _inst, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': _EK },
          body: JSON.stringify({ number: '55' + _telLead.replace(/^55/,''), text: _msgLead })
        });
        console.log('[marcar-nao-realizada] msg enviada para lead:', _telLead);
      }
    } catch(e) { console.error('[marcar-nao-realizada] erro msg lead:', e.message); }
    res.render('visita-realizada-corretor', { visita, respondido: true, msg: '❌ Visita cancelada. Lead notificada para reagendar.' });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});
// ── FIM ROTAS VISITA REALIZADA ────────────────────────────────────────────────

// ── ROTAS VISITA REALIZADA / LEAD FEEDBACK ────────────────────────────────────
app.get('/visita/:id/realizada-corretor', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (!visita) return res.status(404).send('Visita não encontrada');
    const respondido = ['realizada','nao_realizada'].includes(visita.status);
    const msg = visita.status === 'realizada' ? '✅ Visita marcada como realizada!' : '❌ Visita marcada como não realizada.';
    res.render('visita-realizada-corretor', { visita, respondido, msg });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.post('/visita/:id/marcar-realizada', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    await _q("UPDATE visitas SET status='realizada', dados=jsonb_set(COALESCE(dados,'{}'),'{realizadaEm}',$1::jsonb) WHERE id=$2", [JSON.stringify(new Date().toISOString()), req.params.id]);
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (visita?.lead_id) await _q("UPDATE leads SET fase_funil='visitou', status='visitou', atualizado_em=NOW() WHERE id=$1", [visita.lead_id]);
    res.render('visita-realizada-corretor', { visita, respondido: true, msg: '✅ Visita marcada como realizada!' });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.post('/visita/:id/marcar-nao-realizada', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    await _q("UPDATE visitas SET status='cancelada', dados=jsonb_set(COALESCE(dados,'{}'),'{naoRealizadaEm}',$1::jsonb) WHERE id=$2", [JSON.stringify(new Date().toISOString()), req.params.id]);
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (_cacheVisitas) { const _ci = _cacheVisitas.findIndex(v=>String(v.id)===String(req.params.id)); if(_ci>=0) _cacheVisitas[_ci].status='cancelada'; }
    res.render('visita-realizada-corretor', { visita, respondido: true, msg: '❌ Visita cancelada. Lead notificada para reagendar.' });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.get('/visita/:id/realizada-lead', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (!visita) return res.status(404).send('Visita não encontrada');
    const respondido = ['proposta','nao_gostou'].includes(visita.status);
    res.render('visita-realizada-lead', { visita, respondido });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.post('/visita/:id/lead-gostou', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    await _q("UPDATE visitas SET status='proposta', dados=jsonb_set(COALESCE(dados,'{}'),'{leadGostouEm}',$1::jsonb) WHERE id=$2", [JSON.stringify(new Date().toISOString()), req.params.id]);
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (visita?.lead_id) await _q("UPDATE leads SET fase_funil='proposta', status='proposta', atualizado_em=NOW() WHERE id=$1", [visita.lead_id]);
    try {
      const { lerUsuarios: _lu } = require('./services/salvarUsuario');
      const _user = (await _lu()).find(u => u.id === (visita.user_id || visita.corretor_id));
      const _inst = _user?.whatsappInstance;
      const _tel = (_user?.celular||_user?.telefone||'').replace(/\D/g,'');
      if (_inst && _tel) {
        const EU = process.env.EVOLUTION_URL||'https://match-evolution-api.onrender.com';
        const EK = process.env.EVOLUTION_KEY||'match2025evolution';
        const _nome = visita.nome||'Cliente';
        const _imovel = visita.imovel_titulo||visita.imovel_bairro||'o imóvel';
        await fetch(EU+'/message/sendText/'+_inst,{method:'POST',headers:{'Content-Type':'application/json','apikey':EK},body:JSON.stringify({number:'55'+_tel.replace(/^55/,''),text:'*'+_nome+'* gostou do imovel *'+_imovel+'* e quer fazer uma proposta!\n\nEntre em contato para avancar.'})});
      }
    } catch(e) { console.error('[lead-gostou] WA:', e.message); }
    res.render('visita-realizada-lead', { visita, respondido: true });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.post('/visita/:id/lead-nao-gostou', async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    await _q("UPDATE visitas SET status='nao_gostou', dados=jsonb_set(COALESCE(dados,'{}'),'{leadNaoGostouEm}',$1::jsonb) WHERE id=$2", [JSON.stringify(new Date().toISOString()), req.params.id]);
    const visita = (await _q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    try {
      const { lerUsuarios: _lu } = require('./services/salvarUsuario');
      const _user = (await _lu()).find(u => u.id === (visita.user_id || visita.corretor_id));
      const _inst = _user?.whatsappInstance;
      const _tel = (_user?.celular||_user?.telefone||'').replace(/\D/g,'');
      if (_inst && _tel) {
        const EU = process.env.EVOLUTION_URL||'https://match-evolution-api.onrender.com';
        const EK = process.env.EVOLUTION_KEY||'match2025evolution';
        const _nome = visita.nome||'Cliente';
        const _imovel = visita.imovel_titulo||visita.imovel_bairro||'o imóvel';
        await fetch(EU+'/message/sendText/'+_inst,{method:'POST',headers:{'Content-Type':'application/json','apikey':EK},body:JSON.stringify({number:'55'+_tel.replace(/^55/,''),text:'*'+_nome+'* nao gostou do imovel *'+_imovel+'*.\n\nTalvez precise de outras opcoes.'})});
      }
    } catch(e) { console.error('[lead-nao-gostou] WA:', e.message); }
    res.render('visita-realizada-lead', { visita, respondido: true });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});










// ===== ROTAS APP UX NOVO =====




// rota importar leads removida para correção



// ===== REGRA PRIVACIDADE PROPRIETARIO =====
// IMPORTANTE:
// proprietario_nome, proprietario_whatsapp, proprietario_email e proprietario_doc
// só podem ser exibidos quando imovel.corretorId === usuarioLogado.id.
// Em carteiras compartilhadas, matches, outros corretores e usuários externos,
// esses campos devem ser ocultados.


// ===== LEADS + MATCH + OFERTA CLIENTE =====
async function carregarLeads(){
  try { const r = await _qL('SELECT dados FROM leads ORDER BY criado_em DESC'); return r.rows.map(r=>r.dados); } catch(e) { console.error('[carregarLeads]',e.message); return []; }
}

async function salvarLeads(leads){
  const fs = require('fs');
  salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));
}

// ── HELPERS_CENTRALIZADOS ─────────────────────────────────────────────────────
async function lerLeadsData() {
  try { const { query: _qLD } = require('./services/db'); const r = await _qLD('SELECT *, dados, follow_ups, vitrine_enviada, vitrine_enviada_em, matches, matches_auto, id, nome, telefone, whatsapp, contato, user_id, codigo_usuario, score, temperatura, fase_funil, perfil_ia, status, tipo_lead, historico, timeline, eventos, comportamento, mapa_intencao FROM leads ORDER BY criado_em DESC'); return r.rows.filter(r=>r.fase_funil!=='captacao'&&r.status!=='captacao').map(r=>({ ...(r.dados||{}), id: r.id, nome: r.nome, telefone: r.telefone, whatsapp: r.whatsapp, contato: r.contato, userId: r.user_id, codigoUsuario: r.codigo_usuario, followUps: r.follow_ups||[], vitrineEnviada: r.vitrine_enviada, vitrineEnviadaEm: r.vitrine_enviada_em, matches: r.matches||[], matchesAuto: (r.matches_auto && r.matches_auto.length) ? r.matches_auto : (r.matches||[]), score: r.score || (r.dados||{}).score || 0, temperatura: r.temperatura || (r.dados||{}).temperatura || 'frio', faseFunil: r.fase_funil || (r.dados||{}).faseFunil || 'novo', status: r.status || (r.dados||{}).status || 'novo', perfilIA: r.perfil_ia || (r.dados||{}).perfilIA || {}, mapaIntencao: r.mapa_intencao || (r.dados||{}).mapaIntencao || null, comportamento: r.comportamento || (r.dados||{}).comportamento || null, historico: r.historico || (r.dados||{}).historico || [], timeline: r.timeline || (r.dados||{}).timeline || [], eventos: r.eventos || (r.dados||{}).eventos || [] })); } catch(e) { console.error('[lerLeadsData]',e.message); return []; }
}

async function salvarLeadsData(leads) {
  try {
    salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));
  } catch(e) { console.error('[salvarLeadsData]', e.message); }
}

async function lerVisitasData() {
  try { const r = await _qV('SELECT dados, imovel_id, imovel_bairro, status, data_visita FROM visitas ORDER BY criado_em DESC'); return r.rows.map(r=>({...r.dados, imovelId: r.dados.imovelId||r.imovel_id, imovelBairro: r.dados.imovelBairro||r.imovel_bairro, status: r.dados.status||r.status, dataVisita: r.dados.dataVisita||r.data_visita})); } catch(e) { console.error('[lerVisitasData]',e.message); return []; }
}

async function salvarVisitasData(visitas) {
  try {
    salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));
  } catch(e) { console.error('[salvarVisitasData]', e.message); }
}

async function atualizarLead(id, campos) {
  const leads = await lerLeadsData();
  const idx = leads.findIndex(l => String(l.id) === String(id));
  if (idx < 0) return null;
  leads[idx] = { ...leads[idx], ...campos };
  salvarLeadsData(leads);
  return leads[idx];
}

async function atualizarVisita(id, campos) {
  const visitas = await lerVisitasData();
  const idx = visitas.findIndex(v => String(v.id) === String(id));
  if (idx < 0) return null;
  visitas[idx] = { ...visitas[idx], ...campos };
  salvarVisitasData(visitas);
  return visitas[idx];
}

async function criarLead(payload) {
  const leads = await lerLeadsData();
  const novo = { id: Date.now().toString(), criadoEm: new Date().toISOString(), ...payload };
  leads.push(novo);
  salvarLeadsData(leads);
  // Cobra 10 créditos por nova lead
  const _userId = payload.userId || payload.corretorId || payload.usuarioDestinoId || '';
  if (_userId) consumir(_userId, 'nova_lead').catch(()=>{});
  return novo;
}

async function criarVisita(payload) {
  const visitas = await lerVisitasData();
  const nova = { id: Date.now().toString(), criadoEm: new Date().toISOString(), ...payload };
  visitas.push(nova);
  salvarVisitasData(visitas);
  return nova;
}
// ── FIM HELPERS_CENTRALIZADOS ─────────────────────────────────────────────────

function marcarEtapaLead(lead, etapa){
  lead.etapaAtual = etapa;
  lead.jornada = lead.jornada || [];
  const atual = lead.jornada.find(j => j.etapa === etapa);
  if(atual){ atual.feito = true; atual.data = new Date().toISOString(); }
  else lead.jornada.push({ etapa, feito:true, data:new Date().toISOString() });
}

app.get('/cliente/oferta/:leadId', (req,res)=>{
  const leads = (_cacheLeads || []);
  const userIdOferta = req.query.userId || req.query.uid || '';

  let lead = null;

  if (userIdOferta) {
    lead = leads.find(l =>
      String(l.id || l.leadId || '') === String(req.params.leadId) &&
      String(l.userId || l.usuarioId || l.corretorId || '') === String(userIdOferta)
    );
  }

  if (!lead) {
    lead = leads.find(l => String(l.id || l.leadId || '') === String(req.params.leadId));
  }

  if(!lead) return res.status(404).send('Lead não encontrado');

  lead.matches = ((lead.matchesBase && lead.matchesBase.length ? lead.matchesBase : null) ||
               (lead.matchesAuto && lead.matchesAuto.length ? lead.matchesAuto : null) ||
               (lead.matches && lead.matches.length ? lead.matches : null) || []).slice(0, 9); // vitrine: máximo de 9 imóveis (já vêm ordenados por score)
  
  // Marca vitrine como visualizada
  const idxLead = leads.findIndex(l => String(l.id||l.leadId||'') === String(req.params.leadId));
  if (idxLead >= 0) {
    leads[idxLead].vitrineVisualizada = true;
    leads[idxLead].vitrineVisualizadaEm = new Date().toISOString();
    if (false && !leads[idxLead].vitrineEnviada) {
      leads[idxLead].vitrineEnviada = true;
      leads[idxLead].vitrineEnviadaEm = new Date().toISOString();
    }
    lead = leads[idxLead];
  }
  registrarHistoricoImovelLead(lead, 'visualizou_vitrine', lead);
  salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));
  const _usersMapVitrine = {}; (_cacheUsuarios||[]).forEach(function(u){ _usersMapVitrine[u.codigo_usuario||u.codigoUsuario||u.id] = u.nome||u.name||''; });
  res.render('cliente-oferta', {
    user: null,
    lead,
    matchesParceiro: lead.matchesQuintoAndar || [],
    queryUserId: userIdOferta || lead.userId || lead.usuarioId || lead.corretorId || '',
    usersMap: _usersMapVitrine
  });
});

app.get('/cliente/oferta/:leadId/escolher/:idx', (req,res)=>{
  const leads = (_cacheLeads || []);
  const lead = leads.find(l => (l.id || l.leadId) === req.params.leadId);
  if(!lead) return res.status(404).send('Lead não encontrado');
  const idx = Number(req.params.idx);
  lead.imovelEscolhido = lead.matches && lead.matches[idx] ? lead.matches[idx] : null;
  _registrarGostei(lead, lead.imovelEscolhido);
  salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));
  res.redirect('/cliente/oferta/'+req.params.leadId);
});

app.get('/cliente/oferta/:leadId/visita/:idx', (req,res)=>{
  const leads = (_cacheLeads || []);
  const lead = leads.find(l => (l.id || l.leadId) === req.params.leadId);
  if(!lead) return res.status(404).send('Lead não encontrado');
  const idx = Number(req.params.idx);
  const matchesDisp = lead.matchesBase || lead.matches || [];
  lead.imovelVisita = matchesDisp[idx] || null;
  lead.visitaSolicitadaEm = new Date().toISOString();
  registrarHistoricoImovelLead(lead, 'visita_solicitada', lead.imovelVisita);
  salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));

  // Gravar em visitas.json vinculado ao dono da lead
  const imovel = lead.imovelVisita || {};
  // Busca proprietario no imoveis.json
  const imoveisBase = fs.existsSync(dataFile('imoveis.json')) ? ((_cacheImoveis || [])) : [];
  const imovelBase = imoveisBase.find(i => String(i.idExterno||i.id) === String(imovel.idExterno||imovel.id||imovel.id_anuncio||''));
  const proprietario = imovelBase ? (imovelBase.proprietario || {}) : (imovel.proprietario || {});
  const userFinal = user || { id: "TESTE-LOCAL", nome: "Usuário Teste", celular: "11999999999", telefone: "11999999999" };

  const novaVisita = {
    id: Date.now().toString(),
    leadId: lead.id || lead.leadId,
    nome: lead.nome || lead.name || '',
    telefone: lead.telefone || lead.phone || '',
    contato: lead.telefone || lead.phone || '',
    imovelId: imovel.id || imovel.codigo || '',
    imovelTitulo: imovel.titulo || imovel.title || '',
    imovelBairro: imovel.bairro || '',
    imovelCidade: imovel.cidade || '',
    imovelEstado: imovel.estado || '',
    usuarioDestinoId: lead.usuarioDestinoId || lead.userId || lead.codigoUsuario || '',
    userId: lead.userId || lead.codigoUsuario || '',
    corretorId: lead.userId || lead.codigoUsuario || '',
    proprietarioNome: proprietario.nome || '',
    proprietarioTelefone: (proprietario.telefone || proprietario.celular || '').replace(/\D/g,''),
    imovelUsuarioId: imovelBase ? (imovelBase.user_id || imovelBase.userId || imovelBase.usuarioId || '') : '',
    imovelUsuarioNome: (() => {
      const _imOwnerId = imovelBase ? (imovelBase.user_id || imovelBase.userId || imovelBase.usuarioId || '') : '';
      const _imOwner = (_cacheUsuarios||[]).find(u => (u.codigo_usuario||u.codigoUsuario||u.codigo||u.id) === _imOwnerId);
      return _imOwner ? (_imOwner.nome||'') : (imovelBase ? (imovelBase.fonte||'') : '');
    })(),
    imovelUsuarioTelefone: (() => {
      const _imOwnerId = imovelBase ? (imovelBase.user_id || imovelBase.userId || imovelBase.usuarioId || '') : '';
      const _imOwner = (_cacheUsuarios||[]).find(u => (u.codigo_usuario||u.codigoUsuario||u.codigo||u.id) === _imOwnerId);
      return _imOwner ? ((_imOwner.celular||_imOwner.telefone||'').replace(/\D/g,'')) : '';
    })(),
    usuarioDestinoNome: (() => {
      const _uid = lead.usuarioDestinoId || lead.userId || lead.codigoUsuario || '';
      const _u = (_cacheUsuarios||[]).find(u => (u.codigo_usuario||u.codigoUsuario||u.codigo||u.id) === _uid);
      return _u ? (_u.nome||'') : '';
    })(),
    usuarioDestinoPerfil: '',
    usuarioDestinoTelefone: (() => {
      const _uid = lead.usuarioDestinoId || lead.userId || lead.codigoUsuario || '';
      const _u = (_cacheUsuarios||[]).find(u => (u.codigo_usuario||u.codigoUsuario||u.codigo||u.id) === _uid);
      return _u ? ((_u.celular||_u.telefone||'').replace(/\D/g,'')) : '';
    })(),
    corretorNome: (() => {
      const _uid = lead.userId || lead.codigoUsuario || '';
      const _u = (_cacheUsuarios||[]).find(u => (u.codigo_usuario||u.codigoUsuario||u.codigo||u.id) === _uid);
      return _u ? (_u.nome||'') : '';
    })(),
    corretorTelefone: (() => {
      const _uid = lead.userId || lead.codigoUsuario || '';
      const _u = (_cacheUsuarios||[]).find(u => (u.codigo_usuario||u.codigoUsuario||u.codigo||u.id) === _uid);
      return _u ? ((_u.celular||_u.telefone||'').replace(/\D/g,'')) : '';
    })(),
    dataVisita: lead.dataVisita || lead.dataPreferida || '',
    horaVisita: lead.horaVisita || lead.horarioPreferido || '',
    imovelUrl: imovel.url || '',
    status: 'solicitada',
    origem: 'vitrine_cliente',
    fonte: 'MatchImóveis',
    data: new Date().toISOString(),
    data_br: new Date().toLocaleString('pt-BR')
  };
  const visitas = (_cacheVisitas || []);
  try { const { query: _qV2 } = require('./services/db'); _qV2('SELECT user_id FROM leads WHERE id=$1', [lead?.id||'']).then(r => { const _uid2 = r.rows[0]?.user_id || (lead&&(lead.userId||lead.codigoUsuario||lead.corretorId)) || ''; if(_uid2) consumir(_uid2,'visita_agendada_ia').catch(()=>{}); }).catch(()=>{}); } catch(e) {}
  const visitaComWorkflow = aplicarWorkflowVisita(novaVisita);
  visitas.push(visitaComWorkflow);
  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));

  res.redirect('/cliente/oferta/'+req.params.leadId+'?visita=ok');
});


// ===== REGRA DONO DO LEAD =====

// Sempre que importar leads:
function aplicarDonoLead(lead, usuario){
  lead.corretorId = usuario.id || 'mario-11999965998';
  lead.corretorNome = usuario.nome || 'MARIO SERGIO DE SOUZA';
  lead.corretorCelular = usuario.celular || '11999965998';
  return lead;
}

// Filtrar leads do corretor logado
function filtrarLeadsPorCorretor(leads, usuario){
  return leads.filter(l => l.corretorId === (usuario.id || 'mario-11999965998'));
}

// Quando cliente pedir visita
function registrarVisita(lead){
  lead.visita = {
    status: 'solicitada',
    data: new Date().toISOString()
  };
  lead.etapaAtual = 'Visita solicitada';
  return lead;
}










// Página de confirmação do proprietário









// Página do corretor para confirmar/recusar visita (sem login)
app.get('/corretor/visita/:id', async (req, res) => {
  try {
    const { lerVisitas } = require('./services/salvarVisita');
    const todas = await lerVisitas();
    const visita = todas.find(v => String(v.id) === String(req.params.id));
    if (!visita) return res.status(404).send('<h2>Visita não encontrada</h2>');
    res.render('corretor-visita', { visita });
  } catch(e) {
    res.status(500).send('<h2>Erro: ' + e.message + '</h2>');
  }
});

app.post('/corretor/visita/:id/responder', async (req, res) => {
  try {
    const { resposta } = req.body;
    const { lerVisitas, salvarTodasVisitas: _salvarVisitas } = require('./services/salvarVisita');
    const todas = await lerVisitas();
    const idx = todas.findIndex(v => String(v.id) === String(req.params.id));
    if (idx < 0) return res.status(404).send('<h2>Visita não encontrada</h2>');

    const _EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
    const _EK = process.env.EVOLUTION_KEY || 'match2025evolution';
    const _BASE = process.env.RENDER ? 'https://matchimoveis.ia.br' : 'http://localhost:3000';
    const _v = todas[idx];
    const _telCliente = String(_v.telefone || _v.contato || '').replace(/\D/g,'');
    // Busca instância do corretor dono da visita
    const _userId = _v.userId || _v.user_id || _v.corretorId || _v.corretor_id || '';
    const { lerUsuarios: _luCV } = require('./services/salvarUsuario');
    const _usersCV = await _luCV();
    const _corrCV = _usersCV.find(u => u.id === _userId);
    const _instancia = _corrCV?.whatsappInstance || 'match-corretor';
    const _imovel = _v.imovelTitulo || _v.imovel_titulo || _v.imovelBairro || _v.imovel_bairro || 'imóvel';
    const _data = (_v.dataVisita || _v.data_visita) ? ' para ' + (_v.dataVisita || _v.data_visita) + ((_v.horaVisita || _v.hora_visita) ? ' às ' + (_v.horaVisita || _v.hora_visita) : '') : '';

    async function _enviarWA(numero, texto) {
      try {
        await fetch(_EU + '/message/sendText/' + _instancia, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': _EK },
          body: JSON.stringify({ number: '55' + numero.replace(/^55/,''), text: texto })
        });
      } catch(e) { console.error('[WA corretor-visita]', e.message); }
    }

    if (resposta === 'confirmar') {
      todas[idx].status = 'confirmada';
      todas[idx].respostaCorretor = 'confirmar';
      todas[idx].corretorConfirmouEm = new Date().toISOString();
      // WA para o cliente confirmar presença
      if (_telCliente) {
        const _linkConfirmar = _BASE + '/cliente/visita/' + _v.id + '/confirmar';
        const _linkRecusar = _BASE + '/cliente/visita/' + _v.id + '/recusar';
        const _msg = 'Olá *' + (_v.nome||'') + '*! Sua visita ao imóvel *' + _imovel + '*' + _data + ' foi confirmada!\n\nConfirme sua presença:\n✅ Confirmar: ' + _linkConfirmar + '\n❌ Não posso ir: ' + _linkRecusar;
        await _enviarWA(_telCliente, _msg);
      }
    } else if (resposta === 'indisponivel') {
      todas[idx].status = 'imovel_indisponivel';
      todas[idx].respostaCorretor = 'indisponivel';
      todas[idx].corretorRecusouEm = new Date().toISOString();
      // Inativa o imóvel no PG
      try {
        const { query: _qInat } = require('./services/db');
        const _agora = new Date().toISOString();
        await _qInat("UPDATE imoveis SET status='inativo', dados = dados || jsonb_build_object('status','inativo','inativadoEm',$2,'inativadoPor','corretor') WHERE id=$1 OR id_externo=$1 OR id_interno=$1", [_v.imovelId, _agora]);
        console.log('[corretor] Imóvel inativado:', _v.imovelId);
      } catch(_e) { console.error('[inativar]', _e.message); }
      // WA para o cliente com link da vitrine
      if (_telCliente) {
        const _leadId = _v.leadId || '';
        const _linkVitrine = _leadId ? _BASE + '/cliente/oferta/' + _leadId : _BASE;
        const _msg = 'Olá *' + (_v.nome||'') + '*! Infelizmente o imóvel *' + _imovel + '* não está mais disponível.\n\nAcesse a vitrine e escolha outra opção: ' + _linkVitrine;
        await _enviarWA(_telCliente, _msg);
      }
    } else if (resposta === 'remarcar') {
      todas[idx].status = 'pendente_remarcar';
      todas[idx].respostaCorretor = 'remarcar';
      todas[idx].corretorRemarcarEm = new Date().toISOString();
      // WA para o cliente remarcar
      if (_telCliente) {
        const _leadId = _v.leadId || '';
        const _imovelIdEnc = encodeURIComponent(_v.imovelId || '');
        const _linkRemarcar = _BASE + '/cliente/visita/' + _v.id + '/remarcar';
        const _msgRemarcar = 'Olá *' + (_v.nome||'') + '*! O corretor solicitou uma remarcação da visita ao imóvel *' + _imovel + '*.\n\nEscolha uma nova data: ' + _linkRemarcar;
        await _enviarWA(_telCliente, _msgRemarcar);
      }
    }

    await _salvarVisitas(todas);
    res.render('corretor-visita', { visita: todas[idx] });
  } catch(e) {
    console.error('[corretor-visita]', e.message);
    res.status(500).send('<h2>Erro: ' + e.message + '</h2>');
  }
});

app.post('/proprietario/visita/:visitaId/responder', async (req, res) => {
  const visitas = (_cacheVisitas || []);
  const idx = visitas.findIndex(v => v.id === req.params.visitaId);
  if (idx === -1) return res.status(404).send('Visita não encontrada');
  
  const { resposta } = req.body;
  consumir(visita?.ownerUserId || visita?.corretorId, 'confirmacao_auto').catch(()=>{});
    respostaProprietario = resposta;
  visitas[idx].respostaEm = new Date().toISOString();

  if (resposta === 'confirmar') {
    visitas[idx].status = 'confirmada';
    const telCliente = String(visitas[idx].telefone || visitas[idx].contato || '').replace(/\D/g,'');
    const dataVisita = visitas[idx].dataVisita || 'em breve';
    const horaVisita = visitas[idx].horaVisita || '';
    const imovelTitulo = visitas[idx].imovelTitulo || visitas[idx].imovelBairro || 'o imóvel';
    const msgCliente = 'Olá ' + (visitas[idx].nome || '') + '! Sua visita ao imóvel *' + imovelTitulo + '* foi confirmada para ' + dataVisita + (horaVisita ? ' às ' + horaVisita : '') + '. Qualquer dúvida, entre em contato!';
    visitas[idx].whatsappClienteLink = telCliente ? 'https://wa.me/55' + telCliente + '?text=' + encodeURIComponent(msgCliente) : '';
    visitas[idx].clienteNotificado = false;
  } else if (resposta === 'indisponivel') {
    visitas[idx].status = 'cancelada';
    // Marca imóvel como inativo
    try {
      const _iid = visitas[idx].imovelId;
      const _agora = new Date().toISOString();
      const _qInativar = `UPDATE imoveis SET dados = dados || jsonb_build_object('status','inativo','inativadoEm',$2,'inativadoPor','proprietario') WHERE id_externo=$1 OR id_interno=$1`;
      await _qExcluir(_qInativar, [_iid, _agora]);
      console.log('Imóvel inativado via PG:', _iid);
    } catch(_e) { console.error('[inativar imovel]', _e.message); }
  } else if (resposta === 'remarcar') {
    visitas[idx].status = 'pendente_remarcar';
  }

  salvarTodasVisitas(visitas).catch(e=>console.error("[visitas]",e.message));
  try {
    const _v = visitas[idx];
    const _uid = _v.userId || _v.corretorId || '';
    const _imovel = _v.imovelTitulo || _v.imovelBairro || 'imovel';
    const _cliente = _v.nome || 'cliente';
    const _data = _v.dataVisita || '';
    const _hora = _v.horaVisita || '';
    const _msgs = {
      confirmar: { titulo: 'Visita confirmada pelo proprietario', msg: 'O proprietario confirmou a visita de ' + _cliente + ' ao imovel ' + _imovel + ' para ' + _data + ' as ' + _hora + '.' },
      indisponivel: { titulo: 'Imovel indisponivel', msg: 'O proprietario informou que o imovel ' + _imovel + ' nao esta disponivel. Imovel inativado.' },
      remarcar: { titulo: 'Proprietario pediu remarcacao', msg: 'O proprietario do imovel ' + _imovel + ' nao pode receber ' + _cliente + ' no dia ' + _data + '. Peca ao cliente uma nova data.' }
    };
    const _info = _msgs[resposta];
    if (_info && _uid) {
      // Notifica corretor dono da lead
      criarNotificacaoService({ id: Date.now().toString(), tipo: 'visita_proprietario', titulo: _info.titulo, mensagem: _info.msg, usuarioId: _uid, lida: false, criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) });
      // Notifica parceiro dono do imóvel (se diferente do corretor)
      const _parcId = _v.imovelUsuarioId || '';
      if (_parcId && _parcId !== _uid) {
        const _msgParc = {
          confirmar: 'Você confirmou a visita de ' + _cliente + ' ao imóvel ' + _imovel + ' para ' + _data + ' às ' + _hora + '.',
          indisponivel: 'Você informou indisponibilidade do imóvel ' + _imovel + '. O imóvel foi inativado.',
          remarcar: 'Você pediu remarcação da visita de ' + _cliente + ' ao imóvel ' + _imovel + '.'
        }[resposta];
        if (_msgParc) criarNotificacaoService({ id: (Date.now()+1).toString(), tipo: 'visita_proprietario', titulo: _info.titulo, mensagem: _msgParc, usuarioId: _parcId, lida: false, criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) });
      }
      // notificações salvas via criarNotificacaoService (PG)
    }
  } catch(e) { console.log('Erro notif proprietario:', e.message); }
  consumir(_uid || '', 'notificacao_prop').catch(e=>console.error('[creditos] notificacao_prop falhou:', e.message));
  res.render('proprietario-confirmado', { resposta, visita: visitas[idx] });
})



// Antes com auth (qualquer corretor logado): a resposta usava `todos` (base
// inteira, sem filtrar por dono) em "ultimas3" — vazava nome/id/dono das 3
// leads mais recentes de QUALQUER corretor pra qualquer um autenticado.
app.get('/dev/diagnostico-leads', authAdmin, (req,res)=>{
  // authAdmin garante session.admin, não session.user (só existe se o admin
  // também tiver entrado como um corretor via /admin/acessar/:codigo) — trata
  // os dois casos em vez de assumir que user sempre existe.
  const user = req.session.user || null;
  const todos = (_cacheLeads || []);
  const uid = user ? user.id : null;
  const filtrados = user ? filtrarPorUsuario(todos, user) : todos;
  res.json({
    userId: uid,
    totalNoArquivo: todos.length,
    totalFiltrados: filtrados.length,
    ultimas3: todos.slice(-3).map(l=>({id:l.id,nome:l.nome,userId:l.userId,codigoUsuario:l.codigoUsuario,corretorId:l.corretorId}))
  });
});

function gerarCodigoUsuario(nome) {
  const ini = (nome||'USR').substring(0,3).toUpperCase().replace(/[^A-Z]/g,'').padEnd(3,'X');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i=0; i<4; i++) rand += chars[Math.floor(Math.random()*chars.length)];
  return ini + '-' + rand;
}


// ===== APP ROUTES =====





// ===== ROTAS APP =====


function readJsonSafe(file, fallback){
  try {
    if(!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file,'utf8'));
  } catch(e) {
    return fallback;
  }
}



// ===== ADMIN: ACOMPANHAR LISTAS POR CORRETOR =====
function safeReadJsonAdmin(file, fallback){
  try {
    if(!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file,'utf8'));
  } catch(e) {
    return fallback;
  }
}

function salvarHistoricoUpload(payload){
  const file = 'uploads-admin.json';
  const historico = safeReadJsonAdmin(file, []);
  historico.push({
    id: 'upload-' + Date.now(),
    data: new Date().toISOString(),
    ...payload
  });
  fs.writeFileSync(file, JSON.stringify(historico,null,2));
}


// ===== CORRETOR: MEUS LEADS + FAZER MATCH =====


// Antes sem auth: sem sessão, o código assumia a identidade de uma pessoa
// real (nome/telefone hardcoded) — parecia leftover de debug, mas ficava
// acessível em produção e vazava PII de terceiro no próprio código-fonte.
app.post('/app-leads/:idx/match', auth, async (req,res)=>{
  const usuario = req.session.user;

  const dataRaw = safeReadJsonAdmin(dataPath('data.json'), []);
  const data = Array.isArray(dataRaw) ? dataRaw : (dataRaw.results || []);

  const meusIndices = [];
  data.forEach((item, index)=>{
    const celularItem = String(item.corretorCelular || item.celularCorretor || '');
    const idItem = String(item.corretorId || '');
    const telUser = String(usuario.celular || usuario.telefone || '');
    if(idItem === usuario.id || celularItem === telUser) meusIndices.push(index);
  });

  const realIndex = meusIndices[Number(req.params.idx)];
  const item = data[realIndex];

  if(!item) return res.status(404).send('Lead não encontrado para este corretor.');

  try {
    const { searchQuintoAndar } = require('./services/quintoandar');
    const { searchRemax } = require('./services/remax');
    const { findTopMatches } = require('./services/matcher');

    const origin = item.origin || item;

    if((origin.cidade || '').toLowerCase() !== 'são paulo' && (origin.cidade || '').toLowerCase() !== 'sao paulo'){
      return res.send('Este lead não é de São Paulo/SP e não será processado para match.');
    }

    let candidatos = [];

    try {
      const qa = await searchQuintoAndar(origin);
      candidatos = candidatos.concat(qa || []);
    } catch(e) {
      console.log('Erro QuintoAndar:', e.message);
    }

    try {
      const rx = await searchRemax(origin);
      candidatos = candidatos.concat(rx || []);
    } catch(e) {
      console.log('Erro REMAX:', e.message);
    }

    const matches = findTopMatches(origin, candidatos, 8);

    item.matches = matches;
    item.matchCount = matches.length;
    item.bestScore = matches[0] ? matches[0].score : 0;
    item.matchedAt = new Date().toISOString();
    item.corretorId = usuario.id;
    item.corretorNome = usuario.nome;
    item.corretorCelular = usuario.celular || usuario.telefone;

    if(!item.leadId){
      item.leadId = 'lead-' + realIndex + '-' + Date.now();
    }

    salvarTodosLeads(data).catch(e=>console.error("[leads]",e.message));

    res.redirect('/app-leads');
  } catch(err) {
    console.error(err);
    res.status(500).send('Erro ao fazer match: ' + err.message);
  }
});

app.get('/import-status',(req,res)=>{
  res.json(global.importStatus || {status:'idle', total:0, mensagem:'Aguardando importação'});
});

app.get('/import-status',(req,res)=>{res.json({status:global.importStatus||'idle'});});

app.get('/logout', (req,res)=>{
  req.session.destroy(()=>res.redirect('/'));
});


// ===== ROTAS CORRETAS CORRETOR / ADMIN =====
app.get('/logout', (req,res)=>{
  req.session.destroy(()=>res.redirect('/'));
});

function usuarioLogado(req){
  return req.session.user || null;
}





// Meus imóveis = carteira do corretor, NÃO match


// Meus leads = leads/matches do corretor logado


// Admin match = somente painel de match


// ===== ROTAS CORRETAS CORRETOR / ADMIN =====
app.get('/logout', (req,res)=>{
  req.session.destroy(()=>res.redirect('/'));
});

function usuarioLogado(req){
  return req.session.user || null;
}

app.get('/app', (req,res)=>{
  if(!req.session.user) return res.redirect('/');
  res.redirect('/app-home');
});

// rota app-home removida (duplicada)

// Meus imóveis = carteira do corretor, NÃO match
app.get('/app-imoveis', (req,res)=>{
  return res.redirect('/app/imoveis');
});

////app.get('/app/portais', auth, (req,res)=>{
//  const portais = JSON.parse(require('fs').readFileSync('portais.json','utf8'));
//  res.render('app-portais', { user: req.session.user, portais });
//});

app.get('/app-xml', (req,res)=> res.redirect('/app-portais-xml'));
app.get('/app-portais', (req,res)=> res.redirect('/app-portais-xml'));


app.get('/app-perfil', (req,res)=>{
  renderAppPage(res, 'app-perfil', { title: 'Perfil' });
});

app.get('/logout', (req,res)=> res.redirect('/'));

// ===== ROTAS FINAIS LIMPAS DO APP =====

function auth(req,res,next){
  if(!req.session || !req.session.user) return res.redirect('/');
  // rotas liberadas mesmo sem saldo
  const _rotasLivres = ['/app/coins', '/app/perfil', '/pagamento', '/webhook', '/app/notificacoes', '/sair', '/app/whatsapp'];
  const _isLivre = _rotasLivres.some(r => req.path.startsWith(r));
  if(!_isLivre){
    const _userId = req.session.user.codigoUsuario || req.session.user.codigo || req.session.user.id;
    const _saldo = req.session.user.matchCoins || 0;
    if(_saldo !== undefined && _saldo <= 0 && req.session.user.tipo !== 'admin'){
      if(req.xhr || req.headers.accept?.includes('application/json')){
        return res.status(402).json({ok:false, erro:'Saldo insuficiente', redirect:'/app/coins'});
      }
      return res.redirect('/app/coins?sem_saldo=1');
    }
  }
  next();
}

function filtrarPorUsuario(lista, user){
  if (!Array.isArray(lista)) return [];
  if (user && user.tipo === 'admin') return lista;
  const uid = String(user && user.id || '');
  const tel = String(user && (user.celular || user.telefone) || '').replace(/\D/g,'');
  const cod = String(user && user.codigoUsuario || '');
  return lista.filter(item =>
    String(item.corretorId || '') === uid ||
    String(item.userId || '') === uid ||
    String(item.usuarioId || '') === uid ||
    String(item.corretorCelular || '').replace(/\D/g,'') === tel ||
    String(item.usuarioTelefone || '').replace(/\D/g,'') === tel ||
    (cod && String(item.codigoUsuario || '') === cod)
  );
}



// HELPERS DE LEITURA COM FILTRO AUTOMÁTICO
function lerImoveis(user) {
  const todos = _cacheImoveis || [];
  if (!user) return todos;
  const uid = user.id || user;
  return todos.filter(i =>
    String(i.userId||'') === String(uid) ||
    String(i.usuarioId||'') === String(uid) ||
    String(i.codigoUsuario||'') === String(uid) ||
    String(i.corretorId||'') === String(uid)
  );
}
// Cache em memória — sincronizado com PostgreSQL

// ROTA TEMPORARIA - cruzar proprietarios alex
app.post('/admin/cruzar-proprietarios-alex', authAdmin, express.json({limit:'10mb'}), async (req,res)=>{
  try {
    const mapa = req.body;
    const {rows} = await _pgPool.query("SELECT id,dados FROM imoveis WHERE user_id='ALE-DU2K'");
    let v=0,sf=0,sc=0;
    for(const im of rows){
      const fotos=im.fotos||[];
      if(!fotos.length){sf++;continue;}
      const m=fotos[0].match(/fotos\/(\d+)\//);
      if(!m){sf++;continue;}
      const prop=mapa[m[1]];
      if(!prop){sc++;continue;}
      await _pgPool.query("UPDATE imoveis SET dados=dados||jsonb_build_object('proprietario',$1::jsonb) WHERE id=$2",[JSON.stringify({...prop,status:'vinculado'}),im.id]);
      v++;
    }
    res.json({ok:true,vinculados:v,semFoto:sf,semCruz:sc});
  } catch(e){ res.json({ok:false,erro:e.message}); }
});

// ROTA TEMP - executar cruzamento alex internamente
app.get('/admin/executar-cruzar-alex', authAdmin, async (req,res)=>{
  try {
    const fs = require('fs');
    // mapa embutido via require do arquivo salvo no deploy
    const mapa = JSON.parse(fs.readFileSync(__dirname+'/mapa-alex-temp.json','utf8'));
    const {rows}=await _pgPool.query("SELECT id,fotos FROM imoveis WHERE user_id='ALE-DU2K' AND fotos IS NOT NULL");
    let v=0,sc=0;
    for(const im of rows){
      const m=im.fotos[0].match(/fotos\/(\d+)\//);
      if(!m){continue;}
      const prop=mapa[m[1]];
      if(!prop){sc++;continue;}
      await _pgPool.query("UPDATE imoveis SET proprietario=$1 WHERE id=$2",[JSON.stringify({...prop,status:'vinculado'}),im.id]);
      v++;
    }
    res.json({ok:true,vinculados:v,semCruz:sc});
  } catch(e){ res.json({ok:false,erro:e.message}); }
});

// ── CAMPANHA EMAIL ────────────────────────────────────────────────────────────
// Tracking abertura
app.get('/campanha/track/open/:id', async (req, res) => {
  try {
    const { query: _qOpen } = require('./services/db');
    await _qOpen("INSERT INTO campanha_tracking (contato_id,email,tipo) SELECT id,email,'abertura' FROM campanha_contatos WHERE id=$1", [req.params.id]);
    await _qOpen("UPDATE campanha_contatos SET aberto_em=COALESCE(aberto_em, NOW()) WHERE id=$1", [req.params.id]);
  } catch(e){}
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
  res.set({'Content-Type':'image/gif','Content-Length':pixel.length,'Cache-Control':'no-cache'});
  res.end(pixel);
});

// Tracking clique — o destino depende do modelo usado naquele envio
// (pagina -> cadastro geral, demanda -> /demanda), senão todo mundo que
// recebeu o modelo "demanda" cairia na home por engano.
app.get('/campanha/track/click/:id', async (req, res) => {
  let destino = 'https://www.matchimoveis.ia.br';
  try {
    if (req.params.id !== 'teste') {
      const { query: _qClick } = require('./services/db');
      await _qClick("INSERT INTO campanha_tracking (contato_id,email,tipo) SELECT id,email,'clique' FROM campanha_contatos WHERE id=$1", [req.params.id]);
      await _qClick("UPDATE campanha_contatos SET aberto_em=COALESCE(aberto_em, NOW()), clicado_em=COALESCE(clicado_em, NOW()) WHERE id=$1", [req.params.id]);
      const { rows } = await _qClick("SELECT modelo_usado FROM campanha_contatos WHERE id=$1", [req.params.id]);
      if (rows[0] && rows[0].modelo_usado === 'demanda') destino = 'https://www.matchimoveis.ia.br/demanda';
    }
  } catch(e){}
  res.redirect(destino);
});

// ── INTERESSADOS DE PORTAL (ImovelWeb) — distribuição pra contas de corretores ──
// Planilha bruta de "interessados" do portal (todas as imobiliárias, não só a
// MatchImóveis). A Sucursal "Rankim" é ignorada aqui (já entra pelo webhook
// global). As demais linhas são casadas por bairro/cidade+categoria+operação
// contra os imóveis já cadastrados dos corretores, até 3 contas por lead —
// sem match nenhum, a linha fica de fora (ver services/interesadosPortal.js).
app.get('/admin/interesados', authAdmin, (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Interessados de Portal</title>
  <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:0}
  ${_adminShellCss()}
  .admin-content{max-width:960px}
  h1{color:#FF385C;font-size:20px}
  .box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0}
  button{background:#FF385C;color:#fff;padding:10px 20px;border:none;border-radius:6px;cursor:pointer;font-size:13px;margin:4px 4px 4px 0}
  button.sec{background:#111827}
  button:disabled{opacity:.5;cursor:not-allowed}
  table{border-collapse:collapse;font-size:12px;margin-top:12px;min-width:100%}
  th{text-align:left;padding:6px;background:#f3f4f6;font-size:10px;text-transform:uppercase;color:#6b7280;white-space:nowrap}
  td{padding:6px;border-bottom:1px solid #f3f4f6;vertical-align:top;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
  td.wrap{white-space:normal}
  tr.sem-match{background:#fef2f2}
  .gray{color:#6b7280}.green{color:#16a34a}.red{color:#dc2626}
  .stat{display:inline-block;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;margin:4px 6px 4px 0;text-align:center;min-width:70px}
  .stat strong{display:block;font-size:20px;color:#FF385C}
  .stat.green strong{color:#16a34a}.stat.red strong{color:#dc2626}.stat.gray strong{color:#6b7280}
  </style></head><body>
  <div class="admin-app">${_adminSidebarHtml('interesados')}<main class="admin-content">
  <h1>📥 Interessados de Portal</h1>
  <p class="gray">Sobe a planilha de "interessados" exportada do portal (ImovelWeb) — a linha da Sucursal Rankim é ignorada (já entra pelo webhook global). As outras são distribuídas pra até 3 corretores que já atuam no bairro/cidade daquele interesse. A tela acumula: pode subir planilhas novas todo dia — linha idêntica em todas as colunas a uma já lida antes é descartada (dedup), diferente em qualquer coisa entra como nova.</p>
  <div class="box">
    <input type="file" id="arquivo" accept=".xlsx,.xls,.csv">
    <button onclick="preview()">👁️ Analisar planilha</button>
    <button class="sec" onclick="limparTudo()" style="background:#dc2626">🗑️ Limpar tudo (começar do zero)</button>
    <p class="gray" style="font-size:11px;margin:8px 0 0">Preenchimento vem só do título/mensagem da própria planilha — abrir o link do anúncio pra buscar mais dados foi desativado (o portal bloqueia acesso automatizado via Cloudflare, não dá pra contornar de forma confiável).</p>
    <div id="preview-status"></div>
  </div>
  <div class="box">
    <strong style="font-size:13px">🔬 Testar 1 URL de anúncio direto (diagnóstico)</strong><br>
    <input type="text" id="urlTeste" placeholder="https://www.imovelweb.com.br/propriedades/..." style="width:420px;max-width:80%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;margin-top:8px">
    <button onclick="testarUrl()">🔍 Testar</button>
    <div id="teste-status"></div>
    <div id="teste-tabela-wrap" style="display:none;overflow-x:auto">
      <table><tbody id="teste-tabela-body"></tbody></table>
    </div>
    <details id="teste-json-wrap" style="display:none;margin-top:10px">
      <summary style="cursor:pointer;font-size:11px;color:#6b7280">Ver dados brutos (JSON)</summary>
      <pre id="teste-json" style="background:#111827;color:#d1fae5;padding:12px;border-radius:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap"></pre>
    </details>
  </div>
  <div class="box" id="resultado-box" style="display:none">
    <div id="resumo"></div>
    <button id="btnImportar" class="sec" onclick="importar()" style="display:none">🚀 Distribuir leads pras contas</button>
    <div id="import-status"></div>
    <div style="overflow-x:auto"><table id="tabela"><thead><tr><th>Nome</th><th>Telefone</th><th>Email</th><th>Origem</th><th>Tipo</th><th>Transação</th><th>Condição</th><th>Bairro</th><th>Cidade</th><th>Estado</th><th>Quartos</th><th>Suítes</th><th>Vagas</th><th>Banheiros</th><th>Área_max</th><th>Valor_max</th><th>Observações</th><th>Data no portal</th><th>Minerado em</th><th>Corretores (até 3)</th></tr></thead><tbody id="tabela-body"></tbody></table></div>
  </div>
  <script>
  function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // Renderiza a tela acumulada (todas as leituras já feitas, persistidas no
  // banco) — usada tanto no carregamento da página quanto depois de subir
  // uma planilha nova ou distribuir leads.
  function renderTabela(linhas, extraStats){
    const comMatch = linhas.filter(l => l.corretores.length > 0 && !l.importado).length;
    const semMatch = linhas.filter(l => l.corretores.length === 0).length;
    const jaImportadas = linhas.filter(l => l.importado).length;
    const comBairro = linhas.filter(l => l.Bairro).length;
    const comQuartos = linhas.filter(l => l.Quartos).length;
    const comBairroEQuartos = linhas.filter(l => l.Bairro && l.Quartos).length;
    const comValor = linhas.filter(l => l.Valor_max).length;
    const completudeMedia = linhas.length ? Math.round(100 * linhas.reduce(function(s,l){ return s + (l.Completude||0)/(l.CompletudeTotal||1); }, 0) / linhas.length) : 0;
    document.getElementById('resumo').innerHTML =
      (extraStats || '') +
      '<div class="stat"><strong>'+linhas.length+'</strong>Total acumulado</div>'+
      '<div class="stat green"><strong>'+comMatch+'</strong>Com corretor (a distribuir)</div>'+
      '<div class="stat red"><strong>'+semMatch+'</strong>Sem match</div>'+
      '<div class="stat gray"><strong>'+jaImportadas+'</strong>Já distribuídas</div>'+
      '<div class="stat"><strong>'+comBairro+'</strong>Com bairro</div>'+
      '<div class="stat"><strong>'+comQuartos+'</strong>Com quartos</div>'+
      '<div class="stat"><strong>'+comBairroEQuartos+'</strong>Com bairro + quartos</div>'+
      '<div class="stat"><strong>'+comValor+'</strong>Com valor</div>'+
      '<div class="stat"><strong>'+completudeMedia+'%</strong>Completude média</div>';
    // Mais completas primeiro; entre as com mesma completude, com corretor primeiro
    const linhasOrdenadas = linhas.slice().sort(function(a, b){
      return (b.Completude||0) - (a.Completude||0) || ((b.corretores.length>0) - (a.corretores.length>0));
    });
    document.getElementById('tabela-body').innerHTML = linhasOrdenadas.map(function(l){
      const temMatch = l.corretores.length > 0;
      const corretoresTxt = l.importado ? '<span class="gray">✅ já distribuída</span>'
        : (temMatch ? l.corretores.map(function(c){ return escHtml(c.nome)+' ('+c.nivel+', '+c.totalImoveis+' im.)'; }).join('<br>') : '<span class="red">sem match</span>');
      const nomeTd = escHtml(l.Nome) + ' <span class="gray" style="font-size:10px">('+l.Completude+'/'+l.CompletudeTotal+')</span>';
      const cols = [l.Telefone, l.Email, l.Origem, l.Tipo, l.Transacao, l.Condicao, l.Bairro, l.Cidade, l.Estado, l.Quartos, l.Suites, l.Vagas, l.Banheiros, l.Area_max, l.Valor_max];
      const tds = cols.map(function(v){ return '<td>'+(v===''||v==null?'<span class="gray">—</span>':escHtml(v))+'</td>'; }).join('');
      const tdObs = '<td class="wrap">'+(l.Observacoes?escHtml(l.Observacoes):'<span class="gray">—</span>')+'</td>';
      const dataPortalTxt = l.dataLead ? new Date(l.dataLead).toLocaleString('pt-BR') : (l.data ? escHtml(l.data) : '<span class="gray">—</span>');
      const minaradoEmTxt = l.criadoEm ? new Date(l.criadoEm).toLocaleString('pt-BR') : '<span class="gray">—</span>';
      const tdDatas = '<td>'+dataPortalTxt+'</td><td>'+minaradoEmTxt+'</td>';
      return '<tr class="'+(temMatch&&!l.importado?'':'sem-match')+'"><td>'+nomeTd+'</td>' + tds + tdObs + tdDatas + '<td class="wrap">'+corretoresTxt+'</td></tr>';
    }).join('');
    document.getElementById('resultado-box').style.display = 'block';
    document.getElementById('btnImportar').style.display = comMatch>0 ? 'inline-block' : 'none';
  }

  async function carregarAcumulado(){
    try {
      const r = await fetch('/admin/interesados/lista');
      const d = await r.json();
      if(d.ok && d.linhas.length) renderTabela(d.linhas);
    } catch(e){}
  }
  carregarAcumulado();

  async function limparTudo(){
    if(!confirm('Apaga TODO o acumulado de Interessados de Portal (não afeta leads já distribuídas pras contas). Confirma?')) return;
    try {
      const r = await fetch('/admin/interesados/limpar', { method:'POST' });
      const d = await r.json();
      if(!d.ok){ alert('Erro: '+d.erro); return; }
      alert(d.apagadas+' linha(s) apagada(s). Pode subir a planilha nova.');
      document.getElementById('resultado-box').style.display = 'none';
      document.getElementById('tabela-body').innerHTML = '';
    } catch(e){ alert('Erro ao limpar.'); }
  }

  async function preview(){
    const f = document.getElementById('arquivo').files[0];
    if(!f){ alert('Selecione um arquivo'); return; }
    document.getElementById('preview-status').innerHTML = '<p>⏳ Analisando...</p>';
    const fd = new FormData(); fd.append('arquivo', f);
    try {
      const r = await fetch('/admin/interesados/preview', { method:'POST', body:fd });
      const d = await r.json();
      if(!d.ok){ document.getElementById('preview-status').innerHTML = '<p class="red">Erro: '+d.erro+'</p>'; return; }
      document.getElementById('preview-status').innerHTML =
        '<p class="green">✅ Planilha lida: '+d.totalLinhasArquivo+' linhas, '+d.linhasNestaLeitura+' processadas (fora Rankim) — <strong>'+d.novas+' novas</strong> adicionadas ao acumulado, '+d.duplicadas+' já existiam (descartadas, linha idêntica em todas as colunas) e não entraram de novo.</p>';
      renderTabela(d.linhas);
    } catch(e){ document.getElementById('preview-status').innerHTML = '<p class="red">Erro ao analisar.</p>'; }
  }
  async function testarUrl(){
    const url = document.getElementById('urlTeste').value.trim();
    if(!url){ alert('Cola a URL do anúncio'); return; }
    document.getElementById('teste-status').innerHTML = '<p>⏳ Abrindo a página (pode levar até 30s)...</p>';
    document.getElementById('teste-tabela-wrap').style.display = 'none';
    document.getElementById('teste-json-wrap').style.display = 'none';
    try {
      const r = await fetch('/admin/interesados/testar-url', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url }) });
      const d = await r.json();
      document.getElementById('teste-json').textContent = JSON.stringify(d, null, 2);
      document.getElementById('teste-json-wrap').style.display = 'block';
      if(!d.ok){
        document.getElementById('teste-status').innerHTML = '<p class="red">❌ Não conseguiu extrair: '+escHtml(d.erro||'erro desconhecido')+'</p>';
        return;
      }
      const achouEstruturado = d.fonte === 'avisoInfo';
      document.getElementById('teste-status').innerHTML = achouEstruturado
        ? '<p class="green">✅ Achou os dados estruturados do anúncio.</p>'
        : (d.bloqueado
            ? '<p class="red">⚠️ Página bloqueou o acesso (proteção anti-bot) — título: '+escHtml(d.titulo||'?')+'</p>'
            : '<p class="red">⚠️ Abriu a página mas não achou os dados estruturados — título: '+escHtml(d.titulo||'?')+'</p>');
      const fmt = v => (v===''||v==null||v===0) ? '<span class="gray">—</span>' : escHtml(v);
      const linhas = [
        ['Título', d.titulo],
        ['Tipo', d.tipo],
        ['Bairro', d.bairro],
        ['Cidade', d.cidade],
        ['Estado', d.estado],
        ['Quartos', d.quartos],
        ['Suítes', d.suites],
        ['Banheiros', d.banheiros],
        ['Vagas', d.vagas],
        ['Área (m²)', d.area_m2],
        ['Condomínio', d.condominio],
        ['IPTU', d.iptu],
        ['Valor', d.valor_imovel],
        ['Disponível?', d.indisponivel ? 'Não (anúncio indisponível)' : 'Sim'],
        ['Diferenciais', d.diferenciais && d.diferenciais.length ? d.diferenciais.join(', ') : ''],
        ['Descrição', d.descricao || d.textoPagina || ''],
        ['Fonte dos dados', d.fonte]
      ];
      document.getElementById('teste-tabela-body').innerHTML = linhas.map(function(l){
        return '<tr><td style="white-space:nowrap;font-weight:bold;background:#f9fafb">'+escHtml(l[0])+'</td><td class="wrap">'+fmt(l[1])+'</td></tr>';
      }).join('');
      document.getElementById('teste-tabela-wrap').style.display = 'block';
    } catch(e){ document.getElementById('teste-status').innerHTML = '<p class="red">Erro ao testar.</p>'; }
  }
  async function importar(){
    if(!confirm('Confirma distribuir as leads (ainda não distribuídas) do acumulado pras contas dos corretores? Isso cria leads de verdade.')) return;
    const btn = document.getElementById('btnImportar');
    btn.disabled = true;
    document.getElementById('import-status').innerHTML = '<p>⏳ Distribuindo...</p>';
    try {
      const r = await fetch('/admin/interesados/importar', { method:'POST', headers:{'Content-Type':'application/json'}, body: '{}' });
      const d = await r.json();
      btn.disabled = false;
      if(!d.ok){ document.getElementById('import-status').innerHTML = '<p class="red">Erro: '+d.erro+'</p>'; return; }
      document.getElementById('import-status').innerHTML = '<p class="green">✅ '+d.leadsGerenciadas+' leads criadas em contas de corretores ('+d.linhasDistribuidas+' linhas distribuídas, '+d.linhasSemMatch+' seguem sem match).</p>';
      carregarAcumulado();
    } catch(e){ document.getElementById('import-status').innerHTML = '<p class="red">Erro ao distribuir.</p>'; btn.disabled=false; }
  }
  </script>
  </main></div></body></html>`);
});

app.get('/admin/interesados/lista', authAdmin, async (req, res) => {
  try {
    const { listarLinhasSalvas } = require('./services/interesadosPortal');
    const linhas = await listarLinhasSalvas();
    res.json({ ok: true, linhas });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/admin/interesados/preview', authAdmin, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, erro: 'Nenhum arquivo enviado' });
    const { processarEArmazenar } = require('./services/interesadosPortal');
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(req.file.path);
    const totalLinhasArquivo = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }).length;
    const { novas, duplicadas, linhasNestaLeitura, linhas } = await processarEArmazenar(req.file.path);
    res.json({ ok: true, linhas, totalLinhasArquivo, linhasNestaLeitura, novas, duplicadas });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/admin/interesados/testar-url', authAdmin, express.json(), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.json({ ok: false, erro: 'URL não informada' });
    const { extrairDadosAnuncio } = require('./services/extratorPortal');
    const resultado = await extrairDadosAnuncio(url);
    res.json(resultado);
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/admin/interesados/importar', authAdmin, express.json(), async (req, res) => {
  try {
    const { importarInteresados } = require('./services/interesadosPortal');
    const resultado = await importarInteresados();
    res.json({ ok: true, ...resultado });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/admin/interesados/limpar', authAdmin, async (req, res) => {
  try {
    const { limparTudo } = require('./services/interesadosPortal');
    const resultado = await limparTudo();
    res.json({ ok: true, ...resultado });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});
// ── FIM INTERESSADOS DE PORTAL ────────────────────────────────────────────────

// ── BUSCAR DEMANDA POR REGIÃO ──────────────────────────────────────────────
// Ferramenta de demonstração: escolhe estado + quantas cidades/bairros
// quiser + venda/aluguel e mostra quantos interessados foram minerados/
// extraídos do portal (Interessados de Portal) nesse perfil. NÃO usa leads
// reais da plataforma (WhatsApp/manual/webhook) — só o que veio do portal.
// Página compartilhada por /admin/demanda (com login) e /demanda (pública,
// pra mandar link pra fora) — mesma tela, só muda o prefixo das chamadas de
// API e se vem com a moldura do admin (sidebar) ou uma moldura simples.
async function _paginaBuscaDemanda({ apiPrefix, isAdmin }) {
  const { listarEstadosComLead, contarDisponiveis } = require('./services/buscaDemanda');
  const estados = await listarEstadosComLead();
  const optionsEstados = estados.map(e => '<option value="'+e.sigla+'">'+e.sigla+' — '+e.nome+'</option>').join('');
  // Prova/urgência real (não inventada) — total disponível agora e quantos
  // chegaram nas últimas 24h, nacional. Se vier 0 (base vazia/erro), a barra
  // some em vez de mostrar número falso.
  const disponiveis = await contarDisponiveis();
  const shellCss = isAdmin ? _adminShellCss() : '';
  const contentCss = isAdmin ? '.admin-content{max-width:960px}' : '.public-content{max-width:1280px;margin:0 auto;padding:24px 32px}';
  const bodyOpen = isAdmin ? `<div class="admin-app">${_adminSidebarHtml('demanda')}<main class="admin-content">` : '<div class="public-content">';
  const bodyClose = isAdmin ? '</main></div>' : '</div>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Buscar Demanda por Região</title>
  <style>*{box-sizing:border-box}
  :root{--rausch:#FF385C;--babu:#00A699;--arches:#FC642D;--ink:#111827;--sec:#6b7280;--border:#e5e7eb;--bg:#f9fafb}
  html,body{overflow-x:hidden;max-width:100%}
  body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;margin:0;padding:0;color:var(--ink)}
  ${shellCss}
  ${contentCss}
  .hero{background:linear-gradient(135deg,var(--rausch),var(--arches));border-radius:14px;padding:28px 24px;margin:16px 0;color:#fff}
  .hero h1{margin:0 0 8px;font-size:24px;color:#fff}
  .hero p{margin:0;font-size:14px;opacity:.95;max-width:820px;line-height:1.5}
  h1{color:var(--rausch);font-size:20px}
  h2.secao{font-size:16px;color:var(--ink);margin:28px 0 4px}
  .box{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px;margin:16px 0}
  .campos-geo{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:start}
  .campo select,.campo input[type=text]{max-width:none}
  .campo label{margin-top:0}
  .campo-buscar button{margin-top:0;white-space:nowrap}
  input[type=range]{accent-color:var(--rausch);height:6px;cursor:pointer}
  label{display:block;font-size:12px;font-weight:bold;color:#374151;margin:12px 0 4px}
  select,input[type=text],input[type=email],input[type=password]{width:100%;max-width:360px;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:16px}
  button{background:var(--rausch);color:#fff;padding:10px 20px;border:none;border-radius:6px;cursor:pointer;font-size:13px;margin-top:14px;font-weight:bold}
  button:hover{filter:brightness(.95)}
  button:disabled{opacity:.5;cursor:not-allowed}
  .chk-transacao{display:flex;gap:16px;margin-top:6px}
  .chk-transacao label{display:flex;align-items:center;gap:6px;font-weight:normal;font-size:13px;color:#111827;margin:0}
  .sugestoes-dropdown{position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid #d1d5db;border-top:none;max-height:220px;overflow-y:auto;border-radius:0 0 6px 6px;box-shadow:0 4px 10px rgba(0,0,0,.08)}
  .sugestao-item{padding:8px 10px;cursor:pointer;font-size:13px}
  .sugestao-item:hover{background:#f3f4f6}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;max-width:600px}
  .chip{display:inline-flex;align-items:center;gap:6px;background:#fff1f2;color:#111827;border:1px solid #fecdd3;border-radius:999px;padding:4px 6px 4px 12px;font-size:12px}
  .chip button{all:unset;cursor:pointer;color:#6b7280;font-weight:bold;padding:0 6px;line-height:1;margin-top:0}
  .chip button:hover{color:var(--rausch)}
  .gray{color:var(--sec)}.green{color:#16a34a}.red{color:#dc2626}
  .confirm-check{color:#16a34a;font-weight:bold;text-transform:none;font-size:11px}
  select.ok,input.ok{border-color:#16a34a!important;background:#f0fdf4}
  table{border-collapse:collapse;font-size:12px;margin-top:12px;min-width:100%}
  th{text-align:left;padding:6px;background:#f3f4f6;font-size:10px;text-transform:uppercase;color:#6b7280;white-space:nowrap}
  td{padding:6px;border-bottom:1px solid #f3f4f6;vertical-align:top;white-space:nowrap}
  .banner-ia{background:var(--ink);color:#fff;border-radius:8px;padding:16px 20px;margin:16px 0;font-size:15px}
  .banner-ia strong{color:#4ade80}
  .pensando-box{background:#fff;border-radius:14px;padding:28px 24px;max-width:340px;width:100%;box-sizing:border-box;box-shadow:0 20px 50px rgba(0,0,0,.25)}
  .pensando-legenda{text-align:center;font-size:12.5px;color:var(--sec);min-height:32px}
  .pensando-sub{text-align:center;font-size:11px;color:var(--babu);font-weight:600;margin-top:2px;min-height:14px}
  .pensando-card{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px;margin-top:14px;min-height:88px;opacity:0;transform:translateY(6px);transition:opacity .35s ease,transform .35s ease;overflow:hidden}
  .pensando-card.mostrar{opacity:1;transform:translateY(0)}
  .pensando-card-foto{width:calc(100% + 28px);margin:-14px -14px 10px;height:130px;object-fit:cover;display:block}
  .pensando-card-topo{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-weight:700;font-size:13px;color:var(--ink);min-width:0}
  .pensando-card-topo span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
  .pensando-card-valor{color:var(--babu);white-space:nowrap;flex-shrink:0}
  .pensando-card-contato{font-size:11px;color:var(--sec);margin-top:3px}
  .pensando-card-tags{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}
  .pensando-card-tags span{background:#fff;border-radius:999px;padding:3px 9px;font-size:10.5px;font-weight:600;color:var(--sec)}
  .pensando-card-loc{font-size:11.5px;color:var(--sec)}
  .pensando-card-dias{font-size:11px;color:var(--babu);font-weight:600;margin-top:6px}
  #btnBuscarDemanda{min-width:160px}
  .proof-bar{display:flex;flex-wrap:wrap;gap:8px 18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 16px;margin:14px 0;font-size:12px;font-weight:600;color:#9a3412}
  .proof-bar strong{color:var(--rausch)}
  .trust-bar{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 22px;margin:24px 0 12px;padding:14px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--sec);font-weight:600;text-align:center}
  .pagina-footer{margin:32px 0 16px;padding-top:20px;border-top:1px solid var(--border)}
  .pagina-footer .footer-top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px}
  .pagina-footer .footer-logo{font-size:14px;font-weight:700;color:var(--ink)}
  .pagina-footer .footer-logo span{color:var(--rausch)}
  .pagina-footer .footer-links{display:flex;flex-wrap:wrap;gap:16px}
  .pagina-footer .footer-links a{font-size:12px;color:var(--sec);text-decoration:none}
  .pagina-footer .footer-links a:hover{color:var(--rausch);text-decoration:underline}
  .pagina-footer .footer-empresa{font-size:11px;color:var(--sec);margin-top:14px}
  .pagina-footer .footer-note{font-size:11px;color:var(--sec);opacity:.8;margin-top:2px}
  .por-lead{font-size:11px;color:var(--sec);margin-top:2px}
  .combo-features{list-style:none;margin:10px 0 0;padding:10px 0 0;border-top:1px solid var(--border);text-align:left;display:flex;flex-direction:column;gap:5px}
  .combo-features li{font-size:11.5px;color:var(--sec);display:flex;align-items:flex-start;gap:6px}
  .combo-features li::before{content:'✓';color:var(--babu);font-weight:bold;flex-shrink:0}
  .hero-tags{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:14px}
  .hero-tags span{font-size:12px;font-weight:600}
  .combos{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin:14px 0}
  .combo{background:#fff;border:2px solid var(--border);border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:border-color .15s,transform .15s}
  .combo:hover{border-color:var(--babu);transform:translateY(-2px)}
  .combo.combo-recomendado{border-color:var(--rausch);box-shadow:0 4px 16px rgba(255,56,92,.15)}
  .combo .badge{display:inline-block;background:var(--rausch);color:#fff;font-size:10px;font-weight:bold;padding:3px 10px;border-radius:999px;margin-bottom:8px}
  .combo .qtd{font-size:22px;font-weight:bold;color:var(--ink)}
  .combo .label{font-size:12px;color:var(--sec);margin:2px 0 10px}
  .combo .preco{font-size:18px;font-weight:bold;color:var(--babu)}
  .combo .preco span{font-size:11px;color:var(--sec);font-weight:normal}
  .combo .preco-original{font-size:13px;color:var(--sec);font-weight:normal;text-decoration:line-through;margin-right:6px}
  .entram-conta{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:6px 10px;margin-top:10px;font-size:11.5px;color:#166534;text-align:left}
  .entram-conta strong{color:#15803d}
  .restante-nota{font-size:10.5px;color:var(--sec);text-align:left;margin-top:4px;line-height:1.4}
  .combo button{width:100%;margin-top:12px}
  .combo.combo-recomendado button{background:var(--rausch)}
  .promo-desconto{background:linear-gradient(135deg,var(--rausch),var(--arches));color:#fff;border-radius:10px;padding:12px 16px;margin:14px 0;text-align:center;font-size:14px;font-weight:700}
  .promo-desconto span{display:block;font-size:12px;font-weight:600;opacity:.95;margin-top:2px}
  .modal-overlay{position:fixed;inset:0;background:rgba(17,24,39,.6);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px}
  .signup-box{background:#fff;border-radius:14px;padding:24px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;position:relative;box-shadow:0 20px 50px rgba(0,0,0,.25)}
  .signup-box .combo-escolhido{background:var(--bg);border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:14px}
  .modal-close{position:absolute;top:12px;right:12px;width:28px;height:28px;border-radius:999px;background:var(--bg);border:none;font-size:16px;color:var(--sec);cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;padding:0}
  .modal-close:hover{background:#fee2e2;color:var(--rausch)}
  @media (max-width:1100px){
    .campos-geo{grid-template-columns:1fr 1fr}
  }
  .scroll-hint{display:none}
  @media (max-width:760px){
    .campos-geo{grid-template-columns:1fr;gap:0}
    .scroll-hint{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--rausch);margin:10px 0 4px;animation:scrollHintPulso 1.6s ease-in-out infinite}
  }
  @keyframes scrollHintPulso{0%,100%{opacity:.6}50%{opacity:1}}
  .atividade-wrap{margin:16px 0}
  .atividade-label{font-size:11px;font-weight:600;color:var(--sec);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:6px}
  .atividade-label::before{content:'';width:7px;height:7px;background:#16a34a;border-radius:50%;animation:scrollHintPulso 1.5s infinite}
  .atividade-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .atividade-card{background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;text-align:left;min-height:230px;opacity:0;transition:opacity .4s ease}
  .atividade-card.mostrar{opacity:1}
  .atividade-card-foto{width:100%;height:88px;object-fit:cover;display:block;background:var(--bg)}
  .atividade-card-corpo{padding:10px}
  .atividade-card-topo{display:flex;justify-content:space-between;align-items:baseline;gap:6px;font-weight:600;font-size:11.5px;color:var(--ink);min-width:0}
  .atividade-card-topo span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
  .atividade-card-valor{color:var(--babu);white-space:nowrap;flex-shrink:0;font-size:11px}
  .atividade-card-contato{font-size:10px;color:var(--sec);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .atividade-card-tags{display:flex;flex-wrap:wrap;gap:4px;margin:7px 0}
  .atividade-card-tags span{background:var(--bg);border-radius:999px;padding:2px 7px;font-size:9.5px;font-weight:600;color:var(--sec)}
  .atividade-card-loc{font-size:10.5px;color:var(--sec)}
  .atividade-card-dias{font-size:10px;color:#16a34a;font-weight:600;margin-top:5px}
  @media (max-width:600px){
    body{overflow-x:hidden}
    .public-content,.admin-content{padding-left:12px;padding-right:12px}
    .hero{padding:18px 16px;border-radius:10px}
    .hero h1{font-size:19px}
    .hero p{font-size:13px}
    .campos-geo{grid-template-columns:1fr;gap:0}
    select,input[type=text],input[type=email],input[type=password]{max-width:100%}
    .chips{max-width:100%}
    .combos{grid-template-columns:1fr}
    .signup-box{max-width:100%}
    .combo button,#btnComprar,#btnBuscarDemanda{width:100%}
    .atividade-grid{grid-template-columns:repeat(2,1fr);gap:8px}
    .atividade-card{min-height:0}
    .atividade-card-foto{height:90px}
    .atividade-card-corpo{padding:7px}
    .atividade-card-contato{display:none}
    .atividade-card-tags span{padding:1px 5px}
  }
  .topbar-logo{display:flex;align-items:center;gap:8px;padding:16px 0 0}
  .topbar-logo .mark{width:28px;height:28px;background:var(--rausch);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0}
  .topbar-logo .nome{font-size:16px;font-weight:700;letter-spacing:-.3px;color:var(--ink)}
  .topbar-logo .nome span{color:var(--rausch)}
  </style></head><body>
  ${bodyOpen}
  ${isAdmin ? '' : '<div class="topbar-logo"><div class="mark">M</div><div class="nome">Match<span>Imóveis</span></div></div>'}
  <div class="hero">
    <h1>📍 Quantos clientes/leads reais tem na sua região agora?</h1>
    <p>Busque abaixo, veja o número na hora e leve os leads pra sua conta hoje.</p>
    <div class="hero-tags"><span>✅ Leads reais, não é crédito</span><span>✅ Sem comissão</span><span>✅ Acesso completo à plataforma</span><span>✅ Sem fidelidade — pague e use</span></div>
  </div>
  ${disponiveis.total > 0 ? `<div class="proof-bar">
    <span>🔥 <strong>${disponiveis.total.toLocaleString('pt-BR')}</strong> disponíveis agora</span>
    ${disponiveis.recentes24h > 0 ? `<span>⏱ <strong>${disponiveis.recentes24h.toLocaleString('pt-BR')}</strong> chegaram nas últimas 24h</span>` : ''}
    <span>⚡ somem da lista assim que alguém compra</span>
  </div>` : ''}

  <div class="atividade-wrap" id="atividade-wrap" style="display:none">
    <p class="atividade-label">Acontecendo agora na plataforma</p>
    <div class="atividade-grid" id="atividade-grid"></div>
  </div>

  <div class="box">
    <div class="campos-geo">
      <div class="campo">
        <label>Estado <span id="estado-check" class="confirm-check" style="display:none">✓ selecionado</span></label>
        <select id="estado"><option value="">Selecione...</option>${optionsEstados}</select>
      </div>

      <div class="campo">
        <label>Cidades (escolha quantas quiser) <span id="cidade-check" class="confirm-check" style="display:none">✓ selecionada</span></label>
        <div style="position:relative">
          <input type="text" id="cidadeInput" placeholder="Selecione o estado primeiro..." disabled autocomplete="off" style="width:100%">
          <div id="cidade-sugestoes" class="sugestoes-dropdown" style="display:none"></div>
        </div>
        <div id="cidades-chips" class="chips"></div>
      </div>

      <div class="campo">
        <label>Bairros (escolha quantos quiser) <span id="bairro-check" class="confirm-check" style="display:none">✓ selecionado</span></label>
        <div style="position:relative">
          <input type="text" id="filtroBairro" placeholder="Selecione ao menos 1 cidade primeiro..." disabled autocomplete="off" style="width:100%">
          <div id="bairro-sugestoes" class="sugestoes-dropdown" style="display:none"></div>
        </div>
        <div id="bairros-chips" class="chips"></div>
      </div>

    </div>
    <div style="display:flex;flex-wrap:wrap;gap:32px;margin-top:14px;align-items:flex-start">
      <div class="campo" style="max-width:320px;flex:1;min-width:220px">
        <label>Data — <span id="diasBuscaValor" style="font-size:15px;color:var(--rausch);font-weight:bold">7</span> dias</label>
        <input type="range" id="diasBusca" min="1" max="30" value="7" step="1" style="width:100%;max-width:none" oninput="document.getElementById('diasBuscaValor').textContent = this.value">
        <p class="gray" style="font-size:11.5px;margin-top:4px">Quanto mais você aumenta a data, mais leads você recebe. Quanto mais diminui, menos leads.</p>
      </div>
      <div class="campo">
        <label>Transação</label>
        <div class="chk-transacao">
          <label><input type="checkbox" id="chkVenda" checked> Venda</label>
          <label><input type="checkbox" id="chkAluguel" checked> Aluguel</label>
        </div>
      </div>
    </div>
    <div class="campo-buscar" style="margin-top:16px">
      <button type="button" id="btnBuscarDemanda" onclick="buscarDemanda()" disabled style="width:100%">🔍 Buscar</button>
    </div>
    <div id="busca-status"></div>
  </div>

  <div id="pensando-modal-overlay" class="modal-overlay" style="display:none">
    <div class="pensando-box">
      <p id="pensando-texto" class="pensando-legenda"></p>
      <p id="pensando-sub" class="pensando-sub"></p>
      <div id="pensando-card" class="pensando-card"></div>
    </div>
  </div>

  <div id="resultado-box" style="display:none">
    <div id="banner-resultado" class="banner-ia"></div>
    <div class="scroll-hint">👉 Arraste a tabela pro lado pra ver todas as colunas</div>
    <div id="tabela-scroll" style="overflow-x:auto"><table id="tabela"><thead><tr><th>Nome</th><th>Telefone</th><th>Email</th><th>Origem</th><th>Tipo</th><th>Transação</th><th>Bairro</th><th>Cidade</th><th>Estado</th><th>Área_max</th><th>Valor_max</th><th>Data</th></tr></thead><tbody id="tabela-body"></tbody></table></div>

    <div style="text-align:center;margin:20px 0">
      <button type="button" id="btnCustoLeads" onclick="avancarParaPlanos()" style="display:none;animation:scrollHintPulso 1.5s infinite">💰 Quanto me custa essas leads?</button>
    </div>

    ${isAdmin ? `<div class="box" id="transferir-box">
      <h2 class="secao" style="margin-top:0">🎁 Transferir manualmente pra uma conta</h2>
      <p class="gray" style="font-size:13px">Entrega esses leads direto na conta escolhida (sem Mercado Pago) e debita da conta o equivalente em créditos do combo correspondente à quantidade encontrada.</p>
      <div style="position:relative;max-width:360px">
        <input type="text" id="contaDestinoInput" placeholder="Buscar conta por nome ou código..." autocomplete="off">
        <div id="conta-sugestoes" class="sugestoes-dropdown" style="display:none"></div>
      </div>
      <p id="conta-escolhida-txt" class="gray" style="font-size:12.5px;margin-top:6px"></p>
      <button type="button" id="btnTransferirDemanda" onclick="transferirParaConta()" disabled>🎁 Transferir pra essa conta</button>
      <p id="transferir-status" style="font-size:12.5px;margin-top:8px"></p>
    </div>` : ''}

    <div id="combos-box" style="display:none">
      <h2 class="secao">📦 Escolha seu combo</h2>
      <p class="gray" style="font-size:13px">Combos de leads mineradas por mês — já indicamos qual cabe na quantidade que a IA encontrou.</p>
      <p class="gray" style="font-size:13px">Se preferir, pode escolher um combo menor — nesse caso você recebe a quantidade de leads do combo escolhido, não o total encontrado na busca. Outra opção é diminuir os dias da busca lá em cima pra encontrar menos leads e enquadrar no combo que você quer.</p>
      <p class="gray" style="font-size:13px"><strong>Sem fidelidade — pague e use.</strong> Não é assinatura nem mensalidade obrigatória: você compra o combo que quiser, quando quiser, sem compromisso de recorrência.</p>
      <div id="promo-desconto-combo"></div>
      <div class="combos" id="combos-lista"></div>
    </div>

    ${isAdmin ? '' : `<div id="signup-modal-overlay" class="modal-overlay" style="display:none">
      <div id="signup-box" class="signup-box">
        <button type="button" class="modal-close" onclick="fecharModalCompra()">×</button>
        <div class="combo-escolhido" id="combo-escolhido-resumo" style="display:none"></div>
        <p id="signup-subtitulo" class="gray" style="font-size:12.5px;margin:0 0 10px;display:none">Sua busca já achou interessados na região — deixa seus dados que a gente guarda essa busca na sua conta. Você só paga quando (e se) quiser levar os leads pra sua carteira.</p>
        <h2 class="secao" id="signup-titulo" style="margin-top:0">Criar conta e finalizar</h2>
        <div id="campos-cadastro">
          <label>Nome completo</label>
          <input type="text" id="suNome" placeholder="Seu nome completo">
          <label>Email</label>
          <input type="email" id="suEmail" placeholder="voce@email.com">
          <label>Celular (WhatsApp)</label>
          <input type="text" id="suCelular" placeholder="47999999999">
          <label>Senha</label>
          <input type="password" id="suSenha" placeholder="Crie uma senha">
        </div>
        <div id="campo-cpf" style="display:none">
          <label>CPF <span class="gray" style="font-weight:normal">(exigido pelo Mercado Pago pra gerar o Pix)</span></label>
          <input type="text" id="suCpf" placeholder="000.000.000-00">
        </div>
        <div id="signup-status"></div>
        <button id="btnComprar" onclick="finalizarCompra()">Ir para pagamento →</button>
        <p class="gray" id="signup-rodape-pagamento" style="font-size:11px;margin-top:10px">🔒 Pagamento seguro pelo Mercado Pago • Compra única, sem mensalidade automática. Os leads da sua busca são entregues assim que o pagamento for aprovado — <strong>mas ficam disponíveis pra qualquer corretor até lá.</strong></p>
        <p class="gray" id="signup-rodape-cadastro" style="font-size:11px;margin-top:10px;display:none">🔒 Sem cobrança nenhuma agora — é só criar a conta. Você escolhe o combo e paga quando quiser.</p>
      </div>
    </div>`}
  </div>

  <div class="trust-bar">
    <span>🔒 Pagamento seguro Mercado Pago</span>
    <span>🙈 Dados ocultos até a compra</span>
    <span>🚫 Sem mensalidade automática</span>
    <span>🏠 Acesso completo à plataforma</span>
  </div>
  ${isAdmin ? '' : `<footer class="pagina-footer">
    <div class="footer-top">
      <span class="footer-logo">Match<span>Imóveis</span></span>
      <div class="footer-links">
        <a href="https://wa.me/5511951131609?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20o%20MatchIm%C3%B3veis." target="_blank">Fale Conosco</a>
        <a href="/politica-privacidade">Política de Privacidade</a>
        <a href="/termos-de-uso">Termos de Uso</a>
        <a href="/entrar">Já tenho conta</a>
      </div>
    </div>
    <div class="footer-empresa">Match Imóveis é uma plataforma do Grupo Rankim.</div>
    <div class="footer-note">© 2026 Match Imóveis — Grupo Rankim. Todos os direitos reservados.</div>
  </footer>`}
  <script>
  function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  // Busca sem se importar com acento — digitar "sao paulo" tem que achar
  // "São Paulo" e vice-versa, já que os dados vêm de fontes diferentes
  // (umas com acento, outras sem).
  function _normTexto(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }
  let _cidadesNomes = [];
  let _cidadesSelecionadas = [];
  let _bairrosPorCidade = {};
  let _paresDisponiveis = [];
  let _paresMarcados = [];

  function _parChave(p){ return p.cidade + '|||' + p.bairro; }

  async function onEstadoChange(estado){
    const cidadeInput = document.getElementById('cidadeInput');
    _cidadesNomes = [];
    _cidadesSelecionadas = [];
    _bairrosPorCidade = {};
    _paresDisponiveis = [];
    _paresMarcados = [];
    renderCidadesChips();
    esconderSugestoesBairro();
    renderBairrosChips();
    cidadeInput.value = '';
    cidadeInput.disabled = true;
    esconderSugestoesCidade();
    document.getElementById('filtroBairro').disabled = true;
    document.getElementById('filtroBairro').value = '';
    document.getElementById('estado').classList.toggle('ok', !!estado);
    document.getElementById('estado-check').style.display = estado ? 'inline' : 'none';
    if(!estado) { cidadeInput.placeholder = 'Selecione o estado primeiro...'; return; }
    cidadeInput.placeholder = 'Carregando...';
    const r = await fetch('${apiPrefix}/cidades?estado='+encodeURIComponent(estado));
    const d = await r.json();
    _cidadesNomes = d.cidades || [];
    cidadeInput.placeholder = 'Digite pra buscar a cidade (' + _cidadesNomes.length + ')...';
    cidadeInput.disabled = false;
  }

  document.getElementById('estado').addEventListener('change', function(){
    onEstadoChange(this.value);
  });

  // Mobile (Safari/Chrome) às vezes restaura o <select> de Estado já
  // preenchido (autofill/voltar da página) sem disparar o evento 'change'
  // — o campo de Cidades fica travado em "Selecione o estado primeiro..."
  // mesmo com o Estado visivelmente selecionado. Confere no carregamento
  // (e toda vez que a página volta do cache do navegador) se o select já
  // tem valor e, nesse caso, carrega as cidades manualmente.
  function _sincronizarEstadoJaPreenchido(){
    const estadoAtual = document.getElementById('estado').value;
    if(estadoAtual && document.getElementById('cidadeInput').disabled){
      onEstadoChange(estadoAtual);
    }
  }
  _sincronizarEstadoJaPreenchido();
  window.addEventListener('pageshow', _sincronizarEstadoJaPreenchido);

  function esconderSugestoesCidade(){
    document.getElementById('cidade-sugestoes').style.display = 'none';
  }

  // Sem termo digitado ainda: mostra logo as cidades com lead disponível
  // (não precisa digitar pra ver as opções) — só filtra de verdade quando
  // o usuário começa a digitar.
  function renderSugestoesCidade(){
    const termo = _normTexto(document.getElementById('cidadeInput').value.trim());
    const box = document.getElementById('cidade-sugestoes');
    const disponiveis = _cidadesNomes.filter(function(c){ return _cidadesSelecionadas.indexOf(c) === -1; });
    if(!disponiveis.length){ box.style.display = 'none'; return; }
    const visiveis = (termo ? disponiveis.filter(function(c){ return _normTexto(c).includes(termo); }) : disponiveis).slice(0, 30);
    if(!visiveis.length){ box.innerHTML = '<div class="sugestao-item gray">⚠️ Não temos interessados minerados dessa cidade ainda</div>'; box.style.display = 'block'; return; }
    box.innerHTML = visiveis.map(function(c){ return '<div class="sugestao-item" data-cidade="'+escHtml(c)+'">'+escHtml(c)+'</div>'; }).join('');
    box.style.display = 'block';
  }

  document.getElementById('cidadeInput').addEventListener('input', renderSugestoesCidade);
  document.getElementById('cidadeInput').addEventListener('focus', renderSugestoesCidade);
  document.getElementById('cidadeInput').addEventListener('click', renderSugestoesCidade);

  document.getElementById('cidade-sugestoes').addEventListener('click', async function(e){
    const item = e.target.closest('[data-cidade]');
    if(!item) return;
    const cidade = item.getAttribute('data-cidade');
    document.getElementById('cidadeInput').value = '';
    esconderSugestoesCidade();
    if(_cidadesSelecionadas.indexOf(cidade) > -1) return;
    _cidadesSelecionadas.push(cidade);
    renderCidadesChips();
    await carregarBairrosDaCidade(cidade);
  });

  document.addEventListener('click', function(e){
    if(!e.target.closest('#cidadeInput') && !e.target.closest('#cidade-sugestoes')) esconderSugestoesCidade();
  });

  function renderCidadesChips(){
    const box = document.getElementById('cidades-chips');
    box.innerHTML = _cidadesSelecionadas.map(function(c){
      return '<span class="chip">'+escHtml(c)+'<button type="button" data-remover-cidade="'+escHtml(c)+'">×</button></span>';
    }).join('');
    const temCidade = _cidadesSelecionadas.length > 0;
    document.getElementById('cidadeInput').classList.toggle('ok', temCidade);
    document.getElementById('cidade-check').style.display = temCidade ? 'inline' : 'none';
  }

  document.getElementById('cidades-chips').addEventListener('click', function(e){
    const btn = e.target.closest('[data-remover-cidade]');
    if(!btn) return;
    const cidade = btn.getAttribute('data-remover-cidade');
    _cidadesSelecionadas = _cidadesSelecionadas.filter(function(c){ return c !== cidade; });
    _paresMarcados = _paresMarcados.filter(function(p){ return p.cidade !== cidade; });
    renderCidadesChips();
    reconstruirParesDisponiveis();
    esconderSugestoesBairro();
    renderBairrosChips();
    _agendarBusca();
    if(!_cidadesSelecionadas.length){
      document.getElementById('filtroBairro').disabled = true;
      document.getElementById('filtroBairro').value = '';
    }
  });

  async function carregarBairrosDaCidade(cidade){
    const estado = document.getElementById('estado').value;
    if(!_bairrosPorCidade[cidade]){
      document.getElementById('filtroBairro').placeholder = 'Carregando bairros de '+cidade+'...';
      const r = await fetch('${apiPrefix}/bairros?estado='+encodeURIComponent(estado)+'&cidade='+encodeURIComponent(cidade));
      const d = await r.json();
      _bairrosPorCidade[cidade] = d.bairros || [];
    }
    reconstruirParesDisponiveis();
    document.getElementById('filtroBairro').disabled = false;
    document.getElementById('filtroBairro').placeholder = 'Digite pra buscar o bairro...';
  }

  function reconstruirParesDisponiveis(){
    _paresDisponiveis = [];
    _cidadesSelecionadas.forEach(function(cid){
      (_bairrosPorCidade[cid] || []).forEach(function(b){ _paresDisponiveis.push({ cidade: cid, bairro: b }); });
    });
  }

  function esconderSugestoesBairro(){
    document.getElementById('bairro-sugestoes').style.display = 'none';
  }

  // Mesmo padrão da cidade: sem termo digitado já mostra as opções
  // disponíveis (as já marcadas somem da lista), só filtra de verdade
  // quando o usuário começa a digitar.
  function renderSugestoesBairro(){
    const box = document.getElementById('bairro-sugestoes');
    if(!_paresDisponiveis.length){ box.style.display = 'none'; return; }
    const termo = _normTexto(document.getElementById('filtroBairro').value.trim());
    const marcadasChaves = _paresMarcados.map(_parChave);
    const disponiveis = _paresDisponiveis.filter(function(p){ return marcadasChaves.indexOf(_parChave(p)) === -1; });
    const visiveis = (termo ? disponiveis.filter(function(p){ return _normTexto(p.bairro).includes(termo); }) : disponiveis).slice(0, 30);
    if(!visiveis.length){ box.innerHTML = '<div class="sugestao-item gray">⚠️ Não temos interessados minerados desse bairro ainda</div>'; box.style.display = 'block'; return; }
    const multiplasCidades = _cidadesSelecionadas.length > 1;
    box.innerHTML = visiveis.map(function(p){
      const label = multiplasCidades ? (p.bairro + ' (' + p.cidade + ')') : p.bairro;
      return '<div class="sugestao-item" data-chave="'+escHtml(_parChave(p))+'" data-cidade="'+escHtml(p.cidade)+'" data-bairro="'+escHtml(p.bairro)+'">'+escHtml(label)+'</div>';
    }).join('');
    box.style.display = 'block';
  }

  document.getElementById('filtroBairro').addEventListener('input', renderSugestoesBairro);
  document.getElementById('filtroBairro').addEventListener('focus', renderSugestoesBairro);
  document.getElementById('filtroBairro').addEventListener('click', renderSugestoesBairro);

  document.getElementById('bairro-sugestoes').addEventListener('click', function(e){
    const item = e.target.closest('[data-chave]');
    if(!item) return;
    const par = { cidade: item.getAttribute('data-cidade'), bairro: item.getAttribute('data-bairro') };
    const chave = _parChave(par);
    if(_paresMarcados.findIndex(function(p){ return _parChave(p) === chave; }) === -1){
      _paresMarcados.push(par);
    }
    document.getElementById('filtroBairro').value = '';
    esconderSugestoesBairro();
    renderBairrosChips();
    _agendarBusca();
  });

  document.addEventListener('click', function(e){
    if(!e.target.closest('#filtroBairro') && !e.target.closest('#bairro-sugestoes')) esconderSugestoesBairro();
  });

  function renderBairrosChips(){
    const box = document.getElementById('bairros-chips');
    const multiplasCidades = _cidadesSelecionadas.length > 1;
    box.innerHTML = _paresMarcados.map(function(p){
      const label = multiplasCidades ? (p.bairro + ' (' + p.cidade + ')') : p.bairro;
      return '<span class="chip">'+escHtml(label)+'<button type="button" data-remover-bairro="'+escHtml(_parChave(p))+'">×</button></span>';
    }).join('');
    const temBairro = _paresMarcados.length > 0;
    document.getElementById('filtroBairro').classList.toggle('ok', temBairro);
    document.getElementById('bairro-check').style.display = temBairro ? 'inline' : 'none';
  }

  document.getElementById('bairros-chips').addEventListener('click', function(e){
    const btn = e.target.closest('[data-remover-bairro]');
    if(!btn) return;
    const chave = btn.getAttribute('data-remover-bairro');
    _paresMarcados = _paresMarcados.filter(function(p){ return _parChave(p) !== chave; });
    renderBairrosChips();
    _agendarBusca();
  });

  // Só dispara a busca quando o usuário clica em "Buscar" (botão fica
  // desabilitado até ter estado + pelo menos 1 bairro marcado) — dá tempo
  // real de marcar vários bairros antes da planilha ser gerada.
  function _agendarBusca(){
    const habilitado = !!(document.getElementById('estado').value && _paresMarcados.length);
    const btn = document.getElementById('btnBuscarDemanda');
    if(btn) btn.disabled = !habilitado;
    if(!habilitado){
      document.getElementById('resultado-box').style.display = 'none';
      document.getElementById('combos-box').style.display = 'none';
      document.getElementById('busca-status').innerHTML = '';
      return;
    }
    document.getElementById('busca-status').innerHTML = '<p class="gray">✓ '+_paresMarcados.length+' bairro'+(_paresMarcados.length>1?'s':'')+' marcado'+(_paresMarcados.length>1?'s':'')+' — pode escolher mais ou clicar em Buscar.</p>';
  }

  function _resetZoomMobile(){
    // Safari iOS às vezes mantém um zoom residual de quando o usuário focou
    // um <select>/<input> (o navegador dá zoom automático se font-size < 16px).
    // Forçar maximum-scale=1 por um instante zera esse zoom antes do modal abrir.
    const vp = document.querySelector('meta[name="viewport"]');
    if(!vp) return;
    const original = vp.getAttribute('content');
    vp.setAttribute('content', original + ', maximum-scale=1');
    setTimeout(function(){ vp.setAttribute('content', original); }, 300);
  }
  function abrirModalPensando(){
    _resetZoomMobile();
    document.getElementById('pensando-modal-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  function fecharModalPensando(){
    document.getElementById('pensando-modal-overlay').style.display = 'none';
    document.body.style.overflow = '';
  }

  function _montarCardAtividade(a){
    const valorTxt = a.Valor ? 'R$ '+Number(a.Valor).toLocaleString('pt-BR') : '';
    const fotoHtml = a.Foto ? '<img class="pensando-card-foto" src="'+escHtml(a.Foto)+'" loading="lazy" onerror="this.remove()">' : '';
    const contatoPartes = [];
    if(a.Telefone) contatoPartes.push('📱 '+escHtml(a.Telefone));
    if(a.Email) contatoPartes.push('✉️ '+escHtml(a.Email));
    const contatoHtml = contatoPartes.length ? '<div class="pensando-card-contato">'+contatoPartes.join(' · ')+'</div>' : '';
    const diasHtml = a.ProcurandoTexto ? '<div class="pensando-card-dias">⏱️ '+escHtml(a.ProcurandoTexto)+'</div>' : '';
    return fotoHtml
      + '<div class="pensando-card-topo"><span>👤 Lead: '+escHtml(a.Nome)+'</span>'+(valorTxt ? '<span class="pensando-card-valor">'+valorTxt+'</span>' : '')+'</div>'
      + contatoHtml
      + '<div class="pensando-card-tags">'+(a.Tipo ? '<span>🏠 '+escHtml(a.Tipo)+'</span>' : '')+'<span>'+(a.Transacao === 'aluguel' ? '🔑 Aluguel' : '🛒 Venda')+'</span>'+(a.Quartos ? '<span>🛏️ '+escHtml(a.Quartos)+' qts</span>' : '')+'</div>'
      + '<div class="pensando-card-loc">📍 '+escHtml(a.Bairro)+(a.Cidade ? ', '+escHtml(a.Cidade) : '')+'</div>'
      + diasHtml;
  }

  // Cards com atividade REAL da plataforma — leads que já receberam vitrine
  // + o imóvel de verdade (com foto de verdade) que foi enviado a elas, um
  // a um. Não é o resultado da busca (essa é só interessados_portal) — é só
  // pra mostrar que tem gente de verdade usando o sistema enquanto a IA
  // cruza os dados. Sem pressa: ~10s no total.
  async function _animarCardsPensando(atividade, duracaoMs){
    const cardEl = document.getElementById('pensando-card');
    const subEl = document.getElementById('pensando-sub');
    if(!atividade.length){
      cardEl.classList.remove('mostrar');
      subEl.textContent = '';
      await new Promise(function(res){ setTimeout(res, duracaoMs); });
      return;
    }
    subEl.textContent = 'Atividade real na plataforma agora';
    const porCard = 1900;
    const voltas = Math.max(1, Math.round(duracaoMs / porCard));
    for(let i=0;i<voltas;i++){
      const a = atividade[i % atividade.length];
      cardEl.classList.remove('mostrar');
      await new Promise(function(res){ setTimeout(res, 180); });
      cardEl.innerHTML = _montarCardAtividade(a);
      cardEl.classList.add('mostrar');
      await new Promise(function(res){ setTimeout(res, porCard - 180); });
    }
  }

  async function buscarDemanda(){
    const estado = document.getElementById('estado').value;
    const pares = _paresMarcados;
    if(!estado || !pares.length) return;
    const transacoes = [];
    if(document.getElementById('chkVenda').checked) transacoes.push('venda');
    if(document.getElementById('chkAluguel').checked) transacoes.push('aluguel');
    const diasSel = document.getElementById('diasBusca');
    const dias = diasSel ? Math.min(30, Math.max(1, parseInt(diasSel.value, 10) || 30)) : 30;
    document.getElementById('resultado-box').style.display = 'none';
    document.getElementById('combos-box').style.display = 'none';
    document.getElementById('btnCustoLeads').style.display = 'none';
    clearTimeout(_custoLeadsTimer);
    fecharModalCompra();
    _comboEscolhido = null;
    try {
      // Não estoura o resultado na hora — abre um modal mostrando atividade
      // real da plataforma (leads que já receberam vitrine + foto real do
      // imóvel), um a um, enquanto a busca roda por trás. Sem pressa: ~10s
      // no total, mesmo que a busca em si volte antes.
      document.getElementById('busca-status').innerHTML = '';
      abrirModalPensando();
      const etapas = [
        '🤖 Entendendo o perfil buscado ('+pares.length+' bairro'+(pares.length>1?'s':'')+' em '+_cidadesSelecionadas.length+' cidade'+(_cidadesSelecionadas.length>1?'s':'')+')...',
        '📥 Cruzando com a base de interessados MatchImóveis...',
        '🧠 Calculando compatibilidade...'
      ];
      let etapaAtual = 0;
      const trocaEtapa = setInterval(function(){
        etapaAtual = (etapaAtual + 1) % etapas.length;
        document.getElementById('pensando-texto').textContent = etapas[etapaAtual];
      }, 3300);
      document.getElementById('pensando-texto').textContent = etapas[0];
      const fetchLeadsPromise = fetch('${apiPrefix}/buscar', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ estado, pares, transacoes, dias }) }).then(function(r){ return r.json(); });
      const atividadeResp = await fetch('${apiPrefix}/atividade', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ estado, pares }) }).then(function(r){ return r.json(); }).catch(function(){ return { ok:false, atividade:[] }; });
      await _animarCardsPensando(atividadeResp.ok ? atividadeResp.atividade : [], 10000);
      clearInterval(trocaEtapa);
      const d = await fetchLeadsPromise;
      fecharModalPensando();
      if(!d.ok){ document.getElementById('busca-status').innerHTML = '<p class="red">Erro: '+escHtml(d.erro)+'</p>'; return; }
      document.getElementById('busca-status').innerHTML = '';
      document.getElementById('banner-resultado').innerHTML = d.total > 0
        ? '🤖 <strong>A IA encontrou '+d.total+' interessado'+(d.total>1?'s':'')+'</strong> nessa região.'
        : '🤖 A IA não encontrou interessados com esse perfil ainda. Tenta outro bairro.';
      document.getElementById('tabela-body').innerHTML = d.leads.map(function(l){
        const dataTxt = l.criadoEm ? new Date(l.criadoEm).toLocaleDateString('pt-BR') : '<span class="gray">—</span>';
        return '<tr><td>'+escHtml(l.Nome)+'</td><td>'+escHtml(l.Telefone)+'</td><td>'+escHtml(l.Email)+'</td><td>MatchImóveis</td><td>'+escHtml(l.Tipo)+'</td><td>'+escHtml(l.Transacao)+'</td><td>'+escHtml(l.Bairro)+'</td><td>'+escHtml(l.Cidade)+'</td><td>'+escHtml(l.Estado)+'</td><td>'+(l.Area_max?escHtml(l.Area_max):'<span class="gray">—</span>')+'</td><td>'+(l.Valor_max?escHtml(l.Valor_max):'<span class="gray">—</span>')+'</td><td>'+dataTxt+'</td></tr>';
      }).join('');
      document.getElementById('resultado-box').style.display = 'block';
      document.getElementById('resultado-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
      _ultimaBusca = { estado, pares, transacoes, dias: d.dias, total: d.total };
      // Monta os combos (já com o compatível marcado como recomendado) em
      // segundo plano. 15s depois de ver a planilha, avancarParaPlanos()
      // decide o próximo passo: sem conta ainda, abre o cadastro primeiro
      // (captura o corretor mesmo que ele não compre depois); com conta já
      // criada, vai direto pro combo recomendado. O botão "Quanto me custa
      // essas leads?" dispara o mesmo fluxo antes dos 15s, se clicado.
      renderCombos(d.total);
      document.getElementById('combos-box').style.display = 'none';
      if(d.total > 0 && !IS_ADMIN){
        _custoLeadsTimer = setTimeout(function(){
          document.getElementById('btnCustoLeads').style.display = 'inline-block';
          avancarParaPlanos();
        }, 15000);
      }
      iniciarAutoScrollTabela();
    } catch(e){ fecharModalPensando(); document.getElementById('busca-status').innerHTML = '<p class="red">Erro ao buscar.</p>'; }
  }

  // Arrasta a planilha sozinha, devagar, ida e volta — pro usuário ver as
  // colunas sem precisar arrastar manualmente. No primeiro toque/clique/
  // scroll do próprio usuário, para de vez e a partir daí é 100% manual
  // (não retoma sozinho).
  let _tabelaAutoScrollTimer = null;
  let _tabelaAutoScrollDir = 1;
  let _tabelaAutoScrollAtivo = false;
  function iniciarAutoScrollTabela(){
    const el = document.getElementById('tabela-scroll');
    if(!el) return;
    pararAutoScrollTabela();
    _tabelaAutoScrollAtivo = true;
    _tabelaAutoScrollDir = 1;
    el.scrollLeft = 0;
    _tabelaAutoScrollTimer = setInterval(function(){
      if(!_tabelaAutoScrollAtivo) return;
      const max = el.scrollWidth - el.clientWidth;
      if(max <= 0){ pararAutoScrollTabela(); return; }
      el.scrollLeft += _tabelaAutoScrollDir * 2.5;
      if(el.scrollLeft >= max) _tabelaAutoScrollDir = -1;
      else if(el.scrollLeft <= 0) _tabelaAutoScrollDir = 1;
    }, 30);
  }
  function pararAutoScrollTabela(){
    _tabelaAutoScrollAtivo = false;
    if(_tabelaAutoScrollTimer){ clearInterval(_tabelaAutoScrollTimer); _tabelaAutoScrollTimer = null; }
  }
  (function(){
    const el = document.getElementById('tabela-scroll');
    if(!el) return;
    ['pointerdown','wheel','touchstart'].forEach(function(ev){
      el.addEventListener(ev, pararAutoScrollTabela, { passive: true });
    });
  })();

  // ── Combos + criação de conta + pagamento ──────────────────────────────
  // Admin já tem conta e não compra nada aqui — usa direto o "Transferir pra
  // essa conta" (transferir-box, mais abaixo). O fluxo de cadastro/CPF/
  // Mercado Pago é só pro visitante público de /demanda, então fica
  // desligado por completo quando IS_ADMIN pra não interromper o admin com
  // um popup de "criar conta" irrelevante.
  const IS_ADMIN = ${isAdmin ? 'true' : 'false'};
  const PLANOS = ${JSON.stringify(PLANOS_LEADS)};
  // Combos fechados em ordem crescente de quantidade — o ilimitado fica de
  // fora dessa lista porque não compete por "cabe no total", ele é o
  // fallback quando NENHUM combo fechado cobre a quantidade encontrada.
  const PLANOS_ORDEM = ['r200','100','200','300'];
  const PLANO_ILIMITADO = 'ilimitado';
  let _ultimaBusca = null;
  let _comboEscolhido = null;
  let _custoLeadsTimer = null;
  let _contaCriada = false;

  function mostrarComboRecomendado(){
    document.getElementById('combos-box').style.display = 'block';
    const rec = document.querySelector('.combo.combo-recomendado');
    const alvo = rec || document.getElementById('combos-box');
    alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Ponto único que decide o próximo passo depois da planilha: sem conta
  // ainda, pede o cadastro primeiro (só depois disso mostra os planos);
  // com conta já criada, vai direto pros planos. Chamado tanto pelo timer
  // de 15s quanto pelo botão "Quanto me custa essas leads?".
  function avancarParaPlanos(){
    if(IS_ADMIN) return;
    if(!_contaCriada){ abrirModalCadastroInicial(); return; }
    mostrarComboRecomendado();
  }

  function renderCombos(total){
    const box = document.getElementById('combos-box');
    if(total <= 0){ box.style.display = 'none'; fecharModalCompra(); return; }
    // Combo recomendado: o menor combo fechado cuja quantidade cobre o total
    // encontrado (ex: até 50 → combo de 50; de 51 a 100 → combo de 100...).
    // Passou do maior combo fechado (300)? Só o ilimitado cobre.
    let recomendado = PLANOS_ORDEM.find(function(k){ return PLANOS[k].qtd >= total; });
    if(!recomendado) recomendado = PLANO_ILIMITADO;
    const ordemExibida = PLANOS_ORDEM.concat([PLANO_ILIMITADO]);
    const FEATURES_COMBO = ['Gera vitrine automática', 'Post Instagram automático', 'Site próprio', 'Imóveis ilimitado', 'Conexão com WhatsApp', 'Suba seus imóveis (XML ou manual) e comece a gerar leads pra eles também'];
    const featuresHtml = '<ul class="combo-features">' + FEATURES_COMBO.map(function(f){ return '<li>'+escHtml(f)+'</li>'; }).join('') + '</ul>';
    const promoHtml = '<div class="promo-desconto">🎉 Você acabou de ganhar 50% OFF na primeira conta!<span>Não perca essa oportunidade — preço válido só agora, na sua primeira compra.</span></div>';
    document.getElementById('combos-lista').innerHTML = ordemExibida.map(function(k){
      const p = PLANOS[k];
      const rec = k === recomendado;
      const qtdTxt = p.ilimitado ? '∞' : p.qtd;
      const unidade = p.ilimitado ? ' /mês' : ' /combo';
      const valorDesconto = _valorComDesconto(p.valor);
      const porLead = p.ilimitado ? '' : '<div class="por-lead">R$ '+(valorDesconto/p.qtd).toFixed(2).replace('.',',')+' por lead</div>';
      const entramNaConta = p.ilimitado ? total : Math.min(total, p.qtd);
      const restante = p.ilimitado ? 0 : Math.max(0, total - p.qtd);
      const entramHtml = '<div class="entram-conta">📥 Entram agora na sua conta: <strong>'+entramNaConta+' lead'+(entramNaConta===1?'':'s')+'</strong></div>'
        + (restante > 0 ? '<div class="restante-nota">Sua busca encontrou mais '+restante+' lead'+(restante===1?'':'s')+' além desse combo. Selecione um combo maior pra levar todas agora, ou deixe a plataforma te entregar o restante diariamente enquanto você tiver créditos.</div>' : '');
      return '<div class="combo'+(rec?' combo-recomendado':'')+'" data-plano="'+k+'">'
        + (rec ? '<span class="badge">✅ Plano compatível</span>' : '')
        + '<div class="qtd">'+qtdTxt+'</div><div class="label">'+escHtml(p.label)+'</div>'
        + '<div class="preco"><span class="preco-original">R$ '+p.valor+'</span>R$ '+valorDesconto+'<span>'+unidade+'</span></div>'
        + porLead
        + entramHtml
        + featuresHtml
        + '<button type="button" data-escolher="'+k+'">Quero esse →</button>'
        + '</div>';
    }).join('');
    document.getElementById('promo-desconto-combo').innerHTML = promoHtml;
    box.style.display = 'block';
  }
  function _valorComDesconto(valorOriginal){ return Math.round(valorOriginal * 0.5); }

  document.getElementById('combos-lista').addEventListener('click', function(e){
    const btn = e.target.closest('[data-escolher]');
    if(!btn) return;
    const plano = btn.getAttribute('data-escolher');
    _comboEscolhido = plano;
    const p = PLANOS[plano];
    const totalEncontrado = (_ultimaBusca && _ultimaBusca.total) || 0;
    const avisoQtd = (!p.ilimitado && totalEncontrado > p.qtd)
      ? 'Sua busca encontrou '+totalEncontrado+' leads, mas esse combo entrega '+p.qtd+' — as demais ficam disponíveis pra comprar depois. '
        + 'Se preferir, <a href="#" onclick="fecharModalCompra();document.getElementById(\\'diasBusca\\').scrollIntoView({behavior:\\'smooth\\',block:\\'center\\'});return false;">diminua os dias da busca</a> pra encontrar menos leads e enquadrar nesse combo.'
      : 'Os leads encontrados na sua busca vão pra sua conta assim que o pagamento for aprovado.';
    document.getElementById('combo-escolhido-resumo').innerHTML = '<strong>'+escHtml(p.label)+'</strong> — <span style="text-decoration:line-through;color:var(--sec)">R$ '+p.valor+'</span> R$ '+_valorComDesconto(p.valor)+' <span class="gray">(50% OFF primeira conta)</span><br><span class="gray">'+avisoQtd+'</span>';
    document.getElementById('combo-escolhido-resumo').style.display = 'block';
    document.getElementById('signup-subtitulo').style.display = 'none';
    document.getElementById('signup-rodape-pagamento').style.display = 'block';
    document.getElementById('signup-rodape-cadastro').style.display = 'none';
    document.getElementById('campo-cpf').style.display = 'block';
    document.getElementById('btnComprar').textContent = 'Ir para pagamento →';
    document.getElementById('btnComprar').onclick = finalizarCompra;
    // Conta já criada (fluxo novo, logo depois da planilha aparecer)? Não
    // precisa pedir nome/email/celular/senha de novo — só o CPF, que é
    // pedido agora (na hora de pagar), não lá no cadastro inicial.
    if(_contaCriada){
      document.getElementById('campos-cadastro').style.display = 'none';
      document.getElementById('signup-titulo').textContent = 'Confirme seu CPF pra continuar';
    } else {
      // Fallback (conta ainda não criada — ex: usuário fechou o modal de
      // cadastro inicial): formulário completo, cadastro + pagamento juntos.
      document.getElementById('campos-cadastro').style.display = 'block';
      document.getElementById('signup-titulo').textContent = 'Criar conta e finalizar';
    }
    abrirModalCompra();
  });

  // No admin, o formulário de cadastro do usuário nem é renderizado (não faz
  // sentido: quem tá logado como admin já tem conta — usa "Transferir pra
  // essa conta" em vez disso). abrirModalCompra/fecharModalCompra viram
  // no-op nesse caso (getElementById retorna null pro elemento removido do
  // HTML) — sem esse guard, fecharModalCompra() quebraria toda busca no
  // admin, porque ela é chamada incondicionalmente no início de cada busca.
  function abrirModalCompra(){
    const overlay = document.getElementById('signup-modal-overlay');
    if(!overlay) return;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  function fecharModalCompra(){
    const overlay = document.getElementById('signup-modal-overlay');
    if(!overlay) return;
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }
  if(document.getElementById('signup-modal-overlay')){
    document.getElementById('signup-modal-overlay').addEventListener('click', function(e){
      if(e.target.id === 'signup-modal-overlay') fecharModalCompra();
    });
  }
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') fecharModalCompra();
  });

  // Assim que a planilha aparece (e a conta ainda não existe), pede os dados
  // de cadastro — cria a conta na hora (sem pagamento) pra já capturar o
  // corretor mesmo que ele não conclua a compra de um combo depois. A região
  // buscada (estado/cidades/bairros) fica salva no perfil dele.
  function abrirModalCadastroInicial(){
    if(_contaCriada) return;
    document.getElementById('combo-escolhido-resumo').style.display = 'none';
    document.getElementById('signup-subtitulo').style.display = 'block';
    document.getElementById('signup-titulo').textContent = 'Guarde sua busca — crie sua conta';
    document.getElementById('campos-cadastro').style.display = 'block';
    document.getElementById('campo-cpf').style.display = 'none';
    document.getElementById('signup-rodape-pagamento').style.display = 'none';
    document.getElementById('signup-rodape-cadastro').style.display = 'block';
    document.getElementById('btnComprar').textContent = 'Criar minha conta →';
    document.getElementById('btnComprar').onclick = finalizarCadastroInicial;
    abrirModalCompra();
  }

  async function finalizarCadastroInicial(){
    if(!_ultimaBusca){ return; }
    const nome = document.getElementById('suNome').value.trim();
    const email = document.getElementById('suEmail').value.trim();
    const celular = document.getElementById('suCelular').value.trim();
    const senha = document.getElementById('suSenha').value;
    const statusEl = document.getElementById('signup-status');
    statusEl.innerHTML = '';
    const btn = document.getElementById('btnComprar');
    btn.disabled = true;
    try {
      const r = await fetch('/demanda/cadastrar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, celular, senha, criterios: _ultimaBusca })
      });
      const d = await r.json();
      if(!d.ok){ statusEl.innerHTML = '<p class="red">'+escHtml(d.erro)+'</p>'; return; }
      _contaCriada = true;
      statusEl.innerHTML = '<p class="green">✅ Conta criada! Agora é só escolher seu combo.</p>';
      setTimeout(function(){ fecharModalCompra(); mostrarComboRecomendado(); }, 1200);
    } catch(e){ statusEl.innerHTML = '<p class="red">Erro ao criar conta.</p>'; }
    finally { btn.disabled = false; }
  }

  async function finalizarCompra(){
    if(!_comboEscolhido || !_ultimaBusca){ alert('Escolha um combo primeiro.'); return; }
    const nome = document.getElementById('suNome').value.trim();
    const email = document.getElementById('suEmail').value.trim();
    const celular = document.getElementById('suCelular').value.trim();
    const cpf = document.getElementById('suCpf').value.trim();
    const senha = document.getElementById('suSenha').value;
    const statusEl = document.getElementById('signup-status');
    statusEl.innerHTML = '';
    const btn = document.getElementById('btnComprar');
    btn.disabled = true;
    try {
      const r = await fetch('/demanda/comprar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, celular, cpf, senha, plano: _comboEscolhido, criterios: _ultimaBusca })
      });
      const d = await r.json();
      if(!d.ok){ btn.disabled = false; statusEl.innerHTML = '<p class="red">'+escHtml(d.erro)+'</p>'; return; }
      statusEl.innerHTML = '<p class="green">Conta criada! Levando pro pagamento...</p>';
      window.location.href = d.url;
    } catch(e){ btn.disabled = false; statusEl.innerHTML = '<p class="red">Erro ao criar conta/pagamento.</p>'; }
  }

  // ── Grade de atividade real (mesma fonte de dados do modal "pensando"
  // acima: leads que já receberam vitrine + foto real do imóvel enviado) —
  // fica sempre visível logo abaixo da barra de prova (🔥 disponíveis
  // agora), não só durante uma busca. 4 cards no desktop, 1 no mobile;
  // cada card gira sozinho no próprio lugar, um de cada vez.
  (function(){
    const NUM_CARDS = window.innerWidth <= 600 ? 2 : 4;
    const wrapAt = document.getElementById('atividade-wrap');
    const gridAt = document.getElementById('atividade-grid');
    if(!wrapAt || !gridAt) return;
    const elsAt = [];
    for(let i=0;i<NUM_CARDS;i++){
      const el = document.createElement('div');
      el.className = 'atividade-card';
      gridAt.appendChild(el);
      elsAt.push(el);
    }

    let atividadeAt = [];
    let indicesAt = [];

    function _montarCardAtividadeGrid(a){
      const valorTxt = a.Valor ? 'R$ '+Number(a.Valor).toLocaleString('pt-BR') : '';
      const fotoHtml = a.Foto ? '<img class="atividade-card-foto" src="'+escHtml(a.Foto)+'" loading="lazy" onerror="this.remove()">' : '';
      const contatoPartes = [];
      if(a.Telefone) contatoPartes.push('📱 '+escHtml(a.Telefone));
      if(a.Email) contatoPartes.push('✉️ '+escHtml(a.Email));
      const contatoHtml = contatoPartes.length ? '<div class="atividade-card-contato">'+contatoPartes.join(' · ')+'</div>' : '';
      const diasHtml = a.ProcurandoTexto ? '<div class="atividade-card-dias">⏱️ '+escHtml(a.ProcurandoTexto)+'</div>' : '';
      return fotoHtml
        + '<div class="atividade-card-corpo">'
        + '<div class="atividade-card-topo"><span>👤 '+escHtml(a.Nome)+'</span>'+(valorTxt ? '<span class="atividade-card-valor">'+valorTxt+'</span>' : '')+'</div>'
        + contatoHtml
        + '<div class="atividade-card-tags">'+(a.Tipo ? '<span>🏠 '+escHtml(a.Tipo)+'</span>' : '')+'<span>'+(a.Transacao === 'aluguel' ? '🔑 Aluguel' : '🛒 Venda')+'</span>'+(a.Quartos ? '<span>🛏️ '+escHtml(a.Quartos)+' qts</span>' : '')+'</div>'
        + '<div class="atividade-card-loc">📍 '+escHtml(a.Bairro)+(a.Cidade ? ', '+escHtml(a.Cidade) : '')+'</div>'
        + diasHtml
        + '</div>';
    }

    function sortearIndicesAt(){
      const pool = atividadeAt.map((_, i) => i);
      for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
      return elsAt.map((_, i) => pool[i % pool.length]);
    }

    function renderCardAt(i){
      elsAt[i].innerHTML = _montarCardAtividadeGrid(atividadeAt[indicesAt[i]]);
      elsAt[i].classList.add('mostrar');
    }

    function renderTudoAt(){
      elsAt.forEach((el, i) => {
        el.classList.remove('mostrar');
        setTimeout(() => renderCardAt(i), 150);
      });
    }

    function proximoIndiceAt(cardIdx){
      const usadosPorOutros = indicesAt.filter((_, i) => i !== cardIdx);
      const livres = atividadeAt.map((_, i) => i).filter(i => !usadosPorOutros.includes(i) && i !== indicesAt[cardIdx]);
      if(livres.length) return livres[Math.floor(Math.random()*livres.length)];
      const alternativas = atividadeAt.map((_, i) => i).filter(i => i !== indicesAt[cardIdx]);
      return alternativas.length ? alternativas[Math.floor(Math.random()*alternativas.length)] : indicesAt[cardIdx];
    }

    function iniciarCicloCardAt(i){
      setInterval(() => {
        if(!atividadeAt.length) return;
        elsAt[i].classList.remove('mostrar');
        setTimeout(() => {
          indicesAt[i] = proximoIndiceAt(i);
          renderCardAt(i);
        }, 300);
      }, 4500);
    }

    async function carregarAtividadeAt(){
      try {
        const r = await fetch('${apiPrefix}/atividade', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({}) });
        const d = await r.json();
        const nova = (d && d.ok && d.atividade) ? d.atividade : [];
        if(!nova.length){ wrapAt.style.display = 'none'; return; }
        atividadeAt = nova;
        indicesAt = sortearIndicesAt();
        wrapAt.style.display = 'block';
        renderTudoAt();
      } catch(e) {}
    }

    carregarAtividadeAt().then(() => {
      elsAt.forEach((_, i) => setTimeout(() => iniciarCicloCardAt(i), i * 1100));
    });
    setInterval(carregarAtividadeAt, 45000);
  })();

  ${isAdmin ? `
  // ── Transferência manual de leads pra conta escolhida (só admin) ────────
  let _contaDestinoEscolhida = null;
  let _contaBuscaDebounceId = null;
  const contaDestinoInput = document.getElementById('contaDestinoInput');
  contaDestinoInput.addEventListener('input', function(){
    _contaDestinoEscolhida = null;
    document.getElementById('btnTransferirDemanda').disabled = true;
    document.getElementById('conta-escolhida-txt').textContent = '';
    if(_contaBuscaDebounceId) clearTimeout(_contaBuscaDebounceId);
    const q = this.value.trim();
    if(q.length < 2){ document.getElementById('conta-sugestoes').style.display = 'none'; return; }
    _contaBuscaDebounceId = setTimeout(async function(){
      const r = await fetch('/admin/demanda/buscar-conta?q=' + encodeURIComponent(q));
      const d = await r.json();
      const box = document.getElementById('conta-sugestoes');
      if(!d.ok || !d.contas.length){ box.style.display = 'none'; return; }
      box.innerHTML = d.contas.map(function(c){
        return '<div class="sugestao-item" data-codigo="'+escHtml(c.codigo_usuario)+'" data-nome="'+escHtml(c.nome||'')+'">'+escHtml(c.nome||'Sem nome')+' <span class="gray">('+escHtml(c.codigo_usuario)+')</span></div>';
      }).join('');
      box.style.display = 'block';
    }, 300);
  });
  document.getElementById('conta-sugestoes').addEventListener('click', function(e){
    const item = e.target.closest('[data-codigo]');
    if(!item) return;
    _contaDestinoEscolhida = item.getAttribute('data-codigo');
    contaDestinoInput.value = item.getAttribute('data-nome') + ' (' + _contaDestinoEscolhida + ')';
    document.getElementById('conta-sugestoes').style.display = 'none';
    document.getElementById('conta-escolhida-txt').innerHTML = '<span class="green">✓ conta selecionada</span>';
    document.getElementById('btnTransferirDemanda').disabled = false;
  });
  document.addEventListener('click', function(e){
    if(!e.target.closest('#contaDestinoInput') && !e.target.closest('#conta-sugestoes')) document.getElementById('conta-sugestoes').style.display = 'none';
  });

  async function transferirParaConta(){
    if(!_contaDestinoEscolhida || !_ultimaBusca) return;
    if(!confirm('Transferir os leads encontrados pra essa conta e debitar os créditos equivalentes?')) return;
    const btn = document.getElementById('btnTransferirDemanda');
    const statusEl = document.getElementById('transferir-status');
    btn.disabled = true;
    statusEl.innerHTML = '<span class="gray">Transferindo...</span>';
    try {
      const r = await fetch('/admin/demanda/transferir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: _ultimaBusca.estado, pares: _ultimaBusca.pares, transacoes: _ultimaBusca.transacoes, dias: _ultimaBusca.dias, contaDestino: _contaDestinoEscolhida })
      });
      const d = await r.json();
      btn.disabled = false;
      if(!d.ok){ statusEl.innerHTML = '<p class="red">Erro: '+escHtml(d.erro)+'</p>'; return; }
      statusEl.innerHTML = '<p class="green">✓ '+d.importados+' lead'+(d.importados===1?'':'s')+' importada'+(d.importados===1?'':'s')+' pra '+escHtml(d.contaNome)+(d.duplicados ? ' ('+d.duplicados+' já existia'+(d.duplicados===1?'':'m')+' na conta, pulada'+(d.duplicados===1?'':'s')+')' : '')+' — '+d.creditosDebitados.toLocaleString('pt-BR')+' créditos debitados.</p>';
    } catch(e){ btn.disabled = false; statusEl.innerHTML = '<p class="red">Erro ao transferir.</p>'; }
  }
  ` : ''}
  </script>
  ${bodyClose}</body></html>`;
}

app.get('/admin/demanda', authAdmin, async (req, res) => {
  res.send(await _paginaBuscaDemanda({ apiPrefix: '/admin/demanda', isAdmin: true }));
});
// Versão pública — sem login, pra mandar o link pra fora. Telefone/email
// já vêm mascarados de buscarDemanda() independente de quem chama, então
// não tem PII de verdade exposta aqui.
app.get('/demanda', async (req, res) => {
  res.send(await _paginaBuscaDemanda({ apiPrefix: '/demanda', isAdmin: false }));
});

async function _handlerDemandaCidades(req, res) {
  try {
    const { listarCidadesComLead } = require('./services/buscaDemanda');
    const cidades = await listarCidadesComLead(req.query.estado || '');
    res.json({ ok: true, cidades });
  } catch(e) { res.json({ ok: false, erro: e.message, cidades: [] }); }
}
app.get('/admin/demanda/cidades', authAdmin, _handlerDemandaCidades);
app.get('/demanda/cidades', _handlerDemandaCidades);

async function _handlerDemandaBairros(req, res) {
  try {
    const { listarBairrosComLead } = require('./services/buscaDemanda');
    const bairros = await listarBairrosComLead(req.query.estado || '', req.query.cidade || '');
    res.json({ ok: true, bairros });
  } catch(e) { res.json({ ok: false, erro: e.message, bairros: [] }); }
}
app.get('/admin/demanda/bairros', authAdmin, _handlerDemandaBairros);
app.get('/demanda/bairros', _handlerDemandaBairros);

async function _handlerDemandaBuscar(req, res) {
  try {
    const { estado, pares, transacoes, dias } = req.body;
    if (!estado || !Array.isArray(pares) || !pares.length) {
      return res.json({ ok: false, erro: 'Informe estado e ao menos 1 bairro' });
    }
    const diasFinal = Math.min(30, Math.max(1, parseInt(dias, 10) || 7));
    const { buscarDemanda } = require('./services/buscaDemanda');
    const leads = await buscarDemanda({ estado, pares, transacoes: transacoes || [], horas: diasFinal * 24 });
    res.json({ ok: true, total: leads.length, dias: diasFinal, leads });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
}
app.post('/admin/demanda/buscar', authAdmin, express.json(), _handlerDemandaBuscar);
app.post('/demanda/buscar', express.json(), _handlerDemandaBuscar);

// Atividade real (leads que já receberam vitrine + o imóvel real que foi
// enviado, com foto de verdade) pra alimentar a animação de "IA pensando"
// — ver listarAtividadeRecente em services/buscaDemanda.js. Não é a base
// vendida em /demanda (essa é só interessados_portal); aqui é só pra
// mostrar atividade genuína da plataforma acontecendo, nome mascarado.
async function _handlerDemandaAtividade(req, res) {
  try {
    const { listarAtividadeRecente } = require('./services/buscaDemanda');
    const { estado, pares } = req.body || {};
    const atividade = await listarAtividadeRecente({ limite: 24, estado, pares });
    res.json({ ok: true, atividade });
  } catch (e) { res.json({ ok: false, erro: e.message, atividade: [] }); }
}
app.post('/admin/demanda/atividade', authAdmin, express.json(), _handlerDemandaAtividade);
app.post('/demanda/atividade', express.json(), _handlerDemandaAtividade);

// Autocomplete de conta pra transferência manual em /admin/demanda — busca
// por nome ou código de conta, só admin.
app.get('/admin/demanda/buscar-conta', authAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ ok: true, contas: [] });
    const { query: _qBC } = require('./services/db');
    const { rows } = await _qBC(
      `SELECT codigo_usuario, nome, email FROM usuarios WHERE nome ILIKE $1 OR codigo_usuario ILIKE $1 ORDER BY nome LIMIT 10`,
      ['%' + q + '%']
    );
    res.json({ ok: true, contas: rows });
  } catch (e) { res.json({ ok: false, erro: e.message, contas: [] }); }
});

// Entrega manual dos leads encontrados numa busca de /admin/demanda direto
// pra conta escolhida pelo admin, sem passar pelo Mercado Pago — mas debita
// da conta de destino a mesma quantidade de créditos que o combo equivalente
// à quantidade encontrada custaria (mesmo critério de recomendação de combo
// usado em renderCombos() no client: o menor combo fechado que cobre o
// total, ou ilimitado se passar de 300). Pula leads que já existem na conta
// de destino (mesmo telefone ou email) em vez de duplicar.
app.post('/admin/demanda/transferir', authAdmin, express.json(), async (req, res) => {
  try {
    const { estado, pares, transacoes, dias, contaDestino } = req.body;
    if (!estado || !Array.isArray(pares) || !pares.length) return res.json({ ok: false, erro: 'Informe estado e ao menos 1 bairro' });
    if (!contaDestino) return res.json({ ok: false, erro: 'Escolha a conta de destino' });

    const { query: _qTD } = require('./services/db');
    const { rows: _contaRows } = await _qTD('SELECT codigo_usuario, nome FROM usuarios WHERE codigo_usuario=$1 LIMIT 1', [contaDestino]);
    if (!_contaRows.length) return res.json({ ok: false, erro: 'Conta de destino não encontrada' });

    const diasFinal = Math.min(30, Math.max(1, parseInt(dias, 10) || 30));
    const { buscarDemandaParaEntrega } = require('./services/buscaDemanda');
    const { salvarLead: _slTransf } = require('./services/salvarLead');
    const encontrados = await buscarDemandaParaEntrega({ estado, pares, transacoes: transacoes || [], horas: diasFinal * 24, limite: 0 });

    if (!encontrados.length) return res.json({ ok: true, total: 0, importados: 0, duplicados: 0, creditosDebitados: 0 });

    // Dedup contra leads já existentes na conta de destino (telefone ou email).
    const { query: _qDedup } = require('./services/db');
    const { rows: _existentes } = await _qDedup(
      `SELECT telefone, dados->>'email' AS email FROM leads WHERE user_id=$1 OR codigo_usuario=$1`,
      [contaDestino]
    );
    const _telsExistentes = new Set(_existentes.map(r => String(r.telefone || '').replace(/\D/g, '')).filter(Boolean));
    const _emailsExistentes = new Set(_existentes.map(r => String(r.email || '').toLowerCase().trim()).filter(Boolean));

    let importados = 0, duplicados = 0;
    for (const l of encontrados) {
      const telNorm = String(l.Telefone || '').replace(/\D/g, '');
      const emailNorm = String(l.Email || '').toLowerCase().trim();
      const jaExiste = (telNorm && _telsExistentes.has(telNorm)) || (emailNorm && _emailsExistentes.has(emailNorm));
      if (jaExiste) { duplicados++; continue; }
      try {
        await _slTransf({
          id: 'DEMANDA-' + l._rowId + '-' + contaDestino,
          nome: l.Nome || 'Interessado', telefone: l.Telefone, whatsapp: l.Telefone, email: l.Email,
          user_id: contaDestino, userId: contaDestino, codigoUsuario: contaDestino,
          origem: 'admin_demanda', status: 'novo', faseFunil: 'novo', fase_funil: 'novo',
          perfilIA: {
            tipo: l.Tipo || '', intencao: l.Transacao === 'aluguel' ? 'alugar' : 'comprar',
            cidade: l.Cidade, estado: l.Estado, bairro: l.Bairro, valorMax: l.Valor_max || undefined
          },
          dados: { origemAdminDemanda: true, dataOriginalPortal: l.criadoEm },
          _lote: true
        });
        if (telNorm) _telsExistentes.add(telNorm);
        if (emailNorm) _emailsExistentes.add(emailNorm);
        importados++;
      } catch (eLead) { console.error('[admin/demanda/transferir] erro ao salvar lead:', eLead.message); }
    }

    // Taxa única de créditos por lead (mesma de qualquer lead entrando numa
    // conta, seja manual ou importada — CUSTO.nova_lead em services/creditos.js)
    // — debita só pelas leads REALMENTE importadas (não pelo total encontrado
    // nem contando as puladas por já existir na conta).
    const { debitarCreditos, CUSTO } = require('./services/creditos');
    const creditosDebitados = CUSTO.nova_lead * importados;
    await debitarCreditos(contaDestino, creditosDebitados, 'admin_demanda_transferencia');

    // Email de resumo do lote (1 só, não 1 por lead) — mesmo padrão do
    // importar de planilha (workers/importLeadsWorker.js): cada _slTransf()
    // já rodou com _lote:true suprimindo o "Nova lead recebida" individual,
    // então sem isso o corretor não ficaria sabendo de nada.
    if (importados > 0) {
      try {
        const { rows: _contaEmailRows } = await _qTD('SELECT email FROM usuarios WHERE codigo_usuario=$1 LIMIT 1', [contaDestino]);
        const _emailDestino = _contaEmailRows[0]?.email;
        if (_emailDestino) {
          const { enviarEmail } = require('./services/email');
          await enviarEmail({
            para: _emailDestino,
            assunto: `🔔 ${importados} nova${importados > 1 ? 's' : ''} lead${importados > 1 ? 's' : ''} recebida${importados > 1 ? 's' : ''} — MatchImóveis`,
            html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><h2 style="color:#FF385C">🔔 ' + importados + ' nova' + (importados > 1 ? 's' : '') + ' lead' + (importados > 1 ? 's' : '') + '!</h2><p>Você recebeu ' + importados + ' nova' + (importados > 1 ? 's' : '') + ' lead' + (importados > 1 ? 's' : '') + ' na sua conta.</p><a href="https://matchimoveis.ia.br/app/leads" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Ver leads →</a></div>',
            texto: `${importados} nova${importados > 1 ? 's' : ''} lead${importados > 1 ? 's' : ''} recebida${importados > 1 ? 's' : ''}. Acesse: https://matchimoveis.ia.br/app/leads`
          });
        }
      } catch (eResumo) { console.error('[admin/demanda/transferir] erro no email de resumo:', eResumo.message); }
    }

    console.log('[admin/demanda/transferir]', contaDestino, '| encontrados:', encontrados.length, '| importados:', importados, '| duplicados:', duplicados, '| creditos debitados:', creditosDebitados);
    res.json({ ok: true, total: encontrados.length, importados, duplicados, creditosDebitados, contaNome: _contaRows[0].nome });
  } catch (e) { console.error('[admin/demanda/transferir]', e.message); res.json({ ok: false, erro: e.message }); }
});

// Extrai um resumo da região buscada (estado + cidades únicas + os pares
// cidade/bairro exatos) pra guardar no perfil do corretor — mesmo que ele
// nunca compre um combo, o admin sabe em que região ele tem interesse pra
// mandar leads manualmente depois (ver /admin/demanda/transferir).
function _regiaoInteresseDeCriterios(criterios) {
  const cidades = [...new Set((criterios.pares || []).map(p => p.cidade).filter(Boolean))];
  return { estado: criterios.estado, cidades, bairros: criterios.pares || [], atualizadaEm: new Date().toISOString() };
}

// Cria a conta a partir do formulário de /demanda (nome/email/celular/senha)
// — usada tanto no cadastro antecipado (logo depois da planilha aparecer,
// ANTES de escolher combo — ver /demanda/cadastrar) quanto no fluxo antigo/
// fallback dentro de /demanda/comprar (cadastro + pagamento no mesmo passo,
// pra quem pulou o cadastro antecipado e foi direto no combo). Guarda a
// região buscada no perfil e manda o email de boas-vindas — não menciona
// combo nenhum porque nesse ponto pode não ter sido escolhido ainda.
async function _criarContaDemanda({ nome, email, celular, cpf, senha, criterios }) {
  const nomeVal = (nome || '').trim();
  if (!nomeVal || nomeVal.length < 3) return { ok: false, erro: 'Nome inválido. Digite seu nome completo.' };
  const telefone = String(celular || '').replace(/\D/g, '');
  if (!telefone || telefone.length < 10 || telefone.length > 13) return { ok: false, erro: 'Celular inválido. Use o formato: 47999999999' };
  const emailVal = (email || '').trim().toLowerCase();
  if (!emailVal || !emailVal.includes('@')) return { ok: false, erro: 'Email inválido.' };
  // CPF é opcional na criação da conta — só é exigido de verdade na hora de
  // pagar (ver /demanda/comprar), não trava quem só quer criar a conta
  // ainda. Se vier (fallback: cadastro + pagamento no mesmo passo) e for
  // inválido, rejeita; se vier válido, já salva.
  if (cpf && !_cpfValido(cpf)) return { ok: false, erro: 'CPF inválido. Confira os números digitados.' };
  const cpfVal = _cpfValido(cpf) ? _limparCpf(cpf) : '';
  const senhaVal = (senha || '').trim();
  if (!senhaVal || senhaVal.length < 4) return { ok: false, erro: 'Senha muito curta (mínimo 4 caracteres).' };
  if (!criterios || !criterios.estado || !Array.isArray(criterios.pares) || !criterios.pares.length) {
    return { ok: false, erro: 'Critérios de busca inválidos — refaça a busca.' };
  }

  const { lerUsuarios: _luDemanda } = require('./services/salvarUsuario');
  const users = await _luDemanda();
  if (users.find(u => String(u.telefone || u.celular || '').replace(/\D/g, '') === telefone)) {
    return { ok: false, erro: 'Já existe uma conta com esse celular. Faça login em /entrar.' };
  }
  if (users.find(u => (u.email || '').trim().toLowerCase() === emailVal)) {
    return { ok: false, erro: 'Já existe uma conta com esse email. Faça login em /entrar.' };
  }

  const codigoNovo = gerarCodigoUsuario(nomeVal);
  const senhaHash = await bcrypt.hash(senhaVal, 10);
  const novo = {
    id: codigoNovo, nome: nomeVal, telefone, celular: telefone, email: emailVal, cpf: cpfVal,
    tipo: 'corretor', ativo: true, codigoUsuario: codigoNovo, senha: senhaHash,
    matchCoins: 1000, matchCoinsTotal: 1000, matchCoinsBonusInicial: 1000,
    regiaoInteresse: _regiaoInteresseDeCriterios(criterios)
  };
  users.push(novo);
  await salvarTodosUsuarios(users);

  try {
    const { enviarEmail } = require('./services/email');
    await enviarEmail({
      para: emailVal,
      assunto: '✅ Conta criada na MatchImóveis',
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px">
        <h2 style="color:#FF385C">✅ Sua conta foi criada, ${escHtml(nomeVal)}!</h2>
        <p>Você já pode entrar em <a href="https://www.matchimoveis.ia.br/entrar" style="color:#FF385C">matchimoveis.ia.br/entrar</a> com o celular ou email cadastrado.</p>
        <p>🎁 <strong>Você já ganhou 1.000 créditos de bônus</strong> só por criar a conta — já pode usar na plataforma agora mesmo.</p>
        <p>Sua busca por leads em <strong>${escHtml(criterios.estado)}</strong> ficou salva na sua conta. Escolha um combo quando quiser pra levar esses leads pra sua carteira — eles entram automaticamente, junto com mais créditos, assim que o pagamento for aprovado.</p>
        <a href="https://www.matchimoveis.ia.br/app-home" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Ver minha conta →</a>
      </div>`,
      texto: `Sua conta foi criada, ${nomeVal}! Você já ganhou 1.000 créditos de bônus. Sua busca em ${criterios.estado} ficou salva — escolha um combo quando quiser. Acesse: https://www.matchimoveis.ia.br/entrar`
    });
  } catch (eEmail) { console.error('[demanda] erro ao enviar email de boas-vindas:', eEmail.message); }

  return { ok: true, user: novo };
}

// Cadastro antecipado: logo que a planilha de resultados aparece (antes de
// escolher combo nenhum), a tela pede os dados e cria a conta na hora — o
// corretor fica capturado (com a região de interesse salva no perfil) mesmo
// que não conclua compra nenhuma depois. contaDemandaId marca na sessão que
// essa conta foi criada por esse fluxo específico (ver uso em /demanda/comprar).
app.post('/demanda/cadastrar', express.json(), async (req, res) => {
  try {
    const { nome, email, celular, cpf, senha, criterios } = req.body;
    const resultado = await _criarContaDemanda({ nome, email, celular, cpf, senha, criterios });
    if (!resultado.ok) return res.json(resultado);
    req.session.user = resultado.user;
    req.session.contaDemandaId = resultado.user.codigoUsuario;
    res.json({ ok: true });
  } catch (e) {
    console.error('[demanda/cadastrar] erro:', e.message);
    res.json({ ok: false, erro: 'Erro ao criar conta: ' + e.message });
  }
});

// Compra de combo a partir do resultado de /demanda e vai pro checkout
// Mercado Pago. Se a conta já foi criada nessa mesma sessão via
// /demanda/cadastrar (contaDemandaId), reaproveita ela em vez de criar outra
// — senão (fluxo antigo/fallback: usuário pulou o cadastro antecipado e foi
// direto no combo) cria a conta + pagamento nesse mesmo passo, com nome/
// email/celular/senha vindos do corpo da requisição. Os critérios da busca
// (estado/pares/transações/período) vão junto na metadata da preferência
// pra, no webhook (pagamento aprovado), entregar de verdade os leads
// encontrados na conta — ver branch `combo_demanda` em POST /webhook/mercadopago.
app.post('/demanda/comprar', express.json(), async (req, res) => {
  try {
    const { plano, criterios, cpf } = req.body;
    const pacote = PLANOS_LEADS[plano];
    if (!pacote) return res.json({ ok: false, erro: 'Combo inválido' });
    if (!criterios || !criterios.estado || !Array.isArray(criterios.pares) || !criterios.pares.length) {
      return res.json({ ok: false, erro: 'Critérios de busca inválidos — refaça a busca.' });
    }
    // CPF é pedido aqui (na hora de escolher o plano/pagar), não lá no
    // cadastro — obrigatório sempre nesse ponto, mesmo pra conta já criada
    // sem CPF ainda, porque o Pix do Mercado Pago exige (ver _montarPayerMP).
    if (!_cpfValido(cpf)) return res.json({ ok: false, erro: 'CPF inválido. Confira os números digitados.' });
    const cpfLimpo = _limparCpf(cpf);

    let codigoNovo, nomeVal, emailVal;
    // contaDemandaId (não o session.user genérico) evita que um corretor JÁ
    // logado numa conta antiga (não criada por esse fluxo) herde o 50% OFF
    // "primeira conta" só por estar navegando em /demanda com sessão ativa.
    if (req.session.contaDemandaId && req.session.user && req.session.user.codigoUsuario === req.session.contaDemandaId) {
      codigoNovo = req.session.user.codigoUsuario;
      nomeVal = req.session.user.nome;
      emailVal = req.session.user.email;
      // Conta foi criada no cadastro antecipado, sem CPF — salva agora que
      // ele acabou de informar na hora de pagar.
      try {
        const { atualizarUsuario: _auCpfDemanda } = require('./services/salvarUsuario');
        await _auCpfDemanda(codigoNovo, { cpf: cpfLimpo });
        req.session.user.cpf = cpfLimpo;
      } catch (eCpfSalvar) { console.error('[demanda/comprar] erro ao salvar cpf:', eCpfSalvar.message); }
    } else {
      const { nome, email, celular, senha } = req.body;
      const resultado = await _criarContaDemanda({ nome, email, celular, cpf: cpfLimpo, senha, criterios });
      if (!resultado.ok) return res.json(resultado);
      req.session.user = resultado.user;
      req.session.contaDemandaId = resultado.user.codigoUsuario;
      codigoNovo = resultado.user.codigoUsuario;
      nomeVal = resultado.user.nome;
      emailVal = resultado.user.email;
    }

    const diasFinal = Math.min(30, Math.max(1, parseInt(criterios.dias, 10) || 7));
    const preference = new Preference(_mpClient);
    const BASE = process.env.RENDER ? 'https://matchimoveis.onrender.com' : 'http://localhost:3000';

    // Toda conta que chega até aqui (recém-criada agora, ou criada minutos
    // antes via /demanda/cadastrar na mesma sessão) é a 1ª conta do
    // comprador — por isso 50% OFF aplicado sempre. Mesma qtd de leads e
    // mesmos créditos do combo, só o valor cobrado é metade.
    const valorComDesconto = Math.round(pacote.valor * 0.5);

    const result = await preference.create({
      body: {
        items: [{
          title: `${pacote.label} — 50% OFF primeira conta — MatchImóveis`,
          quantity: 1,
          unit_price: valorComDesconto,
          currency_id: 'BRL'
        }],
        payer: _montarPayerMP(nomeVal, emailVal, cpfLimpo),
        back_urls: {
          success: BASE + '/pagamento/sucesso-plano?voltar=' + encodeURIComponent('/app-home'),
          failure: BASE + '/demanda',
          pending: BASE + '/demanda'
        },
        auto_return: 'approved',
        notification_url: BASE + '/webhook/mercadopago',
        payment_methods: { excluded_payment_types: [{ id: 'ticket' }] },
        metadata: {
          userId: codigoNovo, tipo: 'combo_demanda', plano, qtd: pacote.qtd || 0, label: pacote.label,
          valor: valorComDesconto, creditos: pacote.creditos,
          estado: criterios.estado, pares: JSON.stringify(criterios.pares),
          transacoes: JSON.stringify(criterios.transacoes || []), horas: diasFinal * 24
        }
      }
    });

    res.json({ ok: true, url: result.init_point });
  } catch (e) {
    console.error('[demanda/comprar] erro:', e.message);
    res.json({ ok: false, erro: 'Erro ao criar conta/pagamento: ' + e.message });
  }
});
// ── FIM BUSCAR DEMANDA POR REGIÃO ──────────────────────────────────────────

// ── CAMPANHA GLOBAL DE CAPTAÇÃO (disparo em massa, admin) ──────────────────
app.get('/admin/captacao-campanha', authAdmin, async (req, res) => {
  const adminShellCss = _adminShellCss(), adminSidebar = _adminSidebarHtml('captacao-campanha');
  // Conta admin secundária (permissão 'captacao-campanha') só vê o
  // acompanhamento (progresso, funil, envios recentes) — iniciar/pausar o
  // disparo em massa fica restrito ao superadmin, mesma lógica de
  // /admin/campanha (ver _ADMIN_ROTAS_SUPERADMIN_ONLY).
  const isSuper = req.session.adminSuper !== false;
  try {
    const { contarStatus } = require('./services/campanhaCaptacao');
    const status = await contarStatus();
    res.render('admin-captacao-campanha', { status, adminShellCss, adminSidebar, isSuper });
  } catch (e) {
    console.error('[admin/captacao-campanha]', e.message);
    res.render('admin-captacao-campanha', { status: null, adminShellCss, adminSidebar, isSuper });
  }
});
app.get('/admin/captacao-campanha/status', authAdmin, async (req, res) => {
  try {
    const { contarStatus } = require('./services/campanhaCaptacao');
    res.json({ ok: true, status: await contarStatus() });
  } catch (e) { res.json({ ok: false, erro: e.message }); }
});
app.post('/admin/captacao-campanha/iniciar', authAdmin, async (req, res) => {
  try {
    const { iniciarCampanha, contarStatus } = require('./services/campanhaCaptacao');
    await iniciarCampanha();
    res.json({ ok: true, status: await contarStatus() });
  } catch (e) { res.json({ ok: false, erro: e.message }); }
});
app.post('/admin/captacao-campanha/pausar', authAdmin, async (req, res) => {
  try {
    const { pausarCampanha, contarStatus } = require('./services/campanhaCaptacao');
    await pausarCampanha();
    res.json({ ok: true, status: await contarStatus() });
  } catch (e) { res.json({ ok: false, erro: e.message }); }
});
app.get('/admin/captacao-campanha/lista', authAdmin, async (req, res) => {
  try {
    const { listarEnvios } = require('./services/campanhaCaptacao');
    const pagina = parseInt(req.query.pagina) || 1;
    const q = req.query.q || '';
    const filtro = req.query.filtro || '';
    const { envios, total } = await listarEnvios({ limite: 50, offset: (pagina - 1) * 50, q, filtro });
    res.json({ ok: true, envios, total });
  } catch (e) { res.json({ ok: false, erro: e.message, envios: [], total: 0 }); }
});
app.get('/admin/captacao-campanha/preview/:id', authAdmin, async (req, res) => {
  try {
    const { buscarEnvioParaPreview } = require('./services/campanhaCaptacao');
    const envio = await buscarEnvioParaPreview(req.params.id);
    if (!envio) return res.status(404).send('Envio não encontrado.');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview — ${envio.titulo_usado || 'e-mail'}</title></head><body style="background:#f5f5f3;padding:24px">
      <div style="max-width:640px;margin:0 auto">
        <p style="font-family:Arial,sans-serif;font-size:12px;color:#6b7280;margin-bottom:12px">Assunto: <strong>${envio.titulo_usado || ''}</strong> · Para: ${envio.email}</p>
        <div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e3">${envio.html}</div>
      </div>
    </body></html>`);
  } catch (e) { res.status(500).send('Erro ao carregar preview.'); }
});
// ── FIM CAMPANHA GLOBAL DE CAPTAÇÃO ─────────────────────────────────────────

app.get('/admin/campanha', authAdmin, async (req, res) => {
  const { statsBase, statsTracking, statsCadastrados, statsValidacao, estaAtiva } = require('./services/campanha');
  const stats = await statsBase().catch(()=>[]);
  const tracking = await statsTracking().catch(()=>[]);
  const cadastrados = await statsCadastrados().catch(()=>0);
  const validacao = await statsValidacao().catch(()=>({pendente_validar:0,validos:0,invalidos:0}));
  const ativo = await estaAtiva().catch(()=>false);
  const total = stats.reduce((a,b)=>a+parseInt(b.total),0);
  const pendentes = (stats.find(s=>s.status==='pendente')||{}).total||0;
  const enviados = (stats.find(s=>s.status==='enviado')||{}).total||0;
  const erros = (stats.find(s=>s.status==='erro')||{}).total||0;
  const aberturas = (tracking.find(s=>s.tipo==='abertura')||{}).total||0;
  const cliques = (tracking.find(s=>s.tipo==='clique')||{}).total||0;
  // Conta admin secundária (permissão 'campanha') só vê os blocos de
  // monitoramento (base de contatos, validação, contatos importados) — ver
  // nota em _ADMIN_ROTAS_SUPERADMIN_ONLY sobre por que disparar/importar/
  // testar ficam restritos ao superadmin.
  const isSuper = req.session.adminSuper !== false;
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Campanha Email</title>
  <style>body{font-family:Arial,sans-serif;margin:0;padding:0}
  ${_adminShellCss()}
  .admin-content{max-width:900px}
  h1{color:#FF385C}input,textarea{width:100%;padding:8px;margin:8px 0;border:1px solid #ddd;border-radius:6px;box-sizing:border-box}
  button{background:#FF385C;color:#fff;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin:4px}
  button.sec{background:#6b7280}
  button.ok{background:#16a34a}
  button.no{background:#dc2626}
  button:disabled{opacity:.5;cursor:not-allowed}
  .box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0}
  .green{color:#16a34a}.red{color:#dc2626}.gray{color:#6b7280}
  .stat{display:inline-block;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 20px;margin:6px;text-align:center;min-width:80px}
  .stat strong{display:block;font-size:22px;color:#FF385C}
  .tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:600}
  .tag-sim{background:#f0fdf4;color:#16a34a}
  .tag-nao{background:#f3f4f6;color:#9ca3af}</style></head>
  <body><div class="admin-app">${_adminSidebarHtml('campanha')}<main class="admin-content">
  <h1>📧 Campanha de Email</h1>
  <div class="box">
    <h3>📊 Base de contatos <span class="gray" style="font-size:11px;font-weight:normal">(atualiza sozinho a cada 15s)</span></h3>
    <div class="stat"><strong id="statTotal">${total}</strong>Total</div>
    <div class="stat"><strong style="color:#f59e0b" id="statPendentes">${pendentes}</strong>Pendentes</div>
    <div class="stat"><strong style="color:#16a34a" id="statEnviados">${enviados}</strong>Enviados</div>
    <div class="stat"><strong style="color:#dc2626" id="statErros">${erros}</strong>Erros</div>
    <div class="stat"><strong style="color:#8b5cf6" id="statAberturas">${aberturas}</strong>Aberturas</div>
    <div class="stat"><strong style="color:#2563eb" id="statCliques">${cliques}</strong>Cliques</div>
    <div class="stat"><strong style="color:#16a34a" id="statCadastrados">${cadastrados}</strong>Cadastrados</div>
  </div>
  <div class="box">
    <h3>✅ Validação de email (formato + MX do domínio)</h3>
    <p class="gray">Roda sozinho em segundo plano (50 a cada 5s) — só quem valida entra na fila de envio.</p>
    <div class="stat"><strong style="color:#f59e0b" id="statValidarPendente">${validacao.pendente_validar}</strong>Aguardando validar</div>
    <div class="stat"><strong style="color:#16a34a" id="statValidos">${validacao.validos}</strong>Válidos</div>
    <div class="stat"><strong style="color:#dc2626" id="statInvalidos">${validacao.invalidos}</strong>Inválidos (descartados)</div>
  </div>
  ${isSuper ? `<div class="box">
    <h3>🤖 Disparo automático</h3>
    <p class="gray">Intervalo aleatório de 30s a 5min por envio (varia sempre, nunca fixo). Alterna sozinho entre 2 modelos (página inicial / demanda), cada um com várias variações de assunto e texto. Ordem de disparo: primeiro toda a região de São Paulo (dentro dela, quem parece corretor/imobiliária/broker no nome ou email primeiro, depois o resto de SP) — só depois de esgotar SP passa pro Rio de Janeiro (mesma lógica), depois Santa Catarina, depois o restante do Brasil. Pula quem já tem conta (email ou celular batendo).</p>
    <p>Status: <strong id="statusAutomatico">${ativo ? '🟢 Rodando' : '⏸ Parado'}</strong></p>
    <button class="ok" id="btnIniciarAuto" onclick="iniciarAutomatico()" ${ativo?'disabled':''}>▶ Iniciar automático</button>
    <button class="no" id="btnPausarAuto" onclick="pausarAutomatico()" ${!ativo?'disabled':''}>⏸ Pausar</button>
  </div>
  <div class="box">
    <h3>1. Importar contatos</h3>
    <p class="gray">CSV ou Excel com colunas: nome, email, celular</p>
    <input type="file" id="arquivo" accept=".csv,.xlsx,.xls">
    <button onclick="importar()">📥 Importar planilha</button>
    <div id="import-resultado"></div>
  </div>
  <div class="box">
    <h3>2. Testar e-mail</h3>
    <p class="gray">O disparo real pros 118 mil contatos é só pelo automático (caixa acima) — que já roda com o intervalo variado de 30s a 5min. Aqui embaixo é só pra mandar um e-mail de teste avulso pra si mesmo, com um texto livre, sem afetar a fila de disparo.</p>
    <label>Assunto (só do teste):</label>
    <input type="text" id="assunto" value="Você está perdendo leads pra quem responde primeiro">
    <label>Mensagem (só do teste — linhas começando com "• " viram tópicos):</label>
    <textarea id="mensagem" rows="18">Olá {nome},

Todo dia, alguém procura um imóvel na sua região — e quem responde primeiro, com o imóvel certo, é quem fecha negócio.

A maioria dos corretores descobre o lead horas depois: mensagem perdida no WhatsApp, imóvel certo esquecido na planilha, visita nunca agendada.

A Match Imóveis resolve isso sozinha, 24 horas por dia:

• Cruza cada lead com os imóveis certos da sua carteira e da rede
• Monta a vitrine e envia pro cliente automaticamente
• Agenda a visita sem você precisar lembrar

Sem mensalidade fixa e sem comissão sobre venda. Teste agora com 1.000 créditos grátis:
https://www.matchimoveis.ia.br

— Equipe Match Imóveis</textarea>
    <div style="margin:8px 0">
      <label>Email para teste:</label>
      <input type="email" id="email-teste" placeholder="seu@email.com" style="width:300px;display:inline-block">
      <button class="sec" onclick="testar()">📨 Enviar teste</button>
    </div>
    <div id="resultado"></div>
  </div>` : ''}
  <div class="box">
    <h3>📋 Contatos importados</h3>
    <div style="margin-bottom:8px">
      <input type="text" id="busca" placeholder="Buscar por nome ou email..." style="width:300px;display:inline-block" oninput="buscar()">
      <select id="filtro-status" onchange="buscar()" style="width:180px;display:inline-block;margin-left:8px">
        <option value="">Todos os status</option>
        <option value="pendente">Pendentes</option>
        <option value="enviado">Enviados</option>
        <option value="erro">Erros</option>
        <option value="abriu">Quem abriu</option>
        <option value="clicou">Quem clicou</option>
        <option value="cadastrou">Quem cadastrou</option>
      </select>
    </div>
    <div id="tabela-contatos">⏳ Carregando...</div>
    <div id="paginacao" style="margin-top:8px"></div>
  </div>

  <div id="modal-preview-overlay" style="display:none;position:fixed;inset:0;background:rgba(17,24,39,.6);z-index:1000;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this) fecharPreview()">
    <div style="background:#fff;border-radius:14px;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;position:relative;box-shadow:0 20px 50px rgba(0,0,0,.25)">
      <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div id="preview-assunto" style="font-weight:700;font-size:14px;color:#111827"></div>
          <div id="preview-meta" style="font-size:11.5px;color:#6b7280;margin-top:2px"></div>
        </div>
        <button type="button" onclick="fecharPreview()" style="background:#f3f4f6;border:none;width:28px;height:28px;border-radius:999px;cursor:pointer;font-size:16px;color:#6b7280;margin:0;padding:0">×</button>
      </div>
      <div id="preview-corpo" style="padding:0"></div>
    </div>
  </div>

  <script>
  async function abrirPreview(id){
    document.getElementById('modal-preview-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.getElementById('preview-assunto').textContent = 'Carregando...';
    document.getElementById('preview-meta').textContent = '';
    document.getElementById('preview-corpo').innerHTML = '';
    try {
      const r = await fetch('/admin/campanha/preview/'+id);
      const d = await r.json();
      if(!d.ok){
        document.getElementById('preview-assunto').textContent = 'Preview indisponível';
        document.getElementById('preview-corpo').innerHTML = '<p style="padding:20px;color:#6b7280;font-size:13px">'+escHtml(d.erro||'Erro ao carregar')+'</p>';
        return;
      }
      document.getElementById('preview-assunto').textContent = d.assunto || '(sem assunto)';
      document.getElementById('preview-meta').textContent = 'Modelo: ' + (d.modelo || '—') + ' · Para: ' + d.email;
      document.getElementById('preview-corpo').innerHTML = d.html;
    } catch(e){ document.getElementById('preview-assunto').textContent = 'Erro ao carregar'; }
  }
  function fecharPreview(){
    document.getElementById('modal-preview-overlay').style.display = 'none';
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') fecharPreview(); });
  function escHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function _tag(cond){ return cond ? '<span class="tag tag-sim">Sim</span>' : '<span class="tag tag-nao">Não</span>'; }
  async function iniciarAutomatico(){
    if(!confirm('Iniciar disparo automático? Vai mandar emails com intervalo de 30s a 5min até esgotar os contatos válidos.')) return;
    await fetch('/admin/campanha/iniciar', {method:'POST'});
    document.getElementById('statusAutomatico').textContent = '🟢 Rodando';
    document.getElementById('btnIniciarAuto').disabled = true;
    document.getElementById('btnPausarAuto').disabled = false;
  }
  async function pausarAutomatico(){
    await fetch('/admin/campanha/pausar', {method:'POST'});
    document.getElementById('statusAutomatico').textContent = '⏸ Parado';
    document.getElementById('btnIniciarAuto').disabled = false;
    document.getElementById('btnPausarAuto').disabled = true;
  }
  function _setTxt(id, val){ const el = document.getElementById(id); if(el) el.textContent = val; }
  function _setDisabled(id, val){ const el = document.getElementById(id); if(el) el.disabled = val; }
  setInterval(async function(){
    try {
      const r = await fetch('/admin/campanha/status');
      const d = await r.json();
      if(!d.ok) return;
      // Elementos com _set* (null-safe): "Disparo automático" some da tela
      // pra conta admin secundária (ver isSuper no server), então esses IDs
      // podem não existir no DOM — sem o guard, o primeiro que não existisse
      // travava o resto do bloco (Base de contatos nunca mais atualizava).
      _setTxt('statValidarPendente', d.validacao.pendente_validar);
      _setTxt('statValidos', d.validacao.validos);
      _setTxt('statInvalidos', d.validacao.invalidos);
      _setTxt('statusAutomatico', d.ativo ? '🟢 Rodando' : '⏸ Parado');
      _setDisabled('btnIniciarAuto', d.ativo);
      _setDisabled('btnPausarAuto', !d.ativo);
      _setTxt('statTotal', d.base.total);
      _setTxt('statPendentes', d.base.pendentes);
      _setTxt('statEnviados', d.base.enviados);
      _setTxt('statErros', d.base.erros);
      _setTxt('statAberturas', d.base.aberturas);
      _setTxt('statCliques', d.base.cliques);
      _setTxt('statCadastrados', d.base.cadastrados);
    } catch(e){}
    buscar(_pagina);
  }, 15000);
  let _pagina = 1;
  async function buscar(p){
    _pagina = p || 1;
    const q = document.getElementById('busca').value;
    const s = document.getElementById('filtro-status').value;
    const r = await fetch('/admin/campanha/contatos?pagina='+_pagina+'&q='+encodeURIComponent(q)+'&status='+s);
    const d = await r.json();
    if(!d.ok){ document.getElementById('tabela-contatos').innerHTML='<p class=red>Erro ao carregar</p>'; return; }
    let html = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:920px"><tr style="background:#f3f4f6"><th style="padding:8px;text-align:left">Nome</th><th style="padding:8px;text-align:left">Email</th><th style="padding:8px;text-align:left">Celular</th><th style="padding:8px;text-align:left">Status</th><th style="padding:8px;text-align:left">Modelo</th><th style="padding:8px;text-align:left">Abriu</th><th style="padding:8px;text-align:left">Clicou</th><th style="padding:8px;text-align:left">Cadastrou</th><th style="padding:8px;text-align:left">Enviado em</th><th style="padding:8px;text-align:left">E-mail</th></tr>';
    for(const c of d.contatos){
      const cor = c.status==='enviado'?'#16a34a':c.status==='erro'?'#dc2626':'#f59e0b';
      const statusTxt = c.status==='erro' ? escHtml(c.status)+' ('+escHtml(c.erro||'')+')' : escHtml(c.status);
      const verEmail = c.status==='enviado' ? '<a href="javascript:void(0)" onclick="abrirPreview('+c.id+')" style="color:#FF385C;font-weight:600;text-decoration:none">Ver e-mail →</a>' : '—';
      html += '<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:8px">'+escHtml(c.nome)+'</td><td style="padding:8px">'+escHtml(c.email)+'</td><td style="padding:8px">'+escHtml(c.celular)+'</td><td style="padding:8px;color:'+cor+'">'+statusTxt+'</td><td style="padding:8px">'+escHtml(c.modelo_usado||'—')+'</td><td style="padding:8px">'+_tag(c.aberto_em)+'</td><td style="padding:8px">'+_tag(c.clicado_em)+'</td><td style="padding:8px">'+_tag(c.cadastrou)+'</td><td style="padding:8px;color:#6b7280;font-size:11px">'+(c.enviado_em?new Date(c.enviado_em).toLocaleString('pt-BR'):'—')+'</td><td style="padding:8px">'+verEmail+'</td></tr>';
    }
    html += '</table></div>';
    document.getElementById('tabela-contatos').innerHTML = html;
    // Paginação
    let pag = '';
    if(_pagina > 1) pag += '<button class="sec" onclick="buscar('+(_pagina-1)+')">← Anterior</button> ';
    pag += '<span class=gray>Página '+_pagina+' — '+d.total+' contatos</span> ';
    if(d.contatos.length === 50) pag += '<button class="sec" onclick="buscar('+(_pagina+1)+')">Próximo →</button>';
    document.getElementById('paginacao').innerHTML = pag;
  }
  buscar();
  async function importar(){
    const f = document.getElementById('arquivo').files[0];
    if(!f){ alert('Selecione um arquivo'); return; }
    document.getElementById('import-resultado').innerHTML='<p>⏳ Importando...</p>';
    const fd = new FormData(); fd.append('arquivo', f);
    const r = await fetch('/admin/campanha/importar', {method:'POST', body:fd});
    const d = await r.json();
    if(!d.ok){ document.getElementById('import-resultado').innerHTML='<p class=red>Erro: '+d.erro+'</p>'; return; }
    document.getElementById('import-resultado').innerHTML='<p class=green>✅ Importados: '+d.importados+' | Duplicados: '+d.duplicados+'</p>';
    setTimeout(()=>location.reload(), 2000);
  }
  async function testar(){
    const email = document.getElementById('email-teste').value;
    if(!email){ alert('Digite o email de teste'); return; }
    const assunto = document.getElementById('assunto').value;
    const mensagem = document.getElementById('mensagem').value;
    document.getElementById('resultado').innerHTML='<p>⏳ Enviando teste...</p>';
    const r = await fetch('/admin/campanha/teste', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email, assunto, mensagem})});
    const d = await r.json();
    document.getElementById('resultado').innerHTML = d.ok ? '<p class=green>✅ Email de teste enviado!</p>' : '<p class=red>❌ Erro: '+d.erro+'</p>';
  }
  </script></main></div></body></html>`);
});

app.post('/admin/campanha/importar', authAdmin, uploadImoveis.single('arquivo'), async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const dados = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const contatos = dados.map(r => ({
      nome: String(r.nome || r.Nome || r.NOME || '').trim(),
      email: String(r.email || r.Email || r.EMAIL || '').trim().toLowerCase(),
      celular: String(r.celular || r.Celular || r.CELULAR || r.telefone || r.Telefone || '').trim()
    })).filter(c => c.email && c.email.includes('@'));
    const { importarContatos } = require('./services/campanha');
    const resultado = await importarContatos(contatos);
    res.json({ ok: true, ...resultado });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/admin/campanha/teste', authAdmin, express.json(), async (req, res) => {
  try {
    const { email, assunto, mensagem } = req.body;
    const { enviarTeste } = require('./services/campanha');
    await enviarTeste(email, { assunto, mensagem });
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.get('/admin/campanha/status', authAdmin, async (req, res) => {
  try {
    const { estaAtiva, statsValidacao, statsBase, statsTracking, statsCadastrados } = require('./services/campanha');
    const [ativo, validacao, stats, tracking, cadastrados] = await Promise.all([
      estaAtiva(), statsValidacao(), statsBase(), statsTracking(), statsCadastrados()
    ]);
    const total = stats.reduce((a,b)=>a+parseInt(b.total),0);
    const pendentes = (stats.find(s=>s.status==='pendente')||{}).total||0;
    const enviados = (stats.find(s=>s.status==='enviado')||{}).total||0;
    const erros = (stats.find(s=>s.status==='erro')||{}).total||0;
    const aberturas = (tracking.find(s=>s.tipo==='abertura')||{}).total||0;
    const cliques = (tracking.find(s=>s.tipo==='clique')||{}).total||0;
    res.json({ ok: true, ativo, validacao, base: { total, pendentes, enviados, erros, aberturas, cliques, cadastrados } });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});
app.post('/admin/campanha/iniciar', authAdmin, async (req, res) => {
  try { const { iniciarCampanha } = require('./services/campanha'); await iniciarCampanha(); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, erro: e.message }); }
});
app.post('/admin/campanha/pausar', authAdmin, async (req, res) => {
  try { const { pausarCampanha } = require('./services/campanha'); await pausarCampanha(); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, erro: e.message }); }
});
app.get('/admin/campanha/envios', authAdmin, async (req, res) => {
  try {
    const { listarEnvios } = require('./services/campanha');
    res.json({ ok: true, envios: await listarEnvios({ limite: 50 }) });
  } catch(e) { res.json({ ok: false, erro: e.message, envios: [] }); }
});
// Preview do e-mail que foi enviado (usado pelo modal "Ver e-mail" na
// tabela de contatos) — reconstrói com o mesmo assunto/corpo sorteados
// naquele envio específico.
app.get('/admin/campanha/preview/:id', authAdmin, async (req, res) => {
  try {
    const { buscarEnvioParaPreview } = require('./services/campanha');
    const envio = await buscarEnvioParaPreview(req.params.id);
    if (!envio) return res.json({ ok: false, erro: 'Envio não encontrado' });
    if (!envio.corpo_usado) {
      return res.json({ ok: false, erro: 'Esse email foi enviado antes desse recurso de preview existir — o texto exato não ficou salvo.' });
    }
    res.json({ ok: true, assunto: envio.titulo_usado, modelo: envio.modelo_usado, email: envio.email, html: envio.html });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});
// ── FIM CAMPANHA EMAIL ────────────────────────────────────────────────────────

app.get('/admin/campanha/contatos', authAdmin, async (req, res) => {
  try {
    const pagina = parseInt(req.query.pagina)||1;
    const q = req.query.q||'';
    const status = req.query.status||'';
    const offset = (pagina-1)*50;
    let where = 'WHERE 1=1';
    const params = [];
    if(q){ params.push('%'+q+'%'); where += ` AND (nome ILIKE $${params.length} OR email ILIKE $${params.length})`; }
    if(status === 'abriu'){ where += ` AND aberto_em IS NOT NULL`; }
    else if(status === 'clicou'){ where += ` AND clicado_em IS NOT NULL`; }
    else if(status === 'cadastrou'){ where += ` AND LOWER(email) IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')`; }
    else if(status){ params.push(status); where += ` AND status=$${params.length}`; }
    params.push(50); params.push(offset);
    const { rows } = await require('./services/db').query(`SELECT id,nome,email,celular,status,modelo_usado,aberto_em,clicado_em,enviado_em,erro,
      (LOWER(email) IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')) AS cadastrou
      FROM campanha_contatos ${where} ORDER BY COALESCE(enviado_em, criado_em) DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    const { rows: tot } = await require('./services/db').query(`SELECT COUNT(*) as total FROM campanha_contatos ${where}`, params.slice(0,-2));
    res.json({ ok:true, contatos:rows, total:tot[0].total });
  } catch(e){ res.json({ ok:false, erro:e.message }); }
});

// ── DISPAROS WHATSAPP (Meta Cloud API) ────────────────────────────────────────
// Sistema separado do Evolution API (usado pra vitrine/assistente) e da Campanha Email.
// Usa exclusivamente a WhatsApp Cloud API oficial da Meta (services/metaWhatsapp.js).
function _lerPlanilhaDisparo(filePath) {
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const colunas = linhas.length ? Object.keys(linhas[0]) : [];
  return { colunas, linhas };
}

// Monta a lista de contatos a partir das linhas da planilha já mapeadas,
// barrando telefone inválido (célula vazia, texto lixo, número incompleto)
// antes de gastar tentativa de envio — usado tanto na criação da campanha
// quanto ao subir mais planilha numa campanha já existente.
function _prepararContatosDisparo(linhas, mapeamento) {
  const { _normalizarTelefone, _telefoneValido } = require('./services/metaWhatsapp');
  let numerosInvalidos = 0;
  const contatos = linhas
    .map(l => ({
      nome: mapeamento.nome ? String(l[mapeamento.nome] || '') : '',
      telefone: _normalizarTelefone(l[mapeamento.telefone]),
      variaveis: l
    }))
    .filter(c => {
      if (!c.telefone) return false;
      if (!_telefoneValido(c.telefone)) { numerosInvalidos++; return false; }
      return true;
    });
  return { contatos, numerosInvalidos };
}

app.get('/admin/disparos', authAdmin, async (req, res) => {
  try {
    const { listarCampanhas } = require('./services/salvarDisparo');
    const campanhas = await listarCampanhas().catch(()=>[]);
    const _corretoresOpts = (_cacheUsuarios || [])
      .filter(u => u.tipo !== 'admin' && (u.codigoUsuario || u.id))
      .sort((a,b) => (a.nome||'').localeCompare(b.nome||''))
      .map(u => `<option value="${u.codigoUsuario||u.id}">${u.nome||u.codigoUsuario||u.id} (${u.codigoUsuario||u.id})</option>`).join('');
    const _corStatus = s => s==='concluido'?'#16a34a':s==='erro'?'#dc2626':s==='pausado'?'#f59e0b':s==='enviando'?'#2563eb':'#6b7280';
    const linhasHist = campanhas.map(c => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px"><a href="/admin/disparos/${c.id}" style="color:#FF385C;font-weight:600;text-decoration:none">${c.nome_campanha}</a></td>
        <td style="padding:8px;font-size:12px;color:#6b7280">${c.template_nome} (${c.template_idioma})</td>
        <td style="padding:8px">${c.total_contatos}</td>
        <td style="padding:8px;color:#16a34a">${c.enviados}</td>
        <td style="padding:8px;color:#dc2626">${c.erros}</td>
        <td style="padding:8px"><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;color:#fff;background:${_corStatus(c.status)}">${c.status}</span></td>
        <td style="padding:8px;font-size:11px;color:#6b7280">${new Date(c.criado_em).toLocaleString('pt-BR')}</td>
      </tr>`).join('');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Disparos WhatsApp</title>
    <style>body{font-family:Arial,sans-serif;margin:0;padding:0}
    ${_adminShellCss()}
    .admin-content{max-width:960px}
    h1{color:#FF385C}input,select,textarea{width:100%;padding:8px;margin:8px 0;border:1px solid #ddd;border-radius:6px;box-sizing:border-box}
    button{background:#FF385C;color:#fff;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin:4px}
    button.sec{background:#6b7280}button:disabled{opacity:.5;cursor:not-allowed}
    .box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0}
    .green{color:#16a34a}.red{color:#dc2626}.gray{color:#6b7280}
    label{font-size:12px;font-weight:600;color:#374151;display:block;margin-top:10px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;padding:8px;background:#f3f4f6;font-size:11px;text-transform:uppercase;color:#6b7280}
    .varrow{display:flex;gap:8px;align-items:center;margin:4px 0}
    .varrow span{font-size:12px;color:#6b7280;min-width:36px}
    .varrow select{margin:0}
    </style></head>
    <body>
    <div class="admin-app">
    ${_adminSidebarHtml('disparos')}
    <main class="admin-content">
    <h1>📲 Disparos WhatsApp <span style="font-size:13px;color:#6b7280;font-weight:400">(Cloud API oficial da Meta)</span></h1>
    <p><a href="/admin/disparos/optout" style="font-size:12px;color:#6b7280;text-decoration:underline">🚫 Ver quem descadastrou (não tenho interesse / não tenho imóvel)</a></p>

    <div class="box">
      <h3>1. Importar planilha de contatos</h3>
      <p class="gray">Colunas livres: nome, telefone e quaisquer outras (ex: cidade, nome_imobiliaria) pra usar como variável do template.</p>
      <input type="file" id="arquivo" accept=".csv,.xlsx,.xls">
      <button onclick="prever()">📥 Carregar planilha</button>
      <div id="preview-resultado"></div>
    </div>

    <div class="box" id="config-box" style="display:none">
      <h3>2. Template e mapeamento</h3>
      <label>Nome da campanha</label>
      <input type="text" id="nomeCampanha" placeholder="Ex: Reengajamento julho/2026">
      <label>Nome do template (igual ao cadastrado no WhatsApp Manager)</label>
      <input type="text" id="templateNome" placeholder="Ex: promo_julho">
      <label>Idioma do template</label>
      <input type="text" id="templateIdioma" value="pt_BR" placeholder="pt_BR">
      <label>Número de envio</label>
      <select id="phoneNumberId">
        <option value="">— padrão (variável de ambiente) —</option>
        <option value="1210590465475893">+55 11 97860-0214 — Usuários do sistema</option>
        <option value="1234898449710364">+55 11 95665-5428 — Captação de proprietários</option>
      </select>
      <label>Corretor dos botões de link (só se o template tiver botão de URL "Sim, eu tenho!"/"Quero ajuda pra cadastrar!" apontando pra /captar) — opcional</label>
      <select id="corretorUserId"><option value="">— nenhum (template só com texto/resposta rápida) —</option>${_corretoresOpts}</select>
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-top:10px">
        <input type="checkbox" id="usarContatoIdBotao" style="width:auto">
        Botão de URL cria conta automaticamente (campanha de aquisição, ex: "leads garantidos" — aponta pra /entrar/{id})
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-top:6px">
        <input type="checkbox" id="ignorarHistorico" style="width:auto">
        Ignorar histórico — enviar mesmo pra quem já recebeu disparo antes (remarketing com template novo pros mesmos contatos)
      </label>
      <label>Coluna com o telefone</label>
      <select id="colTelefone"></select>
      <label>Coluna com o nome (opcional, só exibição)</label>
      <select id="colNome"></select>
      <label>Quantidade de variáveis no corpo do template ({{1}}, {{2}}...)</label>
      <input type="number" id="qtdVariaveis" min="0" max="10" value="0" onchange="montarVariaveis()">
      <div id="variaveis-map"></div>
      <label>Delay entre envios (ms)</label>
      <input type="number" id="delayMs" value="2500" min="500" max="30000">
      <div class="box" style="background:#fff">
        <label>Números para teste (1 a 3, separados por vírgula)</label>
        <input type="text" id="numerosTeste" placeholder="11999998888, 11999997777">
        <button class="sec" onclick="testar()">📨 Testar envio</button>
        <div id="teste-resultado"></div>
      </div>
      <button onclick="iniciar()">🚀 Iniciar campanha</button>
      <div id="resultado"></div>
    </div>

    <div class="box">
      <h3>📋 Histórico de campanhas</h3>
      <table>
        <thead><tr><th>Campanha</th><th>Template</th><th>Contatos</th><th>Enviados</th><th>Erros</th><th>Status</th><th>Criada em</th></tr></thead>
        <tbody>${linhasHist || '<tr><td colspan="7" style="padding:16px;color:#9ca3af">Nenhuma campanha ainda.</td></tr>'}</tbody>
      </table>
    </div>

    <script>
    let _colunas = [];
    let _amostra = [];
    let _arquivoPath = '';

    async function prever(){
      const f = document.getElementById('arquivo').files[0];
      if(!f){ alert('Selecione um arquivo'); return; }
      document.getElementById('preview-resultado').innerHTML = '<p>⏳ Lendo planilha...</p>';
      const fd = new FormData(); fd.append('arquivo', f);
      const r = await fetch('/admin/disparos/preview-planilha', { method:'POST', body: fd });
      const d = await r.json();
      if(!d.ok){ document.getElementById('preview-resultado').innerHTML = '<p class="red">Erro: '+d.erro+'</p>'; return; }
      _colunas = d.colunas; _amostra = d.amostra; _arquivoPath = d.arquivo;
      document.getElementById('preview-resultado').innerHTML = '<p class="green">✅ '+d.totalLinhas+' linhas encontradas. Colunas: '+_colunas.join(', ')+'</p>';
      const selTel = document.getElementById('colTelefone');
      const selNome = document.getElementById('colNome');
      selTel.innerHTML = _colunas.map(c=>'<option value="'+c+'">'+c+'</option>').join('');
      selNome.innerHTML = '<option value="">—</option>' + _colunas.map(c=>'<option value="'+c+'">'+c+'</option>').join('');
      const _achar = (padroes) => _colunas.find(c => padroes.some(p => c.toLowerCase().includes(p)));
      const _colTelSugerida = _achar(['telefone','celular','whatsapp','fone','phone']);
      const _colNomeSugerida = _achar(['nome','razao','razão','empresa','name']);
      if(_colTelSugerida) selTel.value = _colTelSugerida;
      if(_colNomeSugerida) selNome.value = _colNomeSugerida;
      document.getElementById('config-box').style.display = 'block';
      montarVariaveis();
    }

    function montarVariaveis(){
      const qtd = parseInt(document.getElementById('qtdVariaveis').value)||0;
      let html = '';
      for(let i=1;i<=qtd;i++){
        html += '<div class="varrow"><span>{{'+i+'}}</span><select id="var-'+i+'">'+_colunas.map(c=>'<option value="'+c+'">'+c+'</option>').join('')+'</select></div>';
      }
      document.getElementById('variaveis-map').innerHTML = html;
    }

    function _mapeamentoAtual(){
      const qtd = parseInt(document.getElementById('qtdVariaveis').value)||0;
      const variaveisOrdem = [];
      for(let i=1;i<=qtd;i++) variaveisOrdem.push(document.getElementById('var-'+i).value);
      return { telefone: document.getElementById('colTelefone').value, nome: document.getElementById('colNome').value, variaveisOrdem };
    }

    async function testar(){
      const numeros = document.getElementById('numerosTeste').value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,3);
      if(!numeros.length){ alert('Informe ao menos 1 número'); return; }
      if(!_arquivoPath){ alert('Carregue a planilha primeiro'); return; }
      document.getElementById('teste-resultado').innerHTML = '<p>⏳ Enviando teste...</p>';
      const body = {
        arquivo: _arquivoPath,
        templateNome: document.getElementById('templateNome').value,
        templateIdioma: document.getElementById('templateIdioma').value,
        mapeamento: _mapeamentoAtual(),
        corretorUserId: document.getElementById('corretorUserId').value,
        usarContatoIdBotao: document.getElementById('usarContatoIdBotao').checked,
        phoneNumberId: document.getElementById('phoneNumberId').value,
        numeros
      };
      const r = await fetch('/admin/disparos/teste', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const d = await r.json();
      if(!d.ok){ document.getElementById('teste-resultado').innerHTML = '<p class="red">Erro: '+d.erro+'</p>'; return; }
      document.getElementById('teste-resultado').innerHTML = d.resultados.map(x=>'<p class="'+(x.ok?'green':'red')+'">'+x.numero+': '+(x.ok?'✅ enviado':'❌ '+x.erro)+'</p>').join('');
    }

    async function iniciar(){
      if(!_arquivoPath){ alert('Carregue a planilha primeiro'); return; }
      const nomeCampanha = document.getElementById('nomeCampanha').value.trim();
      if(!nomeCampanha){ alert('Dê um nome pra campanha'); return; }
      if(!confirm('Iniciar disparo pra '+_amostra.length+'+ contatos da planilha? Essa ação não pode ser desfeita.')) return;
      document.getElementById('resultado').innerHTML = '<p>⏳ Criando campanha...</p>';
      const body = {
        nomeCampanha,
        arquivo: _arquivoPath,
        templateNome: document.getElementById('templateNome').value,
        templateIdioma: document.getElementById('templateIdioma').value,
        mapeamento: _mapeamentoAtual(),
        corretorUserId: document.getElementById('corretorUserId').value,
        usarContatoIdBotao: document.getElementById('usarContatoIdBotao').checked,
        ignorarHistorico: document.getElementById('ignorarHistorico').checked,
        phoneNumberId: document.getElementById('phoneNumberId').value,
        delayMs: parseInt(document.getElementById('delayMs').value)||2500
      };
      const r = await fetch('/admin/disparos/criar', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const d = await r.json();
      if(!d.ok){ document.getElementById('resultado').innerHTML = '<p class="red">Erro: '+d.erro+'</p>'; return; }
      if(d.optout > 0 || d.jaEnviados > 0 || d.jaCadastrados > 0 || d.numerosInvalidos > 0){
        let avisos = [];
        if(d.numerosInvalidos > 0) avisos.push(d.numerosInvalidos+' removido(s) da lista por número inválido');
        if(d.optout > 0) avisos.push(d.optout+' pulado(s) por opt-out');
        if(d.jaEnviados > 0) avisos.push(d.jaEnviados+' pulado(s) por já terem recebido esse disparo antes');
        if(d.jaCadastrados > 0) avisos.push(d.jaCadastrados+' pulado(s) por já ter conta no sistema');
        document.getElementById('resultado').innerHTML = '<p class="gray">⚠️ '+avisos.join(', ')+'. Redirecionando...</p>';
        await new Promise(r=>setTimeout(r,1800));
      }
      window.location = '/admin/disparos/'+d.campanhaId;
    }
    </script>
    </main>
    </div>
    </body></html>`);
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

// Upload temporário do mapa-mauricio.json (reconciliação de endereços MAU-EHAM) — grava
// na raiz do projeto pra o script reconciliar-enderecos-mauricio.js ler direto no Render Shell.
app.get('/admin/upload-mauricio-mapa', authAdmin, (req, res) => {
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Upload mapa Mauricio</title>
  <style>body{font-family:sans-serif;margin:0;padding:0}${_adminShellCss()}.admin-content{max-width:480px}</style>
  </head>
  <body><div class="admin-app">${_adminSidebarHtml('dashboard', req.session.adminSuper !== false ? true : (req.session.adminPermissoes || []))}<main class="admin-content">
    <h3>Upload mapa-mauricio.json</h3>
    <form method="POST" action="/admin/upload-mauricio-mapa" enctype="multipart/form-data">
      <input type="file" name="arquivo" accept=".json" required>
      <button type="submit">Enviar</button>
    </form>
  </main></div></body></html>`);
});
app.post('/admin/upload-mauricio-mapa', authAdmin, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('Nenhum arquivo enviado');
    const destino = path.join(__dirname, 'mapa-mauricio.json');
    await fs.promises.copyFile(req.file.path, destino);
    await fs.promises.unlink(req.file.path).catch(()=>{});
    res.send(`✅ Salvo em ${destino}.<br>Agora no Render Shell rode: <code>node reconciliar-enderecos-mauricio.js</code>`);
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.post('/admin/disparos/preview-planilha', authAdmin, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, erro: 'Nenhum arquivo enviado' });
    const { colunas, linhas } = _lerPlanilhaDisparo(req.file.path);
    res.json({ ok: true, colunas, amostra: linhas.slice(0, 3), totalLinhas: linhas.length, arquivo: req.file.path });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});
app.post('/admin/disparos/teste', authAdmin, express.json(), async (req, res) => {
  try {
    const { arquivo, templateNome, templateIdioma, mapeamento, numeros, corretorUserId, usarContatoIdBotao, phoneNumberId } = req.body;
    if (!templateNome) return res.json({ ok: false, erro: 'Informe o nome do template' });
    if (!numeros || !numeros.length) return res.json({ ok: false, erro: 'Informe ao menos 1 número' });
    const { linhas } = _lerPlanilhaDisparo(arquivo);
    const primeira = linhas[0] || {};
    const { enviarTemplate, _normalizarTelefone } = require('./services/metaWhatsapp');
    const parametros = (mapeamento.variaveisOrdem || []).map(c => primeira[c] ?? '');
    const resultados = [];

    // Botão de URL dinâmica com criação de conta (/entrar/:id) precisa de uma
    // linha REAL em disparos_contatos — sem isso o teste manda a mensagem
    // certinho mas o botão sempre cai na home porque o id não existe na
    // tabela. Cria uma campanha de teste descartável só pra isso.
    let _campanhaTesteId = null;
    if (usarContatoIdBotao) {
      const { criarCampanha } = require('./services/salvarDisparo');
      _campanhaTesteId = await criarCampanha({
        nomeCampanha: `[teste] ${templateNome} — ${new Date().toLocaleString('pt-BR')}`,
        templateNome, templateIdioma: templateIdioma || 'pt_BR',
        mapeamentoVariaveis: mapeamento.variaveisOrdem || [],
        criadoPor: 'teste', usarContatoIdBotao: true, phoneNumberId: phoneNumberId || null
      });
    }

    for (const numero of numeros.slice(0, 3)) {
      try {
        // Só o botão de índice 0 ("Sim, eu tenho!") é do tipo URL dinâmica no
        // template — o índice 1 ("Não tenho imóvel") é resposta rápida (quick
        // reply) e não aceita parâmetro de URL (mandar os dois dava erro 132018).
        let botoesUrl;
        if (corretorUserId) {
          botoesUrl = [{ index: 0, valor: `${corretorUserId}?tel=${_normalizarTelefone(numero)}` }];
        } else if (usarContatoIdBotao) {
          const { v4: uuidv4Teste } = require('uuid');
          const { query: _qContatoTeste } = require('./services/db');
          const contatoIdTeste = uuidv4Teste();
          await _qContatoTeste(
            `INSERT INTO disparos_contatos (id, campanha_id, nome, telefone, variaveis, status) VALUES ($1,$2,$3,$4,$5,'enviado')`,
            [contatoIdTeste, _campanhaTesteId, (mapeamento.nome ? primeira[mapeamento.nome] : '') || '', _normalizarTelefone(numero), JSON.stringify(primeira)]
          );
          botoesUrl = [{ index: 0, valor: contatoIdTeste }];
        }
        await enviarTemplate({ telefone: numero, templateNome, templateIdioma: templateIdioma || 'pt_BR', parametros, botoesUrl, phoneNumberId: phoneNumberId || undefined });
        resultados.push({ numero, ok: true });
      } catch(e) {
        resultados.push({ numero, ok: false, erro: e.message });
      }
    }
    res.json({ ok: true, resultados });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/admin/disparos/criar', authAdmin, express.json(), async (req, res) => {
  try {
    const { nomeCampanha, arquivo, templateNome, templateIdioma, mapeamento, delayMs, corretorUserId, usarContatoIdBotao, phoneNumberId, ignorarHistorico } = req.body;
    if (!nomeCampanha) return res.json({ ok: false, erro: 'Informe o nome da campanha' });
    if (!templateNome) return res.json({ ok: false, erro: 'Informe o nome do template' });
    if (!mapeamento || !mapeamento.telefone) return res.json({ ok: false, erro: 'Mapeie a coluna de telefone' });

    const { linhas } = _lerPlanilhaDisparo(arquivo);
    const { contatos, numerosInvalidos } = _prepararContatosDisparo(linhas, mapeamento);
    if (!contatos.length) return res.json({ ok: false, erro: 'Nenhum contato com telefone válido na planilha' });

    const { criarCampanha, inserirContatos } = require('./services/salvarDisparo');
    const campanhaId = await criarCampanha({
      nomeCampanha,
      templateNome,
      templateIdioma: templateIdioma || 'pt_BR',
      mapeamentoVariaveis: mapeamento.variaveisOrdem || [],
      delayMs: delayMs || 2500,
      criadoPor: 'admin',
      corretorUserId: corretorUserId || null,
      usarContatoIdBotao: !!usarContatoIdBotao,
      phoneNumberId: phoneNumberId || null
    });

    // Contato cujo telefone já tem conta cadastrada na plataforma — não faz
    // sentido mandar campanha de aquisição de conta pra quem já é usuário.
    // Comparação por sufixo de 8 dígitos (mesmo padrão já usado no checkPro
    // de bloqueados), já que telefone/celular de usuarios nem sempre tem o
    // DDI 55 salvo do mesmo jeito que a planilha normalizada.
    const _telsCadastrados = new Set();
    (_cacheUsuarios || []).forEach(u => {
      const t1 = String(u.telefone || '').replace(/\D/g, '').slice(-8);
      const t2 = String(u.celular || '').replace(/\D/g, '').slice(-8);
      if (t1) _telsCadastrados.add(t1);
      if (t2) _telsCadastrados.add(t2);
    });
    const jaCadastradosSet = new Set(contatos.filter(c => _telsCadastrados.has(c.telefone.slice(-8))).map(c => c.telefone));

    const { optout, jaEnviados, jaCadastrados } = await inserirContatos(campanhaId, contatos, jaCadastradosSet, !!ignorarHistorico);

    const { dispararWorkerDisparo } = require('./services/workerDispatch');
    dispararWorkerDisparo(campanhaId);

    res.json({ ok: true, campanhaId, optout, jaEnviados, jaCadastrados, numerosInvalidos });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});
// Precisa vir ANTES de /admin/disparos/:id, senão o Express trata "optout"
// como se fosse o :id da campanha.
app.get('/admin/disparos/optout', authAdmin, async (req, res) => {
  try {
    const { listarOptoutCompleto } = require('./services/salvarDisparo');
    const lista = await listarOptoutCompleto().catch(()=>[]);
    const _escHtmlOpt = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const _origemLabel = { whatsapp_botao_nao_interesse: 'Clicou "Não tenho interesse"', whatsapp_botao_nao_tenho: 'Clicou "Não tenho imóvel"' };
    const linhas = lista.map(o => `
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px">${_escHtmlOpt(o.nome || '—')}</td>
        <td style="padding:8px">${_escHtmlOpt(o.telefone)}</td>
        <td style="padding:8px;font-size:12px;color:#6b7280">${_escHtmlOpt(_origemLabel[o.origem] || o.origem || '—')}</td>
        <td style="padding:8px;font-size:11px;color:#6b7280">${new Date(o.criado_em).toLocaleString('pt-BR')}</td>
      </tr>`).join('') || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#6b7280">Ninguém descadastrou ainda.</td></tr>';
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opt-out — Disparos WhatsApp</title>
    <style>body{font-family:Arial,sans-serif;margin:0;padding:0}
    ${_adminShellCss()}
    .admin-content{max-width:800px}
    h1{color:#FF385C;font-size:20px}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}
    th{text-align:left;padding:8px;background:#f3f4f6;font-size:11px;text-transform:uppercase;color:#6b7280}
    .aviso{font-size:12px;color:#6b7280;margin-top:8px}
    </style></head><body>
    <div class="admin-app">
    ${_adminSidebarHtml('optout')}
    <main class="admin-content">
    <h1>🚫 Quem descadastrou (${lista.length})</h1>
    <p class="aviso">Esses telefones são pulados automaticamente em qualquer campanha nova, e qualquer envio pendente que ainda existisse pra eles em campanha já criada foi cancelado na hora do clique.</p>
    <table><tr><th>Nome</th><th>Telefone</th><th>Como descadastrou</th><th>Quando</th></tr>${linhas}</table>
    </main>
    </div>
    </body></html>`);
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.get('/admin/disparos/:id', authAdmin, async (req, res) => {
  try {
    const { buscarCampanha } = require('./services/salvarDisparo');
    const c = await buscarCampanha(req.params.id);
    if (!c) return res.status(404).send('Campanha não encontrada');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${c.nome_campanha} — Disparos WhatsApp</title>
    <style>body{font-family:Arial,sans-serif;margin:0;padding:0}
    ${_adminShellCss()}
    .admin-content{max-width:960px}
    h1{color:#FF385C;font-size:20px}
    button{background:#FF385C;color:#fff;padding:10px 20px;border:none;border-radius:6px;cursor:pointer;font-size:13px;margin:4px 4px 4px 0}
    button.sec{background:#6b7280}
    .box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0}
    .green{color:#16a34a}.red{color:#dc2626}.gray{color:#6b7280}
    .stat{display:inline-block;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 20px;margin:6px 6px 6px 0;text-align:center;min-width:80px}
    .stat strong{display:block;font-size:22px;color:#FF385C}
    .barra-wrap{background:#e5e7eb;border-radius:20px;height:16px;overflow:hidden;margin:10px 0}
    .barra{background:#16a34a;height:100%;transition:width .3s}
    table{width:100%;border-collapse:collapse;font-size:12.5px}
    th{text-align:left;padding:8px;background:#f3f4f6;font-size:11px;text-transform:uppercase;color:#6b7280}
    td{padding:8px;border-bottom:1px solid #f3f4f6}
    input,select{padding:6px;border:1px solid #ddd;border-radius:6px}
    </style></head>
    <body>
    <div class="admin-app">
    ${_adminSidebarHtml('disparos')}
    <main class="admin-content">
    <a href="/admin/disparos" style="color:#6b7280;text-decoration:none;font-size:12px">← Disparos WhatsApp</a>
    <h1>${c.nome_campanha}</h1>
    <p class="gray">Template: <b>${c.template_nome}</b> (${c.template_idioma}) — criada em ${new Date(c.criado_em).toLocaleString('pt-BR')}</p>
    <p><a href="/admin/whatsapp-cloud?campanhaId=${c.id}" style="font-size:12px;color:#FF385C;font-weight:600;text-decoration:none">💬 Ver inbox dessa campanha →</a></p>

    <div class="box">
      <div id="stats">⏳ Carregando...</div>
      <div class="barra-wrap"><div class="barra" id="barra" style="width:0%"></div></div>
      <div id="statusTxt" class="gray"></div>
      <button class="sec" id="btnPausar" onclick="pausar()" style="display:none">⏸ Pausar</button>
      <button id="btnRetomar" onclick="retomar()" style="display:none">▶ Retomar</button>
    </div>

    <div class="box">
      <h3>➕ Adicionar mais contatos a essa campanha</h3>
      <p class="gray">Sobe outra planilha (não precisa ser a mesma coluna de telefone) — os contatos novos entram na fila dessa campanha e o disparo continua de onde parou.</p>
      <input type="file" id="arquivoMais" accept=".csv,.xlsx,.xls">
      <button onclick="carregarMais()">📥 Carregar planilha</button>
      <div id="config-mais" style="display:none;margin-top:10px">
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-top:6px">Coluna com o telefone</label>
        <select id="colTelefoneMais"></select>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-top:6px">Coluna com o nome (opcional)</label>
        <select id="colNomeMais"><option value="">—</option></select>
        <button onclick="confirmarMais()" style="margin-top:8px">Adicionar à campanha</button>
      </div>
      <div id="resultado-mais" style="margin-top:8px"></div>
    </div>

    <div class="box">
      <h3>📋 Contatos</h3>
      <div style="margin-bottom:8px">
        <input type="text" id="busca" placeholder="Buscar por nome ou telefone..." style="width:260px;display:inline-block" oninput="buscar()">
        <select id="filtro-status" onchange="buscar()" style="width:150px;display:inline-block;margin-left:8px">
          <option value="">Todos os status</option>
          <option value="pendente">Pendentes</option>
          <option value="enviando">Travado em envio (revisar)</option>
          <option value="enviado">Enviados</option>
          <option value="erro">Erros</option>
          <option value="optout">Opt-out</option>
          <option value="ja_enviado">Já enviado antes</option>
          <option value="ja_cadastrado">Já tinha conta (pulado)</option>
          <option value="cadastrou">Quem cadastrou (a qualquer momento)</option>
        </select>
      </div>
      <div id="tabela-contatos">⏳ Carregando...</div>
      <div id="paginacao" style="margin-top:8px"></div>
    </div>

    <script>
    const campanhaId = '${c.id}';
    let _pagina = 1;

    async function atualizarStatus(){
      const r = await fetch('/admin/disparos/'+campanhaId+'/status');
      const d = await r.json();
      if(!d.ok) return;
      const camp = d.campanha;
      const ent = d.entrega || {};
      const pct = camp.total_contatos>0 ? Math.round(((camp.enviados+camp.erros)/camp.total_contatos)*100) : 0;
      document.getElementById('stats').innerHTML =
        '<div class="stat"><strong>'+camp.total_contatos+'</strong>Total</div>' +
        '<div class="stat"><strong class="green">'+camp.enviados+'</strong>Aceitos pela Meta</div>' +
        '<div class="stat"><strong class="red">'+camp.erros+'</strong>Erros</div>' +
        '<div class="stat"><strong>'+pct+'%</strong>Progresso</div>' +
        '<div class="stat"><strong class="green">'+(ent.delivered||0)+'</strong>Entregues</div>' +
        '<div class="stat"><strong class="green">'+(ent.read||0)+'</strong>Lidos</div>' +
        '<div class="stat"><strong class="red">'+(ent.failed||0)+'</strong>Falharam de vdd</div>';
      document.getElementById('barra').style.width = pct+'%';
      document.getElementById('statusTxt').innerHTML = 'Status: ' + camp.status + (camp.erro_geral ? ' — ' + camp.erro_geral : '') +
        '<br><span style="font-size:11px">⚠️ "Aceitos pela Meta" só confirma que a Meta recebeu o pedido de envio — "Entregues"/"Lidos" é que confirmam que chegou de verdade (chega com alguns segundos/minutos de atraso).</span>';
      document.getElementById('btnPausar').style.display = camp.status==='enviando' ? 'inline-block' : 'none';
      document.getElementById('btnRetomar').style.display = camp.status==='pausado' ? 'inline-block' : 'none';
      setTimeout(atualizarStatus, 4000);
    }
    atualizarStatus();

    async function pausar(){
      await fetch('/admin/disparos/'+campanhaId+'/pausar', { method:'POST' });
      setTimeout(atualizarStatus, 500);
    }
    async function retomar(){
      await fetch('/admin/disparos/'+campanhaId+'/retomar', { method:'POST' });
      setTimeout(atualizarStatus, 500);
    }

    let _arquivoMaisPath = '', _colunasMais = [];
    async function carregarMais(){
      const f = document.getElementById('arquivoMais').files[0];
      if(!f){ alert('Selecione um arquivo'); return; }
      document.getElementById('resultado-mais').innerHTML = '<p>⏳ Lendo planilha...</p>';
      const fd = new FormData(); fd.append('arquivo', f);
      const r = await fetch('/admin/disparos/preview-planilha', { method:'POST', body: fd });
      const d = await r.json();
      if(!d.ok){ document.getElementById('resultado-mais').innerHTML = '<p class="red">Erro: '+d.erro+'</p>'; return; }
      _colunasMais = d.colunas; _arquivoMaisPath = d.arquivo;
      document.getElementById('resultado-mais').innerHTML = '<p class="green">✅ '+d.totalLinhas+' linhas encontradas.</p>';
      const selTel = document.getElementById('colTelefoneMais');
      const selNome = document.getElementById('colNomeMais');
      selTel.innerHTML = _colunasMais.map(c=>'<option value="'+c+'">'+c+'</option>').join('');
      selNome.innerHTML = '<option value="">—</option>' + _colunasMais.map(c=>'<option value="'+c+'">'+c+'</option>').join('');
      const achar = (padroes) => _colunasMais.find(c => padroes.some(p => c.toLowerCase().includes(p)));
      const colTelSugerida = achar(['telefone','celular','whatsapp','fone','phone']);
      const colNomeSugerida = achar(['nome','razao','razão','empresa','name']);
      if(colTelSugerida) selTel.value = colTelSugerida;
      if(colNomeSugerida) selNome.value = colNomeSugerida;
      document.getElementById('config-mais').style.display = 'block';
    }
    async function confirmarMais(){
      if(!_arquivoMaisPath) return;
      const body = { arquivo: _arquivoMaisPath, mapeamento: { telefone: document.getElementById('colTelefoneMais').value, nome: document.getElementById('colNomeMais').value } };
      document.getElementById('resultado-mais').innerHTML = '<p>⏳ Adicionando...</p>';
      const r = await fetch('/admin/disparos/'+campanhaId+'/adicionar-contatos', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const d = await r.json();
      if(!d.ok){ document.getElementById('resultado-mais').innerHTML = '<p class="red">Erro: '+(d.erro||'')+(d.numerosInvalidos?' ('+d.numerosInvalidos+' inválido(s))':'')+'</p>'; return; }
      let avisos = [d.inseridos+' contato(s) adicionado(s)'];
      if(d.numerosInvalidos) avisos.push(d.numerosInvalidos+' removido(s) por número inválido');
      if(d.optout) avisos.push(d.optout+' pulado(s) por opt-out');
      if(d.jaEnviados) avisos.push(d.jaEnviados+' pulado(s) por já terem recebido antes');
      if(d.jaCadastrados) avisos.push(d.jaCadastrados+' pulado(s) por já ter conta');
      document.getElementById('resultado-mais').innerHTML = '<p class="green">✅ '+avisos.join(', ')+'</p>';
      document.getElementById('config-mais').style.display = 'none';
      document.getElementById('arquivoMais').value = '';
      atualizarStatus(); buscar();
    }

    async function buscar(p){
      _pagina = p || 1;
      const q = document.getElementById('busca').value;
      const s = document.getElementById('filtro-status').value;
      const r = await fetch('/admin/disparos/'+campanhaId+'/contatos?pagina='+_pagina+'&q='+encodeURIComponent(q)+'&status='+s);
      const d = await r.json();
      if(!d.ok){ document.getElementById('tabela-contatos').innerHTML='<p class="red">Erro ao carregar</p>'; return; }
      const entregaLabel = { sent:'✈️ enviado', delivered:'✅ entregue', read:'👁️ lido', failed:'❌ falhou' };
      let html = '<table><tr><th>Nome</th><th>Telefone</th><th>Status</th><th>Entrega</th><th>Cadastrou</th><th>Erro</th><th>Enviado em</th></tr>';
      for(const ct of d.contatos){
        const cor = ct.status==='enviado'?'#16a34a':ct.status==='erro'?'#dc2626':ct.status==='enviando'?'#dc2626':(ct.status==='ja_enviado'||ct.status==='ja_cadastrado')?'#6b7280':'#f59e0b';
        const entregaTxt = ct.status!=='enviado' ? '—' : (entregaLabel[ct.status_entrega] || '⏳ aguardando');
        const cadastrouTxt = ct.cadastrou ? '<span style="color:#16a34a;font-weight:600">Sim</span>' : '<span style="color:#9ca3af">Não</span>';
        html += '<tr><td>'+(ct.nome||'—')+'</td><td>'+ct.telefone+'</td><td style="color:'+cor+'">'+ct.status+'</td><td style="font-size:11px">'+entregaTxt+'</td><td style="font-size:11px">'+cadastrouTxt+'</td><td style="color:#dc2626;font-size:11px">'+(ct.erro||'')+'</td><td style="color:#6b7280;font-size:11px">'+(ct.enviado_em?new Date(ct.enviado_em).toLocaleString('pt-BR'):'—')+'</td></tr>';
      }
      html += '</table>';
      document.getElementById('tabela-contatos').innerHTML = html;
      let pag = '';
      if(_pagina > 1) pag += '<button class="sec" onclick="buscar('+(_pagina-1)+')">← Anterior</button> ';
      pag += '<span class="gray">Página '+_pagina+' — '+d.total+' contatos</span> ';
      if(d.contatos.length === 50) pag += '<button class="sec" onclick="buscar('+(_pagina+1)+')">Próximo →</button>';
      document.getElementById('paginacao').innerHTML = pag;
    }
    buscar();
    setInterval(() => buscar(_pagina), 8000);
    </script>
    </main>
    </div>
    </body></html>`);
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

app.post('/admin/disparos/:id/adicionar-contatos', authAdmin, express.json(), async (req, res) => {
  try {
    const { arquivo, mapeamento } = req.body;
    if (!mapeamento || !mapeamento.telefone) return res.json({ ok: false, erro: 'Mapeie a coluna de telefone' });
    const { buscarCampanha, inserirContatos, atualizarCampanha } = require('./services/salvarDisparo');
    const campanha = await buscarCampanha(req.params.id);
    if (!campanha) return res.json({ ok: false, erro: 'Campanha não encontrada' });

    const { linhas } = _lerPlanilhaDisparo(arquivo);
    const { contatos, numerosInvalidos } = _prepararContatosDisparo(linhas, mapeamento);
    if (!contatos.length) return res.json({ ok: false, erro: 'Nenhum contato com telefone válido na planilha', numerosInvalidos });

    const _telsCadastrados = new Set();
    (_cacheUsuarios || []).forEach(u => {
      const t1 = String(u.telefone || '').replace(/\D/g, '').slice(-8);
      const t2 = String(u.celular || '').replace(/\D/g, '').slice(-8);
      if (t1) _telsCadastrados.add(t1);
      if (t2) _telsCadastrados.add(t2);
    });
    const jaCadastradosSet = new Set(contatos.filter(c => _telsCadastrados.has(c.telefone.slice(-8))).map(c => c.telefone));

    const { inseridos, optout, jaEnviados, jaCadastrados } = await inserirContatos(req.params.id, contatos, jaCadastradosSet);

    // Se a campanha já tinha parado (concluída, pausada ou com erro geral),
    // relança o worker — senão os contatos novos ficam pendentes pra sempre
    // sem ninguém processando a fila.
    if (['concluido', 'pausado', 'erro'].includes(campanha.status)) {
      const { dispararWorkerDisparo } = require('./services/workerDispatch');
      await atualizarCampanha(req.params.id, { pausado: false, status: 'enviando', erro_geral: null });
      dispararWorkerDisparo(req.params.id);
    }

    res.json({ ok: true, inseridos, optout, jaEnviados, jaCadastrados, numerosInvalidos });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.get('/admin/disparos/:id/status', authAdmin, async (req, res) => {
  try {
    const { buscarCampanha, statsEntrega } = require('./services/salvarDisparo');
    const campanha = await buscarCampanha(req.params.id);
    if (!campanha) return res.json({ ok: false, erro: 'Campanha não encontrada' });
    const entrega = await statsEntrega(req.params.id).catch(()=>({}));
    res.json({ ok: true, campanha, entrega });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/admin/disparos/:id/pausar', authAdmin, async (req, res) => {
  try {
    const { atualizarCampanha } = require('./services/salvarDisparo');
    await atualizarCampanha(req.params.id, { pausado: true });
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.post('/admin/disparos/:id/retomar', authAdmin, async (req, res) => {
  try {
    const { atualizarCampanha } = require('./services/salvarDisparo');
    const { dispararWorkerDisparo } = require('./services/workerDispatch');
    await atualizarCampanha(req.params.id, { pausado: false, status: 'enviando' });
    dispararWorkerDisparo(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

app.get('/admin/disparos/:id/contatos', authAdmin, async (req, res) => {
  try {
    const { listarContatos } = require('./services/salvarDisparo');
    const pagina = parseInt(req.query.pagina) || 1;
    const { contatos, total } = await listarContatos(req.params.id, { pagina, status: req.query.status || '', q: req.query.q || '' });
    res.json({ ok: true, contatos, total });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});
// ── FIM DISPAROS WHATSAPP ──────────────────────────────────────────────────────

// ── JOB_RESUMO_EMAIL — envia resumo da conta a cada 15 dias ──────────────────
const _agendarResumoEmail = () => {
  const agora = new Date();
  const proximo = new Date(agora);
  proximo.setDate(proximo.getDate() + (agora.getHours() >= 9 ? 15 : 0));
  proximo.setHours(9, 0, 0, 0);
  const msAte = proximo - agora;
  setTimeout(async () => {
    try {
      const { enviarEmailResumo } = require('./services/emailResumo');
      await enviarEmailResumo();
    } catch(e) { console.error('[JOB RESUMO EMAIL]', e.message); }
    setInterval(async () => {
      try {
        const { enviarEmailResumo } = require('./services/emailResumo');
        await enviarEmailResumo();
      } catch(e) { console.error('[JOB RESUMO EMAIL]', e.message); }
    }, 15 * 24 * 3600 * 1000);
  }, msAte);
  console.log('[JOB RESUMO EMAIL] agendado para:', proximo.toLocaleString('pt-BR'));
};
_agendarResumoEmail();
// ── FIM JOB_RESUMO_EMAIL ─────────────────────────────────────────────────────

// ── JOB_EMAIL_INDICACAO — envia link de indicação a cada 15 dias ─────────────
const _agendarEmailIndicacao = () => {
  const agora = new Date();
  const proximo = new Date(agora);
  proximo.setDate(proximo.getDate() + (agora.getHours() >= 9 ? 15 : 0));
  proximo.setHours(9, 0, 0, 0);
  const msAte = proximo - agora;
  setTimeout(async () => {
    try {
      const { enviarEmailIndicacao } = require('./services/emailIndicacao');
      await enviarEmailIndicacao();
    } catch(e) { console.error('[JOB EMAIL INDICACAO]', e.message); }
    setInterval(async () => {
      try {
        const { enviarEmailIndicacao } = require('./services/emailIndicacao');
        await enviarEmailIndicacao();
      } catch(e) { console.error('[JOB EMAIL INDICACAO]', e.message); }
    }, 15 * 24 * 3600 * 1000);
  }, msAte);
  console.log('[JOB EMAIL INDICACAO] agendado para:', proximo.toLocaleString('pt-BR'));
};
_agendarEmailIndicacao();
// ── FIM JOB_EMAIL_INDICACAO ───────────────────────────────────────────────────

// ── CAPTAÇÃO ─────────────────────────────────────────────────────────────────
app.get('/app/captacao', auth, async (req, res) => {
  try {
    const { query: _qCap } = require('./services/db');
    const uid = req.session.user.codigoUsuario || req.session.user.id;
    const { rows } = await _qCap(`
      SELECT id, nome, telefone, whatsapp, email, dados, perfil_ia, criado_em
      FROM leads 
      WHERE user_id=$1 
      AND (
        (dados IS NOT NULL AND dados->>'temImovelParaCaptar' = 'true')
        OR tipo_lead = 'cliente_vendedor'
      )
      ORDER BY criado_em DESC
    `, [uid]);
    // Para cada lead, buscar imóveis relacionados por telefone/email
    const leadsComImoveis = await Promise.all(rows.map(async (l) => { try {
      let tel = (l.telefone||l.whatsapp||'').replace(/\D/g,''); if(tel.startsWith('55') && tel.length>=12) tel = tel.slice(2);
      const email = (l.email||'').toLowerCase().trim();
      const conds = []; const pars = [uid];
      if(tel){ pars.push('%'+tel+'%'); conds.push(`proprietario->>'telefone' ILIKE $${pars.length} OR proprietario->>'celular' ILIKE $${pars.length}`); }
      if(email){ pars.push(email); conds.push(`proprietario->>'email' ILIKE $${pars.length}`); }
      let imoveis = [];
      if(conds.length){
        const { calcularPercentualPerfil: _cppCap } = require('./services/salvarImovel');
        const ir = await require('./services/db').query(`SELECT id,id_interno,titulo,tipo,bairro,cidade,estado,cep,endereco,valor_imovel,condominio,iptu,area_m2,quartos,suites,banheiros,vagas,descricao,fotos,proprietario,transacao,criado_em FROM imoveis WHERE (user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1) AND (${conds.join(' OR ')}) LIMIT 5`, pars);
        imoveis = ir.rows.map(im => ({ ...im, percentual: _cppCap(im) }));
      }
      return { ...l, imoveisRelacionados: imoveis };
      } catch(_eL){ return { ...l, imoveisRelacionados: [] }; }
    }));

    // Agrupa leads duplicadas (mesmo telefone) num card só — junta os imóveis
    // vinculados de todas elas. Não deduplica no banco, só na tela: cobre tanto
    // as duplicatas antigas (de antes do fix em /captar/iniciar) quanto
    // qualquer edge case futuro sem depender de limpeza manual.
    const _gruposTel = {};
    const _semTelGrupo = [];
    for (const l of leadsComImoveis) {
      let tel = (l.telefone||l.whatsapp||'').replace(/\D/g,''); if(tel.startsWith('55') && tel.length>=12) tel = tel.slice(2);
      if (!tel) { _semTelGrupo.push(l); continue; }
      if (!_gruposTel[tel]) _gruposTel[tel] = [];
      _gruposTel[tel].push(l);
    }
    const _nomeValido = n => !!(n && n.trim() && n.trim() !== 'Captação (em andamento)');
    const leadsAgrupados = [
      ...Object.values(_gruposTel).map(grupo => {
        const principal = grupo.reduce((melhor, atual) => {
          if (!melhor) return atual;
          if (_nomeValido(atual.nome) && !_nomeValido(melhor.nome)) return atual;
          if (_nomeValido(melhor.nome) && !_nomeValido(atual.nome)) return melhor;
          return new Date(atual.criado_em) > new Date(melhor.criado_em) ? atual : melhor;
        }, null);
        const emailMerge = principal.email || (grupo.find(g => g.email) || {}).email || '';
        const vistos = new Set();
        const imoveisUnicos = [];
        for (const g of grupo) {
          for (const im of (g.imoveisRelacionados || [])) {
            const idIm = im.id_interno || im.id;
            if (!vistos.has(idIm)) { vistos.add(idIm); imoveisUnicos.push(im); }
          }
        }
        return { ...principal, email: emailMerge, imoveisRelacionados: imoveisUnicos };
      }),
      ..._semTelGrupo
    ].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

    res.render('app-captacao', { user: req.session.user, leads: leadsAgrupados });
  } catch(e) {
    console.error('[captacao]', e.message);
    res.render('app-captacao', { user: req.session.user, leads: [] });
  }
});
// ── FIM CAPTACAO ──────────────────────────────────────────────────────────────

// ── CAPTAÇÃO PÚBLICA ──────────────────────────────────────────────────────────

// Link de rastreio da campanha em massa (services/campanhaCaptacao.js) — o
// botão do email aponta pra cá em vez de direto pro /captar/REN-G9K6, só pra
// registrar o clique antes de redirecionar. ?ce= (campanha envio) segue até
// /captar/iniciar/:userId pra também marcar "iniciou cadastro".
app.get('/captacao-campanha/click/:id', async (req, res) => {
  try {
    const { registrarClique, LINK_CAMPANHA } = require('./services/campanhaCaptacao');
    await registrarClique(req.params.id);
    res.redirect(LINK_CAMPANHA + '?ce=' + encodeURIComponent(req.params.id));
  } catch (e) {
    console.error('[captacao-campanha click]', e.message);
    res.redirect('https://matchimoveis.ia.br/captar/REN-G9K6');
  }
});

// Pixel de abertura (1x1 transparente) — embutido no email da campanha,
// carregado pelo cliente de email quando ela abre a mensagem.
const _PIXEL_1X1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
app.get('/captacao-campanha/open/:id', async (req, res) => {
  try {
    const { registrarAbertura } = require('./services/campanhaCaptacao');
    await registrarAbertura(req.params.id);
  } catch (e) { console.error('[captacao-campanha open]', e.message); }
  res.set('Content-Type', 'image/gif');
  res.send(_PIXEL_1X1);
});

app.get('/captar/:userId', async (req, res) => {
  // ?tel= vem do botão de link do disparo (planilha só tem telefone) — aceita com ou
  // sem DDI 55 e pré-preenche o campo "Seu celular" já no formato local que o form usa.
  let telPreenchido = String(req.query.tel || '').replace(/\D/g, '');
  if (telPreenchido.length >= 12 && telPreenchido.startsWith('55')) telPreenchido = telPreenchido.slice(2);
  const userId = _limparParamBotaoUrl(req.params.userId);

  // ?ce= vem do clique de rastreio da campanha em massa — segue até o form
  // pra marcar "iniciou cadastro" quando ela responder a 1ª pergunta.
  const campanhaEnvioId = String(req.query.ce || '').trim();

  // ?imovelId= vem do email "seu anúncio está pronto, revise" — carrega o imóvel
  // já cadastrado (e o dono é o mesmo userId da URL, senão ignora) pra pular a
  // tela 1 (já sabemos quem é/o que quer) e pré-preencher as telas seguintes com
  // o que já foi respondido, em vez do proprietário ter que digitar tudo de novo.
  let imovelExistente = null;
  const imovelIdQuery = String(req.query.imovelId || '').trim();
  if (imovelIdQuery) {
    try {
      const { query: _qCapExist } = require('./services/db');
      const { rowToImovel: _rtiCapExist } = require('./services/salvarImovel');
      const { rows } = await _qCapExist('SELECT * FROM imoveis WHERE id=$1 LIMIT 1', [imovelIdQuery]);
      if (rows[0]) {
        const im = _rtiCapExist(rows[0]);
        const donoImovel = im.userId || im.user_id || im.usuarioId || im.codigoUsuario;
        if (donoImovel === userId) imovelExistente = im;
      }
    } catch (e) { console.error('[captar imovelExistente]', e.message); }
  }

  res.render('captar-imovel', { leadId: '', userId, telPreenchido, imovelExistente, campanhaEnvioId });
});

app.post('/captar/iniciar/:userId', express.json(), async (req, res) => {
  try {
    const { transacao, nome, celular, email, campanhaEnvioId } = req.body;
    const userId = req.params.userId;
    const { salvarLead: _slIni } = require('./services/salvarLead');
    const { salvarImovel: _siIni } = require('./services/salvarImovel');
    const { query: _qCI } = require('./services/db');

    if (campanhaEnvioId) {
      try { const { registrarInicioCadastro } = require('./services/campanhaCaptacao'); await registrarInicioCadastro(campanhaEnvioId); } catch (e) {}
    }

    // Evita duplicar lead+imóvel quando a mesma pessoa reabre o link de captação
    // (reclique no WhatsApp, F5 no meio do fluxo etc) — reaproveita o par
    // lead+imóvel já existente pro mesmo corretor+telefone+transação em vez de
    // criar outro do zero. Sem isso, cada reabertura virava uma linha nova em
    // /app/captacao com imóvel vazio duplicado (bug reportado ago/2026).
    const _tel8Ini = String(celular || '').replace(/\D/g, '').slice(-8);
    if (_tel8Ini) {
      const { rows: _leadExistente } = await _qCI(
        `SELECT id FROM leads WHERE user_id=$1 AND tipo_lead='cliente_vendedor' AND (telefone LIKE $2 OR whatsapp LIKE $2) AND dados->>'transacaoCaptar' = $3 ORDER BY criado_em DESC LIMIT 1`,
        [userId, '%'+_tel8Ini, transacao || '']
      );
      if (_leadExistente[0]) {
        const _leadIdReuso = _leadExistente[0].id;
        const { rows: _imovelExistente } = await _qCI(
          `SELECT id FROM imoveis WHERE (user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1) AND dados->>'leadOrigemId' = $2 ORDER BY criado_em DESC LIMIT 1`,
          [userId, _leadIdReuso]
        );
        await _qCI(`UPDATE leads SET nome=COALESCE(NULLIF($1,''),nome), email=COALESCE(NULLIF($2,''),email) WHERE id=$3`, [nome || '', email || '', _leadIdReuso]);
        return res.json({ ok: true, leadId: _leadIdReuso, imovelId: _imovelExistente[0]?.id || '' });
      }
    }

    const leadId = Date.now().toString();
    await _slIni({
      id: leadId,
      nome: nome || 'Captação (em andamento)',
      telefone: celular || '', whatsapp: celular || '',
      email: email || '',
      user_id: userId, userId, codigoUsuario: userId,
      origem: 'captacao_link',
      status: 'captacao',
      faseFunil: 'captacao', fase_funil: 'captacao',
      tipoLead: 'cliente_vendedor', tipo_lead: 'cliente_vendedor',
      dados: { temImovelParaCaptar: true, transacaoCaptar: transacao, iniciadoEm: new Date().toISOString() },
      _lote: true
    });
    // Coloca temImovelParaCaptar/transacaoCaptar no nível certo do JSONB
    // (salvarLead() aninha o objeto "dados" passado dentro da própria coluna dados)
    const _dadosIniciar = JSON.stringify({ temImovelParaCaptar: true, transacaoCaptar: transacao, iniciadoEm: new Date().toISOString() });
    await _qCI(`UPDATE leads SET dados = dados || $1::jsonb WHERE id=$2`, [_dadosIniciar, leadId]);

    // Já cadastra o imóvel automaticamente — mesmo registro que o corretor criaria manualmente
    // em /app/cadastro, só que preenchido aos poucos pelo próprio proprietário aqui na captação.
    // Fica como "nao_publicado" (mesmo status inicial do cadastro manual) até o corretor revisar.
    let imovelId = '';
    if (transacao === 'venda' || transacao === 'aluguel') {
      const _corretorCap = (_cacheUsuarios || []).find(u => (u.codigoUsuario||u.codigo_usuario||u.id) === userId) || {};
      imovelId = 'MI-' + Date.now() + '-' + Math.random().toString(36).substr(2,6).toUpperCase();
      await _siIni({
        id: imovelId,
        idInterno: imovelId,
        codigoImovel: imovelId,
        transacao,
        status: 'nao_publicado',
        proprietario: { nome: nome||'', telefone: celular||'', celular: celular||'', email: email||'', status: 'vinculado' },
        user_id: userId, userId, usuarioId: userId, codigoUsuario: userId,
        usuarioNome: _corretorCap.nome || '',
        corretorId: userId, corretorNome: _corretorCap.nome || '', corretorEmail: _corretorCap.email || '', corretorTelefone: _corretorCap.celular || _corretorCap.telefone || '',
        source: 'captacao_publica', fonte: 'captacao_publica',
        urlPublica: '/imovel/' + imovelId,
        leadOrigemId: leadId
      });
      if (_cacheImoveis) _cacheImoveis.push({ id: imovelId, idInterno: imovelId, userId, usuarioId: userId, codigoUsuario: userId, transacao, status: 'nao_publicado' });
    }

    res.json({ ok: true, leadId, imovelId });
  } catch(e) {
    console.error('[captar/iniciar]', e.message);
    res.status(500).json({ ok: false });
  }
});

// Salva progressivamente os dados do imóvel conforme o proprietário avança nas telas
// da captação pública — cada tela manda o acumulado até ali, então não corre risco de
// zerar campo já preenchido em tela anterior.
app.post('/captar/imovel/:imovelId', express.json(), async (req, res) => {
  try {
    const { query: _qCIS } = require('./services/db');
    const { salvarImovel: _siSalvar, rowToImovel: _rtiSalvar, _geocodificarCep: _geoSalvar } = require('./services/salvarImovel');
    const imovelId = req.params.imovelId;
    const { tipo, cep, endereco, numero, complemento, bairro, cidade, estado, quartos, suites, banheiros, vagas, area_m2, valor_imovel, finalizar } = req.body;

    const { rows } = await _qCIS('SELECT * FROM imoveis WHERE id=$1 LIMIT 1', [imovelId]);
    if (!rows[0]) return res.json({ ok: false, error: 'Imóvel não encontrado' });
    const atual = _rtiSalvar(rows[0]);

    const atualizado = {
      ...atual,
      tipo: tipo || atual.tipo,
      cep: cep || atual.cep,
      endereco: endereco || atual.endereco,
      numero: numero || atual.numero,
      complemento: complemento || atual.complemento,
      bairro: bairro || atual.bairro,
      cidade: cidade || atual.cidade,
      estado: estado || atual.estado,
      quartos: quartos !== undefined ? (parseInt(quartos)||0) : atual.quartos,
      suites: suites !== undefined ? (parseInt(suites)||0) : atual.suites,
      banheiros: banheiros !== undefined ? (parseInt(banheiros)||0) : atual.banheiros,
      vagas: vagas !== undefined ? (parseInt(vagas)||0) : atual.vagas,
      area_m2: area_m2 !== undefined ? (parseFloat(area_m2)||0) : atual.area_m2,
      valor_imovel: valor_imovel !== undefined ? (parseFloat(valor_imovel)||0) : atual.valor_imovel,
    };
    atualizado.titulo = atualizado.titulo || [atualizado.tipo, atualizado.bairro].filter(Boolean).join(' em ');
    await _siSalvar(atualizado);
    if (cep) _geoSalvar(cep, imovelId).catch(()=>{});

    if (finalizar) {
      try {
        const { consumir: _consumirCad } = require('./services/creditos');
        _consumirCad(atualizado.userId || atualizado.user_id, 'cadastrar_imovel').catch(()=>{});
      } catch(e) {}
      try {
        const _corretorFin = (_cacheUsuarios || []).find(u => (u.codigoUsuario||u.codigo_usuario||u.id) === (atualizado.userId||atualizado.user_id)) || {};
        const _nomeProp = (atualizado.proprietario && atualizado.proprietario.nome) || 'Proprietário';
        const _msgFin = `📋 *Novo imóvel captado!*\n\n*${_nomeProp}* cadastrou um imóvel para *${atualizado.transacao}*!\n\n🏠 ${atualizado.tipo||''} — ${atualizado.bairro||''}, ${atualizado.cidade||''}\n💰 R$ ${atualizado.valor_imovel||'A definir'}\n\nComplete fotos e descrição: https://matchimoveis.ia.br/app/imovel/${imovelId}/editar`;
        const _EK = process.env.EVOLUTION_API_KEY || 'match2025evolution';
        const _EU = process.env.EVOLUTION_API_URL || 'https://match-evolution-api.onrender.com';
        if (_corretorFin.whatsappInstance && (_corretorFin.whatsappNumero||_corretorFin.celular||_corretorFin.telefone)) {
          fetch(`${_EU}/message/sendText/${_corretorFin.whatsappInstance}`, {
            method:'POST', headers:{'Content-Type':'application/json','apikey':_EK},
            body: JSON.stringify({ number: '55'+(_corretorFin.whatsappNumero||_corretorFin.celular||_corretorFin.telefone||'').replace(/\D/g,'').replace(/^55/,''), text:_msgFin })
          }).catch(()=>{});
        }
        if (_corretorFin.email) {
          const { enviarEmail } = require('./services/email');
          enviarEmail({ para: _corretorFin.email, assunto: '📋 Novo imóvel captado — MatchImóveis', html: '<div style="font-family:Arial,sans-serif;padding:32px"><h2 style="color:#FF385C">📋 Novo imóvel captado!</h2><p><strong>'+_nomeProp+'</strong> cadastrou um imóvel para '+atualizado.transacao+'</p><p>🏠 '+(atualizado.tipo||'')+' | 📍 '+(atualizado.bairro||'')+', '+(atualizado.cidade||'')+'</p><a href="https://matchimoveis.ia.br/app/imovel/'+imovelId+'/editar" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Completar cadastro →</a></div>', texto: _msgFin }).catch(()=>{});
        }
        criarNotificacaoService({
          id: Date.now().toString() + '_captacao_imovel',
          tipo: 'captacao',
          titulo: 'Novo imóvel captado',
          mensagem: _nomeProp + ' cadastrou um imóvel para ' + atualizado.transacao + ' (' + (atualizado.tipo||'') + ' — ' + (atualizado.bairro||'sem bairro') + ')',
          usuarioId: atualizado.userId || atualizado.user_id,
          imovelId,
          lida: false,
          criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
        });
      } catch(e) { console.error('[captar/imovel] notificação:', e.message); }

      // Email pro proprietário (a própria lead) com o link público do anúncio já
      // criado + link pra revisar/completar caso tenha faltado algum campo — troca
      // o email genérico de convite ("cadastre seu imóvel") que não fazia sentido
      // depois que ela já está cadastrando de verdade.
      try {
        const _emailProp = (atualizado.proprietario && atualizado.proprietario.email) || '';
        if (_emailProp) {
          const { enviarEmail: _envRevisao } = require('./services/email');
          const { calcularPercentualPerfil: _cppRevisao } = require('./services/salvarImovel');
          const _uidCap = atualizado.userId || atualizado.user_id;
          const _telProp = (atualizado.proprietario && (atualizado.proprietario.celular || atualizado.proprietario.telefone)) || '';
          const _linkVerAnuncio = 'https://matchimoveis.ia.br/imovel/' + imovelId;
          const _linkEditar = 'https://matchimoveis.ia.br/captar/' + _uidCap + '?imovelId=' + encodeURIComponent(imovelId) + (_telProp ? ('&tel=' + encodeURIComponent(_telProp)) : '');
          const _nomePropEmail = (atualizado.proprietario && atualizado.proprietario.nome) || '';
          const _pctRevisao = _cppRevisao(atualizado);
          const _corPct = _pctRevisao >= 67 ? '#16a34a' : _pctRevisao >= 34 ? '#f59e0b' : '#dc2626';
          _envRevisao({
            para: _emailProp,
            assunto: '📋 Seu anúncio está pronto (' + _pctRevisao + '% preenchido) — dá uma olhada',
            html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><h2 style="color:#FF385C">Olá, ' + _nomePropEmail + '!</h2><p>Recebemos os dados do seu imóvel e o anúncio já está no ar. Dá uma olhada em como ficou:</p><p style="margin:16px 0"><span style="display:inline-block;background:' + _corPct + ';color:#fff;padding:6px 14px;border-radius:20px;font-weight:bold;font-size:14px">Seu imóvel está ' + _pctRevisao + '% preenchido</span></p><a href="' + _linkVerAnuncio + '" style="display:inline-block;margin-top:12px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Ver meu anúncio →</a><p style="margin-top:20px">Se faltou alguma informação ou você quiser completar/corrigir algo, é só continuar o cadastro por aqui:</p><a href="' + _linkEditar + '" style="display:inline-block;margin-top:12px;padding:12px 24px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Revisar / completar cadastro →</a></div>',
            texto: 'Seu imóvel está ' + _pctRevisao + '% preenchido. Seu anúncio: ' + _linkVerAnuncio + ' | Revisar/completar: ' + _linkEditar
          }).then(()=>console.log('[EMAIL REVISAO ANUNCIO] enviado para:', _emailProp)).catch((e)=>console.error('[EMAIL REVISAO ANUNCIO] falhou:', e.message));
        }
      } catch(e) { console.error('[captar/imovel] email revisao:', e.message); }
    }

    res.json({ ok: true });
  } catch(e) {
    console.error('[captar/imovel]', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// Upload de fotos pelo próprio proprietário, última etapa da captação pública —
// reaproveita o multer/whitelist de extensão já usado em /app/imovel/:id/upload-foto
// (uploadImoveis, definido mais acima). Sem auth (é o fluxo público), mas escopado
// ao imovelId gerado em /captar/iniciar (timestamp+random, não sequencial).
app.post('/captar/foto/:imovelId', uploadImoveis.array('fotos', 10), async (req, res) => {
  try {
    const imovelId = req.params.imovelId;
    const files = req.files || [];
    if (!files.length) return res.json({ ok: false, erro: 'Nenhuma foto enviada' });
    const _completoCapFoto = await _buscarImovelCompleto(imovelId);
    if (!_completoCapFoto) return res.json({ ok: false, erro: 'Imóvel não encontrado' });
    const novasUrls = files.map(f => '/data-uploads/' + f.filename);
    const _imovelCompletoCapFoto = { ..._completoCapFoto, fotos: [...(_completoCapFoto.fotos || []), ...novasUrls] };
    await salvarImovel(_imovelCompletoCapFoto);
    if (_cacheImoveis) { const _ci = _cacheImoveis.findIndex(i => i.id === imovelId); if (_ci >= 0) _cacheImoveis[_ci] = _capFotosCache({ ..._imovelCompletoCapFoto }); }
    res.json({ ok: true, total: _imovelCompletoCapFoto.fotos.length });
  } catch(e) {
    console.error('[captar/foto]', e.message);
    res.json({ ok: false, erro: e.message });
  }
});

app.post('/captar/nao/:leadId', express.json(), async (req, res) => {
  try {
    const { query: _qCN } = require('./services/db');
    await _qCN("UPDATE leads SET dados = dados || '{\"temImovelParaCaptar\":false}'::jsonb WHERE id=$1", [req.params.leadId]);
  } catch(e){}
  res.json({ ok: true });
});

app.post('/captar/salvar/:userId', express.json(), async (req, res) => {
  try {
    const { query: _qCS } = require('./services/db');
    const { transacao, tipo, endereco, valor, nome, celular, leadId: leadIdExistente } = req.body;
    const userId = req.params.userId;
    const { salvarLead: _slCap } = require('./services/salvarLead');
    const idParaSalvar = leadIdExistente || Date.now().toString();
    console.log('[CAPTAR] salvando lead para userId:', userId, 'leadId:', idParaSalvar);
    const novaLead = await _slCap({ id: idParaSalvar, nome: nome||'Captação', telefone: celular||'', whatsapp: celular||'', user_id: userId, userId, codigoUsuario: userId, origem: 'captacao_link', status: 'captacao', faseFunil: 'captacao', fase_funil: 'captacao', tipoLead: 'cliente_vendedor', tipo_lead: 'cliente_vendedor', dados: { temImovelParaCaptar: true, transacaoCaptar: transacao }, _lote: true });
    console.log('[CAPTAR] novaLead:', JSON.stringify(novaLead?.id));
    const leadId = novaLead?.id || idParaSalvar;
    const dadosCaptar = JSON.stringify({
      temImovelParaCaptar: true,
      tipoImovelCaptar: tipo,
      transacaoCaptar: transacao,
      enderecoCaptar: endereco,
      valorCaptar: valor,
      captadoEm: new Date().toISOString()
    });
    await _qCS(`UPDATE leads SET dados = dados || $1::jsonb, tipo_lead='cliente_vendedor' WHERE id=$2`, [dadosCaptar, leadId]);
    
    // Notifica corretor
    const { rows } = await _qCS(`
      SELECT l.nome, l.telefone, u.nome as corretor_nome, u.whatsapp_instance, u.whatsapp_numero, u.email
      FROM leads l JOIN usuarios u ON u.codigo_usuario=l.user_id OR u.id=l.user_id
      WHERE l.id=$1 LIMIT 1
    `, [leadId]);

    if (rows[0]) {
      const r = rows[0];
      const _msg = `📋 *Nova captação!*\n\n*${r.nome||'Lead'}* tem um imóvel para *${transacao}*!\n\n🏠 Tipo: ${tipo}\n📍 ${endereco}\n💰 R$ ${valor||'A definir'}\n\nAcesse: https://matchimoveis.ia.br/app/captacao`;
      const _EK = process.env.EVOLUTION_API_KEY || 'match2025evolution';
      const _EU = process.env.EVOLUTION_API_URL || 'https://match-evolution-api.onrender.com';
      if (r.whatsapp_instance && r.whatsapp_numero) {
        fetch(`${_EU}/message/sendText/${r.whatsapp_instance}`, {
          method:'POST', headers:{'Content-Type':'application/json','apikey':_EK},
          body: JSON.stringify({number:'55'+r.whatsapp_numero.replace(/\D/g,'').replace(/^55/,''), text:_msg})
        }).catch(()=>{});
      }
      if (r.email) {
        try {
          const { enviarEmail } = require('./services/email');
          await enviarEmail({ para: r.email, assunto: '📋 Nova captação de imóvel!', html: '<div style="font-family:Arial,sans-serif;padding:32px"><h2 style="color:#FF385C">📋 Nova captação!</h2><p><strong>'+r.nome+'</strong> tem um imóvel para '+transacao+'</p><p>🏠 '+tipo+' | 📍 '+endereco+'</p><a href="https://matchimoveis.ia.br/app/captacao" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Ver captação →</a></div>', texto: _msg });
        } catch(_eC){}
      }
      try {
        criarNotificacaoService({
          id: Date.now().toString() + '_captacao',
          tipo: 'captacao',
          titulo: 'Nova captação de imóvel',
          mensagem: (r.nome||'Lead') + ' tem um imóvel para ' + transacao + ' (' + tipo + ' — ' + (endereco||'sem endereço') + ')',
          usuarioId: userId,
          leadId,
          lida: false,
          criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
        });
      } catch(e) { console.error('[notif captacao]', e.message); }
    }
  } catch(e){ console.error('[captar]', e.message); }
  res.json({ ok: true });
});
// ── FIM CAPTAÇÃO PÚBLICA ──────────────────────────────────────────────────────

app.post('/app/captacao/marcar/:leadId', auth, express.json(), async (req, res) => {
  try {
    const { query: _qCM } = require('./services/db');
    const uid = req.session.user.codigoUsuario || req.session.user.id;
    // Marcar como captado
    await _qCM(
      `UPDATE leads SET dados = dados || $1::jsonb, tipo_lead='cliente_vendedor' WHERE id=$2`,
      [JSON.stringify({ imovelCaptadoId: 'captado', captadoEm: new Date().toISOString(), temImovelParaCaptar: true }), req.params.leadId]
    );
    // Buscar imóveis do lead por telefone/email
    const leadR = await _qCM('SELECT nome, telefone, whatsapp, email FROM leads WHERE id=$1', [req.params.leadId]);
    const lead = leadR.rows[0];
    if(!lead) return res.json({ ok: true, imoveis: [] });
    let tel = (lead.telefone||lead.whatsapp||'').replace(/\D/g,''); if(tel.startsWith('55') && tel.length>=12) tel = tel.slice(2);
    const email = (lead.email||'').toLowerCase().trim();
    const conditions = [];
    const params = [uid];
    if(tel){ params.push('%'+tel+'%'); conditions.push(`proprietario->>'telefone' ILIKE $${params.length} OR proprietario->>'celular' ILIKE $${params.length}`); }
    if(email){ params.push(email); conditions.push(`proprietario->>'email' ILIKE $${params.length}`); }
    let imoveis = [];
    if(conditions.length > 0){
      const { calcularPercentualPerfil: _cppMarcar } = require('./services/salvarImovel');
      const imR = await _qCM(
        `SELECT id, id_interno, titulo, tipo, bairro, cidade, estado, cep, endereco, valor_imovel, condominio, iptu, area_m2, quartos, suites, banheiros, vagas, descricao, fotos, proprietario, transacao FROM imoveis WHERE (user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1) AND status='ativo' AND (${conditions.join(' OR ')}) LIMIT 10`,
        params
      );
      imoveis = imR.rows.map(im => ({ ...im, percentual: _cppMarcar(im) }));
    }
    res.json({ ok: true, imoveis });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

// Exclusão em /app/captacao é sempre por imóvel — a lead nunca é apagada por
// aqui, mesmo com mais de um imóvel vinculado (exclui só o escolhido, a lead
// sempre permanece).
app.post('/app/captacao/imovel/:imovelId/excluir', auth, async (req, res) => {
  try {
    const { query: _qEI } = require('./services/db');
    const uid = req.session.user.id || req.session.user.codigoUsuario;
    await _qEI(
      `DELETE FROM imoveis WHERE id=$1 AND (user_id=$2 OR usuario_id=$2 OR codigo_usuario=$2 OR corretor_id=$2)`,
      [req.params.imovelId, uid]
    );
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});
