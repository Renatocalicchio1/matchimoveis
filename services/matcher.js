function normalizeTipo(tipo = '') {
  const t = (tipo || '').toLowerCase();
  if (t.includes('apart')) return 'apartamento';
  if (t.includes('casa') || t.includes('sobrado')) return 'casa';
  if (t.includes('studio') || t.includes('flat')) return 'studio';
  if (t.includes('kitnet') || t.includes('kitinete')) return 'kitnet';
  return t;
}

function findTopMatches(origin, candidatos = []) {
  const results = [];

  for (const c of candidatos) {
    if (!c) continue;

    // 🔒 FILTROS BASE
    if (c.cidade !== 'São Paulo' || c.estado !== 'SP') continue;

    if (normalizeTipo(c.tipo) !== normalizeTipo(origin.tipo)) continue;

    if (!c.bairro || !origin.bairro) continue;
    if (c.bairro.toLowerCase() !== origin.bairro.toLowerCase()) continue;

    // 🛏️ QUARTOS (>= origem)
    if ((c.quartos || 0) < (origin.quartos || 0)) continue;

    // 💰 VALOR (-35% / +20%)
    const valor = c.valor_imovel || c.valor || 0;
    const baseValor = origin.valor_imovel || origin.valor || 0;

    const minValor = baseValor * 0.65;
    const maxValor = baseValor * 1.20;

    if (valor < minValor || valor > maxValor) continue;

    // 📐 ÁREA (mínimo -20%, máximo livre)
    const area = c.area_m2 || c.area || 0;
    const baseArea = origin.area_m2 || origin.area || 0;

    const minArea = baseArea * 0.80;
    if (area < minArea) continue;

    // 🧠 SCORE
    let score = 0;

    // 💰 mais barato = melhor
    if (valor < baseValor) {
      score += 50;
      score += Math.round(((baseValor - valor) / baseValor) * 20);
    }

    // 📐 área maior = melhor
    if (area > baseArea) score += 30;

    // 🛏️ mais quartos = melhor
    if ((c.quartos || 0) > (origin.quartos || 0)) score += 20;

    // 🛁 suítes
    const suitesDiff = (c.suites || 0) - (origin.suites || 0);
    if (suitesDiff >= 0) score += 15;
    else if (suitesDiff === -1) score += 5;

    // 🚗 vagas (quanto mais melhor)
    const vagasDiff = (c.vagas || 0) - (origin.vagas || 0);
    if (vagasDiff >= 0) score += 15;
    else if (vagasDiff === -1) score += 5;

    // 🚿 banheiros ignorado

    results.push({
      ...c,
      score
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

module.exports = { findTopMatches };
