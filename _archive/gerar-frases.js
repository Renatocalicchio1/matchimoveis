'use strict';
const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// ── GERADORES DE FRASES POR COMBINAÇÃO ───────────────────────────────────────

const PREFIXOS_VER    = ['quero ver','me mostra','mostra','lista','listar','exibe','exibir','ver','veja','me diz','me fala','quero saber','preciso ver','pode me mostrar','me mostra por favor','me diz','consegue me mostrar'];
const PREFIXOS_COMO   = ['como','como faço','como faz','como eu faço','como posso','como devo','como consigo','de que forma','qual a forma de','qual o jeito de','como funciona','como se faz'];
const PREFIXOS_TENHO  = ['tenho','meu','minha','tenho um','tenho uma','tenho varios','tenho vários'];
const PREFIXOS_QUERO  = ['quero','preciso','preciso de','gostaria','gostaria de','queria','me interessa','me ajuda com','preciso resolver'];
const PREFIXOS_CLIENTE= ['meu cliente','tenho um cliente','tenho uma cliente','meu comprador','minha compradora','um cliente meu','uma cliente minha','o cliente','a cliente'];

const SUJEITOS_LEAD   = ['leads','as leads','meus clientes','meus contatos','os clientes','as leads cadastradas','meus prospectos'];
const SUJEITOS_IMOVEL = ['imoveis','os imoveis','minha carteira','os imoveis cadastrados','meus imoveis','a carteira','os ativos'];
const SUJEITOS_VISITA = ['visitas','as visitas','minha agenda','os agendamentos','as visitas agendadas'];
const SUJEITOS_MATCH  = ['match','os matches','os resultados','as compatibilidades','os mds'];
const SUJEITOS_PORTAL = ['portais','os portais','os feeds','os xmls','os links dos portais'];

const QUALIF_LEAD  = ['quentes','frias','de hoje','sem match','com match','novas','antigas','paradas','sem resposta','prioritarias','urgentes','importadas','organicas'];
const QUALIF_IMOVEL= ['inativos','ativos','parados','sem foto','sem proprietario','sem match','arquivados','publicados','disponiveis'];
const QUALIF_VISITA= ['de hoje','pendentes','confirmadas','canceladas','da semana','do mes','aguardando','em aberto'];

const TIPOS_IMOVEL = ['apartamento','apto','casa','cobertura','terreno','sobrado','studio','loft','kitnet','comercial'];
const BAIRROS      = ['itajai','balneario camboriu','itapema','navegantes','camboriu','florianopolis','joinville','blumenau'];
const QUARTOS      = ['1','2','3','4'];
const VALORES      = ['200 mil','300 mil','400 mil','500 mil','600 mil','700 mil','800 mil','1 milhao'];

// ── GERADOR ──────────────────────────────────────────────────────────────────
const frases = new Set();

function add(f) { if (f && f.length < 80) frases.add(f.toLowerCase().trim()); }

// VER X
PREFIXOS_VER.forEach(p => {
  SUJEITOS_LEAD.forEach(s => add(`${p} ${s}`));
  SUJEITOS_IMOVEL.forEach(s => add(`${p} ${s}`));
  SUJEITOS_VISITA.forEach(s => add(`${p} ${s}`));
  SUJEITOS_MATCH.forEach(s => add(`${p} ${s}`));
  SUJEITOS_PORTAL.forEach(s => add(`${p} ${s}`));
  QUALIF_LEAD.forEach(q => add(`${p} leads ${q}`));
  QUALIF_IMOVEL.forEach(q => add(`${p} imoveis ${q}`));
  QUALIF_VISITA.forEach(q => add(`${p} visitas ${q}`));
});

