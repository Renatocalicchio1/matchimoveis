const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

let match = fs.readFileSync(path.join(BASE,'cerebro','match.js'),'utf8');

const conhecimento = `
  // COMO FUNCIONA O MATCH DETALHADO
  if (/como funciona o match|explicar match|o que e match|algoritmo match/.test(mNorm))
    return '🎯 <strong>Como funciona o Match:</strong><br><br>' +
      '<strong>1. Pega o perfil da lead</strong><br>' +
      'A IA extrai o que a lead procurou: bairro · tipo · quartos · valor máximo · área<br><br>' +
      '<strong>2. Busca na base interna</strong><br>' +
      '• Imóveis do próprio usuário<br>' +
      '• Imóveis de usuários parceiros do MatchImóveis<br><br>' +
      '<strong>3. Cruza os dados</strong><br>' +
      '• Bairro igual ✓<br>' +
      '• Tipo igual (apto, casa...) ✓<br>' +
      '• Quartos ≥ quartos pedidos ✓<br><br>' +
      '<strong>4. Calcula o score</strong><br>' +
      '• Valor abaixo do máximo: +50pts<br>' +
      '• Área maior que pedida: +30pts<br>' +
      '• Quartos extras: +20pts<br>' +
      '• Suítes: +15pts · Vagas: +15pts<br>' +
      '• Base interna (próprio usuário): +25pts<br><br>' +
      '<strong>5. Ordena na vitrine</strong><br>' +
      'Os imóveis com maior score aparecem primeiro na vitrine da lead.<br><br>' +
      chip('📊 Ver minha taxa de match','taxa de match');

  // BASE INTERNA VS PARCEIROS
  if (/base interna|usuarios parceiros|parceiros match|imoveis parceiros/.test(mNorm))
    return '🏠 <strong>Base de imóveis do Match:</strong><br><br>' +
      '• <strong>Base própria</strong> — imóveis cadastrados pelo próprio corretor/imobiliária<br>' +
      '• <strong>Base de parceiros</strong> — imóveis de outros usuários do MatchImóveis<br><br>' +
      'O sistema busca em ambas automaticamente, ampliando as chances de match.<br>' +
      'Imóveis da base própria recebem +25pts no score (prioridade).<br><br>' +
      btn('Ver meus imóveis','/app/imoveis');

  // SCORE DO MATCH
  if (/score match|como calcula score|pontuacao match|score imovel/.test(mNorm))
    return '⭐ <strong>Score do Match — como é calculado:</strong><br><br>' +
      '• Valor abaixo do máximo da lead: <strong>+50pts</strong><br>' +
      '• Área maior que a pedida: <strong>+30pts</strong><br>' +
      '• Quartos extras além do pedido: <strong>+20pts</strong><br>' +
      '• Suítes: <strong>+15pts</strong><br>' +
      '• Vagas: <strong>+15pts</strong><br>' +
      '• Imóvel da base interna (próprio): <strong>+25pts</strong><br><br>' +
      'Quanto maior o score, mais compatível o imóvel com a lead.<br>' +
      'O score define a ordem na vitrine — o melhor match aparece primeiro.<br><br>' +
      chip('🎯 Ver match','ver match');

  // POR QUE NÃO DEU MATCH
  if (/por que nao deu match|sem match porque|nao encontrou imovel|match falhou/.test(mNorm))
    return '❌ <strong>Por que não deu match?</strong><br><br>' +
      'Para dar match, o imóvel precisa ter:<br>' +
      '• <strong>Bairro igual</strong> ao buscado pela lead<br>' +
      '• <strong>Tipo igual</strong> (apartamento, casa...)<br>' +
      '• <strong>Quartos ≥</strong> quartos pedidos<br><br>' +
      'Causas comuns:<br>' +
      '• Nenhum imóvel no bairro que a lead busca<br>' +
      '• Tipo incompatível (lead quer apto, você tem casas)<br>' +
      '• Imóvel com quartos insuficientes<br>' +
      '• Imóvel inativo (não entra no match)<br>' +
      '• Perfil da lead ainda pendente de extração<br><br>' +
      chip('📍 Ver demanda por bairro','demanda por bairro') +
      btn('Ver imóveis','/app/imoveis');

  // VITRINE DO MATCH
  if (/vitrine match|imoveis na vitrine|ordem vitrine|como aparece na vitrine/.test(mNorm))
    return '✨ <strong>Vitrine — ordem dos imóveis:</strong><br><br>' +
      'Os imóveis em match aparecem na vitrine ordenados pelo <strong>score</strong>.<br>' +
      'O imóvel mais compatível aparece primeiro.<br><br>' +
      'A lead vê os imóveis, escolhe o favorito e solicita visita.<br><br>' +
      btn('Ver leads com match','/app/leads?filtro=com_match');
`;

if (!match.includes('base interna')) {
  match = match.replace(
    'function responder(mNorm, d, leads, imoveis, btn, chip) {',
    'function responder(mNorm, d, leads, imoveis, btn, chip) {' + conhecimento
  );
  fs.writeFileSync(path.join(BASE,'cerebro','match.js'), match);
  console.log('✅ match.js — algoritmo detalhado adicionado');
}

// Sinônimos
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};
s['base interna']         = 'base interna match';
s['usuarios parceiros']   = 'parceiros match';
s['imoveis parceiros']    = 'parceiros match';
s['base de parceiros']    = 'parceiros match';
s['perfil da lead']       = 'perfil lead';
s['perfil do imovel']     = 'perfil imovel';
s['score do match']       = 'score match';
s['pontuacao']            = 'score match';
s['ordem na vitrine']     = 'vitrine match';
s['cruza dados']          = 'algoritmo match';
s['cruzamento']           = 'algoritmo match';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('✅ sinônimos match adicionados');

// Base conhecimento
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};
const novos = [
  {p:'como o match funciona passo a passo', r:'como_match'},
  {p:'o match busca em outros usuarios', r:'base_parceiros'},
  {p:'o que e a base interna', r:'base_interna'},
  {p:'imoveis de parceiros entram no match', r:'base_parceiros'},
  {p:'como e calculado o score do match', r:'score_match'},
  {p:'por que o imovel nao apareceu no match', r:'sem_match'},
  {p:'imóvel inativo entra no match', r:'sem_match'},
  {p:'perfil pendente afeta o match', r:'sem_match'},
  {p:'qual imovel aparece primeiro na vitrine', r:'vitrine_match'},
  {p:'o score define a ordem da vitrine', r:'vitrine_match'},
  {p:'imovel proprio tem prioridade no match', r:'score_match'},
];
const exist = new Set(base.items.map(i=>i.p));
let add = 0;
novos.forEach(n => { if (!exist.has(n.p)) { base.items.push(n); add++; } });
base.total = base.items.length;
fs.writeFileSync(baseP, JSON.stringify(base,null,2));
console.log(`✅ base conhecimento — ${add} novos (total: ${base.total})`);

const {execSync} = require('child_process');
execSync('node treino-cerebro.js --silent', {cwd:BASE});
const rel = JSON.parse(fs.readFileSync(path.join(BASE,'cerebro','treino-relatorio.json'),'utf8'));
console.log(`\n🧪 Treino: ${rel.cobertura}% | Não entendeu: ${rel.naoEntendeu}`);
if (rel.naoEntendidas.length) rel.naoEntendidas.forEach(n=>console.log(' -',n.pergunta));
