require("dotenv").config();
const express = require('express');
const cerebroApp = require("./cerebro/index");
const cerebroNLP = require("./services/cerebro-nlp");



const fs = require('fs');
const centralOperacional = require('./services/centralOperacional');
const { aplicarWorkflowVisita } = require('./services/visitaWorkflow');
const path = require('path');

const DATA_DIR = process.env.RENDER
  ? '/opt/render/project/src/data'
  : __dirname;

const BASE_URL = process.env.RENDER
  ? 'https://matchimoveis.onrender.com'
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

app.use(session({
  secret: 'matchimoveis',
  resave: false,
  saveUninitialized: true
}));
const navegacao = require("./cerebro/navegacao");
app.use(navegacao.rastrear); // rastreia navegação para o cérebro

const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());



// ====== HELPERS ======

function loadImoveis() {
  try {

    console.log('BODY LEAD INTERESSE =>');
    console.log(JSON.stringify(req.body,null,2));
    return JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8'));
  } catch {
    return [];
  }
}

// ====== ROTAS ======

app.get('/', (req,res)=>{
  res.redirect('/login');
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

  global.importStatus = {
    status: 'rodando',
    total: 0,
    mensagem: 'Importando XML...'
  };
  global.importUserId = req.body.userId || req.query.userId || (req.session.user ? req.session.user.id : '');
  global.importXmlUrl = xmlUrl;

  res.json({ ok:true, status:'rodando' });

  setTimeout(() => {
    try {
      const { execSync } = require('child_process');
      const userId = global.importUserId || '';
      execSync(`node ${path.join(__dirname,'importXMLCompleto.js')} "${xmlUrl}" "${userId}"`, { stdio: 'inherit' });

      const fs = require('fs');
      const imoveis = fs.existsSync(dataFile('imoveis.json'))
        ? JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8'))
        : [];

      global.importStatus = {
        status: 'finalizado',
        total: imoveis.length,
        mensagem: 'Importação concluída'
      };
      try {
        const users = JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8'));
        const idx = users.findIndex(u => u.id === global.importUserId);
        if (idx >= 0) {
          users[idx].xmlUrl = global.importXmlUrl || users[idx].xmlUrl || '';
          users[idx].xmlAtualizadoEm = new Date().toISOString();
          users[idx].xmlTotal = imoveis.length;
          fs.writeFileSync(dataPath('users.json'), JSON.stringify(users, null, 2));
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
      const userId = req.session.user ? req.session.user.id : '';

      execSync(`node ${path.join(__dirname,'processLeads.js')} "${file.path}" "${userId}"`, { stdio:'inherit', cwd: __dirname });

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

    const userId = req.session.user ? req.session.user.id : ""; execSync(`node ${path.join(__dirname,'processLeads.js')} "${file.path}" "${userId}"`, { stdio: "inherit", cwd: __dirname });

    return res.redirect("/app/leads");

  } catch (err) {
    return res.send("Erro: " + err.message);
  }
});

// CADASTRAR LEAD MANUAL (pelo chat ou formulário)
app.post("/app/leads/manual", auth, (req, res) => {
try {
const fs = require("fs");
const { resolverUsuario } = require("./services/usuarios/resolverUsuario");
const { resolverDestinoVisita } = require("./services/visita/resolverDestinoVisita");
const { nome, tipo, bairro, cidade, estado, valor_imovel, quartos, suites, vagas, area_m2, tipo_operacao } = req.body; const contato = req.body.contato || req.body.celular;
if (!nome || !contato) return res.json({ ok: false, erro: "Nome e contato são obrigatórios" });
const data = fs.existsSync(dataPath("data.json")) ? JSON.parse(fs.readFileSync(dataPath("data.json"), "utf8")) : [];
const userId = req.session.user.id;
const novoLead = {
nome: nome.trim(),
contato: String(contato).replace(/\D/g,""),
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
fs.writeFileSync(dataPath("data.json"), JSON.stringify(data, null, 2));
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

app.post('/app/portais', (req,res)=>{
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
app.post('/cadastro-secreto', (req,res)=>{
  if((req.query.token||'') !== 'match2025') return res.status(403).send('Acesso negado');
  const {nome,telefone,senha,tipoConta} = req.body;
  const users = fs.existsSync(dataPath('users.json')) ? JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8')) : [];
  const prefixo = tipoConta==='imobiliaria' ? 'imob' : tipoConta==='corretor' ? 'cor' : 'usr';
  const uid = prefixo+'_'+Math.random().toString(36).substring(2,8)+Date.now().toString(36).slice(-4);
  const codigo = (nome||'USR').substring(0,3).toUpperCase()+'-'+Math.floor(1000+Math.random()*9000);
  users.push({id:uid,nome,telefone,celular:telefone,senha,tipo:tipoConta||'corretor',ativo:true,codigoUsuario:codigo});
  fs.writeFileSync(dataPath('users.json'),JSON.stringify(users,null,2));
  res.send('<h2 style="color:green;font-family:Arial">Conta criada!</h2><p>ID: '+uid+'</p><p>Codigo: '+codigo+'</p><a href="/login">Ir para login</a>');
});

app.get('/login', (req,res)=>{
  res.render('login');
});

app.post('/login', (req,res)=>{
  const fs = require('fs');
  const users = JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8'));

  const telefone = String(req.body.telefone || '').replace(/\D/g,'');

  // CADASTRO
  if(req.body.nome && req.body.tipoConta){
    const existe = users.find(u => String(u.telefone || u.celular || '').replace(/\D/g,'') === telefone);
    if(existe) return res.render('login', { error: 'Este celular já está cadastrado. Entre usando apenas o celular.' });

    const prefixo = req.body.tipoConta === 'imobiliaria' ? 'imob' : req.body.tipoConta === 'corretor' ? 'cor' : 'usr';
    const uid = prefixo + '_' + Math.random().toString(36).substring(2,8) + Date.now().toString(36).slice(-4);
    const novo = {
      id: uid,
      nome: req.body.nome,
      telefone,
      celular: telefone,
      tipo: req.body.tipoConta,
      ativo: true,
      codigoUsuario: (req.body.nome||'USR').substring(0,3).toUpperCase() + '-' + telefone.slice(-4)
    };

    users.push(novo);
    fs.writeFileSync(dataPath('users.json'), JSON.stringify(users,null,2));

    req.session.user = novo;
    return res.redirect('/app-home');
  }

  // LOGIN SEM SENHA
  const user = users.find(u => String(u.telefone || u.celular || '').replace(/\D/g,'') === telefone);

  if(!user) return res.render('login', { error: 'Celular não cadastrado. Crie sua conta abaixo.' });

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
  return fs.existsSync(dataFile('leads.json')) ? JSON.parse(fs.readFileSync(dataFile('leads.json'),'utf8')) : [];
}

function salvarLeads(leads){
  const fs = require('fs');
  fs.writeFileSync(dataFile('leads.json'), JSON.stringify(leads,null,2));
}

function marcarEtapaLead(lead, etapa){
  lead.etapaAtual = etapa;
  lead.jornada = lead.jornada || [];
  const atual = lead.jornada.find(j => j.etapa === etapa);
  if(atual){ atual.feito = true; atual.data = new Date().toISOString(); }
  else lead.jornada.push({ etapa, feito:true, data:new Date().toISOString() });
}

app.get('/cliente/oferta/:leadId', (req,res)=>{
  const leads = JSON.parse(fs.readFileSync(dataPath('data.json'),'utf8'));
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

  lead.matches = lead.matchesBase || lead.matches || [];
  registrarHistoricoImovelLead(lead, 'visualizou_vitrine', lead);
  fs.writeFileSync(dataPath('data.json'), JSON.stringify(leads, null, 2));
  res.render('cliente-oferta', {
    user: null,
    lead,
    queryUserId: userIdOferta || lead.userId || lead.usuarioId || lead.corretorId || ''
  });
});

app.get('/cliente/oferta/:leadId/escolher/:idx', (req,res)=>{
  const leads = JSON.parse(fs.readFileSync(dataPath('data.json'),'utf8'));
  const lead = leads.find(l => (l.id || l.leadId) === req.params.leadId);
  if(!lead) return res.status(404).send('Lead não encontrado');
  const idx = Number(req.params.idx);
  lead.imovelEscolhido = lead.matches && lead.matches[idx] ? lead.matches[idx] : null;
  fs.writeFileSync(dataPath('data.json'), JSON.stringify(leads, null, 2));
  res.redirect('/cliente/oferta/'+req.params.leadId);
});

app.get('/cliente/oferta/:leadId/visita/:idx', (req,res)=>{
  const leads = JSON.parse(fs.readFileSync(dataPath('data.json'),'utf8'));
  const lead = leads.find(l => (l.id || l.leadId) === req.params.leadId);
  if(!lead) return res.status(404).send('Lead não encontrado');
  const idx = Number(req.params.idx);
  const matchesDisp = lead.matchesBase || lead.matches || [];
  lead.imovelVisita = matchesDisp[idx] || null;
  lead.visitaSolicitadaEm = new Date().toISOString();
  registrarHistoricoImovelLead(lead, 'visita_solicitada', lead.imovelVisita);
  fs.writeFileSync(dataPath('data.json'), JSON.stringify(leads, null, 2));

  // Gravar em visitas.json vinculado ao dono da lead
  const imovel = lead.imovelVisita || {};
  // Busca proprietario no imoveis.json
  const imoveisBase = fs.existsSync(dataFile('imoveis.json')) ? JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8')) : [];
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
    usuarioDestinoNome: '',
    usuarioDestinoPerfil: '',
    usuarioDestinoTelefone: '',
    userId: lead.userId || lead.codigoUsuario || '',
    corretorId: lead.userId || lead.codigoUsuario || '',
    corretorNome: '',
    corretorTelefone: '',
    proprietarioNome: proprietario.nome || '',
    proprietarioTelefone: (proprietario.telefone || proprietario.celular || '').replace(/\D/g,''),
    imovelUsuarioId: imovelBase ? (imovelBase.userId || imovelBase.usuarioId || '') : '',
    imovelUsuarioNome: imovelBase ? (imovelBase.fonte || '') : '',
    imovelUsuarioTelefone: (() => { const u = JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8')).find(u => u.id === (imovelBase && (imovelBase.userId||imovelBase.usuarioId))); return u ? ((u.celular||u.telefone||'').replace(/\D/g,'')) : ''; })(),
    dataVisita: lead.dataVisita || lead.dataPreferida || '',
    horaVisita: lead.horaVisita || lead.horarioPreferido || '',
    imovelUrl: imovel.url || '',
    status: 'solicitada',
    origem: 'vitrine_cliente',
    fonte: 'MatchImóveis',
    data: new Date().toISOString(),
    data_br: new Date().toLocaleString('pt-BR')
  };
  const visitas = fs.existsSync(dataPath("visitas.json")) ? JSON.parse(fs.readFileSync(dataPath("visitas.json"),"utf8")) : [];
  const visitaComWorkflow = aplicarWorkflowVisita(novaVisita);
  visitas.push(visitaComWorkflow);
  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas, null, 2));

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
app.get('/proprietario/visita/:visitaId', (req, res) => {
  const visitas = fs.existsSync(dataPath("visitas.json")) ? JSON.parse(fs.readFileSync(dataPath("visitas.json"),"utf8")) : [];
  const visita = visitas.find(v => v.id === req.params.visitaId);
  if (!visita) return res.status(404).send('Visita não encontrada');
  res.render('proprietario-visita', { visita });
});

app.post('/proprietario/visita/:visitaId/responder', (req, res) => {
  const visitas = fs.existsSync(dataPath("visitas.json")) ? JSON.parse(fs.readFileSync(dataPath("visitas.json"),"utf8")) : [];
  const idx = visitas.findIndex(v => v.id === req.params.visitaId);
  if (idx === -1) return res.status(404).send('Visita não encontrada');
  
  const { resposta } = req.body;
  visitas[idx].respostaProprietario = resposta;
  visitas[idx].respostaEm = new Date().toISOString();

  if (resposta === 'confirmar') {
    visitas[idx].status = 'confirmada';
    const telCliente = String(visitas[idx].telefone || visitas[idx].contato || '').replace(/D/g,'');
    const dataVisita = visitas[idx].dataVisita || 'em breve';
    const horaVisita = visitas[idx].horaVisita || '';
    const imovelTitulo = visitas[idx].imovelTitulo || visitas[idx].imovelBairro || 'o imóvel';
    const msgCliente = 'Olá ' + (visitas[idx].nome || '') + '! Sua visita ao imóvel *' + imovelTitulo + '* foi confirmada para ' + dataVisita + (horaVisita ? ' às ' + horaVisita : '') + '. Qualquer dúvida, entre em contato!';
    visitas[idx].whatsappClienteLink = telCliente ? 'https://wa.me/55' + telCliente + '?text=' + encodeURIComponent(msgCliente) : '';
    visitas[idx].clienteNotificado = false;
  } else if (resposta === 'indisponivel') {
    visitas[idx].status = 'cancelada';
    // Marca imóvel como inativo
    const imoveisPath = dataPath('imoveis.json');
    const imoveis = JSON.parse(fs.readFileSync(imoveisPath,'utf8'));
    const imovelIdx = imoveis.findIndex(i => String(i.idExterno || i.id) === String(visitas[idx].imovelId));
    if (imovelIdx !== -1) {
      imoveis[imovelIdx].status = 'inativo';
      imoveis[imovelIdx].inativadoEm = new Date().toISOString();
      imoveis[imovelIdx].inativadoPor = 'proprietario';
      fs.writeFileSync(imoveisPath, JSON.stringify(imoveis, null, 2));
      console.log('Imóvel inativado:', visitas[idx].imovelId);
    }
  } else if (resposta === 'remarcar') {
    visitas[idx].status = 'pendente_remarcar';
  }

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas, null, 2));
  try {
    const _notifs = fs.existsSync(dataPath('notificacoes.json')) ? JSON.parse(fs.readFileSync(dataPath('notificacoes.json'),'utf8')) : [];
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
      _notifs.push({ id: Date.now().toString(), tipo: 'visita_proprietario', titulo: _info.titulo, mensagem: _info.msg, usuarioId: _uid, lida: false, criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) });
      // Notifica parceiro dono do imóvel (se diferente do corretor)
      const _parcId = _v.imovelUsuarioId || '';
      if (_parcId && _parcId !== _uid) {
        const _msgParc = {
          confirmar: 'Você confirmou a visita de ' + _cliente + ' ao imóvel ' + _imovel + ' para ' + _data + ' às ' + _hora + '.',
          indisponivel: 'Você informou indisponibilidade do imóvel ' + _imovel + '. O imóvel foi inativado.',
          remarcar: 'Você pediu remarcação da visita de ' + _cliente + ' ao imóvel ' + _imovel + '.'
        }[resposta];
        if (_msgParc) _notifs.push({ id: (Date.now()+1).toString(), tipo: 'visita_proprietario', titulo: _info.titulo, mensagem: _msgParc, usuarioId: _parcId, lida: false, criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) });
      }
      fs.writeFileSync(dataPath('notificacoes.json'), JSON.stringify(_notifs, null, 2));
    }
  } catch(e) { console.log('Erro notif proprietario:', e.message); }
  res.render('proprietario-confirmado', { resposta, visita: visitas[idx] });
});

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

    fs.writeFileSync(dataPath('data.json'), JSON.stringify(data,null,2));

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



app.get('/app', auth, (req,res)=> res.redirect('/app-home'));

app.get('/app/notificacoes', auth, (req,res)=>{
  const notificacoesAll = fs.existsSync(dataPath('notificacoes.json')) ? JSON.parse(fs.readFileSync(dataPath('notificacoes.json'),'utf8')) : [];
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
  const user = req.session.user;
  const todosImoveis = fs.existsSync(dataFile('imoveis.json')) ? JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8')) : [];
  const todosLeads = fs.existsSync(dataPath('data.json')) ? JSON.parse(fs.readFileSync(dataPath('data.json'),'utf8')) : [];
  const todasVisitas = fs.existsSync(dataPath('visitas.json')) ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8')) : [];
  const notificacoes = fs.existsSync(dataPath('notificacoes.json')) ? JSON.parse(fs.readFileSync(dataPath('notificacoes.json'),'utf8')) : [];
  const imoveis = filtrarPorUsuario(todosImoveis, user);
  const leadsArr = filtrarPorUsuario(Array.isArray(todosLeads) ? todosLeads : (todosLeads.results || []), user);
  const visitas = user.tipo === 'admin' ? todasVisitas : todasVisitas.filter(v =>
    String(v.ownerUserId || v.corretorId || v.usuarioDestinoId || "") === String(user.id || "") ||
    String(v.corretorTelefone || v.usuarioDestinoTelefone || '').replace(/D/g,'') === String(user.celular || user.telefone || '').replace(/D/g,'')
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
      taxaMatch: leadsArr.length > 0 ? Math.round((comMatch.length / leadsArr.length) * 100) : 0
    },
    recentes,
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
      ? JSON.parse(fs.readFileSync(dataFile('imoveis.json'), 'utf8'))
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

app.get('/app/imoveis', auth, (req,res)=>{
  const todos = fs.existsSync(dataPath('imoveis.json')) ? JSON.parse(fs.readFileSync(dataPath('imoveis.json'),'utf8')) : [];
  const imoveis = filtrarPorUsuario(todos, req.session.user);
  res.render('app-imoveis', { user: req.session.user, imoveis });
});

app.post('/app/excluir-xml', auth, (req,res)=>{
  const users = JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8'));
  const idx = users.findIndex(u => u.id === req.session.user.id);
  console.log('idx:', idx, 'session id:', req.session.user && req.session.user.id);
  if (idx >= 0) {
    delete users[idx].xmlUrl;
    delete users[idx].xmlAtualizadoEm;
    delete users[idx].xmlTotal;
    fs.writeFileSync(dataPath('users.json'), JSON.stringify(users, null, 2));
  }
  res.redirect('/app/cadastro');
});

app.get('/app/cadastro', auth, (req,res)=>{
  const users = JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8'));
  const u = users.find(u => u.id === req.session.user.id) || {};
  const xmlFeeds = u.xmlUrl ? [{ url: u.xmlUrl, lastSyncAt: u.xmlAtualizadoEm, total: u.xmlTotal }] : [];
  res.render('app-cadastro', { user: req.session.user, xmlFeeds });
});

////app.get('/app/portais', auth, (req,res)=>{
//  const portais = fs.existsSync(dataFile('portais.json')) ? JSON.parse(fs.readFileSync(dataFile('portais.json'),'utf8')) : [];
//  res.render('app-portais', { user: req.session.user, portais });
//});

app.get('/app/perfil', auth, (req,res)=>{
  res.render('app-perfil', { user: req.session.user });
});

app.post('/app/perfil', auth, (req,res)=>{
  const usersFile = 'users.json';
  const users = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile,'utf8')) : [];
  const uid = String(req.session.user.id || '');

  const idx = users.findIndex(u => String(u.id || '') === uid);

  const dados = {
    nome: req.body.nome || '',
    creci: req.body.creci || '',
    cpf: req.body.cpf || '',
    celular: req.body.celular || '',
    telefone: req.body.celular || ''
  };

  if(idx >= 0){
    users[idx] = { ...users[idx], ...dados };
    fs.writeFileSync(usersFile, JSON.stringify(users,null,2));
  }

  req.session.user = { ...req.session.user, ...dados };

  res.redirect('/app/perfil');
});

app.get('/app-importar-leads', auth, (req,res)=>{
  res.render('app-importar-leads', { user: req.session.user, usuario: req.session.user });
});

app.get('/app/importar-leads', auth, (req,res)=>{
  res.redirect('/app-importar-leads');
});

app.get('/app/leads', auth, (req,res)=>{
  const raw = fs.existsSync(dataPath('data.json')) ? JSON.parse(fs.readFileSync(dataPath('data.json'),'utf8')) : [];
  const data = Array.isArray(raw) ? raw : (raw.results || []);
  const leads = filtrarPorUsuario(data, req.session.user);
  // usa matchesBase (base interna) ou matches (externos)
  leads.forEach(l => {
    if (!l.matches || l.matches.length === 0) {
      l.matches = l.matchesBase || [];
      l.matchCount = l.matchCountBase || 0;
    }
  });
  // Leads com match primeiro, depois por data
  leads.sort((a, b) => {
    const aMatch = (a.matches && a.matches.length) ? 1 : 0;
    const bMatch = (b.matches && b.matches.length) ? 1 : 0;
    if (bMatch !== aMatch) return bMatch - aMatch;
    const da = new Date(a.data_cadastro || 0);
    const db = new Date(b.data_cadastro || 0);
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



app.get('/app/visitas', auth, (req,res)=>{
  const todasVisitas = fs.existsSync(dataPath('visitas.json')) ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8')) : [];
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
  if (req.session) req.session.destroy(()=>res.redirect('/login'));
  else res.redirect('/login');
});


// WEBHOOK IMOVELWEB / GRUPO QUINTOANDAR - RECEBE LEADS
app.post('/webhook/imovelweb', (req, res) => {
  try {
    const body = req.body || {};
    const fs = require('fs');

    console.log('📩 LEAD IMOVELWEB RECEBIDO:', body);

    const file = dataPath('data.json');
    let data = [];

    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      data = Array.isArray(raw) ? raw : (raw.results || []);
    }

    const eventId = body.idEvento || body.eventId || body.eventoId || body.id || '';
    const tipoEvento = body.tipoEvento || body.eventType || '';

    const lead = {
      id: Date.now(),
      eventId,
      tipoEvento,

      nome: body.nome || body.name || body.txtNome || '',
      email: body.email || body.txtEmail || '',
      contato: body.telefone || body.phoneNumber || body.phone || body.txtTelefone || '',
      telefone: body.telefone || body.phoneNumber || body.phone || body.txtTelefone || '',
      mensagem: body.mensagem || body.message || body.txtMensagem || '',

      idAnuncio: body.referencia || body.reference || body.clientListingId || body.codigoAnuncio || body.codigoAviso || body.originListingId || '',
      referencia: body.referencia || body.reference || body.clientListingId || '',
      codigoDoAnunciante: body.codigoDoAnunciante || body.internalReference || body.claveInterna || '',

      fonte: 'ImovelWeb',
      origem: 'ImovelWeb',
      origemEntrada: 'webhook_imovelweb',
      leadOrigin: body.leadOrigin || 'MatchImóveis',

      userId: 'admin',
      usuarioId: 'admin',
      corretorId: 'admin',

      status: 'novo',
      processado: false,
      matchCount: 0,
      matches: [],

      data_cadastro: body.dataRegistro || body.registerDate || body.timestamp || new Date().toISOString(),
      createdAt: new Date().toISOString(),

      rawWebhook: body
    };

    const duplicated = eventId && data.some(l => String(l.eventId || '') === String(eventId));

    if (!duplicated) {
      data.push(lead);
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Erro no webhook ImovelWeb:', err);
    res.status(200).send('OK');
  }
});

const PORT = process.env.PORT || port || 3000;

app.post('/app/perfil/localizacao', auth, (req,res)=>{
  const { lat, lng, endereco } = req.body;
  const users = JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8'));
  const idx = users.findIndex(u => u.id === req.session.user.id);
  if(idx >= 0) {
    users[idx].lat = parseFloat(lat);
    users[idx].lng = parseFloat(lng);
    users[idx].endereco = endereco || '';
    req.session.user = users[idx];
    fs.writeFileSync(dataPath('users.json'), JSON.stringify(users, null, 2));
  }
  res.redirect('/app/perfil');
});


app.post('/app/perfil/localizacao', auth, (req,res)=>{
  const { lat, lng, endereco } = req.body;
  const users = JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8'));
  const idx = users.findIndex(u => u.id === req.session.user.id);
  if(idx >= 0) {
    users[idx].lat = parseFloat(lat);
    users[idx].lng = parseFloat(lng);
    users[idx].endereco = endereco || '';
    req.session.user = users[idx];
    fs.writeFileSync(dataPath('users.json'), JSON.stringify(users, null, 2));
  }
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

      const leads = JSON.parse(fs.readFileSync(dataPath('data.json'), 'utf8'));
      const imoveis = fs.existsSync(dataFile('imoveis.json')) ? JSON.parse(fs.readFileSync(dataFile('imoveis.json'), 'utf8')) : [];

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
      fs.writeFileSync(dataPath('data.json'), JSON.stringify(leads, null, 2));

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
      const usersData = fs.existsSync(dataPath('users.json')) ? JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8')) : [];

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
      */

      const leadsAtualizados = JSON.parse(fs.readFileSync(dataPath('data.json'), 'utf8'));
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
        fs.writeFileSync(dataPath('data.json'), JSON.stringify(leadsAtualizados, null, 2));
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
    const fs2 = require('fs');
    const path2 = require('path');
    const leadsPath = path2.join(__dirname, 'data.json');
    if (fs2.existsSync(leadsPath)) {
      const leads = JSON.parse(fs2.readFileSync(leadsPath, 'utf8'));
      const user = req.session.user;
      let total = 0;
      leads
        .filter(l => !l.codigoUsuario || l.codigoUsuario === user.id)
        .forEach(l => {
          if (l.mensagens) {
            total += l.mensagens.filter(m => !m.lida && m.de === 'cliente').length;
          }
        });
      res.locals.mensagensNaoLidas = total;
    } else {
      res.locals.mensagensNaoLidas = 0;
    }
  } catch(e) {
    res.locals.mensagensNaoLidas = 0;
  }
  next();
});



// LIMPAR DADOS DE UMA CONTA — ADMIN
app.get('/admin/limpar-conta/:userId', (req, res) => {
  const fs2 = require('fs');
  const path2 = require('path');
  const userId = req.params.userId;
  const base = '/opt/render/project/src/data';
  const baseLocal = __dirname;

  function limparArquivo(filePath, campo) {
    if (!fs2.existsSync(filePath)) return 0;
    try {
      let dados = JSON.parse(fs2.readFileSync(filePath, 'utf8'));
      const antes = dados.length;
      dados = dados.filter(d => (d.codigoUsuario || d.userId || d.corretor_id || '') !== userId);
      fs2.writeFileSync(filePath, JSON.stringify(dados, null, 2));
      return antes - dados.length;
    } catch(e) { return -1; }
  }

  const resultado = {};
  for (const base2 of [base, baseLocal]) {
    resultado[base2] = {
      leads: limparArquivo(path2.join(base2, 'data.json'), 'codigoUsuario'),
      visitas: limparArquivo(path2.join(base2, 'visitas.json'), 'codigoUsuario'),
      notificacoes: limparArquivo(path2.join(base2, 'notificacoes.json'), 'codigoUsuario'),
    };
  }
  res.json({ ok: true, userId, resultado });
});


// ZERAR LEADS + MENSAGENS WA + NOTIFICACOES DE UMA CONTA
app.get('/admin/zerar-conta-completo/:userId', (req, res) => {
  const fs2 = require('fs');
  const path2 = require('path');
  const userId = req.params.userId;
  const bases = ['/opt/render/project/src/data', '/opt/render/project/src', __dirname];
  const resultado = {};

  for (const base2 of bases) {
    resultado[base2] = {};

    // Zerar leads da conta
    const leadsPath = path2.join(base2, 'data.json');
    if (fs2.existsSync(leadsPath)) {
      try {
        let leads = JSON.parse(fs2.readFileSync(leadsPath, 'utf8'));
        const antes = leads.length;
        leads = leads.filter(l => (l.userId || l.codigoUsuario || '') !== userId);
        // Limpar mensagens WhatsApp de todos os leads
        leads = leads.map(l => { delete l.mensagens; delete l.perfilIA; delete l.matchesAuto; delete l.ultimaMensagem; delete l.ultimaMensagemEm; return l; });
        fs2.writeFileSync(leadsPath, JSON.stringify(leads, null, 2));
        resultado[base2].leads_deletados = antes - leads.length;
        resultado[base2].leads_restantes = leads.length;
      } catch(e) { resultado[base2].leads_erro = e.message; }
    }

    // Zerar notificacoes da conta
    const notifPath = path2.join(base2, 'notificacoes.json');
    if (fs2.existsSync(notifPath)) {
      try {
        let notif = JSON.parse(fs2.readFileSync(notifPath, 'utf8'));
        const antes = notif.length;
        notif = notif.filter(n => (n.userId || n.codigoUsuario || '') !== userId);
        fs2.writeFileSync(notifPath, JSON.stringify(notif, null, 2));
        resultado[base2].notificacoes_deletadas = antes - notif.length;
      } catch(e) { resultado[base2].notif_erro = e.message; }
    }

    // Zerar visitas da conta
    const visitasPath = path2.join(base2, 'visitas.json');
    if (fs2.existsSync(visitasPath)) {
      try {
        let visitas = JSON.parse(fs2.readFileSync(visitasPath, 'utf8'));
        const antes = visitas.length;
        visitas = visitas.filter(v => (v.userId || v.codigoUsuario || '') !== userId);
        fs2.writeFileSync(visitasPath, JSON.stringify(visitas, null, 2));
        resultado[base2].visitas_deletadas = antes - visitas.length;
      } catch(e) { resultado[base2].visitas_erro = e.message; }
    }
  }

  res.json({ ok: true, userId, resultado });
});

// KEEP-ALIVE Evolution API — acorda a cada 10 minutos
setInterval(() => {
  const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
  const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
  fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
    headers: { 'apikey': EVOLUTION_KEY }
  }).then(() => console.log('[KEEP-ALIVE] Evolution API acordada'))
    .catch(() => console.log('[KEEP-ALIVE] Evolution API nao respondeu'));
}, 10 * 60 * 1000); // 10 minutos

// INBOX WHATSAPP
app.get('/app/whatsapp', auth, (req, res) => {
  const leads = JSON.parse(fs.readFileSync(dataPath('data.json'), 'utf8'));
  const user = req.session.user;
  const leadsFiltrados = leads.filter(l => 
    !l.codigoUsuario || l.codigoUsuario === user.id
  );
  res.render('app-whatsapp-inbox', { user, leads: leadsFiltrados, active: 'whatsapp', baseUrl: process.env.BASE_URL || 'http://localhost:3000' });
});


// ENVIAR MENSAGEM WHATSAPP pelo corretor
app.post('/app/lead/:id/whatsapp/enviar', auth, async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ erro: 'texto obrigatorio' });

    const leads = JSON.parse(fs.readFileSync(dataPath('data.json'), 'utf8'));
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
    fs.writeFileSync(dataPath('data.json'), JSON.stringify(leads, null, 2));

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
app.post(['/webhook/whatsapp', '/webhook/whatsapp/*'], async (req, res) => {
  try {
    const body = req.body;
    console.log('[WEBHOOK WA] body completo:', JSON.stringify(body).substring(0, 500));
    const event = body.event;
    const instance = body.instance;
    const data = body.data;

    console.log('[WEBHOOK WA] evento:', event, '| instancia:', instance);

    // Pré-aquece Evolution API em background
    const _EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
    const _EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
    fetch(`${_EVOLUTION_URL}/instance/fetchInstances`, {
      headers: { 'apikey': _EVOLUTION_KEY }
    }).catch(() => {});

    // Só processa mensagens recebidas
    if (event !== 'messages.upsert') {
      return res.status(200).json({ ok: true, ignorado: event });
    }

    const msg = data?.message;
    if (!msg) return res.status(200).json({ ok: true, sem_mensagem: true });

    const fromJid = data.key?.remoteJid || '';
    const fromMe = data.key?.fromMe || false;
    const telefone = fromJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const texto = msg.conversation || msg.extendedTextMessage?.text || msg.buttonsResponseMessage?.selectedDisplayText || '';
    const timestamp = data.messageTimestamp ? new Date(data.messageTimestamp * 1000).toISOString() : new Date().toISOString();

    if (fromMe) return res.status(200).json({ ok: true, ignorado: 'fromMe' });
    if (!telefone || !texto) return res.status(200).json({ ok: true, ignorado: 'sem_telefone_ou_texto' });


    // ── DETECTAR SE É CORRETOR OU LEAD ───────────────────────
    let _usersWH = [];
    try { _usersWH = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'users.json'), 'utf8')); } catch(e) {}
    const _corretorWH = _usersWH.find(u => {
      const fontes = [u.telefone, u.phone, u.contato, u.id, u.userId].filter(Boolean);
      return fontes.some(f => String(f).replace(/\D/g,'').slice(-8) === telefone.slice(-8));
    });

    if (_corretorWH) {
      console.log('[WEBHOOK WA] CORRETOR detectado:', _corretorWH.nome || _corretorWH.id);
      res.status(200).json({ ok: true, modo: 'corretor', usuario: _corretorWH.id });
      setImmediate(async () => {
        try {
          const EU = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
          const EK = process.env.EVOLUTION_KEY || 'match2025evolution';
          const EI = process.env.EVOLUTION_INSTANCE || 'match-corretor';
          const dp = process.env.DATA_FILE || require('path').join(__dirname, 'data.json');
          let leads = [];
          try { leads = JSON.parse(fs.readFileSync(dp, 'utf8')); } catch(e) {}
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
          await fetch(EU + '/message/sendText/' + EI, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': EK }, body: JSON.stringify({ number: telefone, text: resp }) });
          console.log('[WEBHOOK WA] resposta corretor enviada');
        } catch(e) { console.error('[WEBHOOK WA] erro corretor:', e.message); }
      });
      return;
    }

    console.log('[WEBHOOK WA] de:', telefone, '| texto:', texto);

    // ── ENCONTRAR LEADS PATH E LEAD ──────────────────────────
    const fs2 = require('fs');
    const path2 = require('path');
    const possiveisCaminhos = [];
    try {
      const raiz = path2.join(__dirname, 'data.json');
      if (fs2.existsSync(raiz)) possiveisCaminhos.push(raiz);
      const sub = path2.join(__dirname, 'data', 'data.json');
      if (fs2.existsSync(sub)) possiveisCaminhos.push(sub);
      const renderBase = '/opt/render/project/src';
      if (fs2.existsSync(renderBase)) {
        const renderRaiz = path2.join(renderBase, 'data.json');
        if (fs2.existsSync(renderRaiz)) possiveisCaminhos.push(renderRaiz);
        const renderData = path2.join(renderBase, 'data', 'data.json');
        if (fs2.existsSync(renderData)) possiveisCaminhos.push(renderData);
      }
    } catch(e) {}

    // Busca lead pelo telefone
    let leadEncontrado = null;
    let leadsPathAtual = null;
    for (const leadsPath of possiveisCaminhos) {
      try {
        const leads = JSON.parse(fs2.readFileSync(leadsPath, 'utf8'));
        const idx = leads.findIndex(l => {
          const fone = (l.telefone || l.whatsapp || l.contato || l.phone || '').replace(/\D/g, '');
          return fone && fone.slice(-8) === telefone.slice(-8);
        });
        if (idx >= 0) {
          leadEncontrado = leads[idx];
          leadsPathAtual = leadsPath;
          break;
        }
      } catch(e) {}
    }

    // ── RESPONDE IMEDIATAMENTE ────────────────────────────────
    res.status(200).json({
      ok: true,
      telefone,
      texto,
      leadEncontrado: !!leadEncontrado,
      lead: leadEncontrado?.nome || null
    });

    if (!leadEncontrado) {
      console.log('[WEBHOOK WA] lead nao encontrado — criando novo lead automatico:', telefone);
      // Cria lead novo automaticamente a partir do WhatsApp
      const novoLead = {
        id: Date.now().toString(),
        nome: telefone,
        telefone,
        whatsapp: telefone,
        origem: 'whatsapp',
        status: 'novo',
        criadoEm: new Date().toISOString(),
        mensagens: [],
        perfilIA: {},
        score: 0,
        temperatura: 'frio',
        timeline: [],
        eventos: [],
        followUps: []
      };
      // Salva no primeiro data.json encontrado
      if (possiveisCaminhos.length > 0) {
        try {
          leadsPathAtual = possiveisCaminhos[0];
          const leadsExistentes = JSON.parse(fs2.readFileSync(leadsPathAtual, 'utf8'));
          leadsExistentes.push(novoLead);
          fs2.writeFileSync(leadsPathAtual, JSON.stringify(leadsExistentes, null, 2));
          leadEncontrado = novoLead;
          console.log('[WEBHOOK WA] novo lead criado automaticamente:', telefone, '| id:', novoLead.id);
        } catch(e) {
          console.error('[WEBHOOK WA] erro ao criar lead automatico:', e.message);
          return;
        }
      } else {
        console.log('[WEBHOOK WA] nenhum data.json encontrado para salvar lead');
        return;
      }
    }

    // ── MATCH-CORE: 10 CAMADAS EM BACKGROUND ─────────────────
    setImmediate(async () => {
      try {
        const matchCore = require('./cerebro/match-core');
        const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
        const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
        const INSTANCE = process.env.EVOLUTION_INSTANCE || 'match-corretor';

        // Passa lead pelo match-core (10 camadas)
        const leadAtualizado = await matchCore.processar({
          lead: leadEncontrado,
          mensagem: texto,
          canal: 'whatsapp',
          userId: leadEncontrado.codigoUsuario || leadEncontrado.userId || '',
          leadsPath: leadsPathAtual
        });

        console.log('[WEBHOOK WA] match-core concluido | score:', leadAtualizado.score, '| temperatura:', leadAtualizado.temperatura, '| matches:', (leadAtualizado.matchesAuto || []).length);

        // Gera e envia resposta automática
        const respostaTexto = matchCore.gerarResposta(leadAtualizado, texto);
        if (!respostaTexto) {
          console.log('[WEBHOOK WA] sem resposta automatica gerada');
          return;
        }

        const envioRes = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
          body: JSON.stringify({ number: telefone, text: respostaTexto })
        });

        const envioJson = await envioRes.json();
        console.log('[WEBHOOK WA] resposta enviada:', respostaTexto.substring(0, 80), '| status:', envioRes.status);

      } catch(e) {
        console.error('[WEBHOOK WA] erro background match-core:', e.message);
      }
    });

  } catch (err) {
    console.error('[WEBHOOK WA] erro geral:', err.message);
    res.status(200).json({ ok: false, erro: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  // Inicia atualizacao automatica do XML a cada 12h
  try {
//require("./autoUpdateXML.js");
    console.log('[server] autoUpdateXML iniciado');
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
    const uid = req.session.user ? req.session.user.id : ""; execSync(`node ${path.join(__dirname,'processLeads.js')} "${file.path}" "${uid}"`, { stdio: 'inherit', cwd: __dirname });

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
  const imoveis=JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8'));
  const { status } = req.body;

  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id));
  if(idx>=0){
    imoveis[idx].status = status;
    fs.writeFileSync(dataFile('imoveis.json'), JSON.stringify(imoveis,null,2));
  gerarXMLPortais();
  gerarXMLPortais();
  }

  res.json({ok:true});
});

app.post('/imovel/:id/status', (req,res)=>{
  const fs=require('fs');
  const imoveis=JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8'));
  const { status } = req.body;

  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id));
  if(idx>=0){
    imoveis[idx].status = status;
    fs.writeFileSync(dataFile('imoveis.json'), JSON.stringify(imoveis,null,2));
  }

  res.json({ok:true});
});
  res.json(imoveis.slice(0, 50));
});


// Cadastro manual de imóvel
app.post('/app/imovel/cadastrar', auth, (req, res) => {
  const idInterno = 'MI-' + Date.now() + '-' + Math.random().toString(36).substr(2,6).toUpperCase();
  const imoveis = fs.existsSync(dataFile('imoveis.json')) ? JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8')) : [];
  const b = req.body;
  const novo = {
    idInterno: 'APP-' + Date.now(),
    codigoImovel: 'APP-' + Date.now(),
    idExterno: '',
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
  fs.writeFileSync(dataFile('imoveis.json'), JSON.stringify(imoveis, null, 2));
  res.redirect('/app/imoveis');
});

// Detalhe do imóvel


// Salva lead vindo da página pública do imóvel
app.post('/api/lead-interesse', (req, res) => {
  try {
    const { nome, celular, imovelId, imovelTitulo, leadId: leadIdOrigem, userId: userIdOrigem } = req.body;

    if (!nome || !celular || !imovelId) {
      return res.json({ ok: false, error: 'Dados obrigatórios ausentes' });
    }

    const agora = new Date();

    const leads = fs.existsSync(dataPath('data.json'))
      ? JSON.parse(fs.readFileSync(dataPath('data.json'), 'utf8'))
      : [];

    const imoveis = fs.existsSync(dataFile('imoveis.json'))
      ? JSON.parse(fs.readFileSync(dataFile('imoveis.json'), 'utf8'))
      : [];

    const imovelRef = imoveis.find(i =>
      String(i.idExterno) === String(imovelId) ||
      String(i.id) === String(imovelId) ||
      String(i.idOriginal) === String(imovelId)
    ) || {};

    // Dono da lead/vitrine: quem gerou/importou a lead
    let leadOrigem = {};

    if (leadIdOrigem && userIdOrigem) {
      leadOrigem = leads.find(l =>
        String(l.id || l.leadId || '') === String(leadIdOrigem || '') &&
        String(l.userId || l.usuarioId || l.corretorId || '') === String(userIdOrigem || '')
      ) || {};
    }

    if (!leadOrigem.id && leadIdOrigem) {
      leadOrigem = leads.find(l =>
        String(l.id || l.leadId || '') === String(leadIdOrigem || '')
      ) || {};
    }

    const usuarioDestinoId =
      userIdOrigem || leadOrigem.userId || leadOrigem.usuarioId || leadOrigem.corretorId ||
      imovelRef.usuarioId || imovelRef.corretorId || '';

    const usuarioDestinoNome =
      leadOrigem.usuarioNome || leadOrigem.corretorNome ||
      imovelRef.usuarioNome || imovelRef.corretorNome || '';

    const usuarioDestinoPerfil =
      leadOrigem.usuarioPerfil || leadOrigem.perfil ||
      imovelRef.usuarioPerfil || imovelRef.perfil || '';

    const usuarioDestinoTelefone =
      leadOrigem.usuarioTelefone || leadOrigem.corretorTelefone ||
      imovelRef.usuarioTelefone || imovelRef.corretorTelefone || '';

    const imovelOwnerId = imovelRef.usuarioId || imovelRef.corretorId || '';

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

    if (idxExiste === -1) {
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

    fs.writeFileSync(dataPath('data.json'), JSON.stringify(leads, null, 2));

    // Só cria visita quando a ação for solicitação de visita
    const querVisita =
      req.body.querVisita === 'true' ||
      req.body.solicitarVisita === 'true' ||
      req.body.visita === 'true' ||
      req.body.tipo === 'visita' ||
      req.body.acao === 'visita' ||
      req.body.acao === 'solicitar_visita';

    if (querVisita) {
      const visitas = fs.existsSync(dataPath('visitas.json'))
        ? JSON.parse(fs.readFileSync(dataPath('visitas.json'), 'utf8'))
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
        proprietarioNome: (imovelRef.proprietario && imovelRef.proprietario.nome) || '',
        proprietarioTelefone: ((imovelRef.proprietario && (imovelRef.proprietario.telefone || imovelRef.proprietario.celular)) || '').replace(/\D/g,''),

        // Visita vai somente para o dono da lead/vitrine
        leadOwnerId: usuarioDestinoId,
        imovelOwnerId,
        usuarioDestinoId,
        usuarioDestinoNome,
        usuarioDestinoPerfil,
        usuarioDestinoTelefone,
        userId: usuarioDestinoId,
        corretorId: usuarioDestinoId,
        corretorNome: usuarioDestinoNome,
        corretorTelefone: usuarioDestinoTelefone,

        status: 'solicitada',
        origem: 'pagina_externa_imovel', extractionStatus: 'ok',
        fonte: 'MatchImóveis',
        data: agora.toISOString(),
        data_br: agora.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' })
      });

      fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas, null, 2));

      try {
        const notificacoes = fs.existsSync(dataPath('notificacoes.json'))
          ? JSON.parse(fs.readFileSync(dataPath('notificacoes.json'), 'utf8'))
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
          criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
        });

        fs.writeFileSync(dataPath('notificacoes.json'), JSON.stringify(notificacoes, null, 2));
        console.log('🔔 Notificação criada: nova visita');
      } catch(e) {
        console.log('Erro ao criar notificação:', e.message);
      }

      console.log('📅 Visita criada para o dono da lead/vitrine:', usuarioDestinoNome || usuarioDestinoId || 'sem dono');
    }

    return res.json({ ok: true, leadId, visitaCriada: querVisita });
  } catch(e) {
    console.log('Erro em /api/lead-interesse:', e.message);
    return res.json({ ok: false, error: e.message });
  }
});

