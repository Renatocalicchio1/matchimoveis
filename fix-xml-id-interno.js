const fs = require('fs');
let server = fs.readFileSync('server.js','utf8');

// 1. XML gerado para portais — usar id interno como listingID
server = server.replace(
  '      <listingID>${i.idExterno || i.id}</listingID>',
  '      <listingID>${i.id || i.idExterno}</listingID>\n      <externalID>${i.idExterno || i.idOriginal || \'\'}</externalID>'
);

// 2. Linha 854 — geração de feed antigo também usa id interno
server = server.replace(
  "const id = i.idExterno || i.idOriginal || i.id || i.codigo || '';",
  "const id = i.id || i.idExterno || i.idOriginal || i.codigo || '';"
);

fs.writeFileSync('server.js', server);
console.log('1. XML agora usa id interno (MI-xxx) como listingID');

// 2. importXMLCompleto.js — mostrar ambos os IDs no log
let xml = fs.readFileSync('importXMLCompleto.js','utf8');
if (!xml.includes('ID Interno')) {
  xml = xml.replace(
    "console.log('Importação concluída:",
    "console.log('[MatchImóveis] IDs gerados — Interno: MI-xxx | Externo: idOriginal do CRM');\n  console.log('Importação concluída:"
  );
  fs.writeFileSync('importXMLCompleto.js', xml);
  console.log('2. importXMLCompleto.js — log de IDs atualizado');
}

// 3. Garantir que a página de imóveis mostra ambos os IDs
// Ver se app-imoveis.ejs já mostra idExterno
let ejsImoveis = fs.readFileSync('views/app-imoveis.ejs','utf8');
if (!ejsImoveis.includes('id interno') && !ejsImoveis.includes('i.id')) {
  console.log('3. app-imoveis.ejs — verificar manualmente se mostra IDs');
} else {
  console.log('3. app-imoveis.ejs — ok');
}

console.log('\nPronto! Rode: git add -A && git commit && git push');
