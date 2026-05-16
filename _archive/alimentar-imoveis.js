const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// ── 1. Expandir imoveis.js com conhecimento real da página ───────────────────
let im = fs.readFileSync(path.join(BASE,'cerebro','imoveis.js'),'utf8');

const conhecimento = `
  // PÁGINA DE IMÓVEIS — o que tem
  if (/o que tem na pagina imoveis|pagina imoveis|meus imoveis pagina|app imoveis/.test(mNorm))
    return '🏠 <strong>Página Meus Imóveis (/app/imoveis):</strong><br><br>' +
      '• Quantidade de imóveis indexados<br>' +
      '• Seleção em massa + geração de XML por portal<br>' +
      '• Filtros: tipo, bairro, cidade, estado, valor min/max, área, quartos, vagas, suítes, banheiros, operação, status, proprietário, fotos<br>' +
      '• Cards com: ID externo, valor, região, proprietário, metragem<br>' +
      '• Botões: Ver imóvel, Editar<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // FILTROS DA PÁGINA
  if (/filtros imoveis|filtrar imoveis|como filtrar/.test(mNorm))
    return '🔍 <strong>Filtros disponíveis em Imóveis:</strong><br><br>' +
      'Tipo · Bairro · Cidade · Estado · Valor mín/máx · Área · Quartos · Vagas · Suítes · Banheiros · Operação (venda/aluguel) · Status (ativo/inativo) · Proprietário · Fotos<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // GERAR XML / PORTAIS
  if (/selecionar todos|checkboxes|selecionar imoveis/.test(mNorm))
    return '☑️ Na página de imóveis, clique em <strong>Selecionar Todos</strong> para marcar todos os imóveis.<br><br>' +
      'Depois escolha o portal para gerar o XML:<br>' +
      '• VivaReal (padrão VR 5)<br>• ZAP Imóveis<br>• OLX<br>• Chaves na Mão<br>• ImovelWeb<br>• 123i<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // TIPOS DE IMÓVEL COMPLETOS
  if (/tipos de imovel|quais tipos|tipo imovel/.test(mNorm))
    return '🏠 <strong>Tipos de imóvel:</strong><br><br>' +
      'Apartamento · Casa · Sobrado · Cobertura · Loft · Estúdio · Kitnet · Terreno · Comercial<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // OPERAÇÕES
  if (/operacao|tipo operacao|venda|aluguel/.test(mNorm))
    return '🔄 <strong>Tipos de operação:</strong><br><br>' +
      '• <strong>Venda</strong> — imóvel à venda<br>' +
      '• <strong>Aluguel</strong> — imóvel para locação<br><br>' +
      'Filtre por operação na página de imóveis.' + btn('Ver imóveis','/app/imoveis');

  // EDITAR IMÓVEL
  if (/editar imovel|como editar|campos do imovel|o que tem no cadastro/.test(mNorm))
    return '✏️ <strong>Editar imóvel — campos disponíveis:</strong><br><br>' +
      'Tipo · Bairro · Cidade · Estado · Valor · Área · Quartos · Suítes · Banheiros · Vagas · Descrição<br>' +
      'Proprietário: nome, telefone, e-mail<br>' +
      'Status: Publicado · Arquivado · Não publicado<br>' +
      'Portais: OLX · ZAP · VivaReal · Chaves · ImovelWeb · 123i<br>' +
      'Fotos: subir, definir capa, excluir<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // STATUS DO IMÓVEL
  if (/status imovel|publicado|arquivado|nao publicado/.test(mNorm))
    return '📋 <strong>Status do imóvel:</strong><br><br>' +
      '• <strong>Publicado</strong> — ativo, aparece no match e nos portais<br>' +
      '• <strong>Arquivado</strong> — inativo, não aparece no match nem nos portais<br>' +
      '• <strong>Não publicado</strong> — cadastrado mas não publicado ainda<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // FOTOS
  if (/fotos imovel|subir foto|capa imovel|excluir foto/.test(mNorm))
    return '📸 <strong>Gerenciar fotos do imóvel:</strong><br><br>' +
      '• Subir fotos (JPG, PNG)<br>' +
      '• Definir foto de capa<br>' +
      '• Excluir fotos<br><br>' +
      'Acesse o imóvel e clique em <strong>Editar</strong>.' + btn('Ver imóveis','/app/imoveis');

  // CARD DO IMÓVEL
  if (/card imovel|o que aparece no card|informacoes imovel/.test(mNorm))
    return '📋 <strong>Card do imóvel mostra:</strong><br><br>' +
      '• ID externo (do sistema de origem)<br>' +
      '• Valor<br>' +
      '• Região/Bairro<br>' +
      '• Nome do proprietário<br>' +
      '• Metragem (m²)<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // PADRÃO XML VR5
  if (/vr5|vr 5|padrao xml|padrao viva real/.test(mNorm))
    return '🔗 O MatchImóveis gera XML no <strong>padrão VR 5</strong> do VivaReal, compatível com todos os principais portais brasileiros.<br><br>' +
      btn('Ver portais','/app/portais');
`;

