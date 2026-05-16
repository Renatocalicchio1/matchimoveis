const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

const TIPOS    = ['apartamento','apto','casa','cobertura','terreno','sobrado','studio','loft','kitnet','comercial'];
const BAIRROS  = ['itajai','balneario camboriu','itapema','navegantes','camboriu','florianopolis','joinville','blumenau','vila andrade','pinheiros','moema','vila mariana','perdizes','lapa'];
const QUARTOS  = ['1','2','3','4','5'];
const VALORES  = ['200 mil','300 mil','400 mil','500 mil','600 mil','700 mil','800 mil','1 milhao','200000','300000','500000'];
const VAGAS    = ['1','2','3'];

const frases = new Set();
function add(f){ if(f&&f.length<100) frases.add(f.toLowerCase().trim()); }

// TEM X EM Y
TIPOS.forEach(t => {
  // simples
  add(`tem ${t}`);
  add(`tem ${t} disponivel`);
  add(`existe ${t}`);
  add(`busca ${t}`);
  add(`procura ${t}`);
  add(`quero ${t}`);
  add(`preciso de ${t}`);
  add(`mostra ${t}`);
  add(`ver ${t}`);
  add(`lista ${t}`);
  add(`${t} disponivel`);
  add(`${t} na carteira`);
  add(`${t} cadastrado`);

  // com bairro
  BAIRROS.forEach(b => {
    add(`tem ${t} em ${b}`);
    add(`${t} em ${b}`);
    add(`${t} no ${b}`);
    add(`${t} na ${b}`);
    add(`tem ${t} no ${b}`);
    add(`existe ${t} em ${b}`);
    add(`busca ${t} em ${b}`);
    add(`procura ${t} em ${b}`);
    add(`quero ${t} em ${b}`);
    add(`${t} disponivel em ${b}`);
    add(`imovel em ${b}`);
    add(`imoveis em ${b}`);
    add(`o que tem em ${b}`);
    add(`o que tem no ${b}`);
  });

  // com quartos
  QUARTOS.forEach(q => {
    add(`${t} ${q} quartos`);
    add(`${t} de ${q} quartos`);
    add(`${t} com ${q} quartos`);
    add(`tem ${t} de ${q} quartos`);
    add(`${t} ${q} dormitorios`);
    add(`${q} quartos ${t}`);
  });

  // com valor
  VALORES.forEach(v => {
    add(`${t} ate ${v}`);
    add(`${t} por ${v}`);
    add(`${t} menos de ${v}`);
    add(`tem ${t} ate ${v}`);
    add(`${t} abaixo de ${v}`);
  });

  // com vagas
  VAGAS.forEach(v => {
    add(`${t} com ${v} vaga`);
    add(`${t} ${v} vagas`);
    add(`tem ${t} com ${v} vaga`);
  });

  // combinacoes bairro + quartos
  BAIRROS.forEach(b => QUARTOS.forEach(q => {
    add(`${t} ${q} quartos em ${b}`);
    add(`tem ${t} ${q} quartos em ${b}`);
    add(`${q} quartos em ${b}`);
    add(`${t} de ${q} quartos em ${b}`);
    add(`tem ${t} de ${q} quartos em ${b}`);
  }));

  // combinacoes bairro + valor
  BAIRROS.forEach(b => VALORES.forEach(v => {
    add(`${t} em ${b} ate ${v}`);
    add(`tem ${t} em ${b} ate ${v}`);
    add(`${t} ate ${v} em ${b}`);
  }));

  // combinacoes quartos + valor
  QUARTOS.forEach(q => VALORES.forEach(v => {
    add(`${t} ${q} quartos ate ${v}`);
    add(`${t} de ${q} quartos ate ${v}`);
  }));
});

// MEUS IMOVEIS
const prefMeus = ['meus imoveis','minha carteira','imoveis cadastrados','ver meus imoveis',
  'listar imoveis','mostrar imoveis','quantos imoveis tenho','total de imoveis',
  'imoveis ativos','imoveis da conta','todos os imoveis','minha base de imoveis',
  'quero ver meus imoveis','me mostra meus imoveis','imoveis disponiveis',
  'quantos ativos tenho','meus ativos','ver carteira','carteira completa'];
prefMeus.forEach(p => add(p));

