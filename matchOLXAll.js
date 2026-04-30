const fs = require('fs');
const { searchOLX } = require('./services/olx');

(async () => {
  const data = JSON.parse(fs.readFileSync('data.json','utf8'));

  function originCompleto(item){
    const o = item.origin || {};
    return o.extractionStatus &&
      o.bairro &&
      o.tipo &&
      o.cidade === 'São Paulo' &&
      o.estado === 'SP' &&
      o.valor_imovel >= 500000 &&
      o.area_m2 &&
      o.quartos !== undefined &&
      o.quartos !== null;
  }

  const itens = data.filter(originCompleto);

  console.log('ORIGINS PRONTOS PARA OLX:', itens.length);

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];

    if (item.olxChecked) {
      console.log(`[${i+1}/${itens.length}] PULANDO, OLX JÁ CHECADO`);
      continue;
    }

    console.log(`\n[${i+1}/${itens.length}] BUSCANDO OLX:`, item.origin.bairro, item.origin.tipo, item.origin.quartos);

    try {
      const olxMatches = await searchOLX(item.origin);

      item.olxMatches = olxMatches;
      item.olxMatchCount = olxMatches.length;
      item.olxChecked = true;
      item.olxCheckedAt = new Date().toISOString();

      fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

      console.log('MATCHES OLX:', olxMatches.length);
    } catch (e) {
      console.log('ERRO OLX:', e.message);
    }
  }

  console.log('\nFINALIZADO OLX');
})();
