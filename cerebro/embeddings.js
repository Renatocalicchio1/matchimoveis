'use strict';

const SINONIMOS = {
  leads: ['leads','clientes','interessados','compradores','contatos','prospects','base','pessoas'],
  imoveis: ['imoveis','apartamentos','casas','propriedades','estoque','carteira','unidades','imóveis'],
  visitas: ['visitas','agendamentos','agenda','compromissos'],
  whatsapp: ['whatsapp','wpp','zap','instancia','qrcode'],
  match: ['match','cruzamento','combinacao','compativel'],
  vitrine: ['vitrine','oferta','link vitrine'],
  bairro: ['bairro','regiao','zona','localizacao'],
  demanda: ['demanda','procura','buscado','procurado','popular'],
  importar: ['importar','subir','carregar','planilha','excel','csv','trazer'],
  conectar: ['conectar','ligar','vincular','configurar'],
  erro: ['erro','problema','falhou','caiu','desconectou'],
  quantidade: ['quantas','quantos','total','tenho','temos','existe'],
  portais: ['vivareal','zap','olx','chaves','imovelweb','portal'],
  coins: ['coins','creditos','saldo','custo','preco'],
};

// Normalizar texto
function normalizar(txt) {
  return String(txt||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ').trim();
}

const STOP = new Set(['de','da','do','em','um','uma','que','para','com','por','se','eu','me','meu','minha','nao','sim','ok','tem','ter','isso','esse','essa','voce','vc','ai','ja','ate','mais','mas','o','a','os','as','e','ele','ela','nos','so','bem','muito','todo','toda','tenho','qual','quais','como','onde','quando','pois','ou','nem','ainda','sempre','nunca','tudo','nada','meu','minha']);

function tokenizar(txt) {
  const tokens = normalizar(txt).split(' ').filter(t => t.length > 2 && !STOP.has(t));
  const expandido = new Set(tokens);
  
  // Só expande o grupo exato que a palavra pertence
  tokens.forEach(t => {
    Object.entries(SINONIMOS).forEach(([grupo, sins]) => {
      if (sins.includes(t)) {
        // Adiciona apenas os sinônimos do mesmo grupo, não todos
        sins.slice(0,3).forEach(s => expandido.add(s));
        expandido.add(grupo);
      }
    });
  });
  
  return [...expandido];
}

function similaridade(a, b) {
  const ta = new Set(tokenizar(a));
  const tb = new Set(tokenizar(b));
  const inter = [...ta].filter(t => tb.has(t)).length;
  const uniao = new Set([...ta,...tb]).size;
  if (uniao === 0) return 0;
  return inter/uniao;
}

function buscarSimilar(query, base, threshold) {
  threshold = threshold || 0.30;
  let melhor = null, melhorScore = 0;
  for (const item of base) {
    const score = similaridade(query, item.p);
    if (score > melhorScore) { melhorScore = score; melhor = item; }
  }
  return melhorScore >= threshold ? { item: melhor, score: melhorScore } : null;
}

function buscarTop(query, base, n, threshold) {
  n = n || 5; threshold = threshold || 0.20;
  return base
    .map(item => ({ item, score: similaridade(query, item.p) }))
    .filter(r => r.score >= threshold)
    .sort((a,b) => b.score - a.score)
    .slice(0, n);
}

function expandir(txt) { return tokenizar(txt).join(' '); }

module.exports = { similaridade, buscarSimilar, buscarTop, tokenizar, normalizar, expandir };
