require("dotenv").config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

const session = require('express-session');

app.use(session({
  secret: 'matchimoveis',
  resave: false,
  saveUninitialized: true
}));

const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());



// ====== HELPERS ======

function loadImoveis() {
  try {
    return JSON.parse(fs.readFileSync('imoveis.json','utf8'));
  } catch {
    return [];
  }
}

// ====== ROTAS ======

app.get('/', (req,res)=>{
  res.render('index', { user: req.session.user,  flash: null, result: { stats: {}, filters: { cities: [], neighborhoods: [], bairros: [], status: [], scores: [], matchStatuses: [{ value: 'all', label: 'Todos' }, { value: 'with-match', label: 'Com match' }, { value: 'without-match', label: 'Sem match' }] }, results: [], duplicates: [] } });
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
        total = (data.match(/<Listing>/g) || []).length;
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
  try {
    const xmlUrl = req.body.xmlUrl;
    const file = (req.files && req.files[0]) || req.file;

    if (!xmlUrl) {
      return res.send('Informe a URL do XML');
    }

    const { execSync } = require('child_process');
    const fileArg = file ? `"${file.path}"` : '';
    execSync(`node importXMLCompleto.js "${xmlUrl}" ${fileArg}`, { stdio: 'inherit' });

    res.send('Importação concluída <a href="/app/imoveis">Ver imóveis</a>');
  } catch (err) {
    res.send('Erro: ' + err.message);
  }
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




app.post('/app/leads', upload.any(), async (req, res) => {
  try {
    const file = (req.files && req.files[0]) || req.file;
    if (!file) return res.send("Envie o arquivo");

    const { execSync } = require("child_process");

    execSync(`node processLeads.js "${file.path}"`, { stdio: "inherit" });

    return res.redirect("/app/leads");

  } catch (err) {
    return res.send("Erro: " + err.message);
  }
});


app.get('/app/portais', (req,res)=>{
  const portais = JSON.parse(require('fs').readFileSync('portais.json','utf8'));
  res.render('app-portais', { user: req.session.user,  portais });
});

app.post('/app/portais', (req,res)=>{
  const ativos = [].concat(req.body.portais || []);
  const all = ['zap','vivareal','olx','imovelweb','chavesnamao','123i'];

  const config = {};
  all.forEach(p=>{
    config[p] = ativos.includes(p);
  });

  require('fs').writeFileSync('portais.json', JSON.stringify(config,null,2));

  res.redirect('/app/portais');
});

app.get('/feed/:portal', (req,res)=>{
  const portal = req.params.portal;
  const { execSync } = require('child_process');

  execSync(`node exportXML.js ${portal}`);

  res.sendFile(require('path').resolve(`feed-${portal}.xml`));
});


app.get('/login', (req,res)=>{
  res.render('login');
});

app.post('/login', (req,res)=>{
  const fs = require('fs');
  const users = JSON.parse(fs.readFileSync('users.json','utf8'));

  // 👉 CADASTRO
  if(req.body.nome && req.body.tipoConta){
    const existe = users.find(u => u.telefone === req.body.telefone);
    if(existe) return res.send('Este celular já está cadastrado');

    const novo = {
      nome: req.body.nome,
      telefone: req.body.telefone,
      tipo: req.body.tipoConta,
      senha: '123456',
      codigoUsuario: (req.body.nome||'USR').substring(0,3).toUpperCase() + '-' + req.body.telefone.slice(-4)
    };

    users.push(novo);
    fs.writeFileSync('users.json', JSON.stringify(users,null,2));

    req.session.user = novo;
    return res.redirect('/app-home');
  }

  // 👉 LOGIN
  const user = users.find(u => u.telefone === req.body.telefone && u.senha === req.body.senha);

  if(!user) return res.send('Login inválido');

  req.session.user = user;

  res.redirect('/app-home');
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
function carregarLeads(){
  const fs = require('fs');
  return fs.existsSync('leads.json') ? JSON.parse(fs.readFileSync('leads.json','utf8')) : [];
}

function salvarLeads(leads){
  const fs = require('fs');
  fs.writeFileSync('leads.json', JSON.stringify(leads,null,2));
}

function marcarEtapaLead(lead, etapa){
  lead.etapaAtual = etapa;
  lead.jornada = lead.jornada || [];
  const atual = lead.jornada.find(j => j.etapa === etapa);
  if(atual){ atual.feito = true; atual.data = new Date().toISOString(); }
  else lead.jornada.push({ etapa, feito:true, data:new Date().toISOString() });
}

app.get('/cliente/oferta/:leadId', (req,res)=>{
  const leads = JSON.parse(fs.readFileSync('data.json','utf8'));
  const lead = leads.find(l => (l.id || l.leadId) === req.params.leadId);
  if(!lead) return res.status(404).send('Lead não encontrado');

  registrarHistoricoImovelLead(lead, 'visualizou_vitrine', lead);
  fs.writeFileSync('data.json', JSON.stringify(leads, null, 2));
  res.render('cliente-oferta', { user: null, lead });
});

app.get('/cliente/oferta/:leadId/escolher/:idx', (req,res)=>{
  const leads = JSON.parse(fs.readFileSync('data.json','utf8'));
  const lead = leads.find(l => (l.id || l.leadId) === req.params.leadId);
  if(!lead) return res.status(404).send('Lead não encontrado');
  const idx = Number(req.params.idx);
  lead.imovelEscolhido = lead.matches && lead.matches[idx] ? lead.matches[idx] : null;
  fs.writeFileSync('data.json', JSON.stringify(leads, null, 2));
  res.redirect('/cliente/oferta/'+req.params.leadId);
});

app.get('/cliente/oferta/:leadId/visita/:idx', (req,res)=>{
  const leads = JSON.parse(fs.readFileSync('data.json','utf8'));
  const lead = leads.find(l => (l.id || l.leadId) === req.params.leadId);
  if(!lead) return res.status(404).send('Lead não encontrado');
  const idx = Number(req.params.idx);
  lead.imovelVisita = lead.matches && lead.matches[idx] ? lead.matches[idx] : null;
  lead.visitaSolicitadaEm = new Date().toISOString();
registrarHistoricoImovelLead(lead, 'visita_solicitada', lead.imovelVisita);
  fs.writeFileSync('data.json', JSON.stringify(leads, null, 2));
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

app.get('/admin', (req,res)=>{
  const dataRaw = readJsonSafe('data.json', []);
  const data = Array.isArray(dataRaw) ? dataRaw : (dataRaw.results || []);

  const users = readJsonSafe('users.json', []);
  const leads = readJsonSafe('leads.json', []);

  const totalMatches = data.reduce((sum,item)=>sum + ((item.matches && item.matches.length) || 0), 0);
  const comMatch = data.filter(item => item.matches && item.matches.length).length;

  const scores = data
    .map(item => Number(item.bestScore || 0))
    .filter(n => n > 0);

  const scoreMedio = scores.length
    ? Math.round(scores.reduce((a,b)=>a+b,0) / scores.length)
    : 0;

  const visualizacoes = leads.filter(l =>
    (l.jornada || []).some(j => j.etapa === 'Cliente visualizou')
  ).length;

  const visitas = leads.filter(l =>
    l.visita || l.imovelVisita || (l.jornada || []).some(j => j.etapa === 'Visita solicitada')
  ).length;

  res.render('admin-dashboard', { user: req.session.user, 
    stats: {
      totalLeads: data.length,
      comMatch,
      totalMatches,
      totalUsuarios: users.length,
      visitas,
      visualizacoes,
      imoveisOrigem: data.length,
      scoreMedio
    },
    ultimosLeads: data.slice(-10).reverse()
  });
});

app.get('/admin/match', (req,res)=>{
  const dataRaw = readJsonSafe('data.json', []);
  const arr = Array.isArray(dataRaw) ? dataRaw : (dataRaw.results || []);

  res.render('index', { user: req.session.user, 
    flash: null,
    result: {
      stats: {},
      filters: {
        cities: [],
        neighborhoods: [],
        bairros: [],
        status: [],
        scores: [],
        matchStatuses: [
          { value: 'all', label: 'Todos' },
          { value: 'with-match', label: 'Com match' },
          { value: 'without-match', label: 'Sem match' }
        ]
      },
      results: arr,
      processed: arr,
      duplicates: []
    }
  });
});

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

app.get('/admin/processamentos', (req,res)=>{
  const historico = safeReadJsonAdmin('uploads-admin.json', []);
  const dataRaw = safeReadJsonAdmin('data.json', []);
  const data = Array.isArray(dataRaw) ? dataRaw : (dataRaw.results || []);

  const linhas = historico.slice().reverse().map(h=>{
    const relacionados = data.filter(item =>
      (item.corretorId && item.corretorId === h.corretorId) ||
      (item.corretorCelular && item.corretorCelular === h.corretorCelular) ||
      (item.uploadId && item.uploadId === h.id)
    );

    return {
      ...h,
      totalLeads: relacionados.length,
      comMatch: relacionados.filter(i => i.matches && i.matches.length).length,
      totalMatches: relacionados.reduce((s,i)=>s+((i.matches&&i.matches.length)||0),0)
    };
  });

  res.send(`
    <html>
    <head>
      <title>Processamentos - Admin</title>
      <style>
        body{font-family:Arial;background:#f3f4f6;margin:0;padding:30px;color:#111}
        a{color:#111}
        .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;background:white;border-radius:14px;overflow:hidden}
        th,td{padding:12px;border-bottom:1px solid #eee;text-align:left;font-size:14px}
        th{background:#111827;color:white}
        .btn{background:#111827;color:white;padding:10px 14px;border-radius:10px;text-decoration:none}
      </style>
    </head>
    <body>
      <div class="top">
        <h1>Listas processadas por corretor</h1>
        <a class="btn" href="/admin">Voltar Admin</a>
      </div>
      <table>
        <tr>
          <th>Data</th>
          <th>Corretor</th>
          <th>Celular</th>
          <th>Arquivo</th>
          <th>Status</th>
          <th>Leads</th>
          <th>Com match</th>
          <th>Total matches</th>
        </tr>
        ${linhas.map(l=>`
          <tr>
            <td>${new Date(l.data).toLocaleString('pt-BR')}</td>
            <td>${l.corretorNome || '-'}</td>
            <td>${l.corretorCelular || '-'}</td>
            <td>${l.arquivo || '-'}</td>
            <td>${l.status || '-'}</td>
            <td>${l.totalLeads || 0}</td>
            <td>${l.comMatch || 0}</td>
            <td>${l.totalMatches || 0}</td>
          </tr>
        `).join('')}
      </table>
    </body>
    </html>
  `);
});

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

app.get('/admin/processamentos', (req,res)=>{
  const historico = safeReadJsonAdmin('uploads-admin.json', []);
  const dataRaw = safeReadJsonAdmin('data.json', []);
  const data = Array.isArray(dataRaw) ? dataRaw : (dataRaw.results || []);

  const linhas = historico.slice().reverse().map(h=>{
    const relacionados = data.filter(item =>
      (item.corretorId && item.corretorId === h.corretorId) ||
      (item.corretorCelular && item.corretorCelular === h.corretorCelular) ||
      (item.uploadId && item.uploadId === h.id)
    );

    return {
      ...h,
      totalLeads: relacionados.length,
      comMatch: relacionados.filter(i => i.matches && i.matches.length).length,
      totalMatches: relacionados.reduce((s,i)=>s+((i.matches&&i.matches.length)||0),0)
    };
  });

  res.send(`
    <html>
    <head>
      <title>Processamentos - Admin</title>
      <style>
        body{font-family:Arial;background:#f3f4f6;margin:0;padding:30px;color:#111}
        a{color:#111}
        .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;background:white;border-radius:14px;overflow:hidden}
        th,td{padding:12px;border-bottom:1px solid #eee;text-align:left;font-size:14px}
        th{background:#111827;color:white}
        .btn{background:#111827;color:white;padding:10px 14px;border-radius:10px;text-decoration:none}
      </style>
    </head>
    <body>
      <div class="top">
        <h1>Listas processadas por corretor</h1>
        <a class="btn" href="/admin">Voltar Admin</a>
      </div>
      <table>
        <tr>
          <th>Data</th>
          <th>Corretor</th>
          <th>Celular</th>
          <th>Arquivo</th>
          <th>Status</th>
          <th>Leads</th>
          <th>Com match</th>
          <th>Total matches</th>
        </tr>
        ${linhas.map(l=>`
          <tr>
            <td>${new Date(l.data).toLocaleString('pt-BR')}</td>
            <td>${l.corretorNome || '-'}</td>
            <td>${l.corretorCelular || '-'}</td>
            <td>${l.arquivo || '-'}</td>
            <td>${l.status || '-'}</td>
            <td>${l.totalLeads || 0}</td>
            <td>${l.comMatch || 0}</td>
            <td>${l.totalMatches || 0}</td>
          </tr>
        `).join('')}
      </table>
    </body>
    </html>
  `);
});

// ===== CORRETOR: MEUS LEADS + FAZER MATCH =====


app.post('/app-leads/:idx/match', async (req,res)=>{
  const usuario = req.session.user || { id:'antonio-11975720750', nome:'Antonio Eduardo', celular:'11975720750', telefone:'11975720750' };

  const dataRaw = safeReadJsonAdmin('data.json', []);
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

    fs.writeFileSync('data.json', JSON.stringify(data,null,2));

    res.redirect('/app-leads');
  } catch(err) {
    console.error(err);
    res.status(500).send('Erro ao fazer match: ' + err.message);
  }
});

app.get('/import-status',(req,res)=>{res.json({status:global.importStatus||'idle'});});

app.get('/logout', (req,res)=>{
  req.session.destroy(()=>res.redirect('/login'));
});


// ===== ROTAS CORRETAS CORRETOR / ADMIN =====
app.get('/logout', (req,res)=>{
  req.session.destroy(()=>res.redirect('/login'));
});

function usuarioLogado(req){
  return req.session.user || null;
}





// Meus imóveis = carteira do corretor, NÃO match


// Meus leads = leads/matches do corretor logado


// Admin match = somente painel de match
app.get('/admin/match', (req,res)=>{
  const dataRaw = safeReadJsonAdmin ? safeReadJsonAdmin('data.json', []) : [];
  const arr = Array.isArray(dataRaw) ? dataRaw : (dataRaw.results || []);

  res.render('index', { user: req.session.user, 
    flash: null,
    result: {
      stats: {},
      filters: {
        cities: [],
        neighborhoods: [],
        bairros: [],
        status: [],
        scores: [],
        matchStatuses: [
          { value: 'all', label: 'Todos' },
          { value: 'with-match', label: 'Com match' },
          { value: 'without-match', label: 'Sem match' }
        ]
      },
      results: arr,
      processed: arr,
      duplicates: []
    }
  });
});


// ===== ROTAS CORRETAS CORRETOR / ADMIN =====
app.get('/logout', (req,res)=>{
  req.session.destroy(()=>res.redirect('/login'));
});

function usuarioLogado(req){
  return req.session.user || null;
}

app.get('/app', (req,res)=>{
  if(!req.session.user) return res.redirect('/login');
  res.redirect('/app-home');
});

// rota app-home removida (duplicada)

// Meus imóveis = carteira do corretor, NÃO match
app.get('/app-imoveis', (req,res)=>{
  if(!req.session.user) return res.redirect('/login');
  const todosImoveis = loadImoveis();
  const telUser = String(req.session.user.celular || req.session.user.telefone || '');
  const imoveis = todosImoveis.filter(i =>
    String(i.corretorCelular || i.celularCorretor || '') === telUser ||
    String(i.corretorId || '') === String(req.session.user.id || '')
  );
  res.render('app-imoveis', { user: req.session.user, 
    imoveis,
    perfil: req.session.user.tipo || 'corretor',
    nome: req.session.user.nome || 'Usuário'
  });
});

app.get('/app/portais', auth, (req,res)=>{
  const portais = JSON.parse(require('fs').readFileSync('portais.json','utf8'));
  res.render('app-portais', { user: req.session.user, portais });
});

app.get('/app-xml', (req,res)=> res.redirect('/app-portais-xml'));
app.get('/app-portais', (req,res)=> res.redirect('/app-portais-xml'));


app.get('/app-perfil', (req,res)=>{
  renderAppPage(res, 'app-perfil', { title: 'Perfil' });
});

app.get('/logout', (req,res)=> res.redirect('/login'));

// ===== ROTAS FINAIS LIMPAS DO APP =====

function auth(req,res,next){
  if(!req.session || !req.session.user) return res.redirect('/login');
  next();
}

function filtrarPorUsuario(lista, user){
  if (!Array.isArray(lista)) return [];
  if (user && user.tipo === 'admin') return lista;
  const uid = String(user && user.id || '');
  const tel = String(user && (user.celular || user.telefone) || '');
  return lista.filter(item =>
    String(item.corretorId || '') === uid ||
    String(item.userId || '') === uid ||
    String(item.usuarioId || '') === uid ||
    String(item.corretorCelular || '') === tel ||
    String(item.telefone || '') === tel
  );
}



app.get('/app', auth, (req,res)=> res.redirect('/app-home'));

app.get('/app/notificacoes', auth, (req,res)=>{
  const notificacoesAll = fs.existsSync('notificacoes.json') ? JSON.parse(fs.readFileSync('notificacoes.json','utf8')) : [];
  const userId = String(req.session.user.id || '');
  const notificacoes = notificacoesAll
    .filter(n => String(n.usuarioId || '') === userId)
    .slice()
    .reverse();

  res.render('app-notificacoes', {
    user: req.session.user,
    notificacoes
  });
});


app.get('/app-home', auth, (req,res)=>{
  const imoveis = fs.existsSync('imoveis.json') ? JSON.parse(fs.readFileSync('imoveis.json','utf8')) : [];
  const leads = fs.existsSync('data.json') ? JSON.parse(fs.readFileSync('data.json','utf8')) : [];
  const visitas = fs.existsSync('visitas.json') ? JSON.parse(fs.readFileSync('visitas.json','utf8')) : [];
  const notificacoes = fs.existsSync('notificacoes.json') ? JSON.parse(fs.readFileSync('notificacoes.json','utf8')) : [];
  const minhasNotificacoes = notificacoes.filter(n => String(n.usuarioId) === String(req.session.user.id));
  const naoLidas = minhasNotificacoes.filter(n => !n.lida);
  const leadsArr = Array.isArray(leads) ? leads : (leads.results || []);
  const comMatch = leadsArr.filter(l => l.matches && l.matches.length > 0);
  const totalMatches = leadsArr.reduce((s,l) => s + ((l.matches && l.matches.length) || 0), 0);
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
      taxaMatch: leadsArr.length > 0 ? Math.round((comMatch.length / leadsArr.length) * 100) : 0
    },
    recentes,
    topMatches: comMatch.slice(0,3),
    notificacoes: minhasNotificacoes.slice(-5).reverse(),
    notificacoesNaoLidas: naoLidas.length
  });
});


// Exportar imóveis do usuário em Excel
app.get('/app/imoveis/exportar-excel', auth, (req, res) => {
  try {
    const XLSX = require('xlsx');
    const fs = require('fs');

    const user = req.session.user || {};
    const userId = user.id || user.celular || user.telefone || user.email || '';

    const imoveis = fs.existsSync('imoveis.json')
      ? JSON.parse(fs.readFileSync('imoveis.json', 'utf8'))
      : [];

    const meusImoveis = imoveis.filter(i => {
      if (!userId) return true;
      return (
        i.userId === userId ||
        i.usuarioId === userId ||
        i.corretorId === userId ||
        i.donoId === userId ||
        i.ownerId === userId ||
        i.cadastradoPor === userId ||
        !i.userId && !i.usuarioId && !i.corretorId && !i.donoId && !i.ownerId && !i.cadastradoPor
      );
    });

    const rows = meusImoveis.map(i => {
      const prop = i.proprietario || {};
      const estado = typeof i.estado === 'object' ? (i.estado['#text'] || i.estado.abbreviation || i.estado.uf || '') : (i.estado || '');

      const id = i.idExterno || i.idOriginal || i.id || i.codigo || '';
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

app.get('/app/imoveis', auth, (req,res)=>{
  const imoveis = fs.existsSync('imoveis.json') ? JSON.parse(fs.readFileSync('imoveis.json','utf8')) : [];
  res.render('app-imoveis', { user: req.session.user, imoveis: imoveis });
});

app.get('/app/cadastro', auth, (req,res)=>{
  res.render('app-cadastro', { user: req.session.user });
});

app.get('/app/portais', auth, (req,res)=>{
  const portais = fs.existsSync('portais.json') ? JSON.parse(fs.readFileSync('portais.json','utf8')) : [];
  res.render('app-portais', { user: req.session.user, portais });
});

app.get('/app/perfil', auth, (req,res)=>{
  res.render('app-perfil', { user: req.session.user });
});

app.get('/app-importar-leads', auth, (req,res)=>{
  res.render('app-importar-leads', { user: req.session.user, usuario: req.session.user });
});

app.get('/app/importar-leads', auth, (req,res)=>{
  res.redirect('/app-importar-leads');
});

app.get('/app/leads', auth, (req,res)=>{
  const raw = fs.existsSync('data.json') ? JSON.parse(fs.readFileSync('data.json','utf8')) : [];
  const data = Array.isArray(raw) ? raw : (raw.results || []);
  const leads = data;
  // usa matchesBase (base interna) ou matches (externos)
  leads.forEach(l => {
    if (!l.matches || l.matches.length === 0) {
      l.matches = l.matchesBase || [];
      l.matchCount = l.matchCountBase || 0;
    }
  });
  // Ordena por data de cadastro — mais recentes primeiro
  leads.sort((a, b) => {
    const da = new Date(a.data_cadastro || 0);
    const db = new Date(b.data_cadastro || 0);
    return db - da;
  });
  const totalMatches = leads.reduce((sum,item)=> sum + ((item.matches && item.matches.length) || 0), 0);
  res.render('app-leads', {
    user: req.session.user,
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

app.get('/app/visitas', auth, (req,res)=>{
  const visitas = fs.existsSync('visitas.json') ? JSON.parse(fs.readFileSync('visitas.json','utf8')) : [];
  res.render('app-visitas', { user: req.session.user, visitas });
});

app.get('/logout', (req,res)=>{
  if (req.session) req.session.destroy(()=>res.redirect('/login'));
  else res.redirect('/login');
});

const PORT = process.env.PORT || port || 3000;

app.post('/app/perfil/localizacao', auth, (req,res)=>{
  const { lat, lng, endereco } = req.body;
  const users = JSON.parse(fs.readFileSync('users.json','utf8'));
  const idx = users.findIndex(u => u.id === req.session.user.id);
  if(idx >= 0) {
    users[idx].lat = parseFloat(lat);
    users[idx].lng = parseFloat(lng);
    users[idx].endereco = endereco || '';
    req.session.user = users[idx];
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
  }
  res.redirect('/app/perfil');
});


app.post('/app/perfil/localizacao', auth, (req,res)=>{
  const { lat, lng, endereco } = req.body;
  const users = JSON.parse(fs.readFileSync('users.json','utf8'));
  const idx = users.findIndex(u => u.id === req.session.user.id);
  if(idx >= 0) {
    users[idx].lat = parseFloat(lat);
    users[idx].lng = parseFloat(lng);
    users[idx].endereco = endereco || '';
    req.session.user = users[idx];
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
  }
  res.redirect('/app/perfil');
});


// Servir XML dos portais
app.get('/feed-:portal.xml', (req,res)=>{
  const fs = require('fs');
  const portal = req.params.portal;
  const file = `feed-${portal}.xml`;

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

      const leads = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
      const imoveis = fs.existsSync('./imoveis.json') ? JSON.parse(fs.readFileSync('./imoveis.json', 'utf8')) : [];

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
      fs.writeFileSync('./data.json', JSON.stringify(leads, null, 2));

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
      const filtrados = filtrarCandidatosPelaRegraInterna(lead, candidatos, imoveis).map(i => {
        i.fonte = i.fonte || 'QuintoAndar';
        return i;
      });

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
      */

      const leadsAtualizados = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
      const idx = leadsAtualizados.findIndex(l =>
        String(l.leadId) === String(leadIdParam) ||
        String(l.id) === String(leadIdParam) ||
        String(l.idAnuncio) === String(leadIdParam) ||
        String(l.imovel_interesse) === String(leadIdParam)
      );

      if (idx >= 0) {
        leadsAtualizados[idx].matchesQuintoAndar = filtrados;
        leadsAtualizados[idx].matchQuintoAndarCount = filtrados.length;
        leadsAtualizados[idx].matchQuintoAndarAt = new Date().toISOString();
        leadsAtualizados[idx].matchQuintoAndarStatus = 'finalizado';
        fs.writeFileSync('./data.json', JSON.stringify(leadsAtualizados, null, 2));
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


app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

// ROTA DA TELA IMPORTAR LEADS
app.post('/process', upload.any(), async (req, res) => {
  try {
    const file = (req.files && req.files[0]) || req.file;
    if (!file) return res.send('Envie o arquivo');

    const { execSync } = require('child_process');
    execSync(`node processAndMatch.js "${file.path}"`, { stdio: 'inherit' });

    return res.send('Importação iniciada. Você pode navegar normalmente.');
  } catch (err) {
    return res.send('Erro ao importar leads: ' + err.message);
  }
});

// ====== ROTA MAPA ======
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
app.get('/feed', (req, res) => {
  res.render('feed-reels', { user: req.session.user });
});

app.get('/api/imoveis', (req, res) => {
  const imoveis = loadImoveis();

app.post('/imovel/:id/status', (req,res)=>{
  const fs=require('fs');
  const imoveis=JSON.parse(fs.readFileSync('imoveis.json','utf8'));
  const { status } = req.body;

  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id));
  if(idx>=0){
    imoveis[idx].status = status;
    fs.writeFileSync('imoveis.json', JSON.stringify(imoveis,null,2));
  gerarXMLPortais();
  gerarXMLPortais();
  }

  res.json({ok:true});
});

app.post('/imovel/:id/status', (req,res)=>{
  const fs=require('fs');
  const imoveis=JSON.parse(fs.readFileSync('imoveis.json','utf8'));
  const { status } = req.body;

  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id));
  if(idx>=0){
    imoveis[idx].status = status;
    fs.writeFileSync('imoveis.json', JSON.stringify(imoveis,null,2));
  }

  res.json({ok:true});
});
  res.json(imoveis.slice(0, 50));
});


// Cadastro manual de imóvel
app.post('/app/imovel/cadastrar', auth, (req, res) => {
  const imoveis = fs.existsSync('imoveis.json') ? JSON.parse(fs.readFileSync('imoveis.json','utf8')) : [];
  const b = req.body;
  const novo = {
    idExterno: b.idExterno || 'MAN-' + Date.now(),
    titulo: b.titulo || '',
    tipo: b.tipo || 'Apartamento',
    area_total: parseFloat(b.area_total) || 0,
    proprietario: b.proprietario || '',
    proprietario_celular: b.proprietario_celular || '',
    proprietario_email: b.proprietario_email || '',
    transacao: b.transacao || 'venda',
    bairro: b.bairro || '',
    cidade: b.cidade || 'São Paulo',
    estado: b.estado || 'SP',
    endereco: b.endereco || '',
    valor_imovel: parseFloat(b.preco) || 0,
    area_m2: parseFloat(b.area) || 0,
    quartos: parseInt(b.quartos) || 0,
    suites: parseInt(b.suites) || 0,
    banheiros: parseInt(b.banheiros) || 0,
    vagas: parseInt(b.vagas) || 0,
    descricao: b.descricao || '',
    fotos: [],
    proprietario: b.propNome ? { nome: b.propNome, celular: b.propTelefone, email: b.propEmail } : null,
    usuarioId: req.session.user.id,
    usuarioNome: req.session.user.nome,
    usuarioPerfil: req.session.user.perfil,
    usuarioTelefone: req.session.user.celular || req.session.user.telefone,
    usuarioId: req.session.user.id,
    usuarioNome: req.session.user.nome || req.session.user.nomeCompleto || '',
    usuarioPerfil: req.session.user.perfil || req.session.user.tipoConta || '',
    usuarioTelefone: req.session.user.celular || req.session.user.telefone || '',
    source: 'manual',
    lastUpdate: new Date().toISOString()
  };
  imoveis.push(novo);
  fs.writeFileSync('imoveis.json', JSON.stringify(imoveis, null, 2));
  res.redirect('/app/imoveis');
});

// Detalhe do imóvel


// Salva lead vindo da página pública do imóvel
app.post('/api/lead-interesse', (req, res) => {
  try {
    const { nome, celular, imovelId, imovelTitulo } = req.body;

    if (!nome || !celular || !imovelId) {
      return res.json({ ok: false, error: 'Dados obrigatórios ausentes' });
    }

    const agora = new Date();

    const leads = fs.existsSync('./data.json')
      ? JSON.parse(fs.readFileSync('./data.json', 'utf8'))
      : [];

    const imoveis = fs.existsSync('./imoveis.json')
      ? JSON.parse(fs.readFileSync('./imoveis.json', 'utf8'))
      : [];

    const imovelRef = imoveis.find(i =>
      String(i.idExterno) === String(imovelId) ||
      String(i.id) === String(imovelId) ||
      String(i.idOriginal) === String(imovelId)
    ) || {};

    // Dono/responsável do imóvel: quem cadastrou manualmente ou importou XML
    const usuarioDestinoId = imovelRef.usuarioId || imovelRef.corretorId || '';
    const usuarioDestinoNome = imovelRef.usuarioNome || imovelRef.corretorNome || '';
    const usuarioDestinoPerfil = imovelRef.usuarioPerfil || imovelRef.perfil || '';
    const usuarioDestinoTelefone = imovelRef.usuarioTelefone || imovelRef.corretorTelefone || '';

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
      origem: 'pagina_externa_imovel',
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

    if (idxExiste === -1) {
      leadId = Date.now().toString();
      leads.push({
        id: leadId,
        ...leadPayload
      });
      console.log('✅ Novo lead salvo para o dono do imóvel:', usuarioDestinoNome || usuarioDestinoId || 'sem dono');
    } else {
      leadId = leads[idxExiste].id || Date.now().toString();
      leads[idxExiste] = {
        ...leads[idxExiste],
        ...leadPayload,
        id: leadId
      };
      console.log('✅ Lead existente atualizado para o dono do imóvel:', usuarioDestinoNome || usuarioDestinoId || 'sem dono');
    }

    fs.writeFileSync('./data.json', JSON.stringify(leads, null, 2));

    // Só cria visita quando a ação for solicitação de visita
    const querVisita =
      req.body.querVisita === 'true' ||
      req.body.solicitarVisita === 'true' ||
      req.body.visita === 'true' ||
      req.body.tipo === 'visita' ||
      req.body.acao === 'visita' ||
      req.body.acao === 'solicitar_visita';

    if (querVisita) {
      const visitas = fs.existsSync('./visitas.json')
        ? JSON.parse(fs.readFileSync('./visitas.json', 'utf8'))
        : [];

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

        // Visita vai para o dono do imóvel
        usuarioDestinoId,
        usuarioDestinoNome,
        usuarioDestinoPerfil,
        usuarioDestinoTelefone,
        corretorId: usuarioDestinoId,
        corretorNome: usuarioDestinoNome,
        corretorTelefone: usuarioDestinoTelefone,

        status: 'solicitada',
        origem: 'pagina_externa_imovel',
        fonte: 'MatchImóveis',
        data: agora.toISOString(),
        data_br: agora.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' })
      });

      fs.writeFileSync('./visitas.json', JSON.stringify(visitas, null, 2));

      try {
        const notificacoes = fs.existsSync('./notificacoes.json')
          ? JSON.parse(fs.readFileSync('./notificacoes.json', 'utf8'))
          : [];

        notificacoes.push({
          id: Date.now().toString(),
          tipo: 'nova_visita',
          titulo: 'Nova solicitação de visita',
          mensagem: nome + ' solicitou visita para ' + (imovelTitulo || imovelRef.titulo || 'um imóvel'),
          usuarioId: usuarioDestinoId,
          usuarioNome: usuarioDestinoNome,
          leadId,
          imovelId,
          lida: false,
          criadaEm: new Date().toISOString()
        });

        fs.writeFileSync('./notificacoes.json', JSON.stringify(notificacoes, null, 2));
        console.log('🔔 Notificação criada: nova visita');
      } catch(e) {
        console.log('Erro ao criar notificação:', e.message);
      }

      console.log('📅 Visita criada para o dono do imóvel:', usuarioDestinoNome || usuarioDestinoId || 'sem dono');
    }

    return res.json({ ok: true, leadId, visitaCriada: querVisita });
  } catch(e) {
    console.log('Erro em /api/lead-interesse:', e.message);
    return res.json({ ok: false, error: e.message });
  }
});

// Página pública do imóvel — sem login
app.get('/imovel/:id', (req, res) => {
  const imoveis = JSON.parse(fs.readFileSync('./imoveis.json', 'utf8'));
  const users = JSON.parse(fs.readFileSync('./users.json', 'utf8'));
  const imovel = imoveis.find(i => String(i.idExterno) === String(req.params.id) || String(i.id) === String(req.params.id));
  if (!imovel) return res.status(404).send('Imóvel não encontrado');
  const pub = Object.assign({}, imovel);
  delete pub.proprietario;
  delete pub.proprietario_celular;
  delete pub.proprietario_email;
  // Pega o primeiro usuário ativo como contato
  const corretor = users.find(u => u.ativo) || {};
  res.render('imovel-publico', { imovel: pub, corretor });
});


// Detalhe da lead
app.get('/app/lead/:id', auth, (req, res) => {
  const leads = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
  const lead = leads.find(l => String(l.id) === String(req.params.id));
  if (!lead) return res.status(404).send('Lead não encontrada');

  if (!Array.isArray(lead.historico)) lead.historico = [];
  lead.historico.push({
    acao: 'visualizou_detalhes_lead',
    data: new Date().toISOString()
  });

  fs.writeFileSync('./data.json', JSON.stringify(leads, null, 2));

  const visitas = fs.existsSync('./visitas.json') ? JSON.parse(fs.readFileSync('./visitas.json', 'utf8')) : [];

  const visitasDaLead = visitas.filter(v =>
    String(v.leadId || v.lead_id || '') === String(lead.leadId || '') ||
    String(v.leadId || v.lead_id || '') === String(lead.id || '') ||
    String(v.telefone || v.contato || '').replace(/\D/g,'') === String(lead.telefone || lead.contato || '').replace(/\D/g,'') ||
    String(v.email || '').toLowerCase() === String(lead.email || '').toLowerCase()
  );

  const imoveisInternos = fs.existsSync('./imoveis.json') ? JSON.parse(fs.readFileSync('./imoveis.json', 'utf8')) : [];

  let matchesInternos = [];
  try {
    const { buscarMatchesBaseInterna } = require('./matchBaseInterna');
    matchesInternos = buscarMatchesBaseInterna(lead, imoveisInternos);

    lead.matches = matchesInternos;
    lead.matchCount = matchesInternos.length;
    fs.writeFileSync('./data.json', JSON.stringify(leads, null, 2));
  } catch(e) {
    console.error('Erro match base interna lead:', e.message);
    matchesInternos = [];
  }

  res.render('app-lead-detalhe', { user: req.session.user, lead, visitasDaLead, matchesInternos });
});
app.get('/app/imovel/:id', auth, (req, res) => {
  const imoveis = JSON.parse(fs.readFileSync('imoveis.json', 'utf8'));
  const user = req.session.user;
  const imovel = imoveis.find(i => String(i.idExterno) === String(req.params.id));
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
  const imoveis = fs.existsSync('imoveis.json') ? JSON.parse(fs.readFileSync('imoveis.json','utf8')) : [];
  const imovel = imoveis.find(i => String(i.idExterno) === String(req.params.id) || String(i.id) === String(req.params.id));

  if(!imovel){
    return res.send('Imóvel não encontrado. <a href="/app/imoveis">Voltar</a>');
  }

  res.render('app-editar-imovel', { user: req.session.user, imovel, salvo: req.query.salvo === '1' });
});

// Editar imóvel - salvar
app.post('/app/imovel/:id/editar', auth, (req,res)=>{
  const fs = require('fs');
  const imoveis = fs.existsSync('imoveis.json') ? JSON.parse(fs.readFileSync('imoveis.json','utf8')) : [];
  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id) || String(i.id) === String(req.params.id));

  if(idx < 0){
    return res.send('Imóvel não encontrado. <a href="/app/imoveis">Voltar</a>');
  }

  imoveis[idx] = {
    ...imoveis[idx],
    status: req.body.status || 'nao_publicado',
    tipo: req.body.tipo || '',
    bairro: req.body.bairro || '',
    cidade: req.body.cidade || '',
    estado: req.body.estado || '',
    valor_imovel: Number(req.body.valor_imovel || 0),
    area_m2: Number(req.body.area_m2 || 0),
    quartos: Number(req.body.quartos || 0),
    suites: Number(req.body.suites || 0),
    banheiros: Number(req.body.banheiros || 0),
    vagas: Number(req.body.vagas || 0),
    descricao: req.body.descricao || '',
    proprietario: {
      nome: req.body.proprietario_nome || '',
      telefone: req.body.proprietario_telefone || '',
      email: req.body.proprietario_email || '',
      status: req.body.proprietario_status || 'pendente'
    },
    portais: {
      olx: !!req.body.portal_olx,
      zap: !!req.body.portal_zap,
      vivareal: !!req.body.portal_vivareal,
      chaves: !!req.body.portal_chaves,
      imovelweb: !!req.body.portal_imovelweb,
      '123i': !!req.body.portal_123i
    },
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync('imoveis.json', JSON.stringify(imoveis,null,2));

  if(typeof gerarXMLPortais === 'function'){
    gerarXMLPortais();
  }

  res.redirect('/app/imovel/' + (imoveis[idx].idExterno || imoveis[idx].id) + '/editar?salvo=1');
});

// Upload de fotos do imóvel
const storageImoveis = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/imoveis');
  },
  filename: function (req, file, cb) {
    const ext = file.originalname.split('.').pop();
    cb(null, Date.now() + '-' + Math.floor(Math.random()*1000) + '.' + ext);
  }
});

const uploadImoveis = multer({ storage: storageImoveis });

// Upload de foto
app.post('/app/imovel/:id/upload-foto', auth, uploadImoveis.single('foto'), (req,res)=>{
  const fs = require('fs');
  const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));

  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id));
  if(idx >= 0){
    const url = '/uploads/imoveis/' + req.file.filename;
    imoveis[idx].fotos = imoveis[idx].fotos || [];
    imoveis[idx].fotos.push(url);
    fs.writeFileSync('imoveis.json', JSON.stringify(imoveis,null,2));
  }

  res.redirect('/app/imovel/' + req.params.id + '/editar');
});

