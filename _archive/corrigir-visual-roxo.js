const fs = require('fs');

let server = fs.readFileSync('server.js','utf8');

const bloco = `

// ===== ROTAS APP CORRETOR - PADRÃO ROXO =====
function appUsuarioPadrao(){
  return {
    id: 'mario-11999965998',
    nome: 'Mario Sergio',
    celular: '11999965998',
    tipoConta: 'Corretor',
    foto: '/img/avatar.png'
  };
}

app.get('/app', (req,res)=> res.redirect('/app-imoveis'));
app.get('/corretor', (req,res)=> res.redirect('/app-imoveis'));
app.get('/dashboard', (req,res)=> res.redirect('/app-imoveis'));

app.get('/app-importar-leads', (req,res)=>{
  res.render('app-importar-leads', { title:'Importar Leads', usuario: appUsuarioPadrao() });
});

app.get('/app-portais-xml', (req,res)=>{
  res.render('app-portais-xml', { title:'Portais / XML', usuario: appUsuarioPadrao() });
});

app.get('/app-xml', (req,res)=> res.redirect('/app-portais-xml'));
app.get('/app-portais', (req,res)=> res.redirect('/app-portais-xml'));

app.get('/app-visitas', (req,res)=>{
  res.render('app-visitas', { title:'Visitas', usuario: appUsuarioPadrao(), visitas: [] });
});

app.get('/app-perfil', (req,res)=>{
  res.render('app-perfil', { title:'Perfil', usuario: appUsuarioPadrao() });
});

app.get('/logout', (req,res)=> res.redirect('/login'));
`;

if (!server.includes('ROTAS APP CORRETOR - PADRÃO ROXO')) {
  server += bloco;
  fs.writeFileSync('server.js', server);
}

const style = `
<style>
*{box-sizing:border-box}
body{
  margin:0;
  font-family:Arial,Helvetica,sans-serif;
  background:#f6f2ff;
  color:#241433;
}
.layout{display:flex;min-height:100vh}
.sidebar{
  width:270px;
  background:linear-gradient(180deg,#5b21b6,#7c3aed,#9333ea);
  color:#fff;
  padding:22px;
  display:flex;
  flex-direction:column;
  gap:18px;
}
.logo{
  font-size:24px;
  font-weight:900;
  letter-spacing:-.5px;
}
.userbox{
  display:flex;
  gap:12px;
  align-items:center;
  background:rgba(255,255,255,.14);
  border:1px solid rgba(255,255,255,.18);
  border-radius:18px;
  padding:13px;
}
.avatar{
  width:48px;
  height:48px;
  border-radius:50%;
  background:#ede9fe;
}
.uname{font-weight:800}
.utype{font-size:12px;color:#eee}
.menu{
  display:flex;
  flex-direction:column;
  gap:9px;
  margin-top:8px;
}
.menu a{
  color:#fff;
  text-decoration:none;
  padding:13px 14px;
  border-radius:14px;
  background:rgba(255,255,255,.12);
  font-weight:700;
}
.menu a:hover,.menu a.active{
  background:#fff;
  color:#5b21b6;
}
.logout{
  margin-top:auto;
  background:#fff!important;
  color:#5b21b6!important;
  text-align:center;
}
.content{flex:1;padding:34px}
.top h1{margin:0 0 7px;font-size:32px;color:#3b0764}
.muted{color:#6b5b7c}
.grid{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:20px;
  margin-top:24px;
}
.card{
  background:#fff;
  border:1px solid #eadcff;
  border-radius:24px;
  padding:25px;
  box-shadow:0 12px 35px rgba(91,33,182,.10);
}
.card h2{color:#4c1d95;margin-top:0}
.btn{
  display:inline-block;
  background:linear-gradient(135deg,#6d28d9,#9333ea);
  color:#fff;
  border:0;
  border-radius:14px;
  padding:13px 17px;
  text-decoration:none;
  font-weight:800;
  cursor:pointer;
}
input,select{
  width:100%;
  padding:13px;
  border:1px solid #ddd6fe;
  border-radius:14px;
  background:#fff;
}
label{font-weight:800;font-size:13px;color:#4c1d95}
.formgrid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:15px;
}
@media(max-width:900px){
  .layout{flex-direction:column}
  .sidebar{width:100%}
  .grid{grid-template-columns:1fr}
  .formgrid{grid-template-columns:1fr}
}
</style>`;

