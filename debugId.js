const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('data.json','utf8'));
const arr = Array.isArray(raw) ? raw : (raw.results || []);
const semBairro = arr.filter(l => !l.bairro && l.url).slice(0,3);
semBairro.forEach(l => {
  const m = (l.url||'').match(/propiedades\/-?(\d+)\.html/);
  console.log('lead id:', l.id, '| url id:', m ? m[1] : 'NA', '| url:', l.url);
});

const csv = fs.readFileSync('b7.csv','utf8').split('\n').slice(1,4);
csv.forEach(linha => {
  const cols = linha.split(';');
  console.log('csv id:', cols[4], '| bairro:', cols[7]);
});
