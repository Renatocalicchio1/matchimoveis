'use strict';
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname);

console.log('🧠 Gerando assistente-mapa.json...');

// ── ROTAS DO SISTEMA ──────────────────────────────────────────────────────────
const rotas = [
  { rota:'/app-home',            label:'Dashboard',              descricao:'Painel principal com métricas, gráficos e resumo geral' },
  { rota:'/app/imoveis',         label:'Meus Imóveis',           descricao:'Lista de imóveis cadastrados com filtros e busca' },
  { rota:'/app/cadastro',        label:'Cadastrar Imóvel',       descricao:'Formulário manual ou importar via XML (com botão Testar antes de Importar)' },
  { rota:'/app/imovel/:id/editar', label:'Editar Imóvel',        descricao:'Editar dados, fotos e portais de um imóvel' },
  { rota:'/app/leads',           label:'Leads',                  descricao:'Kanban de leads com filtros por status, match e temperatura' },
  { rota:'/app/leads/planilha',  label:'Planilha de Leads',      descricao:'Leads em formato de tabela com filtros por origem/status/data e exportação Excel' },
  { rota:'/app/lead/:id',        label:'Detalhe da Lead',        descricao:'Página completa da lead com perfil IA, match, visitas e histórico' },
  { rota:'/app/importar-leads',  label:'Importar Leads',         descricao:'Importar leads via planilha Excel dos portais' },
  { rota:'/app/captacao',        label:'Captação',               descricao:'Leads que indicaram ter imóvel próprio para anunciar, vindas do link público de captação' },
  { rota:'/app/visitas',         label:'Visitas',                descricao:'Kanban de visitas com colunas por status' },
  { rota:'/app/visitas-kanban',  label:'Visitas Kanban',         descricao:'Visão kanban completa das visitas' },
  { rota:'/app/mapa',            label:'Mapa',                   descricao:'Mapa com imóveis e visitas georreferenciados' },
  { rota:'/app/feed',            label:'Feed',                   descricao:'Feed de imóveis intercalados por corretor' },
  { rota:'/app/portais',         label:'Portais',                descricao:'Ativar portais (ZAP, VivaReal, OLX, Chaves na Mão, 123i, ImovelWeb) e gerar XML' },
  { rota:'/app/perfil',          label:'Perfil',                 descricao:'Dados da conta: nome, celular, CRECI, CPF, código do usuário, WhatsApp, QuintoAndar' },
  { rota:'/app/whatsapp',        label:'WhatsApp',               descricao:'Inbox de mensagens WhatsApp recebidas' },
  { rota:'/app/whatsapp/qrcode', label:'Conectar WhatsApp',      descricao:'Conectar número WhatsApp via QR code' },
  { rota:'/app/whatsapp/status', label:'Status WhatsApp',        descricao:'Ver status da conexão WhatsApp' },
  { rota:'/app/coins',           label:'Match Coins',            descricao:'Saldo de créditos e histórico de uso' },
  { rota:'/app/assistente',      label:'Assistente',             descricao:'Chat com assistente inteligente do MatchImóveis' },
  { rota:'/app/central',         label:'Central',                descricao:'Central de controle e configurações avançadas' },
  { rota:'/app/notificacoes',    label:'Notificações',           descricao:'Lista de notificações do sistema' },
  { rota:'/app/parceiros',       label:'Parceiros',              descricao:'Corretores parceiros na rede e % de comissão' },
  { rota:'/app/indicacoes',      label:'Indicar Parceiro',       descricao:'Link de indicação — ganha 10% de bônus em créditos toda vez que o corretor indicado recarrega' },
  { rota:'/app/parceria-quintoandar', label:'Parceria QuintoAndar', descricao:'Autorizar envio de imóveis ao QuintoAndar ou solicitar acesso à carteira deles' },
  { rota:'/app/imoveis/exportar-excel', label:'Exportar Excel',  descricao:'Exportar lista de imóveis em planilha Excel' },
  { rota:'/app/posts',           label:'Redes Sociais — Posts',  descricao:'Publicar post/story de um imóvel no Instagram — escolhe o imóvel da carteira (ou várias fotos, arrasta pra reordenar), gera legenda com IA, publica na hora ou agenda' },
  { rota:'/app/redes-sociais/campanha', label:'Criar Campanha',  descricao:'Criar campanha paga no Meta Ads (Facebook/Instagram) a partir de um imóvel da carteira — formulário de leads, tráfego pro site ou clique-para-WhatsApp' },
  { rota:'/app/meu-site',        label:'Meu Site',               descricao:'Site público white-label com os imóveis do corretor, cor/logo personalizáveis e opção de domínio próprio' },
];

