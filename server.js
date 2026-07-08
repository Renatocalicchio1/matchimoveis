
// Cache QR codes em memória (Evolution v2.2.3 envia via webhook)
const _qrCache = {};
require("dotenv").config();
const express = require('express');
const bcrypt = require('bcrypt');
const cerebroApp = require("./cerebro/index");
const cerebroNLP = require("./services/cerebro-nlp");



const fs = require('fs');
const centralOperacional = require("./services/centralOperacional");
const { consumir, adicionarCreditos, temSaldo, saldo: saldoCreditos } = require("./services/creditos");
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

function dataFile(name){
  return path.join(DATA_DIR, name);
}

function dataPath(file){
  return dataFile(file);
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
// Força no-cache em rotas autenticadas
app.use('/app', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
const UPLOADS_STATIC_DIR = process.env.RENDER
  ? '/opt/render/project/src/data/uploads/imoveis'
  : path.join(__dirname, 'public', 'uploads', 'imoveis');
app.use('/data-uploads', express.static(UPLOADS_STATIC_DIR));

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
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));
// ── SEGURANÇA: BLOQUEIA ACOES QUANDO SALDO ZERADO ───────────────────────────
const _rotasLivresSaldo = ['/app/perfil', '/app/perfil/senha', '/app/coins', '/app/notificacoes', '/pagamento', '/sair', '/logout', '/app/assistente'];
app.use('/app', async (req, res, next) => {
  if (req.method !== 'POST') return next();
  if (!req.session || !req.session.user) return next();
  const _rota = req.path;
  if (_rotasLivresSaldo.some(r => _rota.startsWith(r.replace('/app','')))) return next();
  try {
    const { saldo: _getSaldo } = require('./services/creditos');
    const _uid = req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id;
    const _saldo = await _getSaldo(_uid);
    if (_saldo <= 0) {
      if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        return res.status(402).json({ ok: false, erro: 'Conta pausada. Adicione créditos para continuar.', pausada: true });
      }
      return res.redirect('/app/coins?erro=saldo_zerado');
    }
  } catch(e) { /* silencioso — não bloqueia em caso de erro */ }
  next();
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

    console.log('BODY LEAD INTERESSE =>');
    console.log(JSON.stringify(req.body,null,2));
    return ((_cacheImoveis || []));
  } catch {
    return [];
  }
}

// ====== ROTAS ======


// ═══════════════════════════════════════════════════════

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
  
  res.render('admin-cerebro', { modulos, totalBase: base.total });
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
function authAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
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

app.post('/admin/login', (req, res) => {
  const { usuario, senha } = req.body;
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (usuario === adminUser && senha === adminPass) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  res.redirect('/admin/login?error=1');
});

