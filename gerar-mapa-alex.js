const fs = require('fs');

const cadimo = fs.readFileSync('/Users/renatocalicchio/Downloads/CADIMO.sql', 'utf8');
const cadcli = fs.readFileSync('/Users/renatocalicchio/Downloads/CADCLI.sql', 'utf8');

// Parser de linha CSV estilo MySQL: ("val1","val2",...)
function parseLinha(linha) {
  linha = linha.trim().replace(/^[(]|[),;]+$/g,'');
  const parts = []; let cur='', inQ=false;
  for (let i=0;i<linha.length;i++) {
    const ch=linha[i];
    if (ch==='"' && linha[i-1]!=='\\') { inQ=!inQ; }
    else if (ch===',' && !inQ) { parts.push(cur); cur=''; }
    else cur+=ch;
  }
  parts.push(cur);
  return parts;
}

// CADCLI — colunas do INSERT
const headerCli = cadcli.match(/INSERT INTO `CADCLI` \(([^)]+)\) VALUES/);
const colsCli = headerCli[1].split(',').map(c=>c.trim().replace(/`/g,''));
const idxCodC = colsCli.indexOf('CODIGO_C');
const idxNome = colsCli.indexOf('NOME');
const idxCel  = colsCli.indexOf('CELULAR');
const idxEmail= colsCli.indexOf('EMAIL_R');
const idxFone = colsCli.indexOf('FONE_PRINCIPAL');
console.log('CADCLI cols:', {idxCodC, idxNome, idxCel, idxEmail, idxFone});

const cadCliMap = {};
const linhasCli = cadcli.split('\n').filter(l=>l.trim().startsWith('('));
for (const linha of linhasCli) {
  const parts = parseLinha(linha);
  const cod = parts[idxCodC];
  const nome = parts[idxNome];
  if (cod && nome) {
    cadCliMap[cod] = {
      nome,
      celular: parts[idxCel]||parts[idxFone]||'',
      email: parts[idxEmail]||''
    };
  }
}
console.log('CADCLI carregado:', Object.keys(cadCliMap).length);

// CADIMO — colunas do INSERT
const headerImo = cadimo.match(/INSERT INTO `CADIMO` \(([^)]+)\) VALUES/);
const colsImo = headerImo[1].split(',').map(c=>c.trim().replace(/`/g,''));
const idxCodImo  = colsImo.indexOf('CODIGO');
const idxCodCImo = colsImo.indexOf('CODIGO_C');
console.log('CADIMO cols:', {idxCodImo, idxCodCImo});

const cadimoMap = {};
const linhasImo = cadimo.split('\n').filter(l=>l.trim().startsWith('('));
for (const linha of linhasImo) {
  const parts = parseLinha(linha);
  const codImo = parts[idxCodImo];
  const codC   = parts[idxCodCImo];
  if (codImo && codC) cadimoMap[codImo] = codC;
}
console.log('CADIMO carregado:', Object.keys(cadimoMap).length);

// Mapa final: codigoFoto → proprietario
const mapa = {};
for (const [codImo, codC] of Object.entries(cadimoMap)) {
  const cli = cadCliMap[codC];
  if (cli && cli.nome) mapa[codImo] = { nome: cli.nome, celular: cli.celular, email: cli.email };
}
console.log('Mapa final:', Object.keys(mapa).length);

fs.writeFileSync('/Users/renatocalicchio/Downloads/mapa-proprietarios-alex.json', JSON.stringify(mapa));
console.log('✅ Salvo em mapa-proprietarios-alex.json');
