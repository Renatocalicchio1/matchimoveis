const fs = require('fs');

// Remove do users.json
const users = JSON.parse(fs.readFileSync('users.json','utf8'));
const usersFiltrado = users.filter(u => u.codigoUsuario !== 'REN-9999');
fs.writeFileSync('users.json', JSON.stringify(usersFiltrado, null, 2));
console.log('Users restantes:', usersFiltrado.length);

// Remove imoveis copiados REN-9999
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const imoveisArr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);
const imoveisFiltrados = imoveisArr.filter(i => i.codigoUsuario !== 'REN-9999');
fs.writeFileSync('imoveis.json', JSON.stringify(imoveisFiltrados, null, 2));
console.log('Imoveis removidos:', imoveisArr.length - imoveisFiltrados.length);
console.log('Imoveis restantes:', imoveisFiltrados.length);
