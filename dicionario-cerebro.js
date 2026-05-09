'use strict';
const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// ── DICIONÁRIO COMPLETO PARA O CÉREBRO ───────────────────────────────────────
const DICIONARIO = {

  // TIPOS DE IMÓVEL — todas as variações
  tipos_imovel: [
    'apartamento','apartamentos','apto','aptos','ap','apt',
    'casa','casas','casinha','casinhas','casa terrea','casa sobrado',
    'sobrado','sobrados','sobradinho','casa duplex',
    'cobertura','coberturas','coberturinha','penthouse',
    'terreno','terrenos','lote','lotes','area','areas','gleba',
    'studio','studios','estudio','estudios','flat','flats',
    'loft','lofts','kitnet','kitnets','kitinete','conjugado',
    'comercial','comerciais','sala','salas','sala comercial',
    'galpao','galpoes','deposito','depositos','armazem',
    'predio','predios','edificio','edificios',
    'chacara','chacaras','sitio','sitios','fazenda','fazendas',
    'condominio','condominios','village','villages',
    'duplex','triplex','garden','gardens',
  ],

  // OPERAÇÕES
  operacoes: [
    'venda','vender','vende','vendo','compra','comprar','compro',
    'aluguel','alugar','aluga','alugo','locacao','locar','loca',
    'permuta','trocar','troca',
  ],

  // STATUS
  status: [
    'ativo','ativos','ativa','ativas','disponivel','disponiveis',
    'inativo','inativos','inativa','inativas','arquivado','arquivados',
    'publicado','publicados','vendido','vendidos','alugado','alugados',
    'reservado','reservados','pendente','pendentes',
  ],

  // CARACTERÍSTICAS DO IMÓVEL
  caracteristicas: [
    'quarto','quartos','dormitorio','dormitorios','suite','suites',
    'banheiro','banheiros','lavabo','lavabos','toilete',
    'vaga','vagas','garagem','garagens','estacionamento',
    'area','metros','metragem','metro quadrado','metros quadrados',
    'area util','area privativa','area total','area comum',
    'sacada','sacadas','varanda','varandas','terraço','terracos',
    'piscina','piscinas','churrasqueira','churrasqueiras',
    'academia','playground','salao de festas','salao de jogos',
    'portaria','porteiro','seguranca','condominio fechado',
    'mobiliado','semi mobiliado','nao mobiliado','decorado',
    'reformado','novo','novinho','recém reformado','recem reformado',
    'alto padrao','padrao alto','luxo','luxuoso','simples',
    'vista mar','vista para o mar','vista cidade','frente mar',
    'andar alto','andar baixo','cobertura duplex','garden duplex',
  ],

  // LOCALIZAÇÃO
  localizacao: [
    'bairro','bairros','regiao','regioes','zona','zonas',
    'centro','centro da cidade','cidade','cidades',
    'estado','estados','uf','pais',
    'rua','avenida','alameda','travessa','estrada','rodovia',
    'proximo','perto','ao lado','frente','vizinho',
    'zona sul','zona norte','zona leste','zona oeste','zona central',
    'litoral','praia','campo','interior','capital',
  ],

  // VALORES E FINANCEIRO
  financeiro: [
    'valor','valores','preco','precos','custo','custos',
    'real','reais','mil','milhao','milhoes','bilhao',
    'condo','condominio','iptu','taxa','taxas',
    'financiamento','financiar','credito','banco',
    'minha casa minha vida','casa verde amarela','fgts',
    'entrada','sinal','parcela','parcelas','prestacao',
    'avaliacao','laudo','vistoria','documentacao',
    'minimo','maximo','ate','abaixo','acima','entre',
    'barato','caro','economico','acessivel','justo',
    'desconto','negociar','negociavel','flexivel',
  ],

  // VERBOS DE BUSCA
  verbos_busca: [
    'buscar','busco','busca','procurar','procuro','procura',
    'quero','quer','queria','gostaria','preciso','precisa','preciso de',
    'encontrar','encontro','encontra','achar','acho','acha',
    'ver','vejo','veja','mostrar','mostra','mostra me',
    'listar','lista','exibir','exibe','apresentar','apresenta',
    'tem','ter','tem algum','existe','existem','ha','haver',
    'disponivel','disponivel algum','tem disponivel',
    'cadastrar','cadastro','cadastra','adicionar','adiciona',
    'importar','importo','importa','subir','sobe',
    'inativar','inativo','inativa','desativar','desativa',
    'ativar','ativo','ativa','publicar','publica',
    'editar','edito','edita','alterar','altera','mudar','muda',
    'excluir','excluo','exclui','deletar','deleto','deleta',
    'vincular','vinculo','vincula','associar','associo','associa',
  ],

  // LEADS E CLIENTES
  leads: [
    'lead','leads','cliente','clientes','comprador','compradores',
    'vendedor','vendedores','interessado','interessados',
    'contato','contatos','prospecto','prospectos',
    'solicitante','solicitantes','requerente','requerentes',
    'inquilino','inquilinos','locatario','locatarios',
    'proprietario','proprietarios','dono','donos','titular','titulares',
  ],

  // PORTAIS E SISTEMAS
  portais: [
    'vivareal','viva real','vr','zapimoveis','zap imoveis','zap',
    'olx','chaves','chaves na mao','imovelweb','imovel web',
    '123i','quintoandar','quinto andar','qa',
    'rankim','ranking','tecimob','vista','vista soft',
    'crm','sistema','plataforma','portal','portais',
    'xml','feed','url','link','integracao',
    'vrsync','vr sync','padrao vivareal',
  ],

  // AÇÕES DO SISTEMA
  acoes_sistema: [
    'match','matches','md','mds','compativel','compativeis',
    'vitrine','vitrines','oferta','ofertas',
    'visita','visitas','agendamento','agendamentos',
    'notificacao','notificacoes','alerta','alertas',
    'relatorio','relatorios','dashboard','painel',
    'perfil','conta','usuario','usuarios',
    'coins','matchcoins','saldo','pontos',
    'importar','exportar','sincronizar','atualizar',
    'onboarding','configurar','configuracao',
  ],

  // PALAVRAS COMUNS BRASILEIRAS
  palavras_comuns: [
    'agora','depois','antes','hoje','amanha','ontem',
    'sempre','nunca','as vezes','geralmente','normalmente',
    'muito','pouco','mais','menos','bastante','suficiente',
    'bom','boa','ruim','otimo','pessimo','excelente','regular',
    'rapido','devagar','urgente','urgentemente','importante',
    'certo','errado','correto','incorreto','valido','invalido',
    'facil','dificil','simples','complexo','pratico',
    'novo','velho','antigo','moderno','atual','recente',
    'grande','pequeno','medio','enorme','minusculo',
    'primeiro','segundo','terceiro','ultimo','proximo',
    'tudo','nada','algo','alguma coisa','qualquer coisa',
    'porque','pois','portanto','entao','assim','logo',
    'mas','porem','contudo','todavia','entretanto',
    'como','quando','onde','quem','qual','quais','quanto',
    'obrigado','obrigada','por favor','desculpa','desculpe',
    'sim','nao','talvez','claro','certeza','duvida',
  ],
};

