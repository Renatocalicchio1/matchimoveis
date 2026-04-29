const fs = require('fs');
const { extractProperty } = require('./services/extractor');
const { searchQuintoAndar } = require('./services/quintoandar');
const { findTopMatches } = require('./services/matcher');

function temExtracao(item) {
  return item.origin && item.bairro && item.tipo && item.valor_imovel && item.area_m2 && item.quartos;
}

function temMatch(item) {
  return item.matches && item.matches.length > 0;
}

(async () => {
  const data = JSON.parse(fs.readFileSync('data.json','utf8'));

  let extraidos = 0;
  let matchesGerados = 0;

  for (const item of data) {
    console.log('\n========================');
    console.log('ITEM:', item.id, item.nome || '');

    if (!temExtracao(item)) {
      console.log('EXTRAINDO:', item.url);

      try {
        const origin = await extractProperty(
          { listingUrl: item.url, listingId: item.id },
          item
        );

        item.origin = origin;
        item.extractionStatus = origin.extractionStatus || item.extractionStatus;
        item.bairro = origin.bairro || item.bairro;
        item.tipo = origin.tipo || item.tipo;
        item.valor_imovel = origin.valor_imovel || item.valor_imovel || 0;
        item.area_m2 = origin.area_m2 || item.area_m2 || 0;
        item.quartos = origin.quartos || item.quartos || 0;
        item.suites = origin.suites || item.suites || 0;
        item.banheiros = origin.banheiros || item.banheiros || 0;
        item.vagas = origin.vagas || item.vagas || 0;

        extraidos++;
        console.log('EXTRAÍDO:', item.bairro, item.tipo, item.valor_imovel, item.area_m2, item.quartos);
        fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
      } catch (e) {
        console.log('ERRO EXTRAÇÃO:', e.message);
        fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
        continue;
      }
    } else {
      console.log('EXTRAÇÃO OK:', item.bairro, item.tipo, item.valor_imovel, item.area_m2, item.quartos);
    }

    if (!temMatch(item)) {
      if (!item.bairro || !item.tipo || !item.quartos) {
        console.log('MATCH IGNORADO: faltam dados');
        continue;
      }

      console.log('MATCH BUSCANDO:', item.bairro, item.tipo, item.quartos);

      try {
        const candidatos = await searchQuintoAndar(item);
        const matches = findTopMatches(item, candidatos);

        item.matches = matches;
        item.matchCount = matches.length;
        item.matchedAt = new Date().toISOString();

        matchesGerados++;
        console.log('CANDIDATOS:', candidatos.length);
        console.log('MATCHES:', matches.length);

        fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
      } catch (e) {
        console.log('ERRO MATCH:', e.message);
        fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
      }
    } else {
      console.log('MATCH JÁ EXISTE:', item.matches.length);
    }
  }

  console.log('\nFINALIZADO');
  console.log('EXTRAÍDOS AGORA:', extraidos);
  console.log('MATCHES PROCESSADOS AGORA:', matchesGerados);
})();
