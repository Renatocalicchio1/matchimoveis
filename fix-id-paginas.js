const fs = require('fs');

// 1. app-imovel-detalhe.ejs — mostrar só ID interno
let detalhe = fs.readFileSync('views/app-imovel-detalhe.ejs','utf8');
detalhe = detalhe.replace(
  '<div class="info-row"><span class="info-lbl">ID</span><span class="info-val"><%= imovel.idExterno || imovel.id %></span></div>',
  '<div class="info-row"><span class="info-lbl">ID MatchImóveis</span><span class="info-val" style="font-weight:700;color:#ff385c;font-family:monospace"><%= imovel.id || \'-\' %></span></div>'
);
fs.writeFileSync('views/app-imovel-detalhe.ejs', detalhe);
console.log('1. detalhe ok');

// 2. app-editar-imovel.ejs — mostrar ID interno readonly
let editar = fs.readFileSync('views/app-editar-imovel.ejs','utf8');

// Procura onde estão os campos do formulário
const temIdInterno = editar.includes('ID MatchImóveis') || editar.includes('id-interno');

if (!temIdInterno) {
  // Adicionar campo ID interno readonly no topo do formulário
  editar = editar.replace(
    /<form[^>]*method=["']post["'][^>]*>/i,
    match => match + `
    <div style="background:#f9f9f8;border:1px solid #e5e0d8;border-radius:10px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px">
      <span style="font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.4px">ID MatchImóveis</span>
      <span style="font-family:monospace;font-size:14px;font-weight:700;color:#ff385c"><%= imovel.id || '-' %></span>
      <span style="font-size:11px;color:#bbb;margin-left:auto">🔒 Não editável</span>
    </div>`
  );
  fs.writeFileSync('views/app-editar-imovel.ejs', editar);
  console.log('2. editar ok — ID interno adicionado readonly');
} else {
  console.log('2. editar ja tem ID interno');
}
