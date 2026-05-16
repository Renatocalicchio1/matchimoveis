const fs = require('fs');
const { getPropertyDetails } = require('./services/details');

async function main() {
  const dataPath = 'data.json';
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  let total = 0;
  let atualizados = 0;

  for (const lead of data) {
    const matches = lead.matchesBase || [];
    for (const m of matches) {
      if (!m || !m.url) continue;
      if (m.fonte !== 'QuintoAndar') continue;
      if (m.fotos && m.fotos.length > 0) continue;

      total++;
      console.log(`Enriquecendo: ${m.url}`);

      try {
        const details = await Promise.race([
          getPropertyDetails(m.url),
          new Promise(resolve => setTimeout(() => resolve({}), 30000))
        ]);

        const fotosLimpas = (details.fotos || []).filter(f => 
          f.includes('quintoandar.com.br/img/') && !f.includes('cozy-assets')
        );
        const todasFotos = fotosLimpas.length > 0 ? fotosLimpas : (details.fotos || []).filter(f => !f.includes('cozy-assets'));
        if (todasFotos.length > 0) {
          m.fotos = todasFotos;
          atualizados++;
          console.log(`  ✓ ${todasFotos.length} fotos`);
        } else {
          console.log(`  ✗ sem fotos`);
        }

        if (details.descricao) m.descricao = details.descricao;

      } catch (e) {
        console.log(`  ERRO: ${e.message}`);
      }
    }
  }

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log(`\nFinalizado: ${atualizados}/${total} matches enriquecidos`);
  process.exit(0);
}

main();