// ── CRIAR ARQUIVO DO DICIONÁRIO ───────────────────────────────────────────────
const dicPath = path.join(BASE,'cerebro','dicionario-brasileiro.json');
const todasPalavras = [];
for (const [categoria, palavras] of Object.entries(DICIONARIO)) {
  palavras.forEach(p => {
    todasPalavras.push({ palavra: p, categoria });
  });
}

fs.writeFileSync(dicPath, JSON.stringify({
  total: todasPalavras.length,
  categorias: Object.keys(DICIONARIO).length,
  geradoEm: new Date().toISOString(),
  palavras: todasPalavras,
  porCategoria: Object.fromEntries(Object.entries(DICIONARIO).map(([k,v])=>[k,v.length]))
}, null, 2));

console.log('Dicionário criado:', todasPalavras.length, 'palavras em', Object.keys(DICIONARIO).length, 'categorias');

// ── ATUALIZAR NLP.JS PARA USAR O DICIONÁRIO ───────────────────────────────────
let nlp = fs.readFileSync(path.join(BASE,'cerebro','nlp.js'),'utf8');

// Adicionar função de validação de palavra usando dicionário
const funcaoDic = `
// Dicionário brasileiro — carregado uma vez
let _dicionario = null;
function getDicionario() {
  if (_dicionario) return _dicionario;
  try {
    const d = require('./dicionario-brasileiro.json');
    _dicionario = new Set(d.palavras.map(p=>p.palavra));
  } catch(e) { _dicionario = new Set(); }
  return _dicionario;
}

// Verificar se palavra é válida no dicionário
function isPalavraValida(palavra) {
  return getDicionario().has(palavra.toLowerCase());
}

// Corrigir palavra usando Levenshtein contra dicionário
function corrigirPalavra(palavra) {
  const dic = getDicionario();
  if (dic.has(palavra)) return palavra;
  // Só corrigir palavras curtas com erro óbvio
  if (palavra.length < 3) return palavra;
  return palavra; // por ora retorna igual — evitar falsos positivos
}
`;

