const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// ── 1. Expandir leads.js ──────────────────────────────────────────────────────
let ld = fs.readFileSync(path.join(BASE,'cerebro','leads.js'),'utf8');

const conhecimento = `
  // PÁGINA DE LEADS — o que tem
  if (/pagina leads|o que tem em leads|menu leads|app leads/.test(mNorm))
    return '👥 <strong>Página Leads (/app/leads):</strong><br><br>' +
      '📊 <strong>Totais:</strong> Total de leads · IA encontrou imóvel · Sem match · Total de matches<br><br>' +
      '🔍 <strong>Filtros:</strong><br>' +
      '• Status: IA encontrou imóvel · Dados extraídos · Pendente de extração · Orgânica · Importada<br>' +
      '• Score: 30+ · 50+ · 60+ · 70+ · 90+<br>' +
      '• Fonte: Ranking · ImovelWeb · Quinto Andar · ZAP · VivaReal · Própria<br>' +
      '• Busca inteligente: nome, e-mail, celular ou bairro<br><br>' +
      btn('Ver leads','/app/leads');

  // STATUS DAS LEADS
  if (/status lead|status das leads|o que significa pendente|o que significa organica|dados extraidos/.test(mNorm))
    return '📋 <strong>Status das leads:</strong><br><br>' +
      '• 🤖 <strong>IA encontrou imóvel</strong> — lead tem match com imóvel da carteira<br>' +
      '• ✅ <strong>Dados extraídos</strong> — IA extraiu bairro, tipo, quartos, valor<br>' +
      '• ⏳ <strong>Pendente de extração</strong> — aguardando processamento da IA<br>' +
      '• 🌐 <strong>Orgânica</strong> — veio diretamente do portal<br>' +
      '• 📋 <strong>Importada</strong> — veio de planilha enviada manualmente<br><br>' +
      btn('Ver leads','/app/leads');

  // SCORE
  if (/score lead|score das leads|o que e score|filtrar por score/.test(mNorm))
    return '⭐ <strong>Score das leads:</strong><br><br>' +
      'O score mede a compatibilidade entre lead e imóvel.<br>' +
      'Quanto maior, melhor o match.<br><br>' +
      '• 30+ · 50+ · 60+ · 70+ · 90+<br><br>' +
      'Filtre por score para ver as leads mais quentes primeiro.<br>' +
      btn('Ver leads','/app/leads');

  // FONTES DAS LEADS
  if (/fonte lead|de onde vem|origem lead|portal lead/.test(mNorm))
    return '🌐 <strong>Fontes de leads:</strong><br><br>' +
      '• Ranking (Rankim)<br>' +
      '• ImovelWeb<br>' +
      '• Quinto Andar<br>' +
      '• ZAP Imóveis<br>' +
      '• VivaReal<br>' +
      '• Própria (importada pelo usuário)<br><br>' +
      btn('Ver leads','/app/leads');

  // BUSCA INTELIGENTE
  if (/busca inteligente|buscar lead|pesquisar lead/.test(mNorm))
    return '🔍 <strong>Busca inteligente de leads:</strong><br><br>' +
      'Busque por: nome · e-mail · celular · bairro<br><br>' +
      btn('Ver leads','/app/leads');

  // IMPORTAR LEADS — campos obrigatórios
  if (/campos importar|campos planilha|campos obrigatorios lead|o que precisa na planilha/.test(mNorm))
    return '📋 <strong>Campos da planilha de leads:</strong><br><br>' +
      '<strong>Obrigatórios:</strong><br>' +
      '• Nome · Celular/Telefone · E-mail<br>' +
      '• ID do anúncio · URL do anúncio<br>' +
      '• Estado · Cidade · Bairro<br>' +
      '• Quartos · Suítes · Banheiros · Vagas · Área · Valor<br><br>' +
      '<strong>Mais importantes:</strong> ID do anúncio, nome, celular, e-mail e URL do portal.<br><br>' +
      'Formatos aceitos: <strong>CSV</strong> ou <strong>Excel (.xlsx)</strong>' +
      btn('Importar leads','/app-importar-leads');

  // COMO IMPORTAR
  if (/como importar lead|importar planilha lead|enviar planilha/.test(mNorm))
    return '📋 <strong>Importar leads — passo a passo:</strong><br><br>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">1</span><span>Prepare a planilha CSV ou Excel com os campos obrigatórios</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">2</span><span>Clique em <strong>Importar Leads</strong> na página de leads</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">3</span><span>Clique em <strong>Escolher Arquivo</strong> e selecione o arquivo</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">4</span><span>Clique em <strong>Enviar Planilha</strong> para iniciar a importação</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">5</span><span>A IA lê a planilha e extrai automaticamente os dados</span></div>' +
      '<br>' + btn('Importar leads','/app-importar-leads');
`;

