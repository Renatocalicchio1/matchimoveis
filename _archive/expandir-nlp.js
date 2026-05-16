const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

let nlp = fs.readFileSync(path.join(BASE,'cerebro','nlp.js'),'utf8');

// ── Adicionar corretor ortográfico agressivo ──────────────────────────────────
const corretorOrtografico = `
// ── CORRETOR ORTOGRÁFICO AGRESSIVO ───────────────────────────────────────────
const ERROS_COMUNS = {
  // imóveis
  'imovei':'imovel','imovéis':'imovel','imovieis':'imovel','imovel':'imovel',
  'imovels':'imovel','imovels':'imovel','imoviis':'imovel','imovis':'imovel',
  'imoveel':'imovel','imoviel':'imovel','imoveel':'imovel',
  // leads
  'lids':'lead','lid':'lead','leades':'lead','leards':'lead','leadss':'lead',
  'leed':'lead','lear':'lead','leds':'lead','ledas':'lead','leadas':'lead',
  // visitas
  'vizita':'visita','vizitas':'visita','visitas':'visita','visita':'visita',
  'vizta':'visita','viita':'visita','visiita':'visita','visistas':'visita',
  // match
  'matsh':'match','mach':'match','macth':'match','mtach':'match',
  'metch':'match','matck':'match','maatch':'match','mattch':'match',
  // portais
  'portias':'portais','portas':'portais','portias':'portais','portails':'portais',
  'prortais':'portais','portaiss':'portais','pirtais':'portais',
  // relatório
  'relatorrio':'relatorio','relatorio':'relatorio','relatorios':'relatorio',
  'reltatório':'relatorio','relatorio':'relatorio','relatorui':'relatorio',
  // notificações
  'notificaçao':'notificacao','notficacao':'notificacao','notifcacao':'notificacao',
  'notificaoes':'notificacao','notificacoes':'notificacao',
  // proprietário
  'proprietaro':'proprietario','propreiatario':'proprietario','proprieatario':'proprietario',
  'propietario':'proprietario','proprietaroi':'proprietario',
  // dashboard
  'dashbord':'dashboard','dasboard':'dashboard','dahsboard':'dashboard',
  'dashborad':'dashboard','daahboard':'dashboard',
  // cadastro
  'cadstro':'cadastro','casdatro':'cadastro','cadatro':'cadastro',
  'cadsatro':'cadastro','cadastaro':'cadastro',
  // imóvel parado
  'paardos':'parados','paarados':'parados','paradoos':'parados',
  // acesso
  'acsso':'acesso','acessso':'acesso','aceso':'acesso',
  // outros comuns
  'conis':'coins','moedas':'coins','pontos':'coins',
  'assitenete':'assistente','assitente':'assistente','asistente':'assistente',
  'cerero':'cerebro','cerebero':'cerebro','cererbro':'cerebro',
  'sisstema':'sistema','sitema':'sistema','sistma':'sistema',
  'perfli':'perfil','perfl':'perfil','perifil':'perfil',
  'bairo':'bairro','biarro':'bairro','bairros':'bairro',
  'vagas':'vagas','vaga':'vaga',
  'suites':'suite','suítes':'suite',
  'banheiros':'banheiro','banherios':'banheiro',
  'quartos':'quarto','qautos':'quarto','quarots':'quarto',
  'inativos':'inativo','iantivos':'inativo','inativoos':'inativo',
  'ativos':'ativo','atovos':'ativo',
  'matches':'match','matchs':'match',
  'vitrini':'vitrine','vitrinei':'vitrine','vitrne':'vitrine',
  'whatsap':'whatsapp','whatssapp':'whatsapp','watsapp':'whatsapp',
  'xmls':'xml','xxml':'xml',
  'portla':'portal','protal':'portal',
  'palnilha':'planilha','planilah':'planilha','planiha':'planilha',
  'corretor':'corretor','corretro':'corretor','corertor':'corretor',
  'imoboliaria':'imobiliaria','imobliaria':'imobiliaria','imobiliria':'imobiliaria',
};

function corrigirOrtografia(texto) {
  let t = texto.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
  const palavras = t.split(/\\s+/);
  const corrigidas = palavras.map(p => ERROS_COMUNS[p] || p);
  return corrigidas.join(' ');
}
`;

