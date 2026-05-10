const fs = require('fs');
let imo = fs.readFileSync('cerebro/imoveis.js', 'utf8');

// Substituir a linha inteira problemática
const linhaAtual = imo.split('\n').find(l => l.includes('r.slice(0,5).map(i=>{ const lid'));
console.log('linha atual:', linhaAtual ? linhaAtual.substring(0,80) : 'nao encontrada');

// Regex para encontrar e substituir
imo = imo.replace(
  /r\.slice\(0,5\)\.map\(i=>\{.*?\}catch.*?\}\)\.join\('<br>'\)/s,
  `r.slice(0,5).map(i=>{ const lid=i.id||(i.idExterno?'MI-'+i.idExterno:''); const val=i.valor_imovel?('· R' + '$' + Number(i.valor_imovel).toLocaleString('pt-BR')):''; const qts=i.quartos?i.quartos+'q':''; const vgs=i.vagas?i.vagas+'vg':''; return '• <a href="/app/imovel/'+lid+'" target="_blank" style="color:#ff385c;font-weight:700">'+( i.tipo||'Imóvel')+' — '+(i.bairro||'')+'</a> '+qts+' '+vgs+' '+val; }).join('<br>')`
);

fs.writeFileSync('cerebro/imoveis.js', imo);
console.log('salvo');
