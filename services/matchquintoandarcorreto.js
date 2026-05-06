const fs = require('fs');

function normalizeTipo(tipo = '') {
  const t = (tipo || '').toLowerCase();
  if (t.includes('apart')) return 'apartamento';
  if (t.includes('casa') || t.includes('sobrado') || t.includes('residential')) return 'casa';
  if (t.includes('studio') || t.includes('flat')) return 'studio';
  if (t.includes('kitnet') || t.includes('kitinete')) return 'kitnet';
  return t;
}

function normBairro(v = '') {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function scoreMatch(origin, c) {
  let score = 0;
  const valor = c.valor_imovel || c.valor || 0;
  const baseValor = origin.valor_imovel || origin.valor || 0;
  const area = c.area_m2 || c.area || 0;
  const baseArea = origin.area_m2 || origin.area || 0;
  if (baseValor > 0 && valor < baseValor) {
    score += 50;
    score += Math.round(((baseValor - valor) / baseValor) * 20);
  }
  if (area > baseArea) score += 30;
  if ((c.quartos || 0) > (origin.quartos || 0)) score += 20;
  const suitesDiff = (c.suites || 0) - (origin.suites || 0);
  if (suitesDiff >= 0) score += 15;
  else if (suitesDiff === -1) score += 5;
  const vagasDiff = (c.vagas || 0) - (origin.vagas || 0);
  if (vagasDiff >= 0) score += 15;
  else if (vagasDiff === -1) score += 5;
  if (c.fonte === 'rankim' || c.fonte === 'Rankim' || c.fonte === 'rankim 2') score += 25;
  return score;
}

function passaFiltros(origin, c) {
  const cidade = (c.cidade || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const cidadeOrigem = (origin.cidade || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  if (cidadeOrigem && cidade && cidade !== cidadeOrigem) return false;

  if (normalizeTipo(c.tipo) !== normalizeTipo(origin.tipo)) return false;

  if (!c.bairro || !origin.bairro) return false;
  if (normBairro(c.bairro) !== normBairro(origin.bairro)) return false;

  if ((c.quartos || 0) < (origin.quartos || 0)) return false;

  const valor = c.valor_imovel || c.valor || 0;
  const baseValor = origin.valor_imovel || origin.valor || 0;
  if (baseValor > 0) {
    if (valor < baseValor * 0.65) return false;
    if (valor > baseValor * 1.25) return false;
  }

  const area = c.area_m2 || c.area || 0;
  const baseArea = origin.area_m2 || origin.area || 0;
  if (baseArea > 0) {
    if (area < baseArea * 0.80) return false;
    if (area > baseArea * 1.35) return false;
  }

  if ((c.suites || 0) < (origin.suites || 0) - 1) return false;
  if ((c.vagas || 0) < (origin.vagas || 0) - 1) return false;

  return true;
}

function searchRankim(origin) {
  try {
    if (!fs.existsSync('imoveis.json')) return [];
    const base = JSON.parse(fs.readFileSync('imoveis.json', 'utf8'));
    return base.filter(i => passaFiltros(origin, i)).map(i => ({ ...i, fonte: i.fonte || 'rankim' }));
  } catch (e) {
    console.log('ERRO ao ler base Rankim:', e.message);
    return [];
  }
}

function findTopMatches(origin, candidatosExternos = []) {
  const internos = searchRankim(origin);
  console.log('Base Rankim:', internos.length, 'candidatos');
  const externos = candidatosExternos.map(c => ({ ...c, fonte: c.fonte || 'externo' }));
  console.log('Externos:', externos.length, 'candidatos');
  const todosExternos = externos.filter(c => passaFiltros(origin, c));
  const todos = [...internos, ...todosExternos];
  const scored = todos.map(c => {
    const score = scoreMatch(origin, c);
    return { ...c, score, bestScore: score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8);
}

module.exports = { findTopMatches, searchRankim, passaFiltros, normalizeTipo, normBairro };
