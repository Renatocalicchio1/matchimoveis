const XLSX = require('xlsx');
function semAcento(s){
  if(!s) return s;
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}

const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { salvarTodosLeads } = require('./services/salvarLead');
const { query: _q } = require('./services/db');

const filePath = process.argv[2];
const userId = process.argv[3] || '';

if (!filePath) { console.error('Arquivo não informado'); process.exit(1); }

const TIPOS_COMERCIAIS = ['sala','loja','galpao','galpão','escritorio','escritório','comercial','ponto comercial','industria','indústria','terreno comercial','predio','prédio','pavilhao','pavilhão'];

function isComercial(tipo) {
  if (!tipo) return false;
  return TIPOS_COMERCIAIS.some(t => tipo.toLowerCase().includes(t));
}

function normalizarTransacao(t) {
  if (!t) return '';
  const v = t.toLowerCase().trim();
  if (v === 'venda' || v === 'compra' || v === 'comprar') return 'comprar';
  if (v === 'aluguel' || v === 'alugar' || v === 'locacao' || v === 'locação') return 'alugar';
  return v;
}

function normalizarTelefone(tel) {
  if (!tel) return '';
  let t = String(tel).replace(/\D/g, '');
  // Se já tem 55 no início, mantém
  if (t.startsWith('55') && t.length >= 12) return t;
  // Se não tem, adiciona
  if (t.length === 10 || t.length === 11) return '55' + t;
  return t;
}

// Preenche quartos ausente (campo obrigatório pro perfil virar "suficiente"
// e gerar match — ver _perfilSuficiente em cerebro/match-core.js) usando
// outras leads já conhecidas na mesma região (bairro, com fallback pra
// cidade) e com valor parecido (±20%, mesma tolerância do motor de match).
// Critério: moda de quartos entre as candidatas na faixa; empate desempata
// pela mais próxima em valor. Ex: lead de R$350.000 com 2 quartos existente
// "empresta" o número de quartos pra uma lead de R$300-350k sem quartos.
function _inferirQuartos(lead, pool) {
  const valor = Number(lead.valorMax) || 0;
  if (!valor) return null;
  const bairro = semAcento(lead.bairro || '').toLowerCase();
  const cidade = semAcento(lead.cidade || '').toLowerCase();
  const min = valor * 0.8, max = valor * 1.2;

  const candidatosBairro = pool.filter(p => p.bairro === bairro && p.cidade === cidade && p.valor >= min && p.valor <= max);
  const candidatos = candidatosBairro.length ? candidatosBairro : pool.filter(p => p.cidade === cidade && p.valor >= min && p.valor <= max);
  if (!candidatos.length) return null;

  const contagem = {};
  candidatos.forEach(c => { contagem[c.quartos] = (contagem[c.quartos] || 0) + 1; });
  const maxContagem = Math.max(...Object.values(contagem));
  const empatados = candidatos.filter(c => contagem[c.quartos] === maxContagem);
  empatados.sort((a, b) => Math.abs(a.valor - valor) - Math.abs(b.valor - valor));
  return empatados[0].quartos;
}

function _limparValor(v) {
  if (!v) return 0;
  let s = String(v).trim();
  // Remove símbolos: R$, espaços, etc
  s = s.replace(/[R$s]/g, '');
  // Formato brasileiro: 540.000,00 → remove pontos de milhar, troca vírgula por ponto
  if (s.includes(',')) {
    s = s.replace(/./g, '').replace(',', '.');
  } else {
    // Formato 540.000 (ponto como milhar sem vírgula) → remove ponto
    if ((s.match(/./g)||[]).length === 1 && s.indexOf('.') === s.length - 4) {
      s = s.replace('.', '');
    }
  }
  return parseFloat(s) || 0;
}

