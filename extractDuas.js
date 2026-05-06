const fs = require('fs');
const { extractProperty } = require('./services/extratorcorreto-ajustado.js');
const DATA_FILE = './data.json';

async function main() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const leads = Array.isArray(raw) ? raw : (raw.results || []);
  const ids = ['3026786507', '3025119124'];
  const pendentes = leads.filter(l => ids.some(id => l.url && l.url.includes(id)));
  console.log('Leads encontradas:', pendentes.length);
  for (let i = 0; i < pendentes.length; i++) {
    const lead = pendentes[i];
    const temBairro = lead.bairro && lead.bairro.trim().length > 2;
    process.stdout.write('[' + (i+1) + '] ' + lead.nome + ' | bairro atual: ' + lead.bairro + ' ... ');
    const r = await extractProperty({ url: lead.url }, lead.origin || {});
    if (!temBairro && r.bairro && r.bairro.trim().length > 2) lead.bairro = r.bairro;
    lead.tipo         = r.tipo         || lead.tipo      || '';
    lead.area_m2      = r.area_m2      || lead.area_m2   || 0;
    lead.quartos      = r.quartos      || lead.quartos   || 0;
    lead.suites       = r.suites       || lead.suites    || 0;
    lead.banheiros    = r.banheiros    || lead.banheiros || 0;
    lead.vagas        = r.vagas        || lead.vagas     || 0;
    lead.valor_imovel = r.valor_imovel || lead.valor_imovel || 0;
    lead.extractionStatus = r.indisponivel ? 'indisponivel' : 'ok';
    console.log('OK - bairro:' + lead.bairro + ' | tipo:' + lead.tipo + ' | q:' + lead.quartos + ' | area:' + lead.area_m2 + ' | v:' + lead.valor_imovel);
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(leads, null, 2));
  console.log('Salvo.');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
