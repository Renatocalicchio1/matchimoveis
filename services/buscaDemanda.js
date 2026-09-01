// Ferramenta de demonstração: dado um recorte geográfico (estado + cidade +
// bairros) e transação (venda/aluguel/ambos), mostra quantos interessados
// foram minerados/extraídos do portal (planilha acumulada de Interessados
// de Portal, services/interesadosPortal.js) nos últimos N dias. NÃO usa a
// tabela `leads` da plataforma (leads reais de WhatsApp/manual/webhook) —
// só o que veio da mineração do portal, por pedido explícito (não misturar
// as duas fontes).
const { query } = require('./db');

const _ESTADOS_BR = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'], ['CE', 'Ceará'],
  ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'], ['MA', 'Maranhão'], ['MT', 'Mato Grosso'],
  ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'], ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'],
  ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'],
  ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'], ['SE', 'Sergipe'], ['TO', 'Tocantins']
];

function _norm(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

const _SIGLA_POR_CHAVE = {};
_ESTADOS_BR.forEach(([sigla, nome]) => {
  _SIGLA_POR_CHAVE[_norm(nome)] = sigla.toLowerCase();
  _SIGLA_POR_CHAVE[_norm(sigla)] = sigla.toLowerCase();
});
function _sigla(s) {
  const n = _norm(s);
  return _SIGLA_POR_CHAVE[n] || n;
}

// Estado/cidade/bairro do seletor só mostram onde tem demanda de verdade
// minerada do portal (Interessados de Portal, últimos 90 dias — mesmo teto
// da própria busca, set/2026: era 30) — lista de todo o Brasil só teria
// opção vazia na esmagadora maioria dos casos. Sem filtro de vendido:
// comprar uma lead não tira ela da base — outro corretor pode comprar a
// mesma, ela só some depois de passar do teto de dias (90).
async function _coletarSinaisRecentes() {
  try {
    const { rows } = await query(
      `SELECT estado, cidade, bairro FROM interessados_portal WHERE COALESCE(data_lead, criado_em) >= NOW() - make_interval(days => 90)`
    );
    return rows.map(r => ({ estado: r.estado || '', cidade: r.cidade || '', bairro: r.bairro || '' }));
  } catch (e) {
    return []; // tabela pode nem existir ainda
  }
}

async function listarEstadosComLead() {
  const sinais = await _coletarSinaisRecentes();
  const siglas = new Set();
  for (const s of sinais) {
    const sigla = _sigla(s.estado);
    if (sigla) siglas.add(sigla);
  }
  return _ESTADOS_BR.filter(([sigla]) => siglas.has(sigla.toLowerCase())).map(([sigla, nome]) => ({ sigla, nome }));
}

async function listarCidadesComLead(estado) {
  const siglaAlvo = _sigla(estado);
  if (!siglaAlvo) return [];
  const sinais = await _coletarSinaisRecentes();
  const cidades = new Map();
  for (const s of sinais) {
    if (!s.cidade || _sigla(s.estado) !== siglaAlvo) continue;
    const chave = _norm(s.cidade);
    if (!cidades.has(chave)) cidades.set(chave, s.cidade);
  }
  return Array.from(cidades.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Só mostra bairro que TEM demanda de verdade — senão a lista fica com
// centenas de bairros sem nenhum lead, a maioria inútil pra escolher.
async function listarBairrosComLead(estado, cidade) {
  const siglaAlvo = _sigla(estado);
  const cidadeAlvo = _norm(cidade);
  if (!siglaAlvo || !cidadeAlvo) return [];

  const sinais = await _coletarSinaisRecentes();
  const bairros = new Map(); // chave normalizada -> nome de exibição
  for (const s of sinais) {
    if (!s.bairro || !s.cidade) continue;
    if (_sigla(s.estado) !== siglaAlvo || _norm(s.cidade) !== cidadeAlvo) continue;
    const chave = _norm(s.bairro);
    if (!bairros.has(chave)) bairros.set(chave, s.bairro);
  }

  return Array.from(bairros.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function _normTransacao(v) {
  const n = _norm(v);
  if (!n) return '';
  if (n.includes('alug') || n.includes('locac')) return 'aluguel';
  if (n.includes('vend') || n.includes('compr')) return 'venda';
  return '';
}

// Formato de saída = exatamente as colunas do modelo padrão de leads (GET
// /app/modelo-leads.xlsx): Nome, Telefone, Email, Origem, Tipo, Transacao,
// Condicao, Bairro, Cidade, Estado, Quartos, Suites, Vagas, Banheiros,
// Area_max, Valor_max — id/criadoEm/fonte ficam só pra ordenar/rastrear,
// não fazem parte do modelo.

// Única fonte: planilha acumulada de Interessados de Portal
// (services/interesadosPortal.js) — bairro/cidade/transação já vêm em
// coluna própria (Bairro/Cidade/Estado/Transacao).
async function _buscarNosInteresadosPortal(siglaAlvo, chavesAlvo, transacoesAlvo, horas, valorMin = 0, valorMax = 0) {
  let rows;
  try {
    ({ rows } = await query(
      // COALESCE(data_lead, criado_em): data_lead é a data real do interessado
      // no portal (coluna "Data" da planilha) — usa criado_em (data do upload)
      // só como fallback pra linhas antigas onde a data não deu pra parsear.
      // Sem filtro de vendido: comprar não tira a lead da base, ela fica
      // disponível pra outros corretores comprarem também — só desaparece
      // quando passa do teto de dias escolhido na busca (até 90).
      `SELECT * FROM interessados_portal WHERE COALESCE(data_lead, criado_em) >= NOW() - make_interval(hours => $1::int) ORDER BY COALESCE(data_lead, criado_em) DESC`,
      [horas]
    ));
  } catch (e) {
    return []; // tabela pode nem existir ainda se nunca subiu planilha nenhuma
  }
  const encontrados = [];
  for (const r of rows) {
    const transacaoLead = _normTransacao(r.transacao || '');
    if (!r.estado || _sigla(r.estado) !== siglaAlvo) continue;
    if (!r.cidade || !r.bairro) continue;
    if (!chavesAlvo.has(_norm(r.cidade) + '|||' + _norm(r.bairro))) continue;
    if (!transacaoLead || !transacoesAlvo.has(transacaoLead)) continue;
    // Filtro de valor ("de quanto a quanto") — só entra quem tem valor_max
    // preenchido E dentro da faixa pedida; sem faixa (min=max=0), não filtra.
    if (valorMin > 0 || valorMax > 0) {
      const v = parseFloat(r.valor_max) || 0;
      if (!v) continue;
      if (valorMin > 0 && v < valorMin) continue;
      if (valorMax > 0 && v > valorMax) continue;
    }

    encontrados.push({
      id: 'interessado-' + r.id, _rowId: r.id, criadoEm: r.data_lead || r.criado_em, fonte: 'interessados_portal',
      Nome: r.nome || 'Sem nome', Telefone: r.telefone || '', Email: r.email || '',
      Origem: r.origem || 'portal_imovelweb', Tipo: r.tipo || '', Transacao: transacaoLead, Condicao: r.condicao || '',
      Bairro: r.bairro, Cidade: r.cidade, Estado: r.estado,
      Quartos: r.quartos || '', Suites: r.suites || '', Vagas: r.vagas || '', Banheiros: r.banheiros || '',
      Area_max: r.area_max || '', Valor_max: r.valor_max || ''
    });
  }
  return encontrados;
}

// Contato mascarado — a lead é um "achado" da busca, mas telefone/email só
// aparecem de verdade depois que existir o fluxo de compra de leads (ainda
// não construído). Mostra o suficiente pra provar que o dado existe, sem
// vazar o contato de verdade — inclusive na versão pública da tela.
function _mascararTelefone(v) {
  const s = String(v || '').replace(/\D/g, '');
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return s.slice(0, 2) + '•'.repeat(Math.max(3, s.length - 4)) + s.slice(-2);
}
function _mascararEmail(v) {
  const s = String(v || '');
  const at = s.indexOf('@');
  if (at < 1) return s ? '••••' : '';
  const nome = s.slice(0, at);
  const dominio = s.slice(at);
  return nome.slice(0, 1) + '•'.repeat(Math.max(3, nome.length - 1)) + dominio;
}
// Mantém o primeiro nome + inicial do sobrenome (ex: "Maria S.") — dá pra
// reconhecer que é uma pessoa de verdade sem expor o nome completo.
function _mascararNome(v) {
  const partes = String(v || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return 'Sem nome';
  if (partes.length === 1) return partes[0];
  return partes[0] + ' ' + partes[partes.length - 1].slice(0, 1) + '.';
}

// horas: janela de tempo em horas (dias escolhidos na tela × 24, de 0 a 90
// dias = 0 a 2160h, set/2026 — era máx. 30). Fonte única: Interessados de Portal.
// pares: [{cidade, bairro}] — sem limite de quantidade nem de quantas
// cidades diferentes; casa por par exato (evita, ex., "Centro" de uma
// cidade bater com "Centro" de outra quando o usuário só marcou uma delas).
async function buscarDemanda({ estado, pares = [], transacoes = [], horas = 168, valorMin = 0, valorMax = 0 }) {
  const siglaAlvo = _sigla(estado);
  const chavesAlvo = new Set(pares.map(p => _norm(p.cidade) + '|||' + _norm(p.bairro)).filter(k => k !== '|||'));
  const transacoesAlvo = new Set((transacoes.length ? transacoes : ['venda', 'aluguel']).map(_norm));

  const encontrados = await _buscarNosInteresadosPortal(siglaAlvo, chavesAlvo, transacoesAlvo, horas, valorMin, valorMax);
  return encontrados
    .sort((a, b) => (parseFloat(b.Valor_max) || 0) - (parseFloat(a.Valor_max) || 0))
    .map(l => ({ ...l, Nome: _mascararNome(l.Nome), Telefone: _mascararTelefone(l.Telefone), Email: _mascararEmail(l.Email) }));
}

// Usado só internamente (webhook de pagamento) pra ENTREGAR de verdade —
// nome/telefone/email não mascarados, e limitado a `limite` (a quantidade
// do combo comprado). Mesmo critério/ordenação de buscarDemanda() (mais
// caro primeiro), pra entregar exatamente o que o comprador viu na tela.
async function buscarDemandaParaEntrega({ estado, pares = [], transacoes = [], horas = 168, valorMin = 0, valorMax = 0, limite = 0 }) {
  const siglaAlvo = _sigla(estado);
  const chavesAlvo = new Set(pares.map(p => _norm(p.cidade) + '|||' + _norm(p.bairro)).filter(k => k !== '|||'));
  const transacoesAlvo = new Set((transacoes.length ? transacoes : ['venda', 'aluguel']).map(_norm));

  const encontrados = await _buscarNosInteresadosPortal(siglaAlvo, chavesAlvo, transacoesAlvo, horas, valorMin, valorMax);
  encontrados.sort((a, b) => (parseFloat(b.Valor_max) || 0) - (parseFloat(a.Valor_max) || 0));
  return limite > 0 ? encontrados.slice(0, limite) : encontrados;
}

// Sinal de alta confiança (mesmo formato de cerebro/portal-processor.js —
// "monta mapaIntencao diretamente dos campos estruturados, sem extrator de
// texto"): esse dado vem pronto da planilha de Interessados de Portal, não
// precisa adivinhar de mensagem livre.
function _sinalDemanda(valor, confianca) {
  return [{ valor, confianca, score: confianca, peso: 1, timestamp: Date.now(), origem: 'compra_demanda' }];
}
const _TIPOS_SEM_QUARTO = ['terreno','lote','area rural','chacara','sitio','fazenda','sala','loja','galpao','predio','comercial','escritorio','conjunto','hotel','consultorio','restaurante'];

// Monta o perfil de busca completo (perfilIA + mapaIntencao) de uma lead
// vinda de /demanda, com TODOS os campos que a planilha de interessados já
// tem — não só tipo/cidade/bairro/valor. Compartilhado entre a entrega
// inicial (webhook Mercado Pago, combo_demanda) e o topup diário
// (services/topupPlanoLeads.js), pra nunca divergir.
//
// Os dois campos importam por motivos diferentes:
// - perfilIA: resumo simples mostrado na tela da lead, e é o que
//   _perfilSuficiente() (cerebro/match-core.js) usa como "tem dado
//   suficiente pra tentar match" — sem quartos aqui, o motor nem tentava.
// - mapaIntencao: estrutura que matchPorMapa() (cerebro/motor-intencao.js)
//   de fato lê pra filtrar/pontuar os imóveis — SEM isso preenchido,
//   matchPorMapa() recebe lead.mapaIntencao vazio/nulo e retorna ZERO
//   matches sempre, não importa o que tiver em perfilIA. Essa lista nunca
//   preenchia esse campo — por isso as leads de /demanda nunca geravam
//   match nenhum, com ou sem quartos.
function montarPerfilEMapaDemanda(l) {
  const quartos = parseInt(l.Quartos) || 0;
  const suites = parseInt(l.Suites) || 0;
  const vagas = parseInt(l.Vagas) || 0;
  const banheiros = parseInt(l.Banheiros) || 0;
  const area = parseFloat(l.Area_max) || 0;
  const valorMax = parseFloat(l.Valor_max) || 0;
  const tipoNorm = _norm(l.Tipo || '');
  const ehTerrenoOuComercial = _TIPOS_SEM_QUARTO.some(t => tipoNorm.includes(t));
  const intencao = l.Transacao === 'aluguel' ? 'alugar' : 'comprar';

  const perfilIA = { tipo: l.Tipo || '', intencao, cidade: l.Cidade || '', estado: l.Estado || '', bairro: l.Bairro || '' };
  if (valorMax) perfilIA.valorMax = valorMax;
  if (quartos) perfilIA.quartos = quartos;
  if (suites) perfilIA.suites = suites;
  if (vagas) perfilIA.vagas = vagas;
  if (banheiros) perfilIA.banheiros = banheiros;
  if (area) perfilIA.area = area;

  const mapaIntencao = {
    transacao:   l.Transacao ? _sinalDemanda(l.Transacao, 90) : [],
    tipo_imovel: l.Tipo ? _sinalDemanda(tipoNorm, 90) : [],
    cidade:      l.Cidade ? _sinalDemanda(_norm(l.Cidade), 90) : [],
    estado:      l.Estado ? _sinalDemanda(_norm(l.Estado), 90) : [],
    bairro:      l.Bairro ? _sinalDemanda(_norm(l.Bairro), 90) : [],
    valor:       valorMax ? _sinalDemanda({ min: 0, max: valorMax }, 90) : [],
    quartos:     (quartos && !ehTerrenoOuComercial) ? _sinalDemanda(quartos, 90) : [],
    suites:      (suites && !ehTerrenoOuComercial) ? _sinalDemanda(suites, 85) : [],
    vagas:       vagas ? _sinalDemanda(vagas, 85) : [],
    banheiros:   banheiros ? _sinalDemanda(banheiros, 85) : [],
    area:        (area && ehTerrenoOuComercial) ? _sinalDemanda(area, 85) : [],
    fase: 'novo', temperatura: 'frio'
  };
  return { perfilIA, mapaIntencao };
}

// Estatística real (não inventada) pra barra de prova social/urgência da
// tela — total de interessados disponíveis agora e quantos chegaram nas
// últimas 24h, nacional, últimos 30 dias. Sem filtro de vendido — comprar
// não tira ninguém da contagem, a lead continua disponível pra outros.
async function contarDisponiveis() {
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE COALESCE(data_lead, criado_em) >= NOW() - make_interval(hours => 24))::int AS recentes24h
       FROM interessados_portal
       WHERE COALESCE(data_lead, criado_em) >= NOW() - make_interval(days => 30)`
    );
    return { total: rows[0]?.total || 0, recentes24h: rows[0]?.recentes24h || 0 };
  } catch (e) {
    return { total: 0, recentes24h: 0 };
  }
}

// Atividade REAL da plataforma (não inventada) pra alimentar a animação de
// "IA pensando" — leads de verdade (tabela `leads`, não interessados_portal
// — não é a mesma base vendida em /demanda) que já receberam vitrine, com
// o imóvel real que foi enviado a elas (matches[0], já tem foto real
// porque é o que a própria vitrine mostrou). Nome mascarado, sem telefone/
// email. Prioriza a região que o usuário selecionou (estado/cidade/bairro)
// — se não tiver atividade suficiente ali, completa com atividade nacional
// (senão o modal fica vazio/quebrado pra região com pouco volume ainda).
const _BASE_SELECT_ATIVIDADE = `
  SELECT nome, telefone, dados->>'email' AS email, criado_em,
         matches->0->>'tipo' AS tipo,
         matches->0->>'transacao' AS transacao,
         matches->0->>'bairro' AS bairro,
         matches->0->>'cidade' AS cidade,
         COALESCE(matches->0->>'valor_imovel', matches->0->>'valor') AS valor,
         matches->0->>'quartos' AS quartos,
         matches->0#>>'{fotos,0}' AS foto
  FROM leads
  WHERE vitrine_enviada = true
    AND jsonb_typeof(matches) = 'array'
    AND jsonb_array_length(matches) > 0
    AND matches->0#>>'{fotos,0}' IS NOT NULL
    AND criado_em >= NOW() - INTERVAL '7 days'
`;

// "Procurando agora" (<1h) / "há N horas" (<24h) / "há N dias" (até 7, já
// garantido pelo filtro acima) — precisão de hora em vez de só dia inteiro.
function _formatarTempoProcurando(criadoEm) {
  if (!criadoEm) return '';
  const horas = Math.max(0, Math.floor((Date.now() - new Date(criadoEm).getTime()) / 3600000));
  if (horas < 1) return 'Procurando agora';
  if (horas < 24) return 'Procuro há ' + horas + (horas === 1 ? ' hora' : ' horas');
  const dias = Math.floor(horas / 24);
  return 'Procuro há ' + dias + (dias === 1 ? ' dia' : ' dias');
}

async function listarAtividadeRecente({ limite = 24, estado = '', pares = [] } = {}) {
  const cidades = [...new Set((pares || []).map(p => _norm(p.cidade)).filter(Boolean))];
  const bairros = [...new Set((pares || []).map(p => _norm(p.bairro)).filter(Boolean))];

  let rowsRegiao = [];
  if (cidades.length) {
    try {
      const { rows } = await query(
        `${_BASE_SELECT_ATIVIDADE}
           AND unaccent(lower(matches->0->>'cidade')) = ANY($1::text[])
         ORDER BY (unaccent(lower(matches->0->>'bairro')) = ANY($2::text[])) DESC, RANDOM()
         LIMIT $3`,
        [cidades, bairros, limite]
      );
      rowsRegiao = rows;
    } catch (e) { rowsRegiao = []; }
  }

  let rowsResto = [];
  if (rowsRegiao.length < limite) {
    try {
      const idsJaUsados = rowsRegiao.map(r => r.nome + '|' + r.criado_em);
      const { rows } = await query(
        `${_BASE_SELECT_ATIVIDADE}
         ORDER BY RANDOM()
         LIMIT $1`,
        [limite * 2]
      );
      rowsResto = rows
        .filter(r => !idsJaUsados.includes(r.nome + '|' + r.criado_em))
        .slice(0, limite - rowsRegiao.length);
    } catch (e) { rowsResto = []; }
  }

  return [...rowsRegiao, ...rowsResto]
    .filter(r => r.bairro && r.foto)
    .map(r => ({
      Nome: _mascararNome(r.nome || ''),
      Telefone: _mascararTelefone(r.telefone || ''),
      Email: _mascararEmail(r.email || ''),
      ProcurandoTexto: _formatarTempoProcurando(r.criado_em),
      Tipo: r.tipo || 'Imóvel',
      Transacao: _normTransacao(r.transacao || '') || 'venda',
      Bairro: r.bairro, Cidade: r.cidade || '',
      Valor: r.valor || '', Quartos: r.quartos || '',
      Foto: r.foto
    }));
}

module.exports = { listarEstadosComLead, listarCidadesComLead, listarBairrosComLead, buscarDemanda, buscarDemandaParaEntrega, contarDisponiveis, listarAtividadeRecente, montarPerfilEMapaDemanda };
