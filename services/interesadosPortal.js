// Processa a planilha de "interessados" exportada do portal (ImovelWeb) —
// leads de anúncios de QUALQUER imobiliária no portal, não só da MatchImóveis.
// A Sucursal "Rankim" já entra automaticamente via /webhook/imovelweb-global,
// então é ignorada aqui. As demais linhas são distribuídas (até 3 por lead)
// pras contas de corretores da MatchImóveis que já atuam naquele bairro/cidade
// (têm imóvel cadastrado ali, do mesmo tipo/operação) — sem "área de atuação"
// própria ainda (isso vem depois, numa tela de cadastro dedicada).
const { query } = require('./db');
const { normalizarEstadoBR, normalizarCidadeBR, normalizarBairroBR } = require('./salvarImovel');

function _chave(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const _TIPOS_RESIDENCIAL = ['apartamento','casa','cobertura','sobrado','loft','studio','flat','kitnet','conjugado','duplex','triplex','mansao','chacara','sitio','fazenda','ph','penthouse'];
const _TIPOS_COMERCIAL = ['sala comercial','sala','loja','conjunto comercial','galpao','deposito','predio comercial','hotel','pousada','consultorio','restaurante','ponto comercial','escritorio','barracao','comercial'];
const _TIPOS_TERRENO = ['terreno','lote','area rural','gleba'];

function classificarCategoria(tipoBruto) {
  const t = _chave(tipoBruto);
  if (_TIPOS_TERRENO.some(k => t.includes(k))) return 'terreno';
  if (_TIPOS_COMERCIAL.some(k => t.includes(k))) return 'comercial';
  return 'residencial';
}

// Listas canônicas (mesmo dropdown de views/app-cadastro.ejs) usadas pra
// classificar o `tipo` já cadastrado nos imóveis dos corretores.
const _CATEGORIA_POR_TIPO_CANONICO = {
  apartamento: 'residencial', casa: 'residencial', cobertura: 'residencial', sobrado: 'residencial',
  loft: 'residencial', studio: 'residencial', kitnet: 'residencial', duplex: 'residencial',
  'mansao': 'residencial', chacara: 'residencial', sitio: 'residencial', fazenda: 'residencial',
  'casa de condominio': 'residencial', flat: 'residencial',
  'sala comercial': 'comercial', loja: 'comercial', 'conjunto comercial': 'comercial',
  'galpao / deposito': 'comercial', 'galpao': 'comercial', 'predio comercial': 'comercial',
  'hotel / pousada': 'comercial', hotel: 'comercial', consultorio: 'comercial', restaurante: 'comercial',
  'terreno / lote': 'terreno', terreno: 'terreno', 'terreno comercial': 'terreno', 'area rural': 'terreno'
};
function categoriaDoImovelCadastrado(tipoImovel) {
  return _CATEGORIA_POR_TIPO_CANONICO[_chave(tipoImovel)] || classificarCategoria(tipoImovel);
}

function normalizarTransacao(tipoOperacao) {
  const t = _chave(tipoOperacao);
  if (t.includes('alug') || t.includes('locac') || t.includes('renta')) return 'aluguel';
  if (t.includes('tempor')) return 'temporada';
  if (t.includes('permut')) return 'permuta';
  return 'venda';
}

function normalizarTelefone(v) {
  let d = (v || '').toString().replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d;
}

function parsePreco(v) {
  const n = (v || '').toString().replace(/[^\d,.]/g, '').replace(/\.(?=\d{3},)/g, '').replace(',', '.');
  const f = parseFloat(n);
  return isFinite(f) ? f : 0;
}

function _lerPlanilha(filePath) {
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

// Pra cada linha, busca (no máx 3) corretores que já têm imóvel na mesma
// combinação bairro+categoria+transação; se não achar 3 assim, completa com
// corretores que têm imóvel na cidade (mesmo estado); sem nenhum match, a
// linha fica de fora (nenhuma conta recebe).
async function _buscarCorretoresCandidatos(estado, cidade, bairro, categoria, transacao) {
  const { rows } = await query(
    `SELECT user_id, tipo, bairro, cidade FROM imoveis
     WHERE estado = $1 AND cidade = $2 AND status != 'inativo' AND user_id IS NOT NULL`,
    [estado, cidade]
  );
  const contPorBairro = {};
  const contPorCidade = {};
  for (const r of rows) {
    if (categoriaDoImovelCadastrado(r.tipo) !== categoria) continue;
    contPorCidade[r.user_id] = (contPorCidade[r.user_id] || 0) + 1;
    if (bairro && r.bairro === bairro) contPorBairro[r.user_id] = (contPorBairro[r.user_id] || 0) + 1;
  }
  const porBairro = Object.entries(contPorBairro).sort((a, b) => b[1] - a[1]).map(([userId, total]) => ({ userId, total, nivel: 'bairro' }));
  const usadosSet = new Set(porBairro.map(c => c.userId));
  const porCidade = Object.entries(contPorCidade)
    .filter(([userId]) => !usadosSet.has(userId))
    .sort((a, b) => b[1] - a[1])
    .map(([userId, total]) => ({ userId, total, nivel: 'cidade' }));
  return [...porBairro, ...porCidade].slice(0, 3);
}

async function processarInteresados(filePath) {
  const linhasBrutas = _lerPlanilha(filePath);
  const { rows: usuarios } = await query('SELECT codigo_usuario, id, nome FROM usuarios');
  const nomePorId = {};
  usuarios.forEach(u => { nomePorId[u.codigo_usuario] = u.nome; nomePorId[u.id] = u.nome; });

  const resultado = [];
  for (const l of linhasBrutas) {
    const sucursal = l['Sucursal'] || '';
    if (_chave(sucursal).includes('rankim')) continue; // já entra pelo webhook global

    const estado = normalizarEstadoBR(l['Estado'] || '');
    const cidade = normalizarCidadeBR(estado, l['Cidade'] || '');
    const bairro = l['Bairro'] ? normalizarBairroBR(cidade, l['Bairro']) : '';
    const categoria = classificarCategoria(l['Tipo de imóvel'] || '');
    const transacao = normalizarTransacao(l['Tipo de operação'] || '');

    let candidatos = [];
    if (cidade) {
      candidatos = await _buscarCorretoresCandidatos(estado, cidade, bairro, categoria, transacao);
    }

    // Campos no mesmo formato/nome do modelo de importação de leads
    // (GET /app/modelo-leads.xlsx) — o portal não manda quartos/suítes/vagas/
    // banheiros/área (isso é preferência do comprador, o anúncio não informa),
    // ficam em branco de propósito.
    resultado.push({
      Nome: l['Nome'] || '',
      Telefone: normalizarTelefone(l['Telefone'] || l['Telefone 2'] || ''),
      Email: l['E-mail usuário'] || '',
      Origem: 'portal_imovelweb',
      Tipo: l['Tipo de imóvel'] || '',
      Transacao: transacao === 'aluguel' ? 'aluguel' : 'compra',
      Condicao: '',
      Bairro: bairro, Cidade: cidade, Estado: estado,
      Quartos: '', Suites: '', Vagas: '', Banheiros: '', Area_max: '',
      Valor_max: parsePreco(l['Preço']) || '',
      Observacoes: [l['Mensagem'], l['Título'], l['Url anúncio']].filter(Boolean).join(' | '),
      // campos extras (não fazem parte do modelo, mas são úteis pra revisar o match)
      categoria, sucursal, idAnuncio: l['Id anúncio'] || '', codigo: l['Código'] || '', data: l['Data'] || '',
      corretores: candidatos.map(c => ({ userId: c.userId, nome: nomePorId[c.userId] || c.userId, totalImoveis: c.total, nivel: c.nivel }))
    });
  }
  return resultado;
}

async function importarInteresados(filePath) {
  const { salvarLead } = require('./salvarLead');
  const processadas = await processarInteresados(filePath);
  let leadsGerenciadas = 0, linhasSemMatch = 0, linhasIgnoradasRankim = 0;
  const totalLinhasArquivo = _lerPlanilha(filePath).length;

  for (const p of processadas) {
    if (!p.corretores.length) { linhasSemMatch++; continue; }
    for (const c of p.corretores) {
      const idLead = 'INT-' + (p.idAnuncio || Date.now()) + '-' + c.userId;
      try {
        await salvarLead({
          id: idLead,
          nome: p.Nome || 'Interessado',
          telefone: p.Telefone, whatsapp: p.Telefone, email: p.Email,
          user_id: c.userId, userId: c.userId, codigoUsuario: c.userId,
          origem: 'interesados_portal', status: 'novo', faseFunil: 'novo', fase_funil: 'novo',
          perfilIA: {
            tipo: p.Tipo || '',
            intencao: p.Transacao === 'aluguel' ? 'alugar' : 'comprar',
            cidade: p.Cidade, estado: p.Estado, bairro: p.Bairro,
            valorMax: p.Valor_max || undefined
          },
          dados: {
            interesadosObservacoes: p.Observacoes, interesadosSucursalOriginal: p.sucursal,
            interesadosDataOriginal: p.data, interesadosCodigoAnuncio: p.codigo
          },
          _lote: true
        });
        leadsGerenciadas++;
      } catch (e) { console.error('[interesadosPortal] erro ao salvar lead', idLead, e.message); }
    }
  }
  linhasIgnoradasRankim = totalLinhasArquivo - processadas.length;
  return { totalLinhasArquivo, linhasProcessadas: processadas.length, linhasIgnoradasRankim, linhasSemMatch, leadsGerenciadas };
}

module.exports = { processarInteresados, importarInteresados, classificarCategoria, normalizarTransacao };
