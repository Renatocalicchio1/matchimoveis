// Processa a planilha de "interessados" exportada do portal (ImovelWeb) —
// leads de anúncios de QUALQUER imobiliária no portal, não só da MatchImóveis.
// A Sucursal "Rankim" já entra automaticamente via /webhook/imovelweb-global,
// então é ignorada aqui. As demais linhas são distribuídas (até 3 por lead)
// pras contas de corretores da MatchImóveis que já atuam naquele bairro/cidade
// (têm imóvel cadastrado ali, do mesmo tipo/operação) — sem "área de atuação"
// própria ainda (isso vem depois, numa tela de cadastro dedicada).
const { query } = require('./db');
const { normalizarEstadoBR, normalizarCidadeBR, normalizarBairroBR, buscarBairroEmTexto } = require('./salvarImovel');

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

// Preço brasileiro sem vírgula ("R$ 240.000") não tem parte decimal — o ponto
// é só separador de milhar. Só existe parte decimal quando tem vírgula
// ("R$ 1.234,56"). A versão antiga assumia sempre vírgula presente pra decidir
// se o ponto era milhar, e sem vírgula tratava "240.000" como 240 (bug real).
function parsePreco(v) {
  let s = (v || '').toString().replace(/[^\d,.]/g, '');
  if (!s) return 0;
  s = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\./g, '');
  const f = parseFloat(s);
  return isFinite(f) ? f : 0;
}

// Título e mensagem do portal costumam trazer o que o anúncio "de verdade" tem
// (ex: "Apartamento 2 Quartos na Graça, Salvador-BA: 78m², 2 banheiros, 1
// vaga") mesmo quando as colunas estruturadas da planilha vêm em branco —
// varre esse texto livre atrás de quartos/suítes/banheiros/vagas/área.
function extrairAtributosTexto(texto) {
  const t = (texto || '').toString();
  const num = (re) => { const m = t.match(re); return m ? parseInt(m[1], 10) : ''; };
  const areaM = t.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
  return {
    quartos: num(/(\d+)\s*(?:quartos?|dorm[ií]t[óo]rios?)/i),
    suites: num(/(\d+)\s*su[íi]tes?/i),
    banheiros: num(/(\d+)\s*banheiros?/i),
    vagas: num(/(\d+)\s*vagas?/i),
    area: areaM ? parseFloat(areaM[1].replace(',', '.')) : ''
  };
}

