const fs = require('fs');

const arquivos = ['imoveis.json', 'leads.json', 'visitas.json', 'data.json'];

const termosAntonio = [
  'antonio',
  'antônio'
];

function pertenceAoAntonio(item){
  const texto = JSON.stringify(item || {}).toLowerCase();
  return termosAntonio.some(t => texto.includes(t));
}

for (const arquivo of arquivos) {
  if (!fs.existsSync(arquivo)) continue;

  let dados;
  try {
    dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    console.log('Ignorado, JSON inválido:', arquivo);
    continue;
  }

  if (Array.isArray(dados)) {
    const antes = dados.length;
    const novo = dados.filter(item => !pertenceAoAntonio(item));
    fs.writeFileSync(arquivo, JSON.stringify(novo, null, 2));
    console.log(`${arquivo}: removidos ${antes - novo.length}, restantes ${novo.length}`);
  } else {
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
    console.log(`${arquivo}: não era lista, mantido`);
  }
}

console.log('Conta Antonio zerada nos arquivos de dados.');
