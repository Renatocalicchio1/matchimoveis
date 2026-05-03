const fs = require('fs');

function normalizeTipo(tipo = '') {
  const t = (tipo || '').toLowerCase();
  if (t.includes('apart')) return 'apartamento';
  if (t.includes('casa') || t.includes('sobrado')) return 'casa';
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

  // valor mais barato = melhor
  if (baseValor > 0 && valor < baseValor) {
    score += 50;
    score += Math.round(((baseValor - valor) / baseValor) * 20);
  }

  // área maior = melhor
  if (area > baseArea) score += 30;

  // quartos extras
  if ((c.quartos || 0) > (origin.quartos || 0)) score += 20;

  // suítes
  const suitesDiff = (c.suites || 0) - (origin.suites || 0);
  if (suitesDiff >= 0) score += 15;
  else if (suitesDiff === -1) score += 5;

  // vagas
  const vagasDiff = (c.vagas || 0) - (origin.vagas || 0);
  if (vagasDiff >= 0) score += 15;
  else if (vagasDiff === -1) score += 5;

  // bônus: imóvel da base interna
  if (c.fonte === 'rankim') score += 25;

  return score;
}

function passaFiltros(origin, c) {
  // cidade e estado obrigatórios
  const cidade = (c.cidade || '').toLowerCase();
  const estado = (c.estado || '').toLowerCase();
  if (!cidade.includes('são paulo') && !cidade.includes('sao paulo')) return false;
  if (estado !== 'sp') return false;

  // tipo igual
  if (normalizeTipo(c.tipo) !== normalizeTipo(origin.tipo)) return false;

  // bairro igual
  if (!c.bairro || !origin.bairro) return false;
  if (normBairro(c.bairro) !== normBairro(origin.bairro)) return false;

  // quartos >= origem
  if ((c.quartos || 0) < (origin.quartos || 0)) return false;

  // valor: -35% até +20%
  const valor = c.valor_imovel || c.valor || 0;
  const baseValor = origin.valor_imovel || origin.valor || 0;
  if (baseValor > 0) {
    if (valor < baseValor * 0.50) return false;
    if (valor > baseValor * 1.25) return false;
  }

  // área: mínimo -20%
  const area = c.area_m2 || c.area || 0;
  const baseArea = origin.area_m2 || origin.area || 0;
  if (baseArea > 0 && area < baseArea * 0.80) return false;

  return true;
}

// Busca na base interna Rankim (imoveis.json)
function searchRankim(origin) {
  try {
    if (!fs.existsSync('imoveis.json')) return [];
    const base = JSON.parse(fs.readFileSync('imoveis.json', 'utf8'));
    return base
      .filter(i => passaFiltros(origin, i))
      .map(i => ({ ...i, fonte: 'rankim' }));
  } catch (e) {
    console.log('ERRO ao ler base Rankim:', e.message);
    return [];
  }
}

function findTopMatches(origin, candidatosExternos = []) {
  // 1. busca na base interna
  const internos = searchRankim(origin);
  console.log(`  📦 Base Rankim: ${internos.length} candidatos`);

  // 2. marca externos
  const externos = candidatosExternos.map(c => ({ ...c, fonte: c.fonte || 'externo' }));
  console.log(`  🌐 Externos: ${externos.length} candidatos`);

  // 3. junta e filtra externos também
  const todosExternos = externos.filter(c => passaFiltros(origin, c));

  // 4. combina: internos primeiro (já filtrados), depois externos filtrados
  const todos = [...internos, ...todosExternos];

  // 5. scoring e ordenação
  const scored = todos.map(c => ({ ...c, score: scoreMatch(origin, c) }));
  scored.sort((a, b) => b.score - a.score);

  // 6. top 8, priorizando internos
  return scored.slice(0, 8);
}

module.exports = { findTopMatches, searchRankim };
