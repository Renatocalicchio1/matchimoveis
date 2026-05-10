const fs = require('fs');
let imo = fs.readFileSync('cerebro/imoveis.js', 'utf8');

const antigo = `    return \`🔍 <strong>\${r.length} imóvel(is)</strong>\${temBairro?' em '+temBairro:''}\${temTipo?' · '+temTipo:''}:<br>\`+
      r.slice(0,5).map(i=>{ const lid=i.id||(i.idExterno?'MI-'+i.idExterno:''); const val=i.valor_imovel?'· R+
      (r.length>5?\`<br><em>...e mais \${r.length-5}</em>\`:'')+
      \`<br><br>\${btn('Ver todos','/app/imoveis')}\`;`;

const novo = `    return '🔍 <strong>'+r.length+' imóvel(is)</strong>'+(temBairro?' em '+temBairro:'')+(temTipo?' · '+temTipo:'')+':<br>'+
      r.slice(0,5).map(i=>{ const lid=i.id||(i.idExterno?'MI-'+i.idExterno:''); const val=i.valor_imovel?'· R$'+Number(i.valor_imovel).toLocaleString('pt-BR'):''; const qts=i.quartos?i.quartos+'q':''; const vgs=i.vagas?i.vagas+'vg':''; return '• <a href="/app/imovel/'+lid+'" target="_blank" style="color:#ff385c;font-weight:700">'+(i.tipo||'Imóvel')+' — '+(i.bairro||'')+'</a> '+qts+' '+vgs+' '+val; }).join('<br>')+
      (r.length>5?'<br><em>...e mais '+(r.length-5)+'</em>':'')+
      '<br><br>'+btn('Ver todos','/app/imoveis');`;

if (imo.includes(antigo)) {
  imo = imo.replace(antigo, novo);
  fs.writeFileSync('cerebro/imoveis.js', imo);
  console.log('ok');
} else {
  console.log('nao encontrado — substituindo por linha');
  // Substituição linha a linha
  const linhas = imo.split('\n');
  const idx = linhas.findIndex(l => l.includes('r.slice(0,5).map(i=>{ const lid'));
  if (idx >= 0) {
    console.log('linha', idx+1, ':', linhas[idx].substring(0,60));
    // Remover linhas corrompidas e inserir corretas
    linhas.splice(idx-1, 4,
      `    return '🔍 <strong>'+r.length+' imóvel(is)</strong>'+(temBairro?' em '+temBairro:'')+(temTipo?' · '+temTipo:'')+':<br>'+`,
      `      r.slice(0,5).map(i=>{ const lid=i.id||(i.idExterno?'MI-'+i.idExterno:''); const val=i.valor_imovel?'· R$'+Number(i.valor_imovel).toLocaleString('pt-BR'):''; const qts=i.quartos?i.quartos+'q':''; const vgs=i.vagas?i.vagas+'vg':''; return '• <a href="/app/imovel/'+lid+'" target="_blank" style="color:#ff385c;font-weight:700">'+(i.tipo||'Imóvel')+' — '+(i.bairro||'')+'</a> '+qts+' '+vgs+' '+val; }).join('<br>')+`,
      `      (r.length>5?'<br><em>...e mais '+(r.length-5)+'</em>':'')+`,
      `      '<br><br>'+btn('Ver todos','/app/imoveis');`
    );
    fs.writeFileSync('cerebro/imoveis.js', linhas.join('\n'));
    console.log('corrigido por linha');
  }
}
