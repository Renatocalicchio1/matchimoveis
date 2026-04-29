const fs = require('fs');
const { extractPhotos } = require('./services/photoExtractor');

const file = 'data.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

(async () => {
  let fotosAtualizadas = 0;
  let descricoesAtualizadas = 0;

  for (const item of data) {
    if (!item.matches || !item.matches.length) continue;

    for (const match of item.matches) {
      if (!match.url) continue;

      const precisaFotos = !match.fotos || !match.fotos.length;
      const precisaDescricao = !match.descricao;

      if (!precisaFotos && !precisaDescricao) continue;

      console.log('Buscando dados:', match.url);

      const result = await extractPhotos(match.url);

      if (precisaFotos && result.fotos && result.fotos.length) {
        match.fotos = result.fotos;
        fotosAtualizadas++;
        console.log('Fotos:', result.fotos.length);
      }

      if (precisaDescricao && result.descricao) {
        match.descricao = result.descricao;
        descricoesAtualizadas++;
        console.log('Descrição OK');
      }
    }
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2));

  console.log('Finalizado.');
  console.log('Matches com fotos atualizadas:', fotosAtualizadas);
  console.log('Matches com descrição atualizada:', descricoesAtualizadas);
})();
