#!/bin/bash
cd "$HOME/Downloads/matchimoveis "
echo "🔧 Corrigindo 6 falhas finais..."

node << 'JSEOF'
const fs = require('fs');

// ── FIX 1: nlp.js — adicionar todas as frases que falharam ───────────────────
let nlp = fs.readFileSync('cerebro/nlp.js','utf8');

// "importar xml" → imoveis
// "ver portais", "meu portal rejeitou" → portais
// Substituir a função detectarDominio completa com versão correta
const novaFuncao = `function detectarDominio(mNorm) {
  if (/saudacao|\\boi\\b|\\bola\\b|hello|bom dia|boa tarde|boa noite|eai|\\bei\\b/.test(mNorm)) return 'saudacao';
  if (/dashboard|resumo|relatorio|geral|panorama|tudo|minha conta/.test(mNorm))              return 'dashboard';
  if (/como funciona|como e o|o que e|o que sao|explicar|o que voce faz/.test(mNorm))        return 'sistema';
  if (/faixa|valor medio|preco medio|ticket|orcamento|tipo mais|quarto mais|bairro mais|mais buscado|demanda|mercado|tendencia|oferta|quartos mais/.test(mNorm)) return 'mercado';
  if (/portal|portais|ver portal|vivareal|\\bzap\\b|\\bolx\\b|chaves|imovelweb|feed|rejeitou|nao publicou|nao saiu portal/.test(mNorm)) return 'portais';
  if (/importar xml|subir xml|importar imovel|xml portal|gerar xml/.test(mNorm))             return 'imoveis';
  if (/lead|cliente|interessado|comprador/.test(mNorm))                                       return 'leads';
  if (/imovel|carteira|apartamento|\\bcasa\\b|cobertura|terreno|sobrado/.test(mNorm))        return 'imoveis';
  if (/visita|agenda|agendar/.test(mNorm))                                                    return 'visitas';
  if (/match|combinar|compativel/.test(mNorm))                                                return 'match';
  if (/coin|moeda|saldo|pontos/.test(mNorm))                                                  return 'coins';
  if (/notifica|alerta|aviso|sino/.test(mNorm))                                               return 'notificacoes';
  if (/ajuda|help|suporte|duvida|problema|como cadastrar|como adicionar|como subir|como inativar|como trocar|como conectar|como acessar|como confirmar|como importar/.test(mNorm)) return 'sistema';
  if (/\\bxml\\b/.test(mNorm))                                                                return 'portais';
  return null;
}`;

nlp = nlp.replace(/function detectarDominio\(mNorm\) \{[\s\S]*?\n\}/m, novaFuncao);
fs.writeFileSync('cerebro/nlp.js', nlp);
console.log('✅ nlp.js — detectarDominio reescrito');

// ── FIX 2: sistema.js — responder "como cadastrar/adicionar/conectar" ─────────
let sis = fs.readFileSync('cerebro/sistema.js','utf8');

const respostasExtra = `
  // Respostas diretas para comandos de suporte
  if (/como cadastrar imovel|cadastrar imovel|novo imovel/.test(mNorm))
    return '🏠 Acesse <a href="/app/imovel/cadastrar" style="color:#ff385c;font-weight:700">Cadastrar Imóvel →</a> e preencha: tipo, bairro, quartos, valor e pelo menos 1 foto.';
  if (/como adicionar foto|como subir foto|adicionar foto/.test(mNorm))
    return '📸 Abra o imóvel em <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a> e clique em <strong>Adicionar Fotos</strong>. Mínimo recomendado: 5 fotos (JPG ou PNG).';
  if (/como conectar whatsapp|integrar whatsapp|conectar whatsapp/.test(mNorm))
    return '📱 <strong>WhatsApp via Twilio</strong> está em desenvolvimento. Em breve você responderá clientes direto pelo chat do MatchImóveis sem sair da plataforma.';
  if (/como inativar|desativar imovel|inativar imovel/.test(mNorm))
    return '🔴 Acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a>, abra o imóvel e clique em <strong>Inativar</strong>. Ele sai do match e dos portais automaticamente.';
  if (/como importar lead|importar planilha|importar leads/.test(mNorm))
    return '📋 Acesse <a href="/app-importar-leads" style="color:#ff385c;font-weight:700">Importar Leads →</a> e envie o CSV ou Excel exportado do portal (ImovelWeb, ZAP, VivaReal, OLX).';
  if (/como trocar senha|alterar senha/.test(mNorm))
    return '🔒 Acesse <a href="/app/perfil" style="color:#ff385c;font-weight:700">Perfil →</a> e use a opção <strong>Alterar Senha</strong>.';
`;

sis = sis.replace(
  'function responder(mNorm, d, btn, chip) {',
  `function responder(mNorm, d, btn, chip) {${respostasExtra}`
);
fs.writeFileSync('cerebro/sistema.js', sis);
console.log('✅ sistema.js — respostas de suporte adicionadas');

// ── FIX 3: portais.js — responder "ver portais" e "portal rejeitou" ───────────
let port = fs.readFileSync('cerebro/portais.js','utf8');

const respostasPortal = `
  // Ver portais
  if (/ver portais|meus portais|status portal|ver portal/.test(mNorm))
    return '🔗 <strong>Seus portais:</strong><br><br>' + PORTAIS.join(' · ') + '<br><br>Veja o status dos feeds gerados:<br><br>' + btn('Ver portais','/app/portais');
  // Portal rejeitou
  if (/rejeitou|nao publicou|nao saiu|recusou|nao apareceu portal/.test(mNorm))
    return '🔧 <strong>Portal rejeitou?</strong><br><br>Verifique:<br>• Mínimo 3 fotos obrigatórias<br>• Descrição com 100+ caracteres<br>• Preço preenchido<br>• Endereço completo (bairro + cidade)<br>• Tipo do imóvel preenchido<br><br>Corrija e gere o XML novamente.<br><br>' + btn('Ver imóveis','/app/imoveis');
`;

port = port.replace(
  'function responder(mNorm, d, btn, chip) {',
  `function responder(mNorm, d, btn, chip) {${respostasPortal}`
);
fs.writeFileSync('cerebro/portais.js', port);
console.log('✅ portais.js — ver portais e portal rejeitou adicionados');

console.log('\n✅ Todos os fixes aplicados!');
JSEOF

echo ""
echo "🧪 Testando..."
node teste-automatico.js 2>&1 | grep -E "═|%|COBERTURA|❌|✅|🟡|🔴|Falha"