if (!ld.includes('pagina leads')) {
  ld = ld.replace(
    'function responder(mNorm, d, leads, btn, chip) {',
    'function responder(mNorm, d, leads, btn, chip) {' + conhecimento
  );
  fs.writeFileSync(path.join(BASE,'cerebro','leads.js'), ld);
  console.log('✅ leads.js expandido');
}

// ── 2. Sinônimos ──────────────────────────────────────────────────────────────
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};
s['ia encontrou imovel']     = 'lead com match';
s['dados extraidos']         = 'extracao ok';
s['pendente de extracao']    = 'pendente extracao';
s['organica']                = 'lead organica';
s['importada']               = 'lead importada';
s['score 30']                = 'score lead';
s['score 50']                = 'score lead';
s['score 70']                = 'score lead';
s['score 90']                = 'score lead';
s['busca inteligente']       = 'buscar lead';
s['enviar planilha']         = 'importar leads';
s['escolher arquivo']        = 'importar leads';
s['rankim']                  = 'ranking';
s['quinto andar']            = 'quintoandar';
s['imovel web']              = 'imovelweb';
s['url do anuncio']          = 'url anuncio';
s['id do anuncio']           = 'id anuncio';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('✅ sinônimos de leads adicionados');

// ── 3. Base de conhecimento ───────────────────────────────────────────────────
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};
const novos = [
  {p:'o que tem na pagina de leads', r:'pagina_leads'},
  {p:'quais os status das leads', r:'status_lead'},
  {p:'o que significa ia encontrou imovel', r:'status_lead'},
  {p:'o que significa pendente de extracao', r:'status_lead'},
  {p:'o que e score de lead', r:'score_lead'},
  {p:'como filtrar leads por score', r:'score_lead'},
  {p:'de onde vem as leads', r:'fonte_lead'},
  {p:'quais portais geram leads', r:'fonte_lead'},
  {p:'como fazer busca inteligente', r:'busca_lead'},
  {p:'quais campos precisa na planilha', r:'campos_planilha'},
  {p:'precisa ter id do anuncio', r:'campos_planilha'},
  {p:'como enviar a planilha', r:'importar_leads'},
  {p:'qual formato aceita para importar', r:'importar_leads'},
  {p:'csv ou excel para importar leads', r:'importar_leads'},
  {p:'o que e lead organica', r:'status_lead'},
  {p:'o que e lead importada', r:'status_lead'},
  {p:'quinto andar tem leads', r:'fonte_lead'},
  {p:'leads do ranking', r:'fonte_lead'},
];
const exist = new Set(base.items.map(i=>i.p));
let add = 0;
novos.forEach(n => { if (!exist.has(n.p)) { base.items.push(n); add++; } });
base.total = base.items.length;
fs.writeFileSync(baseP, JSON.stringify(base,null,2));
console.log(`✅ base conhecimento — ${add} novos (total: ${base.total})`);

// ── 4. Rodar treino ───────────────────────────────────────────────────────────
const {execSync} = require('child_process');
execSync('node treino-cerebro.js --silent', {cwd:BASE});
const rel = JSON.parse(fs.readFileSync(path.join(BASE,'cerebro','treino-relatorio.json'),'utf8'));
console.log(`\n🧪 Treino: ${rel.cobertura}% | Não entendeu: ${rel.naoEntendeu}`);
if (rel.naoEntendidas.length) rel.naoEntendidas.forEach(n=>console.log(' -',n.pergunta));