// ── PÁGINAS — O QUE TEM EM CADA UMA ──────────────────────────────────────────
const paginas = {
  '/app-home': {
    label: 'Dashboard',
    acesso: 'Menu → Dashboard ou ícone 🏠',
    conteudo: [
      'Ticker com total de imóveis ativos',
      'Ticker com total de leads',
      'Ticker com visitas pendentes',
      'Ticker com taxa de match',
      'Gráfico de leads por status (funil)',
      'Heatmap de demanda por bairro',
      'Gauge de temperatura das leads',
      'Resumo de atividade recente',
      'Botões de ação rápida: Cadastrar imóvel, Importar leads, Ver match',
    ]
  },
  '/app/imoveis': {
    label: 'Meus Imóveis',
    acesso: 'Menu → Meus Imóveis',
    conteudo: [
      'Cards de imóveis com foto, tipo, bairro, valor, status',
      'Badge VENDA / ALUGUEL em cada card',
      'Ícones dos portais ativos (VivaReal, ZAP, OLX etc)',
      'Filtros: tipo, transação, bairro, valor mínimo/máximo, status, proprietário, fotos, portal',
      'Busca por texto, ID interno ou ID externo',
      'Botão selecionar em lote + barra flutuante para publicar em portais',
      'Botão ⚠️ Ver imóveis incompletos (para QuintoAndar)',
      'Filtro qa_incompleto para imóveis sem CEP, endereço, número ou proprietário',
    ]
  },
  '/app/leads': {
    label: 'Leads',
    acesso: 'Menu → Leads',
    conteudo: [
      'Kanban com colunas: novo, qualificando, match, vitrine, visita, proposta, fechado',
      'Cards com nome, bairro, tipo, temperatura, score',
      'Badge de temperatura: frio, morno, quente, super quente',
      'Botão Ver lead piscando em rosa',
      'Botão Nova Lead para cadastro manual',
      'Filtros por status, fonte, bairro',
    ]
  },
  '/app/lead/:id': {
    label: 'Detalhe da Lead',
    acesso: 'Leads → clicar no card da lead',
    conteudo: [
      'Dados do cliente: nome, telefone, email',
      'Perfil de busca: tipo, bairro, valor, quartos (editável com autosave)',
      'Mapa de intenção acumulado',
      'Lista de imóveis em match com score',
      'Vitrine: link para enviar ao cliente',
      'Histórico de mensagens WhatsApp',
      'Timeline de eventos',
      'Status do funil e temperatura',
      'Botão bloquear lead',
      'Botão enviar vitrine via WhatsApp',
    ]
  },
  '/app/visitas': {
    label: 'Visitas',
    acesso: 'Menu → Visitas',
    conteudo: [
      'Kanban: solicitada, aguard_cliente, remarcacao, confirmada, realizada, cancelada',
      'Card com lead, imóvel, data, status',
      'Botão Realizada nas colunas aguardando e confirmada',
      'Botão Remarcar, Cancelar',
      'Notificação automática ao proprietário',
    ]
  },
  '/app/perfil': {
    label: 'Perfil',
    acesso: 'Menu → Perfil',
    conteudo: [
      'Nome da conta',
      'Celular',
      'CRECI',
      'CPF',
      'Tipo de conta: Corretor, Imobiliária ou Construtora',
      'Código do usuário (ex: REN-HUH6)',
      'Atualizar localização automática',
      'Conectar WhatsApp (QR code)',
      'Toggle QuintoAndar: autorizar envio de imóveis',
      'Contador de imóveis elegíveis QuintoAndar',
      'Alterar senha',
    ]
  },
  '/app/portais': {
    label: 'Portais',
    acesso: 'Menu → Portais',
    conteudo: [
      'Portais disponíveis: VivaReal, ZAP Imóveis, OLX, Chaves na Mão, ImovelWeb, 123i',
      'Link XML por portal para cadastrar no portal',
      'Status de sincronização',
      'Botão gerar XML manual',
    ]
  },
  '/app/whatsapp': {
    label: 'WhatsApp',
    acesso: 'Menu → WhatsApp',
    conteudo: [
      'Inbox de mensagens recebidas',
      'Badge com mensagens não lidas no menu',
      'Conversa por lead',
      'Copiloto com sugestões de resposta',
      'Botão enviar mensagem direto',
    ]
  },
  '/app/coins': {
    label: 'Match Coins',
    acesso: 'Menu → Coins',
    conteudo: [
      'Saldo atual de Match Coins',
      'Histórico de débitos e créditos',
      'Tabela de custos por ação',
      'Botão comprar mais créditos (Mercado Pago)',
    ]
  },
};

