const fs = require('fs');
const { extractProperty } = require('./services/extractor');

const DATA_FILE = 'data.json';
const load = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const save = (d) => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

(async () => {
  const data = load();
  const pendentes = data.filter(l => !l.quartos && !l.area_m2 && l.url);
  console.log(`Total sem quartos/área: ${pendentes.length}`);

  let ok = 0, erro = 0;
  for (let i = 0; i < pendentes.length; i++) {
    const item = pendentes[i];
    const idx = data.indexOf(item);
    console.log(`\n[${i+1}/${pendentes.length}] ${item.nome} | ${item.url?.substring(0,60)}`);
    try {
      const origin = await extractProperty(item, 'imovelweb');
      if (origin && origin.quartos) data[idx].quartos = origin.quartos;
      if (origin && origin.area_m2) data[idx].area_m2 = origin.area_m2;
      if (origin && origin.bairro) data[idx].bairro = origin.bairro;
      data[idx].origin = origin;
      data[idx].extractedAt = new Date().toISOString();
      console.log(`  quartos: ${origin?.quartos} | area: ${origin?.area_m2}`);
      ok++;
    } catch(e) {
      console.log(`  ERRO: ${e.message}`);
      erro++;
    }
    if (i % 10 === 0) save(data);
  }
  save(data);
  console.log(`\n✅ OK: ${ok} | Erro: ${erro}`);
})();
