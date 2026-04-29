function norm(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function num(value) {
  return Number(value) || 0;
}

function getValor(item) {
  return num(item.valor_imovel || item.valor || item.preco || item.price);
}

function getArea(item) {
  return num(item.area_m2 || item.area || item.area_util || item.metragem);
}

function isKitnet(candidate) {
  const text = norm(`${candidate.tipo || ''} ${candidate.url || ''}`);
  return text.includes('kitnet') || text.includes('studio');
}

function calculateScore(origin, candidate) {
  let score = 0;

  if (norm(origin.cidade) !== 'sao paulo') return 0;
  if (norm(origin.estado) !== 'sp') return 0;
  if (norm(candidate.cidade) !== 'sao paulo') return 0;
  if (norm(candidate.estado) !== 'sp') return 0;

  const candidateBairro = candidate.bairro || origin.bairro;
  const candidateTipo = candidate.tipo || '';

  if (norm(origin.bairro) !== norm(candidateBairro)) return 0;

  if (!candidateTipo) return 0;
  if (norm(origin.tipo) !== norm(candidateTipo)) return 0;

  if (norm(origin.tipo) === 'apartamento' && isKitnet(candidate)) return 0;

  if (num(origin.quartos) !== num(candidate.quartos)) return 0;
  score += 30;

  const originValor = getValor(origin);
  const candidateValor = getValor(candidate);

  if (!originValor || !candidateValor) return 0;

  // Ignora imóveis absurdamente fora do perfil
  if (candidateValor < originValor * 0.50 || candidateValor > originValor * 1.80) return 0;

  if (candidateValor < originValor * 0.80 || candidateValor > originValor * 1.20) {
    return 0;
  }

  if (candidateValor >= originValor * 0.90 && candidateValor <= originValor * 1.10) {
    score += 40;
  } else {
    score += 25;
  }

  const originArea = getArea(origin);
  const candidateArea = getArea(candidate);

  if (originArea && candidateArea) {
    if (candidateArea >= originArea * 0.85 && candidateArea <= originArea * 1.15) {
      score += 20;
    } else if (candidateArea >= originArea * 0.70 && candidateArea <= originArea * 1.30) {
      score += 10;
    } else {
      score += 3;
    }
  }

  score += 10;

  return score;
}

function findTopMatches(origin, candidates, limit = 5) {
  return candidates
    .map(c => ({ ...c, score: calculateScore(origin, c) }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c, index) => ({ ...c, rank: index + 1 }));
}

module.exports = { findTopMatches };
