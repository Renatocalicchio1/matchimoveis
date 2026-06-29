const {Pool}=require('pg');
const fs=require('fs');

const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});

function parseLinha(linha){
  linha=linha.trim().replace(/^[(]|[),;]+$/g,'');
  const parts=[];let cur='',inQ=false;
  for(let i=0;i<linha.length;i++){
    const ch=linha[i];
    if(ch==='"'&&linha[i-1]!=='\\'){inQ=!inQ;}
    else if(ch===','&&!inQ){parts.push(cur);cur='';}
    else cur+=ch;
  }
  parts.push(cur);
  return parts;
}

const cadcli=fs.readFileSync('./CADCLI.sql','utf8');
const headerCli=cadcli.match(/INSERT INTO `CADCLI` \(([^)]+)\) VALUES/);
const colsCli=headerCli[1].split(',').map(c=>c.trim().replace(/`/g,''));
const idxCodC=colsCli.indexOf('CODIGO_C');
const idxNome=colsCli.indexOf('NOME');
const idxCel=colsCli.indexOf('CELULAR');
const idxEmail=colsCli.indexOf('EMAIL_R');
const cadCliMap={};
cadcli.split('\n').filter(l=>l.trim().startsWith('(')).forEach(l=>{
  const p=parseLinha(l);
  if(p[idxCodC]&&p[idxNome]) cadCliMap[p[idxCodC]]={nome:p[idxNome],celular:p[idxCel]||'',email:p[idxEmail]||''};
});
console.log('CADCLI:',Object.keys(cadCliMap).length);

const cadimo=fs.readFileSync('./CADIMO.sql','utf8');
const headerImo=cadimo.match(/INSERT INTO `CADIMO` \(([^)]+)\) VALUES/);
const colsImo=headerImo[1].split(',').map(c=>c.trim().replace(/`/g,''));
const idxCodImo=colsImo.indexOf('CODIGO');
const idxCodCImo=colsImo.indexOf('CODIGO_C');
const cadimoMap={};
cadimo.split('\n').filter(l=>l.trim().startsWith('(')).forEach(l=>{
  const p=parseLinha(l);
  if(p[idxCodImo]&&p[idxCodCImo]) cadimoMap[p[idxCodImo]]=p[idxCodCImo];
});
console.log('CADIMO:',Object.keys(cadimoMap).length);

async function run(){
  const {rows}=await pool.query("SELECT id,fotos FROM imoveis WHERE user_id='ALE-DU2K' AND fotos IS NOT NULL");
  console.log('Imóveis:',rows.length);
  let v=0,sc=0;
  for(const im of rows){
    const m=im.fotos[0].match(/fotos\/(\d+)\//);
    if(!m){sc++;continue;}
    const codC=cadimoMap[m[1]];
    if(!codC){sc++;continue;}
    const prop=cadCliMap[codC];
    if(!prop){sc++;continue;}
    await pool.query("UPDATE imoveis SET proprietario=$1 WHERE id=$2",[JSON.stringify({...prop,status:'vinculado'}),im.id]);
    v++;
  }
  console.log('✅ Vinculados:',v,'❌ Sem cruzamento:',sc);
  await pool.end();
}
run().catch(console.error);
