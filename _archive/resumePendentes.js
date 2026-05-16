const fs = require('fs');
const { extractProperty } = require('./services/extractor');
const { searchQuintoAndar } = require('./services/quintoandar');
const { findTopMatches } = require('./services/matcher');

function extracaoOk(item) {
  return item.origin &&
    item.extractionStatus === 'ok' &&
    item.bairro &&
    item.tipo &&
    Number(item.valor_imovel) > 0 &&
    Number(item.area_m2) > 0 &&
    Number(item.quartos) > 0;
}

function matchJaTentado(item) {
  return item.matchProcessed === true || item.matchedAt || (item.matches && item.matches.length > 0);
}

(async () => {
  const data = JSON.parse(fs.readFileSync('data.json','utf8'));

  console.log('TOTAL LEADS:', data.length);
  console.log('EXTRAÇÃO OK:', data.filter(extracaoOk).length);
  console.log('MATCH JÁ TENTADO:', data.filter(matchJaTentado).length);

  let extraidosAgora = 0;
  let matchAgora = 0;

  for (const item of data) {
    console.log('\n========================');
    console.log('ITEM:', item.id, item.nome || '');

    if (!extracaoOk(item)) {
      console.log('EXTRAINDO:', item.url);

      try {
        const origin = await extractProperty({ listingUrl: item.url, listingId: item.id }, item);

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

        extraidosAgora++;
        console.log('EXTRAÍDO:', item.bairro, item.tipo, item.valor_imovel, item.area_m2, item.quartos);

        fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
      } catch (e) {
        item.extractionStatus = 'erro';
        item.extractionError = e.message;
        console.log('ERRO EXTRAÇÃO:', e.message);
        fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
        continue;
      }
    } else {
      console.log('PULOU EXTRAÇÃO: já está ok');
    }

    if (matchJaTentado(item)) {
      console.log('PULOU MATCH: já tentado');
      continue;
    }

    if (!item.bairro || !item.tipo || !item.quartos) {
      console.log('MATCH NÃO TENTADO: faltam dados');
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

      matchAgora++;
      console.log('CANDIDATOS:', candidatos.length);
      console.log('MATCHES:', matches.length);

      fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    } catch (e) {
      item.matchProcessed = true;
      item.matchError = e.message;
      console.log('ERRO MATCH:', e.message);
      fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    }
  }

  console.log('\nFINALIZADO');
  console.log('EXTRAÍDOS AGORA:', extraidosAgora);
  console.log('MATCHES TENTADOS AGORA:', matchAgora);
})();
