const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

const antigo = `return '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c"><strong>'+(i.tipo||'Imovel')+'</strong> - '+(i.bairro||'-')+'<br><span style="color:#ff385c;font-weight:700">'+val+'</span><span style="color:#555;font-size:12px"> '+det+'</span> <a href="/imovel/'+lid+'" target="_blank" style="color:#ff385c;font-size:11px;font-weight:600">🔗 Ver imóvel</a></div>';`;

const novo = `return '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c"><strong>'+(i.tipo||'Imovel')+'</strong> - '+(i.bairro||'-')+'<br><span style="color:#ff385c;font-weight:700">'+val+'</span><span style="color:#555;font-size:12px"> '+det+'</span> <a href="/imovel/'+lid+'" target="_blank" style="color:#ff385c;font-size:11px;font-weight:600">Clique aqui para ver o imóvel</a></div>';`;

if (ctx.includes(antigo)) {
  ctx = ctx.replace(antigo, novo);
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('ok');
} else {
  console.log('nao encontrado');
}
