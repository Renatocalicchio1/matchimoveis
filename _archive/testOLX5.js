const fs = require('fs');
const { searchOLX } = require('./services/olx');

(async () => {
  const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

  const itens = data
    .filter(i => i.origin)
    .map(i => i.origin)
    .filter(o =>
      o.cidade === 'São Paulo' &&
      o.estado === 'SP' &&
      o.bairro &&
      o.tipo &&
      o.quartos &&
      o.valor_imovel >= 500000 &&
      o.area_m2
    )
    .slice(0, 5);

  console.log('TESTANDO 5 IMÓVEIS DA LISTAGEM:', itens.length);

  for (const [idx, origem] of itens.entries()) {
    console.log('\n==============================');
    console.log('TESTE', idx + 1);
    console.log('ORIGEM:', origem);

    const matches = await searchOLX(origem);

    console.log('MATCHES OLX:', matches.length);
    matches.forEach((m, i) => {
      console.log(`\nMATCH ${i + 1}:`);
      console.log(m);
    });
  }
})();