// Página pública do imóvel — sem login
app.get('/imovel/:id', (req, res) => {
  const imoveis = JSON.parse(fs.readFileSync(dataFile('imoveis.json'), 'utf8'));
  const users = JSON.parse(fs.readFileSync(dataPath('users.json'), 'utf8'));
  const corretor = users.find(u => u.ativo) || {};

  // Busca na base interna primeiro
  let imovel = imoveis.find(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id) || String(i.id) === String(req.params.id));

  if (imovel) {
    const pub = Object.assign({}, imovel);
    delete pub.proprietario;
    delete pub.proprietario_celular;
    delete pub.proprietario_email;
    return res.render('imovel-publico', { imovel: pub, corretor });
  }

  // Busca nos matches do QuintoAndar
  const leads = JSON.parse(fs.readFileSync(dataPath('data.json'), 'utf8'));
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
app.get('/app/lead/:id', auth, (req, res) => {
  const leads = JSON.parse(fs.readFileSync(dataPath('data.json'), 'utf8'));
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

  fs.writeFileSync(dataPath('data.json'), JSON.stringify(leads, null, 2));

  const visitas = fs.existsSync(dataPath("visitas.json")) ? JSON.parse(fs.readFileSync(dataPath("visitas.json"),"utf8")) : [];

  const visitasDaLead = visitas.filter(v =>
    String(v.leadId || v.lead_id || '') === String(lead.leadId || '') ||
    String(v.leadId || v.lead_id || '') === String(lead.id || '') ||
    String(v.proprietarioTelefone || v.contato || '').replace(/\D/g,'') === String(lead.telefone || lead.contato || '').replace(/\D/g,'') ||
    String(v.email || '').toLowerCase() === String(lead.email || '').toLowerCase()
  );

  const imoveisInternos = fs.existsSync(dataFile('imoveis.json')) ? JSON.parse(fs.readFileSync(dataFile('imoveis.json'), 'utf8')) : [];

  let matchesInternos = [];
  try {
    const { buscarMatchesBaseInterna } = require('./matchBaseInterna');
    matchesInternos = buscarMatchesBaseInterna(lead, imoveisInternos);

    lead.matches = (matchesInternos || []).map((m,idx) => {
      const score = Number(m.score || m.bestScore || m.matchScore || m.pontuacao || 0);
      return {
        ...m,
        rank: m.rank || idx + 1,
        score,
        bestScore: score
      };
    });
    lead.matchCount = lead.matches.length;
    lead.bestScore = lead.matches[0] ? lead.matches[0].score : 0;
    fs.writeFileSync(dataPath('data.json'), JSON.stringify(leads, null, 2));
  } catch(e) {
    console.error('Erro match base interna lead:', e.message);
    matchesInternos = [];
  }

  let sugestoesCopiloto = [];
  try {
    const { gerarSugestoes } = require('./cerebro/copiloto');
    sugestoesCopiloto = gerarSugestoes(lead);
  } catch(e) { console.error('copiloto erro:', e.message); }
  res.render('app-lead-detalhe', { user: req.session.user, lead, visitasDaLead, matchesInternos, sugestoesCopiloto });
});
app.get('/app/imovel/:id', auth, (req, res) => {
  const imoveis = JSON.parse(fs.readFileSync(dataFile('imoveis.json'), 'utf8'));
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
  const imoveis = fs.existsSync(dataFile('imoveis.json')) ? JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8')) : [];
  const imovel = imoveis.find(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id) || String(i.id) === String(req.params.id));

  if(!imovel){
    return res.send('Imóvel não encontrado. <a href="/app/imoveis">Voltar</a>');
  }

  res.render('app-editar-imovel', { user: req.session.user, imovel, salvo: req.query.salvo === '1' });
});

