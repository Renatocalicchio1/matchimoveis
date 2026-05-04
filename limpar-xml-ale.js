const fs = require('fs');

const USER_ID = 'ALE-2442';
const XML_URL = 'https://cli21379-portais.vistahost.com.br/9bc249c7e7e72ef840e2c556025a214b';
const FILE = 'imoveis.json';

let data = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : [];

const antes = data.length;

data = data.filter(i => {
  const dono = String(i.userId || i.usuarioId || i.corretorId || '');
  const origemXml = String(i.xmlUrl || i.feedUrl || i.origemXml || '') === XML_URL;
  const doUsuario = dono === USER_ID;

  return !(doUsuario || origemXml);
});

fs.writeFileSync(FILE, JSON.stringify(data, null, 2));

console.log('Antes:', antes);
console.log('Depois:', data.length);
console.log('Removidos:', antes - data.length);
