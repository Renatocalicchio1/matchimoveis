const fs = require('fs');
const { extractProperty } = require('./services/extractor');

async function run() {
  const data = fs.existsSync('./data.json')
    ? JSON.parse(fs.readFileSync('./data.json','utf8'))
    : [];

  console.log('🚀 Iniciando extrator para', data.length, 'leads...');

  for (let i = 0; i < data.length; i++) {
    const item = data[i];

    if (item.status !== 'pendente_extracao') continue;

    if (!item.url) continue;

    try {
      console.log(`🔎 (${i}) Extraindo: ${item.url}`);
      const result = await extractProperty(item, 'imovelweb');

      item.origin = result;
      item.origin.extractionStatus = 'ok';
      item.status = 'extraido';

      fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));

      await new Promise(r => setTimeout(r, 3000)); // evita travar
    } catch (e) {
      console.log('❌ erro:', e.message);
      item.origin = { extractionStatus: 'erro' };
      item.status = 'erro';
    }
  }

  console.log('✅ Extrator finalizado');
}

run();
