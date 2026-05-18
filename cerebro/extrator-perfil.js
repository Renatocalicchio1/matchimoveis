// extrator-perfil.js v2.0 — extrai perfil completo do cliente
// Captura TUDO que pode estar relacionado a um imóvel

const TIPOS_RESIDENCIAL = ['apartamento','apto','casa','sobrado','cobertura','studio','kitnet','loft','flat','mansao','chacara','sitio','fazenda','vila'];
const TIPOS_COMERCIAL = ['sala comercial','sala','loja','galpao','galpão','escritorio','escritório','conjunto comercial','conjunto','predio','prédio','hotel','pousada'];
const TODOS_TIPOS = [...TIPOS_RESIDENCIAL, ...TIPOS_COMERCIAL];

const INTENCAO = {
  comprar: ['comprar','compra','quero comprar','adquirir','financiar','financiamento','proprio','próprio'],
  alugar: ['alugar','aluguel','locacao','locação','arrendar','quero alugar','temporada'],
  investir: ['investir','investimento','renda','rentabilidade','retorno','valorizar','renda passiva']
};

const URGENCIA = {
  alta: ['urgente','preciso logo','rápido','rapido','imediato','essa semana','hoje','agora','prazo','mudança imediata'],
  baixa: ['só pesquisando','so pesquisando','sem pressa','futuramente','ano que vem','ainda nao sei','explorando','pesquisando']
};

const FAMILIA = {
  criancas: ['filho','filha','filhos','criança','crianca','bebe','bebê','escola','colegio','colégio'],
  casal: ['casal','minha esposa','meu marido','minha namorada','meu namorado','nós dois','nos dois'],
  sozinho: ['sozinho','só eu','so eu','moro só','moro so','solteiro'],
  pets: ['cachorro','gato','pet','animal','bichinho']
};

const MOTIVACAO = {
  mudanca: ['mudança','mudar','mudando','transferencia','transferência'],
  primeiro_imovel: ['primeiro imóvel','primeira casa','nunca tive','sonho','primeiro ap'],
  investimento: ['investir','renda extra','alugar depois','valorização','valorizacao'],
  upgrade: ['trocar','maior','upgrade','melhorar','imóvel maior','casa maior']
};

const DIFERENCIAIS = {
  piscina: ['piscina'],
  academia: ['academia','gym'],
  churrasqueira: ['churrasqueira','churrasco'],
  varanda: ['varanda','sacada','terraço','terraco'],
  portaria: ['portaria 24h','porteiro','portaria'],
  playground: ['playground','area kids','area de lazer'],
  elevador: ['elevador'],
  seguranca: ['segurança','seguranca','condominio fechado','condomínio fechado','cercado'],
  mobiliado: ['mobiliado','mobília','mobilia','semi mobiliado','com móveis'],
  novo: ['novo','na planta','lançamento','lancamento','nunca habitado'],
  reformado: ['reformado','reformado','renovado','atualizado']
};

const CIDADES = [
  'sao paulo','rio de janeiro','campinas','guarulhos','osasco','santo andre',
  'sao caetano','joinville','blumenau','florianopolis','itajai','navegantes',
  'balneario camboriu','curitiba','porto alegre','belo horizonte','brasilia',
  'goiania','manaus','fortaleza','recife','salvador','natal','maceio','teresina',
  'campo grande','cuiaba','porto velho','macapa','palmas','vitoria','aracaju'
];

const ESTADOS = {
  'sp': ['sao paulo','sp','são paulo'],
  'rj': ['rio de janeiro','rj'],
  'sc': ['santa catarina','sc'],
  'pr': ['parana','paraná','pr'],
  'rs': ['rio grande do sul','rs'],
  'mg': ['minas gerais','mg'],
  'go': ['goias','goiás','go'],
  'df': ['distrito federal','df','brasilia'],
  'ba': ['bahia','ba'],
  'pe': ['pernambuco','pe'],
  'ce': ['ceara','ceará','ce'],
  'am': ['amazonas','am'],
  'pa': ['para','pará','pa'],
  'mt': ['mato grosso','mt'],
  'ms': ['mato grosso do sul','ms'],
  'es': ['espirito santo','espírito santo','es'],
  'se': ['sergipe','se'],
  'al': ['alagoas','al'],
  'rn': ['rio grande do norte','rn'],
  'pb': ['paraiba','paraíba','pb'],
  'pi': ['piaui','piauí','pi'],
  'ma': ['maranhao','maranhão','ma'],
  'to': ['tocantins','to'],
  'ro': ['rondonia','rondônia','ro'],
  'ac': ['acre','ac'],
  'rr': ['roraima','rr'],
  'ap': ['amapa','amapá','ap']
};

function normalizar(txt) {
  return (txt||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\s]/g,' ').trim();
}

function extrairNumero(txt, palavras) {
  // Converte números por extenso
  const extenso = {
    'um':1,'uma':1,'hum':1,'huma':1,
    'dois':2,'duas':2,
    'tres':3,'três':3,
    'quatro':4,'cinco':5,'seis':6,'sete':7,'oito':8,'nove':9,'dez':10
  };
  let txtNorm = txt;
  for (const [ext, num] of Object.entries(extenso)) {
    txtNorm = txtNorm.replace(new RegExp('\\b' + ext + '\\b', 'gi'), num);
  }
  for (const p of palavras) {
    const re = new RegExp(p + '\\s*[:]?\\s*(\\d+)', 'i');
    const m = txtNorm.match(re);
    if (m) return parseInt(m[1]);
  }
  for (const p of palavras) {
    const re = new RegExp('(\\d+)\\s*' + p, 'i');
    const m = txtNorm.match(re);
    if (m) return parseInt(m[1]);
  }
  return null;
}