function page(title, active, body){
return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
${style}
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="logo">MatchImoveis</div>

    <div class="userbox">
      <div class="avatar"></div>
      <div>
        <div class="uname"><%= usuario.nome %></div>
        <div class="utype"><%= usuario.tipoConta %> · <%= usuario.celular %></div>
      </div>
    </div>

    <nav class="menu">
      <a class="${active==='imoveis'?'active':''}" href="/app-imoveis">Meus imóveis</a>
      <a class="${active==='leads'?'active':''}" href="/app-importar-leads">Importar leads</a>
      <a class="${active==='xml'?'active':''}" href="/app-portais-xml">Portais / XML</a>
      <a class="${active==='visitas'?'active':''}" href="/app-visitas">Visitas</a>
      <a class="${active==='perfil'?'active':''}" href="/app-perfil">Perfil</a>
      <a class="logout" href="/logout">Sair</a>
    </nav>
  </aside>

  <main class="content">
    ${body}
  </main>
</div>
</body>
</html>`;
}

fs.writeFileSync('views/app-importar-leads.ejs', page('Importar Leads','leads', `
<div class="top">
  <h1>Importar leads</h1>
  <p class="muted">Suba a planilha dos leads para o sistema gerar os matches.</p>
</div>

<div class="card">
  <form action="/process" method="post" enctype="multipart/form-data">
    <label>Arquivo CSV, Excel ou Numbers</label><br><br>
    <input type="file" name="file" accept=".csv,.xlsx,.xls,.numbers" required>
    <br><br>
    <button class="btn" type="submit">Importar e processar</button>
  </form>
</div>
`));

fs.writeFileSync('views/app-portais-xml.ejs', page('Portais / XML','xml', `
<div class="top">
  <h1>Portais / XML</h1>
  <p class="muted">Escolha para onde os imóveis do corretor serão enviados.</p>
</div>

<div class="grid">
  <div class="card">
    <h2>Canal Pro</h2>
    <p class="muted">Envio para OLX, Zap Imóveis e Viva Real.</p>
    <a class="btn" href="/app-portais-xml">Configurar</a>
  </div>

  <div class="card">
    <h2>Chaves na Mão</h2>
    <p class="muted">Envio XML para o portal Chaves na Mão.</p>
    <a class="btn" href="/app-portais-xml">Configurar</a>
  </div>

  <div class="card">
    <h2>XML próprio</h2>
    <p class="muted">Gerar link XML da carteira do corretor.</p>
    <a class="btn" href="/app-portais-xml">Gerar XML</a>
  </div>
</div>
`));

fs.writeFileSync('views/app-visitas.ejs', page('Visitas','visitas', `
<div class="top">
  <h1>Visitas</h1>
  <p class="muted">Acompanhe visitas solicitadas, confirmadas e realizadas.</p>
</div>

<div class="card">
  <h2>Nenhuma visita agendada ainda</h2>
  <p class="muted">Quando um cliente solicitar visita, ela aparecerá aqui.</p>
</div>
`));

fs.writeFileSync('views/app-perfil.ejs', page('Perfil','perfil', `
<div class="top">
  <h1>Perfil do corretor</h1>
  <p class="muted">Dados da conta, foto, CRECI e informações profissionais.</p>
</div>

<div class="card">
  <div class="formgrid">
    <div><label>Nome</label><input value="<%= usuario.nome %>"></div>
    <div><label>Celular</label><input value="<%= usuario.celular %>"></div>
    <div><label>Tipo de conta</label><input value="<%= usuario.tipoConta %>"></div>
    <div><label>CRECI</label><input placeholder="Informe o CRECI"></div>
    <div><label>CPF opcional</label><input placeholder="CPF"></div>
    <div><label>Foto</label><input type="file"></div>
  </div>
  <br>
  <button class="btn">Salvar perfil</button>
</div>
`));

console.log('OK - rotas e páginas ajustadas para o padrão roxo.');
