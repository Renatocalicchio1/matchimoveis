const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const antigo = `'<a href="/app/portais" style="background:#ff385c;color:white;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">🔗 Abrir Portais →</a>'`;

const novo = `'<a href="' + data.url + '" target="_blank" style="background:#ff385c;color:white;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">📄 Ver XML →</a>' +
        '  <a href="/app/portais" style="background:#222;color:white;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;margin-left:8px">🔗 Portais →</a>'`;

if (ejs.includes(antigo)) {
  ejs = ejs.replace(antigo, novo);
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('ok');
} else {
  console.log('bloco nao encontrado');
}
