
function corrigirOrtografia(texto) {
  const ERROS = {
    'imovei':'imovel','imovéis':'imovel','vizita':'visita','vizitas':'visita',
    'lids':'lead','lid':'lead','leades':'lead','matsh':'match','mach':'match',
    'portias':'portais','relatorrio':'relatorio','dashbord':'dashboard',
    'assitenete':'assistente','assitente':'assistente','conis':'coins',
    'notificaçao':'notificacao','proprietaro':'proprietario','cadstro':'cadastro',
    'imobliaria':'imobiliaria','watsapp':'whatsapp','whatssapp':'whatsapp'
  };
  let t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const palavras = t.split(/\s+/);
  return palavras.map(p => ERROS[p] || p).join(' ');
}
'use strict';

const STOP = new Set([
  'de','da','do','em','um','uma','que','para','com','por','se','eu','me',
  'meu','minha','meus','minhas','nao','sim','ok','tem','ter','isso','esse',
  'essa','voce','vc','ai','ja','ate','mais','mas','o','a','os','as','e',
  'ele','ela','eles','elas','nos','lhe','so','bem','muito','todo','toda'
]);

const SINONIMOS = {
  'imovei':'imovel','imovéis':'imovel','imoveis':'imovel','imóvel':'imovel',
  'imóveis':'imovel','apto':'imovel','apartamentos':'imovel','casas':'imoveis',
  'vizita':'visita','vizitas':'visita',
  'lids':'lead','lid':'lead','leades':'lead','clientes':'lead',
  'interessados':'lead','compradores':'lead',
  'matsh':'match','mach':'match','compativel':'match',
  'conis':'coins','moedas':'coins','pontos':'coins',
  
  'carteira':'imovel',
  
  
  'cadastrar':'cadastro','adicionar':'cadastro',
  'apagar':'excluir','deletar':'excluir','remover':'excluir',
  'desativar':'inativar','ocultar':'inativar',
  'reagendar':'remarcar','adiar':'remarcar','mudar data':'remarcar',
  'aceitar':'confirmar','aprovar':'confirmar',
  'cancelar':'recusar','negar':'recusar','rejeitar':'recusar',
  'bom dia':'saudacao','boa tarde':'saudacao','boa noite':'saudacao',
  'oi':'saudacao','ola':'saudacao','hello':'saudacao','olá':'saudacao',
  'tudo bem':'saudacao','como vai':'saudacao','eai':'saudacao','ei':'saudacao',
  'portal':'portais','feed':'portais','xml':'portais',
  'vivareal':'portais','zap':'portais','olx':'portais',
  'notificacao':'notificacoes','notificações':'notificacoes','aviso':'notificacoes',
  'ajuda':'help','socorro':'help','duvida':'help',
  'resumo':'dashboard','relatorio':'dashboard','geral':'dashboard',
  'tudo':'dashboard','panorama':'dashboard'
};

// ── SINÔNIMOS APRENDIDOS (auto-gerado pelo expansor) ─────────────────────────
try {
  const fs = require('fs'), path = require('path');
  const aprendidos = JSON.parse(fs.readFileSync(path.join(__dirname,'sinonimos-aprendidos.json'),'utf8'));
  Object.assign(SINONIMOS, aprendidos);
} catch(_) {}


function tokenizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP.has(t));
}

function normalizar(texto) {
  let t = corrigirOrtografia(texto);
  t = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const entradas = Object.entries(SINONIMOS).sort((a,b) => b[0].length - a[0].length);
  for (const [e, c] of entradas) {
    try { t = t.replace(new RegExp('\\b' + e.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b','gi'), c); } catch(_) {}
  }
  return t;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1}, (_,i) => Array.from({length:n+1}, (_,j) => i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

function bigramas(tokens) {
  const bg = new Set();
  tokens.forEach(t => { for (let i=0;i<t.length-1;i++) bg.add(t[i]+t[i+1]); });
  return bg;
}

function similaridade(a, b) {
  const ta = new Set(tokenizar(a));
  const tb = new Set(tokenizar(b));
  const inter = [...ta].filter(t=>tb.has(t)).length;
  const uniao = new Set([...ta,...tb]).size;
  const jTok = uniao===0 ? 0 : inter/uniao;
  const ba = bigramas([...ta]), bb = bigramas([...tb]);
  const bInter = [...ba].filter(b=>bb.has(b)).length;
  const bUniao = new Set([...ba,...bb]).size;
  const jBi = bUniao===0 ? 0 : bInter/bUniao;
  return jTok*0.6 + jBi*0.4;
}

function detectarDominio(mNorm) {
  if (/saudacao|\boi\b|\bola\b|hello|bom dia|boa tarde|boa noite|eai/.test(mNorm)) return 'saudacao';
  if (/dashboard|resumo|relatorio|geral|panorama/.test(mNorm))                         return 'dashboard';
  if (/como funciona|o que e|o que sao|explicar|o que voce faz/.test(mNorm))           return 'sistema';
  if (/faixa|valor medio|ticket|orcamento|tipo mais|quarto mais|bairro mais|mais buscado|demanda|mercado|oferta|quartos mais/.test(mNorm)) return 'mercado';
  if (/ver portal|ver portais|ver portias|portias|portais|vivareal|\bzap\b|\bolx\b|chaves|imovelweb|feed|rejeitou|nao publicou|taxa de matsh|matsh/.test(mNorm)||/\bxml\b/.test(mNorm)) return 'portais';
  if (/importar xml|subir xml|gerar xml|\bxml\b/.test(mNorm))                        return 'portais';
  // Frases naturais de busca de imóvel para cliente
  if (/(?:cliente|comprador|interessado).*(?:querendo|quer|procura|busca|precisa|interesse)|(?:querendo|quer|procura|busca).*(?:apto|apartamento|casa|imovel|cobertura)/.test(mNorm)) return 'imoveis';
  if (/lead|cliente|interessado|comprador/.test(mNorm))                                 return 'leads';
  if (/imovel|carteira|apartamento|\bcasa\b|cobertura|terreno|sobrado/.test(mNorm))  return 'imoveis';
  if (/visita|agenda|agendar/.test(mNorm))                                              return 'visitas';
  if (/match|combinar|compativel/.test(mNorm))                                          return 'match';
  if (/coin|moeda|saldo/.test(mNorm))                                                   return 'coins';
  if (/notifica|alerta|aviso/.test(mNorm))                                              return 'notificacoes';
  if (/ajuda|help|suporte|duvida|como cadastrar|como adicionar|como inativar|como trocar|como conectar|como importar|como confirmar|como agendar/.test(mNorm)) return 'sistema';
  return null;
}

module.exports = { tokenizar, normalizar, levenshtein, similaridade, detectarDominio, SINONIMOS };
