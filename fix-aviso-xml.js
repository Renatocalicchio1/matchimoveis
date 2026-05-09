const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js','utf8');

const antigoAviso = `    return '\uD83D\uDCE5 <strong>Importar im\u00f3veis via XML:</strong><br><br>' +
      'Para importar, preciso da URL do feed XML do seu CRM.<br>' +
      'Exemplos: Tecimob, Rankim, Vista, Jetimob...<br><br>' +
      '\uD83D\uDCA1 Cole a URL aqui no chat ou acesse a p\u00e1gina de cadastro:<br><br>' +
      btn('Importar XML', '/app/cadastro') +
      chip('Como importo', 'como importar xml');`;

const novoAviso = `    return '\uD83D\uDCE5 <strong>Importar im\u00f3veis via XML:</strong><br><br>' +
      '\u26A0\uFE0F <strong>Padr\u00e3o obrigat\u00f3rio: VRSync (VivaReal)</strong><br>' +
      'O sistema aceita apenas feeds no padr\u00e3o VRSync do VivaReal.<br>' +
      'A maioria dos CRMs j\u00e1 exporta nesse formato: Tecimob, Rankim, Vista, Jetimob, Kenlo.<br><br>' +
      '\uD83D\uDCA1 Cole a URL do feed aqui no chat ou acesse a p\u00e1gina de cadastro:<br><br>' +
      '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400e;margin:8px 0">' +
      '\uD83D\uDCCB Exemplo de URL v\u00e1lida:<br><code>https://seucrm.com.br/feed-vivareal.xml</code></div>' +
      '<br>' + btn('Importar XML', '/app/cadastro') + chip('Como importo', 'como importar xml');`;

if (ctx.includes(antigoAviso)) {
  ctx = ctx.replace(antigoAviso, novoAviso);
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('ok');
} else {
  console.log('bloco nao encontrado — verifique');
}
const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js','utf8');

const antigoAviso = `    return '\uD83D\uDCE5 <strong>Importar im\u00f3veis via XML:</strong><br><br>' +
      'Para importar, preciso da URL do feed XML do seu CRM.<br>' +
      'Exemplos: Tecimob, Rankim, Vista, Jetimob...<br><br>' +
      '\uD83D\uDCA1 Cole a URL aqui no chat ou acesse a p\u00e1gina de cadastro:<br><br>' +
      btn('Importar XML', '/app/cadastro') +
      chip('Como importo', 'como importar xml');`;

const novoAviso = `    return '\uD83D\uDCE5 <strong>Importar im\u00f3veis via XML:</strong><br><br>' +
      '\u26A0\uFE0F <strong>Padr\u00e3o obrigat\u00f3rio: VRSync (VivaReal)</strong><br>' +
      'O sistema aceita apenas feeds no padr\u00e3o VRSync do VivaReal.<br>' +
      'A maioria dos CRMs j\u00e1 exporta nesse formato: Tecimob, Rankim, Vista, Jetimob, Kenlo.<br><br>' +
      '\uD83D\uDCA1 Cole a URL do feed aqui no chat ou acesse a p\u00e1gina de cadastro:<br><br>' +
      '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400e;margin:8px 0">' +
      '\uD83D\uDCCB Exemplo de URL v\u00e1lida:<br><code>https://seucrm.com.br/feed-vivareal.xml</code></div>' +
      '<br>' + btn('Importar XML', '/app/cadastro') + chip('Como importo', 'como importar xml');`;

if (ctx.includes(antigoAviso)) {
  ctx = ctx.replace(antigoAviso, novoAviso);
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('ok');
} else {
  console.log('bloco nao encontrado — verifique');
}
const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js','utf8');

const antigoAviso = `    return '\uD83D\uDCE5 <strong>Importar im\u00f3veis via XML:</strong><br><br>' +
      'Para importar, preciso da URL do feed XML do seu CRM.<br>' +
      'Exemplos: Tecimob, Rankim, Vista, Jetimob...<br><br>' +
      '\uD83D\uDCA1 Cole a URL aqui no chat ou acesse a p\u00e1gina de cadastro:<br><br>' +
      btn('Importar XML', '/app/cadastro') +
      chip('Como importo', 'como importar xml');`;

const novoAviso = `    return '\uD83D\uDCE5 <strong>Importar im\u00f3veis via XML:</strong><br><br>' +
      '\u26A0\uFE0F <strong>Padr\u00e3o obrigat\u00f3rio: VRSync (VivaReal)</strong><br>' +
      'O sistema aceita apenas feeds no padr\u00e3o VRSync do VivaReal.<br>' +
      'A maioria dos CRMs j\u00e1 exporta nesse formato: Tecimob, Rankim, Vista, Jetimob, Kenlo.<br><br>' +
      '\uD83D\uDCA1 Cole a URL do feed aqui no chat ou acesse a p\u00e1gina de cadastro:<br><br>' +
      '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400e;margin:8px 0">' +
      '\uD83D\uDCCB Exemplo de URL v\u00e1lida:<br><code>https://seucrm.com.br/feed-vivareal.xml</code></div>' +
      '<br>' + btn('Importar XML', '/app/cadastro') + chip('Como importo', 'como importar xml');`;

if (ctx.includes(antigoAviso)) {
  ctx = ctx.replace(antigoAviso, novoAviso);
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('ok');
} else {
  console.log('bloco nao encontrado — verifique');
}
