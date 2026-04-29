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
  res.send('MatchImoveis OK');
});


const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

app.post('/app/importar', upload.single('planilha'), async (req, res) => {
  try {
    const xmlUrl = req.body.xmlUrl;
    const file = req.file;

    if (!xmlUrl || !file) {
      return res.send('Informe XML e planilha');
    }

    const { execSync } = require('child_process');

    execSync(`node importXMLCompleto.js "${xmlUrl}" "${file.path}"`, { stdio: 'inherit' });

    res.send('Importação concluída <a href="/app/imoveis">Ver imóveis</a>');
  } catch (err) {
    res.send('Erro: ' + err.message);
  }
});


app.get('/app/cadastro', (req, res) => {
  res.render('app-cadastro');
});


app.post('/app/leads', upload.single('arquivo'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) return res.send('Envie o arquivo');

    const { execSync } = require('child_process');

    execSync(`node processLeads.js "${file.path}"`, { stdio: 'inherit' });

    res.send('Leads processados com sucesso <a href="/app/leads">Ver resultado</a>');
  } catch (err) {
    res.send('Erro: ' + err.message);
  }
});

app.get('/app/imoveis', auth, auth, (req,res)=>{
  const imoveis = loadImoveis();
  res.render('app-imoveis', { imoveis });
});

// ====== START ======


app.get('/app/exportar', (req,res)=>{
  const imoveis = JSON.parse(require('fs').readFileSync('imoveis.json','utf8'));
  res.render('app-exportar',{ imoveis });
});

app.post('/app/exportar', (req,res)=>{
  const ids = [].concat(req.body.ids || []);

  const { execSync } = require('child_process');
  execSync(`node exportXML.js ${ids.join(' ')}`);

  res.download('output.xml');
});


app.get('/app/portais', (req,res)=>{
  const portais = JSON.parse(require('fs').readFileSync('portais.json','utf8'));
  res.render('app-portais',{ portais });
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
  res.render('app-perfil', { user: req.session.user });
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


app.get('/app', (req, res) => {
  res.render('app-home', { perfil: 'corretor', nome: 'Mario Sergio' });
});

app.get('/app-home', (req, res) => {
  res.render('app-home', { perfil: 'corretor', nome: 'Mario Sergio' });
});

app.get('/app', (req, res) => {
  res.redirect('/app-home');
});



// ===== ROTAS APP UX NOVO =====
app.get('/app', (req,res)=>res.redirect('/app-home'));
app.get('/app-home', (req,res)=>res.render('app-home', { perfil:'corretor', nome:'Mario Sergio' }));
app.get('/app-cadastro', (req,res)=>res.render('app-cadastro', { perfil:'corretor', nome:'Mario Sergio' }));


app.post('/app-xml-gerar', (req,res)=>{
  const fs=require('fs');
  const { savePortalXML } = require('./services/xmlVivaReal');
  const data=fs.existsSync('data.json') ? JSON.parse(fs.readFileSync('data.json','utf8')) : [];
  const arr=Array.isArray(data)?data:(data.results||[]);
  let ids=req.body.ids || [];
  if(!Array.isArray(ids)) ids=[ids];
  const selected=ids.map(i=>arr[Number(i)]).filter(Boolean);
  if(!selected.length) return res.status(400).send('Selecione pelo menos um imóvel para gerar o XML.');
  const file=savePortalXML(selected, req.body.portal || 'canalpro');
  res.download(file);
});


app.get('/app-importar-leads', (req,res)=>{
  res.render('app-importar-leads', { perfil:'corretor', nome:'Mario Sergio' });
});

app.post('/app-importar-leads', (req,res)=>{
  let fontesMatch = req.body.fontesMatch || [];
  if (!Array.isArray(fontesMatch)) fontesMatch = [fontesMatch];

  const siteOrigem = req.body.siteOrigem || '';
  const urlBaseOrigem = req.body.urlBaseOrigem || '';

  res.send(
    'Leads recebidos. Buscar match em: ' + fontesMatch.join(', ') +
    '. Site de origem: ' + (siteOrigem || 'não informado') +
    '. URL base: ' + (urlBaseOrigem || 'não informada') +
    '. Próximo passo: usar site/URL base quando lead tiver ID sem URL.'
  );
});


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
  const leads = carregarLeads();
  const lead = leads.find(l => l.leadId === req.params.leadId);
  if(!lead) return res.status(404).send('Lead não encontrado');

  marcarEtapaLead(lead, 'Cliente visualizou');
  salvarLeads(leads);

  res.render('cliente-oferta', { lead });
});

