const fs = require('fs');
const path = require('path');
const { lerJSON, salvarJSON } = require('./storage');
const { query, dbOk } = require('./db');

// Normalização de estado/cidade/bairro — feeds de XML e cadastro manual mandam
// a mesma localidade escrita de formas diferentes (maiúscula, sem acento, com
// hífen no lugar de espaço etc), o que gera entradas duplicadas nos filtros
// (ex: "SANTA CATARINA" e "SANTA-CATARINA" como se fossem estados diferentes).
const _ESTADOS_BR = [
  ['AC','Acre'],['AL','Alagoas'],['AP','Amapá'],['AM','Amazonas'],['BA','Bahia'],['CE','Ceará'],
  ['DF','Distrito Federal'],['ES','Espírito Santo'],['GO','Goiás'],['MA','Maranhão'],['MT','Mato Grosso'],
  ['MS','Mato Grosso do Sul'],['MG','Minas Gerais'],['PA','Pará'],['PB','Paraíba'],['PR','Paraná'],
  ['PE','Pernambuco'],['PI','Piauí'],['RJ','Rio de Janeiro'],['RN','Rio Grande do Norte'],['RS','Rio Grande do Sul'],
  ['RO','Rondônia'],['RR','Roraima'],['SC','Santa Catarina'],['SP','São Paulo'],['SE','Sergipe'],['TO','Tocantins']
];
function _chaveLocalidade(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const _ESTADOS_POR_CHAVE = {};
const _SIGLA_POR_CHAVE = {};
_ESTADOS_BR.forEach(([sigla, nome]) => {
  _ESTADOS_POR_CHAVE[_chaveLocalidade(sigla)] = nome;
  _ESTADOS_POR_CHAVE[_chaveLocalidade(nome)] = nome;
  _SIGLA_POR_CHAVE[_chaveLocalidade(sigla)] = sigla.toLowerCase();
  _SIGLA_POR_CHAVE[_chaveLocalidade(nome)] = sigla.toLowerCase();
});
function normalizarEstadoBR(valor) {
  const bruto = typeof valor === 'object' ? (valor?.abbreviation || valor?.['#text'] || '') : (valor || '');
  if (!bruto) return '';
  return _ESTADOS_POR_CHAVE[_chaveLocalidade(bruto)] || bruto.toString().trim();
}
// Nome completo (já normalizado por normalizarEstadoBR) -> sigla minúscula —
// usado pra montar URL de localização (/portal/sp/sao-paulo/vila-mariana).
function siglaEstadoBR(estadoCanonico) {
  return _SIGLA_POR_CHAVE[_chaveLocalidade(estadoCanonico)] || '';
}
const _CONECTIVOS_LOCALIDADE = new Set(['de','da','do','das','dos','e']);
function normalizarNomeLocalidade(valor) {
  const bruto = (valor || '').toString().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!bruto) return '';
  return bruto.toLowerCase().split(' ').map((palavra, idx) => {
    if (!palavra) return palavra;
    if (idx > 0 && _CONECTIVOS_LOCALIDADE.has(palavra)) return palavra;
    return palavra.charAt(0).toUpperCase() + palavra.slice(1);
  }).join(' ');
}

// Distância de edição (Levenshtein) — usada só pra achar o nome real mais
// parecido com o que foi digitado (erro de digitação de verdade, não só
// diferença de acento/maiúscula, que _chaveLocalidade já resolve sozinho).
// Implementação padrão O(n*m), sem depender de lib externa.
function _distanciaEdicao(a, b) {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let linhaAnterior = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) linhaAnterior[j] = j;
  for (let i = 1; i <= la; i++) {
    const linhaAtual = new Array(lb + 1);
    linhaAtual[0] = i;
    for (let j = 1; j <= lb; j++) {
      const custo = a[i-1] === b[j-1] ? 0 : 1;
      linhaAtual[j] = Math.min(
        linhaAnterior[j] + 1,      // remoção
        linhaAtual[j-1] + 1,       // inserção
        linhaAnterior[j-1] + custo // substituição
      );
    }
    linhaAnterior = linhaAtual;
  }
  return linhaAnterior[lb];
}
// Tolerância proporcional ao tamanho do nome — nome curto tolera menos erro
// (senão "Vila" casa com qualquer coisa), nome longo tolera mais letra
// trocada/faltando. Teto de 3 pra nunca ficar frouxo demais mesmo em nome
// muito longo.
function _toleranciaEdicao(tamanho) {
  if (tamanho <= 4) return 0; // nome bem curto: exige igual (evita falso positivo)
  return Math.max(1, Math.min(3, Math.floor(tamanho * 0.22)));
}
// Acha, dentro de um mapa {chaveNormalizada: nomeReal}, a entrada mais
// parecida com chaveDigitada — exata primeiro (rápido), senão a de menor
// distância de edição dentro da tolerância. Retorna null se não achar nada
// perto o bastante (não força casamento errado).
function _casamentoAproximado(chaveDigitada, mapa) {
  if (!chaveDigitada || !mapa) return null;
  if (mapa[chaveDigitada]) return mapa[chaveDigitada];
  const tolerancia = _toleranciaEdicao(chaveDigitada.length);
  if (tolerancia === 0) return null;
  let melhorChave = null, melhorDist = Infinity;
  for (const chave in mapa) {
    // filtro rápido de tamanho antes de calcular a distância de verdade —
    // evita rodar Levenshtein contra milhares de bairro de cidade grande
    // toda vez, e uma diferença de tamanho grande nunca ia passar na
    // tolerância mesmo assim.
    if (Math.abs(chave.length - chaveDigitada.length) > tolerancia) continue;
    const dist = _distanciaEdicao(chaveDigitada, chave);
    if (dist < melhorDist) { melhorDist = dist; melhorChave = chave; }
    if (melhorDist === 0) break;
  }
  return (melhorChave && melhorDist <= tolerancia) ? mapa[melhorChave] : null;
}