function _lerPlanilha(filePath) {
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

// Mesmo tipo de comparação usada de verdade no motor de match (cerebro/
// motor-intencao.js: minúsculo + sem acento) — NUNCA comparar cidade/bairro
// por igualdade exata de string: cada corretor digitou/importou a
// localidade de um jeito (maiúscula, sem acento, espaço a mais etc), então
// um WHERE cidade=$1 exato só bate com quem por acaso já está no formato
// "canônico" — foi o bug real que fazia só 1 conta aparecer sempre.
function _norm(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Carrega TODOS os imóveis ativos uma vez só (reaproveitado por todas as
// linhas da planilha, em vez de 1 query por linha) e indexa por estado+cidade
// normalizados, pra cada linha só filtrar o balde certo em memória.
async function _carregarIndiceImoveis() {
  const { rows } = await query(
    `SELECT user_id, tipo, bairro, cidade, estado FROM imoveis WHERE status != 'inativo' AND user_id IS NOT NULL`
  );
  const indice = {};
  for (const r of rows) {
    const chave = _norm(r.estado) + '|' + _norm(r.cidade);
    if (!indice[chave]) indice[chave] = [];
    indice[chave].push({ userId: r.user_id, bairroNorm: _norm(r.bairro), categoria: categoriaDoImovelCadastrado(r.tipo) });
  }
  return indice;
}

// Pra cada linha, busca (no máx 3) corretores que já têm imóvel na mesma
// combinação bairro+categoria; se não achar 3 assim, completa com corretores
// que têm imóvel na cidade (mesmo estado); sem nenhum match, a linha fica de
// fora (nenhuma conta recebe).
function _buscarCorretoresCandidatos(indiceImoveis, estado, cidade, bairro, categoria) {
  const candidatosCidade = indiceImoveis[_norm(estado) + '|' + _norm(cidade)] || [];
  const bairroNorm = _norm(bairro);
  const contPorBairro = {};
  const contPorCidade = {};
  for (const im of candidatosCidade) {
    if (im.categoria !== categoria) continue;
    contPorCidade[im.userId] = (contPorCidade[im.userId] || 0) + 1;
    if (bairroNorm && im.bairroNorm === bairroNorm) contPorBairro[im.userId] = (contPorBairro[im.userId] || 0) + 1;
  }
  const porBairro = Object.entries(contPorBairro).sort((a, b) => b[1] - a[1]).map(([userId, total]) => ({ userId, total, nivel: 'bairro' }));
  const usadosSet = new Set(porBairro.map(c => c.userId));
  const porCidade = Object.entries(contPorCidade)
    .filter(([userId]) => !usadosSet.has(userId))
    .sort((a, b) => b[1] - a[1])
    .map(([userId, total]) => ({ userId, total, nivel: 'cidade' }));
  return [...porBairro, ...porCidade].slice(0, 3);
}

// opts.enriquecerLimite: quantas linhas (no máximo) tentam buscar dados
// direto no anúncio do portal (Playwright) além do título/mensagem — cada
// uma abre a página de verdade, é lento (alguns segundos por linha) e só
// funciona em ambiente que consiga baixar o Chromium do Playwright, por
// isso fica limitado e é opt-in (nunca roda sozinho, só quando pedido).
async function processarInteresados(filePath, opts = {}) {
  const enriquecerLimite = Math.min(opts.enriquecerLimite || 0, 30);
  const linhasBrutas = _lerPlanilha(filePath);
  const { rows: usuarios } = await query('SELECT codigo_usuario, id, nome FROM usuarios');
  const nomePorId = {};
  usuarios.forEach(u => { nomePorId[u.codigo_usuario] = u.nome; nomePorId[u.id] = u.nome; });
  const indiceImoveis = await _carregarIndiceImoveis();

  // Linhas válidas (fora Rankim) primeiro, pra poder decidir quais das
  // primeiras N vão ser enriquecidas e buscar todas EM PARALELO (com um
  // limite de páginas simultâneas) — sequencial (1 por vez, com retry)
  // deixava 10 linhas levarem minutos; em paralelo cai bastante.
  const linhasValidas = linhasBrutas.filter(l => !_chave(l['Sucursal'] || '').includes('rankim'));
  const CONCORRENCIA = 3;
  const extraidosPorIndice = new Map();
  if (enriquecerLimite > 0) {
    const { extrairDadosAnuncio } = require('./extratorPortal');
    const alvos = [];
    for (let i = 0; i < linhasValidas.length && alvos.length < enriquecerLimite; i++) {
      if (linhasValidas[i]['Url anúncio']) alvos.push(i);
    }
    let cursor = 0;
    async function worker() {
      while (cursor < alvos.length) {
        const idx = alvos[cursor++];
        const r = await extrairDadosAnuncio(linhasValidas[idx]['Url anúncio']);
        extraidosPorIndice.set(idx, r);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, alvos.length) }, worker));
  }

  const resultado = [];
  for (let i = 0; i < linhasValidas.length; i++) {
    const l = linhasValidas[i];
    const r = extraidosPorIndice.get(i);
    let extraido = null, extraidoErro = '', extraidoOk = false;
    if (r) {
      if (r.ok && r.fonte === 'avisoInfo') {
        extraido = r; extraidoOk = true;
      } else if (r.ok) {
        // página abriu mas não achou os dados estruturados (avisoInfo) —
        // ainda aproveita o texto da página pro fallback por regex, mas não
        // marca como "enriquecido com sucesso" (senão o ⚠️ vira 🔍 mentiroso)
        extraido = r;
        extraidoErro = r.bloqueado ? 'página bloqueou o acesso (anti-bot) — título: ' + (r.titulo || '?')
          : 'anúncio abriu mas sem dados estruturados (avisoInfo não encontrado) — título: ' + (r.titulo || '?');
      } else {
        extraidoErro = r.erro || 'falhou';
      }
    }

    const sucursal = l['Sucursal'] || '';
    const estado = normalizarEstadoBR((extraido && extraido.estado) || l['Estado'] || '');
    const cidade = normalizarCidadeBR(estado, (extraido && extraido.cidade) || l['Cidade'] || '');
    const textoLivre = [l['Título'], l['Mensagem'], extraido && extraido.textoPagina].filter(Boolean).join(' — ');
    // Bairro: prioriza o que o extrator achou na página real; senão a coluna
    // da planilha; senão tenta achar um bairro conhecido dentro do texto
    // (título/mensagem/página) — URL do ImovelWeb é só um id numérico, não ajuda.
    const bairroBruto = (extraido && extraido.bairro) || l['Bairro'] || '';
    const bairro = bairroBruto ? normalizarBairroBR(cidade, bairroBruto) : (cidade ? buscarBairroEmTexto(cidade, textoLivre) : '');
    const categoria = classificarCategoria((extraido && extraido.tipo) || l['Tipo de imóvel'] || '');
    const transacao = normalizarTransacao(l['Tipo de operação'] || '');
    const atributosTexto = extrairAtributosTexto(textoLivre);
    const atributos = {
      quartos: (extraido && extraido.quartos) || atributosTexto.quartos,
      suites: (extraido && extraido.suites) || atributosTexto.suites,
      banheiros: (extraido && extraido.banheiros) || atributosTexto.banheiros,
      vagas: (extraido && extraido.vagas) || atributosTexto.vagas,
      area: (extraido && extraido.area_m2) || atributosTexto.area
    };
    const valorExtraido = extraido && extraido.valor_imovel ? extraido.valor_imovel : 0;

    const candidatos = cidade ? _buscarCorretoresCandidatos(indiceImoveis, estado, cidade, bairro, categoria) : [];

    // Campos no mesmo formato/nome do modelo de importação de leads (GET
    // /app/modelo-leads.xlsx) — quartos/suítes/vagas/banheiros/área não vêm
    // como coluna própria do portal, então tenta extrair do título/mensagem
    // (ex: "Apartamento 2 Quartos na Graça: 78m², 2 banheiros, 1 vaga") ou,
    // quando pedido, direto da página do anúncio.
    resultado.push({
      Nome: l['Nome'] || '',
      Telefone: normalizarTelefone(l['Telefone'] || l['Telefone 2'] || ''),
      Email: l['E-mail usuário'] || '',
      Origem: 'portal_imovelweb',
      Tipo: (extraido && extraido.tipo) || l['Tipo de imóvel'] || '',
      Transacao: transacao === 'aluguel' ? 'aluguel' : 'compra',
      Condicao: '',
      Bairro: bairro, Cidade: cidade, Estado: estado,
      Quartos: atributos.quartos, Suites: atributos.suites, Vagas: atributos.vagas,
      Banheiros: atributos.banheiros, Area_max: atributos.area,
      Valor_max: valorExtraido || parsePreco(l['Preço']) || '',
      Observacoes: [l['Mensagem'], l['Título'], l['Url anúncio']].filter(Boolean).join(' | '),
      // campos extras (não fazem parte do modelo, mas são úteis pra revisar o match)
      categoria, sucursal, idAnuncio: l['Id anúncio'] || '', codigo: l['Código'] || '', data: l['Data'] || '',
      enriquecidoPeloPortal: extraidoOk, erroEnriquecimento: extraidoErro,
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
