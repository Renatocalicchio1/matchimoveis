'use strict';

const PAGINAS = {
  dashboard:    { rota:'/app-home',             titulo:'Dashboard',            descricao:'Painel principal com métricas e resumo do negócio', keywords:['dashboard','inicio','home','painel','resumo','visao geral','tela inicial','pagina inicial'], oque_tem:['KPIs: imóveis, leads, visitas, taxa de match','Gráfico funil de leads por status','Heatmap de demanda por bairro','Gauge de temperatura das leads','Resumo de atividade recente','Botões de ação rápida'], filtros:[], botoes:['Cadastrar imóvel','Importar leads','Ver match','Ver visitas'] },
  imoveis:      { rota:'/app/imoveis',          titulo:'Meus Imóveis',         descricao:'Carteira de imóveis cadastrados com filtros avançados', keywords:['imoveis','imovel','carteira','meus imoveis','meu imovel','apartamentos','casas','estoque','imovei','ver imoveis','lista de imoveis','acesso imovel','acesso imoveis'], oque_tem:['Cards com foto, tipo, bairro, valor e status','Badge VENDA / ALUGUEL','Ícones dos portais ativos por imóvel','Seleção em lote para publicar em portais','Busca por texto, ID interno ou externo','Botão imóveis incompletos QuintoAndar'], filtros:['Tipo','Transação (venda/aluguel)','Bairro','Cidade','Valor mín/máx','Status','Proprietário','Fotos','Portal'], botoes:['Importar XML','Exportar Excel','Selecionar em lote','Publicar em portais','Editar','Inativar','Ver imóveis incompletos QA'] },
  cadastro:     { rota:'/app/cadastro',         titulo:'Cadastrar Imóvel',     keywords:['cadastrar imovel','cadastro','novo imovel','adicionar imovel','importar xml','subir xml','url xml','feed xml','trazer imoveis','importar do crm','trazer do tecimob'], oque_tem:['Formulário manual de cadastro','Upload de fotos','Importação via URL de feed XML','Botão testar URL XML'], filtros:[], botoes:['Salvar imóvel','Testar URL XML','Importar XML agora'] },
  leads:        { rota:'/app/leads',            titulo:'Leads',                descricao:'Kanban de clientes interessados em imóveis', keywords:['leads','clientes','interessados','compradores','base de leads','meus clientes','lead','kanban leads','ver leads'], oque_tem:['Kanban com colunas: novo, qualificando, match, vitrine, visita, proposta, fechado','Cards com nome, bairro, tipo, temperatura, score','Badge de temperatura','Botão Nova Lead para cadastro manual','Filtros por status, fonte, bairro'], filtros:['Status','Fonte','Bairro','Temperatura','Com/sem match'], botoes:['Nova Lead','Importar leads','Fazer match','Ver vitrine','Abrir lead'] },
  lead_detalhe: { rota:'/app/lead/:id',         titulo:'Detalhe da Lead',      keywords:['detalhe lead','pagina lead','abrir lead','ver lead','lead detalhe','informacoes lead'], oque_tem:['Dados do cliente: nome, telefone, email','Perfil de busca editável com autosave','Mapa de intenção acumulado','Imóveis em match com score','Link da vitrine para enviar ao cliente','Histórico de mensagens WhatsApp','Timeline de eventos','Botão bloquear lead','Botão enviar vitrine via WhatsApp'], filtros:[], botoes:['Enviar vitrine','Bloquear lead','Editar perfil de busca','Ver match','Agendar visita'] },
  visitas:      { rota:'/app/visitas',          titulo:'Visitas',              descricao:'Kanban de visitas com status e notificações automáticas', keywords:['visitas','agendamentos','visita pendente','visita confirmada','minhas visitas','kanban visitas','ver visitas'], oque_tem:['Kanban: solicitada, aguard_cliente, remarcação, confirmada, realizada, cancelada','Card com lead, imóvel, data, status','Botão Realizada nas colunas aguardando e confirmada','Notificação automática ao proprietário'], filtros:['Status','Data','Nome do cliente'], botoes:['Confirmar','Remarcar','Cancelar','Realizada','Ver lead'] },
  mapa:         { rota:'/app/mapa',             titulo:'Mapa',                 keywords:['mapa','mapa de imoveis','ver no mapa','localizacao imoveis','imoveis no mapa','mapa de visitas'], oque_tem:['Mapa com pins dos imóveis','Pins de visitas agendadas','Filtro por status de visita','Fallback por bairro/cidade quando sem coordenadas'], filtros:['Status da visita'], botoes:['Ver imóvel','Ver lead'] },
  feed:         { rota:'/app/feed',             titulo:'Feed',                 keywords:['feed','feed de imoveis','ver feed','timeline imoveis'], oque_tem:['Feed de imóveis intercalados por corretor','Scroll infinito','Pull-to-refresh no mobile','Botão atualizar no desktop','Compartilhar imóvel via WhatsApp direto para o lead'], filtros:[], botoes:['Atualizar','Compartilhar'] },
  portais:      { rota:'/app/portais',          titulo:'Portais / XML',        keywords:['portais','exportar xml','feed portal','vivareal','zap','olx','chaves','imovelweb','123i','url do feed','link do portal','ver portais','publicar portal'], oque_tem:['URLs dos feeds XML por portal','Status de sincronização','Data da última geração','Quantidade de imóveis no feed'], filtros:[], botoes:['Copiar URL','Regenerar XML','Ver feed'] },
  perfil:       { rota:'/app/perfil',           titulo:'Perfil',               keywords:['perfil','minha conta','meus dados','alterar senha','configuracoes','conta','dados da conta','meu perfil'], oque_tem:['Nome, celular, CRECI, CPF','Código do usuário (ex: REN-HUH6)','Tipo de conta: Corretor, Imobiliária ou Construtora','Toggle QuintoAndar','Contador imóveis elegíveis QA','Conectar WhatsApp via QR code','Alterar localização','Alterar senha'], filtros:[], botoes:['Salvar','Conectar WhatsApp','Alterar senha','Atualizar localização'] },
  whatsapp:     { rota:'/app/whatsapp',         titulo:'WhatsApp',             keywords:['whatsapp','inbox','mensagens','chat whatsapp','wpp','ver mensagens','whatsapp inbox'], oque_tem:['Inbox de mensagens recebidas','Conversa por lead','Copiloto com sugestões de resposta','Badge com não lidas no menu','Botão enviar mensagem direta'], filtros:[], botoes:['Enviar mensagem','Ver lead'] },
  whatsapp_qr:  { rota:'/app/whatsapp/qrcode',  titulo:'Conectar WhatsApp',    keywords:['qrcode','qr code','conectar whatsapp','escanear qr','conectar numero','nova instancia whatsapp'], oque_tem:['QR code para escanear com celular','Status da conexão em tempo real'], filtros:[], botoes:['Gerar QR code','Desconectar'] },
  coins:        { rota:'/app/coins',            titulo:'Match Coins',          keywords:['coins','moedas','match coins','saldo','pontos','conis','meus coins','creditos'], oque_tem:['Saldo atual de Match Coins','Histórico de débitos e créditos','Tabela de custos por ação','Botão comprar via Mercado Pago'], filtros:[], botoes:['Comprar coins'] },
  notificacoes: { rota:'/app/notificacoes',     titulo:'Notificações',         keywords:['notificacoes','alertas','avisos','sino','nao lidas','ver notificacoes'], oque_tem:['Lista de notificações: match, visita, sistema','Marcar como lida','Marcar todas como lidas'], filtros:[], botoes:['Marcar como lida','Marcar todas como lidas'] },
  parceiros:    { rota:'/app/parceiros',        titulo:'Parceiros',            keywords:['parceiros','corretores parceiros','comissao','parceiro','ver parceiros'], oque_tem:['Lista de corretores parceiros','Comissões por visita','Agendar visita com parceiro'], filtros:[], botoes:['Ver parceiro','Definir comissão'] },
  assistente:   { rota:'/app/assistente',       titulo:'Assistente',           keywords:['assistente','chat','ia','cerebro','perguntar','ajuda','suporte'], oque_tem:['Chat inteligente sobre leads, imóveis, visitas e match','Busca em tempo real nos dados reais','Respostas com botões e chips de ação','Histórico de conversa por usuário'], filtros:[], botoes:['Enviar mensagem'] },
  central:      { rota:'/app/central',          titulo:'Central',              keywords:['central','central de controle','configuracoes avancadas','admin'], oque_tem:['Configurações avançadas da conta','Controle de integrações'], filtros:[], botoes:[] },
  importar_leads:{ rota:'/app/importar-leads',  titulo:'Importar Leads',       keywords:['importar leads','subir leads','planilha leads','excel leads','csv leads','como importo leads'], oque_tem:['Upload de planilha Excel/CSV com leads dos portais','Download do modelo de planilha','Extração automática de perfil de busca'], filtros:[], botoes:['Download modelo','Upload planilha','Importar'] },
};

