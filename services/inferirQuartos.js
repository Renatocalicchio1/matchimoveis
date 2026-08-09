// Preenche quartos ausente (campo obrigatório pro perfil virar "suficiente"
// e gerar match — ver _perfilSuficiente em cerebro/match-core.js) usando
// outras leads já conhecidas na mesma região (bairro, com fallback pra
// cidade) e com valor parecido (±20%, mesma tolerância do motor de match).
// Critério: moda de quartos entre as candidatas na faixa; empate desempata
// pela mais próxima em valor. Ex: lead de R$350.000 com 2 quartos existente
// "empresta" o número de quartos pra uma lead de R$300-350k sem quartos.
// Usado tanto na importação de planilha (processLeads.js) quanto no backfill
// retroativo (preencherQuartosPendentes.js).
const TIPOS_SEM_QUARTOS = ['sala', 'loja', 'galpao', 'galpão', 'escritorio', 'escritório', 'comercial', 'ponto comercial', 'industria', 'indústria', 'terreno', 'predio', 'prédio', 'pavilhao', 'pavilhão', 'lote', 'area rural', 'área rural', 'chacara', 'chácara', 'sitio', 'sítio', 'fazenda'];

function semAcento(s){
  if(!s) return s;
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}

function _tipoSemQuartos(tipo) {
  if (!tipo) return false;
  const t = tipo.toLowerCase();
  return TIPOS_SEM_QUARTOS.some(x => t.includes(x));
}

function inferirQuartos(lead, pool) {
  const valor = Number(lead.valorMax) || 0;
  if (!valor) return null;
  const bairro = semAcento(lead.bairro || '').toLowerCase();
  const cidade = semAcento(lead.cidade || '').toLowerCase();
  const min = valor * 0.8, max = valor * 1.2;

  const candidatosBairro = pool.filter(p => p.bairro === bairro && p.cidade === cidade && p.valor >= min && p.valor <= max);
  const candidatos = candidatosBairro.length ? candidatosBairro : pool.filter(p => p.cidade === cidade && p.valor >= min && p.valor <= max);
  if (!candidatos.length) return null;

  const contagem = {};
  candidatos.forEach(c => { contagem[c.quartos] = (contagem[c.quartos] || 0) + 1; });
  const maxContagem = Math.max(...Object.values(contagem));
  const empatados = candidatos.filter(c => contagem[c.quartos] === maxContagem);
  empatados.sort((a, b) => Math.abs(a.valor - valor) - Math.abs(b.valor - valor));
  return empatados[0].quartos;
}

module.exports = { inferirQuartos, semAcento, _tipoSemQuartos };
