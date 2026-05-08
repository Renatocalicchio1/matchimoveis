const fs = require('fs');
const path = require('path');

console.log('🧠 Gerando cérebro do MatchImóveis...');

const server = fs.readFileSync('server.js', 'utf8');
const linhas = server.split('\n');

// 1. Mapear rotas com contexto
const rotas = [];
linhas.forEach((linha, i) => {
  const match = linha.match(/app\.(get|post|put|delete)\(['"]([^'"]+)['"]/);
  if (match && !linha.startsWith('//')) {
    const contexto = linhas.slice(i, i+20).join(' ').replace(/\s+/g,' ').substring(0,400);
    const temAuth = contexto.includes('auth');
    const renderiza = (contexto.match(/res\.render\(['"]([^'"]+)['"]/) || [])[1];
    const redireciona = (contexto.match(/res\.redirect\(['"]([^'"]+)['"]/) || [])[1];
    const leDados = ['imoveis.json','data.json','visitas.json','notificacoes.json','users.json']
      .filter(f => contexto.includes(f));
    rotas.push({
      metodo: match[1].toUpperCase(),
      rota: match[2],
      linha: i+1,
      requerLogin: temAuth,
      renderiza: renderiza || null,
      redireciona: redireciona || null,
      leDados
    });
  }
});

// 2. Mapear views
const viewsDir = './views';
const views = {};
fs.readdirSync(viewsDir)
  .filter(f => f.endsWith('.ejs') && !f.includes('backup'))
  .forEach(file => {
    const content = fs.readFileSync(path.join(viewsDir, file), 'utf8');
    views[file] = {
      forms: [...content.matchAll(/action=["']([^"']+)["']/g)].map(m=>m[1]),
      links: [...content.matchAll(/href=["']([^"']+)["']/g)].map(m=>m[1]).filter(l=>l.startsWith('/')),
      fetches: [...content.matchAll(/fetch\(['"`]([^'"`]+)['"`]/g)].map(m=>m[1]),
      botoes: [...content.matchAll(/onclick=["']([^"']{0,80})["']/g)].map(m=>m[1]).slice(0,10),
      titulos: [...content.matchAll(/<(?:h[1-6]|strong)[^>]*>([^<]{4,60})</g)].map(m=>m[1].trim()).slice(0,5)
    };
  });

// 3. Montar intenções automáticas baseadas nas rotas
const intencoes = rotas.map(r => {
  const keywords = r.rota.replace(/[/:]/g,' ').trim().split(/\s+/).filter(k=>k.length>2);
  if (r.renderiza) keywords.push(...r.renderiza.replace(/[-]/g,' ').split(' ').filter(k=>k.length>2));
  return { rota: r.rota, metodo: r.metodo, keywords: [...new Set(keywords)], renderiza: r.renderiza, leDados: r.leDados };
}).filter(i => i.keywords.length > 0);

// 4. Salvar cérebro completo
const cerebro = {
  versao: '2.0',
  geradoEm: new Date().toISOString(),
  stats: { totalRotas: rotas.length, totalViews: Object.keys(views).length, totalIntencoes: intencoes.length },
  rotas,
  views,
  intencoes,
  modulos: {
    autenticacao: { keywords: ['login','logout','senha','entrar'], rota: '/login', descricao: 'Login e sessão do usuário' },
    imoveis:      { keywords: ['imovel','imóvel','carteira','cadastro','cadastrar'], rota: '/app/imoveis', descricao: 'Gestão da carteira de imóveis' },
    leads:        { keywords: ['lead','leads','planilha','importar','organica','importada'], rota: '/app/leads', descricao: 'Pipeline de leads' },
    visitas:      { keywords: ['visita','visitas','agendar','agendamento','remarcar'], rota: '/app/visitas', descricao: 'Gestão de visitas' },
    portais:      { keywords: ['portal','portais','xml','feed','vivareal','zap','olx'], rota: '/app/portais', descricao: 'Feeds XML para portais' },
    notificacoes: { keywords: ['notificacao','notificações','aviso','alerta','sino'], rota: '/app/notificacoes', descricao: 'Central de notificações' },
    coins:        { keywords: ['coin','coins','moeda','saldo','gamificacao'], rota: '/app/coins', descricao: 'Match Coins' },
    match:        { keywords: ['match','combinar','compativel','ia','inteligencia'], rota: '/app/leads', descricao: 'Motor de match IA' },
    vitrine:      { keywords: ['vitrine','oferta','cliente','link'], rota: '/cliente/oferta', descricao: 'Vitrine pública do lead' },
    proprietario: { keywords: ['proprietario','dono','confirmar','recusar'], rota: '/proprietario/visita', descricao: 'Página do proprietário' },
    dashboard:    { keywords: ['dashboard','home','grafico','resumo','stats','estatistica'], rota: '/app-home', descricao: 'Dashboard com gráficos' }
  }
};

fs.writeFileSync('assistente-mapa.json', JSON.stringify(cerebro, null, 2));

console.log('✅ Cérebro gerado!');
console.log('   Rotas:    ', cerebro.stats.totalRotas);
console.log('   Views:    ', cerebro.stats.totalViews);
console.log('   Intenções:', cerebro.stats.totalIntencoes);
console.log('   Módulos:  ', Object.keys(cerebro.modulos).length);
