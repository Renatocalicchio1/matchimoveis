'use strict';

const STOP = new Set([
  'de','da','do','em','um','uma','que','para','com','por','se','eu','me',
  'meu','minha','meus','minhas','nao','sim','ok','tem','ter','isso','esse',
  'essa','voce','vc','ai','ja','ate','mais','mas','o','a','os','as','e',
  'ele','ela','eles','elas','nos','lhe','so','bem','muito','todo','toda'
]);

const SINONIMOS = {
  'imovei':'imovel','imovéis':'imovel','imoveis':'imovel','imóvel':'imovel',
  'imóveis':'imovel','apto':'imovel','apartamentos':'imovel','casas':'imovel',
  'vizita':'visita','vizitas':'visita',
  'lids':'lead','lid':'lead','leades':'lead','clientes':'lead',
  'interessados':'lead','compradores':'lead',
  'matsh':'match','mach':'match','compativel':'match',
  'conis':'coins','moedas':'coins','pontos':'coins',
  'subir':'importar','enviar':'importar','upload':'importar','carregar':'importar',
  'carteira':'imovel',
  'quantos':'total','quantas':'total','quanto':'total',
  'mostre':'ver','mostra':'ver','exibir':'ver','listar':'ver','mostrar':'ver',
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

function tokenizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP.has(t));
}

function normalizar(texto) {
  let t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
  if (/saudacao|oi\b|ola\b|hello|bom dia|boa tarde|boa noite/.test(mNorm)) return 'saudacao';
  if (/dashboard|resumo|relatorio|geral|panorama/.test(mNorm))             return 'dashboard';
  if (/lead/.test(mNorm))            return 'leads';
  if (/imovel|carteira/.test(mNorm)) return 'imoveis';
  if (/visita/.test(mNorm))          return 'visitas';
  if (/match|combinar/.test(mNorm))  return 'match';
  if (/portal|xml|vivareal|zap|olx/.test(mNorm)) return 'portais';
  if (/coin|moeda|saldo/.test(mNorm)) return 'coins';
  if (/notifica/.test(mNorm))        return 'notificacoes';
  if (/help|ajuda|como|o que/.test(mNorm)) return 'sistema';
  if (/mercado|demanda|tendencia/.test(mNorm)) return 'mercado';
  return null;
}

module.exports = { tokenizar, normalizar, levenshtein, similaridade, detectarDominio, SINONIMOS };
