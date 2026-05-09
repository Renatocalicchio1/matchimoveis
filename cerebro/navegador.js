'use strict';
const PAGINAS = {
  dashboard:  { rota:'/app-home',      titulo:'Dashboard',        descricao:'Visao geral do negocio', keywords:['dashboard','inicio','home','painel','resumo','visao geral'], oque_tem:['KPIs: imoveis, leads, visitas, matches','Graficos de demanda por bairro','Lista de leads recentes','Notificacoes pendentes'], filtros:[], botoes:['Ver leads','Ver imoveis','Fazer match'] },
  imoveis:    { rota:'/app/imoveis',   titulo:'Meus Imoveis',     descricao:'Carteira de imoveis indexada pela IA', keywords:['imoveis','carteira','meus imoveis','apartamentos','casas','estoque','imovei'], oque_tem:['Lista de imoveis com foto, tipo, bairro, valor e status','Selecao multipla para gerar XML em lote','Filtros avancados','Importar XML','Exportar Excel','Gerar XML para portais','Inativar/ativar imovel'], filtros:['Tipo','Bairro','Cidade','Valor min/max','Area','Quartos','Vagas','Suites','Banheiros','Operacao','Status','Proprietario','Fotos'], botoes:['Importar XML','Exportar Excel','Selecionar Todos','Gerar XML VivaReal','Gerar XML ZAP','Gerar XML OLX','Gerar XML Chaves','Gerar XML ImovelWeb','Inativar','Editar','Ver detalhe'] },
  cadastro:   { rota:'/app/cadastro',  titulo:'Cadastrar Imovel', descricao:'IMPORTE imoveis do seu CRM para o MatchImóveis via XML (Tecimob, Rankim, Vista...)', keywords:['cadastrar','cadastro','novo imovel','adicionar imovel','importar xml','subir xml','url xml','feed xml','trazer imoveis','importar do crm','trazer do tecimob','trazer do rankim','puxar imoveis','trazer imoveis para matchimoveis'], oque_tem:['Formulario manual de cadastro','Upload de fotos','Importacao via URL de feed XML','Botao testar URL XML'], filtros:[], botoes:['Salvar imovel','Testar URL XML','Importar XML agora'] },
  leads:      { rota:'/app/leads',     titulo:'Leads',            descricao:'Clientes em busca de imoveis', keywords:['leads','clientes','interessados','compradores','base de leads','meus clientes','lead','cliente'], oque_tem:['Lista de leads com status e perfil','Filtros por match, bairro, tipo','Importar CSV/Excel','Fazer match','Ver vitrine de cada lead','Score de cada lead'], filtros:['Status (com/sem match)','Tipo desejado','Bairro desejado','Origem (organica/importada)','Data'], botoes:['Importar Leads','Fazer Match','Ver Vitrine','Ver Detalhe'] },
  visitas:    { rota:'/app/visitas',   titulo:'Visitas',          descricao:'Gerencie visitas solicitadas pelos clientes', keywords:['visitas','agendamentos','visita pendente','visita confirmada','quem quer visitar','visitas hoje','agendada','minhas visitas'], oque_tem:['Lista de visitas com status','Filtros por status, data e nome','Confirmar ou recusar visita','Notificacao automatica ao proprietario'], filtros:['Status (solicitada/confirmada/recusada/realizada)','Data da visita','Nome do cliente'], botoes:['Confirmar visita','Recusar visita','Filtrar','Buscar'] },
  notificacoes:{ rota:'/app/notificacoes', titulo:'Notificacoes', descricao:'Central de alertas e avisos', keywords:['notificacoes','alertas','avisos','sino','novo match','visita solicitada','nao lidas'], oque_tem:['Lista de notificacoes do sistema','Tipos: visita, match, imovel sem proprietario, XML desatualizado','Marcar como lida'], filtros:[], botoes:['Marcar como lida','Marcar todas como lidas'] },
  portais:    { rota:'/app/portais',   titulo:'Portais / XML',    descricao:'XML que VOCÊ EXPORTA para portais parceiros (VivaReal, ZAP, OLX...)', keywords:['portais','exportar xml','feed portal','vivareal','zap','olx','chaves','imovelweb','123i','url do feed','link do portal','portias','ver portais','enviar para portal','publicar portal'], oque_tem:['URLs dos feeds por portal','Data da ultima geracao','Quantidade de imoveis no feed','Padrao VRSync compativel com todos portais'], filtros:[], botoes:['Copiar URL','Regenerar XML','Ver feed'] },
  perfil:     { rota:'/app/perfil',    titulo:'Perfil',           descricao:'Suas informacoes de conta', keywords:['perfil','minha conta','meus dados','alterar senha','configuracoes','conta'], oque_tem:['Nome, email, telefone','Codigo do usuario','Alterar senha','Saldo de Match Coins'], filtros:[], botoes:['Salvar alteracoes','Alterar senha'] },
  coins:      { rota:'/app/coins',     titulo:'Match Coins',      descricao:'Saldo e historico de moedas', keywords:['coins','moedas','match coins','saldo','pontos','conis','meus conis'], oque_tem:['Saldo atual de Match Coins','Historico de transacoes','Como ganhar mais coins'], filtros:[], botoes:[] },
  assistente: { rota:'/app/assistente',titulo:'Assistente',       descricao:'Seu CRM por conversa', keywords:['assistente','chat','ia','cerebro','perguntar'], oque_tem:['Chat inteligente sobre leads, imoveis, visitas e match','Busca em tempo real nos dados','Upload de arquivos XML e planilhas','Feedback por mensagem'], filtros:[], botoes:['Enviar mensagem','Anexar arquivo'] },
};

