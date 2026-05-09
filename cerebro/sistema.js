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
  if (/primeiros passos|como comecar|por onde comecar|primeiro passo|nao sei comecar/.test(mNorm))
    return '🚀 <strong>Primeiros passos:</strong><br><br>1. Importe imóveis via XML<br>2. Importe leads da planilha<br>3. Faça o match<br>4. Envie a vitrine<br>5. Aguarde a visita<br><br>'+btn('Cadastrar imóvel','/app/cadastro')+btn('Importar leads','/app-importar-leads');

  // PÁGINA DE PERFIL
  if (/pagina perfil|app perfil|meu perfil|dados da conta|o que tem no perfil/.test(mNorm))
    return '👤 <strong>Meu Perfil (/app/perfil):</strong><br><br>' +
      '<strong>Dados da conta:</strong><br>' +
      '• Nome da conta<br>' +
      '• Celular<br>' +
      '• CRECI<br>' +
      '• CPF<br>' +
      '• Tipo de conta (Corretor · Imobiliária · Construtora)<br>' +
      '• Código do usuário (ex: R-088)<br><br>' +
      '<strong>Minha localização:</strong><br>' +
      '• Clique em <strong>Atualizar Localização</strong><br>' +
      '• O sistema detecta automaticamente onde você está<br><br>' +
      btn('Ver perfil','/app/perfil');

  // CRECI
  if (/creci|registro creci|numero creci/.test(mNorm))
    return '📋 O <strong>CRECI</strong> é o registro profissional do corretor.<br>' +
      'Fica salvo no seu perfil em <a href="/app/perfil" style="color:#ff385c;font-weight:700">Perfil →</a>';

  // CÓDIGO DO USUÁRIO
  if (/codigo usuario|id usuario|meu codigo|codigo da conta/.test(mNorm))
    return '🔑 O <strong>código do usuário</strong> é seu ID único na plataforma (ex: R-088).<br>' +
      'Aparece no menu e no perfil. Cada conta tem o seu próprio código.<br><br>' +
      btn('Ver perfil','/app/perfil');

  // LOCALIZAÇÃO
  if (/localizacao|atualizar localizacao|minha localizacao|onde estou/.test(mNorm))
    return '📍 <strong>Atualizar localização:</strong><br><br>' +
      '1. Acesse <a href="/app/perfil" style="color:#ff385c;font-weight:700">Perfil →</a><br>' +
      '2. Clique em <strong>Atualizar Localização</strong><br>' +
      '3. O sistema detecta automaticamente onde você está<br><br>' +
      'A localização é usada para personalizar resultados e demanda por região.<br><br>' +
      btn('Ver perfil','/app/perfil');

  // SALVAR PERFIL
  if (/salvar perfil|alterar dados|atualizar dados|editar perfil/.test(mNorm))
    return '💾 Para atualizar seus dados, acesse <a href="/app/perfil" style="color:#ff385c;font-weight:700">Perfil →</a>, edite as informações e clique em <strong>Salvar</strong>.';

  // DASHBOARD
  if (/dashboard|painel|painel de controle/.test(mNorm))
    return '📊 <strong>Dashboard — o que tem:</strong><br><br>' +
      '🏠 <strong>Imóveis na carteira</strong> — total cadastrado<br>' +
      '🎯 <strong>Matches gerados</strong> — total e por lead<br>' +
      '👥 <strong>Total de leads</strong><br>' +
      '📊 <strong>Taxa de match</strong> — % de leads com match<br>' +
      '📅 <strong>Visitas agendadas</strong><br>' +
      '📋 <strong>Atividades recentes</strong><br>' +
      '📈 Gráficos: imóveis por tipo, por bairro, leads por bairro, visitas por estado<br><br>' +
      btn('Ir para dashboard','/app-home');

  // MENU
  if (/menu|navegacao|onde encontro|onde fica|onde acho/.test(mNorm))
    return '📋 <strong>Menu da plataforma:</strong><br><br>' +
      '• 📊 Dashboard<br>' +
      '• 🏠 Meus Imóveis<br>' +
      '• 👥 Leads<br>' +
      '• 📅 Visitas<br>' +
      '• 🔔 Notificações<br>' +
      '• ➕ Cadastrar Imóveis<br>' +
      '• 🔗 Portais<br>' +
      '• 👤 Perfil<br>' +
      '• 🪙 MatchCoins<br>' +
      '• 🤖 Assistente<br><br>' +
      'Cada usuário tem ID único (ex: R-088) e vê apenas seus próprios dados.';

  // TIPOS DE IMÓVEL
  if (/tipos de imovel|tipos imovel|quais tipos|tipo de imovel/.test(mNorm))
    return '🏠 <strong>Tipos de imóvel disponíveis:</strong><br><br>' +
      'Apartamento · Sobrado · Estúdio · Casa · Comercial · Residencial · Outros<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // TIPOS DE CONTA
  if (/tipo de conta|tipo conta|corretor|construtor|proprietario conta/.test(mNorm))
    return '👤 <strong>Tipos de conta:</strong><br><br>' +
      '• Corretor imobiliário<br>' +
      '• Construtor<br>' +
      '• Proprietário<br><br>' +
      'Cada conta tem ID único e armazena apenas seus próprios imóveis, leads e visitas.';

  // MATCHCOINS
  if (/matchcoin|match coin|coin/.test(mNorm))
    return '🪙 <strong>MatchCoins</strong> — sistema de recompensas.<br><br>' +
      'Ganhe coins a cada match realizado. Futuramente usados para recursos premium.<br><br>' +
      btn('Ver MatchCoins','/app/coins');

  // TAXA DE MATCH
  if (/taxa de match|taxa match|percentual match/.test(mNorm)) {
    return '📊 <strong>Taxa de match</strong> = quantidade de leads que receberam match ÷ total de leads × 100%<br><br>' +
      'Exemplo: 41 matches em 87 leads = 47% de taxa.<br><br>' +
      chip('Ver meu match','ver match');
  }

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
