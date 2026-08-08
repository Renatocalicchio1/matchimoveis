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

// Coluna "Data" do export do ImovelWeb vem tipo "2026/08/08 00:30" — é a
// data/hora real em que o interessado apareceu no portal, não quando a
// gente subiu a planilha (isso pode ser dias depois). Usada pro filtro de
// "últimas 24h/3d/7d/30d" da busca de demanda bater com a data de verdade.
function _parseDataPortal(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, ano, mes, dia, hh, mm, ss] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hh || 0), Number(mm || 0), Number(ss || 0));
  return isNaN(d.getTime()) ? null : d;
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

// Campos que vêm de extração por texto (título/mensagem) e não de coluna
// própria do portal — usados só pra medir o quanto cada linha ficou completa,
// não têm relação com match/critério mínimo.
const _CAMPOS_COMPLETUDE = ['Bairro', 'Quartos', 'Suites', 'Banheiros', 'Vagas', 'Area_max', 'Valor_max'];
function _calcularCompletude(linha) {
  return _CAMPOS_COMPLETUDE.reduce((n, campo) => n + (linha[campo] ? 1 : 0), 0);
}

// Armazenamento persistente: a tela fica acumulando o que já foi lido —
// planilhas novas são "mineradas" diariamente e só o que for REALMENTE novo
// entra. Dedup NÃO é por nome/telefone (a mesma pessoa pode se interessar
// por 2 imóveis diferentes = 2 leads de verdade) — é por TODAS as colunas
// da linha: só descarta se vier uma linha idêntica em tudo à que já existe.
const _CAMPOS_DEDUP = ['Nome', 'Telefone', 'Email', 'Origem', 'Tipo', 'Transacao', 'Condicao', 'Bairro', 'Cidade', 'Estado', 'Quartos', 'Suites', 'Vagas', 'Banheiros', 'Area_max', 'Valor_max', 'Observacoes'];
function _chaveDedup(linha) {
  return _CAMPOS_DEDUP.map(c => _chave(String(linha[c] == null ? '' : linha[c]))).join('|~|');
}

async function _garantirTabelaInteresados() {
  await query(`CREATE TABLE IF NOT EXISTS interessados_portal (
    id SERIAL PRIMARY KEY,
    chave_dedup TEXT UNIQUE NOT NULL,
    nome TEXT, telefone TEXT, email TEXT, origem TEXT, tipo TEXT, transacao TEXT, condicao TEXT,
    bairro TEXT, cidade TEXT, estado TEXT,
    quartos INT, suites INT, vagas INT, banheiros INT, area_max NUMERIC, valor_max NUMERIC,
    observacoes TEXT,
    categoria TEXT, sucursal TEXT, id_anuncio TEXT, codigo TEXT, data_original TEXT, data_lead TIMESTAMP,
    completude INT, completude_total INT,
    corretores JSONB,
    importado_em TIMESTAMP,
    criado_em TIMESTAMP DEFAULT NOW()
  )`);
  // data_lead foi adicionada depois — tabela já existe em produção sem essa coluna
  await query('ALTER TABLE interessados_portal ADD COLUMN IF NOT EXISTS data_lead TIMESTAMP').catch(() => {});
  // vendido_em/vendido_para — marca quando um interessado foi entregue pra
  // conta de quem comprou um combo em /demanda, pra nunca vender a mesma
  // lead pra 2 compradores diferentes (some da busca pública depois de vendida).
  await query('ALTER TABLE interessados_portal ADD COLUMN IF NOT EXISTS vendido_em TIMESTAMP').catch(() => {});
  await query('ALTER TABLE interessados_portal ADD COLUMN IF NOT EXISTS vendido_para TEXT').catch(() => {});
}

function _linhaParaRowDB(l) {
  return [
    _chaveDedup(l), l.Nome || '', l.Telefone || '', l.Email || '', l.Origem || '', l.Tipo || '', l.Transacao || '', l.Condicao || '',
    l.Bairro || '', l.Cidade || '', l.Estado || '',
    l.Quartos || null, l.Suites || null, l.Vagas || null, l.Banheiros || null, l.Area_max || null, l.Valor_max || null,
    l.Observacoes || '',
    l.categoria || '', l.sucursal || '', l.idAnuncio || '', l.codigo || '', l.data || '', l.dataLead || null,
    l.Completude || 0, l.CompletudeTotal || _CAMPOS_COMPLETUDE.length,
    JSON.stringify(l.corretores || [])
  ];
}

