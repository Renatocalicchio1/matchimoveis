const fs = require('fs');
const { extractProperty } = require('./services/extractor');

(async () => {
  const data = JSON.parse(fs.readFileSync('data.json','utf8'));

  function originCompleto(item){
    const o = item.origin || {};
    return o.extractionStatus === 'ok' &&
      o.bairro &&
      o.valor_imovel &&
      o.area_m2 &&
      o.quartos;
  }

  const pendentes = data.filter(i => !originCompleto(i));

  console.log('TOTAL PENDENTES:', pendentes.length);

  for (let i = 0; i < pendentes.length; i++) {
    const item = pendentes[i];

    try {
      console.log(`\n[${i+1}/${pendentes.length}] EXTRAINDO:`, item.url);

      const origin = await extractProperty(item, 'imovelweb');

      item.origin = origin;

      fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

    } catch (e) {
      console.log('ERRO:', e.message);
    }
  }

  console.log('\nFINALIZADO TODOS');
})();