const FLUXOS = {
  importar_imoveis: { titulo:'Importar imóveis via XML', rota:'/app/cadastro', keywords:['importar xml','subir xml','importar imoveis','url xml','feed xml','como importo imoveis','trazer imoveis'], passos:['Vá em Cadastrar Imóvel → /app/cadastro','Cole a URL do feed XML (padrão VRSync — Tecimob, Rankim, Vista já exportam nesse padrão)','Clique em Testar para validar a URL','Clique em Importar Agora — imóveis aparecem em Meus Imóveis'] },
  importar_leads:   { titulo:'Importar leads via planilha', rota:'/app/importar-leads', keywords:['importar leads','subir leads','importar planilha','csv leads','excel leads','como importo leads','importar base de leads'], passos:['Vá em Leads → Importar Leads → /app/importar-leads','Baixe o modelo de planilha','Preencha com os leads dos portais','Faça upload da planilha','O sistema extrai bairro, tipo, quartos e valor automaticamente','O match é rodado automaticamente'] },
  enviar_vitrine:   { titulo:'Enviar vitrine para o cliente', rota:'/app/leads', keywords:['enviar vitrine','vitrine','link cliente','link da vitrine','como envio vitrine','mandar vitrine'], passos:['Vá em Leads → abra a lead com match','Clique em Enviar Vitrine via WhatsApp','O sistema monta o link /cliente/oferta/:id','O lead recebe os imóveis em match e pode solicitar visita diretamente'] },
  gerar_xml:        { titulo:'Publicar imóveis nos portais via XML', rota:'/app/imoveis', keywords:['gerar xml','exportar xml','xml vivareal','xml zap','xml olx','publicar portal','feed portal','como gero xml','publicar no vivareal','publicar no zap','publicar vivareal','subir no vivareal','enviar para vivareal','publicar zap','publicar olx','publicar imoveis','como publico','publicar no portal'], passos:['Vá em Meus Imóveis → selecione os imóveis com checkbox','Na barra flutuante escolha os portais','Clique em Publicar','Vá em Portais → copie o link XML','Cadastre o link no portal parceiro (VivaReal, ZAP, OLX...)'] },
  conectar_whatsapp:{ titulo:'Conectar WhatsApp', rota:'/app/whatsapp/qrcode', keywords:['conectar whatsapp','qr code','escanear qr','como conecto whatsapp','qrcode whatsapp','ligar whatsapp'], passos:['Vá em Perfil → Conectar WhatsApp','Ou acesse /app/whatsapp/qrcode diretamente','Clique em Gerar QR code','Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo','Escaneie o QR code','Pronto — leads que mandarem mensagem entram automaticamente no sistema'] },
  agendar_visita:   { titulo:'Fluxo de agendamento de visita', rota:'/app/visitas', keywords:['agendar visita','como agenda','solicitar visita','confirmar visita','fluxo de visita','como funciona visita'], passos:['O cliente acessa a vitrine e clica em Solicitar Visita','Preenche data, horário e mensagem','Você recebe notificação em Notificações e Visitas','Confirme a visita no kanban de Visitas','O proprietário é notificado automaticamente via WhatsApp'] },
  publicar_quintoandar:{ titulo:'Publicar no QuintoAndar', rota:'/app/perfil', keywords:['quintoandar','quinto andar','publicar quintoandar','ativar quintoandar','xml quintoandar'], passos:['Vá em Perfil → ative o toggle QuintoAndar','Verifique os imóveis elegíveis (CEP + endereço + número + proprietário obrigatórios)','Clique em Ver imóveis incompletos para corrigir os que faltam','O XML é gerado automaticamente em /xml/quintoandar-global'] },
  cadastrar_lead_manual:{ titulo:'Cadastrar lead manualmente', rota:'/app/leads', keywords:['cadastrar lead','nova lead','lead manual','adicionar lead','novo cliente manual'], passos:['Vá em Leads → clique em + Nova Lead','Preencha nome e celular','Preencha o perfil de busca: tipo, bairro, valor, quartos','Salve — o match é rodado automaticamente'] },
  bloquear_lead:    { titulo:'Bloquear um lead', rota:'/app/leads', keywords:['bloquear lead','bloquear cliente','lead indesejado','nao quero mais lead'], passos:['Abra a lead em /app/lead/:id','Clique em Bloquear','O número vai para a lista de bloqueados','O lead não receberá mais mensagens automáticas do sistema'] },
};

