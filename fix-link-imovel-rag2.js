const fs = require('fs');
let rag = fs.readFileSync('cerebro/rag.js', 'utf8');

const antigo = `    const link = i.id || i.idExterno;\n    return \`• <a href="/app/imovel/\${link}" target="_blank" style="color:#ff385c;font-weight:700">\${i.tipo||'Imóvel'}</a>\${qts}\${vg} — \${i.bairro||''}\${val}\`;`;

const novo = `    const linkId = i.id || ('MI-' + i.idExterno);\n    return \`• <a href="/app/imovel/\${linkId}" target="_blank" style="color:#ff385c;font-weight:700">\${i.tipo||'Imóvel'} \${i.bairro||''}</a>\${qts}\${vg}\${val}\`;`;

if (rag.includes(antigo)) {
  rag = rag.replace(antigo, novo);
  fs.writeFileSync('cerebro/rag.js', rag);
  console.log('ok');
} else {
  // Tentar encontrar o bloco atual
  const idx = rag.indexOf('const link = i.id');
  console.log('bloco nao encontrado, pos:', idx);
  console.log(rag.substring(Math.max(0,idx-20), idx+100));
}
