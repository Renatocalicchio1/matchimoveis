const fs = require('fs');
let ejs = fs.readFileSync('views/app-imoveis.ejs','utf8');

ejs = ejs.replace(
  '<span style="font-size:11px;color:#999">Ext: <%= item.idExterno || \'-\' %></span>',
  '<span style="font-size:11px;color:#999"><strong style="color:#ff385c"><%= item.id || \'-\' %></strong> · Ext: <%= item.idExterno || \'-\' %></span>'
);

fs.writeFileSync('views/app-imoveis.ejs', ejs);
console.log('ok');
