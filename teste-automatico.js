'use strict';
/**
 * TESTE AUTOMÁTICO DO CÉREBRO
 * Roda todos os casos, detecta falhas, sugere correções.
 * node teste-automatico.js
 */

const cerebro = require('./cerebro/index');

const D = {
  ativos:45, inativos:8,
  bairros:['Itajaí','Balneário Camboriú','Itapema','Navegantes'],
  tipos:['Apartamento','Casa','Cobertura','Terreno'],
  leads:87, organicas:52, importadas:35,
  comMatch:41, semMatch:46,
  visitas:12, hoje:2, pendentes:3, confirmadas:7
};
const IMOVEIS = [
  {id:'i1',userId:'t',status:'ativo',tipo:'Apartamento',bairro:'Itajaí',quartos:2,valor:350000,fotos:['a.jpg'],descricao:'Apto'},
  {id:'i2',userId:'t',status:'ativo',tipo:'Casa',bairro:'Balneário Camboriú',quartos:3,valor:750000,fotos:['a.jpg'],descricao:'Casa'},
];
const LEADS = [
  {id:'l1',userId:'t',nome:'João Silva',bairro:'Itajaí',tipo:'Apartamento',quartos:2,valorMax:400000,matchesBase:[{id:'i1'}],dataCriacao:new Date().toISOString()},
  {id:'l2',userId:'t',nome:'Maria Santos',bairro:'Balneário Camboriú',tipo:'Casa',quartos:3,valorMax:800000,matchesBase:[{id:'i2'}]},
  {id:'l3',userId:'t',nome:'Pedro Costa',bairro:'Florianópolis',tipo:'Apartamento',quartos:2,valorMax:500000,matchesBase:[]},
];
const VISITAS = [
  {id:'v1',userId:'t',leadId:'l1',status:'confirmada',dataVisita:new Date().toLocaleDateString('pt-BR')},
  {id:'v2',userId:'t',leadId:'l2',status:'solicitada',dataVisita:new Date().toLocaleDateString('pt-BR')},
];
const U = {nome:'Renato',id:'test',userId:'test'};

