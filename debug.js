const XLSX = require('xlsx');
function norm(s) {
  return String(s||'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
}
function normBairro(s) { return norm(s).replace(/\(.*?\)/g,'').trim(); }
function normEnd(s) { return norm(s).split(' - ')[0].trim(); }
function area(s) {
  const m = String(s||'').match(/(\d+)[,.]?(\d*)/);
  return m ? parseInt(m[1]) : 0;
}

const wb = XLSX.readFile('/Users/renatocalicchio/Downloads/backup-28-11-25.06_22 (1) (1).csv', {raw:false, codepage:65001});
const planilha = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
const imoveis = JSON.parse(require('fs').readFileSync(process.env.HOME+'/Downloads/matchimoveis /imoveis.json','utf8'));
const com = imoveis.filter(im => im.proprietario && im.proprietario.telefone);

// Mostra 5 exemplos cruzados para conferir
com.slice(0,5).forEach(im => {
  const b = normBairro(im.bairro);
  const e = normEnd(im.endereco);
  const candidatos = planilha.filter(r => normBairro(r['Bairro']) === b && norm(r['Logradouro']) === e);
  console.log('XML:', im.bairro, '|', im.endereco, '| quartos:', im.quartos, '| area:', im.area_m2);
  console.log('PROP:', im.proprietario.nome, im.proprietario.telefone, '| ref:', im.proprietario.referencia);
  console.log('CANDIDATOS NA RUA:', candidatos.length);
  candidatos.forEach(c => console.log('  ->', c['Referencia'], '| quartos:', c['Dormitórios'], '| area:', area(c['Medidas']), '| prop:', c['Proprietário']));
  console.log('');
});