app.get('/cliente/oferta/:leadId/escolher/:idx', (req,res)=>{
  const leads = carregarLeads();
  const lead = leads.find(l => l.leadId === req.params.leadId);
  if(!lead) return res.status(404).send('Lead não encontrado');

  const idx = Number(req.params.idx);
  lead.imovelEscolhido = lead.matches && lead.matches[idx] ? lead.matches[idx] : null;
  marcarEtapaLead(lead, 'Cliente escolheu imóvel');
  salvarLeads(leads);

  res.send('<h2>Imóvel escolhido com sucesso.</h2><p>Agora você pode solicitar uma visita.</p><a href="/cliente/oferta/'+lead.leadId+'">Voltar</a>');
});

app.get('/cliente/oferta/:leadId/visita/:idx', (req,res)=>{
  const leads = carregarLeads();
  const lead = leads.find(l => l.leadId === req.params.leadId);
  if(!lead) return res.status(404).send('Lead não encontrado');

  const idx = Number(req.params.idx);
  lead.imovelVisita = lead.matches && lead.matches[idx] ? lead.matches[idx] : null;
  marcarEtapaLead(lead, 'Cliente escolheu imóvel');
  marcarEtapaLead(lead, 'Visita solicitada');
  salvarLeads(leads);

  res.send('<h2>Visita solicitada.</h2><p>O corretor vai acompanhar o agendamento.</p><a href="/cliente/oferta/'+lead.leadId+'">Voltar</a>');
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




  res.render('app-imoveis', {
    imoveis,
    perfil: 'corretor',
    nome: 'Mario Sergio'
  });
});


app.get('/app-imoveis', (req, res) => {
  const fs = require('fs');
  const data = fs.existsSync('data.json') ? JSON.parse(fs.readFileSync('data.json','utf8')) : [];
  const arr = Array.isArray(data) ? data : (data.results || []);

  const imoveis = arr.filter(i => {
    const corretor = (i.corretorNome || i.corretor || '').toString().toLowerCase();
    const celular = (i.corretorCelular || '').toString();
    return corretor.includes('mario') || celular.includes('11999965998') || celular.includes('999965998');
  });

  res.render('app-imoveis', {
    imoveis,
    perfil: 'corretor',
    nome: 'Mario Sergio'
  });
});

app.listen(port, ()=>{
  console.log('Servidor rodando em http://localhost:'+port);
});


// ===== APP ROUTES =====
app.get('/app-home', (req, res) => {
  res.render('app-home', { perfil: 'corretor', nome: 'Mario Sergio' });
});

app.get('/app', (req, res) => {
  res.redirect('/app-home');
});


// ===== ROTAS APP =====
app.get('/app-home', (req, res) => res.render('app-home', { perfil: 'corretor', nome: 'Mario Sergio' }));

});
app.get('/app-leads', (req, res) => res.render('app-leads'));
app.get('/app-perfil', (req, res) => res.render('app-perfil'));
app.get('/app-portais', (req, res) => res.render('app-portais'));
app.get('/app-exportar', (req, res) => res.render('app-exportar'));
app.get('/app-cadastro', (req, res) => res.render('app-cadastro'));
app.get('/app-corretor', (req, res) => res.render('app-corretor'));
app.get('/login', (req, res) => res.render('login'));
app.get('/app', (req, res) => res.redirect('/app-home'));
