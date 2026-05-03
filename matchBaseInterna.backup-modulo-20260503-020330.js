const fs = require('fs');

function normalizeTipo(tipo = '') {
  const t = (tipo || '').toLowerCase();
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
  return t;
}

function normBairro(v = '') {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const leads = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
const imoveis = JSON.parse(fs.readFileSync('./imoveis.json', 'utf8'));

console.log(`Rodando match: ${leads.length} leads x ${imoveis.length} imóveis...`);

let totalMatches = 0, leadsComMatch = 0;

leads.forEach(lead => {
  const candidatos = imoveis.filter(i => {
    const cidade = (i.cidade || '').toLowerCase();
    const estado = (i.estado || '').toLowerCase();
    if (!cidade.includes('paulo')) return false;
    if (estado !== 'sp' && estado !== 'são paulo' && estado !== 'sao paulo') return false;
    if (normalizeTipo(i.tipo) !== normalizeTipo(lead.tipo)) return false;
    if (!i.bairro || !lead.bairro) return false;
    if (normBairro(i.bairro) !== normBairro(lead.bairro)) return false;
    if (lead.quartos) {
      if (i.quartos < lead.quartos) return false;
      if (i.quartos > lead.quartos + 1) return false;
    }
    const valor = i.valor_imovel || 0;
    const baseValor = lead.valor_imovel || 0;
    if (baseValor > 0) {
      if (valor < baseValor * 0.70) return false;
      if (valor > baseValor * 1.20) return false;
    }
    const area = i.area_m2 || 0;
    const baseArea = lead.area_m2 || 0;
    if (baseArea > 0) {
      if (area < baseArea * 0.90) return false;
      if (area > baseArea * 1.20) return false;
    }
    if (lead.suites != null && lead.suites > 0) {
      const iSuites = i.suites || 0;
      if (iSuites < lead.suites) return false;
      if (iSuites > lead.suites + 1) return false;
    }
    if (lead.vagas != null && lead.vagas > 0) {
      const iVagas = i.vagas || 0;
      if (iVagas < lead.vagas) return false;
    }
    if (lead.banheiros != null && lead.banheiros > 0) {
      const iBanheiros = i.banheiros || 0;
      if (iBanheiros < lead.banheiros) return false;
    }
    return true;
  });

  lead.matches = candidatos;
  lead.matchCount = candidatos.length;
  if (candidatos.length > 0) { leadsComMatch++; totalMatches += candidatos.length; }
});

fs.writeFileSync('./data.json', JSON.stringify(leads, null, 2));
console.log('✅ data.json salvo!');
console.log(`Leads com match: ${leadsComMatch} / ${leads.length}`);
console.log(`Total matches: ${totalMatches}`);
const verify = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
console.log(`Verificação: ${verify.filter(l => l.matches && l.matches.length > 0).length} leads com match`);
