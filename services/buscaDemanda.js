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

function _tituloCase(s) {
  return (s || '').toString().split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function listarEstados() {
  return _ESTADOS_BR.map(([sigla, nome]) => ({ sigla, nome }));
}

async function listarCidades(estado) {
  const sigla = _sigla(estado);
  if (!sigla) return [];
  const { rows } = await query(
    "SELECT DISTINCT cidade FROM localidades WHERE estado = $1 AND cidade IS NOT NULL AND cidade != '' ORDER BY cidade",
    [sigla]
  );
  return rows.map(r => _tituloCase(r.cidade));
}

async function listarBairros(estado, cidade) {
  const sigla = _sigla(estado);
  const cidadeNorm = _norm(cidade);
  if (!sigla || !cidadeNorm) return [];
  const { rows } = await query(
    "SELECT DISTINCT bairro FROM localidades WHERE estado = $1 AND cidade = $2 AND bairro IS NOT NULL AND bairro != '' ORDER BY bairro",
    [sigla, cidadeNorm]
  );
  return rows.map(r => _tituloCase(r.bairro));
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

// dias: janela de tempo — padrão 2 dias (radar de demanda recente/"quente",
// não é pra puxar o histórico inteiro de leads da plataforma).
async function buscarDemanda({ estado, cidade, bairros = [], transacoes = [], dias = 2 }) {
  const siglaAlvo = _sigla(estado);
  const cidadeAlvo = _norm(cidade);
  const bairrosAlvo = new Set(bairros.map(_norm).filter(Boolean));
  const transacoesAlvo = new Set((transacoes.length ? transacoes : ['venda', 'aluguel']).map(_norm));

  const { rows } = await query(
    `SELECT id, nome, telefone, whatsapp, origem, status, temperatura, criado_em, mapa_intencao, perfil_ia
     FROM leads WHERE criado_em >= NOW() - make_interval(days => $1::int) ORDER BY criado_em DESC`,
    [dias]
  );

  const encontrados = [];
  for (const r of rows) {
    const mi = r.mapa_intencao || {};
    const pi = r.perfil_ia || {};
    const estadoLead = _valorMapa(mi, 'estado') || pi.estado || '';
    const cidadeLead = _valorMapa(mi, 'cidade') || pi.cidade || '';
    const bairroLead = _valorMapa(mi, 'bairro') || pi.bairro || '';
    const transacaoLead = _normTransacao(_valorMapa(mi, 'transacao') || pi.intencao || pi.transacao || '');
    const tipoLead = _valorMapa(mi, 'tipo_imovel') || pi.tipo || '';
    const valorObj = _valorMapa(mi, 'valor');
    const valorMax = (valorObj && valorObj.max) || pi.valorMax || '';

    if (!estadoLead || _sigla(estadoLead) !== siglaAlvo) continue;
    if (!cidadeLead || _norm(cidadeLead) !== cidadeAlvo) continue;
    if (!bairroLead || !bairrosAlvo.has(_norm(bairroLead))) continue;
    if (!transacaoLead || !transacoesAlvo.has(transacaoLead)) continue;

    encontrados.push({
      id: r.id, nome: r.nome || 'Sem nome', telefone: r.telefone || r.whatsapp || '',
      origem: r.origem || '', status: r.status || '', temperatura: r.temperatura || '',
      criadoEm: r.criado_em, tipo: tipoLead, bairro: bairroLead, transacao: transacaoLead, valorMax
    });
  }
  return encontrados;
}

module.exports = { listarEstados, listarCidades, listarBairros, buscarDemanda };