// ── CASOS DE TESTE COMPLETOS ──────────────────────────────────────────────────
const CASOS = [
  // SAUDAÇÃO
  {grupo:'Saudação',    p:'oi',                       espera:['Bom dia','Boa tarde','Boa noite']},
  {grupo:'Saudação',    p:'bom dia',                  espera:['Bom dia']},
  {grupo:'Saudação',    p:'boa tarde',                espera:['Bom dia','Boa tarde','Boa noite','👋']},
  {grupo:'Saudação',    p:'olá',                      espera:['Bom dia','Boa tarde','Boa noite']},
  {grupo:'Saudação',    p:'eai',                      espera:['Bom dia','Boa tarde','Boa noite']},
  // LEADS
  {grupo:'Leads',       p:'minhas leads',              espera:['Lead','lead','👥']},
  {grupo:'Leads',       p:'quantas leads tenho',       espera:['Lead','lead','👥']},
  {grupo:'Leads',       p:'leads com match',           espera:['match','Match']},
  {grupo:'Leads',       p:'leads sem match',           espera:['sem match','Sem match']},
  {grupo:'Leads',       p:'leads quentes',             espera:['quente','match','Lead']},
  {grupo:'Leads',       p:'leads de hoje',             espera:['hoje','lead','Lead']},
  {grupo:'Leads',       p:'leads frias',               espera:['fria','Lead','lead']},
  {grupo:'Leads',       p:'importar leads',            espera:['Importar','importar','planilha']},
  {grupo:'Leads',       p:'clientes novos',            espera:['Lead','lead','hoje']},
  {grupo:'Leads',       p:'buscar lead João',          espera:['João','lead','Lead']},
  // IMÓVEIS
  {grupo:'Imóveis',     p:'meus imóveis',              espera:['Imóvel','imóvel','🏠']},
  {grupo:'Imóveis',     p:'imóveis inativos',          espera:['inativo','Inativo']},
  {grupo:'Imóveis',     p:'imóveis sem proprietário',  espera:['proprietário','Proprietário']},
  {grupo:'Imóveis',     p:'importar xml',              espera:['XML','xml','importar','Imóvel','Importe']},
  {grupo:'Imóveis',     p:'valor médio da carteira',   espera:['valor','Valor','R$']},
  {grupo:'Imóveis',     p:'imóveis parados',           espera:['parado','match','imóvel']},
  {grupo:'Imóveis',     p:'tem apartamento em Itajaí', espera:['Itajaí','imóvel','Imóvel']},
  {grupo:'Imóveis',     p:'casas disponíveis',         espera:['Casa','casa','imóvel']},
  // VISITAS
  {grupo:'Visitas',     p:'minhas visitas',            espera:['Visita','visita','📅']},
  {grupo:'Visitas',     p:'visitas hoje',              espera:['hoje','visita','Visita']},
  {grupo:'Visitas',     p:'visitas pendentes',         espera:['pendente','Pendente']},
  {grupo:'Visitas',     p:'quem confirmou visita',     espera:['confirm','Confirm']},
  {grupo:'Visitas',     p:'como funciona a visita',    espera:['Fluxo','fluxo','visita']},
  // MATCH
  {grupo:'Match',       p:'ver match',                 espera:['Match','match','🎯']},
  {grupo:'Match',       p:'como funciona o match',     espera:['bairro','tipo','quartos','Match','match','cruza']},
  {grupo:'Match',       p:'taxa de match',             espera:['%','taxa','Taxa']},
  {grupo:'Match',       p:'por que não deu match',     espera:['bairro','tipo','inativo']},
  {grupo:'Match',       p:'fazer match agora',         espera:['match','Match','lead']},
  // MERCADO
  {grupo:'Mercado',     p:'demanda por bairro',        espera:['bairro','Bairro','lead']},
  {grupo:'Mercado',     p:'faixa de valor',            espera:['valor','Valor','lead','R$']},
  {grupo:'Mercado',     p:'tipo mais buscado',         espera:['tipo','Tipo','lead']},
  {grupo:'Mercado',     p:'bairros mais buscados',     espera:['bairro','Bairro','lead']},
  {grupo:'Mercado',     p:'ticket medio',              espera:['valor','Valor','lead']},
  {grupo:'Mercado',     p:'orcamento dos clientes',    espera:['valor','Valor','lead']},
  {grupo:'Mercado',     p:'quartos mais pedidos',      espera:['quarto','Quarto','lead']},
  // PORTAIS
  {grupo:'Portais',     p:'ver portais',               espera:['Portal','portal','VivaReal']},
  {grupo:'Portais',     p:'gerar xml vivareal',        espera:['VivaReal','vivareal','XML']},
  {grupo:'Portais',     p:'meu xml não atualizou',     espera:['XML','xml','URL']},
  {grupo:'Portais',     p:'meu portal rejeitou',       espera:['foto','descri','rejeit','portal','XML']},
  // SUPORTE
  {grupo:'Suporte',     p:'como cadastrar imóvel',     espera:['Cadastrar','cadastrar','imóvel']},
  {grupo:'Suporte',     p:'como importar leads',       espera:['Importar','importar','planilha']},
  {grupo:'Suporte',     p:'como inativar imóvel',      espera:['Inativar','inativar']},
  {grupo:'Suporte',     p:'como adicionar fotos',      espera:['foto','Foto']},
  {grupo:'Suporte',     p:'como trocar senha',         espera:['senha','Senha','Perfil']},
  {grupo:'Suporte',     p:'como conectar whatsapp',    espera:['WhatsApp','whatsapp','Twilio']},
  // ESTRATÉGIA
  {grupo:'Estratégia',  p:'o que devo fazer hoje',     espera:['Plano','plano','acao','alerta','visita','lead']},
  {grupo:'Estratégia',  p:'me orienta',                espera:['Plano','plano','ação']},
  {grupo:'Estratégia',  p:'quem devo atender primeiro',espera:['ordem','lead','Lead','score']},
  {grupo:'Estratégia',  p:'qual lead tem mais chance', espera:['chance','lead','Lead','score']},
  // RESUMO
  {grupo:'Resumo',      p:'resumo geral',              espera:['Resumo','resumo','ativos','leads','match']},
  {grupo:'Resumo',      p:'resumo do dia',             espera:['Plano','plano','acao','alerta','lead']},
  {grupo:'Resumo',      p:'minha conta',               espera:['Imóveis','leads','match']},
  // SISTEMA
  {grupo:'Sistema',     p:'o que é match',             espera:['bairro','tipo','quartos']},
  {grupo:'Sistema',     p:'o que é vitrine',           espera:['vitrine','lead','imóvel']},
  {grupo:'Sistema',     p:'o que você faz',            espera:['ajudar','Lead','Imóvel']},
  {grupo:'Sistema',     p:'ajuda',                     espera:['Leads','Imóveis','Visitas']},
  // COINS / NOTIFICAÇÕES
  {grupo:'Outros',      p:'meus coins',                espera:['Coin','coin','recompensa']},
  {grupo:'Outros',      p:'minhas notificações',       espera:['notif','Notif','alerta']},
  {grupo:'Outros',      p:'relatório semanal',         espera:['Relatório','relatório','match']},
  // RAG — busca real
  {grupo:'RAG',         p:'tem apto 2 quartos em Itajaí',    espera:['Itajaí','imóvel','Imóvel']},
  {grupo:'RAG',         p:'apartamento até 400 mil',          espera:['imóvel','Imóvel','valor']},
  {grupo:'RAG',         p:'casas com 3 quartos',              espera:['Casa','casa','imóvel']},
  // NÃO DEVE ENTENDER (mas não pode travar)
  {grupo:'Fallback',    p:'blablabla xpto nada',       naoEspera:['erro','Error','undefined']},
  {grupo:'Fallback',    p:'qwerty asdfgh',             naoEspera:['erro','Error','undefined']},
];