// Cruza cidade/bairro contra a tabela `localidades` (IBGE municípios + bairros
// OSM, já populada por popular-brasil-tudo.js) — resolve casos que o cleanup
// puramente formatação não resolve, tipo acento faltando ("ITAJAI" -> "Itajaí")
// E erro de digitação de verdade ("Aclimacao"/"aclimaçao" -> "Aclimação").
// A base do IBGE/OSM (fonte='ibge'/'osm') SEMPRE prevalece — nunca aceita
// como "confiável" o que foi só digitado por corretor e auto-aprendido
// (fonte='interno', ver _alimentarLocalidades), exatamente pra não deixar
// erro de digitação de alguém virar "verdade" pra todo mundo (pedido
// explícito do Renato, ago/2026: "tem que prevalecer o que é correto do
// IBGE, em tudo da app"). Interno só entra como fallback de bairro (cidade
// sempre tem cobertura completa via IBGE, não precisa de fallback).
// Cache em memória, recarrega do PG a cada 1h (mesmo padrão de cerebro/extrator-perfil.js).
let _dicIBGE = null;
let _dicIBGEAt = 0;
async function _carregarDicIBGE() {
  const agora = Date.now();
  if (_dicIBGE && agora - _dicIBGEAt < 3600000) return;
  try {
    const r = await query('SELECT bairro, cidade, estado, fonte FROM localidades WHERE cidade IS NOT NULL');
    const cidadesPorEstado = {};
    const bairrosPorCidade = {};       // só fonte confiável (ibge/osm)
    const bairrosPorCidadeTodos = {};  // confiável + interno (fallback)
    for (const row of r.rows) {
      if (!row.cidade || !row.estado) continue;
      const confiavel = row.fonte === 'ibge' || row.fonte === 'osm';
      const chaveEstado = _chaveLocalidade(normalizarEstadoBR(row.estado));
      const chaveCidade = _chaveLocalidade(row.cidade);
      if (confiavel) {
        if (!cidadesPorEstado[chaveEstado]) cidadesPorEstado[chaveEstado] = {};
        if (!cidadesPorEstado[chaveEstado][chaveCidade]) cidadesPorEstado[chaveEstado][chaveCidade] = row.cidade;
      }
      if (row.bairro) {
        const chaveBairro = _chaveLocalidade(row.bairro);
        if (confiavel) {
          if (!bairrosPorCidade[chaveCidade]) bairrosPorCidade[chaveCidade] = {};
          if (!bairrosPorCidade[chaveCidade][chaveBairro]) bairrosPorCidade[chaveCidade][chaveBairro] = row.bairro;
        }
        if (!bairrosPorCidadeTodos[chaveCidade]) bairrosPorCidadeTodos[chaveCidade] = {};
        if (!bairrosPorCidadeTodos[chaveCidade][chaveBairro]) bairrosPorCidadeTodos[chaveCidade][chaveBairro] = row.bairro;
      }
    }
    _dicIBGE = { cidadesPorEstado, bairrosPorCidade, bairrosPorCidadeTodos };
    _dicIBGEAt = agora;
    console.log('[LOCALIDADES IBGE] cache carregado — estados:', Object.keys(cidadesPorEstado).length);
  } catch(e) {
    console.error('[LOCALIDADES IBGE] erro ao carregar:', e.message);
    if (!_dicIBGE) _dicIBGE = { cidadesPorEstado: {}, bairrosPorCidade: {}, bairrosPorCidadeTodos: {} };
  }
}
_carregarDicIBGE();
// .unref() — sem isso, esse timer mantém o event loop vivo pra sempre.
// No servidor principal isso não importa (o processo já fica de pé o tempo
// todo), mas importXMLCompleto.js roda como processo filho separado
// (spawn/execSync) e importa este mesmo módulo — sem unref, o processo
// filho nunca fecha sozinho mesmo depois de terminar a importação de
// verdade, deixando quem espera o "close" dele (server.js spawnAsync, ou o
// execSync com timeout de 15min em workers/importXmlWorker.js) pendurado
// pra sempre / até estourar timeout — causa da tela "Importando..." que
// nunca vira "Importação finalizada" (ago/2026).
setInterval(_carregarDicIBGE, 3600000).unref();