function _rowDBParaLinha(r) {
  return {
    id: r.id,
    Nome: r.nome, Telefone: r.telefone, Email: r.email, Origem: r.origem, Tipo: r.tipo, Transacao: r.transacao, Condicao: r.condicao,
    Bairro: r.bairro, Cidade: r.cidade, Estado: r.estado,
    Quartos: r.quartos || '', Suites: r.suites || '', Vagas: r.vagas || '', Banheiros: r.banheiros || '', Area_max: r.area_max || '', Valor_max: r.valor_max || '',
    Observacoes: r.observacoes,
    categoria: r.categoria, sucursal: r.sucursal, idAnuncio: r.id_anuncio, codigo: r.codigo, data: r.data_original,
    dataLead: r.data_lead, criadoEm: r.criado_em,
    Completude: r.completude, CompletudeTotal: r.completude_total,
    corretores: r.corretores || [],
    importado: !!r.importado_em
  };
}

// Insere só as linhas que ainda não existem (chave_dedup = todas as
// colunas da linha) — ON CONFLICT DO NOTHING resolve isso atomicamente,
// sem precisar comparar linha a linha em JS antes.
async function _salvarLinhasNovas(linhas) {
  await _garantirTabelaInteresados();
  let novas = 0, duplicadas = 0;
  for (const l of linhas) {
    const vals = _linhaParaRowDB(l);
    const r = await query(
      `INSERT INTO interessados_portal
        (chave_dedup, nome, telefone, email, origem, tipo, transacao, condicao, bairro, cidade, estado,
         quartos, suites, vagas, banheiros, area_max, valor_max, observacoes,
         categoria, sucursal, id_anuncio, codigo, data_original, data_lead, completude, completude_total, corretores)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
       ON CONFLICT (chave_dedup) DO NOTHING RETURNING id`,
      vals
    );
    if (r.rows.length) novas++; else duplicadas++;
  }
  return { novas, duplicadas };
}

async function listarLinhasSalvas() {
  await _garantirTabelaInteresados();
  const { rows } = await query('SELECT * FROM interessados_portal ORDER BY completude DESC, id DESC');
  return rows.map(_rowDBParaLinha);
}

// Processa 1 upload + salva no acumulado (dedup) + devolve a TELA inteira
// já acumulada (todas as leituras anteriores + o que entrou de novo agora).
async function processarEArmazenar(filePath) {
  const processadas = await processarInteresados(filePath);
  const { novas, duplicadas } = await _salvarLinhasNovas(processadas);
  const linhas = await listarLinhasSalvas();
  return { novas, duplicadas, linhasNestaLeitura: processadas.length, linhas };
}

