const fs = require('fs');
const path = require('path');

console.log('🧠 Gerando cérebro v6.0 completo...');

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
      metodo: match[1].toUpperCase(),
      rota: match[2],
      linha: i+1,
      requerLogin: ctx.includes('auth'),
      renderiza: (ctx.match(/res\.render\(['"]([^'"]+)['"]/) || [])[1] || null,
      redireciona: (ctx.match(/res\.redirect\(['"]([^'"]+)['"]/) || [])[1] || null,
      leDados: ['imoveis.json','data.json','visitas.json','notificacoes.json','users.json'].filter(f=>ctx.includes(f)),
      salvaDados: ctx.includes('writeFileSync'),
      aceitaUpload: ctx.includes('upload.any()') || ctx.includes('upload.single'),
      formatosUpload: [ctx.includes('.xml')?'.xml':null, ctx.includes('.xlsx')||ctx.includes('excel')?'.xlsx':null, ctx.includes('.csv')?'.csv':null].filter(Boolean),
      executaScript: (ctx.match(/execSync\(['"`]node ([^'"`]+)['"`]/) || [])[1] || null,
      enviaEmail: ctx.includes('mail') || ctx.includes('nodemailer'),
      keywords: match[2].replace(/[/:]/g,' ').split(' ').filter(k=>k.length>2)
    });
  }
});

// ── 2. VIEWS ──────────────────────────────────────────────────────────────────
const views = {};
fs.readdirSync(viewsDir).filter(f=>f.endsWith('.ejs')&&!f.includes('backup')).forEach(file=>{
  const c = fs.readFileSync(path.join(viewsDir,file),'utf8');
  views[file] = {
    forms:     [...c.matchAll(/action=["']([^"']+)["']/g)].map(m=>m[1]),
    links:     [...c.matchAll(/href=["']([^"']+)["']/g)].map(m=>m[1]).filter(l=>l.startsWith('/')),
    fetches:   [...c.matchAll(/fetch\(['"`]([^'"`]+)['"`]/g)].map(m=>m[1]),
    botoes:    [...c.matchAll(/onclick=["']([^"']{0,100})["']/g)].map(m=>m[1]).slice(0,15),
    inputs:    [...c.matchAll(/type=["'](file|text|email|password|number|date|time|checkbox)["']/g)].map(m=>m[1]),
    uploads:   c.includes('type="file"')||c.includes("type='file'"),
    titulos:   [...c.matchAll(/<(?:h[1-6]|strong|title)[^>]*>([^<]{4,60})</g)].map(m=>m[1].trim()).slice(0,8),
    temModal:  c.includes('modal'),
    temTabela: c.includes('<table')||c.includes('tbody'),
    temGrafico:c.includes('chart')||c.includes('Chart')||c.includes('canvas')
  };
});

// ── 3. UPLOADS ────────────────────────────────────────────────────────────────
const uploads = rotas.filter(r=>r.aceitaUpload).map(r=>({
  rota: r.rota, metodo: r.metodo, linha: r.linha,
  formatos: r.formatosUpload,
  executaScript: r.executaScript,
  descricao: r.rota.includes('proprietar') ? 'Importar proprietários via Excel' :
             r.rota.includes('importar')   ? 'Importar imóveis via XML' :
             r.rota.includes('leads')      ? 'Importar leads via CSV/Excel' : 'Upload de arquivo'
}));

// ── 4. SINÔNIMOS ──────────────────────────────────────────────────────────────
const sinonimos = {
  'lids':'leads','lid':'lead','leades':'leads','leed':'lead',
  'imovei':'imovel','imovéis':'imoveis','imoveis':'imoveis',
  'vizita':'visita','vizitas':'visitas','vsita':'visita',
  'notificaçao':'notificacao','notificaçoes':'notificacoes',
  'proprietaro':'proprietario','proietario':'proprietario',
  'conis':'coins','moedas':'coins','pontos':'coins',
  'dashbord':'dashboard','dasboard':'dashboard',
  'matsh':'match','mach':'match',
  'subir':'importar','enviar arquivo':'importar',
  'meus clientes':'leads','interessados':'leads','compradores':'leads',
  'minha carteira':'imoveis','meus imoveis':'imoveis',
  'quantos':'total','quantas':'total',
  'ver':'listar','mostrar':'listar',
  'cadastrar':'cadastro','adicionar':'cadastro',
  'apagar':'excluir','deletar':'excluir',
  'inativar':'inativar','desativar':'inativar',
  'confirmar':'confirmar','aceitar':'confirmar',
  'recusar':'recusar','cancelar':'recusar',
  'remarcar':'remarcar','reagendar':'remarcar',
  'gerar xml':'gerar_xml','criar xml':'gerar_xml',
  'link do cliente':'vitrine','enviar pro cliente':'vitrine',
  'oi':'saudacao','olá':'saudacao','ola':'saudacao',
  'bom dia':'saudacao','boa tarde':'saudacao','boa noite':'saudacao',
  'tudo bem':'saudacao','hello':'saudacao'
};

// ── 5. INTENÇÕES SIMPLES ──────────────────────────────────────────────────────
const intencoes = [
  { id:'saudacao',         keywords:['saudacao','oi','ola','bom dia','boa tarde','boa noite','tudo','hello'],        acao:'mostrar_resumo_conta' },
  { id:'ver_leads',        keywords:['lead','leads','clientes','interessados','quantas lead','minhas lead'],          acao:'buscar_dados_leads',    rota:'/app/leads' },
  { id:'importar_leads',   keywords:['importar lead','subir lead','planilha','csv lead','upload lead'],              acao:'wizard',                fluxo:'wizard_importar_leads' },
  { id:'ver_imoveis',      keywords:['imovel','imoveis','carteira','apartamento','casa','quantos imoveis'],          acao:'buscar_dados_imoveis',  rota:'/app/imoveis' },
  { id:'importar_xml',     keywords:['xml','subir xml','importar xml','tecimob','rankim','importar imoveis'],        acao:'wizard',                fluxo:'wizard_importar_xml' },
  { id:'ver_visitas',      keywords:['visita','visitas','vizita','agendamento','hoje'],                              acao:'buscar_dados_visitas',  rota:'/app/visitas' },
  { id:'ver_match',        keywords:['match','matsh','combinar','compativel','leads match'],                         acao:'buscar_leads_match',    rota:'/app/leads' },
  { id:'gerar_xml',        keywords:['gerar xml','criar xml','xml portal','publicar','portal'],                      acao:'wizard',                fluxo:'wizard_gerar_xml_portal' },
  { id:'ver_portais',      keywords:['portais','portal','vivareal','zap','olx','chaves','imovelweb'],               acao:'navegar',               rota:'/app/portais' },
  { id:'ver_notificacoes', keywords:['notificacao','notificacoes','aviso','alerta','sino'],                         acao:'navegar',               rota:'/app/notificacoes' },
  { id:'ver_coins',        keywords:['coins','conis','moeda','saldo','pontos'],                                      acao:'navegar',               rota:'/app/coins' },
  { id:'ver_dashboard',    keywords:['dashboard','home','grafico','resumo','estatistica','stats'],                   acao:'navegar',               rota:'/app-home' },
  { id:'cadastrar_imovel', keywords:['cadastrar','cadastro','novo imovel','adicionar imovel'],                       acao:'navegar',               rota:'/app/cadastro' },
  { id:'proprietarios',    keywords:['proprietario','proprietarios','dono','vincular proprietario'],                  acao:'wizard',                fluxo:'wizard_proprietarios' },
  { id:'exportar',         keywords:['exportar','excel','baixar','download','relatorio'],                            acao:'navegar',               rota:'/app/imoveis/exportar-excel' },
  { id:'vitrine',          keywords:['vitrine','oferta','link cliente','enviar pro cliente'],                        acao:'explicar',              descricao:'A vitrine é o link /cliente/oferta/:leadId — compartilhe com o cliente para ele ver os imóveis em match e solicitar visita.' },
  { id:'ajuda',            keywords:['ajuda','socorro','como faz','nao sei','help','o que voce faz'],                acao:'mostrar_ajuda' }
];

// ── 6. INTENÇÕES COMPOSTAS ────────────────────────────────────────────────────
const intencoes_compostas = [
  { id:'leads_sem_match',          condicoes:['lead','sem match'],       acao:'buscar_leads_sem_match',       rota:'/app/leads',   filtro:'sem_match' },
  { id:'leads_com_match',          condicoes:['lead','com match'],       acao:'buscar_leads_com_match',       rota:'/app/leads',   filtro:'com_match' },
  { id:'visitas_hoje',             condicoes:['visita','hoje'],          acao:'buscar_visitas_hoje',          rota:'/app/visitas', filtro:'hoje' },
  { id:'visitas_pendentes',        condicoes:['visita','pendente'],      acao:'buscar_visitas_pendentes',     rota:'/app/visitas', filtro:'pendentes' },
  { id:'imoveis_inativos',         condicoes:['imovel','inativo'],       acao:'buscar_imoveis_inativos',      rota:'/app/imoveis', filtro:'inativos' },
  { id:'imoveis_sem_proprietario', condicoes:['imovel','proprietario'],  acao:'buscar_sem_proprietario',      rota:'/app/imoveis', filtro:'sem_proprietario' },
  { id:'leads_organicas',          condicoes:['lead','organica'],        acao:'buscar_leads_organicas',       rota:'/app/leads',   filtro:'organicas' },
  { id:'leads_importadas',         condicoes:['lead','importada'],       acao:'buscar_leads_importadas',      rota:'/app/leads',   filtro:'importadas' }
];

// ── 7. GATILHOS AUTOMÁTICOS ───────────────────────────────────────────────────
const gatilhos = [
  { id:'leads_sem_match_antigos',   condicao:'leads_sem_match_7dias > 0',  mensagem:'⚠️ {n} leads sem match há mais de 7 dias. Quer tentar o match agora?',         prioridade:'alta' },
  { id:'visitas_pendentes_antigas', condicao:'visitas_pendentes_2dias > 0', mensagem:'⚠️ {n} visita(s) sem resposta há mais de 2 dias. Proprietário precisa responder!', prioridade:'alta' },
  { id:'visitas_hoje',              condicao:'visitas_hoje > 0',            mensagem:'📅 Você tem {n} visita(s) hoje!',                                               prioridade:'alta' },
  { id:'xml_desatualizado',         condicao:'dias_sem_xml > 30',           mensagem:'📅 XML desatualizado há {n} dias. Quer importar um novo?',                      prioridade:'media' },
  { id:'sem_leads',                 condicao:'leads === 0',                 mensagem:'👥 Nenhuma lead ainda. Quer importar uma planilha?',                            prioridade:'media' },
  { id:'sem_imoveis',               condicao:'imoveis === 0',               mensagem:'🏠 Nenhum imóvel ainda. Quer importar um XML?',                                 prioridade:'media' },
  { id:'imoveis_sem_proprietario',  condicao:'sem_proprietario > 50',       mensagem:'🏠 {n} imóveis sem proprietário. Quer importar o Excel?',                      prioridade:'baixa' }
];

// ── 8. FLUXOS GUIADOS ─────────────────────────────────────────────────────────
const fluxos = [
  {
    id:'wizard_importar_leads',
    gatilho:['importar lead','subir lead','planilha','upload lead'],
    passos:[
      { id:1, mensagem:'De onde são essas leads?', opcoes:['ImovelWeb','ZAP','VivaReal','OLX','Outro'], aguarda:'escolha' },
      { id:2, mensagem:'Envie o arquivo 📎 (CSV ou Excel)', aguarda:'arquivo', formatos:['.csv','.xlsx','.xls'] },
      { id:3, mensagem:'Importando... ⏳', acao:'upload', rota:'/app/leads' },
      { id:4, mensagem:'✅ {n} leads importadas! Quer fazer o match agora?', opcoes:['Sim, fazer match','Não agora'], aguarda:'escolha' }
    ]
  },
  {
    id:'wizard_importar_xml',
    gatilho:['importar xml','subir xml','xml','importar imoveis'],
    passos:[
      { id:1, mensagem:'Qual o sistema de origem?', opcoes:['Tecimob','Rankim','Outro'], aguarda:'escolha' },
      { id:2, mensagem:'Envie o arquivo XML 📎', aguarda:'arquivo', formatos:['.xml'] },
      { id:3, mensagem:'Importando imóveis... ⏳', acao:'upload', rota:'/app/importar' },
      { id:4, mensagem:'✅ {n} imóveis importados! Quer gerar XML para algum portal?', opcoes:['VivaReal','ZAP','OLX','Não agora'], aguarda:'escolha' }
    ]
  },
  {
    id:'wizard_gerar_xml_portal',
    gatilho:['gerar xml','xml portal','publicar','portal'],
    passos:[
      { id:1, mensagem:'Para qual portal?', opcoes:['VivaReal','ZAP','OLX','Chaves','ImovelWeb','123i'], aguarda:'escolha' },
      { id:2, mensagem:'Todos os ativos ou selecionar?', opcoes:['Todos os ativos','Ir para /app/imoveis selecionar'], aguarda:'escolha' },
      { id:3, mensagem:'Gerando XML... ⏳', acao:'gerar_xml', rota:'/app/gerar-xml' },
      { id:4, mensagem:'✅ XML gerado! Acesse /app/portais para o link do feed.' }
    ]
  },
  {
    id:'wizard_proprietarios',
    gatilho:['proprietario','vincular proprietario','importar proprietario'],
    passos:[
      { id:1, mensagem:'Envie o Excel de proprietários 📎 (padrão Tecimob)', aguarda:'arquivo', formatos:['.xlsx'] },
      { id:2, mensagem:'Vinculando proprietários... ⏳', acao:'upload', rota:'/app/importar-proprietarios' },
      { id:3, mensagem:'✅ {n} proprietários vinculados!' }
    ]
  }
];

// ── 9. COMANDOS DIRETOS ───────────────────────────────────────────────────────
const comandos_diretos = [
  { id:'inativar_imovel',  padroes:['inativar imovel {id}','desativar imovel {id}'],           extrai:['id'],        acao:'POST', rota:'/app/imoveis/{id}/inativar',    confirmacao:'Inativar imóvel {id}?' },
  { id:'confirmar_visita', padroes:['confirmar visita {id}','aceitar visita {id}'],             extrai:['id'],        acao:'POST', rota:'/app/visitas/confirmar/{id}',   confirmacao:'Confirmar visita {id}?' },
  { id:'recusar_visita',   padroes:['recusar visita {id}','cancelar visita {id}'],              extrai:['id'],        acao:'POST', rota:'/app/visitas/recusar/{id}',     confirmacao:'Recusar visita {id}?' },
  { id:'gerar_xml_portal', padroes:['gerar xml {portal}','xml para {portal}'],                  extrai:['portal'],    acao:'POST', rota:'/app/gerar-xml',                confirmacao:'Gerar XML para {portal}?' },
  { id:'buscar_imovel',    padroes:['tem {tipo} em {bairro}','buscar {tipo} em {bairro}'],      extrai:['tipo','bairro'], acao:'busca_local', arquivo:'imoveis.json' },
  { id:'buscar_lead',      padroes:['lead em {bairro}','cliente buscando {tipo}'],              extrai:['bairro','tipo'], acao:'busca_local', arquivo:'data.json' }
];

// ── 10. RESPOSTAS POR ESTADO ──────────────────────────────────────────────────
const respostas_estado = {
  saudacao:[
    { condicao:'leads===0&&imoveis===0', resposta:'{s} {nome}! 👋 Conta vazia. Começar importando XML de imóveis ou planilha de leads?' },
    { condicao:'leads===0',             resposta:'{s} {nome}! 👋 {imoveis} imóveis mas nenhuma lead. Quer importar uma planilha?' },
    { condicao:'imoveis===0',           resposta:'{s} {nome}! 👋 {leads} leads mas nenhum imóvel. Quer importar um XML?' },
    { condicao:'visitas_hoje>0',        resposta:'{s} {nome}! 👋 ⚠️ {visitas_hoje} visita(s) hoje! | 🏠 {imoveis} imóveis | 👥 {leads} leads | 🎯 {com_match} match' },
    { condicao:'pendentes>0',           resposta:'{s} {nome}! 👋 ⏳ {pendentes} visita(s) pendentes! | 🏠 {imoveis} imóveis | 👥 {leads} leads' },
    { condicao:'default',               resposta:'{s} {nome}! 👋 | 🏠 {imoveis} imóveis | 👥 {leads} leads | 🎯 {com_match} match | 📅 {visitas_hoje} hoje' }
  ],
  leads:[
    { condicao:'total===0',     resposta:'Nenhuma lead ainda. Quer importar agora? Clique em 📎' },
    { condicao:'com_match===0', resposta:'{total} leads mas nenhuma com match. Verifique se seus imóveis têm bairro, tipo e quartos preenchidos.' },
    { condicao:'default',       resposta:'👥 {total} leads | 🌐 {organicas} orgânicas | 📋 {importadas} importadas | 🎯 {com_match} match | ❌ {sem_match} sem match' }
  ],
  visitas:[
    { condicao:'total===0',      resposta:'Nenhuma visita agendada ainda.' },
    { condicao:'visitas_hoje>0', resposta:'📅 {visitas_hoje} visita(s) hoje! | Total: {total} | ⏳ {pendentes} pendentes | ✅ {confirmadas} confirmadas' },
    { condicao:'default',        resposta:'📅 {total} visitas | ⏳ {pendentes} pendentes | ✅ {confirmadas} confirmadas | 📆 {visitas_hoje} hoje' }
  ]
};

// ── 11. FEEDBACK ──────────────────────────────────────────────────────────────
const feedback = {
  arquivo_feedback: 'assistente-feedback.json',
  arquivo_nao_entendidos: 'assistente-nao-entendidos.json',
  threshold_aprendizado: 3,
  regras:[
    '3+ 👎 numa resposta → marcar como ruim → revisar intenção',
    'Pergunta não entendida → salvar em nao-entendidos.json',
    '3+ perguntas similares não entendidas → criar nova intenção',
    '5+ 👍 → marcar como top → priorizar nas buscas'
  ]
};

// ── MONTAR CÉREBRO FINAL ──────────────────────────────────────────────────────
const cerebro = {
  versao: '6.0',
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
    totalSinonimos: Object.keys(sinonimos).length
  },
  rotas,
  views,
  uploads,
  sinonimos,
  intencoes,
  intencoes_compostas,
  gatilhos,
  fluxos,
  comandos_diretos,
  respostas_estado,
  feedback
};

fs.writeFileSync('assistente-mapa.json', JSON.stringify(cerebro, null, 2));

console.log('✅ Cérebro v6.0 completo e autossuficiente!');
console.log('   Rotas:               ', cerebro.stats.totalRotas);
console.log('   Views:               ', cerebro.stats.totalViews);
console.log('   Uploads:             ', cerebro.stats.totalUploads);
console.log('   Intenções simples:   ', cerebro.stats.totalIntencoes);
console.log('   Intenções compostas: ', cerebro.stats.totalIntencoesCompostas);
console.log('   Gatilhos automáticos:', cerebro.stats.totalGatilhos);
console.log('   Fluxos guiados:      ', cerebro.stats.totalFluxos);
console.log('   Comandos diretos:    ', cerebro.stats.totalComandosDiretos);
console.log('   Sinônimos:           ', cerebro.stats.totalSinonimos);