function extrairValor(txt) {
  // entre X e Y
  const entre = txt.match(/entre\s*r?\$?\s*([\d.,]+)\s*(mil|k|m)?\s*(?:e|a)\s*r?\$?\s*([\d.,]+)\s*(mil|k)?/i);
  if (entre) {
    let vmin = parseFloat(entre[1].replace(/\./g,'').replace(',','.'));
    let vmax = parseFloat(entre[3].replace(/\./g,'').replace(',','.'));
    if ((entre[2]||'').match(/mil|k/i)) vmin *= 1000;
    if ((entre[4]||'').match(/mil|k/i)) vmax *= 1000;
    if ((entre[2]||'').match(/^m$/i)) vmin *= 1000000;
    if ((entre[4]||'').match(/^m$/i)) vmax *= 1000000;
    return { valorMin: vmin, valorMax: vmax };
  }
  // até X / máximo X
  const ate = txt.match(/(?:ate|até|maximo|máximo|no maximo|valor|orcamento|budget)?\s*r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(mil(?:hao|hões|hao)?|k(?:\b)|m(?=\b))/i);
  if (ate) {
    let v = parseFloat(ate[1].replace(/\./g,'').replace(',','.'));
    if ((ate[2]||'').match(/mil|k/i)) v *= 1000;
    if ((ate[2]||'').match(/^m$/i)) v *= 1000000;
    return { valorMax: v };
  }
  // R$ X
  const val = txt.match(/r?\$\s*([\d.,]+)\s*(mil|k|m)?/i);
  if (val) {
    let v = parseFloat(val[1].replace(/\./g,'').replace(',','.'));
    if ((val[2]||'').match(/mil|k/i)) v *= 1000;
    if ((val[2]||'').match(/^m$/i)) v *= 1000000;
    return { valorMax: v };
  }
  return null;
}

function extrairTipo(norm) {
  // Comercial primeiro (mais específico)
  for (const t of TIPOS_COMERCIAL) { if (norm.includes(t)) return { tipo: t, categoria: 'comercial' }; }
  for (const t of TIPOS_RESIDENCIAL) { if (norm.includes(t)) return { tipo: t, categoria: 'residencial' }; }
  return null;
}

function extrairIntencao(norm) {
  for (const [intencao, palavras] of Object.entries(INTENCAO)) {
    if (palavras.some(p => norm.includes(p))) return intencao;
  }
  return null;
}

function extrairUrgencia(norm) {
  if (URGENCIA.alta.some(p => norm.includes(p))) return 'alta';
  if (URGENCIA.baixa.some(p => norm.includes(p))) return 'baixa';
  return null;
}

function extrairFamilia(norm) {
  const resultado = [];
  for (const [tipo, palavras] of Object.entries(FAMILIA)) {
    if (palavras.some(p => norm.includes(p))) resultado.push(tipo);
  }
  return resultado.length > 0 ? resultado : null;
}

function extrairMotivacao(norm) {
  for (const [mot, palavras] of Object.entries(MOTIVACAO)) {
    if (palavras.some(p => norm.includes(p))) return mot;
  }
  return null;
}

function extrairSentimento(norm) {
  if (['otimo','perfeito','adorei','amei','excelente','incrivel','uau','show'].some(p => norm.includes(p))) return 'satisfeito';
  if (['nao gostei','ruim','pessimo','horrivel','decepcionado','chateado'].some(p => norm.includes(p))) return 'frustrado';
  if (['urgente','preciso','rapido','logo'].some(p => norm.includes(p))) return 'impaciente';
  if (['empolgado','animado','adorei','quero muito','amei'].some(p => norm.includes(p))) return 'empolgado';
  return null;
}

function extrairFaseFunil(norm, perfil) {
  if (['fechar','assinar','contrato','proposta','quero esse','vou fechar','quero comprar esse'].some(p => norm.includes(p))) return 'decidido';
  if (['visitar','agendar','quero ver','posso ver','ver pessoalmente','agendar visita'].some(p => norm.includes(p))) return 'interessado';
  if (perfil.intencao || perfil.tipo || perfil.valorMax) return 'qualificado';
  return 'novo';
}

function extrairTemperatura(perfil) {
  let score = 0;
  if (perfil.urgencia === 'alta') score += 3;
  if (perfil.faseFunil === 'decidido') score += 3;
  if (perfil.faseFunil === 'interessado') score += 2;
  if (perfil.intencao) score += 1;
  if (perfil.valorMax || perfil.valorMin) score += 1;
  if (perfil.quartos) score += 1;
  if (perfil.bairro) score += 1;
  if (perfil.banheiros) score += 0.5;
  if (perfil.cidade) score += 0.5;
  if (score >= 5) return 'quente';
  if (score >= 2) return 'morno';
  return 'frio';
}

function extrairDiferenciais(norm) {
  const encontrados = [];
  for (const [dif, palavras] of Object.entries(DIFERENCIAIS)) {
    if (palavras.some(p => norm.includes(p))) encontrados.push(dif);
  }
  return encontrados.length > 0 ? encontrados : null;
}

