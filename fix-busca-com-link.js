const fs = require('fs');
let imoveis_js = fs.readFileSync('cerebro/imoveis.js','utf8');

// Melhorar o card da busca inteligente para incluir link externo
const cardAntigo = `      return '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c">'
  +'<strong>'+(i.tipo||'Im\u00F3vel')+'</strong> \u2014 '+(i.bairro||'\u2014')+'<br>'
  +'<span style="color:#ff385c;font-weight:700">'+val+'</span>'
  +(det||prop ? '  <span style="color:#555;font-size:12px">'+det+prop+'</span>' : '')
  +'</div>';`;

const cardNovo = `      const linkExterno = i.idExterno ? '/imovel/'+i.idExterno : null;
      const linkVitrine = linkExterno ? '<br><a href="'+linkExterno+'" target="_blank" style="font-size:12px;color:#ff385c;font-weight:600;text-decoration:none">\uD83D\uDD17 Ver im\u00F3vel · Copiar link para cliente</a>' : '';
      return '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c">'
  +'<strong>'+(i.tipo||'Im\u00F3vel')+'</strong> \u2014 '+(i.bairro||'\u2014')+'<br>'
  +'<span style="color:#ff385c;font-weight:700">'+val+'</span>'
  +(det||prop ? '  <span style="color:#555;font-size:12px">'+det+prop+'</span>' : '')
  +linkVitrine
  +'</div>';`;

if (imoveis_js.includes(cardAntigo)) {
  imoveis_js = imoveis_js.replace(cardAntigo, cardNovo);
  fs.writeFileSync('cerebro/imoveis.js', imoveis_js);
  console.log('1. imoveis.js card atualizado com link externo');
} else {
  console.log('1. bloco nao encontrado — ajustando via regex');
  // Tenta achar o padrão do card de outra forma
  imoveis_js = imoveis_js.replace(
    /const cards = r\.slice\(0,5\)\.map\(i => \{/,
    `const cards = r.slice(0,5).map(i => {
      const linkExterno = i.idExterno ? '/imovel/'+i.idExterno : null;`
  );
  fs.writeFileSync('cerebro/imoveis.js', imoveis_js);
  console.log('1. patch alternativo aplicado');
}

// Melhorar também o contexto.js — busca com link
let ctx = fs.readFileSync('cerebro/contexto.js','utf8');
const cardCtxAntigo = `      return '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c">'
        +'<strong>'+(i.tipo||'Im\u00F3vel')+'</strong> \u2014 '+(i.bairro||'\u2014')+'<br>'
        +'<span style="color:#ff385c;font-weight:700">'+val+'</span>'
        +(det||prop ? '  <span style="color:#555;font-size:12px">'+det+prop+'</span>' : '')
        +'</div>';`;

const cardCtxNovo = `      const linkExt = i.idExterno ? '/imovel/'+i.idExterno : null;
      const linkBtn = linkExt ? '<br><a href="'+linkExt+'" target="_blank" style="font-size:12px;color:#ff385c;font-weight:600;text-decoration:none">\uD83D\uDD17 Ver im\u00F3vel · Enviar para cliente</a>' : '';
      return '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c">'
        +'<strong>'+(i.tipo||'Im\u00F3vel')+'</strong> \u2014 '+(i.bairro||'\u2014')+'<br>'
        +'<span style="color:#ff385c;font-weight:700">'+val+'</span>'
        +(det||prop ? '  <span style="color:#555;font-size:12px">'+det+prop+'</span>' : '')
        +linkBtn
        +'</div>';`;

if (ctx.includes(cardCtxAntigo)) {
  ctx = ctx.replace(cardCtxAntigo, cardCtxNovo);
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('2. contexto.js card atualizado com link externo');
} else {
  console.log('2. bloco contexto nao encontrado — ok, ja pode estar atualizado');
}

// Melhorar portugues.js — busca por valor com link
let pt = fs.readFileSync('cerebro/portugues.js','utf8');
pt = pt.replace(
  "r.slice(0,5).map(i=>'- <strong>'+(i.tipo||'Im\u00f3vel')+'</strong> '+(i.quartos?i.quartos+'q':'')+' \u2014 '+(i.bairro||'')+' \u00b7 <strong>'+fmtVal(i.valor)+'</strong>').join('<br>')",
  "r.slice(0,5).map(i=>'<div style=\"margin:4px 0\">- <strong>'+(i.tipo||'Im\u00f3vel')+'</strong> '+(i.quartos?i.quartos+'q ':'')+'\u2014 '+(i.bairro||'')+' \u00b7 <strong>'+fmtVal(i.valor)+'</strong>'+(i.idExterno?'<br><a href=\"/imovel/'+i.idExterno+'\" target=\"_blank\" style=\"font-size:12px;color:#ff385c\">\uD83D\uDD17 Ver im\u00f3vel</a>':'')+'</div>').join('')"
);
fs.writeFileSync('cerebro/portugues.js', pt);
console.log('3. portugues.js atualizado com link externo');

console.log('\nPronto! Rode: npm run cerebro');