// Nunca depende de abrir o link do anúncio (o portal usa Cloudflare pra
// bloquear acesso automatizado — confirmado, não dá pra contornar de forma
// confiável/legítima) — todo o preenchimento vem só do que a própria
// planilha traz (colunas + regex em cima do título/mensagem).
async function processarInteresados(filePath) {
  const linhasBrutas = _lerPlanilha(filePath);
  const { rows: usuarios } = await query('SELECT codigo_usuario, id, nome FROM usuarios');
  const nomePorId = {};
  usuarios.forEach(u => { nomePorId[u.codigo_usuario] = u.nome; nomePorId[u.id] = u.nome; });
  const indiceImoveis = await _carregarIndiceImoveis();

  const linhasValidas = linhasBrutas.filter(l => !_chave(l['Sucursal'] || '').includes('rankim'));

  const resultado = [];
  for (const l of linhasValidas) {
    const sucursal = l['Sucursal'] || '';
    const estado = normalizarEstadoBR(l['Estado'] || '');
    const cidade = normalizarCidadeBR(estado, l['Cidade'] || '');
    const textoLivre = [l['Título'], l['Mensagem']].filter(Boolean).join(' — ');
    // Bairro: coluna da planilha; senão tenta achar um bairro conhecido
    // dentro do texto (título/mensagem) — URL do ImovelWeb é só um id
    // numérico, não ajuda, e abrir a página é bloqueado pelo Cloudflare.
    // Quando a coluna "Bairro" vem igual à "Cidade" (ex: as duas "Praia
    // Grande") é sinal de dado inválido/duplicado do portal, não um bairro
    // real chamado igual à cidade — trata como se não tivesse vindo e cai
    // pro texto, que costuma ter o bairro certo (ex: "...- Aviação, Praia
    // Grande" no título).
    const bairroBrutoPlanilha = l['Bairro'] || '';
    const bairroBrutoValido = bairroBrutoPlanilha && _chave(bairroBrutoPlanilha) !== _chave(cidade);
    const bairro = bairroBrutoValido ? normalizarBairroBR(cidade, bairroBrutoPlanilha) : (cidade ? buscarBairroEmTexto(cidade, textoLivre) : '');
    const categoria = classificarCategoria(l['Tipo de imóvel'] || '');
    const transacao = normalizarTransacao(l['Tipo de operação'] || '');
    const atributosTexto = extrairAtributosTexto(textoLivre);

    const candidatos = cidade ? _buscarCorretoresCandidatos(indiceImoveis, estado, cidade, bairro, categoria) : [];

    // Campos no mesmo formato/nome do modelo de importação de leads (GET
    // /app/modelo-leads.xlsx) — quartos/suítes/vagas/banheiros/área não vêm
    // como coluna própria do portal, então tenta extrair do título/mensagem
    // (ex: "Apartamento 2 Quartos na Graça: 78m², 2 banheiros, 1 vaga").
    const linha = {
      Nome: l['Nome'] || '',
      Telefone: normalizarTelefone(l['Telefone'] || l['Telefone 2'] || ''),
      Email: l['E-mail usuário'] || '',
      Origem: 'portal_imovelweb',
      Tipo: l['Tipo de imóvel'] || '',
      Transacao: transacao === 'aluguel' ? 'aluguel' : 'compra',
      Condicao: '',
      Bairro: bairro, Cidade: cidade, Estado: estado,
      Quartos: atributosTexto.quartos, Suites: atributosTexto.suites, Vagas: atributosTexto.vagas,
      Banheiros: atributosTexto.banheiros, Area_max: atributosTexto.area,
      Valor_max: parsePreco(l['Preço']) || '',
      Observacoes: [l['Mensagem'], l['Título'], l['Url anúncio']].filter(Boolean).join(' | '),
      // campos extras (não fazem parte do modelo, mas são úteis pra revisar o match)
      categoria, sucursal, idAnuncio: l['Id anúncio'] || '', codigo: l['Código'] || '', data: l['Data'] || '',
      dataLead: _parseDataPortal(l['Data']),
      corretores: candidatos.map(c => ({ userId: c.userId, nome: nomePorId[c.userId] || c.userId, totalImoveis: c.total, nivel: c.nivel }))
    };
    linha.Completude = _calcularCompletude(linha);
    linha.CompletudeTotal = _CAMPOS_COMPLETUDE.length;
    resultado.push(linha);
  }
  // Mais completas primeiro
  resultado.sort((a, b) => b.Completude - a.Completude);
  return resultado;
}

// Distribui as linhas acumuladas (de todas as leituras já feitas) que AINDA
// não foram importadas — importado_em marca o que já virou lead, pra rodar
// de novo depois (com mais planilhas somadas) nunca duplicar quem já foi.
async function importarInteresados() {
  const { salvarLead } = require('./salvarLead');
  await _garantirTabelaInteresados();
  const { rows } = await query(
    `SELECT * FROM interessados_portal WHERE importado_em IS NULL AND jsonb_array_length(COALESCE(corretores, '[]'::jsonb)) > 0`
  );
  const pendentes = rows.map(_rowDBParaLinha);
  let leadsGerenciadas = 0;
  const idsImportados = [];

  for (const p of pendentes) {
    let algumSalvo = false;
    for (const c of p.corretores) {
      const idLead = 'INT-' + (p.idAnuncio || p.id) + '-' + c.userId;
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
        leadsGerenciadas++; algumSalvo = true;
      } catch (e) { console.error('[interesadosPortal] erro ao salvar lead', idLead, e.message); }
    }
    if (algumSalvo) idsImportados.push(p.id);
  }
  if (idsImportados.length) {
    await query('UPDATE interessados_portal SET importado_em = NOW() WHERE id = ANY($1)', [idsImportados]);
  }
  const linhasSemMatch = (await query(
    `SELECT COUNT(*)::int AS n FROM interessados_portal WHERE importado_em IS NULL AND jsonb_array_length(COALESCE(corretores, '[]'::jsonb)) = 0`
  )).rows[0].n;
  return { linhasDistribuidas: idsImportados.length, leadsGerenciadas, linhasSemMatch };
}

// Apaga tudo que já foi acumulado — usado antes de recomeçar do zero com
// uma planilha nova (senão o dedup por linha idêntica trataria os dados
// antigos como já vistos e a tela ficaria misturando leitura velha com nova).
async function limparTudo() {
  await _garantirTabelaInteresados();
  const r = await query('DELETE FROM interessados_portal');
  return { apagadas: r.rowCount || 0 };
}

module.exports = { processarInteresados, processarEArmazenar, listarLinhasSalvas, importarInteresados, limparTudo, classificarCategoria, normalizarTransacao };
