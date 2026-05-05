const fs=require('fs'),path=require('path');
function parseArgs(){const args=process.argv.slice(2);const cfg={imoveisPath:'imoveis.json',tecimobPath:'tecimob.xlsx',outputPath:'imoveis.json',threshold:0.80,dryRun:false,verbose:false};for(let i=0;i<args.length;i++){if(args[i]==='--imoveis')cfg.imoveisPath=args[++i];if(args[i]==='--tecimob')cfg.tecimobPath=args[++i];if(args[i]==='--output')cfg.outputPath=args[++i];if(args[i]==='--threshold')cfg.threshold=parseFloat(args[++i]);if(args[i]==='--dry-run')cfg.dryRun=true;if(args[i]==='--verbose')cfg.verbose=true;}return cfg;}
function norm(t){if(!t||typeof t!=='string')return '';return t.replace(/m\u00b2/gi,'m2').replace(/m\u00b3/gi,'m3').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
const NGRAM_SIZE=4;
function scoreSubstring(descR,descT){const r=norm(descR);const t=norm(descT);if(!r||!t)return 0;if(t.includes(r))return 1.0;const words=r.split(' ').filter(Boolean);if(words.length<NGRAM_SIZE)return t.includes(r)?1.0:0;let encontrados=0;const total=words.length-NGRAM_SIZE+1;for(let i=0;i<=words.length-NGRAM_SIZE;i++){const ngram=words.slice(i,i+NGRAM_SIZE).join(' ');if(t.includes(ngram))encontrados++;}return encontrados/total;}
function normTel(t){return String(t||'').replace(/\D/g,'');}
async function main(){
const cfg=parseArgs();
console.log('Lendo imoveis...');
const raw=JSON.parse(fs.readFileSync(cfg.imoveisPath,'utf8'));
const imoveis=Array.isArray(raw)?raw:Object.values(raw);
console.log('Imoveis:',imoveis.length);
try{require.resolve('xlsx');}catch{const{execSync}=require('child_process');execSync('npm install xlsx',{stdio:'pipe'});}
const XLSX=require('xlsx');
console.log('Lendo Excel Tecimob...');
const wb=XLSX.readFile(cfg.tecimobPath);
const ws=wb.Sheets['Imóveis']||wb.Sheets[wb.SheetNames[0]];
const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
const props=rows.map(r=>({id:String(r['ID']||'').trim(),referencia:String(r['Referencia']||r['Referência']||'').trim(),proprietario:String(r['Proprietário']||'').trim(),celular:String(r['Celular do Proprietário']||'').trim(),email:String(r['E-mail']||'').trim(),descricao:String(r['Descrição']||'').trim()})).filter(r=>r.descricao.length>30&&r.proprietario);
console.log('Proprietarios validos:',props.length);
let vinculados=0,semMatch=0,jaVinculados=0,semDesc=0;
imoveis.forEach(imovel=>{
const id=imovel.idExterno||imovel.id||imovel.Codigo||'?';
const descRank=imovel.descricao||imovel.Descricao||'';
if(imovel.proprietario&&imovel.proprietario.nome){jaVinculados++;return;}
if(!descRank||norm(descRank).length<20){semDesc++;return;}
const scores=props.map(p=>({p,score:scoreSubstring(descRank,p.descricao)})).sort((a,b)=>b.score-a.score);
const melhor=scores[0];
if(melhor&&melhor.score>=cfg.threshold){
vinculados++;
const vinculo={nome:melhor.p.proprietario,telefone:normTel(melhor.p.celular),email:melhor.p.email,referenciaTecimob:melhor.p.referencia,fonteVinculo:'tecimob_descricao',scoreVinculo:Math.round(melhor.score*1000)/1000,dataVinculo:new Date().toISOString().split('T')[0]};
if(!cfg.dryRun)imovel.proprietario=vinculo;
console.log('✅',id,melhor.p.proprietario,(melhor.score*100).toFixed(1)+'%','ref:',melhor.p.referencia,'tel:',melhor.p.celular);
}else{
semMatch++;
if(cfg.verbose)console.log('❌',id,'melhor:',(melhor?(melhor.score*100).toFixed(1)+'% ('+melhor.p.proprietario+')':'nenhum'));
}});
console.log('\n=== RESULTADO ===');
console.log('Total:',imoveis.length,'| Vinculados:',vinculados,'| Sem match:',semMatch,'| Ja tinham:',jaVinculados,'| Sem desc:',semDesc);
if(!cfg.dryRun){fs.writeFileSync(cfg.outputPath,JSON.stringify(imoveis,null,2));console.log('Salvo:',cfg.outputPath);}
}
main().catch(e=>{console.error(e);process.exit(1);});
