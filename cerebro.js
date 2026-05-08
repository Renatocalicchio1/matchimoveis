const fs = require('fs');
const path = require('path');

console.log('🧠 Gerando cérebro v11.0...');

const server = fs.readFileSync('server.js', 'utf8');
const linhas = server.split('\n');
const viewsDir = './views';

// ── 1. ROTAS ──────────────────────────────────────────────────────────────────
const rotas = [];
linhas.forEach((linha, i) => {
  const match = linha.match(/app\.(get|post|put|delete)\(['"]([^'"]+)['"]/);
  if (match && !linha.trim().startsWith('//')) {
    const ctx = linhas.slice(i, i+25).join(' ').replace(/\s+/g,' ');
    rotas.push({
      metodo: match[1].toUpperCase(), rota: match[2], linha: i+1,
      requerLogin: ctx.includes('auth'),
      renderiza: (ctx.match(/res\.render\(['"]([^'"]+)['"]/) || [])[1] || null,
      redireciona: (ctx.match(/res\.redirect\(['"]([^'"]+)['"]/) || [])[1] || null,
      leDados: ['imoveis.json','data.json','visitas.json','notificacoes.json','users.json'].filter(f=>ctx.includes(f)),
      salvaDados: ctx.includes('writeFileSync'),
      aceitaUpload: ctx.includes('upload.any()') || ctx.includes('upload.single'),
      formatosUpload: [ctx.includes('.xml')?'.xml':null, ctx.includes('.xlsx')||ctx.includes('excel')?'.xlsx':null, ctx.includes('.csv')?'.csv':null].filter(Boolean),
      keywords: match[2].replace(/[/:]/g,' ').split(' ').filter(k=>k.length>2)
    });
  }
});

// ── 2. VIEWS ──────────────────────────────────────────────────────────────────
const views = {};
fs.readdirSync(viewsDir).filter(f=>f.endsWith('.ejs')&&!f.includes('backup')).forEach(file=>{
  const c = fs.readFileSync(path.join(viewsDir,file),'utf8');
  views[file] = {
    forms: [...c.matchAll(/action=["']([^"']+)["']/g)].map(m=>m[1]),
    links: [...c.matchAll(/href=["']([^"']+)["']/g)].map(m=>m[1]).filter(l=>l.startsWith('/')),
    fetches: [...c.matchAll(/fetch\(['"`]([^'"`]+)['"`]/g)].map(m=>m[1]),
    botoes: [...c.matchAll(/onclick=["']([^"']{0,100})["']/g)].map(m=>m[1]).slice(0,15),
    uploads: c.includes('type="file"')||c.includes("type='file'"),
    titulos: [...c.matchAll(/<(?:h[1-6]|strong|title)[^>]*>([^<]{4,60})</g)].map(m=>m[1].trim()).slice(0,8),
    temModal: c.includes('modal'), temGrafico: c.includes('chart')||c.includes('Chart')
  };
});

// ── 3. UPLOADS ────────────────────────────────────────────────────────────────
const uploads = rotas.filter(r=>r.aceitaUpload).map(r=>({
  rota: r.rota, metodo: r.metodo, formatos: r.formatosUpload,
  descricao: r.rota.includes('proprietar')?'Importar proprietários via Excel':
             r.rota.includes('importar')?'Importar imóveis via XML':
             r.rota.includes('leads')?'Importar leads via CSV/Excel':'Upload de arquivo'
}));

// ── 4. SINÔNIMOS ──────────────────────────────────────────────────────────────
const sinonimos = {
  'lids':'leads','lid':'lead','leades':'leads','leed':'lead',
  'imovei':'imovel','imovéis':'imoveis','vizita':'visita','vizitas':'visitas',
  'notificaçao':'notificacao','proprietaro':'proprietario',
  'conis':'coins','moedas':'coins','pontos':'coins',
  'dashbord':'dashboard','matsh':'match','mach':'match',
  'subir':'importar','enviar arquivo':'importar',
  'meus clientes':'leads','interessados':'leads','compradores':'leads',
  'minha carteira':'imoveis','meus imoveis':'imoveis',
  'quantos':'total','quantas':'total','ver':'listar','mostrar':'listar',
  'cadastrar':'cadastro','adicionar':'cadastro','apagar':'excluir',
  'inativar':'inativar','desativar':'inativar',
  'confirmar':'confirmar','aceitar':'confirmar',
  'recusar':'recusar','cancelar':'recusar',
  'remarcar':'remarcar','reagendar':'remarcar',
  'gerar xml':'gerar_xml','criar xml':'gerar_xml',
  'link do cliente':'vitrine','enviar pro cliente':'vitrine',
  'oi':'saudacao','olá':'saudacao','ola':'saudacao',
  'bom dia':'saudacao','boa tarde':'saudacao','boa noite':'saudacao',
  'tudo bem':'saudacao','hello':'saudacao','e ai':'saudacao'
};

// ── 5. INTENÇÕES SIMPLES ──────────────────────────────────────────────────────
const intencoes = [
  { id:'saudacao',         keywords:['saudacao','oi','ola','bom dia','boa tarde','boa noite','tudo','hello','eai'], acao:'mostrar_resumo_conta' },
  { id:'ver_leads',        keywords:['lead','leads','clientes','interessados','quantas lead'],                      acao:'buscar_dados_leads',   rota:'/app/leads' },
  { id:'importar_leads',   keywords:['importar lead','subir lead','planilha','csv','upload lead'],                  acao:'wizard',               fluxo:'wizard_importar_leads' },
  { id:'ver_imoveis',      keywords:['imovel','imoveis','carteira','apartamento','casa','quantos imoveis'],         acao:'buscar_dados_imoveis', rota:'/app/imoveis' },
  { id:'importar_xml',     keywords:['xml','subir xml','importar xml','tecimob','rankim'],                          acao:'wizard',               fluxo:'wizard_importar_xml' },
  { id:'ver_visitas',      keywords:['visita','visitas','agendamento','agendar','hoje'],                            acao:'buscar_dados_visitas', rota:'/app/visitas' },
  { id:'ver_match',        keywords:['match','combinar','compativel','leads match'],                                acao:'buscar_leads_match',   rota:'/app/leads' },
  { id:'gerar_xml',        keywords:['gerar xml','criar xml','xml portal','publicar','portal'],                     acao:'wizard',               fluxo:'wizard_gerar_xml_portal' },
  { id:'ver_portais',      keywords:['portais','portal','vivareal','zap','olx','chaves','imovelweb'],              acao:'navegar',              rota:'/app/portais' },
  { id:'ver_notificacoes', keywords:['notificacao','notificacoes','aviso','alerta','sino'],                        acao:'navegar',              rota:'/app/notificacoes' },
  { id:'ver_coins',        keywords:['coins','moeda','saldo','pontos'],                                            acao:'navegar',              rota:'/app/coins' },
  { id:'ver_dashboard',    keywords:['dashboard','home','grafico','resumo','estatistica','stats'],                 acao:'navegar',              rota:'/app-home' },
  { id:'cadastrar_imovel', keywords:['cadastrar','cadastro','novo imovel','adicionar imovel'],                     acao:'navegar',              rota:'/app/cadastro' },
  { id:'proprietarios',    keywords:['proprietario','proprietarios','dono','vincular proprietario'],               acao:'wizard',               fluxo:'wizard_proprietarios' },
  { id:'exportar',         keywords:['exportar','excel','baixar','download','relatorio'],                          acao:'navegar',              rota:'/app/imoveis/exportar-excel' },
  { id:'vitrine',          keywords:['vitrine','oferta','link cliente','enviar pro cliente'],                      acao:'explicar',             descricao:'A vitrine é o link /cliente/oferta/:leadId — compartilhe com o cliente para ele ver os imóveis em match e solicitar visita.' },
  { id:'ajuda',            keywords:['ajuda','socorro','como faz','nao sei','help','o que voce faz'],              acao:'mostrar_ajuda' }
];

// ── 6. INTENÇÕES COMPOSTAS ────────────────────────────────────────────────────
const intencoes_compostas = [
  { id:'leads_sem_match',          condicoes:['lead','sem match'],      rota:'/app/leads',   filtro:'sem_match' },
  { id:'leads_com_match',          condicoes:['lead','com match'],      rota:'/app/leads',   filtro:'com_match' },
  { id:'visitas_hoje',             condicoes:['visita','hoje'],         rota:'/app/visitas', filtro:'hoje' },
  { id:'visitas_pendentes',        condicoes:['visita','pendente'],     rota:'/app/visitas', filtro:'pendentes' },
  { id:'imoveis_inativos',         condicoes:['imovel','inativo'],      rota:'/app/imoveis', filtro:'inativos' },
  { id:'imoveis_sem_proprietario', condicoes:['imovel','proprietario'], rota:'/app/imoveis', filtro:'sem_proprietario' },
  { id:'leads_organicas',          condicoes:['lead','organica'],       rota:'/app/leads',   filtro:'organicas' },
  { id:'leads_importadas',         condicoes:['lead','importada'],      rota:'/app/leads',   filtro:'importadas' }
];

// ── 7. GATILHOS ───────────────────────────────────────────────────────────────
const gatilhos = [
  { id:'visitas_hoje',              condicao:'visitas_hoje > 0',        mensagem:'📅 Atenção! Você tem {n} visita(s) hoje!',                              prioridade:'alta' },
  { id:'visitas_pendentes_antigas', condicao:'visitas_pendentes_2d > 0',mensagem:'⚠️ {n} visita(s) sem resposta há mais de 2 dias!',                     prioridade:'alta' },
  { id:'leads_sem_match_antigos',   condicao:'leads_sem_match_7d > 0',  mensagem:'❌ {n} leads sem match há mais de 7 dias. Quer tentar o match agora?', prioridade:'alta' },
  { id:'xml_desatualizado',         condicao:'dias_sem_xml > 30',       mensagem:'📅 XML desatualizado há {n} dias. Quer importar um novo?',              prioridade:'media' },
  { id:'sem_leads',                 condicao:'leads === 0',             mensagem:'👥 Nenhuma lead ainda. Quer importar uma planilha?',                    prioridade:'media' },
  { id:'sem_imoveis',              condicao:'imoveis === 0',            mensagem:'🏠 Nenhum imóvel ainda. Quer importar um XML?',                         prioridade:'media' },
  { id:'sem_proprietario',          condicao:'sem_prop > 50',           mensagem:'🏠 {n} imóveis sem proprietário. Quer importar o Excel?',              prioridade:'baixa' }
];

// ── 8. FLUXOS GUIADOS ─────────────────────────────────────────────────────────
const fluxos = [
  {
    id:'wizard_importar_leads',
    passos:[
      { id:1, mensagem:'De onde são essas leads?', opcoes:['ImovelWeb','ZAP','VivaReal','OLX','Outro'], aguarda:'escolha' },
      { id:2, mensagem:'Envie o arquivo 📎 (CSV ou Excel)', aguarda:'arquivo', formatos:['.csv','.xlsx','.xls'] },
      { id:3, mensagem:'Importando... ⏳', acao:'upload', rota:'/app/leads' },
      { id:4, mensagem:'✅ {n} leads importadas! Quer fazer o match agora?', opcoes:['Sim, fazer match','Não agora'], aguarda:'escolha' }
    ]
  },
  {
    id:'wizard_importar_xml',
    passos:[
      { id:1, mensagem:'Qual o sistema de origem?', opcoes:['Tecimob','Rankim','Outro'], aguarda:'escolha' },
      { id:2, mensagem:'Envie o arquivo XML 📎', aguarda:'arquivo', formatos:['.xml'] },
      { id:3, mensagem:'Importando imóveis... ⏳', acao:'upload', rota:'/app/importar' },
      { id:4, mensagem:'✅ {n} imóveis importados! Quer gerar XML para algum portal?', opcoes:['VivaReal','ZAP','OLX','Não agora'], aguarda:'escolha' }
    ]
  },
  {
    id:'wizard_gerar_xml_portal',
    passos:[
      { id:1, mensagem:'Para qual portal?', opcoes:['VivaReal','ZAP','OLX','Chaves','ImovelWeb','123i'], aguarda:'escolha' },
      { id:2, mensagem:'Todos os ativos ou selecionar manualmente?', opcoes:['Todos os ativos','Selecionar em /app/imoveis'], aguarda:'escolha' },
      { id:3, mensagem:'Gerando XML... ⏳', acao:'gerar_xml', rota:'/app/gerar-xml' },
      { id:4, mensagem:'✅ XML gerado! Acesse /app/portais para o link do feed.' }
    ]
  },
  {
    id:'wizard_proprietarios',
    passos:[
      { id:1, mensagem:'Envie o Excel de proprietários 📎 (padrão Tecimob)', aguarda:'arquivo', formatos:['.xlsx'] },
      { id:2, mensagem:'Vinculando... ⏳', acao:'upload', rota:'/app/importar-proprietarios' },
      { id:3, mensagem:'✅ {n} proprietários vinculados!' }
    ]
  }
];

// ── 9. COMANDOS DIRETOS ───────────────────────────────────────────────────────
const comandos_diretos = [
  { id:'inativar_imovel',  padroes:['inativar imovel {id}'],  extrai:['id'],     acao:'POST', rota:'/app/imoveis/{id}/inativar',  confirmacao:'Inativar imóvel {id}?' },
  { id:'confirmar_visita', padroes:['confirmar visita {id}'], extrai:['id'],     acao:'POST', rota:'/app/visitas/confirmar/{id}', confirmacao:'Confirmar visita {id}?' },
  { id:'recusar_visita',   padroes:['recusar visita {id}'],   extrai:['id'],     acao:'POST', rota:'/app/visitas/recusar/{id}',   confirmacao:'Recusar visita {id}?' },
  { id:'gerar_xml_portal', padroes:['gerar xml {portal}'],    extrai:['portal'], acao:'POST', rota:'/app/gerar-xml',              confirmacao:'Gerar XML para {portal}?' },
  { id:'buscar_imovel',    padroes:['tem {tipo} em {bairro}'],extrai:['tipo','bairro'], acao:'busca_local', arquivo:'imoveis.json' },
  { id:'buscar_lead',      padroes:['lead em {bairro}'],      extrai:['bairro'], acao:'busca_local', arquivo:'data.json' }
];

// ── 10. ONBOARDING ────────────────────────────────────────────────────────────
const onboarding = {
  detectar: 'user.onboardingConcluido === false ou ausente',
  passos: [
    { id:1, titulo:'Importar imóveis',  acao:'wizard_importar_xml',   concluido_quando:'imoveis.length > 0' },
    { id:2, titulo:'Importar leads',    acao:'wizard_importar_leads', concluido_quando:'leads.length > 0' },
    { id:3, titulo:'Fazer match',       acao:'match',                 concluido_quando:'leads.comMatch > 0' },
    { id:4, titulo:'Enviar vitrine',    acao:'vitrine',               concluido_quando:'visitas.length > 0' }
  ],
  mensagem_boas_vindas: 'Olá {nome}! 👋 Seja bem-vindo ao MatchImóveis! Sou o Match, seu assistente pessoal. Vamos configurar sua conta juntos? É rapidinho! 🚀',
  mensagem_completo: '🎉 Parabéns {nome}! Conta configurada com sucesso. Agora você pode usar todo o poder do MatchImóveis!'
};

// ── 11. APRENDIZADO ───────────────────────────────────────────────────────────
const aprendizado = {
  arquivo_nao_entendidos: 'assistente-nao-entendidos.json',
  threshold_virar_oficial: 3,
  fluxo: [
    'Pergunta não entendida → salvar com userId+data',
    'Agrupar por similaridade >= 60%',
    '3+ perguntas similares → sugerir nova intenção',
    'Admin aprova → vira intenção oficial'
  ]
};

// ── 12. MEMÓRIA POR USUÁRIO ───────────────────────────────────────────────────
const memoria_usuario = {
  arquivo: 'assistente-memoria.json',
  campos: ['preferencias','historico','onboarding_concluido','ultima_atividade'],
  preferencias: ['tipo_favorito','bairros_favoritos','portal_mais_usado','ultima_importacao']
};

// ── 13. EXPLICAÇÕES DO SISTEMA ────────────────────────────────────────────────
const explicacoes_sistema = [
  { id:'match',   keywords:['o que e match','como funciona match','explicar match'],       texto:'Match é quando um imóvel da sua carteira combina com o que um lead procura. O sistema cruza bairro+tipo+quartos automaticamente.' },
  { id:'vitrine', keywords:['o que e vitrine','como funciona vitrine','explicar vitrine'], texto:'Vitrine é uma página exclusiva enviada ao lead com os imóveis em match. O lead escolhe e solicita visita — tudo automático!' },
  { id:'score',   keywords:['score','pontuacao','como calcula','nota do match'],           texto:'Score define a ordem na vitrine: valor abaixo do max +50pts, área maior +30pts, quartos extras +20pts, suítes +15pts, vagas +15pts.' },
  { id:'lead',    keywords:['o que e lead','explicar lead','o que significa lead'],        texto:'Lead é um cliente interessado em comprar/alugar. Você importa planilhas dos portais e o sistema faz o match automático.' },
  { id:'xml',     keywords:['o que e xml','para que serve xml','explicar xml'],            texto:'XML é o arquivo que envia seus imóveis para portais (VivaReal, ZAP, OLX). Gere aqui e cadastre o link no portal.' },
  { id:'coins',   keywords:['o que sao coins','para que servem coins','explicar coins'],   texto:'Match Coins são pontos ganhos a cada match realizado. Futuramente usados para recursos premium.' },
  { id:'visita',  keywords:['como funciona visita','fluxo visita','como agendar visita'], texto:'Fluxo: Lead recebe vitrine → escolhe imóvel → solicita visita → proprietário confirma/recusa → lead notificado. Tudo automático!' }
];

// ── 14. PERSONALIDADE ─────────────────────────────────────────────────────────
const personalidade = {
  nome: 'Match',
  tom: 'amigável, educado, calmo, prestativo e inteligente',
  regras: [
    'Sempre cumprimentar pelo nome',
    'Nunca responder de forma seca ou robótica',
    'Quando não entender, pedir para reformular com gentileza',
    'Sempre oferecer próximo passo após responder',
    'Ser proativo: sugerir o que o usuário pode não ter pensado',
    'Elogiar quando usuário faz algo certo',
    'Confirmar antes de executar ações importantes'
  ],
  frases_nao_entendeu: [
    'Hmm, não entendi muito bem 🤔 Pode reformular?',
    'Desculpe, não captei essa. Pode tentar de outro jeito?',
    'Ainda estou aprendendo! Tente: leads, imóveis, visitas ou match.'
  ],
  proximo_passo: {
    apos_importar_xml:   'Agora que tem imóveis, que tal importar leads para fazer o match?',
    apos_importar_leads: 'Ótimo! Quer fazer o match agora?',
    apos_match:          'Match feito! Quer enviar a vitrine para algum lead?',
    apos_ver_leads:      'Quer ver quais leads têm match com seus imóveis?',
    apos_ver_imoveis:    'Quer importar leads para cruzar com essa carteira?'
  }
};

// ── 15. MÉTRICAS ──────────────────────────────────────────────────────────────
const metricas_assistente = {
  arquivo: 'assistente-metricas.json',
  coleta: ['total_perguntas_hoje','total_respondidas','total_nao_entendidas','taxa_satisfacao','perguntas_frequentes']
};

// ── 16. PÓS-VISITA ────────────────────────────────────────────────────────────
const pos_visita = {
  keywords: ['como foi','visita foi','cliente gostou','retorno da visita'],
  gatilhos: [
    { id:'perguntar_como_foi', condicao:'visita.dataVisita === ontem && status === confirmada', mensagem:'📅 Como foi a visita de ontem no {imovel}? O cliente {lead} demonstrou interesse?', opcoes:['Sim, gostou!','Não se interessou','Vai pensar','Quer mais opções'] },
    { id:'follow_up',          condicao:'lead sem visita há 15+ dias', mensagem:'👥 A lead {nome} está há {dias} dias sem visita. Quer entrar em contato?', opcoes:['Enviar vitrine','Já contatei','Desqualificar'] }
  ]
};

// ── 17. ESTRATÉGIAS DE VENDA ──────────────────────────────────────────────────
const estrategias_venda = {
  keywords: ['vender','fechar','negocio','proposta','ajudar vender','leads quentes'],
  sugestoes: [
    { id:'lead_quente',          condicao:'visita confirmada + score alto',    mensagem:'🔥 A lead {nome} está QUENTE! Visitou e tem alto score. Hora de fechar!' },
    { id:'imovel_parado',        condicao:'imovel ativo há 30+ dias sem visita', mensagem:'📉 {imovel} há {dias} dias sem visita. Considere revisar o valor ou as fotos.' },
    { id:'reducao_valor',        condicao:'imovel sem visita há 45+ dias',     mensagem:'💰 Uma redução de 5-10% no {imovel} pode gerar mais interesse.' },
    { id:'alta_intencao',        condicao:'score > 100 e visita agendada',     mensagem:'🎯 {nome} tem altíssima intenção de compra (score {score}). Priorize!' }
  ]
};

// ── 18. INTELIGÊNCIA DE MERCADO ───────────────────────────────────────────────
const inteligencia_mercado = {
  keywords: ['mercado','demanda','tendencia','mais buscado','faixa mais pedida'],
  analises: [
    { id:'tipo_mais_demandado',    descricao:'Tipo de imóvel com mais leads' },
    { id:'faixa_valor_buscada',    descricao:'Faixa de valor mais procurada pelas leads' },
    { id:'bairros_mais_demandados',descricao:'Ranking de bairros por demanda' },
    { id:'oferta_vs_demanda',      descricao:'Leads por bairro vs imóveis disponíveis' },
    { id:'quartos_mais_pedidos',   descricao:'Quantidade de quartos mais buscada' }
  ]
};

// ── MONTAR CÉREBRO FINAL ──────────────────────────────────────────────────────
const cerebro = {
  versao: '11.0',
  geradoEm: new Date().toISOString(),
  stats: {
    totalRotas: rotas.length,
    totalViews: Object.keys(views).length,
    totalUploads: uploads.length,
    totalIntencoes: intencoes.length,
    totalIntencoesCompostas: intencoes_compostas.length,
    totalGatilhos: gatilhos.length,
    totalFluxos: fluxos.length,
    totalComandosDiretos: comandos_diretos.length,
    totalSinonimos: Object.keys(sinonimos).length,
    totalExplicacoes: explicacoes_sistema.length,
    totalPassosOnboarding: onboarding.passos.length,
    totalRegrasPersonalidade: personalidade.regras.length,
    totalAnalisesMercado: inteligencia_mercado.analises.length
  },
  rotas, views, uploads, sinonimos,
  intencoes, intencoes_compostas, gatilhos, fluxos, comandos_diretos,
  onboarding, aprendizado, memoria_usuario, explicacoes_sistema,
  personalidade, metricas_assistente, pos_visita, estrategias_venda,
  inteligencia_mercado
};

fs.writeFileSync('assistente-mapa.json', JSON.stringify(cerebro, null, 2));

console.log('✅ Cérebro v11.0 completo!');
console.log('   Rotas:              ', cerebro.stats.totalRotas);
console.log('   Views:              ', cerebro.stats.totalViews);
console.log('   Uploads:            ', cerebro.stats.totalUploads);
console.log('   Intenções simples:  ', cerebro.stats.totalIntencoes);
console.log('   Intenções compostas:', cerebro.stats.totalIntencoesCompostas);
console.log('   Gatilhos:           ', cerebro.stats.totalGatilhos);
console.log('   Fluxos guiados:     ', cerebro.stats.totalFluxos);
console.log('   Sinônimos:          ', cerebro.stats.totalSinonimos);
console.log('   Explicações:        ', cerebro.stats.totalExplicacoes);
console.log('   Regras personalidade:', cerebro.stats.totalRegrasPersonalidade);
console.log('   Análises mercado:   ', cerebro.stats.totalAnalisesMercado);

// ── 19. BASE DE CONHECIMENTO COMPLETA ────────────────────────────────────────
const base_conhecimento = [
  // LEADS
  { p:'quantas leads tenho',           r:'buscar_dados_leads' },
  { p:'quantas leads sem match',       r:'leads_sem_match' },
  { p:'quantas leads com match',       r:'leads_com_match' },
  { p:'quantas leads organicas',       r:'leads_organicas' },
  { p:'quantas leads importadas',      r:'leads_importadas' },
  { p:'qual lead chegou hoje',         r:'leads_hoje' },
  { p:'qual minha lead mais recente',  r:'lead_mais_recente' },
  { p:'lead procurando em qual bairro',r:'bairros_mais_demandados' },
  { p:'qual tipo mais pedido nas leads',r:'tipo_mais_demandado' },
  { p:'qual faixa de valor as leads buscam', r:'faixa_valor_buscada' },
  { p:'quantos quartos as leads pedem',r:'quartos_mais_pedidos' },
  { p:'como importar leads',           r:'wizard_importar_leads' },
  { p:'de onde vem as leads',          r:'explicar_origem_leads' },
  { p:'como funciona a extração',      r:'explicar_extracao' },
  { p:'lead sem resposta',             r:'leads_sem_contato' },
  { p:'leads antigas',                 r:'leads_antigas' },
  { p:'desqualificar lead',            r:'arquivar_lead' },
  { p:'lead quente',                   r:'leads_quentes' },
  // IMÓVEIS
  { p:'quantos imoveis tenho',         r:'buscar_dados_imoveis' },
  { p:'quantos imoveis ativos',        r:'imoveis_ativos' },
  { p:'quantos imoveis inativos',      r:'imoveis_inativos' },
  { p:'imoveis sem proprietario',      r:'imoveis_sem_proprietario' },
  { p:'qual meu imovel mais caro',     r:'imovel_mais_caro' },
  { p:'qual meu imovel mais barato',   r:'imovel_mais_barato' },
  { p:'imovel parado sem visita',      r:'imoveis_sem_visita' },
  { p:'como cadastrar imovel',         r:'navegar:/app/cadastro' },
  { p:'como editar imovel',            r:'navegar:/app/imoveis' },
  { p:'como inativar imovel',          r:'explicar_inativar' },
  { p:'valor medio da carteira',       r:'valor_medio_carteira' },
  { p:'imoveis por bairro',            r:'imoveis_por_bairro' },
  { p:'imoveis por tipo',              r:'imoveis_por_tipo' },
  { p:'tem apartamento em',            r:'buscar_imovel_bairro' },
  { p:'tem casa em',                   r:'buscar_imovel_bairro' },
  // VISITAS
  { p:'quantas visitas tenho',         r:'buscar_dados_visitas' },
  { p:'visitas de hoje',               r:'visitas_hoje' },
  { p:'visitas pendentes',             r:'visitas_pendentes' },
  { p:'visitas confirmadas',           r:'visitas_confirmadas' },
  { p:'como funciona a visita',        r:'explicar_visita' },
  { p:'como confirmar visita',         r:'navegar:/app/visitas' },
  { p:'como recusar visita',           r:'navegar:/app/visitas' },
  { p:'como remarcar visita',          r:'navegar:/app/visitas' },
  { p:'como foi a visita',             r:'perguntar_pos_visita' },
  { p:'cliente gostou',                r:'registrar_feedback_visita' },
  // MATCH
  { p:'como funciona o match',         r:'explicar_match' },
  { p:'por que nao tem match',         r:'diagnosticar_sem_match' },
  { p:'taxa de match',                 r:'taxa_match' },
  { p:'como melhorar o match',         r:'dicas_match' },
  { p:'fazer match agora',             r:'executar_match' },
  // PORTAIS E XML
  { p:'como gerar xml',                r:'wizard_gerar_xml_portal' },
  { p:'qual portal usar',              r:'comparar_portais' },
  { p:'xml do vivareal',               r:'gerar_xml:vivareal' },
  { p:'xml do zap',                    r:'gerar_xml:zap' },
  { p:'xml do olx',                    r:'gerar_xml:olx' },
  { p:'status dos portais',            r:'status_todos_portais' },
  { p:'quando atualizei o xml',        r:'ultima_atualizacao_xml' },
  { p:'quantos imoveis no portal',     r:'total_imoveis_portal' },
  // PROPRIETÁRIOS
  { p:'como vincular proprietario',    r:'wizard_proprietarios' },
  { p:'imoveis sem dono',              r:'imoveis_sem_proprietario' },
  { p:'telefone do proprietario',      r:'buscar_telefone_proprietario' },
  // FINANCEIRO
  { p:'minha comissao estimada',       r:'comissao_estimada' },
  { p:'quanto posso ganhar',           r:'potencial_receita' },
  { p:'ticket medio das leads',        r:'ticket_medio_leads' },
  // RELATÓRIOS
  { p:'relatorio do mes',              r:'relatorio_mensal' },
  { p:'taxa de conversao',             r:'taxa_conversao' },
  { p:'leads por origem',              r:'relatorio_leads_origem' },
  { p:'comparativo mes passado',       r:'comparativo_mensal' },
  // CONFIGURAÇÕES
  { p:'alterar senha',                 r:'navegar:/app/perfil' },
  { p:'meu perfil',                    r:'navegar:/app/perfil' },
  { p:'meu plano',                     r:'navegar:/app/perfil' },
  // SISTEMA
  { p:'o que e match',                 r:'explicar:match' },
  { p:'o que e vitrine',               r:'explicar:vitrine' },
  { p:'o que e lead',                  r:'explicar:lead' },
  { p:'o que e xml',                   r:'explicar:xml' },
  { p:'o que sao coins',               r:'explicar:coins' },
  { p:'como funciona o score',         r:'explicar:score' },
  { p:'o que voce faz',                r:'mostrar_ajuda' },
  { p:'o que posso fazer aqui',        r:'mostrar_ajuda' },
  { p:'me ajuda a vender',             r:'estrategia_venda' },
  { p:'resumo do dia',                 r:'resumo_diario' },
  { p:'o que devo fazer hoje',         r:'resumo_acoes_dia' },
  // COMUNICAÇÃO
  { p:'enviar vitrine para cliente',   r:'copiar_link_vitrine' },
  { p:'mandar link para lead',         r:'copiar_link_vitrine' },
  { p:'whatsapp do cliente',           r:'abrir_whatsapp_lead' },
  { p:'notificar proprietario',        r:'notificar_proprietario' },
  // COINS
  { p:'meus coins',                    r:'navegar:/app/coins' },
  { p:'como ganhar coins',             r:'explicar_coins' },
  { p:'meu saldo de coins',            r:'navegar:/app/coins' }
];

cerebro.base_conhecimento    = base_conhecimento;
cerebro.versao               = '12.0';
cerebro.geradoEm             = new Date().toISOString();
cerebro.stats.totalConhecimento = base_conhecimento.length;
