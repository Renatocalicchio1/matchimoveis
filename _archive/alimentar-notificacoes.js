const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

let notif = fs.readFileSync(path.join(BASE,'cerebro','notificacoes.js'),'utf8');

const conhecimento = `
  // PÁGINA DE NOTIFICAÇÕES
  if (/central notificacoes|pagina notificacoes|o que tem em notificacoes|menu notificacoes/.test(mNorm))
    return '🔔 <strong>Central de Notificações:</strong><br><br>' +
      '"Acompanhe solicitações de visitas, novos matches e avisos importantes."<br><br>' +
      '<strong>Tipos de notificação:</strong><br>' +
      '• 📅 Nova solicitação de visita — lead quer visitar um imóvel<br>' +
      '• 🔄 Cliente remarcou a visita — lead escolheu nova data<br>' +
      '• 🔄 Proprietário pediu remarcação — proprietário não pode no dia<br>' +
      '• ✅ Visita confirmada pelo proprietário<br>' +
      '• ✅ Cliente confirmou presença<br>' +
      '• 🎯 Novo match — lead compatível com imóvel<br><br>' +
      btn('Ver notificações','/app/notificacoes');

  // TIPOS DE NOTIFICAÇÃO
  if (/tipos notificacao|quais notificacoes|o que aparece nas notificacoes/.test(mNorm))
    return '🔔 <strong>Tipos de notificação:</strong><br><br>' +
      '• <strong>Nova solicitação de visita</strong> — mostra: lead, imóvel, data. Ações: ver lead, ver imóvel<br>' +
      '• <strong>Cliente remarcou</strong> — lead escolheu nova data. Ação: notificar proprietário<br>' +
      '• <strong>Proprietário pediu remarcação</strong> — não pode receber no dia. Ação: pedir nova data ao cliente<br>' +
      '• <strong>Visita confirmada pelo proprietário</strong> — tudo certo<br>' +
      '• <strong>Cliente confirmou presença</strong> — cliente vai comparecer<br>' +
      '• <strong>Novo match</strong> — IA encontrou imóvel compatível com lead<br><br>' +
      btn('Ver notificações','/app/notificacoes');

  // CLIENTE REMARCOU
  if (/cliente remarcou|lead remarcou|nova data cliente/.test(mNorm))
    return '🔄 <strong>Cliente remarcou a visita:</strong><br><br>' +
      'A lead escolheu uma nova data para visitar o imóvel.<br>' +
      'Você precisa <strong>notificar o proprietário</strong> sobre a nova data.<br><br>' +
      btn('Ver notificações','/app/notificacoes');

  // PROPRIETÁRIO PEDIU REMARCAÇÃO
  if (/proprietario remarcou|proprietario pediu|proprietario nao pode/.test(mNorm))
    return '🔄 <strong>Proprietário pediu remarcação:</strong><br><br>' +
      'O proprietário não pode receber o cliente na data combinada.<br>' +
      'Você precisa <strong>pedir uma nova data ao cliente</strong>.<br><br>' +
      btn('Ver notificações','/app/notificacoes');

  // NOVA SOLICITAÇÃO
  if (/nova solicitacao|nova visita solicitada|lead solicitou/.test(mNorm))
    return '📅 <strong>Nova solicitação de visita:</strong><br><br>' +
      'Uma lead quer visitar um imóvel. A notificação mostra:<br>' +
      '• Nome da lead<br>• Imóvel desejado<br>• Data e horário<br><br>' +
      'Ações disponíveis: Ver lead · Ver imóvel · Notificar proprietário<br><br>' +
      btn('Ver notificações','/app/notificacoes');
`;

if (!notif.includes('central notificacoes')) {
  // notificacoes.js tem estrutura diferente — adicionar no renderAlertas ou criar função nova
  notif = notif + `

// Responder perguntas sobre a página de notificações
function responderPagina(mNorm, btn, chip) {
${conhecimento}
  return null;
}

module.exports.responderPagina = responderPagina;
`;
  fs.writeFileSync(path.join(BASE,'cerebro','notificacoes.js'), notif);
  console.log('✅ notificacoes.js expandido');
}

// Sinônimos
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};
s['central de notificacoes'] = 'notificacoes';
s['solicitacao de visita']   = 'nova visita solicitada';
s['nova solicitacao']        = 'nova visita solicitada';
s['proprietario remarcou']   = 'proprietario pediu remarcacao';
s['cliente remarcou']        = 'cliente remarcou visita';
s['confirmou presenca']      = 'presenca confirmada';
s['visita confirmada']       = 'visita confirmada proprietario';
s['avisos importantes']      = 'notificacoes';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('✅ sinônimos notificações adicionados');

// Base conhecimento
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};
const novos = [
  {p:'o que tem na central de notificacoes', r:'pagina_notificacoes'},
  {p:'quais tipos de notificacao existem', r:'tipos_notificacao'},
  {p:'o que fazer quando cliente remarcou', r:'cliente_remarcou'},
  {p:'o que fazer quando proprietario pediu remarcacao', r:'proprietario_remarcou'},
  {p:'o que aparece numa nova solicitacao de visita', r:'nova_solicitacao'},
  {p:'como ver a lead pela notificacao', r:'nova_solicitacao'},
  {p:'como ver o imovel pela notificacao', r:'nova_solicitacao'},
  {p:'quando aparece notificacao de match', r:'tipos_notificacao'},
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
