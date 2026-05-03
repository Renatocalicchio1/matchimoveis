const fs = require('fs');

const imoveis = JSON.parse(fs.readFileSync('./imoveis.json', 'utf8'));

console.log('Lendo CADIMO...');
const cadimoSQL = fs.readFileSync('/tmp/crm_sql/CADIMO.sql', 'latin1');
const colsCad = cadimoSQL.match(/INSERT INTO `CADIMO` \(([^)]+)\)/)[1].split(',').map(c=>c.replace(/`/g,'').trim());
const iArea=colsCad.indexOf('AREA_TOTAL'), iDorm=colsCad.indexOf('DORMITORIO');
const iBairro=colsCad.indexOf('BAIRRO'), iVlr=colsCad.indexOf('VLR_VENDA');
const iCodigoC=colsCad.indexOf('CODIGO_C');

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

const cadimo = [];
for (const linha of cadimoSQL.split('\n')) {
  if (!linha.startsWith('(')) continue;
  try {
    const vals = parseVals(linha);
    const bairro=vals[iBairro]?.trim(), vlr=parseFloat(vals[iVlr])||0;
    if (bairro&&vlr>0) cadimo.push({
      codigoC:vals[iCodigoC]?.trim(),
      bairro, area:parseFloat(vals[iArea])||0,
      dorm:parseInt(vals[iDorm])||0, vlr
    });
  } catch(e){}
}
console.log('CADIMO:', cadimo.length);

console.log('Lendo CADCLI...');
const cadcliSQL = fs.readFileSync('/tmp/crm_sql/CADCLI.sql', 'latin1');
const colsCli = cadcliSQL.match(/INSERT INTO `CADCLI` \(([^)]+)\)/)[1].split(',').map(c=>c.replace(/`/g,'').trim());
const iCod=colsCli.indexOf('CODIGO_C'), iNome=colsCli.indexOf('NOME');
const iCel=colsCli.indexOf('CELULAR'), iEmail=colsCli.indexOf('EMAIL_R');
const iFoneR=colsCli.indexOf('FONE_R'), iCelE=colsCli.indexOf('CELULAR_E');
const iFoneC=colsCli.indexOf('FONE_C'), iFonePrinc=colsCli.indexOf('FONE_PRINCIPAL');

const mapaCliente = {};
for (const linha of cadcliSQL.split('\n')) {
  if (!linha.startsWith('(')) continue;
  try {
    const vals = parseVals(linha);
    const cod=vals[iCod]?.trim();
    if (!cod||cod==='0') continue;
    const telefone = [vals[iCel],vals[iFoneR],vals[iCelE],vals[iFoneC],vals[iFonePrinc]]
      .map(v=>(v||'').trim()).find(v=>v&&v.length>5) || '';
    mapaCliente[cod]={
      nome:vals[iNome]||'',
      celular: telefone,
      email:vals[iEmail]||''
    };
  } catch(e){}
}
console.log('Clientes:', Object.keys(mapaCliente).length);

let matches=0;
for (const imo of imoveis) {
  const candidatos = cadimo.filter(c => {
    const bOk = c.bairro.toLowerCase().includes(imo.bairro.toLowerCase()) ||
                imo.bairro.toLowerCase().includes(c.bairro.toLowerCase());
    const vOk = imo.valor_imovel>0&&c.vlr>0&&Math.abs(c.vlr-imo.valor_imovel)/imo.valor_imovel<0.05;
    const aOk = imo.area_m2>0&&c.area>0&&Math.abs(c.area-imo.area_m2)/imo.area_m2<0.10;
    const dOk = imo.quartos===c.dorm;
    return bOk&&vOk&&aOk&&dOk;
  });
  if (candidatos.length>0) {
    const cliente = mapaCliente[candidatos[0].codigoC];
    if (cliente&&cliente.nome) { imo.proprietario=cliente; matches++; }
  }
}

fs.writeFileSync('./imoveis.json', JSON.stringify(imoveis, null, 2));

const comTel = imoveis.filter(i=>i.proprietario&&i.proprietario.celular);
const comEmail = imoveis.filter(i=>i.proprietario&&i.proprietario.email);
console.log(`\n✅ Proprietários: ${matches} / ${imoveis.length}`);
console.log(`Com telefone: ${comTel.length}`);
console.log(`Com email: ${comEmail.length}`);
comTel.slice(0,3).forEach(i=>console.log(' ',i.bairro,'|',i.proprietario.nome,'|',i.proprietario.celular));
