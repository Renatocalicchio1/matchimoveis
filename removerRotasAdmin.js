const fs = require('fs');
const lines = fs.readFileSync('server.js', 'utf8').split('\n');

const remover = [
  [374, 413],
  [415, 440],
  [463, 529],
  [552, 618],
  [723, 748],
  [1014, 1047]
];

const removidas = new Set();
remover.forEach(function(r) {
  for (var i = r[0]-1; i < r[1]; i++) removidas.add(i);
});

const novo = lines.filter(function(_, i) { return !removidas.has(i); });
fs.writeFileSync('server.js', novo.join('\n'));
console.log('Linhas removidas:', removidas.size);
console.log('Linhas restantes:', novo.length);