// ── RODAR TESTES ──────────────────────────────────────────────────────────────
console.log('\n🧪 TESTE AUTOMÁTICO DO CÉREBRO');
console.log('═'.repeat(55));

const grupos = {};
let totalOk = 0, totalFalhou = 0;
const falhas = [];

for (const caso of CASOS) {
  let resposta = '';
  try {
    resposta = cerebro.responder(caso.p, D, U, IMOVEIS, LEADS, VISITAS, {});
  } catch(e) {
    resposta = 'ERRO: ' + e.message;
  }
  const txt = resposta.replace(/<[^>]+>/g,'');

  let ok = true;
  if (caso.espera) {
    ok = caso.espera.some(e => txt.includes(e));
  }
  if (caso.naoEspera) {
    ok = !caso.naoEspera.some(e => txt.includes(e));
  }

  grupos[caso.grupo] = grupos[caso.grupo] || {ok:0,falhou:0};
  if (ok) { grupos[caso.grupo].ok++; totalOk++; }
  else    { grupos[caso.grupo].falhou++; totalFalhou++; falhas.push({grupo:caso.grupo, p:caso.p, espera:caso.espera, got:txt.substring(0,80)}); }
}

// ── RESULTADO POR GRUPO ───────────────────────────────────────────────────────
console.log('\n📊 Por grupo:\n');
for (const [grupo, m] of Object.entries(grupos)) {
  const tot = m.ok + m.falhou;
  const pct = Math.round(m.ok/tot*100);
  const bar = '█'.repeat(Math.round(pct/10)) + '░'.repeat(10-Math.round(pct/10));
  const emoji = pct===100?'✅':pct>=80?'🟡':'🔴';
  console.log(`${emoji} ${grupo.padEnd(14)} ${bar} ${pct}% (${m.ok}/${tot})`);
}

const total = totalOk + totalFalhou;
const cobertura = Math.round(totalOk/total*100);
console.log(`\n${'═'.repeat(55)}`);
console.log(`🎯 COBERTURA TOTAL: ${totalOk}/${total} (${cobertura}%)`);

if (falhas.length) {
  console.log(`\n❌ Falhas (${falhas.length}):\n`);
  falhas.forEach(f => {
    console.log(`  [${f.grupo}] "${f.p}"`);
    console.log(`    esperava: ${(f.espera||[]).join(' ou ')}`);
    console.log(`    recebeu:  ${f.got}`);
  });
}

// ── SALVAR RELATÓRIO ──────────────────────────────────────────────────────────
const fs = require('fs');
fs.writeFileSync('cerebro/cobertura-relatorio.json', JSON.stringify({
  geradoEm: new Date().toISOString(),
  cobertura, totalOk, totalFalhou,
  porGrupo: grupos, falhas
}, null, 2));
console.log(`\n📁 Relatório salvo em cerebro/cobertura-relatorio.json`);
if (cobertura < 100) console.log(`\n💡 Rode novamente após correções: node teste-automatico.js`);
else console.log(`\n🎉 100% de cobertura atingida!`);
