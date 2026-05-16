const fs=require('fs');
const file='data.json';
const data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
const arr=Array.isArray(data)?data:(data.results||[]);
const out=arr.map((item,idx)=>({
  ...item,
  corretorId:'mario-sergio',
  corretorNome:'Mario Sergio',
  corretorCelular:'11999965998',
  xmlSelected:false,
  marioIndex:idx
}));
fs.writeFileSync(file,JSON.stringify(out,null,2));
console.log('OK: imóveis vinculados ao Mario Sergio:', out.length);
