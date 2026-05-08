'use strict';

const EXPLICACOES = {
  match:        'Match é quando um imóvel da sua carteira combina com o que um lead procura. O sistema cruza bairro + tipo + quartos automaticamente.',
  vitrine:      'Vitrine é uma página exclusiva enviada ao lead com os imóveis em match. O lead escolhe e solicita visita — tudo automático!',
  score:        'Score define a ordem na vitrine: valor abaixo do máximo +50pts, área maior +30pts, quartos extras +20pts, suítes +15pts, vagas +15pts.',
  lead:         'Lead é um cliente interessado em comprar ou alugar. Você importa planilhas dos portais e o sistema faz o match automático.',
  xml:          'XML é o arquivo que envia seus imóveis para portais (VivaReal, ZAP, OLX). Gere aqui e cadastre o link no portal.',
  coins:        'Match Coins são pontos ganhos a cada match realizado. Futuramente usados para recursos premium.',
  visita:       'Fluxo: Lead recebe vitrine → escolhe imóvel → solicita visita → proprietário confirma/recusa → lead notificado. Tudo automático!',
  proprietario: 'Proprietário é o dono do imóvel. Vincule via Excel (padrão Tecimob) para que ele receba notificações de visitas.',
  extracao:     'Extração é o processo que lê a planilha do portal e identifica automaticamente bairro, tipo, quartos, valor e mais.',
  rag:          'RAG significa que o assistente busca nos seus dados reais antes de responder — nunca inventa informações.',
  cerebro:      'O cérebro é o sistema de IA local do MatchImóveis. Tem 16 módulos especializados que trabalham juntos para responder qualquer dúvida.',
};

const AJUDA = [
  {emoji:'👥', label:'Leads',        msg:'minhas leads'},
  {emoji:'🏠', label:'Imóveis',      msg:'meus imoveis'},
  {emoji:'📅', label:'Visitas',      msg:'minhas visitas'},
  {emoji:'🎯', label:'Match',        msg:'ver match'},
  {emoji:'🔗', label:'Portais',      msg:'ver portais'},
  {emoji:'🪙', label:'Coins',        msg:'meus coins'},
  {emoji:'🔔', label:'Notificações', msg:'minhas notificacoes'},
  {emoji:'📊', label:'Resumo',       msg:'resumo geral'},
  {emoji:'🧠', label:'Plano do dia', msg:'o que devo fazer hoje'},
  {emoji:'📈', label:'Relatório',    msg:'relatorio semanal'},
  {emoji:'📍', label:'Demanda',      msg:'demanda por bairro'},
  {emoji:'🚀', label:'Onboarding',   msg:'primeiros passos'},
];

function responder(mNorm, d, btn, chip) {
  // Respostas diretas para comandos de suporte
  if (/como cadastro imovel|cadastrar imovel|novo imovel|cadastro imovel/.test(mNorm))
    return '🏠 Acesse <a href="/app/imovel/cadastrar" style="color:#ff385c;font-weight:700">Cadastrar Imóvel →</a> e preencha: tipo, bairro, quartos, valor e pelo menos 1 foto.';
  if (/como cadastro foto|adicionar foto|subir foto|como adiciono foto/.test(mNorm))
    return '📸 Abra o imóvel em <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a> e clique em <strong>Adicionar Fotos</strong>. Mínimo recomendado: 5 fotos (JPG ou PNG).';
  if (/como conectar whatsapp|integrar whatsapp|conectar whatsapp/.test(mNorm))
    return '📱 <strong>WhatsApp via Twilio</strong> está em desenvolvimento. Em breve você responderá clientes direto pelo chat do MatchImóveis sem sair da plataforma.';
  if (/como inativar|desativar imovel|inativar imovel/.test(mNorm))
    return '🔴 Acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a>, abra o imóvel e clique em <strong>Inativar</strong>. Ele sai do match e dos portais automaticamente.';
  if (/como importar lead|importar planilha|importar leads/.test(mNorm))
    return '📋 Acesse <a href="/app-importar-leads" style="color:#ff385c;font-weight:700">Importar Leads →</a> e envie o CSV ou Excel exportado do portal (ImovelWeb, ZAP, VivaReal, OLX).';
  if (/como trocar senha|alterar senha/.test(mNorm))
    return '🔒 Acesse <a href="/app/perfil" style="color:#ff385c;font-weight:700">Perfil →</a> e use a opção <strong>Alterar Senha</strong>.';

  // Explicações específicas
  // Alias para 'como funciona'
  if (/como funciona o match|como funciona match/.test(mNorm)) {
    return '🎯 <strong>Como funciona o Match:</strong><br><br>O sistema cruza automaticamente bairro + tipo + quartos da lead com seus imóveis.<br><br>Score na vitrine: valor abaixo do máx +50pts · área maior +30pts · quartos extras +20pts · suítes +15pts · vagas +15pts<br><br>' + chip('Ver leads com match', 'leads com match');
  }
  for (const [key, texto] of Object.entries(EXPLICACOES)) {
    if (mNorm.includes(key))
      return `💡 <strong>${key.charAt(0).toUpperCase()+key.slice(1)}</strong><br><br>${texto}<br><br>${chip('❓ Mais ajuda','ajuda')}`;
  }
  // Ajuda geral
  return `🤖 <strong>Sou o Match — seu assistente imobiliário.</strong><br><br>Posso te ajudar com:<br><br>`+
    AJUDA.map(i=>`<button onclick="enviarMsg('${i.msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${i.emoji} ${i.label}</button>`).join('');
}

module.exports = { EXPLICACOES, responder };
