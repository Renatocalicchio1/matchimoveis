const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

let port = fs.readFileSync(path.join(BASE,'cerebro','portais.js'),'utf8');

const conhecimento = `
  // PÁGINA DE PORTAIS
  if (/pagina portais|app portais|menu portais|portais xml|gerencia feeds|o que tem em portais/.test(mNorm))
    return '🔗 <strong>Portais XML (/app/portais):</strong><br><br>' +
      '"Gerencie os feeds XML por portal."<br><br>' +
      'Aqui ficam salvos os links XML gerados para cada portal:<br>' +
      '• OLX<br>• ZAP Imóveis<br>• VivaReal<br>• Chaves na Mão<br>• ImovelWeb<br>• 123i<br><br>' +
      'Copie o link e cadastre nas configurações do portal.<br><br>' +
      btn('Ver portais','/app/portais');

  // COMO FUNCIONA O FLUXO DE PORTAIS
  if (/como funciona portal|fluxo portal|como publicar portal|como enviar imovel portal/.test(mNorm))
    return '🔗 <strong>Como publicar nos portais:</strong><br><br>' +
      '<strong>Opção 1 — pelo cadastro do imóvel:</strong><br>' +
      'Ao cadastrar ou editar um imóvel, escolha os portais desejados e salve.<br><br>' +
      '<strong>Opção 2 — pela página de imóveis:</strong><br>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">1</span><span>Acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a></span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">2</span><span>Selecione todos ou escolha os imóveis desejados</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">3</span><span>Clique no portal desejado (OLX, ZAP, VivaReal...)</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">4</span><span>XML gerado — copie o link em <a href="/app/portais" style="color:#ff385c;font-weight:700">Portais →</a></span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">5</span><span>Cadastre o link nas configurações do portal</span></div>' +
      '<br>' + btn('Ver portais','/app/portais') + btn('Ver imóveis','/app/imoveis');

  // LINK DO XML
  if (/link xml|link do feed|onde fica o link|copiar link portal/.test(mNorm))
    return '🔗 O link do XML fica salvo em <strong>Portais (/app/portais)</strong> após a geração.<br><br>' +
      'Copie o link e cadastre nas configurações do portal correspondente.<br><br>' +
      btn('Ver portais','/app/portais');

  // QUAIS PORTAIS TEM
  if (/quais portais|portais disponiveis|portais suportados/.test(mNorm))
    return '🔗 <strong>Portais suportados:</strong><br><br>' +
      '• OLX<br>• ZAP Imóveis<br>• VivaReal (padrão VRSync)<br>• Chaves na Mão<br>• ImovelWeb<br>• 123i<br><br>' +
      'Todos geram XML compatível com o padrão de cada portal.<br><br>' +
      btn('Ver portais','/app/portais');
`;

if (!port.includes('pagina portais')) {
  port = port.replace(
    'function responder(mNorm, d, btn, chip) {',
    'function responder(mNorm, d, btn, chip) {' + conhecimento
  );
  fs.writeFileSync(path.join(BASE,'cerebro','portais.js'), port);
  console.log('✅ portais.js expandido');
}

// Sinônimos
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};
s['portais xml']         = 'portais';
s['menu portais']        = 'portais';
s['gerencia feeds']      = 'portais';
s['feeds xml']           = 'portais';
s['link do xml']         = 'link xml';
s['link do feed']        = 'link xml';
s['chaves na mao']       = 'chaves';
s['zap imoveis']         = 'zap';
s['123i']                = '123i';
s['imovel web']          = 'imovelweb';
s['cadastrar no portal'] = 'publicar portal';
s['enviar para portal']  = 'publicar portal';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('✅ sinônimos portais adicionados');

// Base conhecimento
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};
const novos = [
  {p:'o que tem na pagina de portais', r:'pagina_portais'},
  {p:'como funciona o fluxo de portais', r:'fluxo_portais'},
  {p:'onde fica o link do xml gerado', r:'link_xml'},
  {p:'como cadastrar o link no portal', r:'fluxo_portais'},
  {p:'quais portais o matchimoveis suporta', r:'quais_portais'},
  {p:'posso publicar em varios portais ao mesmo tempo', r:'fluxo_portais'},
  {p:'como escolher o portal pelo cadastro do imovel', r:'fluxo_portais'},
  {p:'como selecionar imoveis e gerar xml', r:'fluxo_portais'},
  {p:'o que e vrsync', r:'padrao_xml'},
];
const exist = new Set(base.items.map(i=>i.p));
let add = 0;
novos.forEach(n => { if (!exist.has(n.p)) { base.items.push(n); add++; } });
base.total = base.items.length;
fs.writeFileSync(baseP, JSON.stringify(base,null,2));
console.log(`✅ base conhecimento — ${add} novos (total: ${base.total})`);

const {execSync} = require('child_process');
execSync('node treino-cerebro.js --silent', {cwd:BASE});
const rel = JSON.parse(fs.readFileSync(path.join(BASE,'cerebro','treino-relatorio.json'),'utf8'));
console.log(`\n🧪 Treino: ${rel.cobertura}% | Não entendeu: ${rel.naoEntendeu}`);
if (rel.naoEntendidas.length) rel.naoEntendidas.forEach(n=>console.log(' -',n.pergunta));
