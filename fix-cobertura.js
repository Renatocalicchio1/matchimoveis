const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// Fix nlp.js
let nlp = fs.readFileSync(path.join(BASE,'cerebro','nlp.js'),'utf8');
nlp = nlp.replace(
  "if (/visita|agenda|agendar/.test(mNorm))          return 'visitas';",
  "if (/visita|agenda|agendar|pendente visita|confirmou visita|como funciona visita|fluxo visita/.test(mNorm)) return 'visitas';"
);
nlp = nlp.replace(
  "if (/faixa|valor medio|ticket|orcamento|tipo mais|quarto mais|bairro mais|mais buscado|demanda|mercado|tendencia|oferta|quartos mais/.test(mNorm)) return 'mercado';",
  "if (/faixa|valor medio|ticket|orcamento|tipo mais|quarto mais|bairro mais|mais buscado|demanda|mercado|tendencia|oferta|quartos mais|quartos pedidos|quartos buscados/.test(mNorm)) return 'mercado';"
);
nlp = nlp.replace(
  "if (/ver portal|portais|vivareal|\\bzap\\b|\\bolx\\b|chaves|imovelweb|feed|rejeitou|nao publicou/.test(mNorm)) return 'portais';",
  "if (/ver portal|ver portais|portais|vivareal|\\bzap\\b|\\bolx\\b|chaves|imovelweb|feed|rejeitou|nao publicou/.test(mNorm)) return 'portais';"
);
fs.writeFileSync(path.join(BASE,'cerebro','nlp.js'), nlp);
console.log('ok nlp.js');

// Fix sistema.js
let sis = fs.readFileSync(path.join(BASE,'cerebro','sistema.js'),'utf8');
if (!sis.includes('como trocar senha')) {
  const ins = `
  if (/como trocar senha|alterar senha|mudar senha/.test(mNorm))
    return '🔒 Acesse <a href="/app/perfil" style="color:#ff385c;font-weight:700">Perfil →</a> e use <strong>Alterar Senha</strong>.';
  if (/como conectar whatsapp|integrar whatsapp/.test(mNorm))
    return '📱 <strong>WhatsApp via Twilio</strong> está em desenvolvimento. Em breve você responderá clientes direto pelo chat.';
  if (/como adicionar foto|como subir foto/.test(mNorm))
    return '📸 Abra o imóvel em <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a> e clique em <strong>Adicionar Fotos</strong>.';
  if (/como cadastrar imovel|cadastrar imovel/.test(mNorm))
    return '🏠 Acesse <a href="/app/imovel/cadastrar" style="color:#ff385c;font-weight:700">Cadastrar Imóvel →</a> e preencha: tipo, bairro, quartos, valor e 1 foto.';
`;
  sis = sis.replace('function responder(mNorm, d, btn, chip) {', 'function responder(mNorm, d, btn, chip) {' + ins);
  fs.writeFileSync(path.join(BASE,'cerebro','sistema.js'), sis);
  console.log('ok sistema.js');
}

// Fix visitas.js
let vis = fs.readFileSync(path.join(BASE,'cerebro','visitas.js'),'utf8');
if (!vis.includes('quem confirmou')) {
  const ins = `
  if (/quem confirmou|confirmou visita/.test(mNorm))
    return '✅ <strong>' + d.confirmadas + ' visita(s) confirmada(s)</strong><br><br>' + btn('Ver visitas','/app/visitas');
  if (/como funciona visita|fluxo visita|passo a passo visita/.test(mNorm))
    return '📅 <strong>Fluxo de visitas:</strong><br><br>1. Lead acessa vitrine e escolhe imóvel<br>2. Lead solicita visita<br>3. Corretor notifica proprietário<br>4. Proprietário confirma ou recusa<br>5. Lead é notificada<br><br>' + btn('Ver visitas','/app/visitas');
`;
  vis = vis.replace('function responder(mNorm, d, visitas, btn, chip) {', 'function responder(mNorm, d, visitas, btn, chip) {' + ins);
  fs.writeFileSync(path.join(BASE,'cerebro','visitas.js'), vis);
  console.log('ok visitas.js');
}

// Fix rag.js
let rag = fs.readFileSync(path.join(BASE,'cerebro','rag.js'),'utf8');
rag = rag.replace(
  "const tipos = ['apartamento','casa','cobertura','sala','terreno','sobrado','studio','loft'];",
  "const tipos = ['apartamento','casa','casas','cobertura','sala','terreno','sobrado','studio','loft'];"
);
fs.writeFileSync(path.join(BASE,'cerebro','rag.js'), rag);
console.log('ok rag.js');

// Rodar teste
const {execSync} = require('child_process');
const r = execSync('node teste-automatico.js', {cwd:BASE}).toString();
console.log('\n' + r.split('\n').filter(l=>/COBERTURA|🔴|❌|✅/.test(l)).join('\n'));
