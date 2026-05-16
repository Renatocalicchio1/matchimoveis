const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

let ld = fs.readFileSync(path.join(BASE,'cerebro','leads.js'),'utf8');

const conhecimento = `
  // CARD DA LEAD
  if (/card lead|o que aparece na lead|informacoes da lead/.test(mNorm))
    return '👤 <strong>Card da lead mostra:</strong><br><br>' +
      '• Nome da lead<br>' +
      '• Telefone<br>' +
      '• Origem: importada ou orgânica<br>' +
      '• Status de extração: extraído ou pendente<br>' +
      '• Botão WhatsApp — falar com o cliente<br>' +
      '• Botão Ver Vitrine — abre a vitrine da lead<br>' +
      '• Botão Enviar Vitrine — abre WhatsApp com mensagem padrão<br><br>' +
      btn('Ver leads','/app/leads');

  // VITRINE
  if (/vitrine|o que e vitrine|como funciona vitrine|ver vitrine/.test(mNorm))
    return '✨ <strong>Vitrine da lead:</strong><br><br>' +
      'A vitrine é uma página exclusiva gerada para cada lead com os imóveis em match.<br><br>' +
      'Link: <strong>/cliente/oferta/:leadId</strong><br><br>' +
      '<strong>Enviar vitrine:</strong> abre o WhatsApp com a mensagem:<br>' +
      '<em>"Olá! Separamos algumas oportunidades semelhantes ao que você buscou. Veja sua vitrine: [link]"</em><br><br>' +
      btn('Ver leads','/app/leads');

  // ENVIAR VITRINE
  if (/enviar vitrine|mandar vitrine|como enviar vitrine/.test(mNorm))
    return '📱 <strong>Enviar vitrine para a lead:</strong><br><br>' +
      '1. Acesse a lead em ' + btn('Leads','/app/leads') + '<br>' +
      '2. Clique em <strong>Enviar Vitrine</strong><br>' +
      '3. Abre o WhatsApp com mensagem padrão:<br>' +
      '<em>"Olá! Separamos algumas oportunidades semelhantes ao que você buscou. Veja sua vitrine: [link]"</em><br><br>' +
      'O lead clica no link, escolhe o imóvel e solicita visita.';

  // WHATSAPP DA LEAD
  if (/whatsapp lead|falar com lead|contato lead|botao whatsapp/.test(mNorm))
    return '📱 Cada lead tem um botão <strong>WhatsApp</strong> no card.<br><br>' +
      'Clique para abrir a conversa diretamente com o cliente.<br><br>' +
      btn('Ver leads','/app/leads');

  // ORGÂNICA VS IMPORTADA
  if (/organica|importada|diferenca organica|o que e organica/.test(mNorm))
    return '📋 <strong>Tipos de lead:</strong><br><br>' +
      '• 🌐 <strong>Orgânica</strong> — veio automaticamente dos portais parceiros (Rankim, ImovelWeb, ZAP, VivaReal...)<br>' +
      '• 📋 <strong>Importada</strong> — você mesmo importou via planilha CSV ou Excel<br><br>' +
      btn('Ver leads','/app/leads');

  // EXTRAÇÃO
  if (/extracao|extraido|pendente extracao|perfil extraido/.test(mNorm))
    return '🤖 <strong>Extração de perfil:</strong><br><br>' +
      'A IA lê os dados da lead e extrai automaticamente:<br>' +
      'bairro · tipo de imóvel · quartos · valor máximo · área<br><br>' +
      '• ✅ <strong>Extraído</strong> — IA processou com sucesso<br>' +
      '• ⏳ <strong>Pendente</strong> — aguardando processamento<br><br>' +
      'Sem extração completa o match não funciona corretamente.';
`;

if (!ld.includes('card lead')) {
  ld = ld.replace(
    'function responder(mNorm, d, leads, btn, chip) {',
    'function responder(mNorm, d, leads, btn, chip) {' + conhecimento
  );
  fs.writeFileSync(path.join(BASE,'cerebro','leads.js'), ld);
  console.log('✅ leads.js — card, vitrine, whatsapp adicionados');
}

// Sinônimos
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};
s['ver vitrine']      = 'vitrine';
s['enviar vitrine']   = 'enviar vitrine';
s['mandar vitrine']   = 'enviar vitrine';
s['botao whatsapp']   = 'whatsapp lead';
s['falar com cliente']= 'whatsapp lead';
s['mensagem padrao']  = 'mensagem automatica';
s['oportunidades']    = 'match imovel';
s['perfil extraido']  = 'extracao ok';
s['perfil pendente']  = 'pendente extracao';
s['cliente barra oferta'] = 'vitrine';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('✅ sinônimos adicionados');

// Base conhecimento
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};
const novos = [
  {p:'o que aparece no card da lead', r:'card_lead'},
  {p:'como ver a vitrine da lead', r:'vitrine'},
  {p:'como enviar a vitrine para o cliente', r:'enviar_vitrine'},
  {p:'qual mensagem e enviada na vitrine', r:'enviar_vitrine'},
  {p:'como falar com a lead pelo whatsapp', r:'whatsapp_lead'},
  {p:'qual a diferenca entre organica e importada', r:'organica_importada'},
  {p:'o que significa extraido', r:'extracao'},
  {p:'o que significa pendente de extracao', r:'extracao'},
  {p:'o que a ia extrai da lead', r:'extracao'},
  {p:'sem extracao o match funciona', r:'extracao'},
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