// estadoCanonico: já deve vir de normalizarEstadoBR(). Sem cache pronto ou sem
// correspondência (nem aproximada) na tabela, cai pro cleanup só de
// formatação (normalizarNomeLocalidade) — nunca inventa uma cidade errada.
function normalizarCidadeBR(estadoCanonico, cidadeBruta) {
  const fallback = normalizarNomeLocalidade(cidadeBruta);
  if (!fallback || !_dicIBGE) return fallback;
  const mapa = _dicIBGE.cidadesPorEstado[_chaveLocalidade(estadoCanonico)];
  return _casamentoAproximado(_chaveLocalidade(fallback), mapa) || fallback;
}
// cidadeCanonica: já deve vir de normalizarCidadeBR(). Tenta primeiro contra
// a base confiável (IBGE/OSM); só cai pro que já foi aprendido de cadastro
// anterior (fonte='interno') se não achar nada parecido na confiável —
// cobre bairro real que a raspagem OSM não pegou, sem deixar erro de
// digitação de um corretor "ensinar" bairro errado pros outros.
function normalizarBairroBR(cidadeCanonica, bairroBruto) {
  const fallback = normalizarNomeLocalidade(bairroBruto);
  if (!fallback || !_dicIBGE) return fallback;
  const chaveCidade = _chaveLocalidade(cidadeCanonica);
  const chaveFallback = _chaveLocalidade(fallback);
  const daConfiavel = _casamentoAproximado(chaveFallback, _dicIBGE.bairrosPorCidade[chaveCidade]);
  if (daConfiavel) return daConfiavel;
  // Tier 'interno' só serve pra CONFIRMAR que aquele texto já apareceu antes
  // como bairro real dessa cidade (aproxima erro de digitação) — a
  // grafia/acento gravado nessa linha não é confiável (bug histórico de
  // _alimentarLocalidades gravando a chave sem acento/minúscula como valor,
  // achado ago/2026), então nunca devolve o valor cru dessa camada: sempre
  // reformata antes de retornar.
  const doAprendido = _casamentoAproximado(chaveFallback, _dicIBGE.bairrosPorCidadeTodos[chaveCidade]);
  return doAprendido ? normalizarNomeLocalidade(doAprendido) : fallback;
}

// Alimenta `localidades` (fonte='interno') com bairro/cidade/estado reais
// que já vieram preenchidos num cadastro de imóvel — cresce a base sozinha
// conforme o sistema é usado, sem depender só da raspagem 1x do
// OpenStreetMap (que deixa buraco em cidade média/pequena — ex: "Praia
// Grande" não tinha bairro nenhum, ago/2026). Fire-and-forget: nunca atrasa
// nem quebra o salvamento do imóvel se a query falhar.
async function _alimentarLocalidades(estadoBruto, cidadeBruta, bairroBruto) {
  const uf = _SIGLA_POR_CHAVE[_chaveLocalidade(estadoBruto)];
  const chaveCidade = _chaveLocalidade(cidadeBruta);
  const chaveBairro = _chaveLocalidade(bairroBruto);
  if (!uf || !chaveCidade || !chaveBairro || chaveBairro.length < 3) return;
  // Grava o nome FORMATADO (não a chave em minúsculo/sem acento) — essa
  // tabela é lida como fonte de exibição pelo fallback 'interno' de
  // normalizarBairroBR, então tem que já vir com grafia decente.
  const cidade = normalizarNomeLocalidade(cidadeBruta);
  const bairro = normalizarNomeLocalidade(bairroBruto);
  try {
    await query(`INSERT INTO localidades(bairro,cidade,estado,fonte) VALUES($1,$2,$3,'interno') ON CONFLICT DO NOTHING`, [bairro, cidade, uf]);
  } catch (e) {}
}

