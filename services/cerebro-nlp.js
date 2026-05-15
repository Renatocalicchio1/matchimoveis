// cerebro-nlp.js v3.0 — NÃO EDITAR — gerado por npm run cerebro
const sinonimos = {"lids":"leads","lid":"lead","leades":"leads","leed":"lead","lide":"lead","lides":"leads","imovei":"imovel","imovéis":"imoveis","vizita":"visita","vizitas":"visitas","notificações":"notificacoes","proprietaro":"proprietario","conis":"coins","moedas":"coins","pontos":"coins","saldo":"coins","dashbord":"dashboard","dash":"dashboard","matsh":"match","mach":"match","matches":"match","subir":"importar","upload":"importar","meus clientes":"leads","interessados":"leads","compradores":"leads","minha carteira":"imoveis","meus imoveis":"imoveis","quantos":"total","quantas":"total","apagar":"excluir","deletar":"excluir","desativar":"inativar","arquivar":"inativar","reagendar":"remarcar","mudar data":"remarcar","gerar xml":"gerar_xml","exportar xml":"gerar_xml","link do cliente":"vitrine","oferta":"vitrine","oi":"saudacao","olá":"saudacao","ola":"saudacao","e ai":"saudacao","bom dia":"saudacao","boa tarde":"saudacao","boa noite":"saudacao","hello":"saudacao","hi":"saudacao","hey":"saudacao","qto":"quarto","qtos":"quartos","vaga":"vagas","garagem":"vagas","preço":"preco","custo":"preco","m2":"metragem","metros":"metragem"};
const intencoes = [{"id":"saudacao","keywords":["saudacao","oi","ola","bom dia","boa tarde","boa noite","hello","hey"],"boost":["bem","como vai"],"penalize":[],"acao":"mostrar_resumo_conta","score_min":0.3},{"id":"ver_leads","keywords":["lead","leads","cliente","clientes","interessado"],"boost":["quantas","quantos","minhas","ver","listar"],"penalize":["importar","subir"],"acao":"buscar_dados_leads","rota":"/app/leads","score_min":0.35},{"id":"importar_leads","keywords":["importar","subir","upload","planilha","csv"],"boost":["lead","leads","arquivo"],"penalize":[],"acao":"wizard","fluxo":"wizard_importar_leads","score_min":0.4},{"id":"ver_imoveis","keywords":["imovel","imoveis","apartamento","casa","carteira"],"boost":["quantos","meus","ver","listar","ativo"],"penalize":["importar","cadastrar"],"acao":"buscar_dados_imoveis","rota":"/app/imoveis","score_min":0.35},{"id":"importar_xml","keywords":["xml","importar xml","subir xml","tecimob","rankim"],"boost":["importar","subir","arquivo"],"penalize":["gerar","criar"],"acao":"wizard","fluxo":"wizard_importar_xml","score_min":0.4},{"id":"ver_visitas","keywords":["visita","visitas","agendamento","agendar","hoje"],"boost":["minhas","pendentes","confirmadas","quantas"],"penalize":[],"acao":"buscar_dados_visitas","rota":"/app/visitas","score_min":0.35},{"id":"ver_match","keywords":["match","combinar","compativel","cruzar"],"boost":["fazer","rodar","ver","quantas leads"],"penalize":[],"acao":"buscar_leads_match","rota":"/app/leads","score_min":0.4},{"id":"gerar_xml","keywords":["gerar xml","criar xml","xml portal","publicar","portal"],"boost":["vivareal","zap","olx","chaves","imovelweb"],"penalize":["importar"],"acao":"wizard","fluxo":"wizard_gerar_xml_portal","score_min":0.4},{"id":"ver_portais","keywords":["portais","portal","vivareal","zap","olx"],"boost":["ver","status","feed"],"penalize":["gerar","criar"],"acao":"navegar","rota":"/app/portais","score_min":0.4},{"id":"ver_dashboard","keywords":["dashboard","resumo","grafico","estatistica","home"],"boost":["ver","abrir","meu"],"penalize":[],"acao":"navegar","rota":"/app-home","score_min":0.35},{"id":"cadastrar_imovel","keywords":["cadastrar","novo imovel","adicionar imovel"],"boost":["quero","preciso"],"penalize":["importar"],"acao":"navegar","rota":"/app/cadastro","score_min":0.45},{"id":"proprietarios","keywords":["proprietario","proprietarios","dono","vincular"],"boost":["importar","excel","telefone"],"penalize":[],"acao":"wizard","fluxo":"wizard_proprietarios","score_min":0.4},{"id":"vitrine","keywords":["vitrine","oferta","link","enviar cliente"],"boost":["lead","cliente"],"penalize":[],"acao":"explicar","descricao":"A vitrine é o link /cliente/oferta/:leadId — compartilhe com o cliente para ele ver os imóveis em match.","score_min":0.4},{"id":"estrategia_venda","keywords":["vender","fechar","negocio","proposta","lead quente"],"boost":["como","dica"],"penalize":[],"acao":"estrategia_venda","score_min":0.4},{"id":"mercado","keywords":["mercado","demanda","tendencia","mais buscado"],"boost":["analise","relatorio"],"penalize":[],"acao":"analise_mercado","score_min":0.4},{"id":"resumo_dia","keywords":["resumo","o que fazer","acoes","prioridade","devo fazer"],"boost":["dia","agora","hoje"],"penalize":[],"acao":"resumo_diario","score_min":0.4},{"id":"ajuda","keywords":["ajuda","help","como faz","nao sei","o que voce faz"],"boost":["fazer","usar"],"penalize":[],"acao":"mostrar_ajuda","score_min":0.3}];

function normalizar(txt) {
  if (!txt) return '';
  return txt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\s]/g,' ')
    .split(/\s+/).map(t => sinonimos[t] || t).join(' ');
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
  const m1 = norm.match(/(\d+)\s*(quarto|dormitorio|suite)/);
  const m2 = norm.match(/(quarto|dormitorio)\s*[:\-]?\s*(\d+)/);
  if (m1) slots.quartos = parseInt(m1[1]); else if (m2) slots.quartos = parseInt(m2[2]);
  const ate = norm.match(/(?:ate|maximo)\s*r?\$?\s*([\d.,]+)\s*(mil|k|m)?/);
  if (ate) { let v = parseFloat(ate[1].replace(/\./g,'').replace(',','.')); if ((ate[2]||'').match(/mil|k/i)) v*=1000; if ((ate[2]||'').match(/^m$/i)) v*=1000000; slots.valorMax = v; }
  for (const p of ['vivareal','zap','olx','chaves','imovelweb','123i']) { if (norm.includes(p)) { slots.portal = p; break; } }
  const bm = norm.match(/\b(?:em|no|na|bairro)\s+([a-z\s]{3,25}?)(?:\s|$|,)/);
  if (bm) slots.bairro = bm[1].trim();
  return slots;
}

function perguntarSlot(slot) {
  return { tipo:'Que tipo de imóvel? (apartamento, casa...)', quartos:'Quantos quartos?', valorMax:'Qual o valor máximo?', bairro:'Qual bairro ou região?' }[slot] || 'Pode dar mais detalhes?';
}

module.exports = { detectarIntencao, extrairSlots, perguntarSlot, normalizar };
