const fs = require('fs');
const { extractProperty } = require('./services/extractor');
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
  let data = load();

  for (let i = 0; i < data.length; i++) {
    let item = data[i];

    console.log('\n============================');
    console.log('PROCESSANDO ID:', i, item.id || '');

    // 1. EXTRAÇÃO
    if (!item.origin || item.origin.extractionStatus !== 'ok') {
      console.log('→ EXTRAINDO...');
      try {
        const origin = await extractProperty(item, 'imovelweb');
        item.origin = origin;

        if (!origin || origin.extractionStatus !== 'ok') {
          console.log('❌ Falha na extração, pulando...');
          continue;
        }

        console.log('✅ EXTRAÇÃO OK:', origin.bairro, origin.tipo, origin.quartos);
        save(data);
      } catch (e) {
        console.log('❌ ERRO EXTRAÇÃO:', e.message);
        continue;
      }
    }

    // 2. MATCH
    if (!item.matches || item.matches.length === 0) {
      console.log('→ BUSCANDO MATCH...');

      try {
        const property = item.origin;

        const qa = await searchQuintoAndar(property);
        const re = await searchRemax(property);

        const candidatos = [...qa, ...re];

        const matches = findTopMatches(property, candidatos);

        item.matches = matches;
        item.matchCount = matches.length;
        item.bestScore = matches.length ? matches[0].score : 0;
        item.matchedAt = new Date().toISOString();

        console.log('✅ MATCHES:', matches.length);

        save(data);
      } catch (e) {
        console.log('❌ ERRO MATCH:', e.message);
        continue;
      }
    } else {
      console.log('⏭️ Já tem match, pulando...');
    }
  }

  console.log('\n🚀 FINALIZADO');
})();
