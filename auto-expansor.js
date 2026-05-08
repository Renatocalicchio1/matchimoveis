'use strict';
/**
 * AUTO-EXPANSOR DO CÉREBRO v1.0
 * Lê o assistente-mapa.json e expande cada módulo com:
 * - Novas keywords descobertas nas rotas/views
 * - Novas perguntas da base de conhecimento
 * - Padrões aprendidos com usuários reais
 * - Sinônimos novos detectados
 *
 * Rodar: npm run expandir
 * Ou junto com o cérebro: npm run cerebro && npm run expandir
 */

const fs   = require('fs');
const path = require('path');

console.log('🔄 Auto-expansor iniciando...');

// ── CARREGAR FONTES ───────────────────────────────────────────────────────────
const mapaPath = path.join(__dirname, 'assistente-mapa.json');
const mapa     = JSON.parse(fs.readFileSync(mapaPath, 'utf8'));

// Carregar não-entendidos para aprender
const naoEntPath = path.join(__dirname, 'assistente-nao-entendidos.json');
const naoEnt = fs.existsSync(naoEntPath)
  ? JSON.parse(fs.readFileSync(naoEntPath, 'utf8'))
  : { nao_entendidos:[] };

// Carregar memória para aprender preferências
const memPath = path.join(__dirname, 'assistente-memoria.json');
const mem = fs.existsSync(memPath)
  ? JSON.parse(fs.readFileSync(memPath, 'utf8'))
  : { historico:[], perfis:{} };

// ── ANALISAR HISTÓRICO REAL ───────────────────────────────────────────────────
const historico = mem.historico || [];
const perguntasPorDominio = {
  leads: [], imoveis: [], visitas: [], match: [],
  portais: [], mercado: [], sistema: [], acoes: []
};

// Categorizar perguntas do histórico
historico.forEach(h => {
  const t = h.pergunta.toLowerCase();
  if (/lead|cliente|interessado/.test(t))      perguntasPorDominio.leads.push(h.pergunta);
  if (/imov|carteira|apartamento|casa/.test(t)) perguntasPorDominio.imoveis.push(h.pergunta);
  if (/visita|agenda|agendar/.test(t))          perguntasPorDominio.visitas.push(h.pergunta);
  if (/match|combin|compat/.test(t))            perguntasPorDominio.match.push(h.pergunta);
  if (/portal|xml|vivareal|zap/.test(t))        perguntasPorDominio.portais.push(h.pergunta);
  if (/mercado|demanda|bairro|valor/.test(t))   perguntasPorDominio.mercado.push(h.pergunta);
  if (/ajuda|o que|como|explicar/.test(t))      perguntasPorDominio.sistema.push(h.pergunta);
  if (/importar|gerar|confirmar|inativar/.test(t)) perguntasPorDominio.acoes.push(h.pergunta);
});

// ── EXTRAIR KEYWORDS NOVAS DAS ROTAS ─────────────────────────────────────────
const rotasKeywords = {};
(mapa.rotas || []).forEach(r => {
  const dominio = detectarDominioRota(r.rota);
  if (dominio) {
    rotasKeywords[dominio] = rotasKeywords[dominio] || new Set();
    r.keywords.forEach(k => rotasKeywords[dominio].add(k));
  }
});

function detectarDominioRota(rota) {
  if (/lead/.test(rota))    return 'leads';
  if (/imovel|imoveis/.test(rota)) return 'imoveis';
  if (/visita/.test(rota))  return 'visitas';
  if (/match/.test(rota))   return 'match';
  if (/portal|xml/.test(rota)) return 'portais';
  if (/proprietario/.test(rota)) return 'imoveis';
  if (/assistente/.test(rota)) return 'sistema';
  return null;
}

// ── GERAR RELATÓRIO DE EXPANSÃO ───────────────────────────────────────────────
const relatorioExpansao = {
  geradoEm: new Date().toISOString(),
  versaoMapa: mapa.versao,
  totalHistorico: historico.length,
  totalNaoEntendidos: (naoEnt.nao_entendidos||[]).length,
  totalPerfis: Object.keys(mem.perfis||{}).length,
  perguntasPorDominio: Object.fromEntries(
    Object.entries(perguntasPorDominio).map(([k,v]) => [k, v.length])
  ),
  topNaoEntendidas: (naoEnt.nao_entendidos||[])
    .sort((a,b)=>b.count-a.count).slice(0,10)
    .map(n => ({ pergunta: n.exemplo, count: n.count })),
  keywordsNovas: Object.fromEntries(
    Object.entries(rotasKeywords).map(([k,v]) => [k, [...v].slice(0,10)])
  ),
  sugestoesNovasIntencoes: (naoEnt.sugestoes||[])
    .filter(s=>s.status==='pendente')
    .map(s => ({ pergunta: s.pergunta, count: s.count }))
};

// ── ATUALIZAR nlp.js COM SINÔNIMOS NOVOS ─────────────────────────────────────
const sinonimosNovos = {};
// Extrair sinônimos do mapa
Object.entries(mapa.sinonimos || {}).forEach(([e, c]) => {
  sinonimosNovos[e] = c;
});
// Adicionar do histórico (erros comuns detectados)
const errosComuns = detectarErrosComuns(historico);
Object.assign(sinonimosNovos, errosComuns);

