require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { salvarTodosImoveis } = require('./services/salvarImovel');

async function migrar() {
  const imoveisPath = path.join(__dirname, 'imoveis.json');
  if (!fs.existsSync(imoveisPath)) {
    console.log('imoveis.json não encontrado');
    process.exit(1);
  }
  const imoveis = JSON.parse(fs.readFileSync(imoveisPath, 'utf8'));
  console.log('Total imóveis:', imoveis.length);
  
  // Garante que todo imóvel tem um id único
  imoveis.forEach((im, idx) => {
    if (!im.id) im.id = im.idExterno || im.idOriginal || im.codigoImovel || ('IM-' + idx + '-' + Date.now());
  });

  console.log('Migrando para PostgreSQL...');
  await salvarTodosImoveis(imoveis);
  console.log('✅ Migração concluída!');
  process.exit(0);
}

migrar().catch(e => { console.error('Erro:', e.message); process.exit(1); });
