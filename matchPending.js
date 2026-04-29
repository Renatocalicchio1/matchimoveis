const fs = require('fs');
const { searchQuintoAndar } = require('./services/quintoandar');
const { searchRemax } = require('./services/remax');
const { findTopMatches } = require('./services/matcher');

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

  console.log('TOTAL:', data.length);

  for (let i = 0; i < data.length; i++) {
    const item = data[i];

    if (!item.origin || item.origin.extractionStatus !== 'ok') {
      console.log('⏭️ sem extração OK:', i);
      continue;
    }

    if (item.matches && item.matches.length > 0) {
      console.log('⏭️ já tem match:', i);
      continue;
    }

    console.log('\n============================');
    console.log('MATCH ID:', i);
    console.log('BAIRRO:', item.origin.bairro);
    console.log('TIPO:', item.origin.tipo);

    try {
      const qa = await searchQuintoAndar(item.origin);
      const re = await searchRemax(item.origin);

      const candidatos = [...qa, ...re];

      const matches = findTopMatches(item.origin, candidatos);

      item.matches = matches;
      item.matchCount = matches.length;
      item.bestScore = matches.length ? matches[0].score : 0;
      item.matchedAt = new Date().toISOString();

      console.log('✅ MATCHES:', matches.length);

      save(data);
    } catch (e) {
      console.log('❌ ERRO MATCH:', e.message);
    }
  }

  console.log('\n🚀 MATCH FINALIZADO');
})();
