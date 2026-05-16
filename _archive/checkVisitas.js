const fs = require('fs');
const visitas = fs.existsSync('visitas.json') ? JSON.parse(fs.readFileSync('visitas.json','utf8')) : [];
const notifs = fs.existsSync('notificacoes.json') ? JSON.parse(fs.readFileSync('notificacoes.json','utf8')) : [];
console.log('Total visitas:', visitas.length);
console.log('Total notificacoes:', notifs.length);
if (visitas.length > 0) console.log('Ultima visita:', JSON.stringify(visitas[visitas.length-1], null, 2));
if (notifs.length > 0) console.log('Ultima notif:', JSON.stringify(notifs[notifs.length-1], null, 2));
