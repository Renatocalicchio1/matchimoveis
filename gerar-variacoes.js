'use strict';
const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// ── TEMPLATES DE VARIAÇÃO ─────────────────────────────────────────────────────
const VARIACOES = {

  // LEADS
  leads_ver: [
    'minhas leads','ver leads','listar leads','mostrar leads','quero ver leads',
    'me mostra as leads','me diz quantas leads','quantas leads tenho','total de leads',
    'meus clientes','ver clientes','listar clientes','meus contatos','ver contatos',
    'leads cadastradas','todas as leads','leads da conta','meu funil',
    'quero ver meus clientes','me mostra meus contatos','quero saber minhas leads',
  ],
  leads_quentes: [
    'leads quentes','leads mais quentes','leads com match','quem tem match',
    'melhores leads','leads prioritarias','leads interessantes','leads com imovel',
    'quem deu match','leads com resultado','leads prontas','leads ativas',
    'clientes com match','quais clientes tem imovel','leads boas',
    'quem tem imovel compativel','leads que deram match',
  ],
  leads_frias: [
    'leads frias','leads paradas','leads sem atividade','leads esquecidas',
    'leads antigas','clientes sem contato','leads abandonadas','leads frias',
    'leads sem resposta','clientes sumidos','leads esfriaram','leads inativas',
    'leads que nao responderam','clientes que pararam','leads velhas',
  ],
  leads_hoje: [
    'leads de hoje','novas leads hoje','leads que chegaram hoje','leads novas',
    'clientes novos','novos clientes','chegou lead hoje','lead nova hoje',
    'leads do dia','leads recentes','leads de agora','entrou lead hoje',
    'quantas leads hoje','leads que entraram','novas hoje',
  ],
  leads_importar: [
    'importar leads','importar planilha','subir planilha','enviar planilha',
    'como importo leads','como subo planilha','importar clientes','subir clientes',
    'carregar leads','upload planilha','adicionar leads','incluir leads',
    'como adiciono leads','como coloco leads','planilha de leads',
    'importar do portal','subir do zap','importar do vivareal',
  ],

  // IMOVEIS
  imoveis_ver: [
    'meus imoveis','ver imoveis','listar imoveis','mostrar imoveis','carteira de imoveis',
    'imoveis cadastrados','todos os imoveis','imoveis da conta','minha carteira',
    'quero ver imoveis','me mostra imoveis','imoveis disponiveis','base de imoveis',
    'imoveis ativos','meus ativos','ver carteira','imoveis publicados',
  ],
  imoveis_inativos: [
    'imoveis inativos','imoveis arquivados','imoveis desativados','imoveis ocultos',
    'imoveis nao publicados','imoveis fora do ar','imoveis pausados',
    'imoveis sem publicacao','ver inativos','quais imoveis estao inativos',
    'imoveis arquivados','imoveis desativados','imoveis off',
  ],
  imoveis_sem_foto: [
    'imoveis sem foto','imoveis sem imagem','imoveis sem fotos','imoveis sem imagens',
    'quais imoveis nao tem foto','imoveis precisando de foto','sem fotos',
  ],
  imoveis_parados: [
    'imoveis parados','imoveis sem match','imoveis sem lead','imoveis encalhados',
    'imoveis que nao vendem','imoveis sem interessado','imoveis parados na carteira',
    'quais imoveis nao tem match','imoveis sem procura','imoveis sem demanda',
  ],

  // VISITAS
  visitas_ver: [
    'minhas visitas','ver visitas','listar visitas','visitas agendadas',
    'agenda de visitas','quero ver visitas','visitas da semana','visitas do mes',
    'todas as visitas','visitas cadastradas','historico de visitas',
  ],
  visitas_hoje: [
    'visitas hoje','visita hoje','tenho visita hoje','visitas do dia',
    'agenda de hoje','o que tem hoje','compromissos hoje','visitas para hoje',
    'quantas visitas hoje','visita marcada hoje','tenho agenda hoje',
  ],
  visitas_pendentes: [
    'visitas pendentes','visitas aguardando','visitas nao confirmadas',
    'visitas esperando','pendentes de confirmacao','visitas em aberto',
    'quem nao confirmou','proprietario nao respondeu','aguardando confirmacao',
    'visitas sem resposta','visitas em espera','confirmacoes pendentes',
  ],

  // MATCH
  match_ver: [
    'ver match','meu match','resultado do match','matches','resultados',
    'quero ver match','me mostra match','match da conta','resultados do match',
    'imoveis em match','leads com match','ver resultados','compatibilidades',
  ],
  match_como: [
    'como funciona o match','o que e match','explicar match','me explica o match',
    'como funciona','o que e o match','como o match funciona','me fala do match',
    'o que significa match','o que e md','o que sao os mds','entender match',
    'como funciona a compatibilidade','como cruza as informacoes',
  ],
  match_taxa: [
    'taxa de match','percentual de match','quantos deram match','porcentagem de match',
    'quantas leads tem match','minha taxa','eficiencia do match','taxa de compatibilidade',
    'quantos por cento deu match','resultado da taxa','taxa de sucesso',
  ],
  match_por_que_nao: [
    'por que nao deu match','sem match porque','nao encontrou imovel',
    'por que nao tem match','match nao funcionou','nao deu match',
    'por que nao casou','nao encontrou nada','sem resultado no match',
    'match nao achou','nao bateu','por que nao bateu',
  ],

  // PORTAIS
  portais_ver: [
    'ver portais','meus portais','portais gerados','links dos portais',
    'feeds xml','links xml','urls dos portais','portais ativos',
    'ver feeds','links gerados','onde ficam os links','portais configurados',
  ],
  portais_gerar: [
    'gerar xml','criar xml','gerar feed','gerar link portal',
    'gerar xml vivareal','gerar xml zap','gerar xml olx',
    'publicar no portal','subir para portal','enviar para portal',
    'gerar link vivareal','gerar link zap','como gero xml',
  ],
  portais_problema: [
    'xml nao atualizou','xml nao foi','portal rejeitou','portal nao atualizou',
    'imovel nao apareceu no portal','nao publicou','nao saiu no portal',
    'xml com erro','link nao funciona','portal recusou','imovel rejeitado',
    'feed com problema','xml quebrado','portal nao aceita',
  ],

  // MERCADO
  mercado_bairro: [
    'demanda por bairro','bairros mais buscados','bairros com mais leads',
    'quais bairros tem mais procura','bairros mais pedidos','demanda dos bairros',
    'onde tem mais cliente','qual bairro mais buscado','top bairros',
    'bairros com mais demanda','mapa de demanda','onde tem mais procura',
  ],
  mercado_tipo: [
    'tipo mais buscado','tipo mais pedido','que tipo mais vendem','tipos mais procurados',
    'apartamento ou casa mais buscado','qual tipo tem mais demanda',
    'o que os clientes querem','tipos populares','tipo favorito',
  ],
  mercado_valor: [
    'faixa de valor','valor medio','preco medio','ticket medio',
    'quanto os clientes pagam','faixa de preco','orcamento dos clientes',
    'valores mais buscados','faixa de orcamento','qual valor mais comum',
    'media de valor','quanto querem gastar','faixa de investimento',
  ],

  // ESTRATEGIA
  estrategia_hoje: [
    'o que devo fazer hoje','o que fazer hoje','plano do dia','me orienta',
    'por onde comecar','o que e mais urgente','me diz o que fazer',
    'qual minha prioridade','o que tem para hoje','resumo do dia',
    'me ajuda a organizar','tarefas do dia','agenda do dia','prioridades hoje',
  ],
  estrategia_atender: [
    'quem devo atender primeiro','qual lead atender','ordem de atendimento',
    'qual e a mais urgente','quem tem mais prioridade','atender quem primeiro',
    'qual lead e mais importante','ranking de prioridade','qual e a mais quente',
    'por onde comecar a atender','primeiro contato','qual ligar primeiro',
  ],

  // SUPORTE
  suporte_fotos: [
    'como adicionar fotos','como subir fotos','como colocar fotos',
    'como adiciono fotos','fotos do imovel','subir imagens','adicionar imagens',
    'como coloco fotos','como faço upload de fotos','inserir fotos',
  ],
  suporte_senha: [
    'como trocar senha','alterar senha','mudar senha','esqueci minha senha',
    'como mudo senha','resetar senha','nova senha','como troco a senha',
  ],
  suporte_whatsapp: [
    'como conectar whatsapp','integrar whatsapp','whatsapp no sistema',
    'configurar whatsapp','ligar whatsapp','ativar whatsapp',
    'como uso whatsapp','whatsapp integrado','conectar wpp',
  ],
  suporte_planilha: [
    'quais campos a planilha precisa','campos da planilha','o que precisa na planilha',
    'formato da planilha','como montar planilha','campos obrigatorios',
    'o que colocar na planilha','campos necessarios','template planilha',
    'como preparar planilha','estrutura da planilha',
  ],

  // FRASES NATURAIS
  cliente_busca: [
    'tenho um cliente querendo apto em itajai',
    'meu cliente quer casa de 3 quartos',
    'tenho cliente interessado em apartamento',
    'cliente procurando imovel',
    'tenho um comprador para apartamento',
    'meu cliente busca casa ate 500 mil',
    'cliente quer cobertura no centro',
    'tenho interesse em apartamento 2 quartos',
    'cliente procura imovel em balneario',
    'meu cliente precisa de casa com quintal',
  ],
  cliente_feedback: [
    'cliente nao gostou','cliente recusou','cliente nao quis',
    'cliente gostou','cliente aprovou','cliente topou','cliente adorou',
    'ja enviei a vitrine','mandei a vitrine para o cliente',
    'cliente viu a vitrine','cliente acessou a vitrine',
  ],

  // SAUDACOES
  saudacao: [
    'oi','ola','hey','eai','bom dia','boa tarde','boa noite',
    'tudo bem','tudo bom','como vai','oi tudo bem','ola tudo bem',
    'oi assistente','ola assistente','hey assistente',
  ],
};

