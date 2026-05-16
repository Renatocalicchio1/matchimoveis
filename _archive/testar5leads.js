const fs = require('fs');
const { extractProperty } = require('./services/extratorcorreto-ajustado.js');
const DATA_FILE = './data.json';
async function main() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const leads = Array.isArray(raw) ? raw : (raw.results || []);
  const pendentes = leads.filter(l => !l.bairro && (l.url || (l.origin && l.origin.url))).slice(0, 5);
  if (!pendentes.length) { console.log('Nenhuma lead pendente com URL encontrada.'); process.exit(0); }
  console.log('Extraindo ' + pendentes.length + ' leads...\n');
  for (const lead of pendentes) {
    const url = lead.url || (lead.origin && lead.origin.url) || '';
    console.log('-> ' + lead.nome + ' | ' + url);
    try {
      const r = await extractProperty({ url }, lead.origin || {});
      lead.bairro = r.bairro || lead.bairro || '';
      lead.cidade = r.cidade || lead.cidade || '';
      lead.estado = r.estado || lead.estado || '';
      lead.tipo = r.tipo || lead.tipo || '';
      lead.area_m2 = r.area_m2 || lead.area_m2 || 0;
      lead.quartos = r.quartos || lead.quartos || 0;
      lead.suites = r.suites || lead.suites || 0;
      lead.banheiros = r.banheiros || lead.banheiros || 0;
      lead.vagas = r.vagas || lead.vagas || 0;
      lead.valor_imovel = r.valor_imovel || lead.valor_imovel || 0;
      lead.indisponivel = r.indisponivel || false;
      lead.extractionStatus = r.extractionStatus || 'ok';
      console.log('   bairro: ' + lead.bairro + ' | tipo: ' + lead.tipo + ' | quartos: ' + lead.quartos + ' | valor: ' + lead.valor_imovel);
    } catch(e) { console.log('   Erro: ' + e.message); }
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(leads, null, 2));
  console.log('\nSalvo no data.json');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
