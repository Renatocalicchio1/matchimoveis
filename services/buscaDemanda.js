// Ferramenta de demonstração: dado um recorte geográfico (estado + cidade +
// até 8 bairros) e transação (venda/aluguel/ambos), mostra quantos leads
// REAIS da plataforma (qualquer origem — portal, whatsapp, manual) bateram
// esse perfil nos últimos N dias. Usa o mesmo `mapaIntencao` que o motor de
// match de verdade usa (cerebro/motor-intencao.js) — não é uma tabela nova,
// é uma busca em cima do que a IA já vem calculando pra cada lead.
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
// (leads da plataforma + Interessados de Portal, últimos 30 dias — mesmo
// teto da própria busca) — lista de todo o Brasil só teria opção vazia na
// esmagadora maioria dos casos.
async function _coletarSinaisRecentes() {
  const { rows: leadsRows } = await query(
    `SELECT mapa_intencao, perfil_ia FROM leads WHERE criado_em >= NOW() - make_interval(days => 30)`
  );
  const sinaisLeads = leadsRows.map(r => {
    const mi = r.mapa_intencao || {};
    const pi = r.perfil_ia || {};
    return {
      estado: _valorMapa(mi, 'estado') || pi.estado || '',
      cidade: _valorMapa(mi, 'cidade') || pi.cidade || '',
      bairro: _valorMapa(mi, 'bairro') || pi.bairro || ''
    };
  });

  let sinaisPortal = [];
  try {
    const { rows: portalRows } = await query(
      `SELECT estado, cidade, bairro FROM interessados_portal WHERE COALESCE(data_lead, criado_em) >= NOW() - make_interval(days => 30)`
    );
    sinaisPortal = portalRows.map(r => ({ estado: r.estado || '', cidade: r.cidade || '', bairro: r.bairro || '' }));
  } catch (e) {} // tabela pode nem existir ainda

  return [...sinaisLeads, ...sinaisPortal];
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

// mapaIntencao guarda cada campo como array de sinais ({valor, confiança,
// score, origem}) — o [0] é o sinal mais forte (mesma leitura que
// cerebro/motor-intencao.js faz em matchPorMapa()).
function _valorMapa(mapa, campo) {
  try { return mapa && mapa[campo] && mapa[campo][0] ? mapa[campo][0].valor : undefined; } catch (e) { return undefined; }
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

// Além dos leads "de verdade" da plataforma (mapaIntencao), também busca na
// planilha acumulada de Interessados de Portal (services/interesadosPortal.js)
// — lá o bairro/cidade/transação já vêm em coluna própria (Bairro/Cidade/
// Estado/Transacao), sem depender do motor de match ter processado nada.
async function _buscarNosLeadsPlataforma(siglaAlvo, chavesAlvo, transacoesAlvo, horas) {
  const { rows } = await query(
    `SELECT id, nome, telefone, whatsapp, origem, status, temperatura, criado_em, mapa_intencao, perfil_ia, dados
     FROM leads WHERE criado_em >= NOW() - make_interval(hours => $1::int) ORDER BY criado_em DESC`,
    [horas]
  );
  const encontrados = [];
  for (const r of rows) {
    const mi = r.mapa_intencao || {};
    const pi = r.perfil_ia || {};
    const dd = r.dados || {};
    const estadoLead = _valorMapa(mi, 'estado') || pi.estado || '';
    const cidadeLead = _valorMapa(mi, 'cidade') || pi.cidade || '';
    const bairroLead = _valorMapa(mi, 'bairro') || pi.bairro || '';
    const transacaoLead = _normTransacao(_valorMapa(mi, 'transacao') || pi.intencao || pi.transacao || '');
    const tipoLead = _valorMapa(mi, 'tipo_imovel') || pi.tipo || '';
    const valorObj = _valorMapa(mi, 'valor');
    const valorMax = (valorObj && valorObj.max) || pi.valorMax || '';

    if (!estadoLead || _sigla(estadoLead) !== siglaAlvo) continue;
    if (!cidadeLead || !bairroLead) continue;
    if (!chavesAlvo.has(_norm(cidadeLead) + '|||' + _norm(bairroLead))) continue;
    if (!transacaoLead || !transacoesAlvo.has(transacaoLead)) continue;

    encontrados.push({
      id: 'lead-' + r.id, criadoEm: r.criado_em, fonte: 'leads_plataforma',
      Nome: r.nome || 'Sem nome', Telefone: r.telefone || r.whatsapp || '', Email: pi.email || dd.email || '',
      Origem: r.origem || '', Tipo: tipoLead, Transacao: transacaoLead, Condicao: '',
      Bairro: bairroLead, Cidade: cidadeLead, Estado: estadoLead,
      Quartos: _valorMapa(mi, 'quartos') || pi.quartos || '', Suites: _valorMapa(mi, 'suites') || pi.suites || '',
      Vagas: _valorMapa(mi, 'vagas') || pi.vagas || '', Banheiros: _valorMapa(mi, 'banheiros') || pi.banheiros || '',
      Area_max: _valorMapa(mi, 'area') || pi.area || '', Valor_max: valorMax
    });
  }
  return encontrados;
}

async function _buscarNosInteresadosPortal(siglaAlvo, chavesAlvo, transacoesAlvo, horas) {
  let rows;
  try {
    ({ rows } = await query(
      // COALESCE(data_lead, criado_em): data_lead é a data real do interessado
      // no portal (coluna "Data" da planilha) — usa criado_em (data do upload)
      // só como fallback pra linhas antigas onde a data não deu pra parsear.
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

    encontrados.push({
      id: 'interessado-' + r.id, criadoEm: r.data_lead || r.criado_em, fonte: 'interessados_portal',
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

// horas: janela de tempo em horas (dias escolhidos na tela × 24, máx. 30
// dias = 720h). Busca em 2 fontes: leads reais da plataforma (mapaIntencao)
// + planilha acumulada de Interessados de Portal.
// pares: [{cidade, bairro}] — sem limite de quantidade nem de quantas
// cidades diferentes; casa por par exato (evita, ex., "Centro" de uma
// cidade bater com "Centro" de outra quando o usuário só marcou uma delas).
async function buscarDemanda({ estado, pares = [], transacoes = [], horas = 168 }) {
  const siglaAlvo = _sigla(estado);
  const chavesAlvo = new Set(pares.map(p => _norm(p.cidade) + '|||' + _norm(p.bairro)).filter(k => k !== '|||'));
  const transacoesAlvo = new Set((transacoes.length ? transacoes : ['venda', 'aluguel']).map(_norm));

  const [doLeads, doPortal] = await Promise.all([
    _buscarNosLeadsPlataforma(siglaAlvo, chavesAlvo, transacoesAlvo, horas),
    _buscarNosInteresadosPortal(siglaAlvo, chavesAlvo, transacoesAlvo, horas)
  ]);
  return [...doLeads, ...doPortal]
    .sort((a, b) => (parseFloat(b.Valor_max) || 0) - (parseFloat(a.Valor_max) || 0))
    .map(l => ({ ...l, Nome: _mascararNome(l.Nome), Telefone: _mascararTelefone(l.Telefone), Email: _mascararEmail(l.Email) }));
}

module.exports = { listarEstadosComLead, listarCidadesComLead, listarBairrosComLead, buscarDemanda };
