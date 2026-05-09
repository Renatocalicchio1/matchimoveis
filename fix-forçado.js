const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// ── Fix visitas.js — forçar inserção ─────────────────────────────────────────
let vis = fs.readFileSync(path.join(BASE,'cerebro','visitas.js'),'utf8');
const insVis = `
  if (/quem pediu visita|quem solicitou|nova solicitacao/.test(mNorm)) {
    const pend = visitas.filter(v=>v.status==='solicitada'||v.status==='pendente');
    if (!pend.length) return 'Nenhuma visita solicitada.' + btn('Ver visitas','/app/visitas');
    return '📋 <strong>'+pend.length+' solicitada(s):</strong><br>'+pend.slice(0,5).map(v=>'• '+(v.nome||v.leadNome||'Lead')+' — '+(v.dataVisita||'-')).join('<br>')+'<br><br>'+btn('Ver visitas','/app/visitas');
  }
  if (/visitas pendentes|pendentes de confirmacao|aguardando confirmacao/.test(mNorm)) {
    if (!d.pendentes) return 'Nenhuma visita pendente.' + btn('Ver visitas','/app/visitas');
    return '⏳ <strong>'+d.pendentes+' visita(s) pendente(s)</strong> aguardando confirmação do proprietário.<br><br>'+btn('Ver visitas','/app/visitas');
  }
  if (/quem confirmou|visitas confirmadas|confirmadas/.test(mNorm)) {
    if (!d.confirmadas) return 'Nenhuma visita confirmada ainda.' + btn('Ver visitas','/app/visitas');
    return '✅ <strong>'+d.confirmadas+' visita(s) confirmada(s)</strong>.<br><br>'+btn('Ver visitas','/app/visitas');
  }
  if (/avisar proprietario|notificar proprietario|avisar dono da visita/.test(mNorm))
    return '📱 Na página de visitas, clique em <strong>Notificar Proprietário</strong>.<br><br>O WhatsApp abre com a mensagem pronta para o proprietário confirmar a data.<br><br>'+btn('Ver visitas','/app/visitas');
  if (/quem nao respondeu|sem resposta|nao respondeu/.test(mNorm))
    return '📋 Leads sem resposta ficam com status <strong>pendente</strong>.<br><br>'+btn('Ver leads','/app/leads');
`;
// Inserir no início da função, após a primeira chave
vis = vis.replace(/function responder\(mNorm, d, visitas, btn, chip\) \{/, 'function responder(mNorm, d, visitas, btn, chip) {' + insVis);
fs.writeFileSync(path.join(BASE,'cerebro','visitas.js'), vis);
console.log('ok visitas.js');

// ── Fix sistema.js — forçar primeiros passos ──────────────────────────────────
let sis = fs.readFileSync(path.join(BASE,'cerebro','sistema.js'),'utf8');
const insSis = `
  if (/primeiros passos|como comecar|por onde comecar|primeiro passo|nao sei comecar/.test(mNorm))
    return '🚀 <strong>Primeiros passos:</strong><br><br>1. Importe imóveis via XML<br>2. Importe leads da planilha<br>3. Faça o match<br>4. Envie a vitrine<br>5. Aguarde a visita<br><br>'+btn('Cadastrar imóvel','/app/cadastro')+btn('Importar leads','/app-importar-leads');
`;
sis = sis.replace(/function responder\(mNorm, d, btn, chip\) \{/, 'function responder(mNorm, d, btn, chip) {' + insSis);
fs.writeFileSync(path.join(BASE,'cerebro','sistema.js'), sis);
console.log('ok sistema.js');

// ── Fix suporte.js — enviar vitrine, avisar proprietário ─────────────────────
let sup = fs.readFileSync(path.join(BASE,'cerebro','suporte.js'),'utf8');
sup = sup.replace('module.exports',
`FAQ.push({chave:/enviar vitrine para cliente|mandar vitrine para cliente|como envio vitrine/, resposta:'📱 Acesse <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads →</a>, encontre a lead com match e clique em <strong>Enviar Vitrine</strong>. O WhatsApp abre com o link pronto.'});
FAQ.push({chave:/quem nao respondeu|sem resposta|nao me respondeu/, resposta:'📋 Leads sem resposta ficam com status <strong>pendente</strong> na página de leads. Filtre por status para ver quem não respondeu.'});
FAQ.push({chave:/avisar proprietario da visita|notificar dono|avisar dono imovel/, resposta:'📱 Em <a href="/app/visitas" style="color:#ff385c;font-weight:700">Visitas →</a> clique em <strong>Notificar Proprietário</strong>. Abre o WhatsApp com mensagem automática para confirmação.'});
module.exports`
);
fs.writeFileSync(path.join(BASE,'cerebro','suporte.js'), sup);
console.log('ok suporte.js');

// ── Fix sinonimos — erros de digitação críticos ───────────────────────────────
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = JSON.parse(fs.readFileSync(sPath,'utf8'));
Object.assign(s, {
  'matsh':                      'match',
  'taxa de matsh':              'taxa de match',
  'meus conis':                 'meus coins',
  'ver portias':                'ver portais',
  'portias':                    'portais',
  'dashbord':                   'dashboard',
  'casa ate 500mil':            'casa ate 500 mil',
  'quais campos planilha':      'campos planilha',
  'campos planilha precisa':    'campos planilha',
  'primeiros passos':           'primeiros passos',
  'enviar vitrine para cliente':'enviar vitrine',
  'avisar proprietario da visita':'notificar proprietario',
  'quem nao respondeu':         'sem resposta',
  'casa com 2 vagas':           'casa 2 vagas',
  'tipo mais buscado':          'tipo mais buscado',
  'quartos mais pedidos':       'quartos mais pedido',
});
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('ok sinonimos total:', Object.keys(s).length);

// ── Rodar treino ──────────────────────────────────────────────────────────────
const {execSync} = require('child_process');
execSync('node treino-cerebro.js --silent', {cwd:BASE});
const rel = JSON.parse(fs.readFileSync(path.join(BASE,'cerebro','treino-relatorio.json'),'utf8'));
console.log('\nTreino:', rel.cobertura+'%', '| Nao entendeu:', rel.naoEntendeu);
if (rel.naoEntendidas.length) rel.naoEntendidas.forEach(n=>console.log(' -',n.perfil,':',n.pergunta));
