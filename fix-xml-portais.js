const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// Adicionar no portais.js
let port = fs.readFileSync(path.join(BASE,'cerebro','portais.js'),'utf8');

if (!port.includes('leitura dos imoveis')) {
  const ins = `
  // Como funciona o XML com os portais
  if (/como funciona xml|como portal le|como zap le|como vivareal le|como olx le|como portal parceiro|como portal importa|como portal busca imoveis/.test(mNorm))
    return '📡 <strong>Como funciona o XML com os portais:</strong><br><br>' +
      'O MatchImóveis gera um XML no padrão <strong>VRSync</strong> para cada portal.<br><br>' +
      'O portal parceiro faz a leitura automática desse XML e publica seus imóveis.<br><br>' +
      '<strong>Portais que leem o XML:</strong><br>' +
      '• ZAP Imóveis<br>• VivaReal<br>• OLX<br>• Chaves na Mão<br>• ImovelWeb<br>• 123i<br><br>' +
      'Basta gerar o XML, copiar o link e cadastrar nas configurações do portal. O portal faz o resto automaticamente.<br><br>' +
      btn('Gerar XML','/app/imoveis') + btn('Ver portais','/app/portais');

  // Para que serve o XML
  if (/para que serve xml|o que faz xml|o que e xml|o que significa xml/.test(mNorm))
    return '📡 <strong>Para que serve o XML:</strong><br><br>' +
      'O XML é o arquivo que os portais parceiros usam para ler e publicar seus imóveis automaticamente.<br><br>' +
      'Você gera o XML no MatchImóveis → o portal lê → publica seus imóveis.<br><br>' +
      'Sem o XML, você teria que cadastrar cada imóvel manualmente em cada portal.<br><br>' +
      btn('Gerar XML','/app/imoveis');
`;
  port = port.replace('function responder(mNorm, d, btn, chip) {',
    'function responder(mNorm, d, btn, chip) {' + ins);
  fs.writeFileSync(path.join(BASE,'cerebro','portais.js'), port);
  console.log('ok portais.js');
}

// Sinônimos
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = JSON.parse(fs.readFileSync(sPath,'utf8'));
s['como zap le xml']           = 'como portal le xml';
s['como vivareal le xml']      = 'como portal le xml';
s['como olx le xml']           = 'como portal le xml';
s['portal parceiro']           = 'portal parceiro match';
s['leitura dos imoveis']       = 'como portal le xml';
s['portal importa imoveis']    = 'como portal le xml';
s['portal busca imoveis']      = 'como portal le xml';
s['para que serve xml']        = 'o que e xml';
s['o xml e o feed']            = 'xml feed portal';
s['feed dos portais']          = 'xml feed portal';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('ok sinonimos');

// Base de conhecimento
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = JSON.parse(fs.readFileSync(baseP,'utf8'));
const exist = new Set(base.items.map(i=>i.p));
const novos = [
  {p:'como o zap le meus imoveis', r:'portais'},
  {p:'como o vivareal acessa meus imoveis', r:'portais'},
  {p:'como o olx publica meus imoveis', r:'portais'},
  {p:'o portal le o xml automaticamente', r:'portais'},
  {p:'o xml e lido pelo portal parceiro', r:'portais'},
  {p:'como funciona a integracao com os portais', r:'portais'},
  {p:'como o portal importa meus imoveis', r:'portais'},
  {p:'para que serve o xml gerado', r:'portais'},
  {p:'o xml substitui o cadastro manual no portal', r:'portais'},
  {p:'o portal faz leitura automatica do xml', r:'portais'},
];
let add = 0;
novos.forEach(n => { if (!exist.has(n.p)) { base.items.push(n); add++; } });
base.total = base.items.length;
fs.writeFileSync(baseP, JSON.stringify(base,null,2));
console.log('ok base +'+add+' (total:'+base.total+')');
console.log('feito');
