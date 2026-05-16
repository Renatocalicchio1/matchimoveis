const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

let sis = fs.readFileSync(path.join(BASE,'cerebro','sistema.js'),'utf8');

const conhecimento = `
  // PÁGINA DE PERFIL
  if (/pagina perfil|app perfil|meu perfil|dados da conta|o que tem no perfil/.test(mNorm))
    return '👤 <strong>Meu Perfil (/app/perfil):</strong><br><br>' +
      '<strong>Dados da conta:</strong><br>' +
      '• Nome da conta<br>' +
      '• Celular<br>' +
      '• CRECI<br>' +
      '• CPF<br>' +
      '• Tipo de conta (Corretor · Imobiliária · Construtora)<br>' +
      '• Código do usuário (ex: R-088)<br><br>' +
      '<strong>Minha localização:</strong><br>' +
      '• Clique em <strong>Atualizar Localização</strong><br>' +
      '• O sistema detecta automaticamente onde você está<br><br>' +
      btn('Ver perfil','/app/perfil');

  // CRECI
  if (/creci|registro creci|numero creci/.test(mNorm))
    return '📋 O <strong>CRECI</strong> é o registro profissional do corretor.<br>' +
      'Fica salvo no seu perfil em <a href="/app/perfil" style="color:#ff385c;font-weight:700">Perfil →</a>';

  // CÓDIGO DO USUÁRIO
  if (/codigo usuario|id usuario|meu codigo|codigo da conta/.test(mNorm))
    return '🔑 O <strong>código do usuário</strong> é seu ID único na plataforma (ex: R-088).<br>' +
      'Aparece no menu e no perfil. Cada conta tem o seu próprio código.<br><br>' +
      btn('Ver perfil','/app/perfil');

  // LOCALIZAÇÃO
  if (/localizacao|atualizar localizacao|minha localizacao|onde estou/.test(mNorm))
    return '📍 <strong>Atualizar localização:</strong><br><br>' +
      '1. Acesse <a href="/app/perfil" style="color:#ff385c;font-weight:700">Perfil →</a><br>' +
      '2. Clique em <strong>Atualizar Localização</strong><br>' +
      '3. O sistema detecta automaticamente onde você está<br><br>' +
      'A localização é usada para personalizar resultados e demanda por região.<br><br>' +
      btn('Ver perfil','/app/perfil');

  // SALVAR PERFIL
  if (/salvar perfil|alterar dados|atualizar dados|editar perfil/.test(mNorm))
    return '💾 Para atualizar seus dados, acesse <a href="/app/perfil" style="color:#ff385c;font-weight:700">Perfil →</a>, edite as informações e clique em <strong>Salvar</strong>.';
`;

if (!sis.includes('pagina perfil')) {
  sis = sis.replace(
    'function responder(mNorm, d, btn, chip) {',
    'function responder(mNorm, d, btn, chip) {' + conhecimento
  );
  fs.writeFileSync(path.join(BASE,'cerebro','sistema.js'), sis);
  console.log('✅ sistema.js — perfil adicionado');
}

// Sinônimos
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};
s['meu perfil']           = 'perfil';
s['dados da conta']       = 'perfil';
s['atualizar localizacao']= 'localizacao';
s['minha localizacao']    = 'localizacao';
s['creci']                = 'creci';
s['codigo do usuario']    = 'codigo usuario';
s['id do usuario']        = 'codigo usuario';
s['tipo de conta']        = 'tipo conta';
s['salvar perfil']        = 'salvar perfil';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('✅ sinônimos perfil adicionados');

// Base conhecimento
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};
const novos = [
  {p:'o que tem na pagina de perfil', r:'pagina_perfil'},
  {p:'como atualizar meus dados', r:'salvar_perfil'},
  {p:'onde coloco meu creci', r:'creci'},
  {p:'o que e o codigo do usuario', r:'codigo_usuario'},
  {p:'como atualizar minha localizacao', r:'localizacao'},
  {p:'para que serve a localizacao', r:'localizacao'},
  {p:'como mudar o tipo de conta', r:'pagina_perfil'},
  {p:'onde fica meu cpf', r:'pagina_perfil'},
  {p:'como salvar o perfil', r:'salvar_perfil'},
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
