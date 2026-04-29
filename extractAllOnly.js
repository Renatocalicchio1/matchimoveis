const fs = require('fs');
const { extractProperty } = require('./services/extractor');

const DATA_FILE = 'data.json';

function load() {
  return fs.existsSync(DATA_FILE)
    ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    : [];
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

(async () => {
  const data = load();

  console.log('TOTAL LEADS:', data.length);

  for (let i = 0; i < data.length; i++) {
    const item = data[i];

    console.log('\n============================');
    console.log('EXTRAINDO LEAD:', i);

    try {
      const origin = await extractProperty(item, 'imovelweb');

      data[i].origin = origin;
      data[i].extractedAt = new Date().toISOString();

      console.log('STATUS:', origin && origin.extractionStatus);
      console.log('BAIRRO:', origin && origin.bairro);
      console.log('TIPO:', origin && origin.tipo);

      save(data);
    } catch (e) {
      data[i].origin = {
        extractionStatus: 'erro_extracao',
        error: e.message
      };
      data[i].extractedAt = new Date().toISOString();

      console.log('ERRO:', e.message);
      save(data);
    }
  }

  console.log('\n✅ EXTRAÇÃO FINALIZADA');
})();
