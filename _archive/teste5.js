const fs = require('fs');
const { extractProperty } = require('./services/extractor');
(async () => {
  const d = JSON.parse(fs.readFileSync('data.json','utf8'));
  const sem = d.filter(i => !i.bairro || !i.bairro.trim()).slice(0,5);
  for (const item of sem) {
    console.log('Testando:', item.url);
    const r = await extractProperty(item, 'imovelweb');
    console.log('Bairro:', r.bairro, '| Status:', r.extractionStatus);
  }
  process.exit(0);
})();
