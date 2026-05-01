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

function bairroMatch(b1, b2) {
  const n1 = normBairro(b1);
  const n2 = normBairro(b2);
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

const leads = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
const imoveis = JSON.parse(fs.readFileSync('./imoveis.json', 'utf8'));

console.log(`Rodando match: ${leads.length} leads x ${imoveis.length} imóveis...`);

let totalMatches = 0;
let leadsComMatch = 0;

leads.forEach(lead => {
  const candidatos = imoveis.filter(i => {
    if (!(i.cidade||'').toLowerCase().includes('paulo')) return false;
    if ((i.estado||'').toLowerCase() !== 'sp') return false;
    if (normalizeTipo(i.tipo) !== normalizeTipo(lead.tipo)) return false;
    if (!i.bairro || !lead.bairro) return false;
    if (!bairroMatch(i.bairro, lead.bairro)) return false;
    // quartos: só filtra se lead tiver quartos
    if (lead.quartos && (i.quartos || 0) < lead.quartos) return false;
    // valor: só filtra se lead tiver valor
    const valor = i.valor_imovel || 0;
    const baseValor = lead.valor_imovel || 0;
    if (baseValor > 0) {
      if (valor < baseValor * 0.50) return false;
      if (valor > baseValor * 1.25) return false;
    }
    // área: só filtra se lead tiver área
    const area = i.area_m2 || 0;
    const baseArea = lead.area_m2 || 0;
    if (baseArea > 0 && area < baseArea * 0.80) return false;
    return true;
  });

  lead.matches = candidatos;
  lead.matchCount = candidatos.length;

  if (candidatos.length > 0) {
    leadsComMatch++;
    totalMatches += candidatos.length;
  }
});

fs.writeFileSync('./data.json', JSON.stringify(leads, null, 2), 'utf8');
console.log('✅ data.json salvo!');
console.log(`Leads com match: ${leadsComMatch} / ${leads.length}`);
console.log(`Total matches: ${totalMatches}`);
const verify = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
console.log(`Verificação: ${verify.filter(l => l.matches && l.matches.length > 0).length} leads com match`);