if (!nlp.includes('getDicionario')) {
  nlp = nlp.replace(
    "'use strict';",
    "'use strict';\n" + funcaoDic
  );
  fs.writeFileSync(path.join(BASE,'cerebro','nlp.js'), nlp);
  console.log('ok nlp.js — dicionário integrado');
}

// ── EXPANDIR SINÔNIMOS COM VARIAÇÕES DO DICIONÁRIO ───────────────────────────
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = JSON.parse(fs.readFileSync(sPath,'utf8'));

const novosSimonimos = {
  // Tipos imóvel — variações
  'aptos':'apartamentos','ap':'apartamento','apt':'apartamento',
  'casinha':'casa','casa terrea':'casa','casa sobrado':'sobrado',
  'sobradinho':'sobrado','casa duplex':'sobrado',
  'lote':'terreno','area':'terreno','gleba':'terreno',
  'estudio':'studio','flat':'studio','conjugado':'kitnet',
  'sala comercial':'comercial','galpao':'comercial',
  'penthouse':'cobertura','coberturinha':'cobertura',
  'chacara':'casa','sitio':'casa','fazenda':'casa',
  'village':'condominio','duplex':'sobrado','garden':'apartamento',
  // Operações
  'vender':'venda','vendo':'venda','comprar':'compra','compro':'compra',
  'alugar':'aluguel','alugo':'aluguel','locar':'aluguel',
  'locacao':'aluguel','permuta':'troca',
  // Características
  'dormitorio':'quarto','dorm':'quarto','suite':'quarto suíte',
  'garagem':'vaga','estacionamento':'vaga',
  'metragem':'area','metros':'area','metro quadrado':'area',
  'sacada':'varanda','terraço':'varanda',
  'mobiliado':'mobiliado',
  // Financeiro
  'condo':'condominio','prestacao':'parcela',
  'entrada':'sinal','fgts':'financiamento',
  // Verbos
  'procuro':'busco','acho':'encontro',
  'mostra me':'mostra','apresenta':'mostra',
  'inativo':'inativar','desativa':'inativar',
  'exclui':'excluir','deleta':'excluir',
  // Portais
  'viva real':'vivareal','zap imoveis':'zap',
  'chaves na mao':'chaves','imovel web':'imovelweb',
  'quinto andar':'quintoandar','vr sync':'vrsync',
};

let add = 0;
for (const [k,v] of Object.entries(novosSimonimos)) {
  if (!s[k]) { s[k]=v; add++; }
}
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('Sinônimos expandidos: +'+add+' (total: '+Object.keys(s).length+')');
console.log('Feito!');