// TEM X EM Y?
TIPOS_IMOVEL.forEach(t => {
  BAIRROS.forEach(b => {
    add(`tem ${t} em ${b}`);
    add(`tem ${t} disponivel em ${b}`);
    add(`existe ${t} em ${b}`);
    add(`busca ${t} em ${b}`);
    add(`procura ${t} em ${b}`);
    add(`encontra ${t} em ${b}`);
  });
  QUARTOS.forEach(q => {
    add(`tem ${t} de ${q} quartos`);
    add(`${t} com ${q} quartos`);
    add(`${t} ${q} quartos`);
    add(`${q} quartos ${t}`);
  });
  VALORES.forEach(v => {
    add(`${t} ate ${v}`);
    add(`${t} por ${v}`);
    add(`${t} menos de ${v}`);
    add(`${t} ate ${v}`);
  });
  BAIRROS.forEach(b => QUARTOS.forEach(q => {
    add(`${t} ${q} quartos em ${b}`);
    add(`tem ${t} ${q} quartos em ${b}`);
  }));
  BAIRROS.forEach(b => VALORES.forEach(v => {
    add(`${t} em ${b} ate ${v}`);
    add(`tem ${t} em ${b} ate ${v}`);
  }));
});

// CLIENTE QUER X
PREFIXOS_CLIENTE.forEach(p => {
  TIPOS_IMOVEL.forEach(t => {
    add(`${p} quer ${t}`);
    add(`${p} procura ${t}`);
    add(`${p} busca ${t}`);
    add(`${p} precisa de ${t}`);
    add(`${p} esta interessado em ${t}`);
    add(`${p} querendo ${t}`);
    BAIRROS.forEach(b => {
      add(`${p} quer ${t} em ${b}`);
      add(`${p} procura ${t} em ${b}`);
      add(`${p} busca ${t} em ${b}`);
    });
    QUARTOS.forEach(q => {
      add(`${p} quer ${t} de ${q} quartos`);
      add(`${p} precisa de ${t} com ${q} quartos`);
    });
  });
  add(`${p} nao gostou`);
  add(`${p} gostou`);
  add(`${p} aprovou`);
  add(`${p} recusou`);
  add(`${p} topou`);
  add(`${p} quer fechar`);
  add(`${p} nao quis`);
  add(`${p} adorou`);
  add(`${p} nao curtiu`);
});

// COMO FAZER X
const ACOES = [
  'cadastrar imovel','importar leads','gerar xml','conectar whatsapp',
  'adicionar fotos','inativar imovel','trocar senha','publicar no portal',
  'enviar vitrine','confirmar visita','notificar proprietario','remarcar visita',
  'fazer match','ver relatório','importar via xml','subir planilha',
  'atualizar localizacao','editar imovel','excluir lead','ver historico',
];
PREFIXOS_COMO.forEach(p => ACOES.forEach(a => add(`${p} ${a}`)));

// QUERO / PRECISO FAZER X
PREFIXOS_QUERO.forEach(p => {
  ACOES.forEach(a => add(`${p} ${a}`));
  add(`${p} ajuda`);
  add(`${p} entender o sistema`);
  add(`${p} ver meu desempenho`);
  add(`${p} um relatorio`);
  add(`${p} organizar meu dia`);
});

// FRASES DE STATUS E PERGUNTA DIRETA
['lead','imovel','visita','match','portal','proprietario','xml','vitrine','planilha','corretor'].forEach(tema => {
  add(`o que e ${tema}`);
  add(`o que significa ${tema}`);
  add(`como funciona ${tema}`);
  add(`me explica ${tema}`);
  add(`nao entendo ${tema}`);
  add(`duvida sobre ${tema}`);
  add(`como uso ${tema}`);
  add(`para que serve ${tema}`);
  add(`o que faz ${tema}`);
});

// URGENCIAS E PROBLEMAS
const PROBLEMAS = [
  'xml nao atualizou','portal rejeitou','nao deu match','nao importou','nao funciona',
  'esta com erro','nao aparece','nao saiu','nao subiu','nao publicou','nao encontrou',
  'nao consigo importar','nao consigo acessar','nao consigo ver','pagina nao carrega',
  'erro ao importar','erro ao gerar','bug no sistema','problema no portal',
];
PROBLEMAS.forEach(p => {
  add(`${p}`);
  add(`meu ${p}`);
  add(`o ${p}`);
  add(`por que ${p}`);
  add(`porque ${p}`);
  add(`como resolver ${p}`);
  add(`como corrijo ${p}`);
});