function semAcento(s){ return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

function responderSobrePagina(mNorm, btn, chip) {
  const pagina = Object.entries(PAGINAS).find(([,p]) => p.keywords.some(k => mNorm.includes(semAcento(k))));
  if (!pagina) return null;
  const [,p] = pagina;

  if (/o que tem|o que ha|me mostra|me fala|me explica|tem la|pagina de|pagina do|o que fica|conteudo/.test(mNorm)) {
    return '📋 <strong>'+p.titulo+'</strong> — '+p.descricao+'<br><br>'+
      '<strong>O que você encontra lá:</strong><br>'+p.oque_tem.map(i=>'• '+i).join('<br>')+
      (p.filtros.length?'<br><br><strong>Filtros disponíveis:</strong><br>'+p.filtros.map(i=>'• '+i).join('<br>')  :'')+
      (p.botoes.length?'<br><br><strong>Ações disponíveis:</strong><br>'+p.botoes.map(i=>'• '+i).join('<br>'):'')+
      '<br><br>'+btn('Ir para '+p.titulo, p.rota);
  }
  if (/filtro|filtrar|como busco|como encontro/.test(mNorm) && p.filtros.length)
    return '🔍 <strong>Filtros em '+p.titulo+':</strong><br><br>'+p.filtros.map(f=>'• '+f).join('<br>')+'<br><br>'+btn('Ir para '+p.titulo, p.rota);
  if (/botao|o que posso fazer|acoes|o que da para fazer/.test(mNorm) && p.botoes.length)
    return '⚡ <strong>Ações em '+p.titulo+':</strong><br><br>'+p.botoes.map(b=>'• '+b).join('<br>')+'<br><br>'+btn('Ir para '+p.titulo, p.rota);
  if (/como acesso|como abro|onde fica|como chego|como entro|ir para|acessar|abrir|navegar|me leva/.test(mNorm))
    return '📌 Para acessar <strong>'+p.titulo+'</strong>, clique no menu lateral.<br><br>'+btn('Ir para '+p.titulo, p.rota);

  return null;
}

function responderSobreFluxo(mNorm, btn, chip) {
  const fluxo = Object.entries(FLUXOS).find(([,f]) => f.keywords.some(k => mNorm.includes(semAcento(k))));
  if (!fluxo) return null;
  const [,f] = fluxo;
  return '🚀 <strong>'+f.titulo+':</strong><br><br>'+
    f.passos.map((p,i)=>'<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">'+(i+1)+'</span><span>'+p+'</span></div>').join('')+
    '<br>'+btn('Ir agora', f.rota);
}

function responder(mNorm, btn, chip) {
  const resFluxo = responderSobreFluxo(mNorm, btn, chip);
  if (resFluxo) return resFluxo;
  const resPagina = responderSobrePagina(mNorm, btn, chip);
  if (resPagina) return resPagina;
  return null;
}

function gerarMapaNavegacao() {
  return {
    paginas: Object.entries(PAGINAS).map(([id,p])=>({id,rota:p.rota,titulo:p.titulo, descricao:'Painel principal com métricas e resumo do negócio',keywords:p.keywords})),
    fluxos:  Object.entries(FLUXOS).map(([id,f])=>({id,titulo:f.titulo,rota:f.rota,keywords:f.keywords})),
  };
}

module.exports = { responder, responderSobrePagina, responderSobreFluxo, gerarMapaNavegacao, PAGINAS, FLUXOS };
