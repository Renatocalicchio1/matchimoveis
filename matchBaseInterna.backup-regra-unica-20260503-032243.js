const fs = require('fs');

function normalizeTipo(tipo = '') {
  const t = String(tipo || '').toLowerCase();
  if (t.includes('apart')) return 'apartamento';
  if (t.includes('condo')) return 'apartamento';
  if (t.includes('cobertura') || t.includes('penthouse')) return 'cobertura';
  if (t.includes('loft')) return 'loft';
  if (t.includes('studio') || t.includes('flat')) return 'studio';
  if (t.includes('kitnet') || t.includes('kitinete') || t.includes('conjugado')) return 'kitnet';
  if (t.includes('sobrado')) return 'casa';
  if (t === 'residential / home') return 'casa';
  if (t.includes('casa') || t.includes('sobrado')) return 'casa';
  if (t.includes('terreno') || t.includes('lote')) return 'terreno';
  if (t.includes('comercial') || t.includes('commercial') || t.includes('sala') || t.includes('loja') || t.includes('galpao') || t.includes('galpão')) return 'comercial';
  return t.trim();
}

function norm(v = '') {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function getIdImovel(imovel = {}) {
  return String(imovel.idExterno || imovel.id || imovel.codigo || imovel.idOriginal || '');
}

function buscarMatchesBaseInterna(lead, imoveis) {
  const idOrigem = lead.imovel_interesse || lead.idAnuncio || lead.id_anuncio || lead.id;
  const imovelOrigem = imoveis.find(im => getIdImovel(im) === String(idOrigem));

  const origem = imovelOrigem || lead;

  return imoveis.filter(i => {
    const idCandidato = getIdImovel(i);
    if (idCandidato && idCandidato === String(idOrigem)) return false;

    if (norm(i.cidade) !== norm(origem.cidade)) return false;
    if (norm(i.estado && i.estado['#text'] ? i.estado['#text'] : i.estado) !== norm(origem.estado && origem.estado['#text'] ? origem.estado['#text'] : origem.estado)) return false;

    const bairroCandidato = norm(i.bairro);
    const bairroOrigem = norm(origem.bairro);
    const bairroLead = norm(lead.bairro || '');

    if (!bairroCandidato) return false;
    if (bairroCandidato !== bairroOrigem && bairroCandidato !== bairroLead) return false;

    if (normalizeTipo(i.tipo) !== normalizeTipo(origem.tipo)) return false;

    const quartosOrigem = Number(origem.quartos || 0);
    const quartosCand = Number(i.quartos || 0);
    if (quartosOrigem > 0) {
      if (quartosCand < quartosOrigem) return false;
      if (quartosCand > quartosOrigem + 1) return false;
    }

    const valorOrigem = Number(origem.valor_imovel || origem.valor || 0);
    const valorCand = Number(i.valor_imovel || i.valor || 0);
    if (valorOrigem > 0) {
      if (valorCand < valorOrigem * 0.70) return false;
      if (valorCand > valorOrigem * 1.20) return false;
    }

    const areaOrigem = Number(origem.area_m2 || origem.area || 0);
    const areaCand = Number(i.area_m2 || i.area || 0);
    if (areaOrigem > 0) {
      if (areaCand < areaOrigem * 0.90) return false;
      if (areaCand > areaOrigem * 1.20) return false;
    }

    const suitesOrigem = Number(origem.suites || 0);
    const suitesCand = Number(i.suites || 0);
    if (suitesOrigem > 0) {
      if (suitesCand < suitesOrigem) return false;
      if (suitesCand > suitesOrigem + 1) return false;
    }

    const vagasOrigem = Number(origem.vagas || 0);
    const vagasCand = Number(i.vagas || 0);
    if (vagasOrigem > 0 && vagasCand < vagasOrigem) return false;

    const banheirosOrigem = Number(origem.banheiros || 0);
    const banheirosCand = Number(i.banheiros || 0);
    if (banheirosOrigem > 0 && banheirosCand < banheirosOrigem) return false;

    return true;
  });
}

function rodarMatchBaseInterna() {
  const leads = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
  const imoveis = JSON.parse(fs.readFileSync('./imoveis.json', 'utf8'));

  console.log(`Rodando match: ${leads.length} leads x ${imoveis.length} imóveis...`);

  let totalMatches = 0, leadsComMatch = 0;

  leads.forEach(lead => {
    const candidatos = buscarMatchesBaseInterna(lead, imoveis);
    lead.matches = candidatos;
    lead.matchCount = candidatos.length;
    if (candidatos.length > 0) {
      leadsComMatch++;
      totalMatches += candidatos.length;
    }
  });

  fs.writeFileSync('./data.json', JSON.stringify(leads, null, 2));
  console.log('✅ data.json salvo!');
  console.log(`Leads com match: ${leadsComMatch} / ${leads.length}`);
  console.log(`Total matches: ${totalMatches}`);
}

if (require.main === module) {
  rodarMatchBaseInterna();
}

module.exports = {
  buscarMatchesBaseInterna,
  rodarMatchBaseInterna,
  normalizeTipo,
  norm
};
