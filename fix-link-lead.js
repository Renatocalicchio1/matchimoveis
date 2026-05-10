const fs = require('fs');
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

ejs = ejs.replace(
  '<br><a href="/app/lead" style="background:#ff385c;color:white;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">Ver leads →</a>',
  '<br><a href="/app/lead/' + "' + data.lead.id + '" + '" style="background:#ff385c;color:white;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">Ver lead →</a>'
);

fs.writeFileSync('views/app-assistente.ejs', ejs);
console.log('ok');