// ── GERAR BASE DE CONHECIMENTO EXPANDIDA ──────────────────────────────────────
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};
const exist = new Set(base.items.map(i=>i.p));

const MAPA_DOMINIO = {
  leads_ver:'leads', leads_quentes:'leads', leads_frias:'leads', leads_hoje:'leads', leads_importar:'leads',
  imoveis_ver:'imoveis', imoveis_inativos:'imoveis', imoveis_sem_foto:'imoveis', imoveis_parados:'imoveis',
  visitas_ver:'visitas', visitas_hoje:'visitas', visitas_pendentes:'visitas',
  match_ver:'match', match_como:'match', match_taxa:'match', match_por_que_nao:'match',
  portais_ver:'portais', portais_gerar:'portais', portais_problema:'portais',
  mercado_bairro:'mercado', mercado_tipo:'mercado', mercado_valor:'mercado',
  estrategia_hoje:'estrategia', estrategia_atender:'estrategia',
  suporte_fotos:'sistema', suporte_senha:'sistema', suporte_whatsapp:'sistema', suporte_planilha:'sistema',
  cliente_busca:'imoveis', cliente_feedback:'leads', saudacao:'saudacao',
};

let add = 0;
for (const [grupo, frases] of Object.entries(VARIACOES)) {
  const dominio = MAPA_DOMINIO[grupo] || 'sistema';
  for (const frase of frases) {
    if (!exist.has(frase)) {
      base.items.push({ p: frase, r: dominio, grupo });
      exist.add(frase);
      add++;
    }
  }
}

