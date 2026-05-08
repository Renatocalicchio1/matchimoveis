const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// Fix 1: leads-temporal.js — não buscar por nome quando frase tem "querendo/quer/preciso"
let lt = fs.readFileSync(path.join(BASE,'cerebro','leads-temporal.js'),'utf8');
lt = lt.replace(
  'const nm = mNorm.match(/(?:lead|cliente|contato|buscar|procurar|encontrar|onde esta)\\s+([a-z]{3,})/);',
  `// Não buscar nome se a frase tem contexto de busca de imóvel
  const temContextoImovel = /querendo|quer|procura|preciso|precisa|busca|interesse|interessado/.test(mNorm);
  const nm = !temContextoImovel ? mNorm.match(/(?:lead|cliente|contato|buscar|procurar|encontrar|onde esta)\\s+([a-z]{3,})/) : null;`
);
fs.writeFileSync(path.join(BASE,'cerebro','leads-temporal.js'), lt);
console.log('ok leads-temporal.js');

// Fix 2: nlp.js — adicionar frases naturais ao detectarDominio
let nlp = fs.readFileSync(path.join(BASE,'cerebro','nlp.js'),'utf8');
nlp = nlp.replace(
  "if (/visita|agenda|agendar|pendente visita|confirmou visita|como funciona visita|fluxo visita/.test(mNorm)) return 'visitas';",
  "if (/visita|agenda|agendar|pendente visita|confirmou visita|como funciona visita|fluxo visita|proxima visita|proxima visita/.test(mNorm)) return 'visitas';"
);
// Frases naturais de busca de imóvel → RAG
nlp = nlp.replace(
  "if (/importar xml|subir xml|gerar xml|\\bxml\\b/.test(mNorm))                        return 'portais';",
  `if (/importar xml|subir xml|gerar xml|\\bxml\\b/.test(mNorm))                        return 'portais';
  // Frases naturais de busca de imóvel para cliente
  if (/(?:cliente|comprador|interessado).*(?:querendo|quer|procura|busca|precisa|interesse)|(?:querendo|quer|procura|busca).*(?:apto|apartamento|casa|imovel|cobertura)/.test(mNorm)) return 'imoveis';`
);
fs.writeFileSync(path.join(BASE,'cerebro','nlp.js'), nlp);
console.log('ok nlp.js');

// Fix 3: index.js — adicionar interpretador de frases naturais no início
let idx = fs.readFileSync(path.join(BASE,'cerebro','index.js'),'utf8');
if (!idx.includes('interpretarFraseNatural')) {
  const interpretador = `
// Interpretar frases naturais antes de tudo
function interpretarFraseNatural(mensagem, mNorm, d, imoveis, leads, visitas, btn, chip) {
  // "tenho um cliente querendo X em Y" → busca de imóvel
  if (/(?:tenho|meu|uma|um).*(?:cliente|comprador|interessado).*(?:quer|querendo|procura|busca|precisa)/.test(mNorm) ||
      /cliente.*(?:quer|querendo|busca|procura|precisa|interesse)/.test(mNorm)) {
    // Extrair tipo e bairro se houver
    const tipos = ['apartamento','apto','casa','cobertura','terreno','sobrado'];
    const tipo = tipos.find(t => mNorm.includes(t));
    const bairro = (d.bairros||[]).find(b => mNorm.includes(b.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')));
    let r = imoveis.filter(i=>i.status!=='inativo');
    if (tipo) r = r.filter(i=>i.tipo&&i.tipo.toLowerCase().includes(tipo==='apto'?'apartamento':tipo));
    if (bairro) r = r.filter(i=>i.bairro&&i.bairro.toLowerCase().includes(bairro.toLowerCase()));
    if (r.length===0) return '🔍 Não encontrei imóveis' + (tipo?' do tipo '+tipo:'') + (bairro?' em '+bairro:'') + ' na sua carteira.<br><br>' + chip('📍 Ver demanda','demanda por bairro') + btn('Ver imóveis','/app/imoveis');
    return '🔍 <strong>' + r.length + ' imóvel(is)</strong>' + (bairro?' em '+bairro:'') + ':<br>' +
      r.slice(0,5).map(i=>'• ' + (i.tipo||'Imóvel') + ' ' + (i.quartos?i.quartos+'q':'') + ' — ' + (i.bairro||'') + (i.valor?' · R$'+Number(i.valor).toLocaleString('pt-BR'):'')).join('<br>') +
      '<br><br>' + btn('Ver todos','/app/imoveis') + chip('📱 Enviar vitrine','enviar vitrine');
  }
  // "já enviei a vitrine para X" / "cliente gostou" / "cliente não gostou"
  if (/ja enviei vitrine|enviei vitrine|cliente gostou|cliente nao gostou|cliente nao curtiu/.test(mNorm))
    return '👍 Ótimo! Após o cliente ver a vitrine, ele pode solicitar uma visita diretamente.<br><br>' + btn('Ver visitas','/app/visitas') + chip('📅 Visitas pendentes','visitas pendentes');
  // "quando é a próxima visita"
  if (/proxima visita|proxima visita|quando.*visita|visita.*quando/.test(mNorm)) {
    if (d.hoje>0) return '📅 Você tem <strong>' + d.hoje + ' visita(s) hoje</strong>.<br><br>' + btn('Ver visitas de hoje','/app/visitas');
    if (d.confirmadas>0) return '📅 Você tem <strong>' + d.confirmadas + ' visita(s) confirmada(s)</strong>.<br><br>' + btn('Ver visitas','/app/visitas');
    return '📅 Nenhuma visita agendada ainda.<br><br>' + btn('Ver visitas','/app/visitas');
  }
  return null;
}
`;
  // Inserir antes da função responder
  idx = idx.replace(
    'function responder(mensagem, d, user, imoveis, leads, visitas, contexto) {',
    interpretador + '\nfunction responder(mensagem, d, user, imoveis, leads, visitas, contexto) {'
  );
  // Chamar interpretador no início da função responder
  idx = idx.replace(
    '  // Detectar intenção',
    `  // Interpretação de frases naturais primeiro
  const resNatural = interpretarFraseNatural(mensagem, mNorm, d, imoveis, leads, visitas, btn, chip);
  if (resNatural) return resNatural;

  // Detectar intenção`
  );
  fs.writeFileSync(path.join(BASE,'cerebro','index.js'), idx);
  console.log('ok index.js — interpretador de frases naturais adicionado');
}

// Testar
const {execSync} = require('child_process');
const r = execSync(`node -e "
const c=require('./cerebro/index');
const d={ativos:45,inativos:8,bairros:['Itajai','Balneario'],tipos:['Apartamento'],leads:87,organicas:52,importadas:35,comMatch:41,semMatch:46,visitas:12,hoje:2,pendentes:3,confirmadas:7};
const u={nome:'Renato',id:'test',userId:'test'};
const imoveis=[{id:'i1',userId:'test',status:'ativo',tipo:'Apartamento',bairro:'Itajai',quartos:2,valor:350000}];
const frases=['tenho um cliente querendo apto em Itajai','cliente quer casa ate 500 mil','quando e a proxima visita','ja enviei a vitrine para o joao','meu cliente nao gostou do imovel'];
frases.forEach(function(p){
  const r=c.responder(p,d,u,imoveis,[],[],{});
  const txt=r.replace(/<[^>]+>/g,'').substring(0,60);
  const ok=txt.indexOf('entendi')===-1&&txt.indexOf('captei')===-1;
  console.log((ok?'ok':'nao')+' '+p);
});
"`, {cwd:BASE}).toString();
console.log('\n' + r);