// Fallback pra quando a fonte não manda bairro separado (ex: planilha de
// interessados de portal só tem título/mensagem livre) — varre os bairros
// conhecidos da cidade (mesmo dicionário IBGE/OSM) procurando qual aparece
// como substring no texto, pegando o de nome mais longo/específico encontrado
// (evita bairro curto demais dar falso positivo dentro de outra palavra).
function buscarBairroEmTexto(cidadeCanonica, texto) {
  if (!texto || !cidadeCanonica || !_dicIBGE) return '';
  const mapa = _dicIBGE.bairrosPorCidade[_chaveLocalidade(cidadeCanonica)];
  if (!mapa) return '';
  const textoChave = _chaveLocalidade(texto);
  let melhorChave = '';
  for (const chaveBairro in mapa) {
    if (chaveBairro.length < 4) continue;
    if (textoChave.includes(chaveBairro) && chaveBairro.length > melhorChave.length) melhorChave = chaveBairro;
  }
  return melhorChave ? mapa[melhorChave] : '';
}

function dataPath() {
  const DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
  return path.join(DIR, 'imoveis.json');
}

function dataFile() {
  const DIR = process.env.RENDER ? '/opt/render/project/src' : path.join(__dirname, '..');
  return path.join(DIR, 'imoveis.json');
}

