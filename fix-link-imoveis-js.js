const fs = require('fs');
let imo = fs.readFileSync('cerebro/imoveis.js', 'utf8');

const antigo = `r.slice(0,5).map(i=>\`• <strong>\${i.tipo||'Imóvel'}</strong> \${i.quartos?i.quartos+'q':''} — \${i.bairro||''} \${i.valor?'· R$'+Number(i.valor).toLocaleString('pt-BR'):''}\`).join('<br>')`;

const novo = `r.slice(0,5).map(i=>{ const lid=i.id||(i.idExterno?'MI-'+i.idExterno:''); const val=i.valor_imovel?'· R$'+Number(i.valor_imovel).toLocaleString('pt-BR'):''; const qts=i.quartos?i.quartos+'q':''; const vgs=i.vagas?i.vagas+'vg':''; return \`• <a href="/app/imovel/\${lid}" target="_blank" style="color:#ff385c;font-weight:700">\${i.tipo||'Imóvel'} — \${i.bairro||''}</a> \${qts} \${vgs} \${val}\`; }).join('<br>')`;

if (imo.includes(antigo)) {
  imo = imo.replace(antigo, novo);
  fs.writeFileSync('cerebro/imoveis.js', imo);
  console.log('ok');
} else {
  console.log('bloco nao encontrado');
  // mostrar contexto
  const idx = imo.indexOf('r.slice(0,5)');
  console.log(imo.substring(idx, idx+200));
}