// Excluir foto
app.post('/app/imovel/:id/excluir-foto', auth, (req,res)=>{
  const fs = require('fs');
  const { foto } = req.body;

  const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id));

  if(idx >= 0){
    imoveis[idx].fotos = (imoveis[idx].fotos || []).filter(f => f !== foto);
    fs.writeFileSync('imoveis.json', JSON.stringify(imoveis,null,2));
  }

  res.redirect('/app/imovel/' + req.params.id + '/editar');
});

// Definir foto de capa
app.post('/app/imovel/:id/capa-foto', auth, (req,res)=>{
  const fs = require('fs');
  const { foto } = req.body;

  const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id));

  if(idx >= 0){
    let fotos = imoveis[idx].fotos || [];
    fotos = fotos.filter(f => f !== foto);
    fotos.unshift(foto);
    imoveis[idx].fotos = fotos;
    fs.writeFileSync('imoveis.json', JSON.stringify(imoveis,null,2));
  }

  res.redirect('/app/imovel/' + req.params.id + '/editar');
});

// =========================
// GERAR XML PORTAIS (VivaReal padrão)
// =========================
function gerarXMLPortais(){
  const fs = require('fs');
  const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));

  const portais = ['olx','zap','vivareal','chaves','imovelweb','123i'];

  portais.forEach(portal => {

    const filtrados = imoveis.filter(i =>
      i.status === 'publicado' &&
      i.portais &&
      i.portais[portal]
    );

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<listingDataFeed>
  <header>
    <provider>MatchImoveis</provider>
    <email>contato@matchimoveis.com</email>
  </header>
  <listings>
`;

    filtrados.forEach(i => {
      xml += `
    <listing>
      <listingID>${i.idExterno || i.id}</listingID>
      <title>${i.tipo || ''} em ${i.bairro || ''}</title>
      <description>${(i.descricao || '').replace(/&/g,'')}</description>

      <price>${i.valor_imovel || 0}</price>
      <livingArea>${i.area_m2 || 0}</livingArea>

      <bedrooms>${i.quartos || 0}</bedrooms>
      <bathrooms>${i.banheiros || 0}</bathrooms>
      <suites>${i.suites || 0}</suites>
      <garageSpaces>${i.vagas || 0}</garageSpaces>

      <address>
        <city>São Paulo</city>
        <neighborhood>${i.bairro || ''}</neighborhood>
        <state>SP</state>
      </address>

      <images>
        ${(i.fotos || []).map(f => `<image>${f}</image>`).join('')}
      </images>

      <contact>
        <name>${i.proprietario?.nome || ''}</name>
        <email>${i.proprietario?.email || ''}</email>
        <phone>${i.proprietario?.telefone || ''}</phone>
      </contact>

    </listing>
`;
    });

    xml += `
  </listings>
</listingDataFeed>`;

    fs.writeFileSync(`feed-${portal}.xml`, xml);
    console.log(`XML gerado: feed-${portal}.xml (${filtrados.length} imóveis)`);
  });
}

// =========================
// GERAR XML PORTAIS (VivaReal padrão)
// =========================
function gerarXMLPortais(){
  const fs = require('fs');
  const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));

  const portais = ['olx','zap','vivareal','chaves','imovelweb','123i'];

  portais.forEach(portal => {

    const filtrados = imoveis.filter(i =>
      i.status === 'publicado' &&
      i.portais &&
      i.portais[portal]
    );

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<listingDataFeed>
  <header>
    <provider>MatchImoveis</provider>
    <email>contato@matchimoveis.com</email>
  </header>
  <listings>
`;

    filtrados.forEach(i => {
      xml += `
    <listing>
      <listingID>${i.idExterno || i.id}</listingID>
      <title>${i.tipo || ''} em ${i.bairro || ''}</title>
      <description>${(i.descricao || '').replace(/&/g,'')}</description>

      <price>${i.valor_imovel || 0}</price>
      <livingArea>${i.area_m2 || 0}</livingArea>

      <bedrooms>${i.quartos || 0}</bedrooms>
      <bathrooms>${i.banheiros || 0}</bathrooms>
      <suites>${i.suites || 0}</suites>
      <garageSpaces>${i.vagas || 0}</garageSpaces>

      <address>
        <city>São Paulo</city>
        <neighborhood>${i.bairro || ''}</neighborhood>
        <state>SP</state>
      </address>

      <images>
        ${(i.fotos || []).map(f => `<image>${f}</image>`).join('')}
      </images>

      <contact>
        <name>${i.proprietario?.nome || ''}</name>
        <email>${i.proprietario?.email || ''}</email>
        <phone>${i.proprietario?.telefone || ''}</phone>
      </contact>

    </listing>
`;
    });

    xml += `
  </listings>
</listingDataFeed>`;

    fs.writeFileSync(`feed-${portal}.xml`, xml);
    console.log(`XML gerado: feed-${portal}.xml (${filtrados.length} imóveis)`);
  });
}


app.post('/app/visitas/confirmar/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync('visitas.json')
    ? JSON.parse(fs.readFileSync('visitas.json','utf8'))
    : [];

  visitas = visitas.map(v => {
    if(v.id === req.params.id){
      v.status = 'confirmada';
      v.confirmedAt = new Date().toISOString();
    }
    return v;
  });

  fs.writeFileSync('visitas.json', JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});




app.post('/app/visitas/recusar/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync('visitas.json')
    ? JSON.parse(fs.readFileSync('visitas.json','utf8'))
    : [];

  visitas = visitas.map(v => {
    if(v.id === req.params.id){
      v.status = 'recusada';
      v.refusedAt = new Date().toISOString();
    }
    return v;
  });

  fs.writeFileSync('visitas.json', JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});




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