async function criarTabelaImoveis() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS imoveis (
        id TEXT PRIMARY KEY,
        id_externo TEXT,
        id_original TEXT,
        id_interno TEXT,
        codigo_imovel TEXT,
        titulo TEXT,
        tipo TEXT,
        categoria TEXT,
        transacao TEXT,
        condicao TEXT,
        status TEXT DEFAULT 'ativo',
        bairro TEXT,
        cidade TEXT,
        estado TEXT,
        endereco TEXT,
        numero TEXT,
        complemento TEXT,
        cep TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        andar TEXT,
        torre TEXT,
        unidade TEXT,
        condominio_nome TEXT,
        valor_imovel NUMERIC,
        condominio NUMERIC,
        iptu NUMERIC,
        area_m2 NUMERIC,
        area_total NUMERIC,
        quartos INTEGER,
        suites INTEGER,
        banheiros INTEGER,
        vagas INTEGER,
        salas INTEGER,
        descricao TEXT,
        descricao_editada BOOLEAN DEFAULT false,
        fotos JSONB DEFAULT '[]',
        proprietario JSONB DEFAULT '{}',
        portais JSONB DEFAULT '{}',
        corretor JSONB DEFAULT '{}',
        fonte TEXT,
        source TEXT,
        user_id TEXT,
        usuario_id TEXT,
        codigo_usuario TEXT,
        usuario_nome TEXT,
        usuario_perfil TEXT,
        usuario_telefone TEXT,
        corretor_id TEXT,
        corretor_nome TEXT,
        corretor_email TEXT,
        corretor_telefone TEXT,
        url TEXT,
        url_publica TEXT,
        tour_virtual TEXT,
        inativado_em TIMESTAMPTZ,
        inativado_por TEXT,
        xml_url TEXT,
        last_update TIMESTAMPTZ,
        criado_em TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ DEFAULT NOW(),
        dados JSONB DEFAULT '{}'
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_imoveis_user_id ON imoveis(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_imoveis_bairro ON imoveis(bairro)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_imoveis_tipo ON imoveis(tipo)`);
    // idx_imoveis_usuario_id/codigo_usuario/corretor_id: NÃO criar aqui no
    // boot — numa tabela grande, CREATE INDEX CONCURRENTLY pode levar minutos
    // segurando uma conexão; se o processo reiniciar no meio (Render mata por
    // health check falhando), o build nunca termina e cada boot tenta de
    // novo, competindo pelo pool logo na subida — piorou o próprio problema
    // que tentava resolver (ago/2026). Ver criar-indices-pendentes.js — roda
    // uma vez só, manual, via Render Shell, fora do ciclo de boot do servidor.
    console.log('[imoveis] tabela criada/verificada');
  } catch(e) {
    console.error('[imoveis] erro criar tabela:', e.message);
  }
}
criarTabelaImoveis();

function rowToImovel(r) {
  return {
    id: r.id,
    idExterno: r.id_externo,
    idOriginal: r.id_original,
    idInterno: r.id_interno,
    codigoImovel: r.codigo_imovel,
    titulo: r.titulo,
    tipo: r.tipo,
    categoria: r.categoria,
    transacao: r.transacao,
    condicao: r.condicao,
    status: r.status,
    bairro: r.bairro,
    cidade: r.cidade,
    estado: r.estado,
    endereco: r.endereco,
    numero: r.numero,
    complemento: r.complemento,
    cep: r.cep,
    latitude: r.latitude,
    longitude: r.longitude,
    andar: r.andar,
    torre: r.torre,
    unidade: r.unidade,
    condominioNome: r.condominio_nome,
    valor_imovel: r.valor_imovel,
    condominio: r.condominio,
    iptu: r.iptu,
    area_m2: r.area_m2,
    area_total: r.area_total,
    quartos: r.quartos,
    suites: r.suites,
    banheiros: r.banheiros,
    vagas: r.vagas,
    salas: r.salas,
    descricao: r.descricao,
    descricaoEditada: r.descricao_editada,
    fotos: r.fotos || [],
    proprietario: r.proprietario || {},
    portais: r.portais || [],
    diferenciais: r.diferenciais || [],
    corretor: r.corretor || {},
    fonte: r.fonte,
    source: r.source,
    fase: r.fase || "",
    anoConstrucao: r.ano_construcao || "",
    posicaoSolar: r.posicao_solar || "",
    area_construida: r.area_construida || 0,
    totalAndares: r.total_andares || 0,
    unidadesPorAndar: r.unidades_por_andar || 0,
    aceitaFinanciamento: r.aceita_financiamento || "a_combinar",
    aceitaPermuta: r.aceita_permuta || "nao",
    userId: r.user_id,
    usuarioId: r.usuario_id,
    codigoUsuario: r.codigo_usuario,
    usuarioNome: r.usuario_nome,
    usuarioPerfil: r.usuario_perfil,
    usuarioTelefone: r.usuario_telefone,
    corretorId: r.corretor_id,
    corretorNome: r.corretor_nome,
    corretorEmail: r.corretor_email,
    corretorTelefone: r.corretor_telefone,
    url: r.url,
    urlPublica: r.url_publica,
    tourVirtual: r.tour_virtual,
    inativadoEm: r.inativado_em,
    inativadoPor: r.inativado_por,
    xmlUrl: r.xml_url,
    lastUpdate: r.last_update,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
    ...(r.dados || {})
  };
}

// % de preenchimento do perfil do imóvel — mesma sequência de campos do cadastro
// manual (/app/cadastro), usado no card de captação pra mostrar o quanto falta o
// proprietário completar. Diferenciais fica de fora (dezenas de checkboxes,
// contar 1 a 1 nunca deixaria o % subir de forma significativa).
function calcularPercentualPerfil(im) {
  if (!im) return 0;
  const prop = im.proprietario || {};
  const checks = [
    !!im.tipo,
    !!im.transacao,
    !!(im.cep || im.endereco),
    !!im.bairro,
    !!im.cidade,
    !!im.estado,
    parseFloat(im.valor_imovel) > 0,
    parseFloat(im.condominio) > 0,
    parseFloat(im.iptu) > 0,
    parseFloat(im.area_m2) > 0,
    parseInt(im.quartos) > 0,
    parseInt(im.suites) > 0,
    parseInt(im.banheiros) > 0,
    parseInt(im.vagas) > 0,
    !!(im.descricao && im.descricao.trim()),
    !!(im.fotos && im.fotos.length > 0),
    !!(prop.nome && prop.nome.trim()),
    !!(prop.celular || prop.telefone),
  ];
  const preenchidos = checks.filter(Boolean).length;
  return Math.round((preenchidos / checks.length) * 100);
}

// Filtro de "qualidade mínima" pra aparecer fora da carteira do corretor —
// telas públicas (/portal, /site/:codigo, /imovel/:id) e no motor de match
// que sugere imóvel pra lead (cerebro/motor-intencao.js). Sem foto passa
// impressão de anúncio incompleto/golpe; valor muito abaixo do piso costuma
// ser erro de digitação/import de XML — os dois prejudicam SEO e a
// credibilidade da rede. O corretor continua vendo o imóvel normal em
// /app/imoveis (carteira interna) mesmo sem passar nesse filtro — isso aqui
// é só pra decidir o que fica visível fora da conta dele.
const VALOR_MINIMO_VENDA = 150000;
const VALOR_MINIMO_ALUGUEL = 500;
function imovelVisivelPublico(im) {
  if (!im) return false;
  if (!im.fotos || !im.fotos.length) return false;
  const valor = parseFloat(im.valor_imovel) || 0;
  const transacao = String(im.transacao || '').toLowerCase();
  const minimo = transacao.includes('alug') ? VALOR_MINIMO_ALUGUEL : VALOR_MINIMO_VENDA;
  return valor >= minimo;
}

function imovelToRow(i) {
  const dados = { ...i };
  const campos = ['id','idExterno','idOriginal','idInterno','codigoImovel','titulo','tipo','categoria','transacao','condicao','status','bairro','cidade','estado','endereco','numero','complemento','cep','latitude','longitude','andar','torre','unidade','condominioNome','valor_imovel','condominio','iptu','area_m2','area_total','area_construida','quartos','suites','banheiros','vagas','salas','descricao','descricaoEditada','fotos','proprietario','portais','diferenciais','corretor','fonte','source','fase','anoConstrucao','posicaoSolar','totalAndares','unidadesPorAndar','aceitaFinanciamento','aceitaPermuta','userId','usuarioId','codigoUsuario','usuarioNome','usuarioPerfil','usuarioTelefone','corretorId','corretorNome','corretorEmail','corretorTelefone','url','urlPublica','tourVirtual','inativadoEm','inativadoPor','xmlUrl','lastUpdate','criadoEm'];
  campos.forEach(k => delete dados[k]);
  return {
    id: String(i.id || i.idInterno || i.idExterno || i.idOriginal || i.codigoImovel || Date.now()),
    id_externo: i.idExterno || i.idOriginal || '',
    id_original: i.idOriginal || i.idExterno || '',
    id_interno: i.idInterno || '',
    codigo_imovel: i.codigoImovel || '',
    titulo: i.titulo || '',
    tipo: i.tipo || '',
    categoria: i.categoria || '',
    transacao: i.transacao || 'venda',
    condicao: i.condicao || '',
    status: i.status || 'ativo',
    ...(() => {
      const estado = normalizarEstadoBR(i.estado);
      const cidade = normalizarCidadeBR(estado, i.cidade);
      const bairro = normalizarBairroBR(cidade, i.bairro);
      return { estado, cidade, bairro };
    })(),
    endereco: i.endereco || '',
    numero: i.numero || '',
    complemento: i.complemento || '',
    cep: String(i.cep || '').replace(/\D/g, ''),
    latitude: parseFloat(i.latitude || i.lat || 0) || null,
    longitude: parseFloat(i.longitude || i.lng || 0) || null,
    andar: i.andar || '',
    torre: i.torre || '',
    unidade: i.unidade || '',
    condominio_nome: i.condominioNome || '',
    valor_imovel: parseFloat(i.valor_imovel || i.valor || 0) || 0,
    condominio: parseFloat(i.condominio || 0) || 0,
    iptu: parseFloat(i.iptu || 0) || 0,
    area_m2: parseFloat(i.area_m2 || i.area || 0) || 0,
    area_total: parseFloat(i.area_total || i.area_m2 || 0) || 0,
    quartos: parseInt(i.quartos || 0) || 0,
    suites: parseInt(i.suites || 0) || 0,
    banheiros: parseInt(i.banheiros || 0) || 0,
    vagas: parseInt(i.vagas || 0) || 0,
    salas: parseInt(i.salas || i.rooms || 0) || 0,
    descricao: i.descricao || '',
    descricao_editada: i.descricaoEditada || false,
    diferenciais: JSON.stringify(Array.isArray(i.diferenciais) ? i.diferenciais : []),
    fase: i.fase || '',
    ano_construcao: i.anoConstrucao || i.anoContrucao || i.ano_construcao || '',
    posicao_solar: i.posicaoSolar || i.posicao_solar || '',
    area_construida: parseFloat(i.area_construida || i.areaConstruida || 0) || 0,
    total_andares: parseInt(i.totalAndares || i.total_andares || 0) || 0,
    unidades_por_andar: parseInt(i.unidadesPorAndar || i.unidades_por_andar || 0) || 0,
    aceita_financiamento: i.aceitaFinanciamento || i.aceita_financiamento || 'a_combinar',
    aceita_permuta: i.aceitaPermuta || i.aceita_permuta || 'nao',
    fotos: JSON.stringify(i.fotos || []),
    proprietario: JSON.stringify(i.proprietario || {}),
    portais: JSON.stringify(i.portais || {}),
    corretor: JSON.stringify(i.corretor || {}),
    fonte: i.fonte || i.source || '',
    source: i.source || i.fonte || '',
    user_id: i.userId || i.usuarioId || i.codigoUsuario || i.corretorId || null,
    usuario_id: i.usuarioId || i.userId || null,
    codigo_usuario: i.codigoUsuario || i.userId || null,
    usuario_nome: i.usuarioNome || '',
    usuario_perfil: i.usuarioPerfil || '',
    usuario_telefone: i.usuarioTelefone || '',
    corretor_id: i.corretorId || i.userId || null,
    corretor_nome: i.corretorNome || '',
    corretor_email: i.corretorEmail || '',
    corretor_telefone: i.corretorTelefone || '',
    url: i.url || i.link || '',
    url_publica: i.urlPublica || '',
    tour_virtual: i.tourVirtual || '',
    inativado_em: i.inativadoEm || null,
    inativado_por: i.inativadoPor || null,
    xml_url: i.xmlUrl || '',
    last_update: i.lastUpdate || i.updatedAt || null,
    dados: JSON.stringify(dados)
  };
}

async function lerImoveis(userId) {
  if (await dbOk()) {
    try {
      let sql, params;
      if (!userId) {
        sql = `SELECT * FROM imoveis ORDER BY criado_em DESC`;
        params = [];
      } else {
        sql = `SELECT * FROM imoveis WHERE (user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1) ORDER BY criado_em DESC`;
        params = [userId];
      }
      const res = await query(sql, params);
      return res.rows.map(rowToImovel);
    } catch(e) {
      console.error('[lerImoveis PG]', e.message);
    }
  }
  const todos = lerJSON(dataFile(), []);
  if (!userId) return todos;
  return todos.filter(i => i.userId === userId || i.usuarioId === userId || i.codigoUsuario === userId || i.corretorId === userId);
}

async function _geocodificarCep(cep, id) {
  try {
    const _cepLimpo = String(cep||'').replace(/\D/g,'');
    if (!_cepLimpo || _cepLimpo.length < 8) return;
    const _r = await fetch('https://nominatim.openstreetmap.org/search?postalcode='+_cepLimpo+'&country=Brazil&format=json&limit=1', { headers: { 'User-Agent': 'MatchImoveis/1.0' } });
    const _d = await _r.json();
    if (_d[0]) {
      const lat = parseFloat(_d[0].lat);
      const lng = parseFloat(_d[0].lon);
      await query('UPDATE imoveis SET latitude=$1, longitude=$2 WHERE id=$3', [lat, lng, id]);
      console.log('[geocode] OK', _cepLimpo, '->', lat, lng);
    }
  } catch(e) { console.error('[geocode]', e.message); }
}

async function _geocodificarEndereco(imovel) {
  try {
    if (imovel.latitude && imovel.longitude) return { latitude: imovel.latitude, longitude: imovel.longitude };
    if (!imovel.bairro && !imovel.cidade && !imovel.endereco) return null;
    const partes = [imovel.endereco, imovel.bairro, imovel.cidade, imovel.estado, 'Brasil'].filter(Boolean).join(', ');
    const _r = await fetch('https://nominatim.openstreetmap.org/search?q='+encodeURIComponent(partes)+'&format=json&limit=1', { headers: { 'User-Agent': 'MatchImoveis/1.0' } });
    const _d = await _r.json();
    if (_d && _d[0]) {
      const lat = parseFloat(_d[0].lat);
      const lng = parseFloat(_d[0].lon);
      if (imovel.id) query('UPDATE imoveis SET latitude=$1, longitude=$2 WHERE id=$3', [lat, lng, imovel.id]).catch(()=>{});
      return { latitude: lat, longitude: lng };
    }
  } catch(e) { console.error('[geocode-endereco]', e.message); }
  return null;
}

async function salvarImovel(imovel) {
  if (await dbOk()) {
    try {
      const r = imovelToRow(imovel);
      await query(`
        INSERT INTO imoveis (id,id_externo,id_original,id_interno,codigo_imovel,titulo,tipo,categoria,transacao,condicao,status,bairro,cidade,estado,endereco,numero,complemento,cep,latitude,longitude,andar,torre,unidade,condominio_nome,valor_imovel,condominio,iptu,area_m2,area_total,area_construida,quartos,suites,banheiros,vagas,salas,descricao,descricao_editada,fotos,proprietario,portais,diferenciais,corretor,fonte,source,fase,ano_construcao,posicao_solar,total_andares,unidades_por_andar,aceita_financiamento,aceita_permuta,user_id,usuario_id,codigo_usuario,usuario_nome,usuario_perfil,usuario_telefone,corretor_id,corretor_nome,corretor_email,corretor_telefone,url,url_publica,tour_virtual,inativado_em,inativado_por,xml_url,last_update,dados)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,$63,$64,$65,$66,$67,$68,$69)
        ON CONFLICT (id) DO UPDATE SET
          id_externo=EXCLUDED.id_externo, id_original=EXCLUDED.id_original, id_interno=EXCLUDED.id_interno,
          codigo_imovel=EXCLUDED.codigo_imovel,
          titulo=EXCLUDED.titulo, tipo=EXCLUDED.tipo, categoria=EXCLUDED.categoria,
          transacao=EXCLUDED.transacao, condicao=EXCLUDED.condicao, status=EXCLUDED.status,
          bairro=EXCLUDED.bairro, cidade=EXCLUDED.cidade, estado=EXCLUDED.estado,
          endereco=EXCLUDED.endereco, numero=EXCLUDED.numero, complemento=EXCLUDED.complemento,
          cep=EXCLUDED.cep, andar=EXCLUDED.andar, torre=EXCLUDED.torre, unidade=EXCLUDED.unidade,
          condominio_nome=EXCLUDED.condominio_nome, valor_imovel=EXCLUDED.valor_imovel,
          condominio=EXCLUDED.condominio, iptu=EXCLUDED.iptu,
          area_m2=EXCLUDED.area_m2, area_total=EXCLUDED.area_total, area_construida=EXCLUDED.area_construida,
          quartos=EXCLUDED.quartos, suites=EXCLUDED.suites,
          banheiros=EXCLUDED.banheiros, vagas=EXCLUDED.vagas, salas=EXCLUDED.salas,
          descricao=EXCLUDED.descricao, descricao_editada=EXCLUDED.descricao_editada,
          fotos=EXCLUDED.fotos, proprietario=EXCLUDED.proprietario, portais=EXCLUDED.portais,
          diferenciais=EXCLUDED.diferenciais, corretor=EXCLUDED.corretor,
          fonte=EXCLUDED.fonte, source=EXCLUDED.source, fase=EXCLUDED.fase,
          ano_construcao=EXCLUDED.ano_construcao, posicao_solar=EXCLUDED.posicao_solar,
          total_andares=EXCLUDED.total_andares, unidades_por_andar=EXCLUDED.unidades_por_andar,
          aceita_financiamento=EXCLUDED.aceita_financiamento, aceita_permuta=EXCLUDED.aceita_permuta,
          user_id=EXCLUDED.user_id, usuario_id=EXCLUDED.usuario_id, codigo_usuario=EXCLUDED.codigo_usuario,
          usuario_nome=EXCLUDED.usuario_nome, usuario_perfil=EXCLUDED.usuario_perfil, usuario_telefone=EXCLUDED.usuario_telefone,
          corretor_id=EXCLUDED.corretor_id, corretor_nome=EXCLUDED.corretor_nome,
          corretor_email=EXCLUDED.corretor_email, corretor_telefone=EXCLUDED.corretor_telefone,
          url=EXCLUDED.url, url_publica=EXCLUDED.url_publica, tour_virtual=EXCLUDED.tour_virtual,
          latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
          inativado_em=EXCLUDED.inativado_em, inativado_por=EXCLUDED.inativado_por,
          xml_url=EXCLUDED.xml_url, last_update=EXCLUDED.last_update,
          dados=EXCLUDED.dados, atualizado_em=NOW()
      `, [r.id,r.id_externo,r.id_original,r.id_interno,r.codigo_imovel,r.titulo,r.tipo,r.categoria,r.transacao,r.condicao,r.status,r.bairro,r.cidade,r.estado,r.endereco,r.numero,r.complemento,r.cep,r.latitude,r.longitude,r.andar,r.torre,r.unidade,r.condominio_nome,r.valor_imovel,r.condominio,r.iptu,r.area_m2,r.area_total,r.area_construida,r.quartos,r.suites,r.banheiros,r.vagas,r.salas,r.descricao,r.descricao_editada,r.fotos,r.proprietario,r.portais,r.diferenciais,r.corretor,r.fonte,r.source,r.fase,r.ano_construcao,r.posicao_solar,r.total_andares,r.unidades_por_andar,r.aceita_financiamento,r.aceita_permuta,r.user_id,r.usuario_id,r.codigo_usuario,r.usuario_nome,r.usuario_perfil,r.usuario_telefone,r.corretor_id,r.corretor_nome,r.corretor_email,r.corretor_telefone,r.url,r.url_publica,r.tour_virtual,r.inativado_em,r.inativado_por,r.xml_url,r.last_update,r.dados]);
      _alimentarLocalidades(r.estado, r.cidade, r.bairro).catch(() => {});
      return imovel;
    } catch(e) {
      console.error('[salvarImovel PG]', e.message);
    }
  }
  const todos = lerJSON(dataFile(), []);
  const idx = todos.findIndex(i => i.id === imovel.id || i.idExterno === imovel.idExterno);
  if (idx >= 0) todos[idx] = { ...todos[idx], ...imovel };
  else todos.push(imovel);
  await salvarJSON(dataFile(), todos);
  return imovel;
}

async function salvarTodosImoveis(imoveis) {
  if (await dbOk()) {
    try {
      for (const im of imoveis) await salvarImovel(im);
      return imoveis;
    } catch(e) {
      console.error('[salvarTodosImoveis PG]', e.message);
    }
  }
  await salvarJSON(dataFile(), imoveis);
  return imoveis;
}

// Espera o dicionário IBGE/OSM estar carregado — normalizarCidadeBR/
// normalizarBairroBR já funcionam sem isso (caem no fallback de formatação
// se _dicIBGE ainda não carregou), mas um script em lote que processa
// muitos registros seguidos quer garantir que o casamento aproximado de
// verdade já está disponível antes de começar, senão a primeira leva de
// registros processada logo após o require() cairia só no fallback.
async function garantirDicionarioLocalidades() { await _carregarDicIBGE(); }

module.exports = { lerImoveis, salvarImovel, salvarTodosImoveis, rowToImovel, calcularPercentualPerfil, imovelVisivelPublico, _geocodificarCep, _geocodificarEndereco, normalizarEstadoBR, normalizarNomeLocalidade, normalizarCidadeBR, normalizarBairroBR, siglaEstadoBR, buscarBairroEmTexto, garantirDicionarioLocalidades };
