const fs = require('fs');
const https = require('https');

function getXML() {
  return new Promise((resolve, reject) => {
    https.get('https://sistema.rankim.com.br/integration/39c160cc462c6d690e3433feaf038a23966c241b/vivareal.xml', res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseValores(linha) {
  // Remove ( do inicio e ) do fim
  const inner = linha.replace(/^\(/, '').replace(/\)[^)]*$/, '');
  const vals = [];
  let cur = '';
  let inStr = false;
  let quote = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (!inStr && (c === '"' || c === "'")) { inStr = true; quote = c; }
    else if (inStr && c === quote) { inStr = false; }
    else if (!inStr && c === ',') { vals.push(cur); cur = ''; continue; }
    else { cur += c; }
  }
  vals.push(cur);
  return vals.map(v => v.replace(/^["']|["']$/g,'').trim());
}

async function main() {
  console.log('Baixando XML...');
  const xml = await getXML();
  const listingIds = new Set([...xml.matchAll(/<ListingID>(\d+)<\/ListingID>/g)].map(m => m[1]));
  console.log(`XML: ${listingIds.size} imóveis`);

  console.log('Lendo CADIMO...');
  const cadimoSQL = fs.readFileSync('/tmp/crm_sql/CADIMO.sql', 'latin1');
  const colMatch = cadimoSQL.match(/INSERT INTO `CADIMO` \(([^)]+)\)/);
  const colunas = colMatch[1].split(',').map(c => c.replace(/`/g,'').trim());
  const iCodigoWeb = colunas.indexOf('CODIGO_WEB');
  const iCodigoC = colunas.indexOf('CODIGO_C');
  console.log(`CODIGO_WEB[${iCodigoWeb}] CODIGO_C[${iCodigoC}]`);

  // Exemplo do primeiro registro
  const primeiraLinha = cadimoSQL.split('\n').find(l => l.startsWith('('));
  const exemploVals = parseValores(primeiraLinha);
  console.log('CODIGO_WEB exemplo:', exemploVals[iCodigoWeb]);
  console.log('CODIGO_C exemplo:', exemploVals[iCodigoC]);

  const mapaImovel = {};
  for (const linha of cadimoSQL.split('\n')) {
    if (!linha.startsWith('(')) continue;
    try {
      const vals = parseValores(linha);
      const codigoWeb = vals[iCodigoWeb]?.trim();
      const codigoC = vals[iCodigoC]?.trim();
      if (codigoWeb && codigoWeb !== '0' && codigoWeb !== 'NULL' && codigoWeb !== '') {
        mapaImovel[codigoWeb] = codigoC;
      }
    } catch(e) {}
  }
  console.log(`Imóveis mapeados: ${Object.keys(mapaImovel).length}`);
  console.log('Exemplo mapa:', Object.entries(mapaImovel).slice(0,3));

  console.log('Lendo CADCLI...');
  const cadcliSQL = fs.readFileSync('/tmp/crm_sql/CADCLI.sql', 'latin1');
  const colCli = cadcliSQL.match(/INSERT INTO `CADCLI` \(([^)]+)\)/)[1].split(',').map(c => c.replace(/`/g,'').trim());
  const iCodCli = colCli.indexOf('CODIGO_C');
  const iNome = colCli.indexOf('NOME');
  const iCelular = colCli.indexOf('CELULAR');
  const iEmail = colCli.indexOf('EMAIL_R');

  const mapaCliente = {};
  for (const linha of cadcliSQL.split('\n')) {
    if (!linha.startsWith('(')) continue;
    try {
      const vals = parseValores(linha);
      const cod = vals[iCodCli]?.trim();
      if (cod) mapaCliente[cod] = { nome: vals[iNome]||'', celular: vals[iCelular]||'', email: vals[iEmail]||'' };
    } catch(e) {}
  }
  console.log(`Clientes: ${Object.keys(mapaCliente).length}`);

  const resultado = [];
  for (const lid of listingIds) {
    const codigoC = mapaImovel[lid];
    const cliente = codigoC ? mapaCliente[codigoC] : null;
    if (cliente && cliente.nome) resultado.push({ listingId: lid, codigoC, proprietario: cliente });
  }

  console.log(`\n✅ Com proprietário: ${resultado.length} / ${listingIds.size}`);
  resultado.slice(0,5).forEach(r => console.log(`  ${r.listingId}: ${r.proprietario.nome} | ${r.proprietario.celular}`));
  fs.writeFileSync('./cruzamento_proprietarios.json', JSON.stringify(resultado, null, 2));
}

main().catch(console.error);