app.get('/admin/logout', (req, res) => {
  req.session.admin = false;
  res.redirect('/admin/login');
});

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
    const _freeMem   = Math.round(os.freemem()/1024/1024);
    const _totalMem  = Math.round(os.totalmem()/1024/1024);
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
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Status — MatchImóveis</title>' +
      '<meta http-equiv="refresh" content="30">' +
      '<style>body{font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:20px;color:#111;max-width:1100px}' +
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
      'a.back{display:inline-block;margin-bottom:20px;color:#FF385C;font-weight:700;text-decoration:none;font-size:14px}' +
      '.alerta{border-radius:14px;padding:16px 20px;margin-bottom:20px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:10px}' +
      '</style></head><body>' +
      '<a href="/admin" class="back">← Voltar ao Admin</a>' +
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

      '</body></html>';

    res.send(_html);
  } catch(e) { res.send('Erro: ' + e.message); }
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
            <a href="/admin/deletar/${u.codigo_usuario}" onclick="return confirm('Deletar ${u.nome}?')" style="font-size:10px;color:#e8404a;text-decoration:none;background:#fef2f2;padding:2px 6px;border-radius:4px">Deletar</a>
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
          <a href="/admin/deletar/${u.codigo_usuario}" onclick="return confirm('Deletar ${u.nome}?')" style="font-size:11px;color:#e8404a;text-decoration:none;">Deletar</a>
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
.top{background:#fff;border-bottom:1px solid #e5e5e3;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;}
.top h1{font-size:16px;font-weight:700;}
.top a{font-size:12px;color:#888;text-decoration:none;}
.wrap{padding:24px;}
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
<div class="top">
  <h1>Admin · MatchImóveis</h1>
  <div style="display:flex;gap:16px;align-items:center">
    <a href="/admin/status" style="font-size:12px;background:#6366f1;color:#fff;padding:6px 14px;border-radius:8px;text-decoration:none;font-weight:600">🖥️ Status do Sistema</a> <a href="/admin/campanha" style="font-size:12px;background:#FF385C;color:#fff;padding:6px 14px;border-radius:8px;text-decoration:none;font-weight:600">📧 Campanha Email</a>
    <a href="https://match-evolution-api.onrender.com/manager" target="_blank" style="font-size:12px;background:#25D366;color:#fff;padding:6px 14px;border-radius:8px;text-decoration:none;font-weight:600">📱 Painel WhatsApp</a>
    <a href="/admin/cerebro" style="font-size:12px;background:#FF385C;color:#fff;padding:6px 14px;border-radius:8px;text-decoration:none;font-weight:600">🧠 Cérebro do Assistente</a>
    <a href="/admin/quintoandar-solicitacoes" style="font-size:12px;background:#00a86b;color:#fff;padding:6px 14px;border-radius:8px;text-decoration:none;font-weight:600">🏢 Solicitações QA</a>
    <a href="/admin/logout" style="font-size:12px;color:#888;text-decoration:none">Sair</a>
  </div>
</div>
<div class="wrap">
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
</div>
</body>
</html>`);
  } catch(e) {
    res.send('Erro: ' + e.message);
  }
});


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
    const _imoveisUser = await _qQAP("SELECT estado, cidade, cep, endereco, numero, proprietario FROM imoveis WHERE user_id=$1 AND status='ativo' AND transacao='venda'", [uid]);
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
    await _qQL("UPDATE solicitacoes_quintoandar SET atendido=TRUE WHERE user_id=$1", [req.params.codigo]);
    await _qQL("UPDATE usuarios SET autoriza_quintoandar=TRUE WHERE codigo_usuario=$1", [req.params.codigo]);
    if (_cacheUsuarios) { const _uIdx = _cacheUsuarios.findIndex(u=>u.codigoUsuario===req.params.codigo||u.codigo_usuario===req.params.codigo); if(_uIdx>=0) _cacheUsuarios[_uIdx].autoriza_quintoandar = true; }
    res.redirect('/admin?qa_liberado=1');
  } catch(e) { res.redirect('/admin?err='+encodeURIComponent(e.message)); }
});

app.get('/admin/quintoandar-solicitacoes', authAdmin, async (req, res) => {
  try {
    const { query: _qQAS } = require('./services/db');
    await _qQAS(`CREATE TABLE IF NOT EXISTS solicitacoes_quintoandar (
      id SERIAL PRIMARY KEY, user_id TEXT, nome TEXT, telefone TEXT, email TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW(), atendido BOOLEAN DEFAULT FALSE)`);
    const r = await _qQAS("SELECT * FROM solicitacoes_quintoandar ORDER BY criado_em DESC");
    let html = `<html><head><meta charset="UTF-8"><title>Solicitações QuintoAndar</title>
    <style>body{font-family:Arial;padding:20px;max-width:900px;margin:0 auto}table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd;font-size:13px}th{background:#f3f4f6}tr:hover{background:#fafafa}</style></head>
    <body><h2 style="margin-bottom:16px">Solicitações de acesso QuintoAndar (${r.rows.length})</h2>
    <table><tr><th>Data</th><th>Nome</th><th>Telefone</th><th>Email</th><th>Código</th><th>Status</th><th>Ação</th></tr>`;
    r.rows.forEach(row => {
      html += `<tr><td>${new Date(row.criado_em).toLocaleString('pt-BR')}</td><td>${row.nome||''}</td><td>${row.telefone||''}</td><td>${row.email||''}</td><td>${row.user_id||''}</td><td>${row.atendido?'<span style="color:#16a34a;font-weight:600">✅ Liberado</span>':'<span style="color:#f59e0b;font-weight:600">⏳ Aguardando</span>'}</td><td>${!row.atendido?'<a href="/admin/quintoandar-liberar/'+row.user_id+'" style="background:#00a86b;color:#fff;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">Liberar</a>':'<span style="color:#9ca3af;font-size:12px">Já liberado</span>'}</td></tr>`;
    });
    html += '</table></body></html>';
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
    const ativos = todos.filter(im => im.status !== 'inativo' && im.status !== 'excluido' && im.fotos && im.fotos.length > 0);
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
        }
      } catch(e){ console.error('[webhook-global] erro setTimeout:', e.message); }
    }, 2000);
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
    // Atualizar cache e sessão
    const _novoSaldo = (await _q('SELECT match_coins FROM usuarios WHERE codigo_usuario=$1', [cod])).rows[0]?.match_coins || 0;
    if (_cacheUsuarios) {
      const _ci = _cacheUsuarios.findIndex(u => u.codigoUsuario === cod || u.codigo_usuario === cod);
      if (_ci >= 0) {
        _cacheUsuarios[_ci].matchCoins = _novoSaldo;
        if (!_cacheUsuarios[_ci].matchCoinsTransacoes) _cacheUsuarios[_ci].matchCoinsTransacoes = [];
        _cacheUsuarios[_ci].matchCoinsTransacoes.push({
          data: new Date().toISOString(),
          motivo: op === 'adicionar' ? 'recarga manual' : 'debito manual',
          quantidade: op === 'adicionar' ? qtd : -qtd,
          saldoApos: _novoSaldo
        });
      }
    }
    res.redirect('/admin');
  } catch(e) { res.send('Erro: ' + e.message); }
});

app.get('/admin/deletar/:codigo', authAdmin, async (req, res) => {
  try {
    const { query: _q } = require('./services/db');
    const cod = req.params.codigo;
    await _q('DELETE FROM usuarios WHERE codigo_usuario=$1', [cod]);
    await _q('DELETE FROM imoveis WHERE user_id=$1', [cod]);
    await _q('DELETE FROM leads WHERE user_id=$1', [cod]);
    await _q('DELETE FROM visitas WHERE user_id=$1', [cod]);
    await _q('DELETE FROM notificacoes WHERE user_id=$1', [cod]);
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
<head><meta charset="utf-8"><title>${u.nome} · Admin</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',sans-serif;background:#f8f8f7;font-size:13px;}
.top{background:#fff;border-bottom:1px solid #e5e5e3;padding:14px 24px;display:flex;align-items:center;gap:16px;}
.top a{font-size:12px;color:#888;text-decoration:none;}.top h1{font-size:16px;font-weight:700;}
.wrap{padding:24px;max-width:600px;}.card{background:#fff;border:1px solid #e5e5e3;border-radius:12px;padding:20px;margin-bottom:16px;}
h2{font-size:14px;font-weight:600;margin-bottom:14px;}label{display:block;font-size:11px;font-weight:500;color:#888;margin-bottom:4px;}
input{width:100%;border:1px solid #e5e5e3;border-radius:8px;padding:9px 12px;font-size:13px;margin-bottom:12px;outline:none;}
input:focus{border-color:#111;}button{background:#111;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer;}
</style></head>
<body>
<div class="top"><a href="/admin">← Voltar</a><h1>${u.nome}</h1></div>
<div class="wrap">
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
app.get('/health',(req,res)=>res.json({ok:true,ts:new Date().toISOString()}));
// Redirect onrender.com -> matchimoveis.ia.br para feeds XML
app.use('/feed-xml', (req, res, next) => {
  const host = req.headers.host || '';
  if (host.includes('onrender.com')) {
    return res.redirect(301, 'https://matchimoveis.ia.br/feed-xml' + req.path);
  }
  next();
});

app.get('/feed-xml/:portal/:token', async (req, res) => {
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
app.get('/', (req,res)=>{
  if (req.session && req.session.user) {
    const ua = req.headers['user-agent'] || '';
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
    return res.redirect(isMobile ? '/app/feed' : '/app/leads');
  }
  res.render('landing', { error: req.query.erro || req.query.error || null });
});

app.get('/entrar', (req,res)=>{ res.redirect('/'); //
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




app.post('/app/importar', upload.any(), async (req, res) => {
  const xmlUrl = req.body.xmlUrl;

  if (!xmlUrl) {
    return res.json({ ok:false, erro:'Informe a URL do XML' });
  }

  const _importUserId = req.body.userId || req.query.userId || (req.session.user ? req.session.user.id : '');
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
      // Adiciona ao xml-feeds.json se não existir
      try {
        const _fp = dataPath('xml-feeds.json');
        const _feeds = fs.existsSync(_fp) ? JSON.parse(fs.readFileSync(_fp,'utf8')) : [];
        const _url = _importXmlUrl;
        const _uid = users[idx].id;
        const _feedTotal = typeof _totalIm !== 'undefined' ? _totalIm : 0;
        salvarFeedService({ userId: _uid, url: _url, lastSyncAt: new Date().toISOString(), total: _feedTotal, tipo: 'importado' }).then(() => console.log('[xml-feed] salvo:', _uid, _feedTotal)).catch(e=>console.error('[xml-feed]', e.message));
      } catch(e) {}
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


app.post('/app/importar-proprietarios', upload.any(), async (req, res) => {
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

app.post('/app/leads', upload.any(), async (req, res) => {
  try {
    const file = (req.files && req.files[0]) || req.file;
    if (!file) return res.send("Envie o arquivo");


    const { execSync } = require("child_process");

    const userId = req.session.user ? (req.session.user.codigoUsuario || req.session.user.codigo_usuario || req.session.user.id) : ""; const { criarJob: _cjL2 } = require('./services/importJobs');
    const { dispararWorkerLeads: _dwL2 } = require('./services/workerDispatch');
    const _jobIdL2 = await _cjL2('csv', userId, file.path);
    _dwL2(_jobIdL2, file.path, userId);
    // Cobra importar_lead — diferenca de leads antes e depois
    try {
      const { query: _qD } = require('./services/db');
      const _antesR = await _qD('SELECT COUNT(*) as total FROM leads WHERE user_id=$1', [_userId]);
      const _antes = parseInt(_antesR.rows[0]?.total || 0);
      const _depoisR = await _qD('SELECT COUNT(*) as total FROM leads WHERE user_id=$1', [_userId]);
      const _depois = parseInt(_depoisR.rows[0]?.total || 0);
      const _novas = Math.max(0, _depois - _antes);
      const { consumir: _consumirImp } = require('./services/creditos');
      for (let _ii = 0; _ii < _novas; _ii++) { await _consumirImp(_userId, 'importar_lead'); }
      console.log('[creditos] importar_lead:', _novas, 'leads novas debitadas');
    } catch(e) { console.error('[creditos-import]', e.message); }

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
app.post("/app/leads/manual", auth, checarSaldo("Cadastrar lead manual", 10), async (req, res) => {
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

app.post('/app/portais', async (req,res)=>{
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
  const portal = req.params.portal;
  const { execSync } = require('child_process');

  execSync(`node exportXML.js ${portal}`);

  res.sendFile(dataPath(`feed-${portal}.xml`));
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
    const novo = {
      id: _codigoNovo,
      nome: req.body.nome,
      telefone,
      celular: telefone,
      email: req.body.email || '',
      tipo: req.body.tipoConta,
      ativo: true,
      codigoUsuario: _codigoNovo,
      senha: req.body.senha || '',
      matchCoins: 1000,
      matchCoinsTotal: 1000,
      matchCoinsBonusInicial: 1000
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

        // Onboarding — 3 mensagens para o novo corretor
        const _telCorretor = '55' + (novo.telefone||novo.celular||'').replace(/\D/g,'');
        const _passo1 = `Olá, ${novo.nome}! 👋 Seja bem-vindo ao *MatchImóveis*!\n\n*📋 Passo 1 — Cadastre seus imóveis*\n\nVá em *Menu → Cadastrar* e importe um XML padrão VivaReal/ZAP ou cadastre seus imóveis manualmente.\n\nQuanto mais imóveis cadastrados, mais matches você gera! 🏠\n\n🔗 Acesse o sistema: https://matchimoveis.ia.br`;
        const _passo2 = `*📱 Passo 2 — Ative seu WhatsApp*\n\nVá em *Menu → Perfil* e conecte seu número do WhatsApp.\n\nO MatchImóveis usa seu WhatsApp para enviar vitrines, confirmar visitas e se comunicar com seus leads automaticamente. ⚡\n\n💡 *DICA IMPORTANTE*\n👉 No *menu lateral esquerdo* da plataforma você encontra o *🤖 Assistente IA* — disponível 24h para responder qualquer dúvida sobre o sistema na hora!\n\n🔗 https://matchimoveis.ia.br`;
        const _passo3 = `*🎯 Passo 3 — Adicione seus leads*\n\nVá em *Menu → Leads* e importe sua planilha de leads, cadastre manualmente ou ative os portais para receber leads automaticamente.\n\nPronto! O sistema começa a gerar matches e enviar vitrines para você. 🚀\n\n━━━━━━━━━━━━━━━━━━\n🤖 *ASSISTENTE IA*\nNo *menu lateral esquerdo* da plataforma, clique em *Assistente* — ele tira todas as suas dúvidas em segundos, a qualquer hora!\n━━━━━━━━━━━━━━━━━━\n\n🔗 https://matchimoveis.ia.br`;

        await fetch('https://match-evolution-api.onrender.com/message/sendText/match-suporte', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': 'match2025evolution' },
          body: JSON.stringify({ number: _telCorretor, text: _passo1 + '\n\n' + _passo2 + '\n\n' + _passo3 })
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
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px"><h2 style="color:#FF385C">Olá, ${novo.nome}! 👋</h2><p>Seja bem-vindo ao <strong>MatchImóveis</strong>.</p><p>📋 <strong>Passo 1</strong> — Cadastre seus imóveis em Menu → Cadastrar</p><p>📱 <strong>Passo 2</strong> — Ative seu WhatsApp em Menu → Perfil</p><p>🎯 <strong>Passo 3</strong> — Adicione seus leads em Menu → Leads</p><a href="https://matchimoveis.ia.br" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Acessar o sistema →</a></div>`,
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
  try { const { query: _qLD } = require('./services/db'); const r = await _qLD('SELECT *, dados, follow_ups, vitrine_enviada, vitrine_enviada_em, matches, matches_auto, id, nome, telefone, whatsapp, contato, user_id, codigo_usuario, score, temperatura, fase_funil, perfil_ia, status, tipo_lead, historico, timeline, eventos, comportamento, mapa_intencao FROM leads ORDER BY criado_em DESC'); return r.rows.map(r=>({ ...(r.dados||{}), id: r.id, nome: r.nome, telefone: r.telefone, whatsapp: r.whatsapp, contato: r.contato, userId: r.user_id, codigoUsuario: r.codigo_usuario, followUps: r.follow_ups||[], vitrineEnviada: r.vitrine_enviada, vitrineEnviadaEm: r.vitrine_enviada_em, matches: r.matches||[], matchesAuto: r.matches_auto||[], score: r.score || (r.dados||{}).score || 0, temperatura: r.temperatura || (r.dados||{}).temperatura || 'frio', faseFunil: r.fase_funil || (r.dados||{}).faseFunil || 'novo', status: r.status || (r.dados||{}).status || 'novo', perfilIA: r.perfil_ia || (r.dados||{}).perfilIA || {}, mapaIntencao: r.mapa_intencao || (r.dados||{}).mapaIntencao || null, comportamento: r.comportamento || (r.dados||{}).comportamento || null, historico: r.historico || (r.dados||{}).historico || [], timeline: r.timeline || (r.dados||{}).timeline || [], eventos: r.eventos || (r.dados||{}).eventos || [] })); } catch(e) { console.error('[lerLeadsData]',e.message); return []; }
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

  lead.matches = (lead.matchesBase && lead.matchesBase.length ? lead.matchesBase : null) ||
               (lead.matchesAuto && lead.matchesAuto.length ? lead.matchesAuto : null) ||
               (lead.matches && lead.matches.length ? lead.matches : null) || [];
  
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
        consumir(_v.userId || _v.corretorId || '', 'confirmacao_auto').catch(()=>{});
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
        consumir(_v.userId || _v.corretorId || '', 'notificacao_prop').catch(()=>{});
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
  consumir(_uid || '', 'notificacao_prop').catch(()=>{});
  res.render('proprietario-confirmado', { resposta, visita: visitas[idx] });
})



app.get('/dev/diagnostico-leads', auth, (req,res)=>{
  const user = req.session.user;
  const todos = (_cacheLeads || []);
  const uid = user.id;
  const filtrados = filtrarPorUsuario(todos, user);
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


app.post('/app-leads/:idx/match', async (req,res)=>{
  const usuario = req.session.user || { id:'antonio-11975720750', nome:'Antonio Eduardo', celular:'11975720750', telefone:'11975720750' };

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
let _cacheLeads = null;
let _cacheLeadsAt = 0;
async function _recarregarLeads() {
  try {
    const { lerLeads: _llSvc } = require('./services/salvarLead');
    _cacheLeads = await _llSvc();
    _cacheLeadsAt = Date.now();
  } catch(e) {
    if (!_cacheLeads) _cacheLeads = (_cacheLeads || []);
  }
}
_recarregarLeads();
setInterval(_recarregarLeads, 15000);


// Cache imóveis em memória
let _cacheImoveis = null;
async function _recarregarImoveis() {
  try {
    _cacheImoveis = await lerImoveisService();
  } catch(e) {
    if (!_cacheImoveis) _cacheImoveis = (_cacheImoveis || []);
  }
}
_recarregarImoveis();
setInterval(_recarregarImoveis, 15000);
// Cache usuários
let _cacheUsuarios = null;
async function _recarregarUsuarios() {
  try {
    const { lerUsuarios: _luSvc } = require('./services/salvarUsuario');
    _cacheUsuarios = await _luSvc();
  } catch(e) {
    if (!_cacheUsuarios) _cacheUsuarios = fs.existsSync(dataPath('users.json')) ? (_cacheUsuarios || []) : [];
  }
}
_recarregarUsuarios();
setInterval(_recarregarUsuarios, 15000); // atualiza a cada 15s

function lerLeads(user) {
  const uid = user && (user.id || user);
  const todos = _cacheLeads || ((_cacheLeads || []));
  const filtradas = filtrarPorUsuario(todos, user);
  if (!uid) return filtradas;
  return filtradas.filter(l => !(l.deletadoPor && l.deletadoPor.includes(uid)));
}
let _cacheVisitas = null;
async function _recarregarVisitas() {
  try {
    const { lerVisitas: _lvSvc } = require('./services/salvarVisita');
    _cacheVisitas = await _lvSvc();
  } catch(e) {
    if (!_cacheVisitas) _cacheVisitas = (_cacheVisitas || []);
  }
}
_recarregarVisitas();
setInterval(_recarregarVisitas, 15000);

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
  const leadsArr = filtrarPorUsuario(Array.isArray(todosLeads) ? todosLeads : (todosLeads.results || []), user);
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
      const urlPublica = i.urlPublica || i.url || i.link || (id ? `http://localhost:3000/imovel/${id}` : '');

      return {
        'ID imóvel': id,
        'Tipo': i.tipo || '',
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
  const _perPage = 60;
  const _page = Math.max(1, parseInt(req.query.page) || 1);
  const _totalImoveis = imoveis.length;
  const _totalPages = Math.ceil(_totalImoveis / _perPage);
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
  // Monta dados para filtros em cascata
  const estadosSet = new Set();
  const cidadesPorEstado = {};
  const bairrosPorCidade = {};
  imoveis.forEach(i => {
    const est = (i.estado||'').toUpperCase().trim();
    const cid = (i.cidade||'').trim();
    const bai = (i.bairro||'').trim();
    if (est) estadosSet.add(est);
    if (est && cid) {
      if (!cidadesPorEstado[est]) cidadesPorEstado[est] = new Set();
      cidadesPorEstado[est].add(cid);
    }
    if (cid && bai) {
      if (!bairrosPorCidade[cid]) bairrosPorCidade[cid] = new Set();
      bairrosPorCidade[cid].add(bai);
    }
  });
  const estados = [...estadosSet].sort();
  const cidades = {};
  Object.keys(cidadesPorEstado).forEach(e => { cidades[e] = [...cidadesPorEstado[e]].sort(); });
  const bairros = {};
  Object.keys(bairrosPorCidade).forEach(ci => { bairros[ci] = [...bairrosPorCidade[ci]].sort(); });
  // Filtros do servidor
  const _fEstado = (req.query.estado||'').trim().toUpperCase();
  const _fCidade = (req.query.cidade||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const _fBairro = (req.query.bairro||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const _fBusca  = (req.query.busca||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const _norm = s => (s||'').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  if (_fEstado) imoveis = imoveis.filter(i => _norm(i.estado) === _norm(_fEstado) || (i.estado||'').toUpperCase() === _fEstado);
  if (_fCidade) imoveis = imoveis.filter(i => _norm(i.cidade) === _fCidade);
  if (_fBairro) imoveis = imoveis.filter(i => _norm(i.bairro) === _fBairro);
  if (_fBusca)  imoveis = imoveis.filter(i => _norm(JSON.stringify(i)).includes(_fBusca));
  const _totalImoveisFiltrado = imoveis.length;
  const _totalPagesFiltrado = Math.ceil(_totalImoveisFiltrado / _perPage);
  const _temFiltro = _fEstado || _fCidade || _fBairro || _fBusca;
  imoveis = imoveis.slice((_page-1)*_perPage, _page*_perPage);
  res.render('app-imoveis', { user: req.session.user, imoveis, estados, cidades, bairros, qaIncompleto, rede: _rede, usersRede: _usersRede, page: _page, totalPages: _temFiltro ? _totalPagesFiltrado : _totalPages, totalImoveis: _temFiltro ? _totalImoveisFiltrado : _totalImoveis, filtros: { estado: _fEstado, cidade: _fCidade, bairro: _fBairro } });
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

app.get('/app/perfil', auth, async (req,res)=>{
  try {
    const { query: _qPerfil } = require('./services/db');
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
    const _imoveisUser = await _qPerfil("SELECT estado, cidade, cep, endereco, numero, proprietario FROM imoveis WHERE user_id=$1 AND status='ativo' AND transacao='venda'", [uid]);
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
    res.render('app-perfil', { user: req.session.user, qaCount: _totalQA, vendaCount: _totalVenda, qaIncompletos: _totalIncompletos, senhaErro: req.query.senhaErro||null, senhaSucesso: req.query.senhaSucesso||null });
  } catch(e) {
    res.render('app-perfil', { user: req.session.user, qaCount: 0, vendaCount: 0, senhaErro: null, senhaSucesso: null });
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

app.post('/app/perfil', auth, async (req,res)=>{
  const { atualizarUsuario: _auPerfil } = require('./services/salvarUsuario');
  const uid = String(req.session.user.id || '');
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
  res.redirect('/app/perfil');
});



app.post('/app/perfil/vitrine', auth, async (req,res)=>{
  const { atualizarUsuario: _auVitrine } = require('./services/salvarUsuario');
  const uid = String(req.session.user.id || '');
  const val = req.body.vitrineApenasPropriosImoveis === 'true';
  await _auVitrine(uid, { vitrineApenasPropriosImoveis: val }).catch(e=>console.error("[perfil/vitrine]",e.message));
  req.session.user = { ...req.session.user, vitrineApenasPropriosImoveis: val };
  res.redirect('/app/perfil');
});

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
    Area_min: 60,
    Area_max: 100,
    Valor_min: 300000,
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

app.get('/app/leads', auth, async (req,res)=>{
  const { lerLeads: _lerLeadsService } = require('./services/salvarLead');
  const raw = await _lerLeadsService(req.session.user.id);
  const data = Array.isArray(raw) ? raw : (raw.results || []);
  const _todasVisitas = (_cacheVisitas || []);
  const leads = filtrarPorUsuario(data, req.session.user)
    .filter(l => l.tipoLead !== 'corretor')
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
    const eventId = body.idEvento || body.eventId || body.eventoId || body.id || '';
    const _msgRaw = body.mensagem || body.message || body.txtMensagem || '';
    const mensagemLimpa = _msgRaw.replace(/https?:\/\/[^\s]+/g, '').replace(/¡[^!]+!/g, '').trim();
    const _phones = (body.phone || '').split('/');
    const telefone = (body.telefone || body.phoneNumber || _phones[_phones.length - 1] || body.txtTelefone || '').replace(/\D/g,'');
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
          await _atualizarIMOVELWEB(lead.id, { mapaIntencao: mapa, faseFunil: mapa.fase, temperatura: mapa.temperatura, perfilIA: _perfilFinalIW, bairro: _perfilFinalIW.bairro||'', cidade: _perfilFinalIW.cidade||'', estado: _perfilFinalIW.estado||'', tipo: _perfilFinalIW.tipo||'', tipo_operacao: _perfilFinalIW.intencao||'' });
          console.log('[WEBHOOK IMOVELWEB] mapa salvo | fase:', mapa.fase, '| temp:', mapa.temperatura);
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
    const telefone = (body.phoneNumber || (body.ddd||'') + (body.phone||'')).replace(/\D/g,'');
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
          await _atualizarGRUPOOLX(lead.id, { mapaIntencao: mapa, faseFunil: mapa.fase, temperatura: mapa.temperatura, perfilIA: _perfilFinalOLX, bairro: _perfilFinalOLX.bairro||'', cidade: _perfilFinalOLX.cidade||'', estado: _perfilFinalOLX.estado||'', tipo: _perfilFinalOLX.tipo||'', tipo_operacao: _perfilFinalOLX.intencao||'' });
          console.log('[WEBHOOK GRUPOOLX] mapa salvo | fase:', mapa.fase, '| temp:', mapa.temperatura);
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
    const telefone = (body.phoneNumber || (body.ddd||'') + (body.phone||'')).replace(/\D/g,'');
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
          await _atualizar123i(lead.id, { mapaIntencao: mapa, faseFunil: mapa.fase, temperatura: mapa.temperatura, perfilIA: _perfilFinal123, bairro: _perfilFinal123.bairro||'', cidade: _perfilFinal123.cidade||'', estado: _perfilFinal123.estado||'', tipo: _perfilFinal123.tipo||'', tipo_operacao: _perfilFinal123.intencao||'' });
          console.log('[WEBHOOK 123i] mapa salvo | fase:', mapa.fase, '| temp:', mapa.temperatura);
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
    const telefone = (body.phone || '').replace(/\D/g,'');
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
          await _atualizarCHAVES(lead.id, { mapaIntencao: mapa, faseFunil: mapa.fase, temperatura: mapa.temperatura, perfilIA: _perfilFinalCH, bairro: _perfilFinalCH.bairro||'', cidade: _perfilFinalCH.cidade||'', estado: _perfilFinalCH.estado||'', tipo: _perfilFinalCH.tipo||'', tipo_operacao: _perfilFinalCH.intencao||'' });
          console.log('[WEBHOOK CHAVES] mapa salvo | fase:', mapa.fase, '| temp:', mapa.temperatura);
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
  const { lat, lng, endereco } = req.body;
  const isJson = (req.headers['content-type']||'').includes('application/json');
  try {
    const { query: _qLoc } = require('./services/db');
    await _qLoc('UPDATE usuarios SET lat=$1, lng=$2, endereco=$3 WHERE id=$4', [parseFloat(lat), parseFloat(lng), endereco||'', req.session.user.id]);
    const users = (_cacheUsuarios || []);
    const idx = users.findIndex(u => u.id === req.session.user.id);
    if(idx >= 0) {
      users[idx].lat = parseFloat(lat);
      users[idx].lng = parseFloat(lng);
      users[idx].endereco = endereco || '';
      req.session.user = { ...req.session.user, ...users[idx] };
    }
  } catch(e) { console.error('[localizacao]', e.message); }
  if(isJson) return res.json({ok:true});
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

// INBOX WHATSAPP
app.get('/app/whatsapp', auth, async (req, res) => {
  const user = req.session.user;
  const { lerLeads: _llWA } = require('./services/salvarLead');
  const leadsFiltrados = await _llWA(user.id);
  res.render('app-whatsapp-inbox', { user, leads: leadsFiltrados, active: 'whatsapp', baseUrl: process.env.BASE_URL || 'http://localhost:3000' });
});


// ENVIAR MENSAGEM WHATSAPP pelo corretor
app.post('/app/lead/:id/whatsapp/enviar', auth, checarSaldo('Enviar vitrine WhatsApp', 20), async (req, res) => {
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

app.post(['/webhook/whatsapp', '/webhook/whatsapp/*'], async (req, res) => {
  try {
    const body = req.body;
    console.log('[WEBHOOK WA] body completo:', JSON.stringify(body).substring(0, 500));
    const event = body.event;
    const instance = body.instance;
    const data = body.data;

    
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
      console.log('[WEBHOOK WA] evento:', event, '| instancia:', instance);

    // Pré-aquece Evolution API em background
    const _EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
    const _EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
    fetch(`${_EVOLUTION_URL}/instance/fetchInstances`, {
      headers: { 'apikey': _EVOLUTION_KEY }
    }).catch(() => {});

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

    // Ignorar mensagens de grupos
    if (fromJid.includes('@g.us') || fromJid.includes('@broadcast')) {
      return res.status(200).json({ ok: true, ignorado: 'grupo' });
    }
    // Ignorar mensagens de grupos e broadcast
    if (fromJid.includes('@g.us') || fromJid.includes('@broadcast') || fromJid.includes('@newsletter')) {
      return res.status(200).json({ ok: true, ignorado: 'grupo' });
    }
    if (fromMe) return res.status(200).json({ ok: true, ignorado: 'fromMe' });
    if (!telefone || !texto) return res.status(200).json({ ok: true, ignorado: 'sem_telefone_ou_texto' });


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
      if (!_temPalavraImovel) {
        console.log('[WEBHOOK WA] filtro: mensagem sem palavras imobiliárias — ignorando:', telefone, '|', texto.substring(0,50));
        return;
      }
      // Não criar lead pelo WhatsApp se mensagem veio de portal
      if (texto.includes('imovelweb.com.br') || texto.includes('Quero ser contatado sobre este imóvel') || texto.includes('vivareal.com') || texto.includes('zapimoveis.com')) {
        console.log('[WEBHOOK WA] mensagem de portal detectada — ignorando criação de lead pelo WA:', telefone);
        return;
      }
      console.log('[WEBHOOK WA] lead nao encontrado — criando novo lead automatico:', telefone);
      // Cria lead novo automaticamente a partir do WhatsApp
      const novoLead = {
        id: Date.now().toString(),
        nome: pushName || telefone,
        telefone,
        whatsapp: telefone,
        origem: 'whatsapp',
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
        followUps: []
      };
      // Salva no PostgreSQL
      try {
        const { salvarLead: _salvarLeadPG } = require('./services/salvarLead');
        await _salvarLeadPG(novoLead);
        leadEncontrado = novoLead;
        console.log('[WEBHOOK WA] novo lead criado no PG:', telefone, '| id:', novoLead.id);
        // notificação sino — novo lead (conta quantas vezes o mesmo número entrou)
        try {
          const { lerLeads: _llNotif } = require('./services/salvarLead');
          const _todasLeads = await _llNotif();
          const _vezesEntrou = _todasLeads.filter(l => {
            const fone = (l.telefone||l.whatsapp||l.contato||'').replace(/\D/g,'');
            return fone.slice(-8) === telefone.slice(-8) && (l.userId||l.codigoUsuario) === _webhookUserId;
          }).length;
          const _titulo = _vezesEntrou > 1 ? 'Lead retornou (' + _vezesEntrou + 'ª vez)' : 'Novo lead chegou';
          const _msg = _vezesEntrou > 1
            ? (novoLead.nome||telefone) + ' entrou em contato novamente — é a ' + _vezesEntrou + 'ª vez que busca imóvel'
            : (novoLead.nome||telefone) + ' entrou em contato via WhatsApp';
          criarNotificacaoService({
            id: Date.now().toString(),
            tipo: 'novo_lead',
            titulo: _titulo,
            mensagem: _msg,
            usuarioId: _webhookUserId,
            leadId: novoLead.id,
            lida: false,
            criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
          });
        } catch(e) { console.error('[notif lead]', e.message); }
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
        consumir(_webhookUserId, 'ia_qualifica_lead').catch(function(){});
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
        consumir(leadAtualizado.userId || leadAtualizado.codigoUsuario, 'ia_responde_whatsapp').catch(()=>{});

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
        if((leadAtualizado.matchesAuto||[]).length>0) consumir(leadAtualizado.userId||leadAtualizado.corretorId, 'match_encontrado').catch(()=>{});


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

app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  // Inicia atualizacao automatica do XML a cada 12h
  try {
    const { iniciarScheduler } = require('./services/xmlScheduler'); iniciarScheduler();
    const { iniciarJobCreditos } = require('./services/jobCreditos'); iniciarJobCreditos();
    const { iniciarBackup } = require('./services/backup'); iniciarBackup();
    const { iniciarMonitor } = require('./services/monitor'); iniciarMonitor();
  } catch(e) {
    console.error('[server] Erro ao iniciar autoUpdateXML:', e.message);
  }
});

// ROTA DA TELA IMPORTAR LEADS
app.post('/process', upload.any(), async (req, res) => {
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
    visitasJSON: JSON.stringify(visitasHoje),
    leadsJSON: JSON.stringify(leadsAtivas),
    imoveisVisitaJSON: JSON.stringify(imoveisVisita),
    imoveisInteresseJSON: JSON.stringify(imoveisInteresse),
    proximaVisitaJSON: JSON.stringify(proximaVisita),
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
    imoveisJSON: JSON.stringify(filtrados),
    total: filtrados.length
  });
});

// ====== FEED REELS ======
// rota /feed removida — usar /app/feed

app.get('/api/imoveis', auth, async (req, res) => {
  const imoveis = await lerImoveis(req.session.user.id);

app.post('/imovel/:id/status', (req,res)=>{
  const fs=require('fs');
  const imoveis=((_cacheImoveis || []));
  const { status } = req.body;

  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id) || String(i.id) === String(req.params.id));
  if(idx>=0){
    imoveis[idx].status = status;
    salvarTodosImoveis(imoveis).catch(e=>console.error("[imoveis]",e.message));
  gerarXMLPortais();
  gerarXMLPortais();
  }

  res.json({ok:true});
});

app.post('/imovel/:id/status', (req,res)=>{
  const fs=require('fs');
  const imoveis=((_cacheImoveis || []));
  const { status } = req.body;

  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id));
  if(idx>=0){
    imoveis[idx].status = status;
    salvarTodosImoveis(imoveis).catch(e=>console.error("[imoveis]",e.message));
  }

  res.json({ok:true});
});
  res.json(imoveis.slice(0, 50));
});


// Cadastro manual de imóvel
const UPLOADS_IMOVEIS_DIR = process.env.RENDER
  ? '/opt/render/project/src/data/uploads/imoveis'
  : path.join(__dirname, 'public', 'uploads', 'imoveis');
if (!fs.existsSync(UPLOADS_IMOVEIS_DIR)) fs.mkdirSync(UPLOADS_IMOVEIS_DIR, { recursive: true });

const storageImoveis = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_IMOVEIS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = file.originalname.split('.').pop();
    cb(null, Date.now() + '-' + Math.floor(Math.random()*1000) + '.' + ext);
  }
});
const uploadImoveis = multer({ storage: storageImoveis });

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
    const { nome, celular, imovelId, imovelTitulo, leadId: leadIdOrigem, userId: userIdOrigem } = req.body;

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

    const leadPayload = {
      nome,
      contato: celular,
      telefone: celular,
      fonte: 'MatchImóveis',
      origem: 'pagina_externa_imovel', extractionStatus: 'ok',
      canal: 'WhatsApp',
      imovel_interesse: imovelId,
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
      url: 'http://localhost:3000/imovel/' + imovelId,

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

// Página pública do imóvel — sem login
app.get('/imovel/:id', (req, res) => {
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
    const pub = Object.assign({}, imovel);
    delete pub.proprietario;
    delete pub.proprietario_celular;
    delete pub.proprietario_email;
    // Busca dados da lead para preencher formulário
    let leadDados = { nome: '', telefone: '' };
    const _leadId = req.query.leadId || req.query.lid || '';
    if (_leadId) {
      const _leads = (_cacheLeads || []);
      const _lead = _leads.find(l => String(l.id) === String(_leadId));
      if (_lead) leadDados = { nome: _lead.nome||'', telefone: (_lead.telefone||_lead.whatsapp||'').replace(/\D/g,'').replace(/^55/,'') };
    }
    const _usuarioLogado = req.session && req.session.user ? req.session.user : null;
    const _compartilhador = (_uidLead && _uidLead !== _uid2) ? ((_cacheUsuarios||[]).find(u=>(u.id===_uidLead||u.codigoUsuario===_uidLead||u.codigo_usuario===_uidLead)) || null) : null;
    return res.render('imovel-publico', { imovel: pub, corretor, leadDados, temLeadId: !!_leadId, usuarioLogado: _usuarioLogado, userId: _uidLead, compartilhador: _compartilhador });
  }

  // Busca nos matches do QuintoAndar
  const leads = (_cacheLeads || []);
  let qaImovel = null;
  for (const lead of leads) {
    const matches = lead.matchesBase || [];
    const m = matches.find(m => m && (String(m.id_anuncio) === String(req.params.id) || String(m.id_anuncio_quintoandar) === String(req.params.id)));
    if (m) { qaImovel = m; break; }
  }

  if (!qaImovel) return res.status(404).send('Imóvel não encontrado');

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

  res.render('imovel-publico', { imovel: pub, corretor });
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

  salvarTodosLeads(leads).catch(e=>console.error("[leads]",e.message));

  const visitas = (_cacheVisitas || []);

  const visitasDaLead = visitas.filter(v =>
    String(v.leadId || v.lead_id || '') === String(lead.id) &&
    String(v.userId || v.codigoUsuario || '') === uid
  );

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
  res.render('app-lead-detalhe', { user: req.session.user, lead, visitasDaLead, matchesInternos, sugestoesCopiloto });
});
app.get('/app/imovel/:id', auth, (req, res) => {
  const imoveis = ((_cacheImoveis || []));
  const user = req.session.user;
  const imovel = imoveis.find(i => String(i.id) === String(req.params.id) || String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id));
  if (!imovel) return res.status(404).send('Imóvel não encontrado');
  
  // Oculta proprietário se não for admin nem corretor do imóvel
  const isAdmin = user.tipo === 'admin';
  const isCorretor = imovel.corretor && (
    imovel.corretor.email === user.email ||
    imovel.corretor.telefone === user.telefone ||
    imovel.corretorId === user.id
  );
  const verProprietario = isAdmin || isCorretor;

  res.render('app-imovel-detalhe', { user, imovel, verProprietario });
});

// Editar imóvel - tela
app.get('/app/imovel/:id/editar', auth, (req,res)=>{
  const fs = require('fs');
  const imoveis = fs.existsSync(dataFile('imoveis.json')) ? ((_cacheImoveis || [])) : [];
  const imovel = imoveis.find(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id) || String(i.id) === String(req.params.id));

  if(!imovel){
    return res.send('Imóvel não encontrado. <a href="/app/imoveis">Voltar</a>');
  }

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
  if(_cacheImoveis) { const _ci = _cacheImoveis.findIndex(i => i.id === imoveis[idx].id); if(_ci >= 0) _cacheImoveis[_ci] = imoveis[idx]; }
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
      const url = '/data-uploads/' + req.file.filename;
      imoveis[idx].fotos = imoveis[idx].fotos || [];
      imoveis[idx].fotos.push(url);
      await salvarImovel(imoveis[idx]);
      if(_cacheImoveis) { const _ci = _cacheImoveis.findIndex(i => i.id === imoveis[idx].id); if(_ci >= 0) _cacheImoveis[_ci] = imoveis[idx]; }
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
    imoveis[idx].fotos = (imoveis[idx].fotos || []).filter(f => f !== foto);
    salvarTodosImoveis(imoveis).catch(e=>console.error("[imoveis]",e.message));
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
    let fotos = imoveis[idx].fotos || [];
    fotos = fotos.filter(f => f !== foto);
    fotos.unshift(foto);
    imoveis[idx].fotos = fotos;
    salvarTodosImoveis(imoveis).catch(e=>console.error("[imoveis]",e.message));
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
  const selecionadosComCorretor = selecionados.map(i => ({
    ...i,
    corretorNome: req.session.user.nome || req.session.user.name || '',
    corretorEmail: req.session.user.email || '',
    corretorTelefone: req.session.user.celular || req.session.user.telefone || ''
  }));

  const xml = gerarXMLPortal(selecionadosComCorretor, portal);
  fs.writeFileSync(dataPath(filename), xml, 'utf8');
  res.json({ url: '/'+filename, total: selecionados.length });
});

function gerarXMLPortal(imoveis, portal, user){

  if(portal === 'quintoandar'){
    const esc = v => String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ListingDataFeed>\n  <Header>\n    <Provider>Matchimoveis</Provider>\n    <Email>contato@matchimoveis.ia.br</Email>\n    <BatchId>matchimoveis-'+Date.now()+'</BatchId>\n    <BatchName>MatchImoveis QuintoAndar '+new Date().toISOString()+'</BatchName>\n  </Header>\n  <Listings>\n';

    imoveis.forEach(i => {
      const prop = i.proprietario || {};
      const fotos = Array.isArray(i.fotos) ? i.fotos : [];
      xml += '\n    <Listing>\n';
      xml += '      <ListingID>'+esc(i.id_interno || i.idExterno || i.idOriginal || i.id)+'</ListingID>\n';
      xml += '      <Title>'+esc(i.titulo || ((i.tipo || 'Imóvel')+' em '+(i.bairro || '')))+'</Title>\n';
      xml += '      <TransactionType>For Sale</TransactionType>\n';
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
app.get('/app/importar-xml-upload', (req, res) => {
  const userId = req.query.userId || '';
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Importar XML</title>
  <style>body{font-family:Arial;max-width:500px;margin:60px auto;padding:20px}
  h2{color:#ff385c}input,button{width:100%;padding:12px;margin:8px 0;border-radius:8px;border:1px solid #ddd;font-size:15px}
  button{background:#ff385c;color:white;border:none;cursor:pointer;font-weight:700}
  .msg{padding:12px;border-radius:8px;margin-top:12px}</style></head>
  <body><h2>📥 Importar XML</h2>
  <p>Conta: <strong>${userId}</strong></p>
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
      const r = await fetch('/app/importar-xml-upload?userId=${userId}', {method:'POST',body:fd});
      const d = await r.json();
      document.getElementById('msg').innerHTML = d.ok
        ? '<div class="msg" style="background:#d4edda">✅ '+d.mensagem+'</div>'
        : '<div class="msg" style="background:#f8d7da">❌ '+d.erro+'</div>';
    };
  </script></body></html>`);
});

// Upload de XML local
app.post('/app/importar-xml-upload', async (req, res) => {
  const upload2 = require('multer')({ dest: dataPath('uploads/') });
  upload2.single('arquivo')(req, res, async (err) => {
    if(err) return res.json({ ok: false, erro: err.message });
    if(!req.file) return res.json({ ok: false, erro: 'Nenhum arquivo enviado' });
    const userId = req.query.userId || '';
    const { execSync } = require('child_process');
    try {
      const xmlPath = req.file.path;
      const { criarJob: _cjX3 } = require('./services/importJobs');
      const { dispararWorkerXml: _dwX3 } = require('./services/workerDispatch');
      const _jobIdX3 = await _cjX3('xml', userId, xmlPath);
      _dwX3(_jobIdX3, xmlPath, userId);
      fs.unlinkSync(xmlPath);
      res.json({ ok: true, mensagem: 'XML importado com sucesso!' });
    } catch(e) {
      res.json({ ok: false, erro: e.message });
    }
  });
});

// AUTO LOGIN ADMIN (somente para admin/leads)
app.use('/admin', (req, res, next) => {
  if (!req.session.user) {
    req.session.user = {
      id: 'admin',
      nome: 'Admin',
      tipo: 'admin'
    };
  }
  next();
});


// ROTA TEMPORÁRIA — zerar visitas e notificações
// ADMIN — Zerar visitas por userId
// ADMIN — Zerar notificações por userId
// ADMIN — Zerar tudo por userId
// Página confirmação de presença do lead










// Match Coins

// ── MERCADO PAGO ─────────────────────────────────────────────────────────────
app.post('/pagamento/criar', auth, express.json(), async (req, res) => {
  try {
    const { valor } = req.body;
    const user = req.session.user;
    if(!valor || Number(valor) < 50) return res.json({ok:false, erro:'Valor mínimo R$ 50'});

    const preference = new Preference(_mpClient);
    const BASE = process.env.RENDER ? 'https://matchimoveis.onrender.com' : 'http://localhost:3000';

    const result = await preference.create({
      body: {
        items: [{
          title: 'Créditos MatchImóveis',
          quantity: 1,
          unit_price: Number(valor),
          currency_id: 'BRL'
        }],
        payer: {
          name: user.nome || '',
          email: user.email || ''
        },
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
          creditos: Math.floor(Number(valor) * 50)
        }
      }
    });

    res.json({ ok: true, url: result.init_point, id: result.id });
  } catch(e) {
    console.error('[MP] erro criar preferencia:', e.message);
    res.json({ ok: false, erro: e.message });
  }
});

app.post('/pagamento/processar', auth, express.json(), async (req, res) => {
  try {
    const payment = new Payment(_mpClient);
    const result = await payment.create({ body: req.body });
    const userId = req.session.user?.codigoUsuario || req.session.user?.codigo;
    const valor = result.transaction_amount || 0;
    const creditos = Math.floor(valor * 50);
    if(result.status === 'approved' && creditos > 0){
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

app.post('/webhook/mercadopago', express.json(), async (req, res) => {
  try {
    const { type, data } = req.body;
    if(type !== 'payment') return res.sendStatus(200);

    const payment = new Payment(_mpClient);
    const pagamento = await payment.get({ id: data.id });

    if(pagamento.status !== 'approved') return res.sendStatus(200);

    const meta = pagamento.metadata || {};
    console.log('[MP webhook] metadata:', JSON.stringify(meta), '| status:', pagamento.status, '| valor:', pagamento.transaction_amount);
    const userId = meta.user_id || meta.userId || '';
    const creditos = parseInt(meta.creditos) || Math.floor((pagamento.transaction_amount||0) * 50);

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
    }
    res.sendStatus(200);
  } catch(e) {
    console.error('[MP] webhook erro:', e.message);
    res.sendStatus(200);
  }
});

app.get('/app/coins', auth, (req, res) => {
  const users = (_cacheUsuarios || []);
  const user = users.find(u => u.id === req.session.user.id) || req.session.user;
  const historico = (user.matchCoinsTransacoes || []).slice().reverse().slice(0, 50);
  res.render('app-coins', { user, mpPublicKey: process.env.MP_PUBLIC_KEY || '', historico });
});

// ===== REMARCAÇÃO DE VISITA PELO CLIENTE =====










// DEBUG TEMP
// DEBUG LEADS
// TEMP - Substituir data.json pelo do repositório
app.get('/app/assistente', auth, (req, res) => {
  // Assistente liberado para todos os usuários

  const imoveis = (_cacheImoveis || []).filter(i => i.userId === req.session.user.userId);
  const leads = (_cacheLeads || []).filter(l => l.userId === req.session.user.userId);
  const stats = { imoveis: imoveis.length, ativos: imoveis.filter(i => i.status !== 'inativo').length, leads: leads.length };
  res.render('app-assistente', { user: req.session.user, stats });
});


// ─── CÉREBRO DO ASSISTENTE ───────────────────────────────────────────────────

// ─── API interna do Assistente — dados reais ─────────────────────────────────
app.get('/api/assistente/dados', auth, (req, res) => {
  const uid = req.session.user.userId;
  const imoveis = (_cacheImoveis || []).filter(i=>i.userId===uid);
  const leads   = (_cacheLeads || []).filter(l=>l.userId===uid);
  const visitas = fs.existsSync(dataPath('visitas.json'))
    ? (_cacheVisitas || []).filter(v=>v.userId===uid) : [];

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
  const imoveis = (_cacheImoveis || []).filter(i => i.userId === req.session.user.userId);
  const leads = (_cacheLeads || []).filter(l => l.userId === req.session.user.userId);
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

  const imoveis = (_cacheImoveis || []).filter(i=>i.userId===uid);
  const leads   = (_cacheLeads || []).filter(l=>l.userId===uid);
  const visitas = fs.existsSync(dataPath('visitas.json'))
    ? (_cacheVisitas || []).filter(v=>v.userId===uid)
    : [];

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
  const uid = req.session.user.userId;
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
        body: JSON.stringify({ instanceName: novoNome, integration: 'WHATSAPP-BAILEYS', webhook: { url: (process.env.BASE_URL || 'https://matchimoveis.onrender.com') + '/webhook/whatsapp', enabled: true, events: ['MESSAGES_UPSERT','CONNECTION_UPDATE'] } })
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
      "SELECT COUNT(*) as total, MAX(atualizado_em) as ultima FROM leads WHERE user_id=$1",
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
  const uid = req.session.user.id;
  const raw = await lerLeads(uid);
  const parceiros = raw.filter(l => l.tipoLead === 'corretor');
  // Agrupa por telefone do parceiro
  const mapa = {};
  parceiros.forEach(l => {
    const tel = String(l.telefone || l.whatsapp || l.contato || '').replace(/\D/g,'');
    if (!mapa[tel]) mapa[tel] = {
      id: l.id,
      nome: l.nome || tel,
      telefone: tel,
      comissao: l.comissaoParceiro || '',
      leads: [],
      criadoEm: l.criadoEm
    };
    mapa[tel].leads.push(l);
  });
  const lista = Object.values(mapa).sort((a,b) => b.leads.length - a.leads.length);
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
              // Cobra lead_ativo_dia por lead processada
              try { const { consumir: _cLD } = require('./services/creditos'); _cLD(uid, 'lead_ativo_dia').catch(()=>{}); } catch(e) {}
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
  try { const { query: _qLD } = require('./services/db'); const r = await _qLD('SELECT *, dados, follow_ups, vitrine_enviada, vitrine_enviada_em, matches, matches_auto, id, nome, telefone, whatsapp, contato, user_id, codigo_usuario, score, temperatura, fase_funil, perfil_ia, status, tipo_lead, historico, timeline, eventos, comportamento, mapa_intencao FROM leads ORDER BY criado_em DESC'); return r.rows.map(r=>({ ...(r.dados||{}), id: r.id, nome: r.nome, telefone: r.telefone, whatsapp: r.whatsapp, contato: r.contato, userId: r.user_id, codigoUsuario: r.codigo_usuario, followUps: r.follow_ups||[], vitrineEnviada: r.vitrine_enviada, vitrineEnviadaEm: r.vitrine_enviada_em, matches: r.matches||[], matchesAuto: r.matches_auto||[], score: r.score || (r.dados||{}).score || 0, temperatura: r.temperatura || (r.dados||{}).temperatura || 'frio', faseFunil: r.fase_funil || (r.dados||{}).faseFunil || 'novo', status: r.status || (r.dados||{}).status || 'novo', perfilIA: r.perfil_ia || (r.dados||{}).perfilIA || {}, mapaIntencao: r.mapa_intencao || (r.dados||{}).mapaIntencao || null, comportamento: r.comportamento || (r.dados||{}).comportamento || null, historico: r.historico || (r.dados||{}).historico || [], timeline: r.timeline || (r.dados||{}).timeline || [], eventos: r.eventos || (r.dados||{}).eventos || [] })); } catch(e) { console.error('[lerLeadsData]',e.message); return []; }
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

  lead.matches = (lead.matchesBase && lead.matchesBase.length ? lead.matchesBase : null) ||
               (lead.matchesAuto && lead.matchesAuto.length ? lead.matchesAuto : null) ||
               (lead.matches && lead.matches.length ? lead.matches : null) || [];
  
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
  consumir(_uid || '', 'notificacao_prop').catch(()=>{});
  res.render('proprietario-confirmado', { resposta, visita: visitas[idx] });
})



app.get('/dev/diagnostico-leads', auth, (req,res)=>{
  const user = req.session.user;
  const todos = (_cacheLeads || []);
  const uid = user.id;
  const filtrados = filtrarPorUsuario(todos, user);
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


app.post('/app-leads/:idx/match', async (req,res)=>{
  const usuario = req.session.user || { id:'antonio-11975720750', nome:'Antonio Eduardo', celular:'11975720750', telefone:'11975720750' };

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
app.post('/admin/cruzar-proprietarios-alex', express.json({limit:'10mb'}), async (req,res)=>{
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
app.get('/admin/executar-cruzar-alex', async (req,res)=>{
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
  try { await require('./services/db').query("INSERT INTO campanha_tracking (contato_id,email,tipo) SELECT id,email,'abertura' FROM campanha_contatos WHERE id=$1", [req.params.id]); } catch(e){}
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
  res.set({'Content-Type':'image/gif','Content-Length':pixel.length,'Cache-Control':'no-cache'});
  res.end(pixel);
});

// Tracking clique
app.get('/campanha/track/click/:id', async (req, res) => {
  try { if(req.params.id !== 'teste') await require('./services/db').query("INSERT INTO campanha_tracking (contato_id,email,tipo) SELECT id,email,'clique' FROM campanha_contatos WHERE id=$1", [req.params.id]); } catch(e){}
  res.redirect('https://www.matchimoveis.ia.br');
});

app.get('/admin/campanha', authAdmin, async (req, res) => {
  const { statsBase, statsTracking, statsCadastrados } = require('./services/campanha');
  const stats = await statsBase().catch(()=>[]);
  const tracking = await statsTracking().catch(()=>[]);
  const cadastrados = await statsCadastrados().catch(()=>0);
  const total = stats.reduce((a,b)=>a+parseInt(b.total),0);
  const pendentes = (stats.find(s=>s.status==='pendente')||{}).total||0;
  const enviados = (stats.find(s=>s.status==='enviado')||{}).total||0;
  const erros = (stats.find(s=>s.status==='erro')||{}).total||0;
  const aberturas = (tracking.find(s=>s.tipo==='abertura')||{}).total||0;
  const cliques = (tracking.find(s=>s.tipo==='clique')||{}).total||0;
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Campanha Email</title>
  <style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:20px}
  h1{color:#FF385C}input,textarea{width:100%;padding:8px;margin:8px 0;border:1px solid #ddd;border-radius:6px;box-sizing:border-box}
  button{background:#FF385C;color:#fff;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin:4px}
  button.sec{background:#6b7280}
  .box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0}
  .green{color:#16a34a}.red{color:#dc2626}.gray{color:#6b7280}
  .stat{display:inline-block;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 20px;margin:6px;text-align:center;min-width:80px}
  .stat strong{display:block;font-size:22px;color:#FF385C}</style></head>
  <body><h1>📧 Campanha de Email</h1>
  <div class="box">
    <h3>📊 Base de contatos</h3>
    <div class="stat"><strong>${total}</strong>Total</div>
    <div class="stat"><strong style="color:#f59e0b">${pendentes}</strong>Pendentes</div>
    <div class="stat"><strong style="color:#16a34a">${enviados}</strong>Enviados</div>
    <div class="stat"><strong style="color:#dc2626">${erros}</strong>Erros</div>
    <div class="stat"><strong style="color:#8b5cf6">${aberturas}</strong>Aberturas</div>
    <div class="stat"><strong style="color:#2563eb">${cliques}</strong>Cliques</div>
    <div class="stat"><strong style="color:#16a34a">${cadastrados}</strong>Cadastrados</div>
  </div>
  <div class="box">
    <h3>1. Importar contatos</h3>
    <p class="gray">CSV ou Excel com colunas: nome, email, celular</p>
    <input type="file" id="arquivo" accept=".csv,.xlsx,.xls">
    <button onclick="importar()">📥 Importar planilha</button>
    <div id="import-resultado"></div>
  </div>
  <div class="box">
    <h3>2. Configurar e disparar</h3>
    <label>Assunto:</label>
    <input type="text" id="assunto" value="🚨 A IA já está trabalhando para corretores. E você?">
    <label>Mensagem:</label>
    <textarea id="mensagem" rows="18">Olá {nome},

O corretor tradicional trabalha sozinho. O corretor moderno trabalha com Inteligência Artificial.

Imagine uma IA que trabalha por você, 24 horas por dia:

🤖 Encontra e minera leads automaticamente
🎯 Faz o match perfeito entre cliente e imóvel
📩 Envia vitrines inteligentes sem você pedir
📅 Agenda visitas sozinha
💬 Conversa no WhatsApp com memória inteligente

Enquanto você atende um cliente, a IA já está preparando o próximo.

Isso não é futuro. Isso já está acontecendo na Match Imóveis.

Uma plataforma criada para corretores e imobiliárias que querem vender mais, com menos esforço, usando IA de verdade — não promessa.

Você começa com 1.000 créditos gratuitos para testar tudo agora:
https://www.matchimoveis.ia.br

O mercado imobiliário mudou. A única pergunta é: você vai acompanhar ou ficar para trás?

— Equipe Match Imóveis</textarea>
    <div style="margin:8px 0">
      <label>Email para teste:</label>
      <input type="email" id="email-teste" placeholder="seu@email.com" style="width:300px;display:inline-block">
      <button class="sec" onclick="testar()">📨 Enviar teste</button>
    </div>
    <div style="margin:8px 0">
      <label>Quantidade por lote:</label>
      <input type="number" id="limite" value="100" min="1" max="1000" style="width:100px;display:inline-block">
      <button onclick="disparar()">🚀 Disparar lote</button>
    </div>
    <div id="resultado"></div>
  </div>
  <div class="box">
    <h3>📋 Contatos importados</h3>
    <div style="margin-bottom:8px">
      <input type="text" id="busca" placeholder="Buscar por nome ou email..." style="width:300px;display:inline-block" oninput="buscar()">
      <select id="filtro-status" onchange="buscar()" style="width:150px;display:inline-block;margin-left:8px">
        <option value="">Todos os status</option>
        <option value="pendente">Pendentes</option>
        <option value="enviado">Enviados</option>
        <option value="erro">Erros</option>
      </select>
    </div>
    <div id="tabela-contatos">⏳ Carregando...</div>
    <div id="paginacao" style="margin-top:8px"></div>
  </div>
  <script>
  let _pagina = 1;
  async function buscar(p){
    _pagina = p || 1;
    const q = document.getElementById('busca').value;
    const s = document.getElementById('filtro-status').value;
    const r = await fetch('/admin/campanha/contatos?pagina='+_pagina+'&q='+encodeURIComponent(q)+'&status='+s);
    const d = await r.json();
    if(!d.ok){ document.getElementById('tabela-contatos').innerHTML='<p class=red>Erro ao carregar</p>'; return; }
    let html = '<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="background:#f3f4f6"><th style="padding:8px;text-align:left">Nome</th><th style="padding:8px;text-align:left">Email</th><th style="padding:8px;text-align:left">Celular</th><th style="padding:8px;text-align:left">Status</th><th style="padding:8px;text-align:left">Enviado em</th></tr>';
    for(const c of d.contatos){
      const cor = c.status==='enviado'?'#16a34a':c.status==='erro'?'#dc2626':'#f59e0b';
      html += '<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:8px">'+c.nome+'</td><td style="padding:8px">'+c.email+'</td><td style="padding:8px">'+c.celular+'</td><td style="padding:8px;color:'+cor+'">'+c.status+'</td><td style="padding:8px;color:#6b7280;font-size:11px">'+(c.enviado_em?new Date(c.enviado_em).toLocaleString('pt-BR'):'—')+'</td></tr>';
    }
    html += '</table>';
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
  async function disparar(){
    const limite = parseInt(document.getElementById('limite').value)||100;
    const assunto = document.getElementById('assunto').value;
    const mensagem = document.getElementById('mensagem').value;
    if(!confirm('Disparar lote de até '+limite+' emails?')) return;
    document.getElementById('resultado').innerHTML='<p>⏳ Disparando... não feche esta página.</p>';
    const r = await fetch('/admin/campanha/disparar-lote', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({limite, assunto, mensagem})});
    const d = await r.json();
    document.getElementById('resultado').innerHTML='<p class=green>✅ Enviados: '+d.enviados+'</p><p class=red>❌ Erros: '+d.erros+'</p>';
    setTimeout(()=>location.reload(), 3000);
  }
  </script></body></html>`);
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

app.post('/admin/campanha/disparar-lote', authAdmin, express.json(), async (req, res) => {
  try {
    const { limite, assunto, mensagem } = req.body;
    const { proximoLote, dispararLote } = require('./services/campanha');
    const lote = await proximoLote(limite || 100);
    if (!lote.length) return res.json({ enviados: 0, erros: 0, msg: 'Nenhum contato pendente' });
    const resultado = await dispararLote(lote, { assunto, mensagem });
    res.json(resultado);
  } catch(e) { res.json({ enviados: 0, erros: 1, erro: e.message }); }
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
    if(status){ params.push(status); where += ` AND status=$${params.length}`; }
    params.push(50); params.push(offset);
    const { rows } = await require('./services/db').query(`SELECT nome,email,celular,status,enviado_em FROM campanha_contatos ${where} ORDER BY criado_em DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    const { rows: tot } = await require('./services/db').query(`SELECT COUNT(*) as total FROM campanha_contatos ${where}`, params.slice(0,-2));
    res.json({ ok:true, contatos:rows, total:tot[0].total });
  } catch(e){ res.json({ ok:false, erro:e.message }); }
});

// ── JOB_RESUMO_EMAIL — envia resumo da conta a cada 3 dias ───────────────────
const _agendarResumoEmail = () => {
  const agora = new Date();
  const proximo = new Date(agora);
  proximo.setDate(proximo.getDate() + (agora.getHours() >= 9 ? 3 : 0));
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
    }, 3 * 24 * 3600 * 1000);
  }, msAte);
  console.log('[JOB RESUMO EMAIL] agendado para:', proximo.toLocaleString('pt-BR'));
};
_agendarResumoEmail();
// ── FIM JOB_RESUMO_EMAIL ─────────────────────────────────────────────────────

// ── CAPTAÇÃO ─────────────────────────────────────────────────────────────────
app.get('/app/captacao', auth, async (req, res) => {
  try {
    const { query: _qCap } = require('./services/db');
    const uid = req.session.user.id || req.session.user.codigoUsuario;
    const { rows } = await _qCap(`
      SELECT id, nome, telefone, whatsapp, email, dados, perfil_ia, criado_em
      FROM leads 
      WHERE user_id=$1 
      AND (
        dados->>'temImovelParaCaptar' = 'true' 
        OR tipo_lead = 'cliente_vendedor'
        OR dados->>'tipoLead' = 'cliente_vendedor'
      )
      ORDER BY criado_em DESC
    `, [uid]);
    res.render('app-captacao', { user: req.session.user, leads: rows });
  } catch(e) {
    console.error('[captacao]', e.message);
    res.render('app-captacao', { user: req.session.user, leads: [] });
  }
});
// ── FIM CAPTACAO ──────────────────────────────────────────────────────────────

// ── CAPTAÇÃO PÚBLICA ──────────────────────────────────────────────────────────
app.get('/captar/:userId', async (req, res) => {
  res.render('captar-imovel', { leadId: '', userId: req.params.userId });
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
    const { transacao, tipo, endereco, valor, nome, celular } = req.body;
    const userId = req.params.userId;
    const { salvarLead: _slCap } = require('./services/salvarLead');
    const novaLead = await _slCap({ id: Date.now().toString(), nome: nome||'Captação', telefone: celular||'', whatsapp: celular||'', user_id: userId, userId, origem: 'captacao_link', status: 'novo', tipo_lead: 'cliente_vendedor', _lote: true });
    const leadId = novaLead.id;
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
    `, [req.params.leadId]);
    
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
    }
  } catch(e){ console.error('[captar]', e.message); }
  res.json({ ok: true });
});
// ── FIM CAPTAÇÃO PÚBLICA ──────────────────────────────────────────────────────
