const fs = require('fs');
let rag = fs.readFileSync('cerebro/rag.js', 'utf8');

const antigo = "    return `• <strong>${i.tipo||'Imóvel'}</strong>${qts}${vg} — ${i.bairro||''}${val}`;";
const novo = "    const link = i.id || i.idExterno;\n    return `• <a href=\"/app/imovel/${link}\" target=\"_blank\" style=\"color:#ff385c;font-weight:700\">${i.tipo||'Imóvel'}</a>${qts}${vg} — ${i.bairro||''}${val}`;";

if (rag.includes(antigo)) {
  rag = rag.replace(antigo, novo);
  fs.writeFileSync('cerebro/rag.js', rag);
  console.log('ok');
} else {
  console.log('bloco nao encontrado');
}