// MÉTRICAS E ANÁLISE
const METRICAS = [
  'taxa de match','total de leads','total de imoveis','total de visitas',
  'leads por bairro','imoveis por bairro','demanda por bairro','oferta por bairro',
  'tipo mais buscado','valor medio','faixa de preco','quartos mais pedidos',
  'leads sem match','imoveis sem lead','visitas confirmadas','visitas pendentes',
  'meu desempenho','meus resultados','meu relatorio','resumo da conta',
  'minha performance','estatisticas da conta','numeros da conta',
];
METRICAS.forEach(m => {
  add(m);
  add(`quero ver ${m}`);
  add(`me mostra ${m}`);
  add(`qual ${m}`);
  add(`como esta ${m}`);
  add(`ver ${m}`);
  add(`mostrar ${m}`);
});

console.log('Frases geradas:', frases.size);

// ── SALVAR NA BASE DE CONHECIMENTO ───────────────────────────────────────────
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};
const exist = new Set(base.items.map(i=>i.p));

// Mapear frase → domínio
function inferirDominio(frase) {
  const f = frase.toLowerCase();
  if (/lead|cliente|contato|prospecto|comprador/.test(f)) return 'leads';
  if (/imovel|apartamento|casa|cobertura|terreno|carteira|ativo/.test(f)) return 'imoveis';
  if (/visita|agenda|agendamento|confirmar/.test(f)) return 'visitas';
  if (/match|md|compatib/.test(f)) return 'match';
  if (/portal|xml|feed|vivareal|zap|olx|chaves/.test(f)) return 'portais';
  if (/mercado|demanda|oferta|bairro|tipo mais|valor medio|faixa/.test(f)) return 'mercado';
  if (/como|o que e|funciona|explica|duvida/.test(f)) return 'sistema';
  return 'geral';
}

let add2 = 0;
for (const frase of frases) {
  if (!exist.has(frase)) {
    base.items.push({ p: frase, r: inferirDominio(frase) });
    exist.add(frase);
    add2++;
  }
}

base.total = base.items.length;
base.atualizadoEm = new Date().toISOString();
fs.writeFileSync(baseP, JSON.stringify(base,null,2));
console.log('Base de conhecimento: +' + add2 + ' frases (total: ' + base.total + ')');

// ── SALVAR SINÔNIMOS DAS NOVAS FRASES ────────────────────────────────────────
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = JSON.parse(fs.readFileSync(sPath,'utf8'));

// Sinônimos de frases com erros de digitação comuns
const ERROS_DIGITACAO = {
  'ver imovei':'ver imoveis','ver lids':'ver leads','vizitas':'visitas',
  'matsh':'match','dashbord':'dashboard','portias':'portais',
  'lids quentes':'leads quentes','lids frias':'leads frias',
  'lids hoje':'leads de hoje','imovieis':'imoveis','imovei':'imovel',
  'aprtamento':'apartamento','apratamento':'apartamento',
  'balneario':'balneario camboriu','bln':'balneario camboriu',
  'itajai sc':'itajai','itajaí':'itajai',
  'nao deu md':'nao deu match','sem md':'sem match','com md':'com match',
  'gerar link':'gerar xml','subir xml':'gerar xml',
  'como cadastrar':'como cadastro','como importar':'como importo',
};

let addS = 0;
for (const [k,v] of Object.entries(ERROS_DIGITACAO)) {
  if (!s[k]) { s[k]=v; addS++; }
}
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('Sinônimos: +' + addS + ' (total: ' + Object.keys(s).length + ')');

console.log('\nTudo gerado!');
console.log('Base:', base.total, 'frases');
console.log('Sinônimos:', Object.keys(s).length);