if (!im.includes('pagina imoveis')) {
  im = im.replace(
    'function responder(mNorm, d, imoveis, btn, chip) {',
    'function responder(mNorm, d, imoveis, btn, chip) {' + conhecimento
  );
  fs.writeFileSync(path.join(BASE,'cerebro','imoveis.js'), im);
  console.log('✅ imoveis.js expandido com conhecimento real da página');
}

// ── 2. Expandir sinônimos ─────────────────────────────────────────────────────
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};
s['meus imoveis'] = 'imoveis';
s['app imoveis']  = 'imoveis';
s['vr5']          = 'xml vivareal';
s['vr 5']         = 'xml vivareal';
s['chaves na mao']= 'chaves';
s['zap imoveis']  = 'zap';
s['olx']          = 'olx';
s['imovelweb']    = 'imovelweb';
s['selecionar todos'] = 'selecionar imoveis';
s['checkboxes']   = 'selecionar imoveis';
s['arquivado']    = 'inativo';
s['nao publicado']= 'inativo';
s['publicado']    = 'ativo';
s['metragem']     = 'area';
s['m2']           = 'area';
s['metros quadrados'] = 'area';
s['kitnet']       = 'imovel';
s['loft']         = 'imovel';
s['cobertura']    = 'imovel';
s['operacao']     = 'tipo operacao';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('✅ sinônimos expandidos');

// ── 3. Adicionar à base de conhecimento ───────────────────────────────────────
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};
const novos = [
  {p:'o que tem na pagina de imoveis', r:'pagina_imoveis'},
  {p:'como filtrar imoveis', r:'filtros_imoveis'},
  {p:'como selecionar todos imoveis', r:'selecionar_imoveis'},
  {p:'como editar um imovel', r:'editar_imovel'},
  {p:'quais campos tem no cadastro do imovel', r:'editar_imovel'},
  {p:'o que significa publicado', r:'status_imovel'},
  {p:'o que significa arquivado', r:'status_imovel'},
  {p:'como subir fotos do imovel', r:'fotos_imovel'},
  {p:'como definir capa do imovel', r:'fotos_imovel'},
  {p:'o que aparece no card do imovel', r:'card_imovel'},
  {p:'o que e vr5', r:'padrao_xml'},
  {p:'quais portais posso publicar', r:'portais'},
  {p:'posso publicar no zap e vivareal ao mesmo tempo', r:'portais'},
  {p:'como escolher o portal para publicar', r:'portais'},
  {p:'o imovel pode ser venda e aluguel', r:'operacao'},
  {p:'como filtrar por proprietario', r:'filtros_imoveis'},
  {p:'como ver imoveis sem foto', r:'filtros_imoveis'},
];
const exist = new Set(base.items.map(i=>i.p));
let add = 0;
novos.forEach(n => { if (!exist.has(n.p)) { base.items.push(n); add++; } });
base.total = base.items.length;
fs.writeFileSync(baseP, JSON.stringify(base,null,2));
console.log(`✅ base conhecimento — ${add} novos itens (total: ${base.total})`);

// ── 4. Validar ────────────────────────────────────────────────────────────────
const {execSync} = require('child_process');
const rel = JSON.parse(execSync('node treino-cerebro.js --silent && cat cerebro/treino-relatorio.json', {cwd:BASE}).toString().split('\n').slice(1).join('\n')||'{}');
console.log(`\n✅ Conhecimento de imóveis alimentado com sucesso!`);
console.log(`   Base de conhecimento: ${base.total} itens`);
console.log(`   Sinônimos: ${Object.keys(s).length} entradas`);
