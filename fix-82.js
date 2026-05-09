const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// ── Fix 1: nlp.js — detectarDominio mais abrangente ─────────────────────────
let nlp = fs.readFileSync(path.join(BASE,'cerebro','nlp.js'),'utf8');
nlp = nlp.replace(
  "if (/ver portal|ver portais|ver portias|portias|portais|vivareal|\\bzap\\b|\\bolx\\b|chaves|imovelweb|feed|rejeitou|nao publicou/.test(mNorm)) return 'portais';",
  "if (/ver portal|ver portais|ver portias|portias|portais|vivareal|\\bzap\\b|\\bolx\\b|chaves|imovelweb|feed|rejeitou|nao publicou|taxa de matsh|matsh/.test(mNorm)||/\\bxml\\b/.test(mNorm)) return 'portais';"
);
nlp = nlp.replace(
  "if (/visita|agenda|agendar|pendente visita|confirmou visita|como funciona visita|fluxo visita|proxima visita/.test(mNorm)) return 'visitas';",
  "if (/visita|agenda|agendar|pendente visita|confirmou visita|como funciona visita|fluxo visita|proxima visita|quem pediu visita|quem confirmou|avisar proprietario|proprietario visita/.test(mNorm)) return 'visitas';"
);
nlp = nlp.replace(
  "if (/faixa|valor medio|ticket|orcamento|tipo mais|quarto mais|bairro mais|mais buscado|demanda|mercado|tendencia|oferta|quartos mais|quartos pedidos|quartos buscados/.test(mNorm)) return 'mercado';",
  "if (/faixa|valor medio|ticket|orcamento|tipo mais|quarto mais|bairro mais|mais buscado|demanda|mercado|tendencia|oferta|quartos mais|quartos pedidos|quartos buscados|tipo mais buscado|quartos mais pedidos/.test(mNorm)) return 'mercado';"
);
fs.writeFileSync(path.join(BASE,'cerebro','nlp.js'), nlp);
console.log('ok nlp.js');

// ── Fix 2: sinonimos — todos os erros de digitação ───────────────────────────
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = JSON.parse(fs.readFileSync(sPath,'utf8'));
Object.assign(s, {
  'matsh':                        'match',
  'taxa de matsh':                'taxa de match',
  'meus conis':                   'meus coins',
  'ver portias':                  'ver portais',
  'dashbord':                     'dashboard',
  'quem pediu visita':            'visitas pendentes',
  'quem confirmou visita':        'visitas confirmadas',
  'avisar proprietario da visita':'notificar proprietario',
  'quem nao respondeu':           'leads sem resposta',
  'casa ate 500mil':              'casa ate 500 mil',
  'casa com 2 vagas':             'casa vagas',
  'primeiros passos':             'como comecar',
  'enviar vitrine para cliente':  'enviar vitrine',
  'campos planilha precisa':      'campos planilha',
  'quais campos planilha':        'campos planilha',
});
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('ok sinonimos total:', Object.keys(s).length);

// ── Fix 3: visitas.js — quem pediu, quem confirmou, avisar proprietário ──────
let vis = fs.readFileSync(path.join(BASE,'cerebro','visitas.js'),'utf8');
if (!vis.includes('quem pediu')) {
  const ins = `
  if (/quem pediu visita|quem solicitou|nova solicitacao/.test(mNorm)) {
    const pend = visitas.filter(v=>v.status==='solicitada'||v.status==='pendente');
    if (!pend.length) return 'Nenhuma visita solicitada no momento.' + btn('Ver visitas','/app/visitas');
    return '📋 <strong>'+pend.length+' visita(s) solicitada(s):</strong><br>'+pend.slice(0,5).map(v=>'• '+(v.nome||v.leadNome||'Lead')+' — '+(v.dataVisita||'-')).join('<br>')+'<br><br>'+btn('Ver visitas','/app/visitas');
  }
  if (/avisar proprietario|notificar proprietario|avisar dono/.test(mNorm))
    return '📱 Na página de visitas, clique em <strong>Notificar Proprietário</strong>.<br><br>O WhatsApp abre com a mensagem:<br><em>"Olá [nome]! Tenho um cliente interessado no seu imóvel. Gostaria de agendar visita em [data]. Confirme: [link]"</em><br><br>'+btn('Ver visitas','/app/visitas');
  if (/quem nao respondeu|sem resposta|nao respondeu/.test(mNorm))
    return '📋 Leads sem resposta ficam com status <strong>pendente</strong> na página de leads.<br><br>'+btn('Ver leads','/app/leads');
`;
  vis = vis.replace('function responder(mNorm, d, visitas, btn, chip) {',
    'function responder(mNorm, d, visitas, btn, chip) {' + ins);
  fs.writeFileSync(path.join(BASE,'cerebro','visitas.js'), vis);
  console.log('ok visitas.js');
}

// ── Fix 4: sistema.js — primeiros passos ─────────────────────────────────────
let sis = fs.readFileSync(path.join(BASE,'cerebro','sistema.js'),'utf8');
if (!sis.includes('primeiros passos')) {
  const ins = `
  if (/primeiros passos|como comecar|por onde comecar|primeiro passo|nao sei comecar|inicio|comecar/.test(mNorm))
    return '🚀 <strong>Primeiros passos no MatchImóveis:</strong><br><br>'+
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">1</span><span>Importe seus imóveis via XML do CRM</span></div>'+
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">2</span><span>Importe suas leads da planilha dos portais</span></div>'+
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">3</span><span>Faça o match — a IA cruza leads com imóveis</span></div>'+
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">4</span><span>Envie a vitrine para as leads com match</span></div>'+
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">5</span><span>Aguarde a solicitação de visita</span></div>'+
      '<br>'+btn('Cadastrar imóvel','/app/cadastro')+btn('Importar leads','/app-importar-leads');
`;
  sis = sis.replace('function responder(mNorm, d, btn, chip) {',
    'function responder(mNorm, d, btn, chip) {' + ins);
  fs.writeFileSync(path.join(BASE,'cerebro','sistema.js'), sis);
  console.log('ok sistema.js');
}

// ── Fix 5: rag.js — busca com vagas ─────────────────────────────────────────
let rag = fs.readFileSync(path.join(BASE,'cerebro','rag.js'),'utf8');
if (!rag.includes('vagas')) {
  rag = rag.replace(
    "if (entidades.quartos) r = r.filter(i=>i.quartos&&parseInt(i.quartos)>=entidades.quartos);",
    `if (entidades.quartos) r = r.filter(i=>i.quartos&&parseInt(i.quartos)>=entidades.quartos);
    const vagasMatch = mNorm.match(/(\\d+)\\s*vaga/);
    if (vagasMatch) r = r.filter(i=>i.vagas&&parseInt(i.vagas)>=parseInt(vagasMatch[1]));`
  );
  fs.writeFileSync(path.join(BASE,'cerebro','rag.js'), rag);
  console.log('ok rag.js — vagas adicionado');
}

// ── Rodar treino ─────────────────────────────────────────────────────────────
const {execSync} = require('child_process');
execSync('node treino-cerebro.js --silent', {cwd:BASE});
const rel = JSON.parse(fs.readFileSync(path.join(BASE,'cerebro','treino-relatorio.json'),'utf8'));
console.log('\nTreino:', rel.cobertura+'%', '| Nao entendeu:', rel.naoEntendeu);
if (rel.naoEntendidas.length) rel.naoEntendidas.forEach(n=>console.log(' -',n.perfil,':',n.pergunta));