// ── INTENTS / PERGUNTAS COMUNS ────────────────────────────────────────────────
const intents = [
  // NAVEGAÇÃO
  { pergunta:'como acesso meus imoveis',        resposta:'Clique em <strong>Meus Imóveis</strong> no menu lateral ou no botão no dashboard.' },
  { pergunta:'como acesso leads',               resposta:'Clique em <strong>Leads</strong> no menu lateral.' },
  { pergunta:'como acesso visitas',             resposta:'Clique em <strong>Visitas</strong> no menu lateral.' },
  { pergunta:'como acesso perfil',              resposta:'Clique em <strong>Perfil</strong> no menu lateral.' },
  { pergunta:'como acesso whatsapp',            resposta:'Clique em <strong>WhatsApp</strong> no menu lateral.' },
  { pergunta:'como acesso mapa',                resposta:'Clique em <strong>Mapa</strong> no menu lateral ou bottom nav mobile.' },
  { pergunta:'como acesso coins',               resposta:'Clique em <strong>Coins</strong> no menu lateral.' },
  { pergunta:'como acesso portais',             resposta:'Clique em <strong>Portais</strong> no menu lateral.' },
  { pergunta:'como acesso feed',                resposta:'Clique em <strong>Feed</strong> no menu lateral.' },
  { pergunta:'como acesso assistente',          resposta:'Clique em <strong>Assistente</strong> no menu lateral — é onde estamos agora!' },

  // IMÓVEIS
  { pergunta:'como cadastrar imovel',           resposta:'Vá em <strong>Meus Imóveis → + Cadastrar</strong> ou clique em <a href="/app/cadastro">Cadastrar Imóvel →</a>. Preencha tipo, endereço, valor e fotos.' },
  { pergunta:'como editar imovel',              resposta:'Em <strong>Meus Imóveis</strong>, abra o card do imóvel e clique em <strong>Editar</strong>.' },
  { pergunta:'como adicionar foto',             resposta:'Edite o imóvel e use o botão <strong>Adicionar Foto</strong>. Arraste para reordenar. A primeira foto é a capa.' },
  { pergunta:'como inativar imovel',            resposta:'Edite o imóvel e mude o status para <strong>Inativo</strong>. O imóvel sai dos portais automaticamente.' },
  { pergunta:'como importar xml',               resposta:'Em <strong>Meus Imóveis</strong>, clique em <strong>Importar XML</strong>, cole a URL do feed e clique em Importar.' },
  { pergunta:'como publicar portal',            resposta:'Em <strong>Meus Imóveis</strong>, selecione os imóveis (checkbox), clique na barra flutuante e escolha os portais. Ou edite o imóvel individualmente.' },
  { pergunta:'como gerar xml',                  resposta:'Vá em <strong>Portais</strong> e copie o link XML do portal desejado. Ou clique em <strong>Gerar XML</strong> para atualizar manualmente.' },

  // LEADS
  { pergunta:'como importar leads',             resposta:'Vá em <strong>Leads → Importar</strong>. Faça download do modelo Excel, preencha com os leads dos portais e faça upload.' },
  { pergunta:'como cadastrar lead manual',      resposta:'Em <strong>Leads</strong>, clique em <strong>+ Nova Lead</strong> e preencha nome, celular e perfil de busca.' },
  { pergunta:'como fazer match',                resposta:'O match é automático quando um lead chega com perfil completo. Você também pode abrir a lead e clicar em <strong>Buscar Match</strong>.' },
  { pergunta:'como enviar vitrine',             resposta:'Abra a lead, vá em <strong>Match</strong> e clique em <strong>Enviar Vitrine via WhatsApp</strong>. O cliente recebe o link com os imóveis.' },
  { pergunta:'como bloquear lead',              resposta:'Abra a lead e clique em <strong>Bloquear</strong>. O número vai para a lista de bloqueados e não recebe mais mensagens.' },
  { pergunta:'o que e temperatura lead',        resposta:'Temperatura mostra o engajamento: 🔵 frio → qualificando → 🟡 morno → match → 🟠 quente → visita → 🔴 super quente.' },

  // VISITAS
  { pergunta:'como agendar visita',            resposta:'Abra a lead com match, clique em <strong>Solicitar Visita</strong>. O sistema notifica o proprietário automaticamente.' },
  { pergunta:'como confirmar visita',          resposta:'Na coluna <strong>Aguardando</strong> do kanban de visitas, clique em <strong>Confirmar</strong>.' },
  { pergunta:'como remarcar visita',           resposta:'No card da visita, clique em <strong>Remarcar</strong> e escolha nova data.' },
  { pergunta:'como concluir visita',           resposta:'No card da visita, clique em <strong>Realizada</strong> para marcar como concluída.' },
  { pergunta:'o que e caso 1 visita',          resposta:'Caso 1: o imóvel tem proprietário com WhatsApp. O sistema notifica o proprietário e aguarda confirmação.' },
  { pergunta:'o que e caso 2 visita',          resposta:'Caso 2: sem proprietário com WhatsApp. O corretor confirma diretamente sem precisar do proprietário.' },

  // WHATSAPP
  { pergunta:'como conectar whatsapp',         resposta:'Vá em <strong>Perfil → Conectar WhatsApp</strong>. Escaneie o QR code com seu celular. A instância fica salva.' },
  { pergunta:'como desconectar whatsapp',      resposta:'Vá em <strong>Perfil → Desconectar WhatsApp</strong> ou em <strong>WhatsApp → Desconectar</strong>.' },
  { pergunta:'o que e instancia whatsapp',     resposta:'Instância é a conexão do seu número WhatsApp com o sistema. Cada conta tem a sua própria instância.' },

  // PORTAIS
  { pergunta:'quais portais tem',              resposta:'VivaReal, ZAP Imóveis, OLX, Chaves na Mão, ImovelWeb e 123i. O QuintoAndar tem fluxo separado via toggle no Perfil.' },
  { pergunta:'como publicar quintoandar',      resposta:'Vá em <strong>Perfil</strong>, ative o toggle <strong>QuintoAndar</strong> e verifique os imóveis elegíveis. O XML é gerado automaticamente.' },
  { pergunta:'o que e xml',                    resposta:'XML é o arquivo que envia seus imóveis para os portais. Você cadastra o link do XML no portal e ele atualiza automaticamente.' },

  // COINS
  { pergunta:'o que sao match coins',          resposta:'Match Coins são créditos do sistema. Cada ação consome coins: importar XML (2/imóvel), match (20), vitrine WhatsApp (30), resposta IA (30).' },
  { pergunta:'como comprar coins',             resposta:'Vá em <strong>Coins</strong> e clique em <strong>Comprar</strong>. R$20 = 1.000 coins via Mercado Pago.' },
  { pergunta:'quanto custa match',             resposta:'Match automático: 20 coins. Vitrine WhatsApp: 30 coins. Resposta IA WhatsApp: 30 coins. Importar XML: 2 coins/imóvel.' },

  // MATCH
  { pergunta:'o que e match',                  resposta:'Match é quando um imóvel da sua carteira combina com o que o lead procura. O sistema cruza bairro + tipo + quartos + valor automaticamente.' },
  { pergunta:'o que e vitrine',                resposta:'Vitrine é uma página exclusiva enviada ao lead com os imóveis em match. O lead escolhe e solicita visita — tudo automático.' },
  { pergunta:'por que nao deu match',          resposta:'Verifique: 1) O lead tem perfil completo (tipo + bairro + valor)? 2) Tem imóveis no bairro que ele quer? 3) Os valores estão dentro da faixa (-30%/+20%)?' },

  // SISTEMA
  { pergunta:'como trocar senha',              resposta:'Vá em <strong>Perfil → Alterar Senha</strong>. Se esqueceu, use <strong>Esqueci minha senha</strong> na tela de login — você recebe a nova senha via WhatsApp.' },
  { pergunta:'o que e codigo usuario',         resposta:'É seu ID único na plataforma (ex: REN-HUH6). Aparece no menu e no perfil. Cada conta tem o seu próprio código.' },
  { pergunta:'como funciona cerebro',          resposta:'O cérebro é o sistema de IA do MatchImóveis com 50+ módulos. Ele aprende com as perguntas, busca nos seus dados reais e nunca inventa informações.' },

  // REDES SOCIAIS
  { pergunta:'como publicar instagram',        resposta:'Primeiro conecte sua conta em <strong>Perfil → Conectar Instagram</strong> (só na 1ª vez). Depois vá em <a href="/app/posts">Redes Sociais → Posts</a>, escolha o imóvel da carteira, gere a legenda com IA (ou escreva a sua) e clique em <strong>Publicar</strong> ou <strong>Agendar</strong>.' },
  { pergunta:'como conectar instagram',        resposta:'Vá em <strong>Perfil</strong> e clique em <strong>Conectar Instagram</strong>. Autorize sua conta profissional do Instagram — é só uma vez.' },
  { pergunta:'como criar campanha meta ads',   resposta:'Primeiro conecte sua conta em <strong>Perfil → Conectar Meta</strong> (só na 1ª vez). Depois vá em <a href="/app/redes-sociais/campanha">Redes Sociais → Criar Campanha</a>, escolha o imóvel, o objetivo (formulário de leads, tráfego pro site ou WhatsApp), orçamento e público. A campanha é criada pausada pra você revisar antes de ativar.' },
];

