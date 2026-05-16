const fs = require('fs');

const CADIMO_FILE = process.argv[2] || 'CADIMO.sql';
const CADCLI_FILE = process.argv[3] || 'CADCLI.sql';

if (!fs.existsSync(CADIMO_FILE) || !fs.existsSync(CADCLI_FILE)) {
  console.log('Uso: node cruzarProprietariosSQL.js CADIMO.sql CADCLI.sql');
  process.exit(1);
}

function normTransacao(v) {
  const t = norm(v);
  if (t.includes('alug') || t.includes('locat')) return 'aluguel';
  if (t.includes('vend')) return 'venda';
  return '';
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

function parseLine(line) {
  const stripped = line.trim();
  if (!stripped.startsWith('(')) return [];
  const vals = [];
  let current = '';
  let inStr = false;
  let j = 1;
  while (j < stripped.length) {
    const c = stripped[j];
    if (c === '\\' && inStr) { j++; if (j < stripped.length) current += stripped[j]; j++; continue; }
    if (c === '"' && !inStr) { inStr = true; j++; continue; }
    if (c === '"' && inStr && stripped[j+1] === '"') { current += '"'; j+=2; continue; }
    if (c === '"' && inStr) { inStr = false; j++; continue; }
    if (c === ',' && !inStr) { vals.push(current); current = ''; j++; continue; }
    if (c === ')' && !inStr) { vals.push(current); break; }
    current += c;
    j++;
  }
  return vals;
}

function parseSQL(sql, tableName, campos) {
  const rows = [];
  const lines = sql.split('\n');
  let curIdx = {};
  for (const line of lines) {
    const stripped = line.trim();
    if (stripped.startsWith(`INSERT INTO \`${tableName}\``)) {
      const m = stripped.match(/\(([^)]+)\) VALUES/);
      if (m) {
        const cols = m[1].split(',').map(c => c.trim().replace(/`/g,''));
        curIdx = {};
        campos.forEach(f => { curIdx[f] = cols.indexOf(f); });
      }
      continue;
    }
    if (!stripped.startsWith('(')) continue;
    const vals = parseLine(stripped);
    if (!vals.length) continue;
    const obj = {};
    campos.forEach(f => {
      obj[f] = curIdx[f] >= 0 && vals[curIdx[f]] !== undefined ? vals[curIdx[f]].trim() : '';
    });
    rows.push(obj);
  }
  return rows;
}

console.log('Lendo CADIMO.sql...');
const cadimoBruto = fs.readFileSync(CADIMO_FILE, 'latin1');
const cadimoRows = parseSQL(cadimoBruto, 'CADIMO', [
  'CODIGO_C', 'BAIRRO', 'ENDERECO', 'VLR_VENDA', 'AREA_PRIVATIVA',
  'DORMITORIO', 'SUITE', 'ESTACIONA_VAGAS', 'BANHEIRO_SOCIAL', 'CODIGO'
]);
console.log('Registros CADIMO:', cadimoRows.length);

console.log('Lendo CADCLI.sql...');
const cadcliBruto = fs.readFileSync(CADCLI_FILE, 'latin1');
const cadcliRows = parseSQL(cadcliBruto, 'CADCLI', [
  'CODIGO_C', 'NOME', 'CELULAR', 'FONE_R', 'FONE_PRINCIPAL',
  'FONES_OCULTOS', 'CELULAR_E', 'FONE_C', 'EMAIL_R', 'EMAIL_C'
]);
console.log('Registros CADCLI:', cadcliRows.length);

const cadcliMap = {};
cadcliRows.forEach(r => {
  if (!r.CODIGO_C || r.CODIGO_C === '0') return;
  // Pegar melhor contato disponível
  const celular = r.CELULAR || r.FONE_PRINCIPAL || r.FONES_OCULTOS || r.CELULAR_E || r.FONE_R || r.FONE_C || '';
  const email = r.EMAIL_R || r.EMAIL_C || '';
  cadcliMap[r.CODIGO_C] = { nome: r.NOME, celular, email };
});
console.log('CADCLI indexados:', Object.keys(cadcliMap).length);

const cadimoComProp = cadimoRows.filter(r => r.CODIGO_C && r.CODIGO_C !== '0' && cadcliMap[r.CODIGO_C]);
console.log('CADIMO com proprietario:', cadimoComProp.length);

const imoveis = JSON.parse(fs.readFileSync('imoveis.json', 'utf8'));
console.log('\nCruzando', imoveis.length, 'imoveis...');

let vinculados = 0;
let semMatch = 0;

imoveis.forEach(imovel => {
  const bairroIm = norm(imovel.bairro || '');
  const ruaIm = norm(imovel.endereco || '');
  const valorIm = Number(imovel.valor_imovel || 0);
  const areaIm = Number(imovel.area_m2 || 0);
  const quartosIm = Number(imovel.quartos || 0);
  const suitesIm = Number(imovel.suites || 0);
  const vagasIm = Number(imovel.vagas || 0);
  const banheirosIm = Number(imovel.banheiros || 0);

  const transacaoIm = normTransacao(imovel.transacao || '');
  if (!bairroIm || !valorIm) { semMatch++; return; }

  let melhor = null;
  let melhorScore = 0;

  for (const cad of cadimoComProp) {
    const bairroCad = norm(cad.BAIRRO || '');
    const ruaCad = norm(cad.ENDERECO || '');
    const valorCad = Number(cad.VLR_VENDA || 0);
    const areaCad = Number(cad.AREA_PRIVATIVA || 0);
    const quartosCad = Number(cad.DORMITORIO || 0);
    const suitesCad = Number(cad.SUITE || 0);
    const vagasCad = Number(cad.ESTACIONA_VAGAS || 0);
    const banheirosCad = Number(cad.BANHEIRO_SOCIAL || 0);

    const transacaoCad = normTransacao(cad.VENDA === 'Sim' ? 'venda' : cad.LOCACAO_ANUAL === 'Sim' ? 'aluguel' : '');
    if (!valorCad) continue;
    if (bairroCad !== bairroIm) continue;
    if (transacaoIm && transacaoCad && transacaoIm !== transacaoCad) continue;

    const diffValor = Math.abs(valorCad - valorIm) / valorIm;
    if (diffValor > 0.02) continue;

    let score = Math.round((1 - diffValor) * 40);

    if (ruaCad && ruaIm && ruaCad === ruaIm) score += 30;
    else if (ruaCad && ruaIm) continue;

    if (areaCad && areaIm) {
      const diffArea = Math.abs(areaCad - areaIm) / areaIm;
      if (diffArea > 0.03) continue;
      score += Math.round((1 - diffArea) * 15);
    }

    if (quartosIm && quartosCad) {
      if (quartosCad !== quartosIm) continue;
      score += 8;
    }
    if (suitesIm && suitesCad && suitesCad === suitesIm) score += 4;
    if (vagasIm && vagasCad && vagasCad === vagasIm) score += 2;
    if (banheirosIm && banheirosCad && banheirosCad === banheirosIm) score += 1;

    if (score > melhorScore) { melhorScore = score; melhor = cad; }
  }

  if (melhor && melhorScore >= 60) {
    const cli = cadcliMap[melhor.CODIGO_C];
    imovel.proprietario = {
      nome: cli.nome || '',
      celular: cli.celular || '',
      email: cli.email || '',
      status: 'vinculado_crm',
      score: melhorScore,
      vinculadoEm: new Date().toISOString()
    };
    vinculados++;
  } else {
    semMatch++;
  }
});

fs.writeFileSync('imoveis.json', JSON.stringify(imoveis, null, 2));

const comCelular = imoveis.filter(i => i.proprietario && i.proprietario.celular).length;
console.log('\nResultado:');
console.log('Total imoveis:', imoveis.length);
console.log('Vinculados:', vinculados);
console.log('Com celular:', comCelular);
console.log('Sem match:', semMatch);
