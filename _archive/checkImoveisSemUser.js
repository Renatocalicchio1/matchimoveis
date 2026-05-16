const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
const arr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);
const semUserId = arr.filter(i => !i.userId || !i.userId.trim());
const fontes = [...new Set(semUserId.map(i => i.fonte))];
console.log('Fontes sem userId:', fontes);
console.log('Exemplo:', JSON.stringify({idExterno: semUserId[0].idExterno, fonte: semUserId[0].fonte, codigoUsuario: semUserId[0].codigoUsuario, userId: semUserId[0].userId}));