function extrairBairro(norm) {
  // Lista de bairros conhecidos SP
  const bairrosConhecidos = [
  // ═══════════════════════════════════════════════════════
  // SÃO PAULO - CAPITAL
  // ═══════════════════════════════════════════════════════
  // Centro
  'se','republica','bom retiro','bras','pari','cambuci','liberdade','aclimacao',
  'bela vista','consolacao','santa cecilia','higienopolis','vila buarque','brás',
  // Zona Oeste
  'pinheiros','jardins','jardim paulista','jardim america','jardim europa',
  'itaim bibi','vila nova conceicao','moema','campo belo','brooklyn','brooklin',
  'vila olimpia','vila funchal','planalto paulista','saude','ipiranga',
  'alto de pinheiros','jardim guedala','morumbi','real parque','panamby',
  'vila andrade','campo limpo','vila sonia','butanta','raposo tavares',
  'rio pequeno','lapa','barra funda','agua branca','perdizes','pompeia',
  'vila madalena','sumare','pacaembu','chacara klabin','vila mariana',
  'mirandopolis','cursino','sacomã','berrini','faria lima','paulista',
  'ibirapuera','brooklin novo','boaçava','butantã','caxingui','cidade jardim',
  'jardim dom bosco','jardim guedala','jardim leonor','jardim lusitania',
  'jardim panorama','jardim peri peri','jardim sao jorge','jardim umuarama',
  'oscar freire','paraisópolis','pedreira','real parque','socorro',
  // Zona Norte
  'santana','tucuruvi','vila guilherme','vila medeiros','vila maria',
  'jardim sao paulo','lauzane paulista','mandaqui','jacana','tremembe',
  'horto florestal','vila nova cachoeirinha','limao','casa verde',
  'bairro do limao','pirituba','jaragua','perus','anhanguera',
  'brasilandia','cachoeirinha','campo de marte','freguesia do o',
  'jardim peri','parada inglesa','parque edu chaves','tremembé',
  'vila aurora','vila constancia','vila gustavo','vila nova cachoeirinha',
  // Zona Sul
  'santo amaro','socorro','campo grande','cidade ademar','pedreira',
  'jabaquara','paraiso','vila clementino','cursino','vila prudente',
  'agua rasa','vila alpina','ipe','heliópolis','sao lucas','moinho velho',
  'sapopemba','vila re','vila esperança','cidade lider','iguatemi',
  'jose bonifacio','parque do carmo','artur alvim','cangaiba',
  'ermelino matarazzo','sao mateus','sao rafael','boa esperanca',
  'cidade tiradentes','guaianases','lajeado','jardim helena',
  'vila curuca','sao miguel paulista','jardim angela','capao redondo',
  'cidade dutra','grajau','marsilac','parelheiros','jardim sao luis',
  'americanopolis','cidade vargas','jabaquara','interlagos','autódromo',
  'balneario sao francisco','campo belo','campo grande','campo limpo',
  'capao redondo','jardim angela','jardim das imbuias','jardim sao jorge',
  // Zona Leste
  'tatuape','mooca','belenzinho','bresser','agua rasa','vila matilde',
  'penha','vila carrão','vila formosa','analia franco','jardim analia franco',
  'vila regente feijo','sao lucas','sapopemba','itaquera',
  'cidade tiradentes','sao miguel paulista','jardim helena','vila jacui',
  'aricanduva','artur alvim','cangaiba','carrão','cidade lider',
  'ermelino matarazzo','guaianases','iguatemi','itaim paulista',
  'itaquera','jardim helena','jose bonifacio','lajeado','parque do carmo',
  'sao mateus','sao rafael','sao miguel','vila curuca','vila jacui',
  'vila nova esperanca','cohab','cidade tiradentes',
  // ═══════════════════════════════════════════════════════
  // SÃO PAULO - GRANDE SP
  // ═══════════════════════════════════════════════════════
  'alphaville','tamboré','granja viana','cotia','barueri','santana de parnaiba',
  'osasco','carapicuiba','jandira','itapevi','embu das artes','taboao da serra',
  'santo andre','sao bernardo do campo','sao caetano do sul','diadema',
  'maua','ribeirao pires','rio grande da serra','guarulhos','aruja',
  'suzano','mogi das cruzes','itaquaquecetuba','ferraz de vasconcelos',
  'poa','salesopolis','biritiba mirim','santa isabel',
  // Guarulhos bairros
  'jardim santa mena','vila galvao','gopouva','jardim paulista','centro',
  'macedo','vila rio de janeiro','jardim fortaleza','vila progresso',
  // Santo André bairros  
  'jardim','campestre','casa branca','centro','vila assuncao','vila bastos',
  'villa rica','bangu','jardim bela vista',
  // ═══════════════════════════════════════════════════════
  // SÃO PAULO - INTERIOR
  // ═══════════════════════════════════════════════════════
  // Campinas
  'cambuí','cambuí','taquaral','bosque','centro','jardim chapadão',
  'vila itapura','parque prado','nova campinas','alphaville campinas',
  'swiss park','vila leopoldina','barão geraldo','cidade universitária',
  'chacara da barra','guanabara','jardim do lago','mansões santo antonio',
  'parque residencial lagoinha','sousas','joaquim egídio','aurora',
  'botafogo','castelo','centro','dic i','dic ii','dic iii','dic iv',
  'dic v','dic vi','dic vii','jardim proença','nova europa',
  'parque são quirino','ponte preta','residencial anhangüera',
  'vila mimosa','vila boa vista',
  // Ribeirão Preto
  'centro','jardim paulista','jardim sumaré','nova aliança','jardim america',
  'jardim california','alto da boa vista','jardim botanico','jardim canada',
  'jardim independência','jardim iraja','jardim machado','jardim paulistano',
  'jardim sao luiz','jardim sao marcos','lagoinha','vila seixas',
  // São José dos Campos
  'centro','jardim aquarius','jardim apolo','jardim satélite',
  'campo dos alemães','jardim colonial','jardim pararangaba',
  'urbanova','vila branca','bom retiro','jardim paulista',
  // Sorocaba
  'centro','jardim paulistano','jardim vergueiro','wanel ville',
  'jardim ipanema','parque campolim','cajuru do sul',
  // Santos / Litoral SP
  'gonzaga','boqueirão','embaré','pompeia','estuário','macuco',
  'aparecida','encruzilhada','jose menino','ponta da praia',
  'guaruja','praia grande','sao vicente','mongagua','itanhaem',
  'peruibe','bertioga','cubatao','são sebastião','ilhabela',
  'caraguatatuba','ubatuba',
  // ═══════════════════════════════════════════════════════
  // RIO DE JANEIRO - CAPITAL
  // ═══════════════════════════════════════════════════════
  // Zona Sul
  'copacabana','ipanema','leblon','leme','arpoador','vidigal',
  'sao conrado','barra da tijuca','recreio dos bandeirantes',
  'botafogo','flamengo','laranjeiras','cosme velho','catete',
  'gloria','santa teresa','urca','humaita','lagoa','gavea',
  'jardim botanico','alto da boa vista','santa teresa',
  // Centro
  'centro','lapa','gamboa','saude','santo cristo','caju',
  'catumbi','cidade nova','estacio','rio comprido','mangueira',
  'tijuca','maracana','alto da boa vista','grajaú','andarai',
  'vila isabel','são cristóvão','benfica','caju',
  // Zona Norte
  'meier','engenho novo','rocha','todos os santos','encantado',
  'lins de vasconcelos','cachambi','vila isabel','grajaú','andaraí',
  'tijuca','maracanã','são cristóvão','olaria','ramos','bonsucesso',
  'manguinhos','penha','ilha do governador','vigário geral',
  'cordovil','pavuna','anchieta','guadalupe','realengo','padre miguel',
  'deodoro','marechal hermes','oswaldo cruz','rocha miranda',
  'honório gurgel','ricardo de albuquerque','coelho neto','acari',
  'cavalcante','costa barros','irajá','colégio','turiaçu','madureira',
  'vaz lobo','vicente de carvalho','campinho','cascadura','abolição',
  'pilares','quintino bocaiuva','méier','lins','engenho de dentro',
  // Zona Oeste
  'jacarepaguá','taquara','campo grande','santa cruz','bangu',
  'realengo','padre miguel','deodoro','sepetiba','guaratiba',
  'barra de guaratiba','pedra de guaratiba','cosmos','paciência',
  'campo dos afonsos','jardim sulacap','magalhães bastos',
  'vila militar','praça seca','pechincha','anil','freguesia',
  'camorim','vargem grande','vargem pequena','recreio',
  'grumari','abricó','barra de guaratiba',
  // Niterói e região
  'niteroi','icarai','santa rosa','são francisco','charitas',
  'jurujuba','ingá','centro niteroi','fonseca','barreto',
  'engenhoca','largo da batalha','santa bárbara','são goncalo',
  'alcantara','rocha','neves','tribobó','colubande',
  // Baixada Fluminense
  'duque de caxias','nova iguacu','belford roxo','nilopolis',
  'mesquita','queimados','japeri','paracambi','itaguaí',
  'seropedica','nova iguacu','sao joao de meriti',
  // ═══════════════════════════════════════════════════════
  // RIO DE JANEIRO - INTERIOR
  // ═══════════════════════════════════════════════════════
  // Petrópolis / Serra
  'petropolis','teresopolis','nova friburgo','tres rios','paraiba do sul',
  'centro petropolis','itaipava','corrêas','cascatinha','nogueira',
  // Costa Verde
  'angra dos reis','paraty','mangaratiba','muriqui',
  // Região dos Lagos
  'cabo frio','buzios','arraial do cabo','saquarema','araruama',
  'sao pedro da aldeia','iguaba grande','armacao dos buzios',
  // Norte/Noroeste Fluminense
  'campos dos goytacazes','macaé','rio das ostras','casimiro de abreu',
  // ═══════════════════════════════════════════════════════
  // MINAS GERAIS - BELO HORIZONTE
  // ═══════════════════════════════════════════════════════
  'savassi','lourdes','funcionarios','sao pedro','santo agostinho',
  'carmo','sion','anchieta','mangabeiras','buritis','belvedere',
  'pampulha','cidade nova','carlos prates','codisburgo','gutierrez',
  'barreiro','venda nova','nordeste','noroeste','centro sul',
  'floresta','santa efigenia','santa tereza','caiçara','carlos prates',
  'colegio batista','coração eucarístico','estoril','gameleira',
  'graça','jardim america','jardim atlantico','liberdade','palmares',
  'padre eustaquio','planalto','santa ines','santa lucia','santa monica',
  'serrano','sion','união','urca','vista alegre','wona','xangri-la',
  'castelo','cidade jardim','cruzeiro','esplanada','fatima',
  'grajau','horto','itapoã','lagoa','leblon','luxemburgo',
  'minas brasil','minerio','nova cintra','nova granada','nova suiça',
  'ouro preto','paqueta','paraiso','são bento','são jose','são lucas',
  'são paulo','serra','silveira','solar do barreiro','sumaré',
  'tupi','uniao','vale do jatoba','vila california','vila paris',
  'capitão eduardo','ceu azul','conjunto califórnia','contagem',
  'betim','ibirite','ribeirao das neves','santa luzia','sabara',
  'nova lima','brumadinho','mario campos','igarapé','juatuba',
  // MG - Interior
  'uberlandia','uberaba','juiz de fora','montes claros','governador valadares',
  'ipatinga','sete lagoas','divinopolis','pocos de caldas','passos',
  'varginha','lavras','barbacena','viçosa','ouro preto','mariana',
  // ═══════════════════════════════════════════════════════
  // SANTA CATARINA
  // ═══════════════════════════════════════════════════════
  // Florianópolis
  'centro florianopolis','trindade','pantanal','carvoeira','corrego grande',
  'itacorubi','santa monica','joao paulo','cacupe','santo antonio',
  'jurere','jurere internacional','canasvieiras','ingleses','rio vermelho',
  'lagoa da conceicao','campeche','ribeirao da ilha','armacao','pantano do sul',
  'coqueiros','balneario','abraao','agronômica','capoeiras','coloninha',
  'congonhas','estreito','jardim atlantico','monte cristo','saco dos limoes',
  'saco grande','sambaqui','sertao do maruim','vargem grande','vargem pequena',
  // Balneário Camboriú
  'barra sul','barra norte','barra','centro balneario','das nacoes','dos estados',
  'pioneiros','agronomica','municipios','taboleiro','fazenda','pereque',
  'meia praia','balneario camboriu','camboriu',
  // Itajaí
  'centro itajai','sao joao','limoeiro','fazenda','sao vicente','espinheiros',
  'cordeiros','itaipava','praia brava','cabeçudas','barra do rio','murta',
  // Joinville
  'america','anita garibaldi','atiradores','aventureiro','bom retiro joinville',
  'bucarein','centro joinville','costa e silva','fatima','floresta joinville',
  'gloria joinville','guanabara','iririu','jardim iririu','jardim paraíso',
  'jarivatuba','nova brasilia','paranaguamirim','petropolis joinville',
  'pirabeiraba','profipo','saguacu','santo antonio joinville','sao marcos',
  'ulysses guimaraes','vila nova joinville','zona industrial norte','zona industrial sul',
  // Blumenau
  'itoupava norte','itoupava central','itoupava seca','fortaleza blumenau',
  'velha','velha central','velha grande','fidelis','salto do norte','ponta aguda',
  'vorstadt','centro blumenau','garcia','agua verde blumenau','progresso blumenau',
  'asilo','jardim blumenau','escola agricola','ribeirão fresco','testo salto',
  // Chapecó
  'centro chapeco','efapi','sao cristovao','passo dos fortes','jardim america chapeco',
  'bom pastor','santa maria','trevo','sao pedro','pinheirinho',
  // Criciúma
  'centro criciuma','comerciario','michel','pio corrêa','santa barbara',
  'nossa senhora da salete','jardim angélica','universitário',
  // Lages
  'centro lages','coral','universitario','copacabana lages','santa helena',
  // Litoral SC
  'bombinhas','porto belo','penha','barra velha','picarras','tijucas',
  'itapema','porto belo','governador celso ramos','antonio carlos','palhoça',
  'sao jose sc','biguacu','garopaba','imbituba','laguna','tubarao',
  'ararangua','sombrio','jaguaruna','sangão',
  // ═══════════════════════════════════════════════════════
  // PARANÁ
  // ═══════════════════════════════════════════════════════
  // Curitiba
  'batel','agua verde','bigorrilho','merces','seminario','vista alegre',
  'campo comprido','portão','xaxim','sitio cercado','cajuru','alto boqueirao',
  'boqueirao','hauer','pinheirinho','capao raso','novo mundo','cidade industrial',
  'centro curitiba','ahú','alto da glória','alto da rua xv','alto da xv',
  'bairro alto','barreirinha','boa vista','cabral','cachoeira','cajuru',
  'campina do siqueira','campo comprido','capanema','cascatinha','centro civico',
  'cristo rei','dantas','fanny','fazendinha','ferraria','ganchinho',
  'guabirotuba','guaíra','hugo lange','hauer','hugo lange','jardim botanico',
  'jardim das americas','jardim social','jardim das oliveiras','jardim schaffer',
  'juvevê','lamenha pequena','lindoia','lamenha','mercês','mossunguê',
  'orleans','parolin','pilarzinho','portão','prado velho','rebouças',
  'riviera','santa candida','santa felicidade','santa quiteria','santo inácio',
  'são braz','são francisco','são joao','são lourenço','são miguel',
  'são pedro','seminario','sitio cercado','sobradinho','tarumã','tatuquara',
  'tingui','uberaba','umbará','vila izabel','vila leonice','vista alegre',
  'xaxim','abranches','ahú','almirante tamandaré','araucária',
  // Londrina
  'centro londrina','gleba palhano','jardim higienopolis','aeroporto',
  'colina','home flex','jardim belo horizonte','jardim shangri-la',
  'londrina norte','madre germana','pacaembu','portal do sol',
  'cafezal','cambezinho','cinco conjuntos','confederação','esperança',
  // Maringá
  'centro maringá','zona 01','zona 02','zona 03','zona 04','zona 05',
  'jardim alvorada','jardim monumento','jardim novo horizonte',
  'jardim paris','jardim universitario','novo centro','pinheiros',
  'vila esperança','vila operaria','jardim aclimação',
  // Foz do Iguaçu
  'centro foz','jardim central','jardim naipi','nordeste foz',
  'porto meira','três lagoas','vila a','vila b','vila c',
  // Cascavel
  'centro cascavel','neva','cancelli','santa cruz','coqueiral',
  'santa barbara','jardim jurema','universitário cascavel',
  // Ponta Grossa
  'centro ponta grossa','contorno','neves','órfãs','boa vista',
  'jardim carvalho','estrela','nova russia','uvaranas',
  // Litoral PR
  'matinhos','caioba','pontal do parana','guaratuba','antonina','morretes',
  'paranagua','ilha do mel',
  // ═══════════════════════════════════════════════════════
  // RIO GRANDE DO SUL
  // ═══════════════════════════════════════════════════════
  // Porto Alegre
  'moinhos de vento','bela vista','rio branco','petropolis','independencia',
  'floresta','navegantes','farroupilha','centro historico','cidade baixa',
  'menino deus','santana','partenon','medianeira','gloria','cristal',
  'tristeza','camaquã','cavalhada','ipanema porto alegre','vila nova',
  'rubem berta','sarandi','jardim itu','jardim botanico','chácara das pedras',
  'tres figueiras','auxiliadora','mont serrat','santa cecilia','centro porto alegre',
  'anchieta','azenha','bela vista porto alegre','belém novo','bom fim',
  'camaquã','campo novo','capão da imbuia','capão raso porto alegre',
  'cascata','centro historico','chacara das pedras','cidade baixa',
  'colonial','cristal','cristo redentor','domingos petrolini','estaleiro',
  'farrapos','floresta porto alegre','jardim carvalho','jardim do salso',
  'jardim Isabel','jardim Itu-sabará','jardim lindoia','jardim sao pedro',
  'lagoa dos patos','lami','leblon porto alegre','lomba do pinheiro',
  'mario quintana','mathias velho','medianeira porto alegre','morro santana',
  'niteroi','nonoai','passo dareia','passo das pedras','pedra redonda',
  'pinheiro','protasio alves','restinga','santa tereza','sao geraldo',
  'sao joao','sao jose','sao sebastiao','serraria','teresopolis porto alegre',
  'tres figueiras','vila assuncao','vila conceicao','vila jardim',
  // Canoas / Grande Porto Alegre
  'canoas','cachoeirinha','gravataí','viamão','alvorada','guaíba',
  'eldorado do sul','sapucaia do sul','são leopoldo','novo hamburgo',
  'esteio','sapiranga','campo bom','taquara','parobé','rolante',
  // Caxias do Sul
  'centro caxias','são pelegrino','panazzolo','santa lúcia','marechal floriano',
  'desvio rizzo','ana rech','rio branco caxias','pioneiro','santa catarina',
  // ═══════════════════════════════════════════════════════
  // BAHIA
  // ═══════════════════════════════════════════════════════
  // Salvador
  'barra','ondina','rio vermelho','pituba','caminho das arvores',
  'iguatemi','paralela','brotas','nazare','barris','vitoria','graca',
  'federacao','amaralina','santa lucia','imbui','patamares','itapoa',
  'piatã','placaford','cajazeiras','nordeste de amaralina','são caetano',
  'periperi','paripe','plataforma','lobato','calçada','comércio',
  'center','campo grande','garcia','canela','barra do rio vermelho',
  'jardim apipema','são marcos','praia do flamengo','stella maris',
  'itapoã','mussurunga','aeroporto salvador','cajazeiras',
  // Interior BA
  'porto seguro','arraial dahajuda','trancoso','itabuna','ilheus',
  'feira de santana','vitoria da conquista','juazeiro','paulo afonso',
  // ═══════════════════════════════════════════════════════
  // PERNAMBUCO
  // ═══════════════════════════════════════════════════════
  // Recife
  'boa viagem','pina','imbiribeira','ilha do leite','derby','espinheiro',
  'gracas','aflitos','jaqueira','santana','soledade','campo grande',
  'torre','madalena','iputinga','cordeiro','encruzilhada','torreao',
  'afogados','agua fria','alto santa terezinha','areias','arruda',
  'beberibe','bomba do hemeterio','brasilit','brejo da guabiraba',
  'brejo de beberibe','cabanga','caçote','cajueiro','campina do barreto',
  'campo grande','capim macio','cidade universitaria','cohab',
  'coqueiral','couto','curado','dois irmaos','engenho do meio',
  'fundão','hipódromo','ilha do retiro','ilha joana bezerra',
  'ipiranga','jardim são paulo','joana bezerra','jordao','macaxeira',
  'mangabeira','mustardinha','nova descoberta','paissandu','passarinho',
  'peixinhos','pelados','pitombeira','poco','porto da madeira',
  'rosarinho','san martin','sitio grande','tamarineira','tejipió',
  'torreão','totó','torrões','transpetro','urdume','várzea','zumbi',
  // Olinda / Caruaru / Petrolina
  'olinda','caruaru','petrolina','garanhuns','arcoverde','caruaru',
  // ═══════════════════════════════════════════════════════
  // CEARÁ
  // ═══════════════════════════════════════════════════════
  // Fortaleza
  'meireles','aldeota','varjota','fatima','coco','cidade dos funcionarios',
  'messejana','jose de alencar','maraponga','mondubim','barra do ceara',
  'mucuripe','praia de iracema','benfica','centro fortaleza','papicu',
  'parquelândia','parreão','passaré','paupina','pedras','presidente kennedy',
  'praia de iracema','quintino cunha','rodolfo teófilo','são gerardo',
  'são joão do tauape','são josé de moran','serrinha','tauape','vicente pinzon',
  'água fria','aerolândia','alto da balança','ancuri','antônio bezerra',
  'barra do ceará','barroso','bom jardim','bom sucesso','cajazeiras',
  'castelão','cauripe','cidade 2000','cidade dos funcionários',
  // Interior CE
  'juazeiro do norte','sobral','crato','iguatu','quixadá',
  // ═══════════════════════════════════════════════════════
  // DISTRITO FEDERAL
  // ═══════════════════════════════════════════════════════
  'asa norte','asa sul','lago norte','lago sul','noroeste','sudoeste',
  'aguas claras','taguatinga','ceilandia','samambaia','recanto das emas',
  'gama','santa maria','guara','cruzeiro','octogonal','park way',
  'sobradinho','planaltina','paranoa','sao sebastiao','vicente pires',
  'riacho fundo','riacho fundo ii','candangolandia','nucleo bandeirante',
  'estrutural','cidade do automóvel','sia','sof norte','sof sul',
  'itapoa','varjao','fercal','arniqueira','sol nascente','por do sol',
  // ═══════════════════════════════════════════════════════
  // ESPÍRITO SANTO
  // ═══════════════════════════════════════════════════════
  // Vitória
  'praia do canto','bento ferreira','jardim da penha','jardim camburi',
  'mata da praia','goiabeiras','mario cypreste','santa lucia','centro vitoria',
  'barro vermelho','enseada do suá','ilha do boi','ilha do frade',
  'jucutuquara','maruipe','morada de camburi','praia do suá','santa helena',
  'santa luiza','santa martha','santo antonio','segurança do lar',
  'sierra','solon borges','universitario vitoria',
  // Serra / Cariacica / Vila Velha
  'vila velha','cariacica','serra es','viana','guarapari','anchieta es',
  'colatina','cachoeiro do itapemirim','linhares','sao mateus es',
  // ═══════════════════════════════════════════════════════
  // GOIÁS
  // ═══════════════════════════════════════════════════════
  // Goiânia
  'setor bueno','setor marista','setor oeste','setor sul','setor bela vista',
  'jardim goias','jardim america goiania','setor aeroporto','setor central goiania',
  'campinas goiania','vila nova goiania','setor norte ferroviario','setor coimbra',
  'setor universitario','setor pedro ludovico','setor dos funcionarios',
  'setor jardim goias','setor nova suiça','setor pedro ludovico',
  'residencial monte cristo','setor recanto das minas gerais','vila aurora goiania',
  // Aparecida de Goiânia / Anápolis
  'aparecida de goiania','anapolis','catalao','jatai','rio verde goias',
  // ═══════════════════════════════════════════════════════
  // AMAZONAS / PARÁ
  // ═══════════════════════════════════════════════════════
  // Manaus
  'adrianopolis','nossa senhora das gracas','chapada','aleixo','flores',
  'parque dez','cidade nova','dom pedro','santa etelvina','jorge teixeira',
  'gilberto mestrinho','monte das oliveiras','lago azul','taruma',
  'colonia oliveira machado','compensa','educandos','japiim','petrópolis manaus',
  'planalto','presidente vargas','santo antonio manaus','são jorge','vieiralves',
  // Belém
  'umarizal','nazare','batista campos','marco','sacramenta','pedreira',
  'fatima','souza','guama','terra firme','bengui','jurunas','reduto',
  'cremação','cidade velha','condor','canudos','cabanagem','aguas lindas',
  // ═══════════════════════════════════════════════════════
  // MATO GROSSO / MATO GROSSO DO SUL
  // ═══════════════════════════════════════════════════════
  // Cuiabá
  'centro sul cuiaba','jardim das americas cuiaba','cidade alta cuiaba',
  'duque de caxias cuiaba','goiabeiras cuiaba','grande terceiro',
  'popular','cpa i','cpa ii','cpa iii','cpa iv','quilombo',
  'boa esperanca cuiaba','jardim imperial','jardim umuarama cuiaba',
  'pedregal','pico do amor','praeiro','quilombo','residencial gramado',
  // Campo Grande
  'centro campo grande','monte castelo','amambai','tiradentes',
  'chacara cachoeira','jardim dos estados','jardim aero rancho',
  'jardim paulista','mata do jacinto','novos estados','pioneiros',
  'santa fé','universitario campo grande',
  // ═══════════════════════════════════════════════════════
  // OUTROS ESTADOS
  // ═══════════════════════════════════════════════════════
  // Maranhão - São Luís
  'sao luis','renascença','calhau','ponta darei','jardim renascença',
  'cohama','cohatrac','angelim','vinhais','araçagi',
  // Piauí - Teresina
  'teresina','centro teresina','fátima teresina','horto florestal teresina',
  'ilhotas','ininga','jockey','leste','morros','noivos','pirajá',
  // Rio Grande do Norte - Natal
  'natal','petrópolis natal','tirol','lagoa nova','capim macio natal',
  'ponta negra','candelaria','neópolis','neópolis','pitimbu',
  // Paraíba - João Pessoa
  'joao pessoa','miramar','manaíra','tambau','cabo branco','bessa',
  'intermares','mangabeira','valentina','castelo branco',
  // Alagoas - Maceió
  'maceio','pajuçara','ponta verde','jatiuca','mangabeiras maceio',
  'farol','gruta de lourdes','serraria','benedito bentes',
  // Sergipe - Aracaju
  'aracaju','centro aracaju','grageru','jardins aracaju','luzia',
  'salgado filho','sao jose','suissa','treze de julho',
  // ═══════════════════════════════════════════════════════
  // TERMOS GENÉRICOS
  // ═══════════════════════════════════════════════════════
  'centro','norte','sul','leste','oeste','zona norte','zona sul',
  'zona leste','zona oeste','zona central','hipercentro',
  'jardim','vila','parque','residencial','condominio','setor',
  'bairro novo','bairro velho','cidade nova','cidade velha',
  'alto','baixo','grande','pequeno','novo','velho'
];
  for (const b of bairrosConhecidos) { if (norm.includes(b)) return b; }
  // Padrão preposição explícita — só aceita quando há palavra-chave de localização
  const bm = norm.match(/\b(?:no bairro|na bairro|bairro|regiao|região|proximo a|perto de|localizado em|fica em|quero em|busco em|procuro em)\s+([a-z\s]{3,25}?)(?:,|\.|\s{2}|$)/);
  if (bm) return bm[1].trim();
  return null;
}