// IMOVEIS PARADOS / SEM MATCH
['imoveis parados','imoveis sem match','imoveis sem lead','imoveis sem interessado',
 'imoveis sem procura','imoveis encalhados','imoveis sem demanda','quais nao tem match',
 'imoveis sem resultado'].forEach(p => add(p));

// IMOVEIS INATIVOS
['imoveis inativos','imoveis arquivados','imoveis desativados','imoveis off',
 'imoveis nao publicados','ver inativos','quais estao inativos'].forEach(p => add(p));

// IMOVEIS SEM FOTO
['imoveis sem foto','imoveis sem imagem','quais nao tem foto','imoveis precisando foto',
 'completar fotos','adicionar fotos'].forEach(p => add(p));

// IMOVEIS SEM PROPRIETARIO
['imoveis sem proprietario','sem dono','imoveis sem contato','imoveis sem vinculo',
 'vincular proprietario','quais nao tem proprietario'].forEach(p => add(p));

// BUSCA POR CLIENTE
const prefCliente = ['meu cliente quer','tenho cliente querendo','meu cliente procura',
  'meu cliente busca','tenho um cliente interessado em','meu comprador quer',
  'minha cliente quer','tenho cliente para','cliente pediu','cliente quer',
  'o cliente precisa de','um cliente meu quer'];
prefCliente.forEach(pc => {
  TIPOS.forEach(t => {
    add(`${pc} ${t}`);
    BAIRROS.forEach(b => add(`${pc} ${t} em ${b}`));
    QUARTOS.forEach(q => add(`${pc} ${t} ${q} quartos`));
    VALORES.forEach(v => add(`${pc} ${t} ate ${v}`));
  });
  BAIRROS.forEach(b => add(`${pc} imovel em ${b}`));
});

// VALOR MEDIO / ANALISE
['valor medio da carteira','preco medio dos imoveis','ticket medio','faixa de preco',
 'imoveis mais baratos','imoveis mais caros','menor valor','maior valor',
 'imoveis ate 300 mil','imoveis ate 500 mil','imoveis ate 1 milhao'].forEach(p => add(p));

console.log('Frases geradas:', frases.size);

// Salvar na base de conhecimento
const baseP = path.join(BASE,'cerebro','base-conhecimento-expandida.json');
const base  = fs.existsSync(baseP) ? JSON.parse(fs.readFileSync(baseP,'utf8')) : {items:[]};
const exist = new Set(base.items.map(i=>i.p));
let add2=0;
for (const f of frases) {
  if (!exist.has(f)) {
    base.items.push({p:f, r:'imoveis'});
    exist.add(f);
    add2++;
  }
}
base.total = base.items.length;
base.atualizadoEm = new Date().toISOString();
fs.writeFileSync(baseP, JSON.stringify(base,null,2));
console.log('Base: +'+add2+' (total: '+base.total+')');

// Salvar sinonimos das frases de busca
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = JSON.parse(fs.readFileSync(sPath,'utf8'));
const novos = {
  'minha carteira':          'meus imoveis',
  'meus ativos':             'imoveis ativos',
  'carteira completa':       'meus imoveis',
  'base de imoveis':         'meus imoveis',
  'imoveis cadastrados':     'meus imoveis',
  'quero ver imoveis':       'meus imoveis',
  'me mostra imoveis':       'meus imoveis',
  'quantos ativos tenho':    'meus imoveis',
  'total de imoveis':        'quantos imoveis tenho',
  'imoveis da conta':        'meus imoveis',
  'imoveis encalhados':      'imoveis parados',
  'imoveis sem demanda':     'imoveis parados',
  'imoveis sem resultado':   'imoveis parados',
  'ver inativos':            'imoveis inativos',
  'imoveis off':             'imoveis inativos',
  'completar fotos':         'imoveis sem foto',
  'adicionar fotos imovel':  'como adicionar foto',
  'vincular proprietario':   'imoveis sem proprietario',
  'ticket medio':            'valor medio da carteira',
  'faixa de preco':          'valor medio da carteira',
  'menor valor':             'imoveis mais baratos',
};
let addS=0;
for (const [k,v] of Object.entries(novos)) {
  if (!s[k]) { s[k]=v; addS++; }
}
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('Sinonimos: +'+addS+' (total: '+Object.keys(s).length+')');
console.log('Feito!');