// ── SINÔNIMOS ─────────────────────────────────────────────────────────────────
const sinonimos = {
  imovel:      ['imóvel','imovel','imóveis','imoveis','casa','apto','apartamento','propriedade','carteira','cadastro'],
  lead:        ['lead','leads','cliente','clientes','interessado','contato','prospect'],
  visita:      ['visita','visitas','agendamento','vistoria'],
  match:       ['match','cruzamento','compatibilidade','sugestão','sugestao'],
  vitrine:     ['vitrine','vitrines','link','oferta','página do cliente'],
  portal:      ['portal','portais','vivareal','zap','olx','chaves','imovelweb','123i','quintoandar'],
  xml:         ['xml','feed','exportar','importar'],
  whatsapp:    ['whatsapp','wpp','zap','mensagem','chat'],
  coins:       ['coins','créditos','creditos','saldo','moedas'],
  perfil:      ['perfil','conta','dados','configuração','configuracao'],
  dashboard:   ['dashboard','painel','home','início','inicio','resumo'],
  visitas:     ['kanban visitas','status visita','agenda'],
};

// ── PERSONALIDADE ─────────────────────────────────────────────────────────────
const personalidade = {
  nome:     'Match',
  tom:      'direto, prestativo e sem rodeios',
  idioma:   'português brasileiro',
  regras: [
    'Sempre mostra botão ou link para a página relevante',
    'Usa chips de sugestão no final de cada resposta',
    'Pergunta de volta quando falta contexto',
    'Nunca inventa dados — busca sempre nos dados reais do usuário',
    'Confirma se a resposta foi útil ao final',
    'Explica o passo a passo numerado quando a ação tiver mais de 2 etapas',
  ]
};