function extrairPerfil(mensagens) {
  if (!mensagens || !mensagens.length) return {};

  const textoTotal = mensagens
    .filter(m => m.de === 'cliente')
    .map(m => m.texto || '')
    .join(' ');

  const norm = normalizar(textoTotal);
  const perfil = {};

  // Tipo + categoria
  const tipoResult = extrairTipo(norm);
  if (tipoResult) { perfil.tipo = tipoResult.tipo; perfil.categoria = tipoResult.categoria; }

  // Quartos / dormitórios
  const quartos = extrairNumero(norm, ['quarto','quartos','dormitorio','dormitorios','dorm','dorms']);
  if (quartos) perfil.quartos = quartos;

  // Suítes
  const suites = extrairNumero(norm, ['suite','suites','suíte','suítes']);
  if (suites) perfil.suites = suites;

  // Banheiros
  const banheiros = extrairNumero(norm, ['banheiro','banheiros','lavabo','lavabos','wc']);
  if (banheiros) perfil.banheiros = banheiros;

  // Vagas
  const vagas = extrairNumero(norm, ['vaga','vagas','garagem','garagens','estacionamento']);
  if (vagas) perfil.vagas = vagas;

  // Área
  const area = extrairNumero(norm, ['m2','metros','m²','area','área','metragem']);
  if (area) perfil.area = area;

  // Andar
  const andar = extrairNumero(norm, ['andar','andares','piso']);
  if (andar) perfil.andar = andar;

  // Valor
  const valor = extrairValor(norm);
  if (valor) Object.assign(perfil, valor);

  // Bairro
  const bairro = extrairBairro(norm);
  // Só salva como bairro se não for uma cidade conhecida e não for uma rua
  const CIDADES_SET = new Set(CIDADES.map(c => c.toLowerCase()));
  const ehRua = bairro && /^(rua|av|avenida|alameda|travessa|estrada|rodovia|r\.|al\.)/i.test(bairro.trim());
  if (bairro && !CIDADES_SET.has(bairro.toLowerCase()) && !ehRua) perfil.bairro = bairro;
  if (ehRua) perfil.rua = bairro;

  // Cidade
  for (const cidade of CIDADES) { if (norm.includes(cidade)) { perfil.cidade = cidade; break; } }

  // Estado
  for (const [sigla, nomes] of Object.entries(ESTADOS)) {
    if (nomes.some(n => norm.includes(n))) { perfil.estado = sigla; break; }
  }

  // Intenção
  const intencao = extrairIntencao(norm);
  if (intencao) perfil.intencao = intencao;

  // Urgência
  const urgencia = extrairUrgencia(norm);
  if (urgencia) perfil.urgencia = urgencia;

  // Família
  const familia = extrairFamilia(norm);
  if (familia) perfil.familia = familia;

  // Motivação
  const motivacao = extrairMotivacao(norm);
  if (motivacao) perfil.motivacao = motivacao;

  // Sentimento
  const sentimento = extrairSentimento(norm);
  if (sentimento) perfil.sentimento = sentimento;

  // Diferenciais desejados
  const diferenciais = extrairDiferenciais(norm);
  if (diferenciais) perfil.diferenciais = diferenciais;

  // Fase funil
  perfil.faseFunil = extrairFaseFunil(norm, perfil);

  // Temperatura
  perfil.temperatura = extrairTemperatura(perfil);

  return perfil;
}

module.exports = { extrairPerfil };