// Adicionar antes da função normalizar
if (!nlp.includes('ERROS_COMUNS')) {
  nlp = nlp.replace(
    '// ── NORMALIZAR',
    corretorOrtografico + '\n// ── NORMALIZAR'
  );

  // Chamar corrigirOrtografia dentro do normalizar
  nlp = nlp.replace(
    `function normalizar(texto) {
  let t = texto.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');`,
    `function normalizar(texto) {
  let t = corrigirOrtografia(texto);
  t = t.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');`
  );

  fs.writeFileSync(path.join(BASE,'cerebro','nlp.js'), nlp);
  console.log('✅ nlp.js — corretor ortográfico agressivo adicionado');
}

// ── Expandir sinônimos com mais erros comuns ──────────────────────────────────
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};

// Erros de digitação que chegam normalizados
const novosSimonimos = {
  // perguntas com erros
  'qauntas leads':'quantas leads',
  'meus imovieis':'meus imoveis',
  'vizitas hoje':'visitas hoje',
  'matsh hoje':'match hoje',
  'ver lids':'ver leads',
  'meus lids':'minhas leads',
  'lids quentes':'leads quentes',
  'lids com matsh':'leads com match',
  'lids sem matsh':'leads sem match',
  'imovel paardos':'imoveis parados',
  'meu relatorrio':'relatorio semanal',
  'ver portias':'ver portais',
  'meus conis':'meus coins',
  'assitenete':'assistente',
  'notificaçoes':'notificacoes',
  'propietarios':'proprietarios',
  'dashbord':'dashboard',
  'cadstrar imovel':'cadastrar imovel',
  'imobliaria':'imobiliaria',
  // variações de perguntas
  'o que tem na pagina':'o que tem',
  'como eu acesso':'como acesso',
  'como eu vejo':'como ver',
  'como eu faço':'como fazer',
  'onde eu encontro':'onde encontro',
  'onde eu vejo':'onde ver',
  'quero ver':'ver',
  'quero saber':'informar',
  'me mostra':'mostrar',
  'me diz':'informar',
  'me fala':'informar',
  'pode me dizer':'informar',
  'pode me mostrar':'mostrar',
};

Object.assign(s, novosSimonimos);
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log(`✅ sinônimos — total agora: ${Object.keys(s).length}`);

// ── Testar com palavras erradas ───────────────────────────────────────────────
console.log('\n🧪 Testando correção ortográfica...');
const {execSync} = require('child_process');

const teste = execSync(`node -e "
const nlp = require('./cerebro/nlp');
const casos = [
  'meus imovei',
  'ver lids',
  'vizitas hoje',
  'matsh',
  'dashbord',
  'portias',
  'relatorrio',
  'assitenete',
  'lids quentes',
  'meus conis'
];
casos.forEach(p => {
  const n = nlp.normalizar(p);
  const d = nlp.detectarDominio(n);
  console.log(p + ' → ' + n + ' [' + (d||'?') + ']');
});
"`, {cwd:BASE}).toString();
console.log(teste);

// Rodar treino
execSync('node treino-cerebro.js --silent', {cwd:BASE});
const rel = JSON.parse(fs.readFileSync(path.join(BASE,'cerebro','treino-relatorio.json'),'utf8'));
console.log(`🧪 Treino: ${rel.cobertura}% | Não entendeu: ${rel.naoEntendeu}`);
if (rel.naoEntendidas.length) rel.naoEntendidas.forEach(n=>console.log(' -',n.pergunta));
