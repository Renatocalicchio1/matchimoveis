const fs = require('fs');
const XLSX = require('xlsx');
const USER_ID = 'imobiliaria-47992010888';
const THRESHOLD = 0.80;

function fixEncoding(t) {
  if (!t) return '';
  return t
    .replace(/a\?/g,'ã').replace(/o\?/g,'õ').replace(/A\?/g,'Ã').replace(/O\?/g,'Õ')
    .replace(/e\?/g,'é').replace(/i\?/g,'í').replace(/u\?/g,'ú')
    .replace(/a´/g,'á').replace(/e´/g,'ê').replace(/\?/g,'');
}

function norm(t){
  if(!t||typeof t!=='string')return '';
  return fixEncoding(t).replace(/m\u00b2/gi,'m2').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}

function score(r,t){
  const rn=norm(r); const tn=norm(t);
  if(!rn||!tn)return 0;
  if(tn.includes(rn))return 1;
  const w=rn.split(' ').filter(Boolean);
  if(w.length<4)return 0;
  let found=0; const total=w.length-3;
  for(let i=0;i<total;i++){if(tn.includes(w.slice(i,i+4).join(' ')))found++;}
  return found/total;
}

function normTel(t){return String(t||'').replace(/\D/g,'');}

const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const wb = XLSX.readFile("backup-28-11-25.06_22 (1) (1).xlsx");
const ws = wb.Sheets['Imóveis'];
const rows = XLSX.utils.sheet_to_json(ws,{defval:''});
const props = rows.map(r=>({
  referencia:String(r['Referencia']||'').trim(),
  proprietario:String(r['Proprietário']||'').trim(),
  celular:String(r['Celular do Proprietário']||'').trim(),
  email:String(r['E-mail']||'').trim(),
  descricao:String(r['Descrição']||'').trim()
})).filter(r=>r.descricao.length>30&&r.proprietario);

let vinculados=0, semMatch=0;
imoveis.forEach(imovel => {
  if(imovel.userId !== USER_ID) return;
  if(imovel.proprietario && imovel.proprietario.nome) return;
  const desc = imovel.descricao||'';
  if(norm(desc).length<20){semMatch++;return;}
  const scores = props.map(p=>({p,s:score(desc,p.descricao)})).sort((a,b)=>b.s-a.s);
  const melhor = scores[0];
  if(melhor&&melhor.s>=THRESHOLD){
    vinculados++;
    imovel.proprietario = {
      nome:melhor.p.proprietario,
      telefone:normTel(melhor.p.celular),
      email:melhor.p.email,
      referenciaTecimob:melhor.p.referencia,
      fonteVinculo:'tecimob_descricao',
      scoreVinculo:Math.round(melhor.s*1000)/1000,
      dataVinculo:new Date().toISOString().split('T')[0]
    };
    console.log('✅',imovel.idExterno||'?',melhor.p.proprietario,(melhor.s*100).toFixed(1)+'%',melhor.p.referencia);
  } else {
    semMatch++;
    console.log('❌',imovel.idExterno||'?',(melhor?(melhor.s*100).toFixed(1)+'%':'0%'),melhor&&melhor.p.proprietario||'');
  }
});

fs.writeFileSync('imoveis.json', JSON.stringify(imoveis,null,2));
console.log('\nVinculados:', vinculados, '| Sem match:', semMatch);
