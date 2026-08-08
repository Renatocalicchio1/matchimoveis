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
// minerada do portal (Interessados de Portal, últimos 30 dias — mesmo teto
// da própria busca) — lista de todo o Brasil só teria opção vazia na
// esmagadora maioria dos casos.
async function _coletarSinaisRecentes() {
  try {
    const { rows } = await query(
      `SELECT estado, cidade, bairro FROM interessados_portal WHERE COALESCE(data_lead, criado_em) >= NOW() - make_interval(days => 30)`
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

// Garante vendido_em/vendido_para sem depender de interesadosPortal.js já
// ter rodado sua própria migração (ela só roda quando alguém abre a tela de
// Interessados de Portal) — sem isso a query abaixo falha com "coluna não
// existe" logo após o deploy, o catch engole o erro e a busca fica sempre
// vazia mesmo com bairro selecionado direto da lista de quem tem demanda.
let _colunasVendaOk = false;
async function _garantirColunasVenda() {
  if (_colunasVendaOk) return;
  try {
    await query('ALTER TABLE interessados_portal ADD COLUMN IF NOT EXISTS vendido_em TIMESTAMP');
    await query('ALTER TABLE interessados_portal ADD COLUMN IF NOT EXISTS vendido_para TEXT');
    _colunasVendaOk = true;
  } catch (e) { /* tabela pode nem existir ainda — segue e deixa a query de baixo tratar */ }
}

// Única fonte: planilha acumulada de Interessados de Portal
// (services/interesadosPortal.js) — bairro/cidade/transação já vêm em
// coluna própria (Bairro/Cidade/Estado/Transacao).
async function _buscarNosInteresadosPortal(siglaAlvo, chavesAlvo, transacoesAlvo, horas) {
  await _garantirColunasVenda();
  let rows;
  try {
    ({ rows } = await query(
      // COALESCE(data_lead, criado_em): data_lead é a data real do interessado
      // no portal (coluna "Data" da planilha) — usa criado_em (data do upload)
      // só como fallback pra linhas antigas onde a data não deu pra parsear.
      // vendido_em IS NULL: some da busca (e não pode ser entregue de novo)
      // depois que já foi vendido pra algum comprador do combo em /demanda.
      `SELECT * FROM interessados_portal WHERE vendido_em IS NULL AND COALESCE(data_lead, criado_em) >= NOW() - make_interval(hours => $1::int) ORDER BY COALESCE(data_lead, criado_em) DESC`,
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

// horas: janela de tempo em horas (dias escolhidos na tela × 24, máx. 30
// dias = 720h). Fonte única: Interessados de Portal.
// pares: [{cidade, bairro}] — sem limite de quantidade nem de quantas
// cidades diferentes; casa por par exato (evita, ex., "Centro" de uma
// cidade bater com "Centro" de outra quando o usuário só marcou uma delas).
async function buscarDemanda({ estado, pares = [], transacoes = [], horas = 168 }) {
  const siglaAlvo = _sigla(estado);
  const chavesAlvo = new Set(pares.map(p => _norm(p.cidade) + '|||' + _norm(p.bairro)).filter(k => k !== '|||'));
  const transacoesAlvo = new Set((transacoes.length ? transacoes : ['venda', 'aluguel']).map(_norm));

  const encontrados = await _buscarNosInteresadosPortal(siglaAlvo, chavesAlvo, transacoesAlvo, horas);
  return encontrados
    .sort((a, b) => (parseFloat(b.Valor_max) || 0) - (parseFloat(a.Valor_max) || 0))
    .map(l => ({ ...l, Nome: _mascararNome(l.Nome), Telefone: _mascararTelefone(l.Telefone), Email: _mascararEmail(l.Email) }));
}

// Usado só internamente (webhook de pagamento) pra ENTREGAR de verdade —
// nome/telefone/email não mascarados, e limitado a `limite` (a quantidade
// do combo comprado). Mesmo critério/ordenação de buscarDemanda() (mais
// caro primeiro), pra entregar exatamente o que o comprador viu na tela.
async function buscarDemandaParaEntrega({ estado, pares = [], transacoes = [], horas = 168, limite = 0 }) {
  const siglaAlvo = _sigla(estado);
  const chavesAlvo = new Set(pares.map(p => _norm(p.cidade) + '|||' + _norm(p.bairro)).filter(k => k !== '|||'));
  const transacoesAlvo = new Set((transacoes.length ? transacoes : ['venda', 'aluguel']).map(_norm));

  const encontrados = await _buscarNosInteresadosPortal(siglaAlvo, chavesAlvo, transacoesAlvo, horas);
  encontrados.sort((a, b) => (parseFloat(b.Valor_max) || 0) - (parseFloat(a.Valor_max) || 0));
  return limite > 0 ? encontrados.slice(0, limite) : encontrados;
}

// Marca as linhas entregues como vendidas — some da busca pública e nunca
// mais é entregue de novo pra outro comprador.
async function marcarVendidos(rowIds, userId) {
  if (!rowIds || !rowIds.length) return;
  await _garantirColunasVenda();
  await query('UPDATE interessados_portal SET vendido_em = NOW(), vendido_para = $1 WHERE id = ANY($2)', [userId, rowIds]);
}

module.exports = { listarEstadosComLead, listarCidadesComLead, listarBairrosComLead, buscarDemanda, buscarDemandaParaEntrega, marcarVendidos };
