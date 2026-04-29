function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  return Number(String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
}

function txt(v) {
  return String(v || '').trim().toLowerCase();
}

function normalizeTipo(v) {
  const t = txt(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (/studio|estudio|flat/.test(t)) return "studio";
  if (/kitnet|kitinete/.test(t)) return "kitnet";
  if (/casa|sobrado/.test(t)) return "casa";
  if (/apartamento|apto/.test(t)) return "apartamento";

  return t;
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
  if (txt(origin.cidade) !== 'são paulo') return false;
  if (txt(origin.estado) !== 'sp') return false;
  if (txt(candidate.cidade) !== 'são paulo') return false;
  if (txt(candidate.estado) !== 'sp') return false;

  if (normalizeTipo(origin.tipo) !== normalizeTipo(candidate.tipo)) return false;
  if (txt(origin.bairro) !== txt(candidate.bairro)) return false;
  const originQuartos = num(origin.quartos);
  const candidateQuartos = num(candidate.quartos);
  if (!(candidateQuartos === originQuartos || candidateQuartos === originQuartos + 1)) return false;

  if (pctDiff(getValor(origin), getValor(candidate)) > 0.20) return false;
  if (pctDiff(getArea(origin), getArea(candidate)) > 0.20) return false;

  return true;
}

function scoreCandidate(origin, candidate) {
  let score = 0;

  const valorDiff = pctDiff(getValor(origin), getValor(candidate));
  const areaDiff = pctDiff(getArea(origin), getArea(candidate));

  score += Math.max(0, 40 - valorDiff * 100);
  score += Math.max(0, 40 - areaDiff * 100);
  score += txt(origin.bairro) === txt(candidate.bairro) ? 10 : 0;
  const originQuartos = num(origin.quartos);
  const candidateQuartos = num(candidate.quartos);
  if (candidateQuartos === originQuartos) score += 10;
  else if (candidateQuartos === originQuartos + 1) score += 8;
  

  return Math.round(score);
}

function findTopMatches(origin, candidates = [], limit = 8) {
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
