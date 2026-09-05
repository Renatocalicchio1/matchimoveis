// Motor de Retenção, Fase 14 — A/B testing (ver CLAUDE.md).
// Bucketing determinístico por hash — mesmo usuário + mesmo experimento
// sempre cai na mesma variante, sem precisar de tabela nem estado
// nenhum. Uso: ex. testar limiares de nível (Fase 5) ou textos de
// notificação (Fase 7) sem tocar em produção pra todo mundo de uma vez.
function _hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

// variantes: array não vazio, ex: ['controle', 'variante_a']. Distribuição
// uniforme por hash — não é aleatório a cada chamada, é estável por par
// usuário+experimento.
function variante(usuarioId, nomeExperimento, variantes) {
  if (!Array.isArray(variantes) || !variantes.length) return null;
  if (variantes.length === 1) return variantes[0];
  const idx = _hash(String(usuarioId || '') + ':' + String(nomeExperimento || '')) % variantes.length;
  return variantes[idx];
}

module.exports = { variante };