// ── MONTAR MAPA ───────────────────────────────────────────────────────────────
const mapa = {
  geradoEm: new Date().toISOString(),
  versao: '3.0',
  rotas,
  paginas,
  intents,
  sinonimos,
  personalidade,
  totalRotas: rotas.length,
  totalIntents: intents.length,
};

const destino = path.join(BASE, 'assistente-mapa.json');
fs.writeFileSync(destino, JSON.stringify(mapa, null, 2), 'utf8');

console.log('✅ assistente-mapa.json gerado!');
console.log('   Rotas:   ' + mapa.totalRotas);
console.log('   Intents: ' + mapa.totalIntents);
console.log('   Páginas: ' + Object.keys(paginas).length);
console.log('   Sinônimos: ' + Object.keys(sinonimos).length + ' grupos');

// Gerar contexto rico para o Groq
const contextoGroq = {
  geradoEm: new Date().toISOString(),
  paginas: rotas.map(r => ({ rota: r.rota, label: r.label, descricao: r.descricao })),
  fluxos: [
    { titulo: 'Importar imóveis via XML', passos: ['Cadastrar Imóvel → cole a URL do XML → Testar (valida antes) → Importar'] },
    { titulo: 'Importar leads', passos: ['Leads → Importar → baixar modelo → preencher → upload'] },
    { titulo: 'Ver leads em planilha', passos: ['Leads → Planilha de Leads → filtrar por origem/status/data → Exportar Excel'] },
    { titulo: 'Publicar nos portais', passos: ['Portais → ativar o portal desejado → XML é gerado e enviado automaticamente'] },
    { titulo: 'Conectar WhatsApp', passos: ['Perfil → Conectar WhatsApp → QR code → escanear'] },
    { titulo: 'Enviar vitrine', passos: ['Lead com match → Enviar Vitrine via WhatsApp'] },
    { titulo: 'Agendar visita', passos: ['Lead recebe vitrine → solicita visita → confirmar em Visitas'] },
    { titulo: 'QuintoAndar', passos: ['Perfil → toggle QA → verificar elegíveis → XML gerado automaticamente'] },
    { titulo: 'Captar imóvel de proprietário', passos: ['Captação → copiar link público → proprietário preenche dados do imóvel → aparece em Captação para revisar'] },
    { titulo: 'Indicar outro corretor', passos: ['Indicar Parceiro → copiar link → corretor indicado se cadastra → você ganha 10% de bônus em créditos a cada recarga dele'] },
    { titulo: 'Publicar imóvel no Instagram', passos: ['Perfil → Conectar Instagram (só na 1ª vez, autoriza a conta) → Redes Sociais (Posts) → escolher o imóvel da carteira (ou selecionar várias fotos) → gerar legenda com IA ou escrever a sua → Publicar agora ou Agendar'] },
    { titulo: 'Criar campanha paga (Meta Ads)', passos: ['Perfil → Conectar conta do Meta (só na 1ª vez) → Redes Sociais → Criar Campanha → escolher imóvel, objetivo (formulário de leads, tráfego pro site ou WhatsApp), orçamento e público → Criar campanha (fica pausada, você revisa e ativa no Gerenciador de Anúncios do Meta)'] },
    { titulo: 'Configurar domínio próprio (Meu Site)', passos: ['Meu Site → personalizar cores/logo → seção de domínio próprio → seguir as instruções de DNS mostradas na tela'] },
  ],
  // Fonte única de conhecimento do assistente sobre a plataforma — groq-ia.js
  // NÃO duplica nada disso no system prompt, só injeta esse objeto inteiro via
  // contexto-groq.json. Toda vez que uma rota/feature nova entrar pro corretor,
  // atualizar aqui (rotas + fluxos + conceitos) e rodar `node cerebro.js`.
  conceitos: {
    match: 'Cruzamento automático lead × imóvel por transação + tipo + estado + cidade + bairro + valor (-20%/+20%) + quartos (exato)',
    vitrine: 'Página exclusiva enviada ao lead com imóveis em match',
    temperatura: 'frio → morno → quente (conforme engajamento)',
    caso1: 'Lead clicou num imóvel específico (imóvel âncora) → busca imóveis parecidos, âncora sempre no topo',
    caso2: 'Lead com perfil de busca (sem imóvel específico) → busca por perfil completo (transação+tipo+cidade+bairro+valor+quartos)',
    instagram: 'Publicação no Instagram é feita pelo próprio MatchImóveis (Redes Sociais → Posts) — não precisa exportar XML nem usar ferramenta externa. Corretor conecta a conta uma vez no Perfil → Conectar Instagram, depois escolhe o imóvel (ou várias fotos), gera legenda com IA ou escreve a sua, e publica ou agenda.',
    meta_ads: 'Campanha paga no Facebook/Instagram criada direto no MatchImóveis (Redes Sociais → Criar Campanha) — corretor conecta a conta do Meta uma vez, escolhe imóvel, objetivo (formulário de leads, tráfego pro site ou clique-para-WhatsApp), orçamento e público. Sempre criada pausada pro corretor revisar e ativar no Gerenciador de Anúncios do Meta.',
    menus: 'Dashboard, Meus Imóveis, Leads (+ Planilha de Leads), Visitas, Captação, Parceiros, Notificações, Cadastrar Imóvel, Portais, Assistente, Mapa, Perfil, Créditos, Indicar Parceiro, Parceria QuintoAndar, Feed, Redes Sociais (Posts — publicar no Instagram), Criar Campanha (Meta Ads), Meu Site (domínio próprio)',
    portais_disponiveis: 'Apenas estes 6: ZAP Imóveis, VivaReal, OLX, Chaves na Mão, 123i, ImovelWeb. Acesse em Portais no menu.',
    quintoandar_parceria: '2 tipos: 1) ENVIAR IMÓVEIS — corretor ativa o toggle no Perfil e seus imóveis elegíveis são enviados ao feed XML do QuintoAndar; se o QuintoAndar vender, corretor recebe até 25% da comissão. 2) CARTEIRA QUINTOANDAR — corretor solicita acesso à carteira de imóveis do QuintoAndar, o MatchImóveis faz o match dos leads do corretor com os imóveis do QuintoAndar; se o corretor vender, recebe 50% da comissão (os outros 50% ficam com o QuintoAndar). Acesse em Parceria QuintoAndar no menu.',
    importar_imoveis: 'Acesse Cadastrar Imóvel no menu → cole a URL do XML (padrão VRSync do VivaReal) → clique em Testar (valida o feed) → clique em Importar. O botão Testar existe sim, assim como Gerar XML (na página Portais).',
    exportar_portais: 'Na página de Imóveis, selecione os imóveis desejados clicando neles (ou edite um por vez na página de edição) → use a opção Exportar XML. O XML gerado pode ser levado para portais parceiros.',
    captacao: 'Página que lista leads que indicaram ter um imóvel próprio pra anunciar, vindas do link público de captação do corretor (compartilhável via WhatsApp).',
    planilha_leads: 'Dentro de Leads, visão em formato de tabela com filtros por origem/status/data e exportação para Excel — separada do kanban.',
    indicar_parceiro: 'Cada corretor tem um link próprio (com ?ref=código). Corretor indicado que se cadastra por esse link fica vinculado pra sempre. O indicador ganha 10% de bônus em créditos toda vez que o indicado faz uma recarga real.',
    status_leads: 'novo, qualificando, vitrine_enviada, visita_agendada, proposta, fechado, arquivado',
    status_visitas: 'solicitada (lead pediu), lead_confirmou (lead confirmou presença), aguard_cliente (corretor confirmou, aguarda lead), remarcacao (remarcando data), realizada, cancelada, imovel_indisponivel',
    status_imoveis: 'ativo, inativo, pendente',
    notificacoes: 'match (novo match encontrado), nova_visita (visita solicitada), saldo_baixo (coins acabando), saldo_zerado (conta pausada)',
    coins: 'CRÉDITOS (Match Coins) — R$50 mínimo = 1.000 coins (R$1 = 20 coins). Valores em COINS, NÃO em reais — nunca diga "R$" ao falar de consumo de coins. Valores exatos em coins: cadastrar imóvel=15, editar imóvel=0 (grátis), importar XML=2/imóvel, gerar XML portal=10, lead ativo/dia=0.2, qualificar lead via IA=30, match encontrado=20, vitrine WhatsApp=30, IA responde WA=30, follow-up automático=25, visita agendada pela IA=40, notificação proprietário=15, confirmação automática=15, nova lead=20, importar lead planilha=10. Para recarregar: Créditos no menu → valor em reais (mínimo R$50) → Adicionar créditos.',
  }
};

const contextoGroqPath = path.join(BASE, 'cerebro', 'contexto-groq.json');
fs.writeFileSync(contextoGroqPath, JSON.stringify(contextoGroq, null, 2), 'utf8');
console.log('✅ contexto-groq.json gerado!');
console.log('   Páginas: ' + contextoGroq.paginas.length);
console.log('   Fluxos: ' + contextoGroq.fluxos.length);
