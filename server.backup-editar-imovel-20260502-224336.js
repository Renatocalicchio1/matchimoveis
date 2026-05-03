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
  const users = JSON.parse(require('fs').readFileSync('users.json','utf8'));

  const user = users.find(u => u.telefone === req.body.telefone && u.senha === req.body.senha);

  if(!user) return res.send('Login inválido');

  req.session.user = user;

  res.redirect('/app');
});

function auth(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  next();
}

function adminOnly(req,res,next){
  if(req.session.user.tipo !== 'admin') return res.send('Acesso negado');
  next();
}


app.get('/app/perfil', auth, (req,res)=>{
  res.render('app-perfil', { user: req.session.user,  user: req.session.user });
});

app.post('/app/perfil', auth, (req,res)=>{
  const users = JSON.parse(require('fs').readFileSync('users.json','utf8'));
  const idx = users.findIndex(u => u.telefone === req.session.user.telefone);

  if(idx >= 0){
    users[idx].nome = req.body.nome;
    users[idx].creci = req.body.creci;
    users[idx].cpf = req.body.cpf;

    require('fs').writeFileSync('users.json', JSON.stringify(users,null,2));
    req.session.user = users[idx];
  }

  res.redirect('/app');
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

app.get('/app/visitas', auth, (req,res)=>{
  res.render('app-visitas', { user: req.session.user });
});

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

app.get('/app-home', auth, (req,res)=>{
  const imoveis = fs.existsSync('imoveis.json') ? JSON.parse(fs.readFileSync('imoveis.json','utf8')) : [];
  const leads = fs.existsSync('data.json') ? JSON.parse(fs.readFileSync('data.json','utf8')) : [];
  const visitas = fs.existsSync('visitas.json') ? JSON.parse(fs.readFileSync('visitas.json','utf8')) : [];
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
    topMatches: comMatch.slice(0,3)
  });
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
    if (!nome || !celular) return res.json({ ok: false });
    const leads = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
    // Verifica se já existe pelo celular
    const idxExiste = leads.findIndex(l => (l.contato || l.telefone || '').replace(/\D/g,'') === celular.replace(/\D/g,''));
    if (idxExiste === -1) {
      const agora = new Date();
      // Busca dados do imóvel de interesse
      const imoveis = JSON.parse(fs.readFileSync('./imoveis.json', 'utf8'));
      const imovelRef = imoveis.find(i => String(i.idExterno) === String(imovelId)) || {};
      leads.push({
        id: Date.now().toString(),
        nome,
        contato: celular,
        telefone: celular,
        fonte: 'MatchImóveis',
        origem: 'pagina_publica',
        canal: 'WhatsApp',
        imovel_interesse: imovelId,
        titulo_interesse: imovelTitulo,
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
        data_cadastro: agora.toISOString(),
        data_cadastro_br: agora.toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}),
        matches: [],
        matchCount: 0
      });
      fs.writeFileSync('./data.json', JSON.stringify(leads, null, 2));
      console.log('✅ Novo lead salvo:', nome, celular);
    } else {
      // Atualiza fonte e canal se veio da página pública
      leads[idxExiste].fonte = 'MatchImóveis';
      leads[idxExiste].origem = 'pagina_publica';
      leads[idxExiste].canal = 'WhatsApp';
      leads[idxExiste].imovel_interesse = imovelId;
      leads[idxExiste].titulo_interesse = imovelTitulo;
      fs.writeFileSync('./data.json', JSON.stringify(leads, null, 2));
      console.log('✅ Lead existente atualizada:', nome, celular);
    }
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false });
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
  res.render('app-lead-detalhe', { user: req.session.user, lead });
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
