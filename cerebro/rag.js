'use strict';
/**
 * RAG — Retrieval Augmented Generation
 * Busca semântica nos dados reais + extração de slots
 */

// ── EXTRAIR SLOTS DA MENSAGEM ─────────────────────────────────────────────────
function extrairSlots(mNorm) {
  const slots = {};

  // Tipo de imóvel
  const tipos = ['apartamento','casa','cobertura','sala','terreno','sobrado','studio','loft','galpao'];
  for (const t of tipos) {
    if (mNorm.includes(t)) { slots.tipo = t; break; }
  }

  // Quartos
  const q = mNorm.match(/(\d+)\s*(?:quarto|dorm|suite)/);
  if (q) slots.quartos = parseInt(q[1]);

  // Valor entre X e Y
  const ventreMatch = mNorm.match(/entre\s*r?\$?\s*([\d.,]+)\s*(mil|k|m)?\s*(?:e|a)\s*r?\$?\s*([\d.,]+)\s*(mil|k|m)?/i);
  if (ventreMatch) {
    let vmin = parseFloat(ventreMatch[1].replace(/\./g,'').replace(',','.'));
    let vmax2 = parseFloat(ventreMatch[3].replace(/\./g,'').replace(',','.'));
    if ((ventreMatch[2]||'').match(/mil|k/i)) vmin *= 1000;
    if ((ventreMatch[4]||'').match(/mil|k/i)) vmax2 *= 1000;
    if ((ventreMatch[2]||'').match(/^m$/i)) vmin *= 1000000;
    if ((ventreMatch[4]||'').match(/^m$/i)) vmax2 *= 1000000;
    slots.valorMin = vmin;
    slots.valorMax = vmax2;
  }

  // Valor máximo
  const v = mNorm.match(/(?:ate|max|maximo|menos de|abaixo de)\s*(?:r\$)?\s*(\d+(?:[.,]\d+)?)\s*(mil|k|m)?/);
  if (v) {
    let val = parseFloat(v[1].replace(',','.'));
    if (v[2] === 'mil' || v[2] === 'k') val *= 1000;
    if (v[2] === 'm') val *= 1000000;
    slots.valorMax = val;
  }

  // Valor mínimo
  const vm = mNorm.match(/(?:partir de|minimo|acima de|mais de)\s*(?:r\$)?\s*(\d+(?:[.,]\d+)?)\s*(mil|k|m)?/);
  if (vm) {
    let val = parseFloat(vm[1].replace(',','.'));
    if (vm[2] === 'mil' || vm[2] === 'k') val *= 1000;
    if (vm[2] === 'm') val *= 1000000;
    slots.valorMin = val;
  }

  // Vagas
  const vg = mNorm.match(/(\d+)\s*vaga/);
  if (vg) slots.vagas = parseInt(vg[1]);

  // Suítes
  const su = mNorm.match(/(\d+)\s*suite/);
  if (su) slots.suites = parseInt(su[1]);

  return slots;
}

// ── BUSCA SEMÂNTICA NOS IMÓVEIS ───────────────────────────────────────────────
function buscarImoveis(mNorm, imoveis, bairrosDisponiveis) {
  const slots = extrairSlots(mNorm);

  // Detectar bairro na mensagem
  const bairroEncontrado = bairrosDisponiveis.find(b =>
    mNorm.includes(b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))
  );
  if (bairroEncontrado) slots.bairro = bairroEncontrado;

  // Se não tem nenhum slot, não é uma busca
  if (!Object.keys(slots).length) return null;

  // Filtrar imóveis
  let resultado = imoveis.filter(i => i.status !== 'inativo');

  if (slots.tipo)     resultado = resultado.filter(i => i.tipo && i.tipo.toLowerCase().includes(slots.tipo));
  if (slots.bairro)   resultado = resultado.filter(i => i.bairro && i.bairro.toLowerCase().includes(slots.bairro.toLowerCase()));
  if (slots.quartos)  resultado = resultado.filter(i => i.quartos && parseInt(i.quartos) >= slots.quartos);
  if (slots.valorMax) resultado = resultado.filter(i => i.valor_imovel && parseFloat(i.valor_imovel) <= slots.valorMax);
  if (slots.valorMin) resultado = resultado.filter(i => i.valor_imovel && parseFloat(i.valor_imovel) >= slots.valorMin);
  if (slots.vagas)    resultado = resultado.filter(i => i.vagas && parseInt(i.vagas) >= slots.vagas);
  if (slots.suites)   resultado = resultado.filter(i => i.suites && parseInt(i.suites) >= slots.suites);

  return { slots, resultado };
}

// ── BUSCA SEMÂNTICA NAS LEADS ─────────────────────────────────────────────────
function buscarLeads(mNorm, leads, bairrosDisponiveis) {
  const slots = extrairSlots(mNorm);

  const bairroEncontrado = bairrosDisponiveis.find(b =>
    mNorm.includes(b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))
  );
  if (bairroEncontrado) slots.bairro = bairroEncontrado;

  if (!Object.keys(slots).length) return null;

  let resultado = leads;
  if (slots.tipo)    resultado = resultado.filter(l => l.tipo && l.tipo.toLowerCase().includes(slots.tipo));
  if (slots.bairro)  resultado = resultado.filter(l => l.bairro && l.bairro.toLowerCase().includes(slots.bairro.toLowerCase()));
  if (slots.quartos) resultado = resultado.filter(l => l.quartos && parseInt(l.quartos) >= slots.quartos);

  return { slots, resultado };
}

// ── FORMATAR RESULTADO DE BUSCA ───────────────────────────────────────────────
function formatarBuscaImoveis(busca, btn) {
  const { slots, resultado } = busca;

  const filtrosAplicados = Object.entries(slots)
    .map(([k,v]) => {
      if (k==='tipo') return v;
      if (k==='bairro') return `em ${v}`;
      if (k==='quartos') return `${v}+ quartos`;
      if (k==='valorMax') return `até R$${(v/1000).toFixed(0)}k`;
      if (k==='valorMin') return `a partir R$${(v/1000).toFixed(0)}k`;
      if (k==='vagas') return `${v}+ vagas`;
      if (k==='suites') return `${v}+ suítes`;
      return '';
    }).filter(Boolean).join(', ');

  if (resultado.length === 0)
    return `🔍 Nenhum imóvel encontrado para: <strong>${filtrosAplicados}</strong><br><br>${btn('Ver todos os imóveis','/app/imoveis')}`;

  const lista = resultado.slice(0,5).map(i => {
    const val = i.valor_imovel ? ` · R$${Number(i.valor_imovel).toLocaleString('pt-BR')}` : '';
    const qts = i.quartos ? ` · ${i.quartos}q` : '';
    const vg  = i.vagas ? ` · ${i.vagas}vg` : '';
    const linkId = i.id || ('MI-' + i.idExterno);
    return `• <a href="/app/imovel/${linkId}" target="_blank" style="color:#ff385c;font-weight:700">${i.tipo||'Imóvel'} ${i.bairro||''}</a>${qts}${vg}${val}`;
  }).join('<br>');

  return `🔍 <strong>${resultado.length} imóvel(is)</strong> encontrado(s) para: <em>${filtrosAplicados}</em><br><br>${lista}`+
    (resultado.length > 5 ? `<br><em>...e mais ${resultado.length-5}</em>` : '')+
    `<br><br>${btn('Ver todos','/app/imoveis')}`;
}

module.exports = { extrairSlots, buscarImoveis, buscarLeads, formatarBuscaImoveis };