base.total = base.items.length;
base.atualizadoEm = new Date().toISOString();
fs.writeFileSync(baseP, JSON.stringify(base,null,2));
console.log('Base de conhecimento: +' + add + ' variações (total: ' + base.total + ')');

// ── GERAR SINÔNIMOS EXPANDIDOS ────────────────────────────────────────────────
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};

const SINONIMOS_NOVOS = {
  // leads
  'meus clientes':'minhas leads','ver clientes':'ver leads','meu funil':'minhas leads',
  'contatos':'leads','meus contatos':'minhas leads','listar clientes':'ver leads',
  'clientes novos':'leads hoje','novos clientes':'leads hoje',
  'clientes com match':'leads com match','clientes sem match':'leads sem match',
  // imoveis
  'minha carteira':'meus imoveis','carteira de imoveis':'meus imoveis',
  'base de imoveis':'meus imoveis','ativos':'imoveis ativos',
  'imoveis off':'imoveis inativos','imoveis fora do ar':'imoveis inativos',
  'imoveis encalhados':'imoveis parados','imoveis sem procura':'imoveis parados',
  // visitas
  'agenda':'visitas','agenda de hoje':'visitas hoje','compromissos':'visitas',
  'confirmacoes pendentes':'visitas pendentes','aguardando confirmacao':'visitas pendentes',
  // match
  'mds':'match','resultados':'ver match','compatibilidade':'match',
  'cruzamento':'match','cruza':'match','casar':'match',
  'nao bateu':'nao deu match','nao casou':'nao deu match',
  // portais
  'feeds':'portais','feeds xml':'portais','links dos portais':'ver portais',
  'urls dos portais':'ver portais','link nao funciona':'xml nao atualizou',
  'feed com problema':'xml nao atualizou',
  // mercado
  'mapa de demanda':'demanda por bairro','onde tem mais procura':'demanda por bairro',
  'top bairros':'demanda por bairro','faixa de orcamento':'faixa de valor',
  'quanto querem gastar':'faixa de valor','ticket':'valor medio',
  // estrategia
  'tarefas do dia':'plano do dia','agenda do dia':'plano do dia',
  'prioridades hoje':'o que devo fazer hoje','qual ligar primeiro':'quem atender primeiro',
  // suporte
  'inserir fotos':'como adicionar fotos','upload de fotos':'como adicionar fotos',
  'resetar senha':'como trocar senha','nova senha':'como trocar senha',
  'conectar wpp':'como conectar whatsapp','ligar whatsapp':'como conectar whatsapp',
  'template planilha':'campos da planilha','estrutura da planilha':'campos da planilha',
};

let addS = 0;
for (const [k,v] of Object.entries(SINONIMOS_NOVOS)) {
  if (!s[k]) { s[k]=v; addS++; }
}
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('Sinônimos: +' + addS + ' (total: ' + Object.keys(s).length + ')');

// ── RODAR TREINO ──────────────────────────────────────────────────────────────
const {execSync} = require('child_process');
execSync('node treino-cerebro.js --silent', {cwd:BASE});
const rel = JSON.parse(fs.readFileSync(path.join(BASE,'cerebro','treino-relatorio.json'),'utf8'));
console.log('\nTreino: ' + rel.cobertura + '% | Não entendeu: ' + rel.naoEntendeu);
