const fs = require('fs');
const XLSX = require('xlsx');

const EXCEL_FILE = process.argv[2];
const USER_ID = process.argv[3] || '';

if (!EXCEL_FILE || !fs.existsSync(EXCEL_FILE)) {
  console.log('Uso: node cruzarProprietariosTecimob.js arquivo.xlsx USER_ID');
  process.exit(1);
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

function limparValor(v) {
  return Number(String(v || '').replace(/[^0-9,.]/g,'').replace(/\./g,'').replace(',','.')) || 0;
}

function normTransacao(v) {
  const t = norm(v);
  if (t.includes('alug') || t.includes('locat') || t.includes('locac')) return 'aluguel';
  if (t.includes('vend')) return 'venda';
  return '';
}

console.log('Lendo Excel...');
const wb = XLSX.readFile(EXCEL_FILE);
const ws = wb.Sheets['Imóveis'];
if (!ws) { console.log('Aba Imóveis nao encontrada'); process.exit(1); }

const rows = XLSX.utils.sheet_to_json(ws);
console.log('Registros Tecimobi:', rows.length);

const comProp = rows.filter(r => {
  const nome = String(r['Proprietário'] || '').trim();
  const cel = String(r['Celular do Proprietário'] || '').trim();
  return nome || cel;
});
console.log('Com proprietário:', comProp.length);

const imoveis = JSON.parse(fs.readFileSync('imoveis.json', 'utf8'));
const alvo = USER_ID
  ? imoveis.filter(i => String(i.userId || i.usuarioId || '') === USER_ID)
  : imoveis;

console.log('Imoveis alvo:', alvo.length);

let vinculados = 0;
let semMatch = 0;

alvo.forEach(imovel => {
  const bairroIm = norm(imovel.bairro || '');
  const ruaIm = norm(imovel.endereco || '');
  const valorIm = Number(imovel.valor_imovel || 0);
  const quartosIm = Number(imovel.quartos || 0);
  const suitesIm = Number(imovel.suites || 0);
  const vagasIm = Number(imovel.vagas || 0);
  const transacaoIm = normTransacao(imovel.transacao || '');

  if (!bairroIm || !valorIm) { semMatch++; return; }

  let melhor = null;
  let melhorScore = 0;

  for (const cad of comProp) {
    const bairroCad = norm(cad['Bairro'] || '');
    const ruaCad = norm(cad['Logradouro'] || '');
    const valorCad = limparValor(cad['Preço']);
    const quartosCad = Number(cad['Dormitórios'] || 0);
    const suitesCad = Number(cad['Suítes'] || 0);
    const vagasCad = Number(cad['Garagens'] || 0);
    const transacaoCad = normTransacao(cad['Transação'] || cad['Transacao'] || '');

    if (!valorCad) continue;
    if (bairroCad !== bairroIm) continue;

    // Transação deve bater se ambos preenchidos
    if (transacaoIm && transacaoCad && transacaoIm !== transacaoCad) continue;

    const diffValor = Math.abs(valorCad - valorIm) / valorIm;
    if (diffValor > 0.05) continue;

    let score = Math.round((1 - diffValor) * 35);

    // Transação bate: +5pts
    if (transacaoIm && transacaoCad && transacaoIm === transacaoCad) score += 5;

    if (ruaCad && ruaIm) {
      if (ruaCad === ruaIm) score += 30;
      else if (ruaIm.includes(ruaCad) || ruaCad.includes(ruaIm)) score += 25;
      else continue;
    }

    if (quartosIm && quartosCad) {
      if (quartosCad !== quartosIm) continue;
      score += 10;
    }
    if (suitesIm && suitesCad && suitesCad === suitesIm) score += 8;
    if (vagasIm && vagasCad && vagasCad === vagasIm) score += 5;

    if (score > melhorScore) { melhorScore = score; melhor = cad; }
  }

  if (melhor && melhorScore >= 70) {
    imovel.proprietario = {
      nome: String(melhor['Proprietário'] || '').trim(),
      celular: String(melhor['Celular do Proprietário'] || '').trim(),
      email: '',
      status: 'vinculado_tecimob',
      score: melhorScore,
      vinculadoEm: new Date().toISOString()
    };
    vinculados++;
  } else {
    semMatch++;
  }
});

fs.writeFileSync('imoveis.json', JSON.stringify(imoveis, null, 2));

const comCelular = alvo.filter(i => i.proprietario && i.proprietario.celular).length;
console.log('\nResultado:');
console.log('Total imoveis alvo:', alvo.length);
console.log('Vinculados:', vinculados);
console.log('Com celular:', comCelular);
console.log('Sem match:', semMatch);
