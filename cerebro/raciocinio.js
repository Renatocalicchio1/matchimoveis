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

function analisarConversa(hist){ return {temaDominante:null,ultimoTema:null,entidades:{bairros:new Set(),tipos:[],valores:[]}}; }
function buscarMelhorResposta(msg,ctx,mods,d,user,imoveis,leads,visitas,btn,chip){ return null; }
function enriquecerResposta(resp,ctx,chip){ return resp; }
module.exports = { buscar, raciocinar, analisarConversa, buscarMelhorResposta, enriquecerResposta };
