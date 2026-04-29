function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  return Number(String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
}

function txt(v) {
  return String(v || '').trim().toLowerCase();
}

function pctDiff(base, value) {
  base = num(base);
  value = num(value);
  if (!base || !value) return 999;
  return Math.abs(value - base) / base;
}

function getArea(obj) {
  return num(obj.area_m2 || obj.area || obj.areaUtil || obj.area_util);
}

function getValor(obj) {
  return num(obj.valor_imovel || obj.valor || obj.price);
}

function isValidCandidate(origin, candidate) {
  const originArea = getArea(origin);
  const candidateArea = getArea(candidate);

  // REGRA FORÇADA: área útil ±25% PARA TODOS OS TIPOS
  if (!originArea || !candidateArea) return false;
  if (candidateArea < originArea * 0.75) return false;
  if (candidateArea > originArea * 1.25) return false;

  if (txt(origin.cidade) !== 'são paulo') return false;
  if (txt(origin.estado) !== 'sp') return false;
  if (txt(candidate.cidade) !== 'são paulo') return false;
  if (txt(candidate.estado) !== 'sp') return false;

  if (txt(origin.tipo) && txt(candidate.tipo) && txt(origin.tipo) !== txt(candidate.tipo)) return false;
  if (txt(origin.bairro) && txt(candidate.bairro) && txt(origin.bairro) !== txt(candidate.bairro)) return false;

  if (num(origin.quartos) && num(candidate.quartos) && num(origin.quartos) !== num(candidate.quartos)) return false;

  // Valor continua limitado em ±20% para não matar demais os matches
  if (getValor(origin) && getValor(candidate) && pctDiff(getValor(origin), getValor(candidate)) > 0.20) return false;

  if (Math.abs(num(candidate.suites) - num(origin.suites)) > 1) return false;
  if (Math.abs(num(candidate.banheiros) - num(origin.banheiros)) > 1) return false;
  if (Math.abs(num(candidate.vagas) - num(origin.vagas)) > 1) return false;

  return true;
}

function scoreCandidate(origin, candidate) {
  let score = 0;

  const valorDiff = pctDiff(getValor(origin), getValor(candidate));
  const areaDiff = pctDiff(getArea(origin), getArea(candidate));

  score += Math.max(0, 30 - valorDiff * 100);
  score += Math.max(0, 25 - areaDiff * 100);
  score += txt(origin.bairro) === txt(candidate.bairro) ? 15 : 0;
  score += num(origin.quartos) === num(candidate.quartos) ? 10 : 0;
  score += Math.abs(num(candidate.suites) - num(origin.suites)) <= 1 ? 5 : 0;
  score += Math.abs(num(candidate.banheiros) - num(origin.banheiros)) <= 1 ? 5 : 0;
  score += Math.abs(num(candidate.vagas) - num(origin.vagas)) <= 1 ? 10 : 0;

  return Math.round(score);
}

function findTopMatches(origin, candidates = [], limit = 5) {
  return candidates
    .filter(candidate => isValidCandidate(origin, candidate))
    .map(candidate => ({
      ...candidate,
      score: scoreCandidate(origin, candidate)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1
    }));
}

module.exports = { findTopMatches };
