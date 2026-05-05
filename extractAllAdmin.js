const fs = require('fs');
const { extractProperty } = require('./services/extratorcorreto-20260428-211427.js');
const DATA_FILE = './data.json';
async function main() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const leads = Array.isArray(raw) ? raw : (raw.results || []);
  const pendentes = leads.filter(l => l.userId === 'admin' && l.url && (l.bairro === undefined || l.bairro === null || l.bairro === '')).slice(100, 103);
  for (let i = 0; i < pendentes.length; i++) {
    const lead = pendentes[i];
    console.log('\n[' + (i+1) + '] ' + lead.nome + ' | ' + lead.url);
    try {
      const r = await extractProperty({ url: lead.url }, lead.origin || {});
      console.log(JSON.stringify(r, null, 2));
    } catch(e) { console.log('ERRO: ' + e.message); }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
