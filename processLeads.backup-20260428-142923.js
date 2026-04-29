const fs = require('fs');
const XLSX = require('xlsx');

const file = process.argv[2];

const wb = XLSX.readFile(file);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

let resultados = [];

rows.forEach(r => {
  // padrão do seu sistema
  const lead = {
    nome: r.nome || r.Nome || '',
    contato: r.telefone || '',
    email: r.email || '',
    id: r.id || '',
    url: r.url || ''
  };

  // SIMULA MATCH (depois liga com seu matcher real)
  const matchCount = Math.floor(Math.random() * 10);

  resultados.push({
    ...lead,
    matchCount,
    createdAt: new Date()
  });
});

fs.writeFileSync('leads.json', JSON.stringify(resultados, null, 2));

console.log('Leads processados:', resultados.length);
