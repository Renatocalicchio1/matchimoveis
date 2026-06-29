const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const cadimo = fs.readFileSync('/Users/renatocalicchio/Downloads/CADIMO.sql', 'utf8');
const cadcli = fs.readFileSync('/Users/renatocalicchio/Downloads/CADCLI.sql', 'utf8');

// Parsear CADCLI → map codC → {nome, celular, email}
const cadCliMap = {};
const rowsCli = cadcli.match(/VALUES\s*\([\s\S]*?\);/g) || [];
// Descobrir índices
const headerCli = cadcli.match(/INSERT INTO[^(]+\(([^)]+)\)/i);
const colsCli = headerCli ? headerCli[1].split(',').map(c=>c.trim().replace(/`/g,'')) : [];
const idxNome = colsCli.findIndex(c=>c==='NOME');
const idxCel  = colsCli.findIndex(c=>c==='CELULAR'||c==='FONE1');
const idxEmail= colsCli.findIndex(c=>c==='EMAIL');
const idxCodC = colsCli.findIndex(c=>c==='CODIGO');

function parseRow(row) {
  const inner = row.replace(/^VALUES\s*\(/i,'').replace(/\);$/,'');
  const parts = []; let cur='', inQ=false;
  for (let i=0;i<inner.length;i++) {
    const ch = inner[i];
    if (ch==="'" && inner[i-1]!=='\\') { inQ=!inQ; }
    else if (ch===',' && !inQ) { parts.push(cur.trim()); cur=''; }
    else cur+=ch;
  }
  parts.push(cur.trim());
  return parts.map(p=>p.replace(/^'|'$/g,'').replace(/\\'/g,"'"));
}

for (const row of rowsCli) {
  const parts = parseRow(row);
  const cod = parts[idxCodC];
  if (cod) cadCliMap[cod] = { nome: parts[idxNome]||'', celular: parts[idxCel]||'', email: parts[idxEmail]||'' };
}
console.log('CADCLI carregado:', Object.keys(cadCliMap).length);

// Parsear CADIMO → map codigoImovel → codC
const cadimoMap = {};
const headerImo = cadimo.match(/INSERT INTO[^(]+\(([^)]+)\)/i);
const colsImo = headerImo ? headerImo[1].split(',').map(c=>c.trim().replace(/`/g,'')) : [];
const idxCodImo = colsImo.findIndex(c=>c==='CODIGO');
const idxCodCImo= colsImo.findIndex(c=>c==='CODCLI'||c==='COD_CLI'||c==='CODCLIENTE');
console.log('Colunas CADIMO:', colsImo.join(', '));

const rowsImo = cadimo.match(/VALUES\s*\([\s\S]*?\);/g) || [];
for (const row of rowsImo) {
  const parts = parseRow(row);
  const codImo = parts[idxCodImo];
  const codC   = parts[idxCodCImo];
  if (codImo && codC) cadimoMap[codImo] = codC;
}
console.log('CADIMO carregado:', Object.keys(cadimoMap).length);

async function run() {
  const { rows: imoveis } = await pool.query("SELECT id, dados FROM imoveis WHERE user_id='ALE-DU2K'");
  console.log('Imóveis ALE-DU2K:', imoveis.length);

  let vinculados = 0, semFoto = 0, semCruz = 0;

  for (const im of imoveis) {
    const dados = im.dados || {};
    const fotos = dados.fotos || [];
    if (!fotos.length) { semFoto++; continue; }

    const match = fotos[0].match(/fotos\/(\d+)\//);
    if (!match) { semFoto++; continue; }

    const codImo = match[1];
    const codC   = cadimoMap[codImo];
    if (!codC) { semCruz++; continue; }

    const cli = cadCliMap[codC];
    if (!cli || !cli.nome) { semCruz++; continue; }

    const proprietario = { nome: cli.nome, celular: cli.celular, email: cli.email, status: 'vinculado' };
    await pool.query("UPDATE imoveis SET dados = dados || jsonb_build_object('proprietario',$1::jsonb) WHERE id=$2", [JSON.stringify(proprietario), im.id]);
    vinculados++;
  }

  console.log('✅ Vinculados:', vinculados);
  console.log('❌ Sem foto:', semFoto);
  console.log('❌ Sem cruzamento:', semCruz);
  await pool.end();
}

run().catch(console.error);