const FLUXOS = {
  importar_imoveis: { titulo:'Importar imoveis via XML', rota:'/app/cadastro', keywords:['importar xml','subir xml','importar imoveis','url xml','feed xml','como importo imoveis'], passos:['Va em Cadastrar Imovel /app/cadastro','Cole a URL do feed XML no padrao VRSync (VivaReal) — Tecimob, Rankim, Vista ja exportam nesse padrao','Clique em Testar para validar a URL','Clique em Importar Agora — os imoveis aparecem em Meus Imoveis com ID interno MI-xxx'] },
  importar_leads:   { titulo:'Importar leads via CSV/Excel', rota:'/app/leads', keywords:['importar leads','subir leads','importar planilha','csv leads','excel leads','como importo leads','importar base'], passos:['Va em Leads /app/leads','Clique em Importar Leads','Selecione o arquivo CSV ou Excel do portal','O sistema extrai bairro, tipo, quartos e valor automaticamente','Clique em Fazer Match para cruzar com seus imoveis'] },
  enviar_vitrine:   { titulo:'Enviar vitrine para o cliente', rota:'/app/leads', keywords:['vitrine','enviar vitrine','link cliente','link da vitrine','como envio vitrine','mandar vitrine','enviar vitrine para cliente'], passos:['Va em Leads /app/leads','Clique na lead com match (icone match)','Copie o Link da Vitrine na pagina da lead','Envie pelo WhatsApp: /cliente/oferta/[id]','O cliente ve os imoveis e pode solicitar visita'] },
  gerar_xml:        { titulo:'Exportar XML para portal parceiro', rota:'/app/imoveis', keywords:['gerar xml','exportar xml','xml vivareal','xml zap','xml olx','publicar portal','feed portal','como gero xml','gerar feed','enviar xml para portal','subir no vivareal','publicar no zap'], passos:['Va em Meus Imoveis /app/imoveis','Selecione os imoveis com os checkboxes','Na barra inferior escolha o portal (VivaReal, ZAP, OLX...)','Clique em Gerar XML — exportado no padrao VRSync','O link do feed aparece em Portais /app/portais','Copie a URL e cadastre no portal parceiro'] },
  agendar_visita:   { titulo:'Como funciona o agendamento de visita', rota:'/app/visitas', keywords:['agendar visita','como agenda','solicitar visita','confirmar visita','fluxo de visita','como funciona visita'], passos:['O cliente acessa a vitrine e clica em Solicitar Visita','Preenche data, horario e mensagem','Voce recebe notificacao em /app/notificacoes e /app/visitas','Confirme ou recuse a visita em /app/visitas','O proprietario e notificado automaticamente quando confirmada'] },
};

