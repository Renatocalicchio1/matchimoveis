const fs = require('fs');

// Adiciona admin no users.json
const users = JSON.parse(fs.readFileSync('users.json','utf8'));
if (!users.find(u => u.id === 'admin')) {
  users.push({
    id: 'admin',
    nome: 'Admin',
    telefone: '',
    celular: '',
    tipo: 'admin',
    ativo: true,
    codigoUsuario: 'ADMIN'
  });
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
  console.log('Admin adicionado no users.json');
} else {
  console.log('Admin ja existe no users.json');
}

// Vincula leads sem userId ao admin
const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const arr = Array.isArray(raw) ? raw : (raw.results || []);
let atualizados = 0;
arr.forEach(l => {
  if (!l.userId || l.userId === '' || l.userId === '-') {
    l.userId = 'admin';
    l.usuarioId = 'admin';
    l.corretorId = 'admin';
    atualizados++;
  }
});
fs.writeFileSync('data.json', JSON.stringify(arr, null, 2));
console.log('Leads vinculadas ao admin:', atualizados);
console.log('Total leads:', arr.length);
