const fs = require('fs');
const { extractProperty } = require('./services/extractor');

function bairroInvalido(b) {
  return !b || /^\d+$/.test(String(b).trim());
}

(async () => {
  const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

  let total = 0;

  for (const item of data) {
    const bairroAtual = item.origin?.bairro || item.bairro;

    if (!bairroInvalido(bairroAtual)) continue;

    total++;

    console.log('\n============================');
    console.log('Reprocessando:', item.id);
    console.log('ANTES:', bairroAtual);

    const origin = await extractProperty(
      { listingUrl: item.url, listingId: item.id },
      item
    );

    const novoBairro = origin.bairro || '';

    console.log('DEPOIS:', novoBairro);
    console.log('STATUS:', origin.extractionStatus);

    item.origin = origin;
    item.extractionStatus = origin.extractionStatus;
    item.bairro = novoBairro;
    item.tipo = origin.tipo || item.tipo || '';
    item.valor_imovel = origin.valor_imovel || item.valor_imovel || 0;
    item.area_m2 = origin.area_m2 || item.area_m2 || 0;
    item.quartos = origin.quartos || item.quartos || 0;
    item.suites = origin.suites || item.suites || 0;
    item.banheiros = origin.banheiros || item.banheiros || 0;
    item.vagas = origin.vagas || item.vagas || 0;
  }

  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

  console.log('\n============================');
  console.log('TOTAL REPROCESSADOS:', total);
})();