async function run() {
  try {
    const wb = XLSX.readFile(filePath, { codepage: 65001 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    // Buscar leads existentes do usuário
    const res = await _q('SELECT dados FROM leads WHERE user_id = $1 OR codigo_usuario = $1', [userId]);
    const existentes = res.rows.map(r => r.dados);

    const novas = [];
    for (const row of rows) {
      const nome = row.Nome || row.nome || '';
      const telRaw = row.Telefone || row.telefone || row.Celular || row.celular || '';
      const telefone = normalizarTelefone(telRaw);

      if (!nome && !telefone) continue;

      // Evitar duplicata por telefone
      const jaExiste = existentes.find(l => normalizarTelefone(l.telefone) === telefone || normalizarTelefone(l.contato) === telefone);
      if (jaExiste) continue;

      const lead = {
        id: uuidv4(),
        _lote: true, // suprime o email individual "Nova lead recebida" — importação em lote já dispara o email de resumo
        nome: nome.trim(),
        telefone,
        contato: telefone,
        email: row.Email || row.email || '',
        origem: row.Origem || row.origem || 'importacao',
        status: 'novo',
        faseFunil: 'novo',
        temperatura: 'frio',
        score: 0,
        userId,
        codigoUsuario: userId,
        tipoLead: 'cliente',
        tipo: row.Tipo || row.tipo || '',
        tipo_operacao: row.Transacao || row.transacao || '',
        bairro: semAcento(row.Bairro || row.bairro || ''),
        cidade: semAcento(row.Cidade || row.cidade || ''),
        estado: semAcento(row.Estado || row.estado || ''),
        quartos: isComercial(row.Tipo || row.tipo) ? '' : (row.Quartos || row.quartos || ''),
        suites: isComercial(row.Tipo || row.tipo) ? '' : (row.Suites || row.suites || ''),
        vagas: isComercial(row.Tipo || row.tipo) ? '' : (row.Vagas || row.vagas || ''),
        banheiros: isComercial(row.Tipo || row.tipo) ? '' : (row.Banheiros || row.banheiros || ''),
        area_min: row.Area_min || row.area_min || '',
        area_max: row.Area_max || row.area_max || '',
        valorMin: _limparValor(row.Valor_min || row.valor_min || row['Valor_min (R$)'] || row['Valor min (R$)'] || 0),
        valorMax: _limparValor(row.Valor_max || row.valor_max || row['Valor (R$)'] || row['Valor_(R$)'] || row['Valor_max (R$)'] || row['Valor max (R$)'] || 0),
        observacoes: row.Observacoes || row.observacoes || '',
        segmento: isComercial(row.Tipo || row.tipo) ? 'comercial' : 'residencial',
        perfilIA: {
          tipo: row.Tipo || row.tipo || '',
          intencao: normalizarTransacao(row.Transacao || row.transacao || row['Transação'] || ''),
          bairro: semAcento(row.Bairro || row.bairro || ''),
          cidade: semAcento(row.Cidade || row.cidade || ''),
          estado: semAcento(row.Estado || row.estado || ''),
          quartos: isComercial(row.Tipo || row.tipo) ? '' : (row.Quartos || row.quartos || ''),
          suites: isComercial(row.Tipo || row.tipo) ? '' : (row.Suites || row.suites || row['Suítes'] || ''),
          vagas: isComercial(row.Tipo || row.tipo) ? '' : (row.Vagas || row.vagas || ''),
          banheiros: isComercial(row.Tipo || row.tipo) ? '' : (row.Banheiros || row.banheiros || ''),
          areaMin: row.Area_min || row.area_min || '',
          areaMax: row.Area_max || row.area_max || '',
          valorMax: _limparValor(row.Valor_max || row.valor_max || row['Valor_(R$)'] || row['Valor (R$)']),
          valorMin: _limparValor(row.Valor_min || row.valor_min),
          segmento: isComercial(row.Tipo || row.tipo) ? 'comercial' : 'residencial',
        },
        mensagens: [],
        matches: [],
        matchesAuto: [],
        matchesBase: [],
        historico: [],
        timeline: [],
        criadoEm: new Date().toISOString(),
        data_cadastro: new Date().toISOString(),
      };
      novas.push(lead);
    }

    // Preenche quartos ausente usando outras leads (já existentes + as que
    // acabaram de ser montadas nessa mesma planilha) que tenham quartos +
    // valor na mesma região — ver _inferirQuartos() acima.
    const _poolQuartos = [...existentes, ...novas]
      .filter(l => l.quartos && !isComercial(l.tipo) && Number(l.valorMax) > 0)
      .map(l => ({ bairro: semAcento(l.bairro || '').toLowerCase(), cidade: semAcento(l.cidade || '').toLowerCase(), valor: Number(l.valorMax), quartos: parseInt(l.quartos, 10) }))
      .filter(l => l.quartos > 0);

    for (const lead of novas) {
      if (lead.quartos || isComercial(lead.tipo) || !lead.valorMax) continue;
      const inferido = _inferirQuartos(lead, _poolQuartos);
      if (inferido) {
        lead.quartos = String(inferido);
        lead.perfilIA.quartos = String(inferido);
        lead.perfilIA.quartosInferido = true;
        console.log(`[import-quartos] inferido ${inferido} quartos pra "${lead.nome}" (${lead.bairro}, R$${lead.valorMax})`);
      }
    }

    for (const lead of novas) {
      // Setar status correto baseado no perfilIA
      const _p = lead.perfilIA || {};
      const _suficiente = _p.tipo && _p.intencao && _p.cidade && _p.bairro && _p.valorMax && _p.quartos;
      if (_suficiente) {
        lead.status = 'qualificando';
        lead.faseFunil = 'qualificando';
        lead.temperatura = 'morno';
        lead.score = 30;
        lead.scoreEtapa = 'Qualificado';
        lead.mapaIntencao = {
          fase: 'qualificando',
          temperatura: 'morno',
          tipo_imovel: _p.tipo ? [{ valor: _p.tipo, peso: 1 }] : [],
          transacao: _p.intencao ? [{ valor: _p.intencao, peso: 1 }] : [],
          bairro: _p.bairro ? [{ valor: _p.bairro, peso: 1 }] : [],
          cidade: _p.cidade ? [{ valor: _p.cidade, peso: 1 }] : [],
          estado: _p.estado ? [{ valor: _p.estado, peso: 1 }] : [],
          quartos: _p.quartos ? [{ valor: _p.quartos, peso: 1 }] : [],
          valor: _p.valorMax ? [{ valor: _p.valorMax, max: _p.valorMax, peso: 1 }] : [],
        };
      }
    }

    if (novas.length === 0) {
      console.log('Nenhuma lead nova para importar.');
      process.exit(0);
    }

    const todas = [...existentes, ...novas];
    await salvarTodosLeads(todas);
    console.log(`✅ ${novas.length} leads importadas com sucesso.`);

    // Consumir coins por lead importada — uma entrada só no histórico pro lote inteiro
    try {
      const { consumirLote } = require('./services/creditos');
      if (novas.length > 0) await consumirLote(userId, 'importar_lead', novas.length);
    } catch(e) {}

    // Rodar match para leads novas com perfil suficiente
    try {
      const { lerLeads, atualizarLead } = require('./services/salvarLead');
      const { processarLeadImportada } = require('./cerebro/import-processor');
      const matchCore = require('./cerebro/match-core');
      const _leadsDB = await lerLeads(userId);
      for (const _lead of novas) {
        try {
          const _leadDB = _leadsDB.find(l => l.id === _lead.id);
          if (!_leadDB) continue;
          const _p = _leadDB.perfilIA || {};
          if (!_p.tipo || !_p.intencao || !_p.cidade || !_p.bairro || !_p.valorMax) continue;
          // Montar mapaIntencao via import-processor (igual ao portal-processor)
          const _mapa = await processarLeadImportada(_leadDB);
          if (!_mapa) continue;
          _leadDB.mapaIntencao = _mapa;
          await atualizarLead(_leadDB.id, { mapaIntencao: _mapa });
          // Processar com mensagem vazia — mapaIntencao já está correto
          await matchCore.processar({ lead: { ..._leadDB, perfilIA: _p, mapaIntencao: _mapa }, mensagem: '', canal: 'manual', userId: _leadDB.userId || _leadDB.codigoUsuario || userId });
          console.log(`[import-match] ✅ ${_leadDB.nome||_lead.id}`);
        } catch(e) { console.error('[import-match]', _lead.id, e.message); }
      }
    } catch(e) { console.error('[import-match geral]', e.message); }

    process.exit(0);
  } catch (e) {
    console.error('Erro ao importar leads:', e.message);
    process.exit(1);
  }
}

run();
