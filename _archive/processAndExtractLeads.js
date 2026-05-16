const fs = require('fs');
const { execSync } = require('child_process');
const { extractProperty } = require('./services/extractor');

const file = process.argv[2];
if (!file) {
  console.log('Informe o arquivo');
  process.exit(1);
}

function save(data) {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

function key(l) {
  return String((l.id || '') + '|' + (l.url || '')).toLowerCase();
}

(async () => {
  console.log('IMPORTANDO LEADS...');
  execSync(`node processLeads.js "${file}"`, { stdio: 'inherit' });

  let data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

  const seen = new Set();
  data = data.filter(l => {
    const k = key(l);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  save(data);

  console.log('TOTAL PARA EXTRAIR:', data.length);

  for (let i = 0; i < Math.min(10, data.length); i++) {
    const lead = data[i];

    if (!lead.url) continue;
    if (lead.origin && lead.origin.extractionStatus === 'ok') continue;

    console.log(`EXTRAINDO ${i + 1}/${data.length}: ${lead.id}`);

    try { console.log('EXTRAINDO:', lead.id);
      const origin = await extractProperty({ listingUrl: lead.url, listingId: lead.id, ...lead });
      const loc = resolveLocation(origin.text || ''); lead.origin = { ...origin, bairro: loc.tipo === 'bairro' ? loc.valor : '', bairro_fonte: loc.fonte || '' };
      lead.processedAt = new Date().toISOString();
    } catch (err) {
      lead.origin = {
        extractionStatus: 'erro_extracao',
        error: err.message
      };
    }

    data[i] = lead;
    save(data);
  }

  console.log('PROCESSAMENTO FINALIZADO');
})();