// Editar imóvel - salvar
app.post('/app/imovel/:id/editar', auth, (req,res)=>{
  const fs = require('fs');
  const imoveis = fs.existsSync(dataFile('imoveis.json')) ? JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8')) : [];
  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id) || String(i.id) === String(req.params.id));

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
    endereco: req.body.endereco || '',
    numero: req.body.numero || '',
    complemento: req.body.complemento || '',
    cep: req.body.cep || '',
    latitude: Number(req.body.latitude || 0) || null,
    longitude: Number(req.body.longitude || 0) || null,
    andar: req.body.andar || '',
    valor_imovel: Number(req.body.valor_imovel || 0),
    condominio: Number(req.body.condominio || 0),
    iptu: Number(req.body.iptu || 0),
    area_m2: Number(req.body.area_m2 || 0),
    area_total: Number(req.body.area_total || 0),
    quartos: Number(req.body.quartos || 0),
    suites: Number(req.body.suites || 0),
    banheiros: Number(req.body.banheiros || 0),
    vagas: Number(req.body.vagas || 0),
    descricao: req.body.descricao || '',
    descricaoEditada: true,
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
      '123i': !!req.body.portal_123i,
      quintoandar: !!req.body.portal_quintoandar
    },
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(dataFile('imoveis.json'), JSON.stringify(imoveis,null,2));

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
  const imoveis = JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8'));

  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id));
  if(idx >= 0){
    const url = '/uploads/imoveis/' + req.file.filename;
    imoveis[idx].fotos = imoveis[idx].fotos || [];
    imoveis[idx].fotos.push(url);
    fs.writeFileSync(dataFile('imoveis.json'), JSON.stringify(imoveis,null,2));
  }

  res.redirect('/app/imovel/' + req.params.id + '/editar');
});

