const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

let sup = fs.readFileSync(path.join(BASE,'cerebro','suporte.js'),'utf8');

if (!sup.includes('fonte de verdade')) {
  const faq = `FAQ.push({
  chave:/como portal acessa imoveis|como portal le imoveis|como integrar portal|basta ler xml|xml e suficiente|xml da conta|portal le xml/,
  resposta:'📡 <strong>Como o portal acessa seus imóveis:</strong><br><br>O portal só precisa ler o link do XML da sua conta.<br><br>O XML contém <strong>todos os imóveis selecionados</strong> — é a fonte de verdade.<br><br>Fluxo:<br>1. Gere o XML em <a href=\"/app/imoveis\" style=\"color:#ff385c;font-weight:700\">Meus Imóveis →</a><br>2. Copie o link em <a href=\"/app/portais\" style=\"color:#ff385c;font-weight:700\">Portais →</a><br>3. Cole nas configurações do portal<br>4. O portal lê e publica automaticamente todos os imóveis<br><br>Ao atualizar e gerar novo XML, o portal se atualiza.'
});\n`;
  sup = sup.replace('module.exports', faq + 'module.exports');
  fs.writeFileSync(path.join(BASE,'cerebro','suporte.js'), sup);
  console.log('ok suporte.js');
}

// Sinônimos
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = JSON.parse(fs.readFileSync(sPath,'utf8'));
s['basta ler xml']            = 'como portal acessa imoveis';
s['xml e suficiente']         = 'como portal acessa imoveis';
s['portal le xml']            = 'como portal acessa imoveis';
s['como portal ve imoveis']   = 'como portal acessa imoveis';
s['todos imoveis no xml']     = 'xml contem todos imoveis';
s['xml tem todos os imoveis'] = 'xml contem todos imoveis';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('ok sinonimos');
console.log('feito');
