const fs = require('fs');
const { extractProperty } = require('./services/extractor');
const { searchQuintoAndar } = require('./services/quintoandar');
const { findTopMatches } = require('./services/matcher');

const START_INDEX = 102; // registro 103

function extracaoOk(item) {
  return item.origin &&
    item.bairro &&
    item.tipo &&
    Number(item.valor_imovel) > 0 &&
    Number(item.area_m2) > 0 &&
    Number(item.quartos) > 0;
}

(async () => {
  const data = JSON.parse(fs.readFileSync('data.json','utf8'));

  console.log('TOTAL LEADS:', data.length);
  console.log('CONTINUANDO DO REGISTRO:', START_INDEX + 1);

  for (let i = START_INDEX; i < data.length; i++) {
    const item = data[i];

    console.log('\n========================');
    console.log('REGISTRO:', i + 1, 'ID:', item.id, item.nome || '');

    if (!extracaoOk(item)) {
      console.log('EXTRAINDO:', item.url);

      const origin = await extractProperty(
        { listingUrl: item.url, listingId: item.id },
        item
      );

      item.origin = origin;
      item.extractionStatus = origin.extractionStatus || 'erro';
      item.bairro = origin.bairro || item.bairro || '';
      item.tipo = origin.tipo || item.tipo || '';
      item.valor_imovel = origin.valor_imovel || item.valor_imovel || 0;
      item.area_m2 = origin.area_m2 || item.area_m2 || 0;
      item.quartos = origin.quartos || item.quartos || 0;
      item.suites = origin.suites || item.suites || 0;
      item.banheiros = origin.banheiros || item.banheiros || 0;
      item.vagas = origin.vagas || item.vagas || 0;

      console.log('EXTRAÍDO:', item.bairro, item.tipo, item.valor_imovel, item.area_m2, item.quartos);
      fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    } else {
      console.log('EXTRAÇÃO OK:', item.bairro, item.tipo, item.valor_imovel, item.area_m2, item.quartos);
    }

    if (!item.bairro || !item.tipo || !item.quartos) {
      console.log('MATCH IGNORADO: faltam dados');
      fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
      continue;
    }

    console.log('MATCH BUSCANDO:', item.bairro, item.tipo, item.quartos);

    try {
      const candidatos = await searchQuintoAndar(item);
      const matches = findTopMatches(item, candidatos);

      item.matches = matches;
      item.matchCount = matches.length;
      item.matchProcessed = true;
      item.matchedAt = new Date().toISOString();

      console.log('CANDIDATOS:', candidatos.length);
      console.log('MATCHES:', matches.length);
    } catch (e) {
      item.matchProcessed = true;
      item.matchError = e.message;
      console.log('ERRO MATCH:', e.message);
    }

    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    console.log('SALVO REGISTRO:', i + 1);
  }

  console.log('\nFINALIZADO');
})();