// Excluir foto
app.post('/app/imovel/:id/excluir-foto', auth, (req,res)=>{
  const fs = require('fs');
  const { foto } = req.body;

  const imoveis = JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8'));
  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id));

  if(idx >= 0){
    imoveis[idx].fotos = (imoveis[idx].fotos || []).filter(f => f !== foto);
    fs.writeFileSync(dataFile('imoveis.json'), JSON.stringify(imoveis,null,2));
  }

  res.redirect('/app/imovel/' + req.params.id + '/editar');
});

// Definir foto de capa
app.post('/app/imovel/:id/capa-foto', auth, (req,res)=>{
  const fs = require('fs');
  const { foto } = req.body;

  const imoveis = JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8'));
  const idx = imoveis.findIndex(i => String(i.idExterno) === String(req.params.id) || String(i.idInterno) === String(req.params.id) || String(i.codigoImovel) === String(req.params.id));

  if(idx >= 0){
    let fotos = imoveis[idx].fotos || [];
    fotos = fotos.filter(f => f !== foto);
    fotos.unshift(foto);
    imoveis[idx].fotos = fotos;
    fs.writeFileSync(dataFile('imoveis.json'), JSON.stringify(imoveis,null,2));
  }

  res.redirect('/app/imovel/' + req.params.id + '/editar');
});

// =========================
// GERAR XML PORTAIS (VivaReal padrão)
// =========================
function gerarXMLPortais(){
  const fs = require('fs');
  const imoveis = JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8'));

  const portais = ['olx','zap','vivareal','chaves','imovelweb','123i','quintoandar'];

  portais.forEach(portal => {

    const filtrados = imoveis.filter(i =>
      i.status === 'publicado' &&
      i.portais &&
      i.portais[portal]
    );

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<listingDataFeed>
  <header>
    <provider>Rankim</provider>
    <email>renato@rankim.com.br</email>
  </header>
  <listings>
`;

    filtrados.forEach(i => {
      xml += `
    <listing>
      <listingID>${i.id || i.idExterno}</listingID>
      <externalID>${i.idExterno || i.idOriginal || ''}</externalID>
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

    if(portal === 'quintoandar'){
      require('child_process').execSync('node exportXML.js quintoandar', { stdio:'inherit' });
      console.log('XML QuintoAndar gerado no padrão novo');
    } else {
      fs.writeFileSync(dataPath(`feed-${portal}.xml`), xml);
      console.log(`XML gerado: feed-${portal}.xml (${filtrados.length} imóveis)`);
    }
  });
}

// =========================
// GERAR XML PORTAIS (VivaReal padrão)
// =========================
function gerarXMLPortais(){
  const fs = require('fs');
  const imoveis = JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8'));

  const portais = ['olx','zap','vivareal','chaves','imovelweb','123i','quintoandar'];

  portais.forEach(portal => {

    const filtrados = imoveis.filter(i =>
      i.status === 'publicado' &&
      i.portais &&
      i.portais[portal]
    );

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<listingDataFeed>
  <header>
    <provider>Rankim</provider>
    <email>renato@rankim.com.br</email>
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

    fs.writeFileSync(dataPath(`feed-${portal}.xml`), xml);
    console.log(`XML gerado: feed-${portal}.xml (${filtrados.length} imóveis)`);
  });
}


