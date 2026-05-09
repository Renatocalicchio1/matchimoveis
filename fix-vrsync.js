const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js','utf8');

// Reforçar aviso VRSync na importação
ctx = ctx.replace(
  "'\u26A0\uFE0F <strong>Padr\u00e3o obrigat\u00f3rio: VRSync (VivaReal)</strong><br>'",
  "'\u26A0\uFE0F <strong>Padr\u00e3o obrigat\u00f3rio: VRSync do VivaReal</strong><br>'"
);

// Adicionar aviso VRSync na exportação também
ctx = ctx.replace(
  "'<br>' + btn('Im\\u00f3veis', '/app/imoveis') + btn('Portais', '/app/portais');",
  "'<br>\uD83D\uDCA1 <strong>Padr\u00e3o VRSync:</strong> O feed exportado segue o padr\u00e3o VRSync do VivaReal, compat\u00edvel com todos os portais parceiros.<br><br>' + btn('Im\u00f3veis', '/app/imoveis') + btn('Portais', '/app/portais');"
);

fs.writeFileSync('cerebro/contexto.js', ctx);
console.log('1. contexto.js — aviso VRSync reforçado');

// Adicionar no navegador.js — descrição dos fluxos
let nav = fs.readFileSync('cerebro/navegador.js','utf8');
nav = nav.replace(
  "passos:['Va em Cadastrar Imovel /app/cadastro','Cole a URL do feed XML ou faca upload do arquivo .xml','Clique em Testar para validar','Clique em Importar Agora — os imoveis aparecem em Meus Imoveis']",
  "passos:['Va em Cadastrar Imovel /app/cadastro','Cole a URL do feed XML no padrao VRSync (VivaReal) — Tecimob, Rankim, Vista ja exportam nesse padrao','Clique em Testar para validar a URL','Clique em Importar Agora — os imoveis aparecem em Meus Imoveis com ID interno MI-xxx']"
);
nav = nav.replace(
  "passos:['Va em Meus Imoveis /app/imoveis','Selecione os imoveis com os checkboxes','Na barra inferior escolha o portal (VivaReal, ZAP, OLX...)','Clique em Gerar XML','O link do feed aparece em Portais /app/portais','Copie a URL e envie ao portal']",
  "passos:['Va em Meus Imoveis /app/imoveis','Selecione os imoveis com os checkboxes','Na barra inferior escolha o portal (VivaReal, ZAP, OLX...)','Clique em Gerar XML — exportado no padrao VRSync','O link do feed aparece em Portais /app/portais','Copie a URL e cadastre no portal parceiro']"
);
fs.writeFileSync('cerebro/navegador.js', nav);
console.log('2. navegador.js — VRSync nos fluxos');

// Adicionar sinonimo no nlp
let sinonimos = JSON.parse(fs.readFileSync('cerebro/sinonimos-aprendidos.json','utf8'));
sinonimos['vrsync'] = 'padrao xml vivareal';
sinonimos['vr sync'] = 'padrao xml vivareal';
sinonimos['padrao xml'] = 'padrao vrsync vivareal';
sinonimos['formato xml'] = 'padrao vrsync vivareal';
fs.writeFileSync('cerebro/sinonimos-aprendidos.json', JSON.stringify(sinonimos, null, 2));
console.log('3. sinonimos — VRSync adicionado');
