const { searchOLX } = require('./services/olx');

(async () => {
  const origem = {
    tipo: 'Apartamento',
    bairro: 'Vila Mariana',
    cidade: 'São Paulo',
    estado: 'SP',
    quartos: 2,
    valor_imovel: 800000,
    area_m2: 70,
    suites: 1,
    banheiros: 2,
    vagas: 1
  };

  console.log('ORIGEM TESTE (REGRA MATCH):');
  console.log(origem);

  const resultados = await searchOLX(origem);

  console.log('\nRESULTADOS OLX:');
  resultados.forEach((r, i) => {
    console.log(`\n--- IMÓVEL ${i + 1} ---`);
    console.log(r);
  });

})();
