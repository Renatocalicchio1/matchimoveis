const fs = require('fs');
const https = require('https');

function getXML() {
  return new Promise((resolve, reject) => {
    https.get('https://cli21379-portais.vistahost.com.br/9bc249c7e7e72ef840e2c556025a214b', res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function getTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
  return m ? m[1].trim() : '';
}

function parseVals(linha) {
  const inner = linha.slice(1, linha.lastIndexOf(')'));
  const vals=[]; let cur='',inStr=false,q='';
  for (const c of inner) {
    if (!inStr&&(c==='"'||c==="'")) {inStr=true;q=c;}
    else if (inStr&&c===q) {inStr=false;}
    else if (!inStr&&c===',') {vals.push(cur);cur='';continue;}
    else {cur+=c;}
  }
  vals.push(cur);
  return vals;
}

async function main() {
  // 1. Baixar XML e extrair imóveis
  console.log('Baixando XML Vista...');
  const xml = await getXML();
  const listings = xml.split('<Listing>').slice(1);
  console.log('Imóveis no XML:', listings.length);

  // 2. Ler CADIMO — pegar CHAVE/CODIGO → CODIGO_C
  console.log('Lendo CADIMO...');
  const cadimoSQL = fs.readFileSync('/tmp/crm_sql/CADIMO.sql', 'latin1');
  const colsCad = cadimoSQL.match(/INSERT INTO `CADIMO` \(([^)]+)\)/)[1].split(',').map(c=>c.replace(/`/g,'').trim());
  const iChave = colsCad.indexOf('CHAVE');
  const iCodigo = colsCad.indexOf('CODIGO');
  const iCodigoC = colsCad.indexOf('CODIGO_C');
  console.log(`CHAVE[${iChave}] CODIGO[${iCodigo}] CODIGO_C[${iCodigoC}]`);

  const mapaCadimo = {}; // id -> codigoC
  for (const linha of cadimoSQL.split('\n')) {
    if (!linha.startsWith('(')) continue;
    try {
      const vals = parseVals(linha);
      const chave = vals[iChave]?.trim();
      const codigo = vals[iCodigo]?.trim();
      const codigoC = vals[iCodigoC]?.trim();
      if (chave) mapaCadimo[chave] = codigoC;
      if (codigo) mapaCadimo[codigo] = codigoC;
    } catch(e) {}
  }
  console.log('CADIMO mapeado:', Object.keys(mapaCadimo).length);

  // 3. Ler CADCLI
  console.log('Lendo CADCLI...');
  const cadcliSQL = fs.readFileSync('/tmp/crm_sql/CADCLI.sql', 'latin1');
  const colsCli = cadcliSQL.match(/INSERT INTO `CADCLI` \(([^)]+)\)/)[1].split(',').map(c=>c.replace(/`/g,'').trim());
  const iCod=colsCli.indexOf('CODIGO_C'), iNome=colsCli.indexOf('NOME');
  const iCel=colsCli.indexOf('CELULAR'), iEmail=colsCli.indexOf('EMAIL_R');
  const iFoneR=colsCli.indexOf('FONE_R'), iFoneC=colsCli.indexOf('FONE_C');
  const iFonePrinc=colsCli.indexOf('FONE_PRINCIPAL');

  const mapaCliente = {};
  for (const linha of cadcliSQL.split('\n')) {
    if (!linha.startsWith('(')) continue;
    try {
      const vals = parseVals(linha);
      const cod = vals[iCod]?.trim();
      if (!cod||cod==='0') continue;
      const tel = [vals[iCel],vals[iFoneR],vals[iFoneC],vals[iFonePrinc]]
        .map(v=>(v||'').trim()).find(v=>v&&v.length>5) || '';
      mapaCliente[cod] = { nome:vals[iNome]||'', celular:tel, email:vals[iEmail]||'' };
    } catch(e) {}
  }
  console.log('Clientes:', Object.keys(mapaCliente).length);

  // 4. Montar imoveis com proprietário
  const imoveis = listings.map(l => {
    const listingId = getTag(l, 'ListingID');
    const codigoC = mapaCadimo[listingId];
    const proprietario = codigoC ? mapaCliente[codigoC] : null;
    const fotos = [...l.matchAll(/<Item[^>]*>([^<]*)<\/Item>/g)].map(m=>m[1]).filter(f=>f.startsWith('http'));
    return {
      idExterno: listingId,
      titulo: getTag(l, 'Title'),
      transacao: getTag(l, 'TransactionType') === 'For Sale' ? 'venda' : 'aluguel',
      tipo: getTag(l, 'PropertyType').includes('Home') ? 'Casa' : 'Apartamento',
      bairro: getTag(l, 'Neighborhood'),
      cidade: getTag(l, 'City'),
      estado: getTag(l, 'State'),
      endereco: getTag(l, 'Address'),
      cep: getTag(l, 'PostalCode'),
      latitude: parseFloat(getTag(l, 'Latitude')) || 0,
      longitude: parseFloat(getTag(l, 'Longitude')) || 0,
      valor_imovel: parseFloat(getTag(l, 'ListPrice')) || 0,
      area_m2: parseFloat(getTag(l, 'LivingArea')) || parseFloat(getTag(l, 'LotArea')) || 0,
      quartos: parseInt(getTag(l, 'Bedrooms')) || 0,
      banheiros: parseInt(getTag(l, 'Bathrooms')) || 0,
      vagas: parseInt(getTag(l, 'Garage')) || 0,
      suites: parseInt(getTag(l, 'Suites')) || 0,
      descricao: getTag(l, 'Description'),
      fotos,
      proprietario: proprietario || null,
      source: 'vista',
      lastUpdate: new Date().toISOString()
    };
  });

  const comProp = imoveis.filter(i => i.proprietario && i.proprietario.nome);
  const comTel = imoveis.filter(i => i.proprietario && i.proprietario.celular);
  console.log(`\n✅ Total: ${imoveis.length}`);
  console.log(`Com proprietário: ${comProp.length}`);
  console.log(`Com telefone: ${comTel.length}`);
  comTel.slice(0,3).forEach(i => console.log(` ${i.idExterno} | ${i.bairro} | ${i.proprietario.nome} | ${i.proprietario.celular}`));

  fs.writeFileSync('./imoveis.json', JSON.stringify(imoveis, null, 2));
  console.log('✅ imoveis.json salvo!');
}

main().catch(console.error);
