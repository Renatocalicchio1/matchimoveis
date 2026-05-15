// cerebro.js v13.0 — Gera assistente-mapa.json + cerebro-nlp.js
const fs   = require('fs');
const path = require('path');

console.log('🧠 Gerando cérebro v13.0...');

const server = fs.readFileSync('server.js', 'utf8');
const linhas = server.split('\n');
const viewsDir = './views';

const rotas = [];
linhas.forEach((linha, i) => {
  const match = linha.match(/app\.(get|post|put|delete)\(['"]([^'"]+)['"]/);
  if (match && !linha.trim().startsWith('//')) {
    const ctx = linhas.slice(i, i+25).join(' ').replace(/\s+/g,' ');
    rotas.push({
      metodo: match[1].toUpperCase(), rota: match[2], linha: i+1,
      requerLogin: ctx.includes('auth'),
      renderiza: (ctx.match(/res\.render\(['"]([^'"]+)['"]/) || [])[1] || null,
      leDados: ['imoveis.json','data.json','visitas.json','notificacoes.json','users.json'].filter(f=>ctx.includes(f)),
      salvaDados: ctx.includes('writeFileSync'),
      aceitaUpload: ctx.includes('upload.any()') || ctx.includes('upload.single'),
      formatosUpload: [ctx.includes('.xml')?'.xml':null,(ctx.includes('.xlsx')||ctx.includes('excel'))?'.xlsx':null,ctx.includes('.csv')?'.csv':null].filter(Boolean),
      keywords: match[2].replace(/[/:]/g,' ').split(' ').filter(k=>k.length>2)
    });
  }
});

const views = {};
if (fs.existsSync(viewsDir)) {
  fs.readdirSync(viewsDir).filter(f=>f.endsWith('.ejs')&&!f.includes('backup')).forEach(file=>{
    const c = fs.readFileSync(path.join(viewsDir,file),'utf8');
    views[file] = {
      forms: [...c.matchAll(/action=["']([^"']+)["']/g)].map(m=>m[1]),
      links: [...c.matchAll(/href=["']([^"']+)["']/g)].map(m=>m[1]).filter(l=>l.startsWith('/')),
      fetches: [...c.matchAll(/fetch\(['"`]([^'"`]+)['"`]/g)].map(m=>m[1]),
      uploads: c.includes('type="file"')||c.includes("type='file'"),
      titulos: [...c.matchAll(/<(?:h[1-6]|title)[^>]*>([^<]{4,60})</g)].map(m=>m[1].trim()).slice(0,8)
    };
  });
}

const uploads = rotas.filter(r=>r.aceitaUpload).map(r=>({
  rota: r.rota, metodo: r.metodo, formatos: r.formatosUpload,
  descricao: r.rota.includes('proprietar')?'Importar proprietários':r.rota.includes('importar')?'Importar imóveis XML':r.rota.includes('leads')?'Importar leads CSV':'Upload'
}));

const sinonimos = {
  'lids':'leads','lid':'lead','leades':'leads','leed':'lead','lide':'lead','lides':'leads',
  'imovei':'imovel','imovéis':'imoveis','vizita':'visita','vizitas':'visitas',
  'notificações':'notificacoes','proprietaro':'proprietario',
  'conis':'coins','moedas':'coins','pontos':'coins','saldo':'coins',
  'dashbord':'dashboard','dash':'dashboard',
  'matsh':'match','mach':'match','matches':'match',
  'subir':'importar','upload':'importar',
  'meus clientes':'leads','interessados':'leads','compradores':'leads',
  'minha carteira':'imoveis','meus imoveis':'imoveis',
  'quantos':'total','quantas':'total','apagar':'excluir','deletar':'excluir',
  'desativar':'inativar','arquivar':'inativar',
  'reagendar':'remarcar','mudar data':'remarcar',
  'gerar xml':'gerar_xml','exportar xml':'gerar_xml',
  'link do cliente':'vitrine','oferta':'vitrine',
  'oi':'saudacao','olá':'saudacao','ola':'saudacao','e ai':'saudacao',
  'bom dia':'saudacao','boa tarde':'saudacao','boa noite':'saudacao',
  'hello':'saudacao','hi':'saudacao','hey':'saudacao',
  'qto':'quarto','qtos':'quartos','vaga':'vagas','garagem':'vagas',
  'preço':'preco','custo':'preco','m2':'metragem','metros':'metragem'
};

const intencoes_nlp = [
  { id:'saudacao',         keywords:['saudacao','oi','ola','bom dia','boa tarde','boa noite','hello','hey'], boost:['bem','como vai'], penalize:[], acao:'mostrar_resumo_conta', score_min:0.3 },
  { id:'ver_leads',        keywords:['lead','leads','cliente','clientes','interessado'], boost:['quantas','quantos','minhas','ver','listar'], penalize:['importar','subir'], acao:'buscar_dados_leads', rota:'/app/leads', score_min:0.35 },
  { id:'importar_leads',   keywords:['importar','subir','upload','planilha','csv'], boost:['lead','leads','arquivo'], penalize:[], acao:'wizard', fluxo:'wizard_importar_leads', score_min:0.4 },
  { id:'ver_imoveis',      keywords:['imovel','imoveis','apartamento','casa','carteira'], boost:['quantos','meus','ver','listar','ativo'], penalize:['importar','cadastrar'], acao:'buscar_dados_imoveis', rota:'/app/imoveis', score_min:0.35 },
  { id:'importar_xml',     keywords:['xml','importar xml','subir xml','tecimob','rankim'], boost:['importar','subir','arquivo'], penalize:['gerar','criar'], acao:'wizard', fluxo:'wizard_importar_xml', score_min:0.4 },
  { id:'ver_visitas',      keywords:['visita','visitas','agendamento','agendar','hoje'], boost:['minhas','pendentes','confirmadas','quantas'], penalize:[], acao:'buscar_dados_visitas', rota:'/app/visitas', score_min:0.35 },
  { id:'ver_match',        keywords:['match','combinar','compativel','cruzar'], boost:['fazer','rodar','ver','quantas leads'], penalize:[], acao:'buscar_leads_match', rota:'/app/leads', score_min:0.4 },
  { id:'gerar_xml',        keywords:['gerar xml','criar xml','xml portal','publicar','portal'], boost:['vivareal','zap','olx','chaves','imovelweb'], penalize:['importar'], acao:'wizard', fluxo:'wizard_gerar_xml_portal', score_min:0.4 },
  { id:'ver_portais',      keywords:['portais','portal','vivareal','zap','olx'], boost:['ver','status','feed'], penalize:['gerar','criar'], acao:'navegar', rota:'/app/portais', score_min:0.4 },
  { id:'ver_dashboard',    keywords:['dashboard','resumo','grafico','estatistica','home'], boost:['ver','abrir','meu'], penalize:[], acao:'navegar', rota:'/app-home', score_min:0.35 },
  { id:'cadastrar_imovel', keywords:['cadastrar','novo imovel','adicionar imovel'], boost:['quero','preciso'], penalize:['importar'], acao:'navegar', rota:'/app/cadastro', score_min:0.45 },
  { id:'proprietarios',    keywords:['proprietario','proprietarios','dono','vincular'], boost:['importar','excel','telefone'], penalize:[], acao:'wizard', fluxo:'wizard_proprietarios', score_min:0.4 },
  { id:'vitrine',          keywords:['vitrine','oferta','link','enviar cliente'], boost:['lead','cliente'], penalize:[], acao:'explicar', descricao:'A vitrine é o link /cliente/oferta/:leadId — compartilhe com o cliente para ele ver os imóveis em match.', score_min:0.4 },
  { id:'estrategia_venda', keywords:['vender','fechar','negocio','proposta','lead quente'], boost:['como','dica'], penalize:[], acao:'estrategia_venda', score_min:0.4 },
  { id:'mercado',          keywords:['mercado','demanda','tendencia','mais buscado'], boost:['analise','relatorio'], penalize:[], acao:'analise_mercado', score_min:0.4 },
  { id:'resumo_dia',       keywords:['resumo','o que fazer','acoes','prioridade','devo fazer'], boost:['dia','agora','hoje'], penalize:[], acao:'resumo_diario', score_min:0.4 },
  { id:'ajuda',            keywords:['ajuda','help','como faz','nao sei','o que voce faz'], boost:['fazer','usar'], penalize:[], acao:'mostrar_ajuda', score_min:0.3 }
];

const gatilhos = [
  { id:'visitas_hoje',      condicao:'visitas_hoje > 0',      mensagem:'📅 Você tem {n} visita(s) hoje!',            prioridade:'alta' },
  { id:'leads_sem_match',   condicao:'leads_sem_match > 5',   mensagem:'❌ {n} leads sem match. Quer fazer agora?',  prioridade:'alta' },
  { id:'sem_leads',         condicao:'leads === 0',           mensagem:'👥 Nenhuma lead ainda. Quer importar?',      prioridade:'media' },
  { id:'sem_imoveis',       condicao:'imoveis === 0',         mensagem:'🏠 Nenhum imóvel. Quer importar XML?',       prioridade:'media' },
  { id:'xml_antigo',        condicao:'dias_sem_xml > 30',     mensagem:'📅 XML desatualizado há {n} dias.',          prioridade:'baixa' }
];

const fluxos = [
  { id:'wizard_importar_leads', passos:[
    { id:1, mensagem:'De onde são essas leads?', opcoes:['ImovelWeb','ZAP','VivaReal','OLX','Outro'], aguarda:'escolha' },
    { id:2, mensagem:'Envie o arquivo 📎 (CSV ou Excel)', aguarda:'arquivo', formatos:['.csv','.xlsx'] },
    { id:3, mensagem:'Importando... ⏳', acao:'upload', rota:'/app/leads' },
    { id:4, mensagem:'✅ {n} leads importadas! Quer fazer o match?', opcoes:['Sim','Não agora'], aguarda:'escolha' }
  ]},
  { id:'wizard_importar_xml', passos:[
    { id:1, mensagem:'Qual sistema de origem?', opcoes:['Tecimob','Rankim','Outro'], aguarda:'escolha' },
    { id:2, mensagem:'Envie o arquivo XML 📎', aguarda:'arquivo', formatos:['.xml'] },
    { id:3, mensagem:'Importando... ⏳', acao:'upload', rota:'/app/importar' },
    { id:4, mensagem:'✅ Importado! Quer gerar XML para algum portal?', opcoes:['VivaReal','ZAP','OLX','Não agora'], aguarda:'escolha' }
  ]},
  { id:'wizard_gerar_xml_portal', passos:[
    { id:1, mensagem:'Para qual portal?', opcoes:['VivaReal','ZAP','OLX','Chaves','ImovelWeb','123i'], aguarda:'escolha' },
    { id:2, mensagem:'Todos os ativos ou selecionar?', opcoes:['Todos os ativos','Ir para /app/imoveis'], aguarda:'escolha' },
    { id:3, mensagem:'Gerando... ⏳', acao:'gerar_xml', rota:'/app/gerar-xml' },
    { id:4, mensagem:'✅ XML gerado! Acesse /app/portais para o link.' }
  ]},
  { id:'wizard_proprietarios', passos:[
    { id:1, mensagem:'Envie o Excel de proprietários 📎 (padrão Tecimob)', aguarda:'arquivo', formatos:['.xlsx'] },
    { id:2, mensagem:'Vinculando... ⏳', acao:'upload', rota:'/app/importar-proprietarios' },
    { id:3, mensagem:'✅ {n} proprietários vinculados!' }
  ]}
];

const onboarding = {
  passos:[
    { id:1, titulo:'Importar imóveis',  acao:'wizard_importar_xml',   concluido_quando:'imoveis > 0' },
    { id:2, titulo:'Importar leads',    acao:'wizard_importar_leads', concluido_quando:'leads > 0' },
    { id:3, titulo:'Fazer match',       acao:'match',                 concluido_quando:'leads_com_match > 0' },
    { id:4, titulo:'Enviar vitrine',    acao:'vitrine',               concluido_quando:'visitas > 0' }
  ],
  boas_vindas: 'Olá {nome}! 👋 Seja bem-vindo ao MatchImóveis! Sou o Match, seu assistente. Vamos configurar? 🚀',
  completo:    '🎉 Parabéns {nome}! Conta configurada. Agora você tem todo o poder do MatchImóveis!'
};

const personalidade = {
  nome: 'Match',
  tom: 'amigável, prestativo, direto e inteligente',
  regras: [
    'Cumprimentar pelo nome quando possível',
    'Nunca responder de forma seca ou robótica',
    'Quando não entender, pedir reformulação com gentileza',
    'Sempre oferecer próximo passo após responder',
    'Ser proativo: sugerir o que o usuário pode não ter pensado',
    'Confirmar antes de executar ações importantes',
    'Usar dados reais quando disponíveis',
    'Responder em até 3 linhas quando possível'
  ],
  frases_nao_entendeu: [
    'Hmm, não entendi 🤔 Pode reformular?',
    'Não captei. Tente: leads, imóveis, visitas ou match.',
    'Pode tentar de outro jeito? Ex: "quantas leads tenho hoje"'
  ]
};

const explicacoes = [
  { id:'match',   keywords:['o que e match','como funciona match'],    texto:'Match cruza bairro+tipo+quartos de cada lead com seus imóveis. Automático.' },
  { id:'vitrine', keywords:['o que e vitrine','como funciona vitrine'],texto:'Vitrine é uma página exclusiva para o lead ver os imóveis em match e solicitar visita.' },
  { id:'score',   keywords:['score','pontuacao','como calcula'],       texto:'Score da lead: tipo+20, quartos+15, valor+15, bairro+12, urgência+15, fase funil até +20.' },
  { id:'lead',    keywords:['o que e lead','explicar lead'],           texto:'Lead é um cliente interessado. Importe planilhas dos portais e o match é automático.' },
  { id:'xml',     keywords:['o que e xml','para que serve xml'],       texto:'XML envia seus imóveis para portais (VivaReal, ZAP, OLX). Gere aqui e cadastre o link.' },
  { id:'coins',   keywords:['o que sao coins','para que servem coins'],texto:'Match Coins são pontos por match realizado. Usados futuramente para recursos premium.' }
];

const base_conhecimento = [
  { p:'quantas leads tenho',              r:'buscar_dados_leads' },
  { p:'quantas leads sem match',          r:'leads_sem_match' },
  { p:'quantas leads com match',          r:'leads_com_match' },
  { p:'como importar leads',              r:'wizard_importar_leads' },
  { p:'quantos imoveis tenho',            r:'buscar_dados_imoveis' },
  { p:'imoveis sem proprietario',         r:'imoveis_sem_proprietario' },
  { p:'como cadastrar imovel',            r:'navegar:/app/cadastro' },
  { p:'quantas visitas tenho',            r:'buscar_dados_visitas' },
  { p:'visitas de hoje',                  r:'visitas_hoje' },
  { p:'visitas pendentes',                r:'visitas_pendentes' },
  { p:'como funciona o match',            r:'explicar_match' },
  { p:'como gerar xml',                   r:'wizard_gerar_xml_portal' },
  { p:'como vincular proprietario',       r:'wizard_proprietarios' },
  { p:'me ajuda a vender',               r:'estrategia_venda' },
  { p:'resumo do dia',                    r:'resumo_diario' },
  { p:'o que devo fazer hoje',            r:'resumo_acoes_dia' },
  { p:'enviar vitrine para cliente',      r:'copiar_link_vitrine' }
];

const cerebro = {
  versao: '13.0',
  geradoEm: new Date().toISOString(),
  stats: {
    totalRotas:        rotas.length,
    totalViews:        Object.keys(views).length,
    totalUploads:      uploads.length,
    totalIntencoes:    intencoes_nlp.length,
    totalGatilhos:     gatilhos.length,
    totalFluxos:       fluxos.length,
    totalSinonimos:    Object.keys(sinonimos).length,
    totalExplicacoes:  explicacoes.length,
    totalConhecimento: base_conhecimento.length
  },
  rotas, views, uploads, sinonimos,
  intencoes_nlp, gatilhos, fluxos,
  onboarding, personalidade, explicacoes, base_conhecimento
};

fs.writeFileSync('assistente-mapa.json', JSON.stringify(cerebro, null, 2));
console.log('✅ Cérebro v13.0 completo!');
Object.entries(cerebro.stats).forEach(([k,v]) => console.log('  ', k+':', v));

// ── GERA cerebro-nlp.js ───────────────────────────────────────
const nlp = `// cerebro-nlp.js v3.0 — NÃO EDITAR — gerado por npm run cerebro
const sinonimos = ${JSON.stringify(sinonimos)};
const intencoes = ${JSON.stringify(intencoes_nlp)};

function normalizar(txt) {
  if (!txt) return '';
  return txt.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^\\w\\s]/g,' ')
    .split(/\\s+/).map(t => sinonimos[t] || t).join(' ');
}

function detectarIntencao(texto) {
  const norm = normalizar(texto);
  let melhor = null, melhorScore = 0;
  for (const intencao of intencoes) {
    let score = 0, hits = 0;
    for (const kw of intencao.keywords) { if (norm.includes(kw)) { score += 1.0; hits++; } }
    if (hits === 0) continue;
    score = score / intencao.keywords.length;
    for (const b of (intencao.boost||[])) { if (norm.includes(b)) score += 0.2; }
    for (const p of (intencao.penalize||[])) { if (norm.includes(p)) score -= 0.3; }
    score = Math.max(0, Math.min(score, 1.0));
    if (score >= intencao.score_min && score > melhorScore) { melhor = intencao; melhorScore = score; }
  }
  return { intencao: melhor ? melhor.id : 'nao_entendido', score: melhorScore, acao: melhor?.acao||null, rota: melhor?.rota||null, fluxo: melhor?.fluxo||null, descricao: melhor?.descricao||null, confiante: melhorScore >= 0.6 };
}

function extrairSlots(texto) {
  const norm = normalizar(texto);
  const slots = {};
  for (const t of ['apartamento','apto','casa','sobrado','sala','studio','kitnet','cobertura','terreno']) { if (norm.includes(t)) { slots.tipo = t; break; } }
  const m1 = norm.match(/(\\d+)\\s*(quarto|dormitorio|suite)/);
  const m2 = norm.match(/(quarto|dormitorio)\\s*[:\\-]?\\s*(\\d+)/);
  if (m1) slots.quartos = parseInt(m1[1]); else if (m2) slots.quartos = parseInt(m2[2]);
  const ate = norm.match(/(?:ate|maximo)\\s*r?\\$?\\s*([\\d.,]+)\\s*(mil|k|m)?/);
  if (ate) { let v = parseFloat(ate[1].replace(/\\./g,'').replace(',','.')); if ((ate[2]||'').match(/mil|k/i)) v*=1000; if ((ate[2]||'').match(/^m$/i)) v*=1000000; slots.valorMax = v; }
  for (const p of ['vivareal','zap','olx','chaves','imovelweb','123i']) { if (norm.includes(p)) { slots.portal = p; break; } }
  const bm = norm.match(/\\b(?:em|no|na|bairro)\\s+([a-z\\s]{3,25}?)(?:\\s|$|,)/);
  if (bm) slots.bairro = bm[1].trim();
  return slots;
}

function perguntarSlot(slot) {
  return { tipo:'Que tipo de imóvel? (apartamento, casa...)', quartos:'Quantos quartos?', valorMax:'Qual o valor máximo?', bairro:'Qual bairro ou região?' }[slot] || 'Pode dar mais detalhes?';
}

module.exports = { detectarIntencao, extrairSlots, perguntarSlot, normalizar };
`;

if (!fs.existsSync('./services')) fs.mkdirSync('./services');
fs.writeFileSync('./services/cerebro-nlp.js', nlp);
console.log('✅ services/cerebro-nlp.js v3.0 gerado!');

// ── AUTO-EXPANSÃO v1 — incorpora perguntas reais dos corretores ──────────────
// Gerado automaticamente baseado em 471 interações reais

// Sinônimos adicionais aprendidos
const sinonimos_aprendidos = {
  'portias':'portais','portal':'portais','ver portais':'ver_portais',
  'relatorrio':'relatorio','meu relatorrio':'relatorio',
  'conis':'coins','meus conis':'coins',
  'matsh':'match','mach':'match',
  'dashbord':'dashboard',
  'subir xml':'importar_xml','xml':'importar_xml',
  'link do cliente':'vitrine','enviar vitrine':'vitrine',
  'manda follow-up':'followup','follow-up':'followup','followup':'followup',
  'primeiros passos':'onboarding','como começo':'onboarding',
  'minha conta':'perfil','meu perfil':'perfil',
  'casas disponíveis':'ver_imoveis','casas com':'buscar_imovel',
  'casa até':'buscar_imovel','apartamento até':'buscar_imovel',
  'tem casa':'buscar_imovel','tem apartamento':'buscar_imovel',
  'quem pediu visita':'ver_visitas','quem confirmou visita':'ver_visitas',
  'minhas visitas':'ver_visitas','visitas pendentes':'ver_visitas',
  'quem nao respondeu':'leads_sem_contato',
  'bairros mais buscados':'analise_mercado','tipo mais buscado':'analise_mercado',
  'quartos mais pedidos':'analise_mercado','faixa de valor':'analise_mercado',
  'xml nao saiu no vivareal':'diagnostico_xml','meu portal rejeitou':'diagnostico_xml',
  'a extracao falhou':'diagnostico_extracao',
  'como adicionar fotos':'fotos_imovel',
  'quais campos a planilha precisa':'campos_planilha',
  'avisar proprietario da visita':'notificar_proprietario',
  'tem casa com 2 vagas':'buscar_imovel',
  'resumo do dia':'resumo_diario'
};

// Adiciona sinônimos aprendidos ao objeto principal
Object.assign(sinonimos, sinonimos_aprendidos);

// Novas intenções baseadas nas perguntas reais
const intencoes_aprendidas = [
  {
    id: 'buscar_imovel_rapido',
    keywords: ['tem casa','tem apartamento','casa com','apartamento com','casa ate','apto ate'],
    boost: ['quartos','vagas','bairro','valor','disponivel'],
    penalize: [],
    acao: 'busca_rapida_imovel',
    rota: '/app/imoveis',
    score_min: 0.4,
    exemplos: ['casa até 500mil','tem casa com 2 vagas','casas com 3 quartos']
  },
  {
    id: 'analise_mercado',
    keywords: ['tipo mais buscado','quartos mais pedidos','bairros mais buscados','faixa de valor','demanda','tendencia'],
    boost: ['mercado','leads','analise'],
    penalize: [],
    acao: 'analise_mercado',
    score_min: 0.35,
    exemplos: ['tipo mais buscado','quartos mais pedidos','faixa de valor das leads']
  },
  {
    id: 'diagnostico_xml',
    keywords: ['xml nao saiu','portal rejeitou','nao aparece no portal','xml invalido','erro xml'],
    boost: ['vivareal','zap','olx','portal'],
    penalize: [],
    acao: 'diagnostico_xml',
    score_min: 0.4,
    exemplos: ['xml não saiu no vivareal','meu portal rejeitou']
  },
  {
    id: 'diagnostico_extracao',
    keywords: ['extracao falhou','nao extraiu','erro extracao','nao pegou os dados','url nao funcionou'],
    boost: ['imovelweb','zap','url','anuncio'],
    penalize: [],
    acao: 'diagnostico_extracao',
    score_min: 0.4,
    exemplos: ['a extração falhou','não extraiu os dados da URL']
  },
  {
    id: 'campos_planilha',
    keywords: ['quais campos','planilha precisa','formato planilha','como montar planilha','colunas csv'],
    boost: ['csv','excel','leads','importar'],
    penalize: [],
    acao: 'explicar_campos_planilha',
    score_min: 0.35,
    exemplos: ['quais campos a planilha precisa?','formato do CSV']
  },
  {
    id: 'fotos_imovel',
    keywords: ['adicionar fotos','fotos do imovel','como colocar foto','upload foto','imagem imovel'],
    boost: ['imovel','cadastro','editar'],
    penalize: [],
    acao: 'navegar',
    rota: '/app/imoveis',
    score_min: 0.4,
    exemplos: ['como adicionar fotos','como colocar foto no imóvel']
  },
  {
    id: 'followup_lead',
    keywords: ['manda follow-up','fazer follow-up','followup','acompanhar lead','retornar lead','quem nao respondeu'],
    boost: ['lead','cliente','contato'],
    penalize: [],
    acao: 'followup_lead',
    score_min: 0.35,
    exemplos: ['manda follow-up','quem não respondeu?']
  },
  {
    id: 'onboarding',
    keywords: ['como comeco','primeiros passos','por onde comecar','como usar','tutorial','nao sei comecar'],
    boost: ['primeiro','inicio','comecar'],
    penalize: [],
    acao: 'wizard',
    fluxo: 'onboarding_completo',
    score_min: 0.35,
    exemplos: ['como começo?','primeiros passos','por onde começo']
  },
  {
    id: 'notificar_proprietario',
    keywords: ['avisar proprietario','notificar proprietario','chamar proprietario','falar com dono'],
    boost: ['visita','imovel','confirmacao'],
    penalize: [],
    acao: 'notificar_proprietario',
    score_min: 0.4,
    exemplos: ['avisar proprietário da visita']
  },
  {
    id: 'relatorio',
    keywords: ['relatorio','meu relatorio','ver relatorio','exportar relatorio','dados do mes'],
    boost: ['mes','semana','periodo','excel'],
    penalize: [],
    acao: 'navegar',
    rota: '/app/imoveis/exportar-excel',
    score_min: 0.35,
    exemplos: ['meu relatório','ver relatório do mês']
  }
];

// Adiciona ao array principal de intenções
intencoes_nlp.push(...intencoes_aprendidas);

// Atualiza stats
cerebro.stats.totalIntencoes = intencoes_nlp.length;
cerebro.stats.totalSinonimos = Object.keys(sinonimos).length;
cerebro.intencoes_nlp = intencoes_nlp;

// Resalva com tudo
fs.writeFileSync('assistente-mapa.json', JSON.stringify(cerebro, null, 2));
console.log('✅ Auto-expansão incorporada!');
console.log('   Intenções agora:', intencoes_nlp.length);
console.log('   Sinônimos agora:', Object.keys(sinonimos).length);
