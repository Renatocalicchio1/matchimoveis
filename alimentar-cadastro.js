const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

let im = fs.readFileSync(path.join(BASE,'cerebro','imoveis.js'),'utf8');

const conhecimento = `
  // PÁGINA DE CADASTRO
  if (/pagina cadastro|app cadastro|cadastrar imovel pagina|o que tem no cadastro/.test(mNorm))
    return '➕ <strong>Cadastrar Imóvel (/app/cadastro):</strong><br><br>' +
      'Duas opções:<br>' +
      '• 📥 <strong>Importar via XML</strong> — importar vários imóveis de uma vez<br>' +
      '• ✏️ <strong>Cadastro manual</strong> — cadastrar um imóvel por vez<br><br>' +
      'Ideal para captações diretas ou exclusividades.<br><br>' +
      btn('Cadastrar imóvel','/app/cadastro');

  // IMPORTAR VIA XML
  if (/importar via xml|url do feed|url xml|testar xml|testar url/.test(mNorm))
    return '📥 <strong>Importar via XML:</strong><br><br>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">1</span><span>Cole a URL do feed XML ou envie o arquivo</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">2</span><span>Clique em <strong>Testar</strong> para validar</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">3</span><span>Sistema mostra quantos imóveis serão importados</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">4</span><span>Clique em <strong>Importar Agora</strong></span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">5</span><span>URL salva com data da última atualização</span></div>' +
      '<br>' + btn('Cadastrar imóvel','/app/cadastro');

  // CADASTRO MANUAL
  if (/cadastro manual|cadastrar um imovel|captacao direta|exclusividade cadastro/.test(mNorm))
    return '✏️ <strong>Cadastro manual de imóvel:</strong><br><br>' +
      'Ideal para captações diretas e exclusividades.<br><br>' +
      '<strong>Campos do cadastro:</strong><br>' +
      '• Tipo: Apartamento · Casa · Sobrado · Cobertura · Loft · Estúdio · Kitnet · Terreno · Comercial<br>' +
      '• Operação: Venda · Aluguel<br>' +
      '• Status: Publicado · Arquivado · Não publicado<br>' +
      '• Endereço: Bairro · Cidade · Estado · CEP<br>' +
      '• Valores: Preço · Condomínio · IPTU<br>' +
      '• Área: Total · Útil/Privativa<br>' +
      '• Quartos · Suítes · Banheiros · Vagas<br>' +
      '• Descrição do imóvel<br>' +
      '• Proprietário: Nome · Telefone · E-mail<br>' +
      '• Portais: OLX · ZAP · VivaReal · Chaves · ImovelWeb · 123i<br>' +
      '• Fotos: subir, definir capa, excluir<br><br>' +
      btn('Cadastrar imóvel','/app/cadastro');

  // TESTAR URL XML
  if (/testar url|testar feed|como testar xml|botao testar/.test(mNorm))
    return '🔍 <strong>Testar URL do XML:</strong><br><br>' +
      'Cole a URL do feed e clique em <strong>Testar</strong>.<br>' +
      'O sistema valida a URL e mostra quantos imóveis serão importados.<br>' +
      'Se der certo, clique em <strong>Importar Agora</strong>.<br><br>' +
      btn('Cadastrar imóvel','/app/cadastro');

  // DIFERENÇA XML VS MANUAL
  if (/diferenca xml manual|quando usar xml|quando usar manual|xml ou manual/.test(mNorm))
    return '📊 <strong>XML vs Cadastro Manual:</strong><br><br>' +
      '• 📥 <strong>XML</strong> — importa vários imóveis de uma vez via URL ou arquivo. Ideal para quem tem CRM (Tecimob, Rankim...)<br>' +
      '• ✏️ <strong>Manual</strong> — cadastra um imóvel por vez. Ideal para captações diretas ou exclusividades<br><br>' +
      btn('Cadastrar imóvel','/app/cadastro');
`;

if (!im.includes('pagina cadastro')) {
  im = im.replace(
    'function responder(mNorm, d, imoveis, btn, chip) {',
    'function responder(mNorm, d, imoveis, btn, chip) {' + conhecimento
  );
  fs.writeFileSync(path.join(BASE,'cerebro','imoveis.js'), im);
  console.log('✅ imoveis.js — cadastro expandido');
}

// Sinônimos
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};
s['url do feed']        = 'url xml';
s['feed xml']           = 'url xml';
s['importar agora']     = 'importar xml';
s['botao testar']       = 'testar xml';
s['captacao direta']    = 'cadastro manual';
s['exclusividade']      = 'cadastro manual';
s['cadastro manual']    = 'cadastro manual';
s['um imovel por vez']  = 'cadastro manual';
s['condominio']         = 'valor condominio';
s['iptu']               = 'valor iptu';
s['area util']          = 'area privativa';
s['area privativa']     = 'area privativa';
s['area total']         = 'area total';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('✅ sinônimos cadastro adicionados');

// Base conhecimento
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};
const novos = [
  {p:'o que tem na pagina de cadastro de imovel', r:'pagina_cadastro'},
  {p:'como importar via xml', r:'importar_xml'},
  {p:'como colocar a url do feed', r:'importar_xml'},
  {p:'como testar a url do xml', r:'testar_xml'},
  {p:'quantos imoveis vao ser importados', r:'testar_xml'},
  {p:'como fazer cadastro manual', r:'cadastro_manual'},
  {p:'quais campos tem no cadastro manual', r:'cadastro_manual'},
  {p:'quando usar xml e quando usar manual', r:'xml_vs_manual'},
  {p:'o que e captacao direta', r:'cadastro_manual'},
  {p:'posso cadastrar imovel de exclusividade', r:'cadastro_manual'},
  {p:'tem campo de condominio no cadastro', r:'cadastro_manual'},
  {p:'tem campo de iptu no cadastro', r:'cadastro_manual'},
  {p:'tem campo de area util', r:'cadastro_manual'},
  {p:'como escolher o portal no cadastro', r:'cadastro_manual'},
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
