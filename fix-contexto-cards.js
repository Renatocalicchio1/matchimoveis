const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

const antigo = `    const top = [...imoveisEncontrados].sort((a,b)=>(Number(a.valor)||0)-(Number(b.valor)||0));
    const cards = top.slice(0,4).map(i => {
      const val  = i.valor   ? fmtVal(Number(i.valor)) : '-';
      const det  = [i.quartos?i.quartos+'q':'', i.vagas?i.vagas+'vg':'', i.area?i.area+'m2':''].filter(Boolean).join(' · ');
      const prop = i.proprietario&&i.proprietario.nome ? ' · '+i.proprietario.nome : '';
      return '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c"><strong>'+(i.tipo||'Imovel')+'</strong> - '+(i.bairro||'-')+'<br><span style="color:#ff385c;font-weight:700">'+val+'</span><span style="color:#555;font-size:12px"> '+det+prop+'</span></div>';
    }).join('');`;

const novo = `    const top = [...imoveisEncontrados].sort((a,b)=>(Number(a.valor_imovel)||0)-(Number(b.valor_imovel)||0));
    const cards = top.slice(0,4).map(i => {
      const val  = i.valor_imovel ? fmtVal(Number(i.valor_imovel)) : '-';
      const det  = [i.quartos?i.quartos+'q':'', i.vagas?i.vagas+'vg':'', i.area_m2?i.area_m2+'m2':''].filter(Boolean).join(' · ');
      const lid  = i.id || (i.idExterno ? 'MI-'+i.idExterno : '');
      return '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c"><a href="/app/imovel/'+lid+'" target="_blank" style="color:#222;text-decoration:none"><strong>'+(i.tipo||'Imovel')+'</strong> - '+(i.bairro||'-')+'</a><br><span style="color:#ff385c;font-weight:700">'+val+'</span><span style="color:#555;font-size:12px"> '+det+'</span></div>';
    }).join('');`;

if (ctx.includes(antigo)) {
  ctx = ctx.replace(antigo, novo);
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('ok');
} else {
  console.log('nao encontrado');
}