function semAcento(s){ return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

function responderSobrePagina(mNorm, btn, chip) {
  const pagina = Object.entries(PAGINAS).find(([,p]) => p.keywords.some(k => mNorm.includes(semAcento(k))));
  if (!pagina) return null;
  const [,p] = pagina;
  if (/o que tem|o que ha|me mostra|me fala|me explica|tem la|pagina de|pagina do|o que fica/.test(mNorm)) {
    return '\uD83D\uDCCB <strong>'+p.titulo+'</strong> \u2014 '+p.descricao+'<br><br>'+
      '<strong>O que voc\u00ea encontra l\u00e1:</strong><br>'+p.oque_tem.map(i=>'\u2022 '+i).join('<br>')+
      (p.filtros.length?'<br><br><strong>Filtros dispon\u00edveis:</strong><br>'+p.filtros.map(i=>'\u2022 '+i).join('<br>'):'')+
      '<br><br>'+btn('Ir para '+p.titulo, p.rota);
  }
  if (/filtro|filtrar|como busco|como encontro/.test(mNorm) && p.filtros.length)
    return '\uD83D\uDD0D <strong>Filtros em '+p.titulo+':</strong><br><br>'+p.filtros.map(f=>'\u2022 '+f).join('<br>')+'<br><br>'+btn('Ir para '+p.titulo, p.rota);
  if (/bot[aã]o|o que posso fazer|acoes/.test(mNorm) && p.botoes.length)
    return '\u26A1 <strong>A\u00e7\u00f5es em '+p.titulo+':</strong><br><br>'+p.botoes.map(b=>'\u2022 '+b).join('<br>')+'<br><br>'+btn('Ir para '+p.titulo, p.rota);
  return null;
}

function responderSobreFluxo(mNorm, btn, chip) {
  const fluxo = Object.entries(FLUXOS).find(([,f]) => f.keywords.some(k => mNorm.includes(semAcento(k))));
  if (!fluxo) return null;
  const [,f] = fluxo;
  return '\uD83D\uDE80 <strong>'+f.titulo+':</strong><br><br>'+
    f.passos.map((p,i)=>'<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">'+(i+1)+'</span><span>'+p+'</span></div>').join('')+
    '<br>'+btn('Ir agora', f.rota);
}

function responder(mNorm, btn, chip) {
  const resFluxo = responderSobreFluxo(mNorm, btn, chip);
  if (resFluxo) return resFluxo;
  const resPagina = responderSobrePagina(mNorm, btn, chip);
  if (resPagina) return resPagina;
  if (/ir para|abrir|acessar|navegar|levar|vai em|me leva/.test(mNorm)) {
    const pagina = Object.entries(PAGINAS).find(([,p]) => p.keywords.some(k => mNorm.includes(semAcento(k))));
    if (pagina) { const [,p]=pagina; return '\uD83D\uDCCC Acessando <strong>'+p.titulo+'</strong>...<br><br>'+btn(p.titulo, p.rota); }
  }
  return null;
}

function gerarMapaNavegacao() {
  return { paginas: Object.entries(PAGINAS).map(([id,p])=>({id,rota:p.rota,titulo:p.titulo,keywords:p.keywords})), fluxos: Object.entries(FLUXOS).map(([id,f])=>({id,titulo:f.titulo,rota:f.rota,keywords:f.keywords})) };
}

module.exports = { responder, responderSobrePagina, responderSobreFluxo, gerarMapaNavegacao, PAGINAS, FLUXOS };
