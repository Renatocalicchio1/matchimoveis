const fs = require('fs');
const { extractProperty } = require('./services/extratorcorreto-ajustado.js');

async function main() {
  const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
  const arr = Array.isArray(raw) ? raw : (raw.results || []);
  const lead = arr.find(l => String(l.id) === '3012990984' || (l.url && l.url.includes('3012990984')));
  if (!lead) { console.log('Lead nao encontrada'); process.exit(1); }
  console.log('Lead:', lead.nome, '| URL:', lead.url);
  const r = await extractProperty({ url: lead.url }, lead.origin || {});
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
