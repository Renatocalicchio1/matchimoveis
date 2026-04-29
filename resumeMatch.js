const fs = require('fs');
const { searchQuintoAndar } = require('./services/quintoandar');
const { findTopMatches } = require('./services/matcher');

(async () => {
  const data = JSON.parse(fs.readFileSync('data.json','utf8'));

  let processados = 0;

  for (const item of data) {
    // pula quem já tem match
    if (item.matches && item.matches.length > 0) continue;

    // só processa quem tem dados mínimos
    if (!item.bairro || !item.tipo || !item.quartos) {
      console.log('IGNORADO:', item.id, 'faltam dados');
      continue;
    }

    console.log('\n========================');
    console.log('CONTINUANDO:', item.id, item.bairro, item.tipo, item.quartos);

    try {
      const candidatos = await searchQuintoAndar(item);
      const matches = findTopMatches(item, candidatos);

      item.matches = matches;
      item.matchCount = matches.length;

      console.log('CANDIDATOS:', candidatos.length);
      console.log('MATCHES:', matches.length);

      processados++;

      // salva a cada lead (importantíssimo)
      fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

    } catch (e) {
      console.log('ERRO:', e.message);
    }
  }

  console.log('\nFINALIZADO');
  console.log('NOVOS PROCESSADOS:', processados);
})();
