const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

let vis = fs.readFileSync(path.join(BASE,'cerebro','visitas.js'),'utf8');

const conhecimento = `
  // PÁGINA DE VISITAS — o que tem
  if (/pagina visitas|o que tem em visitas|menu visitas|app visitas/.test(mNorm))
    return '📅 <strong>Página Visitas:</strong><br><br>' +
      '• Nome do cliente<br>' +
      '• Telefone<br>' +
      '• Imóvel solicitado<br>' +
      '• Data e horário da visita<br>' +
      '• Status: Solicitada · Aguardando · Confirmada · Cancelada<br>' +
      '• Ações: Notificar proprietário · Remarcar · Confirmar presença<br><br>' +
      btn('Ver visitas','/app/visitas');

  // NOTIFICAR PROPRIETÁRIO
  if (/notificar proprietario|avisar proprietario|mensagem proprietario/.test(mNorm))
    return '📱 <strong>Notificar proprietário:</strong><br><br>' +
      'Clique em <strong>Notificar Proprietário</strong> na visita.<br><br>' +
      'O sistema abre o WhatsApp com a mensagem:<br>' +
      '<em>"Olá, sou o corretor [nome], corretor parceiro. Tenho um cliente interessado no imóvel [imóvel]. Gostaria de agendar uma visita em [data] às [horário]. Confirme sua disponibilidade: [link]"</em><br><br>' +
      'O proprietário acessa o link e confirma ou recusa.<br><br>' +
      btn('Ver visitas','/app/visitas');

  // REMARCAR VISITA
  if (/remarcar|reagendar|mudar data visita|remarcar visita/.test(mNorm))
    return '🔄 <strong>Remarcar visita:</strong><br><br>' +
      'Na página de visitas, clique em <strong>Remarcar</strong> na visita desejada.<br>' +
      'Escolha nova data e horário.<br><br>' +
      btn('Ver visitas','/app/visitas');

  // STATUS DAS VISITAS
  if (/status visita|o que significa solicitada|aguardando visita|confirmada visita|cancelada/.test(mNorm))
    return '📋 <strong>Status das visitas:</strong><br><br>' +
      '• ⏳ <strong>Solicitada</strong> — lead pediu a visita, aguardando ação do corretor<br>' +
      '• 🔔 <strong>Aguardando</strong> — proprietário foi notificado, aguardando confirmação<br>' +
      '• ✅ <strong>Confirmada</strong> — proprietário confirmou disponibilidade<br>' +
      '• ❌ <strong>Cancelada</strong> — visita cancelada<br><br>' +
      btn('Ver visitas','/app/visitas');

  // FLUXO COMPLETO
  if (/fluxo visita|como funciona visita|passo a passo visita/.test(mNorm))
    return '📅 <strong>Fluxo completo de visita:</strong><br><br>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">1</span><span>Lead acessa a vitrine e escolhe um imóvel</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">2</span><span>Lead solicita visita com data e horário</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">3</span><span>Corretor notifica o proprietário via WhatsApp</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">4</span><span>Proprietário confirma ou recusa pelo link</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">5</span><span>Lead é notificada automaticamente com o resultado</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">6</span><span>Corretor registra confirmação de presença</span></div>' +
      '<br>' + btn('Ver visitas','/app/visitas');

  // CONFIRMAR PRESENÇA
  if (/confirmar presenca|presenca confirmada|cliente compareceu/.test(mNorm))
    return '✅ Após a visita, registre a presença do cliente clicando em <strong>Confirmou Presença</strong> na visita.<br><br>' +
      btn('Ver visitas','/app/visitas');

  // LINK DO PROPRIETÁRIO
  if (/link proprietario|proprietario visita|proprietario confirmar/.test(mNorm))
    return '🔗 O proprietário recebe um link exclusivo para confirmar ou recusar a visita sem precisar de cadastro.<br><br>' +
      'Link: <strong>/proprietario/visita/:visitaId/responder</strong><br><br>' +
      btn('Ver visitas','/app/visitas');
`;

if (!vis.includes('pagina visitas')) {
  vis = vis.replace(
    'function responder(mNorm, d, visitas, btn, chip) {',
    'function responder(mNorm, d, visitas, btn, chip) {' + conhecimento
  );
  fs.writeFileSync(path.join(BASE,'cerebro','visitas.js'), vis);
  console.log('✅ visitas.js expandido');
}

// Sinônimos
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};
s['notificar proprietario'] = 'avisar proprietario';
s['solicitada']             = 'visita solicitada';
s['aguardando']             = 'visita aguardando';
s['confirmou presenca']     = 'presenca confirmada';
s['cancelada']              = 'visita cancelada';
s['corretor parceiro']      = 'corretor';
s['link do proprietario']   = 'link proprietario';
s['confirme disponibilidade'] = 'confirmar visita';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('✅ sinônimos de visitas adicionados');

// Base conhecimento
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};
const novos = [
  {p:'o que tem na pagina de visitas', r:'pagina_visitas'},
  {p:'como notificar o proprietario', r:'notificar_proprietario'},
  {p:'qual mensagem e enviada ao proprietario', r:'notificar_proprietario'},
  {p:'como remarcar uma visita', r:'remarcar_visita'},
  {p:'quais os status das visitas', r:'status_visita'},
  {p:'o que significa solicitada', r:'status_visita'},
  {p:'o que significa aguardando', r:'status_visita'},
  {p:'fluxo completo de visita', r:'fluxo_visita'},
  {p:'como confirmar presenca do cliente', r:'presenca'},
  {p:'como o proprietario confirma a visita', r:'link_proprietario'},
  {p:'o proprietario precisa de cadastro', r:'link_proprietario'},
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
