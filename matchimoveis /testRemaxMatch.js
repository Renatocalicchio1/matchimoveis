const fs = require('fs');
const { searchRemax } = require('./services/remax');
const { findTopMatches } = require('./services/matcher');

(async () => {
  const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

  const item = data.find(i =>
    i.origin &&
    i.origin.extractionStatus === 'ok' &&
    i.origin.cidade === 'São Paulo' &&
    i.origin.estado === 'SP' &&
    i.origin.bairro
  );

  if (!item) {
    console.log('Nenhum imóvel válido encontrado.');
    return;
  }

  const origem = item.origin;

  console.log('\nORIGEM:');
  console.log(origem);

  const candidatos = await searchRemax(origem);

  console.log('\nCANDIDATOS REMAX:', candidatos.length);
  console.log(JSON.stringify(candidatos.slice(0, 5), null, 2));

  const matches = findTopMatches(origem, candidatos);

  console.log('\nMATCHES REMAX:', matches.length);
  console.log(JSON.stringify(matches, null, 2));
})();