app.post('/app/visitas/confirmar/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {
    if(String(v.id) === String(req.params.id)){
      v.status = 'CONFIRMADA';
      v.confirmedAt = new Date().toISOString();
    }
    return v;
  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});




app.post('/app/visitas/recusar/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {
    if(v.id === req.params.id){
      v.status = 'recusada';
      v.refusedAt = new Date().toISOString();
    }
    return v;
  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

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


// Retorna IDs de todos os imóveis ativos do usuário (para gerar XML pelo chat)
app.get('/app/imoveis-ids', auth, (req, res) => {
  const todos = fs.existsSync(dataPath('imoveis.json')) ? JSON.parse(fs.readFileSync(dataPath('imoveis.json'), 'utf8')) : [];
  const filtrados = filtrarPorUsuario(todos, req.session.user);
  const ativos = filtrados.filter(i => (i.status||'ativo').toLowerCase() === 'ativo');
  const ids = ativos.map(i => String(i.idExterno || i.id));
  res.json({ ids, total: ids.length });
});

app.post('/app/gerar-xml', auth, (req,res)=>{
  const { portal, ids } = req.body;
  const todos = fs.existsSync(dataFile('imoveis.json')) ? JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8')) : [];
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

function gerarXMLPortal(imoveis, portal){

  if(portal === 'quintoandar'){
    const esc = v => String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ListingDataFeed>\n  <Header>\n    <Provider>Rankim</Provider>\n    <Email>renato@rankim.com.br</Email>\n    <BatchId>matchimoveis-'+Date.now()+'</BatchId>\n    <BatchName>MatchImoveis QuintoAndar '+new Date().toISOString()+'</BatchName>\n  </Header>\n  <Listings>\n';

    imoveis.forEach(i => {
      const prop = i.proprietario || {};
      const fotos = Array.isArray(i.fotos) ? i.fotos : [];
      xml += '\n    <Listing>\n';
      xml += '      <ListingID>'+esc(i.idExterno || i.idOriginal || i.id)+'</ListingID>\n';
      xml += '      <Title>'+esc(i.titulo || ((i.tipo || 'Imóvel')+' em '+(i.bairro || '')))+'</Title>\n';
      xml += '      <TransactionType>For Sale</TransactionType>\n';
      xml += '      <PublicationType>STANDARD</PublicationType>\n';
      xml += '      <Created_at>'+esc(i.createdAt || i.dataCadastro || '')+'</Created_at>\n';
      xml += '      <Updated_at>'+esc(i.lastUpdate || i.updatedAt || i.ultimaAtualizacao || '')+'</Updated_at>\n';
      xml += '      <DetailViewUrl>'+esc(i.url || i.link || '')+'</DetailViewUrl>\n';
      xml += '      <VirtualTourLink>'+esc(i.tourVirtual || '')+'</VirtualTourLink>\n';
      xml += '      <Details>\n';
      xml += '        <UsageType>Residential</UsageType>\n';
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
      xml += '      </Details>\n';
      xml += '      <Media>\n';
      fotos.forEach((f, idx) => {
        const url = typeof f === 'string' ? f : f.url;
        xml += '        <Item primary="'+(idx===0?'true':'false')+'" type="IMAGE">'+esc(url)+'</Item>\n';
      });
      xml += '      </Media>\n';
      xml += '      <Location>\n';
      xml += '        <Country abbreviation="BR">Brasil</Country>\n';
      xml += '        <State abbreviation="SP">São Paulo</State>\n';
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
      xml += '        <Name>Rankim</Name>\n';
      xml += '        <Email>renato@rankim.com.br</Email>\n';
      xml += '        <Website></Website>\n';
      xml += '        <Logo></Logo>\n';
      xml += '        <OfficeName>Rankim</OfficeName>\n';
      xml += '        <Telephone></Telephone>\n';
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

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<listingDataFeed>
  <header>
    <provider>Rankim</provider>
    <email>renato@rankim.com.br</email>
  </header>
  <listings>
`;
  imoveis.forEach(i => {
    xml += `
    <listing>
      <listingID>${i.idExterno || i.id}</listingID>
      <title>${i.tipo || ''} em ${i.bairro || ''}</title>
      <description>${(i.descricao || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</description>
      <price>${i.valor_imovel || 0}</price>
      <livingArea>${i.area_m2 || 0}</livingArea>
      <bedrooms>${i.quartos || 0}</bedrooms>
      <bathrooms>${i.banheiros || 0}</bathrooms>
      <suites>${i.suites || 0}</suites>
      <garageSpaces>${i.vagas || 0}</garageSpaces>
      <propertyType>${i.tipo || ''}</propertyType>
      <transactionType>${i.transacao || 'venda'}</transactionType>
      <address>
        <street>${i.endereco || ''}</street>
        <neighborhood>${i.bairro || ''}</neighborhood>
        <city>${i.cidade || ''}</city>
        <state>${i.estado || 'SP'}</state>
        <zipCode>${i.cep || ''}</zipCode>
      </address>
      <broker>
        <name>${i.corretorNome || ''}</name>
        <email>${i.corretorEmail || ''}</email>
        <phone>${i.corretorTelefone || ''}</phone>
      </broker>

      <media>
        ${(i.fotos||[]).map(f=>`<image><url>${f}</url></image>`).join('\n        ')}
      </media>
    </listing>`;
  });
  xml += `\n  </listings>\n</listingDataFeed>`;
  return xml;
}

function gerarXMLPortal(imoveis, portal){
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<listingDataFeed>
  <header>
    <provider>Rankim</provider>
    <email>renato@rankim.com.br</email>
  </header>
  <listings>
`;
  imoveis.forEach(i => {
    const prop = i.proprietario || {};
    xml += `
    <listing>
      <listingID>${i.idExterno || i.id}</listingID>
      <title>${i.tipo || ''} em ${i.bairro || ''}</title>
      <description>${(i.descricao || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</description>
      <price>${i.valor_imovel || 0}</price>
      <livingArea>${i.area_m2 || 0}</livingArea>
      <bedrooms>${i.quartos || 0}</bedrooms>
      <bathrooms>${i.banheiros || 0}</bathrooms>
      <suites>${i.suites || 0}</suites>
      <garageSpaces>${i.vagas || 0}</garageSpaces>
      <propertyType>${i.tipo || ''}</propertyType>
      <transactionType>${i.transacao || 'venda'}</transactionType>
      <address>
        <street>${i.endereco || ''}</street>
        <neighborhood>${i.bairro || ''}</neighborhood>
        <city>${i.cidade || ''}</city>
        <state>${i.estado || 'SP'}</state>
        <zipCode>${i.cep || ''}</zipCode>
      </address>
      ${prop.nome ? `<owner>
        <name>${prop.nome}</name>
        <phone>${prop.telefone || prop.celular || ''}</phone>
        <email>${prop.email || ''}</email>
        <reference>${prop.referenciaTecimob || ''}</reference>
      </owner>` : ''}
      <broker>
        <name>${i.corretorNome || ''}</name>
        <email>${i.corretorEmail || ''}</email>
        <phone>${i.corretorTelefone || ''}</phone>
      </broker>

      <media>
        ${(i.fotos||[]).map(f=>`<image><url>${f}</url></image>`).join('\n        ')}
      </media>
    </listing>`;
  });
  xml += `\n  </listings>\n</listingDataFeed>`;
  return xml;
}

function gerarXMLPortal(imoveis, portal){

  if(portal === 'quintoandar'){
    const esc = v => String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ListingDataFeed>\n  <Header>\n    <Provider>Rankim</Provider>\n    <Email>renato@rankim.com.br</Email>\n    <BatchId>matchimoveis-'+Date.now()+'</BatchId>\n    <BatchName>MatchImoveis QuintoAndar '+new Date().toISOString()+'</BatchName>\n  </Header>\n  <Listings>\n';

    imoveis.forEach(i => {
      const prop = i.proprietario || {};
      const fotos = Array.isArray(i.fotos) ? i.fotos : [];
      xml += '\n    <Listing>\n';
      xml += '      <ListingID>'+esc(i.idExterno || i.idOriginal || i.id)+'</ListingID>\n';
      xml += '      <Title>'+esc(i.titulo || ((i.tipo || 'Imóvel')+' em '+(i.bairro || '')))+'</Title>\n';
      xml += '      <TransactionType>For Sale</TransactionType>\n';
      xml += '      <PublicationType>STANDARD</PublicationType>\n';
      xml += '      <Details>\n';
      xml += '        <UsageType>Residential</UsageType>\n';
      xml += '        <PropertyType>'+esc(i.tipo || 'Apartamento')+'</PropertyType>\n';
      xml += '        <Description>'+esc(i.descricao || '')+'</Description>\n';
      xml += '        <ListPrice currency="BRL">'+(i.valor_imovel || i.valor || 0)+'</ListPrice>\n';
      xml += '        <LivingArea unit="square metres">'+(i.area_m2 || i.area || 0)+'</LivingArea>\n';
      xml += '        <Bedrooms>'+(i.quartos || 0)+'</Bedrooms>\n';
      xml += '        <Bathrooms>'+(i.banheiros || 0)+'</Bathrooms>\n';
      xml += '        <Suites>'+(i.suites || 0)+'</Suites>\n';
      xml += '        <Garage>'+(i.vagas || 0)+'</Garage>\n';
      xml += '      </Details>\n';
      xml += '      <Media>\n';
      fotos.forEach((f, idx) => {
        const url = typeof f === 'string' ? f : f.url;
        xml += '        <Item primary="'+(idx===0?'true':'false')+'" type="IMAGE">'+esc(url)+'</Item>\n';
      });
      xml += '      </Media>\n';
      xml += '      <Location>\n';
      xml += '        <Country abbreviation="BR">Brasil</Country>\n';
      xml += '        <State abbreviation="SP">São Paulo</State>\n';
      xml += '        <City>'+esc(i.cidade || 'São Paulo')+'</City>\n';
      xml += '        <Neighborhood>'+esc(i.bairro || '')+'</Neighborhood>\n';
      xml += '        <Address>'+esc(i.endereco || i.logradouro || '')+'</Address>\n';
      xml += '        <PostalCode>'+esc(i.cep || '')+'</PostalCode>\n';
      xml += '      </Location>\n';
      xml += '      <OwnerInfo>\n';
      xml += '        <Name>'+esc(prop.nome || '')+'</Name>\n';
      xml += '        <Email>'+esc(prop.email || '')+'</Email>\n';
      xml += '        <Telephone>'+esc(prop.telefone || prop.celular || '')+'</Telephone>\n';
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

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<listingDataFeed>
  <header>
    <provider>Rankim</provider>
    <email>renato@rankim.com.br</email>
  </header>
  <listings>
`;
  imoveis.forEach(i => {
    const prop = i.proprietario || {};
    xml += `
    <listing>
      <listingID>${i.idExterno || i.id}</listingID>
      <title>${i.tipo || ''} em ${i.bairro || ''}</title>
      <description>${(i.descricao || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</description>
      <price>${i.valor_imovel || 0}</price>
      <livingArea>${i.area_m2 || 0}</livingArea>
      <bedrooms>${i.quartos || 0}</bedrooms>
      <bathrooms>${i.banheiros || 0}</bathrooms>
      <suites>${i.suites || 0}</suites>
      <garageSpaces>${i.vagas || 0}</garageSpaces>
      <propertyType>${i.tipo || ''}</propertyType>
      <transactionType>${i.transacao || 'venda'}</transactionType>
      <address>
        <street>${i.endereco || ''}</street>
        <neighborhood>${i.bairro || ''}</neighborhood>
        <city>${i.cidade || ''}</city>
        <state>${i.estado || 'SP'}</state>
        <zipCode>${i.cep || ''}</zipCode>
      </address>
      ${prop.nome ? `<owner>
        <name>${prop.nome}</name>
        <phone>${prop.telefone || prop.celular || ''}</phone>
        <email>${prop.email || ''}</email>
        <reference>${prop.referenciaTecimob || ''}</reference>
      </owner>` : ''}
      <broker>
        <name>${i.corretorNome || ''}</name>
        <email>${i.corretorEmail || ''}</email>
        <phone>${i.corretorTelefone || ''}</phone>
      </broker>

      <media>
        ${(i.fotos||[]).map(f=>`<image><url>${f}</url></image>`).join('\n        ')}
      </media>
    </listing>`;
  });
  xml += `\n  </listings>\n</listingDataFeed>`;
  return xml;
}

app.get('/app/portais', auth, (req,res)=>{
  const portais = ['olx','zap','vivareal','chaves','imovelweb','123i','quintoandar'];
  const todos = fs.existsSync(dataFile('imoveis.json')) ? JSON.parse(fs.readFileSync(dataFile('imoveis.json'),'utf8')) : [];
  const imoveis = filtrarPorUsuario(todos, req.session.user);
  const token = req.session.user.id.replace(/[^a-z0-9]/gi,'-');
  const xmlFeeds = portais.map(portal => {
    const filename = 'feed-'+portal+'-'+token+'.xml';
    let total = 0;
    let existe = false;
    let geradoEm = null;
    const filepath = dataPath(filename);
    if(fs.existsSync(filepath)){
      existe = true;
      const stat = fs.statSync(filepath);
      geradoEm = new Date(stat.mtime).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
      const conteudo = fs.readFileSync(filepath,'utf8');
      total = (conteudo.match(/<[Ll]isting>/g)||[]).length;
    }
    return { portal, filename, url: '/'+filename, existe, total, geradoEm };
  });
  res.render('app-portais', { user: req.session.user, xmlFeeds });
});

// Limpar descrições de imóveis de uma conta
app.get('/admin/limpar-descricoes/:userId', (req,res)=>{
  const userId = req.params.userId;
  const todos = fs.existsSync(dataPath('imoveis.json'))
    ? JSON.parse(fs.readFileSync(dataPath('imoveis.json'),'utf8')) : [];
  let count = 0;
  const atualizados = todos.map(i => {
    if(String(i.userId||i.usuarioId||i.corretorId||'') !== userId) return i;
    if(i.descricaoEditada) return i; // preservar descrições editadas manualmente
    let d = i.descricao || '';
    // remover "Agende já/ja a sua visita com o corretor..."
    // remover "As informações estão sujeitas a alterações"
    d = d.replace(/Ass+informa[çc][õo]ess+(est[ãa]os+)?sujeitas?s+as+altera[çc][õo]es[^.]*./gi, '');
    // remover "Chave do anúncio: XXXXX"
    d = d.replace(/Chaves+dos+an[úu]ncios*:s*S+/gi, '');
    // remover dados de contato (telefones e emails no texto)
    d = d.replace(/Cel.?s*[(d][ds()-.]+d/gi, '');
    // remover espaços duplos
    d = d.replace(/s{2,}/g, ' ').trim();
    if(d !== i.descricao){ count++; }
    return { ...i, descricao: d };
  });
  fs.writeFileSync(dataPath('imoveis.json'), JSON.stringify(atualizados,null,2));
  res.json({ ok: true, limpos: count, total: atualizados.filter(i=>String(i.userId||'')===userId).length });
});

// Diagnostico descricoes
app.get("/admin/diagnostico-descricoes/:userId",(req,res)=>{
  const userId=req.params.userId;
  const todos=fs.existsSync(dataPath("imoveis.json"))?JSON.parse(fs.readFileSync(dataPath("imoveis.json"),"utf8")):[]; 
  const meus=todos.filter(i=>String(i.userId||i.usuarioId||i.corretorId||"")=== userId);
  const comMario=meus.filter(i=>i.descricao&&i.descricao.toLowerCase().includes("mario"));
  const comAgende=meus.filter(i=>i.descricao&&i.descricao.toLowerCase().includes("agende"));
  const exemplo=comMario[0]?comMario[0].descricao.slice(-400):"nenhum";
  res.json({total:meus.length,comMario:comMario.length,comAgende:comAgende.length,exemplo});
});

// Limpar descricoes
app.get("/admin/limpar-descricoes/:userId",(req,res)=>{
  const userId=req.params.userId;
  const todos=fs.existsSync(dataPath("imoveis.json"))?JSON.parse(fs.readFileSync(dataPath("imoveis.json"),"utf8")):[]; 
  let count=0;
  const cortar=["aproveite e a oportunidade agende","aproveite essa oportunidade agende","agende agora mesmo sua visita","agende ja a sua visita","agende sua visita","agende agora","as informações estão sujeitas","as informacoes estao sujeitas","chave do anúncio","chave do anuncio"];
  const remover=["mario sergio","mário sérgio","11999965998","11 9.9996.5998","adv.mssouza"];
  const atualiz=todos.map(i=>{
    if(String(i.userId||i.usuarioId||i.corretorId||"")!==userId)return i;
    let d=i.descricao||"";
    const orig=d;
    const dl=d.toLowerCase();
    cortar.forEach(f=>{const x=dl.indexOf(f);if(x>-1)d=d.substring(0,x).trim();});
    remover.forEach(t=>{d=d.replace(new RegExp(t,"gi"),"");});
    d=d.replace(/ {2,}/g," ").trim();
    if(d!==orig)count++;
    return{...i,descricao:d};
  });
  fs.writeFileSync(dataPath("imoveis.json"),JSON.stringify(atualiz,null,2));
  res.json({ok:true,limpos:count,total:todos.filter(i=>String(i.userId||i.corretorId||"")=== userId).length});
});

// Reativar todos imóveis de uma conta
app.get('/admin/reativar-imoveis/:userId', (req,res)=>{
  const userId = req.params.userId;
  const todos = fs.existsSync(dataPath('imoveis.json'))
    ? JSON.parse(fs.readFileSync(dataPath('imoveis.json'),'utf8')) : [];
  let count = 0;
  const atualizados = todos.map(i => {
    if(String(i.userId||i.usuarioId||i.corretorId||'') === userId && i.status === 'inativo'){
      count++;
      return { ...i, status: 'ativo' };
    }
    return i;
  });
  fs.writeFileSync(dataPath('imoveis.json'), JSON.stringify(atualizados,null,2));
  res.json({ ok: true, reativados: count });
});

// Backup leads por conta
app.get('/admin/backup-leads/:userId', (req,res)=>{
  const userId = req.params.userId;
  const todos = fs.existsSync(dataPath('data.json')) ? JSON.parse(fs.readFileSync(dataPath('data.json'),'utf8')) : [];
  const filtrados = todos.filter(l => String(l.userId||l.usuarioId||l.corretorId||'') === userId);
  res.setHeader('Content-Disposition', 'attachment; filename="backup-leads-'+userId+'.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(filtrados, null, 2));
});

// Backup de imóveis por conta
app.get('/admin/backup-imoveis/:userId', (req,res)=>{
  const userId = req.params.userId;
  const todos = fs.existsSync(dataPath('imoveis.json'))
    ? JSON.parse(fs.readFileSync(dataPath('imoveis.json'),'utf8')) : [];
  const filtrados = todos.filter(i =>
    String(i.userId||i.usuarioId||i.corretorId||'') === userId
  );
  const filename = 'backup-imoveis-'+userId+'-'+Date.now()+'.json';
  fs.writeFileSync(dataPath(filename), JSON.stringify(filtrados, null, 2));
  res.setHeader('Content-Disposition', 'attachment; filename="'+filename+'"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(filtrados, null, 2));
});

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
app.post('/app/importar-xml-upload', (req, res) => {
  const upload2 = require('multer')({ dest: dataPath('uploads/') });
  upload2.single('arquivo')(req, res, async (err) => {
    if(err) return res.json({ ok: false, erro: err.message });
    if(!req.file) return res.json({ ok: false, erro: 'Nenhum arquivo enviado' });
    const userId = req.query.userId || '';
    const { execSync } = require('child_process');
    try {
      const xmlPath = req.file.path;
      execSync('node '+path.join(__dirname,'importXMLCompleto.js')+' "'+xmlPath+'" "'+userId+'"', { stdio: 'inherit' });
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
app.get('/admin/zerar-visitas-notificacoes-temp', (req, res) => {
  fs.writeFileSync(dataPath('visitas.json'), '[]');
  fs.writeFileSync(dataPath('notificacoes.json'), '[]');
  res.send('✅ Visitas e notificações zeradas no disco persistente!');
});

// ADMIN — Zerar visitas por userId
app.get("/admin/zerar-visitas/:userId", (req, res) => {
const { userId } = req.params;
const visitas = fs.existsSync(dataPath("visitas.json")) ? JSON.parse(fs.readFileSync(dataPath("visitas.json"),"utf8")) : [];
const restantes = visitas.filter(v => v.userId !== userId);
const removidas = visitas.length - restantes.length;
fs.writeFileSync(dataPath("visitas.json"), JSON.stringify(restantes, null, 2));
res.send("✅ " + removidas + " visita(s) removidas para userId: " + userId);
});

// ADMIN — Zerar notificações por userId
app.get("/admin/zerar-notificacoes/:userId", (req, res) => {
const { userId } = req.params;
const notifs = fs.existsSync(dataPath("notificacoes.json")) ? JSON.parse(fs.readFileSync(dataPath("notificacoes.json"), "utf8")) : [];
const restantes = notifs.filter(n => n.usuarioId !== userId);
const removidas = notifs.length - restantes.length;
fs.writeFileSync(dataPath("notificacoes.json"), JSON.stringify(restantes, null, 2));
res.send("✅ " + removidas + " notificacao(oes) removidas para userId: " + userId);
});

// ADMIN — Zerar tudo por userId
app.get("/admin/zerar-tudo/:userId", (req, res) => {
const { userId } = req.params;
const visitas = fs.existsSync(dataPath("visitas.json")) ? JSON.parse(fs.readFileSync(dataPath("visitas.json"),"utf8")) : [];
const notifs = fs.existsSync(dataPath("notificacoes.json")) ? JSON.parse(fs.readFileSync(dataPath("notificacoes.json"), "utf8")) : [];
const visitasRest = visitas.filter(v => v.userId !== userId);
const notifsRest = notifs.filter(n => n.usuarioId !== userId);
fs.writeFileSync(dataPath("visitas.json"), JSON.stringify(visitasRest, null, 2));
fs.writeFileSync(dataPath("notificacoes.json"), JSON.stringify(notifsRest, null, 2));
res.send("✅ Zerado para " + userId + ": " + (visitas.length - visitasRest.length) + " visita(s), " + (notifs.length - notifsRest.length) + " notificacao(oes)");
});

// Página confirmação de presença do lead
app.get('/cliente/visita/:visitaId/confirmar', (req, res) => {
  const visitas = fs.existsSync(dataPath("visitas.json")) ? JSON.parse(fs.readFileSync(dataPath("visitas.json"),"utf8")) : [];
  const visita = visitas.find(v => v.id === req.params.visitaId);
  if (!visita) return res.status(404).send('Visita não encontrada');
  res.render('cliente-visita-confirmar', { visita });
});

app.post('/cliente/visita/:visitaId/responder', (req, res) => {
  const visitas = fs.existsSync(dataPath("visitas.json")) ? JSON.parse(fs.readFileSync(dataPath("visitas.json"),"utf8")) : [];
  const idx = visitas.findIndex(v => v.id === req.params.visitaId);
  if (idx === -1) return res.status(404).send('Visita não encontrada');
  const { resposta } = req.body;
  if (resposta === 'confirmar') {
    visitas[idx].status = 'lead_confirmou';
    visitas[idx].leadConfirmouEm = new Date().toISOString();
  } else {
    visitas[idx].status = 'lead_recusou';
    visitas[idx].leadRecusouEm = new Date().toISOString();
  }
  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas, null, 2));
  try {
    const _notifs2 = fs.existsSync(dataPath('notificacoes.json')) ? JSON.parse(fs.readFileSync(dataPath('notificacoes.json'),'utf8')) : [];
    const _v2 = visitas[idx];
    const _titulo2 = resposta === 'confirmar' ? '✅ Cliente confirmou presença' : '❌ Cliente não comparecerá';
    const _msg2 = resposta === 'confirmar'
      ? (_v2.nome||'Cliente') + ' confirmou presença na visita ao imóvel ' + (_v2.imovelTitulo||_v2.imovelBairro||'') + ' no dia ' + (_v2.dataVisita||'') + '.'
      : (_v2.nome||'Cliente') + ' informou que não poderá comparecer à visita ao imóvel ' + (_v2.imovelTitulo||_v2.imovelBairro||'') + '.';
    if (_v2.userId) {
      _notifs2.push({ id: Date.now().toString(), tipo: 'visita_cliente', titulo: _titulo2, mensagem: _msg2, usuarioId: _v2.userId, lida: false, criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) });
      fs.writeFileSync(dataPath('notificacoes.json'), JSON.stringify(_notifs2, null, 2));
    }
  } catch(e) { console.log('Erro notif cliente:', e.message); }
  res.render('cliente-visita-confirmar', { visita: visitas[idx] });
});

// Match Coins
app.get('/app/coins', auth, (req, res) => {
  const users = JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8'));
  const user = users.find(u => u.id === req.session.user.id);
  res.render('app-coins', { user: user || req.session.user });
});

// ===== REMARCAÇÃO DE VISITA PELO CLIENTE =====
app.get('/cliente/visita/:id/remarcar', (req, res) => {
  const visitas = fs.existsSync(dataPath("visitas.json")) ? JSON.parse(fs.readFileSync(dataPath("visitas.json"),"utf8")) : [];
  const visita = visitas.find(v => v.id === req.params.id);
  if (!visita) return res.status(404).send('Visita não encontrada');
  res.render('cliente-visita-remarcar', { visita, sucesso: false });
});

app.post('/cliente/visita/:id/remarcar', (req, res) => {
  const visitas = fs.existsSync(dataPath("visitas.json")) ? JSON.parse(fs.readFileSync(dataPath("visitas.json"),"utf8")) : [];
  const idx = visitas.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).send('Visita não encontrada');
  const { novaData, novoHorario } = req.body;
  visitas[idx].dataVisita = novaData;
  visitas[idx].horaVisita = novoHorario;
  visitas[idx].status = 'solicitada';
  visitas[idx].remarcadaEm = new Date().toISOString();
  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas, null, 2));
  try {
    const _notifs3 = fs.existsSync(dataPath('notificacoes.json')) ? JSON.parse(fs.readFileSync(dataPath('notificacoes.json'),'utf8')) : [];
    const _v3 = visitas[idx];
    if (_v3.userId) {
      _notifs3.push({ id: Date.now().toString(), tipo: 'visita_remarcada', titulo: '📅 Cliente remarcou a visita', mensagem: (_v3.nome||'Cliente') + ' escolheu nova data para visitar o imóvel ' + (_v3.imovelTitulo||_v3.imovelBairro||'') + ': ' + novaData + ' às ' + novoHorario + '. Notifique o proprietário.', usuarioId: _v3.userId, lida: false, criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) });
      fs.writeFileSync(dataPath('notificacoes.json'), JSON.stringify(_notifs3, null, 2));
    }
  } catch(e) { console.log('Erro notif remarcação:', e.message); }
  res.render('cliente-visita-remarcar', { visita: visitas[idx], sucesso: true });
});

// DEBUG TEMP
app.get('/admin/debug-visitas', (req, res) => {
  const visitas = fs.existsSync(dataPath("visitas.json")) ? JSON.parse(fs.readFileSync(dataPath("visitas.json"),"utf8")) : [];
  const resumo = visitas.slice(-5).map(v => ({ id: v.id, userId: v.userId, status: v.status, nome: v.nome }));
  res.json(resumo);
});

// DEBUG LEADS
app.get('/admin/debug-leads', (req, res) => {
  const leads = JSON.parse(fs.readFileSync(dataPath('data.json'),'utf8'));
  const comId = leads.filter(l => l.userId || l.corretorId).length;
  const semId = leads.filter(l => !l.userId && !l.corretorId).length;
  res.json({ total: leads.length, comUserId: comId, semUserId: semId });
});

// TEMP - Substituir data.json pelo do repositório
app.get('/admin/reset-leads-repo', (req, res) => {
  const repoPath = dataPath('data.json');
  const diskPath = dataPath('data.json');
  const data = fs.readFileSync(repoPath, 'utf8');
  fs.writeFileSync(diskPath, data);
  const leads = JSON.parse(data);
  res.send('✅ data.json substituído! Total: ' + leads.length + ' leads');
});

app.get('/app/assistente', auth, (req, res) => {
  const imoveis = JSON.parse(fs.readFileSync(dataPath('imoveis.json'), 'utf8')).filter(i => i.userId === req.session.user.userId);
  const leads = JSON.parse(fs.readFileSync(dataPath('data.json'), 'utf8')).filter(l => l.userId === req.session.user.userId);
  const stats = { imoveis: imoveis.length, ativos: imoveis.filter(i => i.status !== 'inativo').length, leads: leads.length };
  res.render('app-assistente', { user: req.session.user, stats });
});


// ─── CÉREBRO DO ASSISTENTE ───────────────────────────────────────────────────

// ─── API interna do Assistente — dados reais ─────────────────────────────────
app.get('/api/assistente/dados', auth, (req, res) => {
  const uid = req.session.user.userId;
  const imoveis = JSON.parse(fs.readFileSync(dataPath('imoveis.json'),'utf8')).filter(i=>i.userId===uid);
  const leads   = JSON.parse(fs.readFileSync(dataPath('data.json'),'utf8')).filter(l=>l.userId===uid);
  const visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8')).filter(v=>v.userId===uid) : [];

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
      confirmadas: visitas.filter(v=>v.status==='confirmada').length,
      proximas: visitas.filter(v=>v.status==='confirmada').slice(-3).map(v=>({
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
  const imoveis = JSON.parse(fs.readFileSync(dataPath('imoveis.json'), 'utf8')).filter(i => i.userId === req.session.user.userId);
  const leads = JSON.parse(fs.readFileSync(dataPath('data.json'), 'utf8')).filter(l => l.userId === req.session.user.userId);
  const stats = { imoveis: imoveis.length, ativos: imoveis.filter(i => i.status !== 'inativo').length, leads: leads.length, comMatch: leads.filter(l=>l.matchesBase&&l.matchesBase.length>0).length, visitas: 0, visitasHoje: 0 };
  res.render('app-assistente', { user: req.session.user, stats });
});

// Rota admin — top perguntas não entendidas
app.get('/admin/nao-entendidos', (req, res) => {
  try {
    const aprendizado = require('./cerebro/aprendizado');
    const top = aprendizado.topNaoEntendidos(20);
    res.json({ ok: true, top });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Rota admin — funil de leads por conta
app.get('/admin/funil/:userId', (req, res) => {
  try {
    const funil = require('./cerebro/funil');
    const userId = req.params.userId;
    const data = fs.existsSync(dataPath('data.json')) ? JSON.parse(fs.readFileSync(dataPath('data.json'),'utf8')) : [];
    const visitas = fs.existsSync(dataPath('visitas.json')) ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8')) : [];
    const leads = data.filter(l => String(l.userId||l.usuarioId||l.corretorId||'') === userId);
    const resumo = funil.resumoFunil(leads, visitas);
    res.json({ ok: true, userId, total: leads.length, funil: resumo });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/app/assistente/chat', auth, (req, res) => {
  const { mensagem } = req.body;
  if (!mensagem) return res.json({ resposta: 'Digite uma mensagem.' });

  const uid  = req.session.user.id || req.session.user.userId;
  const user = req.session.user;

  const imoveis = JSON.parse(fs.readFileSync(dataPath('imoveis.json'),'utf8')).filter(i=>i.userId===uid);
  const leads   = JSON.parse(fs.readFileSync(dataPath('data.json'),'utf8')).filter(l=>l.userId===uid);
  const visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8')).filter(v=>v.userId===uid)
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
    confirmadas: visitas.filter(v=>v.status==='confirmada').length
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
      const central = centralOperacional.responderCentral(user, mensagem);

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
    resposta = cerebroApp.responder(mensagem, d, user, imoveis, leads, visitas, contexto);
  }

  memoria.historico.push({ userId:uid, pergunta:mensagem, resposta, data:new Date().toISOString() });
  if (memoria.historico.length>500) memoria.historico = memoria.historico.slice(-500);
  fs.writeFileSync(memoriaPath, JSON.stringify(memoria,null,2));
  // Salvar tambem no users.json para persistir no Render
  try {
    const usersPath = dataPath('users.json');
    const users = JSON.parse(fs.readFileSync(usersPath,'utf8'));
    const uIdx = users.findIndex(u=>u.id===uid||u.userId===uid);
    if (uIdx>=0) {
      users[uIdx].historicoAssistente = users[uIdx].historicoAssistente || [];
      users[uIdx].historicoAssistente.push({pergunta:mensagem,resposta,data:new Date().toISOString()});
      if (users[uIdx].historicoAssistente.length>50) users[uIdx].historicoAssistente=users[uIdx].historicoAssistente.slice(-50);
      fs.writeFileSync(usersPath,JSON.stringify(users,null,2));
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
    const users = JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8'));
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
app.post('/admin/import-sync-ran', express.json({limit:'200mb'}), (req,res)=>{

  const token = req.headers['x-sync-token'];

  if(token !== 'MATCHIMOVEIS_SYNC_2026'){
    return res.status(401).json({ok:false,error:'token invalido'});
  }

  try{

    const body = req.body || {};

    const arquivos = {
      users: 'users.json',
      imoveis: 'imoveis.json',
      leads: 'leads.json',
      data: 'data.json',
      visitas: 'visitas.json',
      notificacoes: 'notificacoes.json'
    };

    Object.entries(arquivos).forEach(([key,file])=>{

      const atuais = fs.existsSync(dataPath(file))
        ? JSON.parse(fs.readFileSync(dataPath(file),'utf8'))
        : [];

      const novos = Array.isArray(body[key]) ? body[key] : [];

      const idsNovos = new Set(
        novos.map(i => String(i.id || i._id || i.codigoUsuario || Math.random()))
      );

      const limpos = atuais.filter(i => {
        const id = String(i.id || i._id || i.codigoUsuario || '');
        return !idsNovos.has(id);
      });

      const final = [...limpos, ...novos];

      fs.writeFileSync(
        dataPath(file),
        JSON.stringify(final,null,2)
      );

    });

    res.json({
      ok:true,
      users:(body.users||[]).length,
      imoveis:(body.imoveis||[]).length,
      data:(body.data||[]).length
    });

  }catch(e){
    res.status(500).json({ok:false,error:e.message});
  }

});

// ===============================




// Sync leads extraídas localmente para o Render
app.post('/admin/sync-leads-extraidas', express.json({limit:'50mb'}), (req,res)=>{
  const token = req.headers['x-sync-token'];
  if(token !== 'MATCHIMOVEIS_SYNC_2026'){
    return res.status(401).json({ok:false,error:'token invalido'});
  }
  try{
    const { userId, leads: leadsAtualizadas } = req.body || {};
    if(!userId || !Array.isArray(leadsAtualizadas)){
      return res.status(400).json({ok:false,error:'userId e leads obrigatorios'});
    }
    const df = dataPath('data.json');
    const todas = fs.existsSync(df) ? JSON.parse(fs.readFileSync(df,'utf8')) : [];
    const outrasContas = todas.filter(l => String(l.userId||l.usuarioId||l.corretorId||'') !== String(userId));
    const idsAtualizadas = new Set(leadsAtualizadas.map(l => String(l.id||l.url)));
    const mesmaContaSemAtualizar = todas.filter(l => {
      const dono = String(l.userId||l.usuarioId||l.corretorId||'');
      const id = String(l.id||l.url);
      return dono === String(userId) && !idsAtualizadas.has(id);
    });
    const final = [...outrasContas, ...mesmaContaSemAtualizar, ...leadsAtualizadas];
    fs.writeFileSync(df, JSON.stringify(final, null, 2));
    res.json({ok:true, salvas: leadsAtualizadas.length, total: final.length});
  }catch(e){
    res.status(500).json({ok:false,error:e.message});
  }
});

// Rodar match interno por userId direto no Render
app.get('/admin/rodar-match/:userId', (req,res)=>{
  const userId = req.params.userId;
  try{
    const { buscarMatchesBaseInterna } = require('./matchBaseInterna.js');
    const df = dataPath('data.json');
    const imf = dataPath('imoveis.json');
    const raw = JSON.parse(fs.readFileSync(df,'utf8'));
    const leads = Array.isArray(raw) ? raw : (raw.results||[]);
    const imoveis = JSON.parse(fs.readFileSync(imf,'utf8'));
    const imoveisArr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis||[]);
    const paraMatch = leads.filter(l => {
      const uid = String(l.userId||l.usuarioId||l.corretorId||'');
      return uid === userId && l.extractionStatus === 'ok';
    });
    let comMatch = 0, semMatch = 0;
    paraMatch.forEach(lead => {
      const matches = buscarMatchesBaseInterna(lead, imoveisArr);
      lead.matchesBase = matches;
      lead.matchCountBase = matches.length;
      if(matches.length > 0) comMatch++; else semMatch++;
    });
    fs.writeFileSync(df, JSON.stringify(leads, null, 2));
    res.json({ ok:true, userId, total: paraMatch.length, comMatch, semMatch });
  }catch(e){
    res.status(500).json({ ok:false, error: e.message });
  }
});

// Mensagem de abertura proativa do assistente
app.get('/app/assistente/abertura', auth, (req, res) => {
  try {
    const proatividade = require('./cerebro/proatividade');
    const userId = req.session.user.id;
    const dataFile = p => { const DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : __dirname; return require('path').join(DATA_DIR, p); };
    const lerJson = f => { try { return JSON.parse(fs.readFileSync(dataFile(f),'utf8')); } catch(e) { return []; } };
    const leads = lerJson('data.json').filter(l => String(l.userId||l.usuarioId||l.corretorId||'') === userId);
    const imoveis = lerJson('imoveis.json').filter(i => String(i.userId||i.usuarioId||i.corretorId||'') === userId);
    const visitas = lerJson('visitas.json').filter(v => String(v.userId||v.usuarioId||v.corretorId||v.corretorId||'') === userId);
    const notificacoes = lerJson('notificacoes.json').filter(n => String(n.userId||n.usuarioId||n.corretorId||'') === userId);
    const mensagem = proatividade.gerarAbertura(req.session.user, leads, imoveis, visitas, notificacoes);
    res.json({ ok: true, mensagem });
  } catch(e) {
    res.json({ ok: true, mensagem: 'Olá! Como posso ajudar você hoje?' });
  }
});


// Executa ações diretas pelo assistente
app.post('/app/assistente/acao-direta', auth, express.json(), (req, res) => {
  try {
    const { acao, dados } = req.body || {};
    const userId = req.session.user.id;

    if (acao === 'fazer_match') {
      const { buscarMatchesBaseInterna } = require('./matchBaseInterna.js');
      const dataArq = dataPath('data.json');
      const imovArq = dataPath('imoveis.json');
      const todasLeads = fs.existsSync(dataArq) ? JSON.parse(fs.readFileSync(dataArq,'utf8')) : [];
      const todosIm = fs.existsSync(imovArq) ? JSON.parse(fs.readFileSync(imovArq,'utf8')) : [];
      const minhasLeads = todasLeads.filter(l => String(l.userId||l.usuarioId||l.corretorId||'') === userId && l.extractionStatus === 'ok');
      let comMatch = 0, semMatch = 0;
      minhasLeads.forEach(lead => {
        const matches = buscarMatchesBaseInterna(lead, todosIm);
        lead.matchesBase = matches; lead.matchCountBase = matches.length;
        if (matches.length > 0) comMatch++; else semMatch++;
      });
      const outras = todasLeads.filter(l => String(l.userId||l.usuarioId||l.corretorId||'') !== userId);
      const restantes = todasLeads.filter(l => String(l.userId||l.usuarioId||l.corretorId||'') === userId && !minhasLeads.find(x => x.id === l.id));
      fs.writeFileSync(dataArq, JSON.stringify([...outras,...restantes,...minhasLeads],null,2));
      return res.json({ ok: true, comMatch, semMatch, total: minhasLeads.length });
    }

    res.json({ ok: false, erro: 'Ação não reconhecida: ' + acao });
  } catch(e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});


// Métricas do assistente por conta
app.get('/admin/metricas-assistente/:userId', (req, res) => {
  try {
    const metricas = require('./cerebro/metricas');
    const naoEntendidos = require('./cerebro/aprendizado');
    const resumo = metricas.resumo(req.params.userId);
    const top = naoEntendidos.topNaoEntendidos(10);
    res.json({ ok: true, resumo, topNaoEntendidos: top });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});


// Feedback do assistente — positivo ou negativo
app.post('/app/assistente/feedback', auth, express.json(), (req, res) => {
  try {
    const feedbackLoop = require('./cerebro/feedback-loop');
    const { mensagem, resposta, tipo, detalhe } = req.body || {};
    const userId = req.session.user.id;
    feedbackLoop.registrarFeedback(userId, mensagem, resposta, tipo, detalhe);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Análise de feedback — admin
app.get('/admin/feedback-assistente', (req, res) => {
  try {
    const feedbackLoop = require('./cerebro/feedback-loop');
    res.json({ ok: true, analise: feedbackLoop.analisarFeedback() });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Notas do usuário — preferências aprendidas
app.get('/admin/notas-usuario/:userId', auth, (req, res) => {
  try {
    const notasUsuario = require('./cerebro/notas-usuario');
    res.json({ ok: true, notas: notasUsuario.carregarNotas(req.params.userId) });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

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

    const resultado = centralOperacional.responderCentral(req.session.user, texto);
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

app.post('/api/visita/:id/workflow', auth, (req,res)=>{
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

app.post('/api/visita/:id/workflow', auth, (req,res)=>{
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
// ACAO RAPIDA VISITA
// =====================================================

app.post('/api/visita/:id/confirmar', auth, (req,res)=>{
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

app.post('/api/visita/:id/remarcar', auth, (req,res)=>{
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


app.get('/api/visita/:id/whatsapp', auth, (req,res)=>{

  try {

    const visitas = fs.existsSync(dataPath("visitas.json")) ? JSON.parse(fs.readFileSync(dataPath("visitas.json"),"utf8")) : [];
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
    const users = JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8') || '[]');
    return users.find(u => String(u.id) === String(id)) || null;
  } catch(e){
    return null;
  }

}

function resolverUsuarioPorId(id){

  try {
    const users = JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8') || '[]');
    return users.find(u => String(u.id) === String(id)) || null;
  } catch(e){
    return null;
  }

}

// ===============================
// NOVO FLUXO DE VISITAS (LIMPO)
// ===============================

app.post('/api/visita/nova-v2', (req,res)=>{
  const { imovelId, nome, telefone, dataVisita, horaVisita, imovelTitulo } = req.body;

  const imoveisAll = fs.existsSync(dataPath('imoveis.json'))
    ? JSON.parse(fs.readFileSync(dataPath('imoveis.json'),'utf8')) : [];
  const imovel = imoveisAll.find(i => String(i.idExterno||i.id) === String(imovelId)) || {};

  const users = fs.existsSync(dataPath('users.json'))
    ? JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8')) : [];
  const donoImovel = users.find(u => u.id === (imovel.userId||imovel.usuarioId)) || {};

  const visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8')) : [];

  const novaVisita = {
    id: String(Date.now()),
    nome,
    telefone: (telefone||'').replace(/D/g,''),
    contato:  (telefone||'').replace(/D/g,''),
    imovelId,
    imovelTitulo:    imovelTitulo || imovel.titulo || imovel.tipo || 'Imóvel',
    imovelBairro:    imovel.bairro || '',
    imovelDescricao: imovel.descricao || '',
    dataVisita,
    horaVisita,
    userId:      donoImovel.id || imovel.userId || '',
    corretorId:  donoImovel.id || imovel.userId || '',
    ownerUserId: donoImovel.id || imovel.userId || '',
    proprietarioNome:     (imovel.proprietario && imovel.proprietario.nome) || '',
    proprietarioTelefone: ((imovel.proprietario && (imovel.proprietario.celular||imovel.proprietario.telefone))||'').replace(/D/g,''),
    status:  'solicitada',
    origem:  'pagina_publica',
    data:    new Date().toISOString(),
    data_br: new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})
  };

  visitas.push(novaVisita);
  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));
  return res.json({ ok: true, visita: novaVisita });
});

// ===============================

app.post('/app/visitas/remarcar/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {
    if(String(v.id) === String(req.params.id)){
      v.status = 'REMARCAR';
      v.remarcarAt = new Date().toISOString();
    }
    return v;
  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/cancelar/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {
    if(String(v.id) === String(req.params.id)){
      v.status = 'CANCELADA';
      v.canceladaAt = new Date().toISOString();
    }
    return v;
  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/concluir/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {
    if(String(v.id) === String(req.params.id)){
      v.status = 'CONCLUIDA';
      v.concluidaAt = new Date().toISOString();
    }
    return v;
  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/remarcar/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {
    if(String(v.id) === String(req.params.id)){
      v.status = 'REMARCAR';
      v.remarcarAt = new Date().toISOString();
    }
    return v;
  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/cancelar/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {
    if(String(v.id) === String(req.params.id)){
      v.status = 'CANCELADA';
      v.canceladaAt = new Date().toISOString();
    }
    return v;
  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/concluir/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {
    if(String(v.id) === String(req.params.id)){
      v.status = 'CONCLUIDA';
      v.concluidaAt = new Date().toISOString();
    }
    return v;
  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/observacao/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

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

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/prioridade/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.prioridade = req.body.prioridade || 'NORMAL';

      v.prioridadeUpdatedAt = new Date().toISOString();

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/responsavel/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.responsavelOperacional = req.body.responsavel || '';

      v.responsavelUpdatedAt = new Date().toISOString();

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/cliente-gostou/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.status = 'CONCLUIDA';
      v.pipelineStatus = 'CLIENTE_GOSTOU';

      v.clienteGostouAt = new Date().toISOString();

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/proposta/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.status = 'CONCLUIDA';
      v.pipelineStatus = 'PROPOSTA';

      v.propostaAt = new Date().toISOString();

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/fechado/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.status = 'CONCLUIDA';
      v.pipelineStatus = 'FECHADO';

      v.fechadoAt = new Date().toISOString();

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});


app.get('/app/visitas-kanban', auth, (req,res)=>{

  const fs = require('fs');

  const visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

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


app.post('/app/visitas/agendar/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

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

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/solicitar-confirmacao/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.confirmacaoClienteStatus = 'PENDENTE';

      v.confirmacaoSolicitadaAt = new Date().toISOString();

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});


app.get('/cliente/visita/:id', (req,res)=>{

  const fs = require('fs');

  const visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  const visita = visitas.find(v =>
    String(v.id) === String(req.params.id)
  );

  if(!visita){
    return res.send('Visita não encontrada');
  }

  res.render('cliente-visita',{
    visita
  });

});

app.post('/cliente/visita/:id/confirmar', (req,res)=>{

  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){
      v.confirmacaoClienteStatus = 'CONFIRMADO';
      v.confirmacaoClienteAt = new Date().toISOString();
      v.clienteConfirmou = true;
    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/cliente/visita/' + req.params.id);

});

app.post('/cliente/visita/:id/recusar', (req,res)=>{

  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.confirmacaoClienteStatus = 'RECUSADO';

      v.confirmacaoClienteRecusouAt = new Date().toISOString();

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/cliente/visita/' + req.params.id);

});


app.get('/cliente/visita/:id/remarcar', (req,res)=>{

  const fs = require('fs');

  const visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

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

app.post('/cliente/visita/:id/remarcar', (req,res)=>{

  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.status = 'REMARCAR';

      v.novaDataSolicitada = req.body.dataVisita || '';

      v.novaHoraSolicitada = req.body.horaVisita || '';

      v.observacaoRemarcacao = req.body.observacao || '';

      v.remarcarSolicitadoAt = new Date().toISOString();

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/cliente/visita/' + req.params.id);

});


app.post('/app/visitas/checkin/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.checkinAt = new Date().toISOString();

      v.status = 'VISITA_INICIADA';

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/finalizar/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

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

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/negociacao/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.pipelineStatus = 'NEGOCIACAO';

      v.proximaAcao = 'Acompanhar negociação com cliente';

      v.negociacaoAt = new Date().toISOString();

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas-kanban');
});

app.post('/app/visitas/perdido/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.pipelineStatus = 'PERDIDO';

      v.proximaAcao = 'Lead perdido';

      v.perdidoAt = new Date().toISOString();

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas-kanban');
});


app.post('/app/visitas/parceiro-confirmou/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

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

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/proprietario-confirmou/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

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

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/cliente-chegou/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.clienteChegouAt = new Date().toISOString();

      v.status = 'CLIENTE_CHEGOU';

      v.proximaAcao = 'Iniciar visita ao imóvel';

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/no-show/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

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

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});


app.post('/app/visitas/proposta-valor/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.valorProposta = req.body.valorProposta || '';

      v.propostaUpdatedAt = new Date().toISOString();

      v.pipelineStatus = 'PROPOSTA';

      v.proximaAcao = 'Aguardar retorno da proposta';

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});

app.post('/app/visitas/perda-motivo/:id', auth, (req,res)=>{
  const fs = require('fs');

  let visitas = fs.existsSync(dataPath('visitas.json'))
    ? JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8'))
    : [];

  visitas = visitas.map(v => {

    if(String(v.id) === String(req.params.id)){

      v.pipelineStatus = 'PERDIDO';

      v.motivoPerda = req.body.motivoPerda || '';

      v.perdidoAt = new Date().toISOString();

      v.proximaAcao = 'Lead perdido';

    }

    return v;

  });

  fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(visitas,null,2));

  res.redirect('/app/visitas');
});


app.get('/admin/zerar-tudo-sistema', (req, res) => {
  const fs2 = require('fs');
  const path2 = require('path');
  const bases = ['/opt/render/project/src/data', '/opt/render/project/src', __dirname];
  const resultado = {};
  for (const base2 of bases) {
    resultado[base2] = {};
    const dataPath = path2.join(base2, 'data.json');
    if (fs2.existsSync(dataPath)) {
      try { fs2.writeFileSync(dataPath, '[]'); resultado[base2].leads = 'zerado'; } catch(e) { resultado[base2].leads = e.message; }
    }
    const visitasPath = path2.join(base2, 'visitas.json');
    if (fs2.existsSync(visitasPath)) {
      try { fs2.writeFileSync(visitasPath, '[]'); resultado[base2].visitas = 'zerado'; } catch(e) { resultado[base2].visitas = e.message; }
    }
    const notifPath = path2.join(base2, 'notificacoes.json');
    if (fs2.existsSync(notifPath)) {
      try { fs2.writeFileSync(notifPath, '[]'); resultado[base2].notificacoes = 'zerado'; } catch(e) { resultado[base2].notificacoes = e.message; }
    }
  }
  res.json({ ok: true, resultado });
});

app.get('/admin/migrar-imoveis/:idAntigo/:idNovo', (req, res) => {
  const fs2 = require('fs');
  const path2 = require('path');
  const { idAntigo, idNovo } = req.params;
  const bases = ['/opt/render/project/src/data', '/opt/render/project/src', __dirname];
  let migrados = 0;
  for (const base of bases) {
    const imoveisPath = path2.join(base, 'imoveis.json');
    if (!fs2.existsSync(imoveisPath)) continue;
    try {
      let imoveis = JSON.parse(fs2.readFileSync(imoveisPath, 'utf8'));
      imoveis = imoveis.map(im => {
        if ((im.userId || im.codigoUsuario || im.usuarioId) === idAntigo) {
          im.userId = idNovo;
          im.codigoUsuario = idNovo;
          migrados++;
        }
        return im;
      });
      fs2.writeFileSync(imoveisPath, JSON.stringify(imoveis, null, 2));
    } catch(e) {}
  }
  res.json({ ok: true, idAntigo, idNovo, migrados });
});

app.get('/admin/deletar-conta/:userId', (req, res) => {
  const fs2 = require('fs');
  const path2 = require('path');
  const { userId } = req.params;
  const bases = ['/opt/render/project/src/data', '/opt/render/project/src', __dirname];
  let removido = false;
  for (const base of bases) {
    const usersPath = path2.join(base, 'users.json');
    if (!fs2.existsSync(usersPath)) continue;
    try {
      let users = JSON.parse(fs2.readFileSync(usersPath, 'utf8'));
      const antes = users.length;
      users = users.filter(u => u.id !== userId);
      fs2.writeFileSync(usersPath, JSON.stringify(users, null, 2));
      if (users.length < antes) removido = true;
    } catch(e) {}
  }
  res.json({ ok: true, userId, removido });
});
