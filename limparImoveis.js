const fs = require('fs');

const file = 'imoveis.json';

if (!fs.existsSync(file)) {
  console.log('Nenhum arquivo de imóveis.');
  process.exit();
}

let data = JSON.parse(fs.readFileSync(file, 'utf8'));

const agora = new Date();

const ativos = data.filter(imovel => {
  if (!imovel.lastUpdate) return false;

  const last = new Date(imovel.lastUpdate);
  const diff = (agora - last) / (1000 * 60 * 60 * 24);

  return diff <= 60;
});

console.log('ANTES:', data.length);
console.log('DEPOIS:', ativos.length);

fs.writeFileSync(file, JSON.stringify(ativos, null, 2));
console.log('Limpeza concluída.');
