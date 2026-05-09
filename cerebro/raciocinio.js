const fs = require('fs');
const path = require('path');

function lerJson(nome, padrao = []) {
  try {
    const file = path.join(__dirname, '..', nome);
    if (!fs.existsSync(file)) return padrao;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return padrao;
  }
}

function normalizar(txt = '') {
  return String(txt)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pontuar(pergunta, texto) {
  const p = normalizar(pergunta).split(' ').filter(w => w.length > 2);
  const t = normalizar(texto);
  let score = 0;
  for (const w of p) {
    if (t.includes(w)) score += 1;
  }
  return score;
}

function buscar(pergunta) {
  const bases = [
    'assistente-memoria.json',
    'assistente-navegacao.json',
    'assistente-nao-entendidos.json',
    'cerebro/base-conhecimento-expandida.json'
  ];

  const resultados = [];

  for (const base of bases) {
    const dados = lerJson(base, []);
    const lista = Array.isArray(dados) ? dados : Object.values(dados).flat();

    for (const item of lista) {
      const texto = typeof item === 'string' ? item : JSON.stringify(item);
      const score = pontuar(pergunta, texto);
      if (score > 0) resultados.push({ base, item, score });
    }
  }

  return resultados.sort((a, b) => b.score - a.score).slice(0, 5);
}

function raciocinar(pergunta) {
  const achados = buscar(pergunta);

  if (!achados.length) {
    return {
      resposta: 'Ainda não encontrei essa resposta na minha memória. Posso aprender essa dúvida e melhorar a base da MatchImoveis.',
      achados: []
    };
  }

  const melhor = achados[0].item;

  return {
    resposta: typeof melhor === 'string' ? melhor : (melhor.resposta || melhor.texto || melhor.conteudo || JSON.stringify(melhor, null, 2)),
    achados
  };
}

function analisarConversa(hist) {
  if (!hist || !hist.length) return { temaDominante: null, ultimoTema: null, entidades: { bairros: [], tipos: [], valores: [] } };
  const dominios = {};
  hist.forEach(h => {
    const m = normalizar(h.pergunta || '');
    if (/lead|cliente/.test(m))   dominios.leads   = (dominios.leads||0)+1;
    if (/imovel|casa|apto/.test(m)) dominios.imoveis = (dominios.imoveis||0)+1;
    if (/visita/.test(m))          dominios.visitas = (dominios.visitas||0)+1;
    if (/match/.test(m))           dominios.match   = (dominios.match||0)+1;
  });
  const temaDominante = Object.entries(dominios).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
  const ultimoTema = normalizar(hist[hist.length-1]?.pergunta || '');
  return { temaDominante, ultimoTema, entidades: { bairros: [], tipos: [], valores: [] } };
}

function buscarMelhorResposta(msg, ctx, mods, d, user, imoveis, leads, visitas, btn, chip) {
  const m = normalizar(msg);

  // Tenta cada módulo em ordem de prioridade
  const tentativas = [
    () => mods.modLeads    && mods.modLeads.responder    && mods.modLeads.responder(m, d, leads, btn, chip),
    () => mods.modImoveis  && mods.modImoveis.responder  && mods.modImoveis.responder(m, d, imoveis, btn, chip),
    () => mods.modVisitas  && mods.modVisitas.responder  && mods.modVisitas.responder(m, d, visitas, btn, chip),
    () => mods.modMatch    && mods.modMatch.responder    && mods.modMatch.responder(m, d, leads, imoveis, btn, chip),
    () => mods.modPortais  && mods.modPortais.responder  && mods.modPortais.responder(m, d, btn, chip),
    () => mods.modMercado  && mods.modMercado.responder  && mods.modMercado.responder(m, leads, imoveis, btn, chip),
    () => mods.modSistema  && mods.modSistema.responder  && mods.modSistema.responder(m, d, btn, chip),
    () => mods.suporte     && mods.suporte.responder     && mods.suporte.responder(m, btn, chip),
    () => mods.leadsTemp   && mods.leadsTemp.responder   && mods.leadsTemp.responder(m, leads, btn, chip),
    () => mods.scoring     && mods.scoring.responder     && mods.scoring.responder(m, leads, visitas, btn, chip),
  ];

  for (const tentativa of tentativas) {
    try {
      const res = tentativa();
      if (res && typeof res === 'string' && res.length > 10) return res;
    } catch(e) {}
  }
  return null;
}

function enriquecerResposta(resp, ctx, chip) {
  if (!resp || !ctx) return resp;
  // Adiciona chip contextual baseado no tema dominante da conversa
  if (ctx.temaDominante === 'leads' && !resp.includes('leads com match'))
    return resp + chip('Leads com match', 'leads com match');
  if (ctx.temaDominante === 'imoveis' && !resp.includes('Ver imóveis'))
    return resp;
  return resp;
}
module.exports = { buscar, raciocinar, analisarConversa, buscarMelhorResposta, enriquecerResposta };
