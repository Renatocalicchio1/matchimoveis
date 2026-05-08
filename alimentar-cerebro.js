const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// ── 1. Expandir sistema.js com conhecimento do dashboard e menu ───────────────
let sis = fs.readFileSync(path.join(BASE,'cerebro','sistema.js'),'utf8');

const novasExplicacoes = `
  // DASHBOARD
  if (/dashboard|painel|painel de controle/.test(mNorm))
    return '📊 <strong>Dashboard — o que tem:</strong><br><br>' +
      '🏠 <strong>Imóveis na carteira</strong> — total cadastrado<br>' +
      '🎯 <strong>Matches gerados</strong> — total e por lead<br>' +
      '👥 <strong>Total de leads</strong><br>' +
      '📊 <strong>Taxa de match</strong> — % de leads com match<br>' +
      '📅 <strong>Visitas agendadas</strong><br>' +
      '📋 <strong>Atividades recentes</strong><br>' +
      '📈 Gráficos: imóveis por tipo, por bairro, leads por bairro, visitas por estado<br><br>' +
      btn('Ir para dashboard','/app-home');

  // MENU
  if (/menu|navegacao|onde encontro|onde fica|onde acho/.test(mNorm))
    return '📋 <strong>Menu da plataforma:</strong><br><br>' +
      '• 📊 Dashboard<br>' +
      '• 🏠 Meus Imóveis<br>' +
      '• 👥 Leads<br>' +
      '• 📅 Visitas<br>' +
      '• 🔔 Notificações<br>' +
      '• ➕ Cadastrar Imóveis<br>' +
      '• 🔗 Portais<br>' +
      '• 👤 Perfil<br>' +
      '• 🪙 MatchCoins<br>' +
      '• 🤖 Assistente<br><br>' +
      'Cada usuário tem ID único (ex: R-088) e vê apenas seus próprios dados.';

  // TIPOS DE IMÓVEL
  if (/tipos de imovel|tipos imovel|quais tipos|tipo de imovel/.test(mNorm))
    return '🏠 <strong>Tipos de imóvel disponíveis:</strong><br><br>' +
      'Apartamento · Sobrado · Estúdio · Casa · Comercial · Residencial · Outros<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // TIPOS DE CONTA
  if (/tipo de conta|tipo conta|corretor|construtor|proprietario conta/.test(mNorm))
    return '👤 <strong>Tipos de conta:</strong><br><br>' +
      '• Corretor imobiliário<br>' +
      '• Construtor<br>' +
      '• Proprietário<br><br>' +
      'Cada conta tem ID único e armazena apenas seus próprios imóveis, leads e visitas.';

  // MATCHCOINS
  if (/matchcoin|match coin|coin/.test(mNorm))
    return '🪙 <strong>MatchCoins</strong> — sistema de recompensas.<br><br>' +
      'Ganhe coins a cada match realizado. Futuramente usados para recursos premium.<br><br>' +
      btn('Ver MatchCoins','/app/coins');

  // TAXA DE MATCH
  if (/taxa de match|taxa match|percentual match/.test(mNorm)) {
    return '📊 <strong>Taxa de match</strong> = quantidade de leads que receberam match ÷ total de leads × 100%<br><br>' +
      'Exemplo: 41 matches em 87 leads = 47% de taxa.<br><br>' +
      chip('Ver meu match','ver match');
  }
`;

if (!sis.includes('painel de controle')) {
  sis = sis.replace(
    'function responder(mNorm, d, btn, chip) {',
    'function responder(mNorm, d, btn, chip) {' + novasExplicacoes
  );
  fs.writeFileSync(path.join(BASE,'cerebro','sistema.js'), sis);
  console.log('✅ sistema.js — dashboard, menu, tipos adicionados');
}

// ── 2. Expandir base de conhecimento ─────────────────────────────────────────
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};

const novosItens = [
  {p:'o que tem no dashboard', r:'dashboard'},
  {p:'o que aparece no painel', r:'dashboard'},
  {p:'o que sao matchcoins', r:'matchcoins'},
  {p:'como funciona matchcoins', r:'matchcoins'},
  {p:'quais tipos de imovel existem', r:'tipos_imovel'},
  {p:'quais tipos de conta existem', r:'tipos_conta'},
  {p:'o que e taxa de match', r:'taxa_match'},
  {p:'como calcula taxa de match', r:'taxa_match'},
  {p:'o que tem no menu', r:'menu'},
  {p:'onde encontro leads', r:'menu'},
  {p:'onde cadastro imovel', r:'menu'},
  {p:'o que e md', r:'match'},
  {p:'o que significa md', r:'match'},
  {p:'md e match', r:'match'},
  {p:'quantos md gerei', r:'ver_match'},
  {p:'atividades recentes', r:'dashboard'},
  {p:'acoes rapidas', r:'dashboard'},
  {p:'metricas do painel', r:'dashboard'},
  {p:'grafico de imoveis', r:'dashboard'},
  {p:'grafico de leads', r:'dashboard'},
  {p:'bairros disponiveis', r:'mercado'},
  {p:'estados disponiveis', r:'mercado'},
];

const existentes = new Set(base.items.map(i=>i.p));
let adicionados = 0;
novosItens.forEach(item => {
  if (!existentes.has(item.p)) {
    base.items.push(item);
    adicionados++;
  }
});
base.total = base.items.length;
base.atualizadoEm = new Date().toISOString();
fs.writeFileSync(baseP, JSON.stringify(base,null,2));
console.log(`✅ base conhecimento — ${adicionados} novos itens (total: ${base.total})`);

// ── 3. Adicionar sinônimos de MD = match ──────────────────────────────────────
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};
s['md'] = 'match';
s['mds'] = 'match';
s['quantos md'] = 'total match';
s['taxa md'] = 'taxa match';
s['md gerado'] = 'match gerado';
s['painel de controle'] = 'dashboard';
s['painel'] = 'dashboard';
s['matchcoin'] = 'coins';
s['match coin'] = 'coins';
s['corretor imobiliario'] = 'corretor';
s['tipo da conta'] = 'tipo conta';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('✅ sinônimos — MD=match e outros adicionados');

// ── 4. Rodar treino para validar ──────────────────────────────────────────────
console.log('\n🧪 Validando...');
const {execSync} = require('child_process');
const r = execSync('node treino-cerebro.js --silent', {cwd:BASE}).toString();
const rel = JSON.parse(fs.readFileSync(path.join(BASE,'cerebro','treino-relatorio.json'),'utf8'));
console.log(`Cobertura: ${rel.cobertura}% | Não entendeu: ${rel.naoEntendeu}`);
if (rel.naoEntendidas.length) {
  console.log('Ainda falha:');
  rel.naoEntendidas.forEach(n => console.log(' -', n.pergunta));
}