function detectarErrosComuns(hist) {
  const erros = {};
  const padroes = [
    [/imovei\b/g, 'imovel'], [/vizita/g, 'visita'], [/lids\b/g, 'lead'],
    [/matsh/g, 'match'], [/conis\b/g, 'coins'], [/prietario/g, 'proprietario'],
    [/dashbord/g, 'dashboard'], [/relatorrio/g, 'relatorio'],
    [/inetligente/g, 'inteligente'], [/ceribro/g, 'cerebro']
  ];
  hist.forEach(h => {
    padroes.forEach(([regex, correto]) => {
      if (regex.test(h.pergunta.toLowerCase())) {
        const errado = h.pergunta.toLowerCase().match(regex)?.[0];
        if (errado) erros[errado] = correto;
      }
    });
  });
  return erros;
}

// ── ATUALIZAR ARQUIVO DE SINÔNIMOS APRENDIDOS ─────────────────────────────────
const sinonimosPath = path.join(__dirname, 'cerebro', 'sinonimos-aprendidos.json');
const sinonimosExistentes = fs.existsSync(sinonimosPath)
  ? JSON.parse(fs.readFileSync(sinonimosPath, 'utf8'))
  : {};
const sinonimosAtualizados = { ...sinonimosExistentes, ...sinonimosNovos };
fs.writeFileSync(sinonimosPath, JSON.stringify(sinonimosAtualizados, null, 2));

// ── ATUALIZAR base-conhecimento-expandida.json ────────────────────────────────
// Combina base do mapa + perguntas reais dos usuários
const baseConhecimento = [
  ...(mapa.base_conhecimento || []),
  // Adicionar perguntas reais que obtiveram resposta
  ...historico
    .filter(h => h.resposta && !h.resposta.includes('não entendi'))
    .slice(-100)
    .map(h => ({ p: h.pergunta, r: h.resposta ? 'historico' : null, real: true }))
    .filter(h => h.r)
];

const baseExpandidaPath = path.join(__dirname, 'cerebro', 'base-conhecimento-expandida.json');
fs.writeFileSync(baseExpandidaPath, JSON.stringify({
  geradoEm: new Date().toISOString(),
  total: baseConhecimento.length,
  items: baseConhecimento
}, null, 2));

// ── SALVAR RELATÓRIO ──────────────────────────────────────────────────────────
const relPath = path.join(__dirname, 'cerebro', 'expansao-relatorio.json');
fs.writeFileSync(relPath, JSON.stringify(relatorioExpansao, null, 2));

// ── ATUALIZAR nlp.js AUTOMATICAMENTE ─────────────────────────────────────────
const nlpPath = path.join(__dirname, 'cerebro', 'nlp.js');
let nlpContent = fs.readFileSync(nlpPath, 'utf8');

// Verificar se já tem a seção de sinônimos aprendidos
if (!nlpContent.includes('sinonimos-aprendidos')) {
  const insercao = `
// ── SINÔNIMOS APRENDIDOS (auto-gerado pelo expansor) ─────────────────────────
try {
  const fs = require('fs'), path = require('path');
  const aprendidos = JSON.parse(fs.readFileSync(path.join(__dirname,'sinonimos-aprendidos.json'),'utf8'));
  Object.assign(SINONIMOS, aprendidos);
} catch(_) {}
`;
  // Inserir após a declaração de SINONIMOS
  nlpContent = nlpContent.replace(
    /^(const SINONIMOS = \{[\s\S]+?\};)/m,
    '$1\n' + insercao
  );
  fs.writeFileSync(nlpPath, nlpContent);
  console.log('  ✅ nlp.js atualizado com sinônimos aprendidos');
}

// ── RELATÓRIO FINAL ───────────────────────────────────────────────────────────
console.log('');
console.log('✅ Auto-expansão concluída!');
console.log('');
console.log('  📊 Histórico analisado:   ', historico.length, 'interações');
console.log('  ❓ Não entendidas:        ', (naoEnt.nao_entendidos||[]).length, 'perguntas');
console.log('  🧠 Perfis de usuários:    ', Object.keys(mem.perfis||{}).length);
console.log('  🔤 Sinônimos aprendidos:  ', Object.keys(sinonimosNovos).length);
console.log('  📚 Base conhecimento:     ', baseConhecimento.length, 'itens');
console.log('');

if (relatorioExpansao.topNaoEntendidas.length) {
  console.log('  🔍 Top perguntas não entendidas:');
  relatorioExpansao.topNaoEntendidas.slice(0,5).forEach(n => {
    console.log(`     "${n.pergunta}" — ${n.count}x`);
  });
  console.log('');
}

if (relatorioExpansao.sugestoesNovasIntencoes.length) {
  console.log('  💡 Sugestões de novas intenções:');
  relatorioExpansao.sugestoesNovasIntencoes.forEach(s => {
    console.log(`     "${s.pergunta}" — ${s.count}x pedida`);
  });
  console.log('');
}

console.log('  📁 Arquivos gerados:');
console.log('     cerebro/sinonimos-aprendidos.json');
console.log('     cerebro/base-conhecimento-expandida.json');
console.log('     cerebro/expansao-relatorio.json');
console.log('');
console.log('  👉 Próximo passo: revise as sugestões e adicione ao cerebro.js');
