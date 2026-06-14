'use strict';
const fs = require('fs');
const path = require('path');
const tfidf = require('./tfidf');

let _base = null;
function getBase() {
  if (_base) return _base;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname,'base-conhecimento-expandida.json'),'utf8'));
    _base = raw.items || [];
  } catch(e) { _base = []; }
  return _base;
}

function normalizar(txt) {
  return String(txt||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ').trim();
}

// Jaccard entre dois textos normalizados
function jaccard(a, b) {
  const ta = new Set(a.split(' ').filter(t=>t.length>2));
  const tb = new Set(b.split(' ').filter(t=>t.length>2));
  const inter = [...ta].filter(t=>tb.has(t)).length;
  const uniao = new Set([...ta,...tb]).size;
  return uniao === 0 ? 0 : inter/uniao;
}

// Busca na base — retorna a intenção mais próxima
function buscar(query, threshold) {
  threshold = threshold || 0.3;
  const base = getBase();
  const qNorm = normalizar(query);

  let melhor = null;
  let melhorScore = 0;

  for (const item of base) {
    const pNorm = normalizar(item.p);
    const score = jaccard(qNorm, pNorm);
    if (score > melhorScore) {
      melhorScore = score;
      melhor = item;
    }
  }

  if (melhorScore >= threshold) {
    return { item: melhor, score: melhorScore };
  }

  // Fallback: TF-IDF
  const tfRes = tfidf.detectarIntencao(query, 0.05);
  if (tfRes) return { item: { p: query, r: tfRes.intencao }, score: tfRes.score, viaTfidf: true };

  return null;
}

// Busca top N resultados
function buscarTop(query, n, threshold) {
  n = n || 3;
  threshold = threshold || 0.2;
  const base = getBase();
  const qNorm = normalizar(query);

  return base
    .map(item => ({ item, score: jaccard(qNorm, normalizar(item.p)) }))
    .filter(r => r.score >= threshold)
    .sort((a,b) => b.score - a.score)
    .slice(0, n);
}

// Aprende nova pergunta
function aprender(pergunta, intencao) {
  const base = getBase();
  const existe = base.find(i => normalizar(i.p) === normalizar(pergunta));
  if (!existe) {
    base.push({ p: pergunta, r: intencao, aprendido: true, at: new Date().toISOString() });
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(__dirname,'base-conhecimento-expandida.json'),'utf8'));
      raw.items = base;
      raw.total = base.length;
      fs.writeFileSync(path.join(__dirname,'base-conhecimento-expandida.json'), JSON.stringify(raw,null,2));
    } catch(e) {}
  }
}

module.exports = { buscar, buscarTop, aprender, normalizar, getBase };
