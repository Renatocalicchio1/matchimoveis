const fs = require('fs');

console.log('Lendo imoveis.json...');
const imoveis = JSON.parse(fs.readFileSync('./imoveis.json', 'utf8'));
console.log('Imóveis XML:', imoveis.length);

console.log('Lendo CADIMO...');
const cadimoSQL = fs.readFileSync('/tmp/crm_sql/CADIMO.sql', 'latin1');
const colMatch = cadimoSQL.match(/INSERT INTO `CADIMO` \(([^)]+)\)/);
const colunas = colMatch[1].split(',').map(c => c.replace(/`/g,'').trim());

const iArea = colunas.indexOf('AREA_TOTAL');
const iDorm = colunas.indexOf('DORMITORIO');
const iBairro = colunas.indexOf('BAIRRO');
const iCidade = colunas.indexOf('CIDADE');
const iVlrVenda = colunas.indexOf('VLR_VENDA');
const iCodigoC = colunas.indexOf('CODIGO_C');
const iCodigo = colunas.indexOf('CODIGO');
const iTipo = colunas.indexOf('TIPO');

console.log(`Colunas: AREA[${iArea}] DORM[${iDorm}] BAIRRO[${iBairro}] VLR[${iVlrVenda}] CODIGO_C[${iCodigoC}]`);

// Parsear CADIMO
const cadimo = [];
for (const linha of cadimoSQL.split('\n')) {
  if (!linha.startsWith('(')) continue;
  try {
    const inner = linha.slice(1, linha.lastIndexOf(')'));
    const vals = [];
    let cur = '', inStr = false, q = '';
    for (const c of inner) {
      if (!inStr && (c==='"'||c==="'")) { inStr=true; q=c; }
      else if (inStr && c===q) { inStr=false; }
      else if (!inStr && c===',') { vals.push(cur); cur=''; continue; }
      else { cur+=c; }
    }
    vals.push(cur);
    const bairro = vals[iBairro]?.trim();
    const cidade = vals[iCidade]?.trim();
    const area = parseFloat(vals[iArea]) || 0;
    const dorm = parseInt(vals[iDorm]) || 0;
    const vlr = parseFloat(vals[iVlrVenda]) || 0;
    const codigoC = vals[iCodigoC]?.trim();
    const codigo = vals[iCodigo]?.trim();
    if (bairro && vlr > 0) {
      cadimo.push({ codigo, codigoC, bairro, cidade, area, dorm, vlr });
    }
  } catch(e) {}
}
console.log(`CADIMO registros válidos: ${cadimo.length}`);

// Mostrar exemplo
if (cadimo.length > 0) {
  console.log('Exemplo CADIMO:', JSON.stringify(cadimo[0]));
}

// Cruzar com XML
console.log('\nCruzando...');
let matches = 0;
for (const imo of imoveis) {
  const candidatos = cadimo.filter(c => {
    const bairroOk = c.bairro.toLowerCase().includes(imo.bairro.toLowerCase()) || 
                     imo.bairro.toLowerCase().includes(c.bairro.toLowerCase());
    const vlrOk = imo.valor_imovel > 0 && c.vlr > 0 && 
                  Math.abs(c.vlr - imo.valor_imovel) / imo.valor_imovel < 0.05;
    const areaOk = imo.area_m2 > 0 && c.area > 0 &&
                   Math.abs(c.area - imo.area_m2) / imo.area_m2 < 0.10;
    const dormOk = imo.quartos === c.dorm;
    return bairroOk && vlrOk && areaOk && dormOk;
  });
  if (candidatos.length > 0) {
    imo.codigoC_cadimo = candidatos[0].codigoC;
    matches++;
  }
}

console.log(`Matches encontrados: ${matches} / ${imoveis.length}`);
if (matches > 0) {
  const ex = imoveis.find(i => i.codigoC_cadimo);
  console.log('Exemplo:', ex.titulo, '| codigoC:', ex.codigoC_cadimo);
}
