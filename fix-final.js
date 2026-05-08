const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, 'cerebro');

// ── Fix suporte.js ─────────────────────────────────────────────────────────────
let sup = fs.readFileSync(path.join(BASE,'suporte.js'),'utf8');
sup = sup.replace(
  /const isDuvida[\s\S]*?\.test\(mNorm\);/m,
  `const isDuvida = (
    /nao funciona|nao atualizou|nao apareceu|nao saiu|nao consigo/.test(mNorm) ||
    /como cadastrar imovel|como adicionar foto|como subir foto/.test(mNorm) ||
    /como inativar|como trocar senha|como importar lead/.test(mNorm) ||
    /como conectar whatsapp|como acessar celular/.test(mNorm) ||
    /como confirmar visita|como publicar portal|como gerar xml/.test(mNorm) ||
    /xml nao|portal rejeit/.test(mNorm)
  ) && !/como funciona|como e o/.test(mNorm);`
);
fs.writeFileSync(path.join(BASE,'suporte.js'), sup);
console.log('✅ suporte.js');

// ── Fix nlp.js ─────────────────────────────────────────────────────────────────
let nlp = fs.readFileSync(path.join(BASE,'nlp.js'),'utf8');
const novaFunc = `function detectarDominio(mNorm) {
  if (/saudacao|\\boi\\b|\\bola\\b|hello|bom dia|boa tarde|boa noite|eai/.test(mNorm)) return 'saudacao';
  if (/dashboard|resumo|relatorio|geral|panorama/.test(mNorm))                         return 'dashboard';
  if (/como funciona|o que e|o que sao|explicar|o que voce faz/.test(mNorm))           return 'sistema';
  if (/faixa|valor medio|ticket|orcamento|tipo mais|quarto mais|bairro mais|mais buscado|demanda|mercado|oferta|quartos mais/.test(mNorm)) return 'mercado';
  if (/ver portal|portais|vivareal|\\bzap\\b|\\bolx\\b|chaves|imovelweb|feed|rejeitou|nao publicou/.test(mNorm)) return 'portais';
  if (/importar xml|subir xml|gerar xml|\\bxml\\b/.test(mNorm))                        return 'portais';
  if (/lead|cliente|interessado|comprador/.test(mNorm))                                 return 'leads';
  if (/imovel|carteira|apartamento|\\bcasa\\b|cobertura|terreno|sobrado/.test(mNorm))  return 'imoveis';
  if (/visita|agenda|agendar/.test(mNorm))                                              return 'visitas';
  if (/match|combinar|compativel/.test(mNorm))                                          return 'match';
  if (/coin|moeda|saldo/.test(mNorm))                                                   return 'coins';
  if (/notifica|alerta|aviso/.test(mNorm))                                              return 'notificacoes';
  if (/ajuda|help|suporte|duvida|como cadastrar|como adicionar|como inativar|como trocar|como conectar|como importar|como confirmar|como agendar/.test(mNorm)) return 'sistema';
  return null;
}`;
nlp = nlp.replace(/function detectarDominio\(mNorm\) \{[\s\S]*?\n\}/m, novaFunc);
fs.writeFileSync(path.join(BASE,'nlp.js'), nlp);
console.log('✅ nlp.js');

// ── Fix sistema.js ─────────────────────────────────────────────────────────────
let sis = fs.readFileSync(path.join(BASE,'sistema.js'),'utf8');
if (!sis.includes('como cadastrar imovel')) {
  const ins = `
  if (/como cadastrar imovel|cadastrar imovel|novo imovel/.test(mNorm))
    return '🏠 Acesse <a href="/app/imovel/cadastrar" style="color:#ff385c;font-weight:700">Cadastrar Imóvel →</a> e preencha: tipo, bairro, quartos, valor e ao menos 1 foto.';
  if (/como adicionar foto|como subir foto|adicionar foto/.test(mNorm))
    return '📸 Abra o imóvel em <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a> e clique em <strong>Adicionar Fotos</strong>. Mínimo: 5 fotos.';
  if (/como conectar whatsapp|integrar whatsapp|conectar whatsapp/.test(mNorm))
    return '📱 <strong>WhatsApp via Twilio</strong> está em desenvolvimento. Em breve você responderá clientes direto pelo chat.';
  if (/como inativar imovel|desativar imovel|inativar imovel/.test(mNorm))
    return '🔴 Acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a>, abra o imóvel e clique em <strong>Inativar</strong>.';
  if (/como importar lead|importar planilha|importar leads/.test(mNorm))
    return '📋 Acesse <a href="/app-importar-leads" style="color:#ff385c;font-weight:700">Importar Leads →</a> e envie o CSV ou Excel do portal.';
  if (/como trocar senha|alterar senha/.test(mNorm))
    return '🔒 Acesse <a href="/app/perfil" style="color:#ff385c;font-weight:700">Perfil →</a> e use <strong>Alterar Senha</strong>.';
`;
  sis = sis.replace('function responder(mNorm, d, btn, chip) {', 'function responder(mNorm, d, btn, chip) {' + ins);
  fs.writeFileSync(path.join(BASE,'sistema.js'), sis);
}
console.log('✅ sistema.js');

// ── Fix portais.js ─────────────────────────────────────────────────────────────
let port = fs.readFileSync(path.join(BASE,'portais.js'),'utf8');
if (!port.includes('ver portais')) {
  const ins = `
  if (/ver portais|meus portais|status portal|ver portal/.test(mNorm))
    return '🔗 <strong>Seus portais:</strong><br><br>' + PORTAIS.join(' · ') + '<br><br>' + btn('Ver portais','/app/portais') + btn('Gerar XML','/app/imoveis');
  if (/rejeitou|nao publicou|nao saiu|recusou/.test(mNorm))
    return '🔧 <strong>Portal rejeitou?</strong><br><br>• Mínimo 3 fotos<br>• Descrição 100+ chars<br>• Preço preenchido<br>• Endereço completo<br>• Tipo preenchido<br><br>Corrija e gere o XML novamente.<br><br>' + btn('Ver imóveis','/app/imoveis');
`;
  port = port.replace('function responder(mNorm, d, btn, chip) {', 'function responder(mNorm, d, btn, chip) {' + ins);
  fs.writeFileSync(path.join(BASE,'portais.js'), port);
}
console.log('✅ portais.js');

console.log('\n✅ Tudo corrigido! Rodando teste...\n');
require('./teste-automatico.js');
