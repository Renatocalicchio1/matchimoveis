const XLSX = require('xlsx');
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

async function run() {
  try {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    // Buscar leads existentes do usuário
    const res = await _q('SELECT dados FROM leads WHERE user_id = $1', [userId]);
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
        bairro: row.Bairro || row.bairro || '',
        cidade: row.Cidade || row.cidade || '',
        estado: row.Estado || row.estado || '',
        quartos: isComercial(row.Tipo || row.tipo) ? '' : (row.Quartos || row.quartos || ''),
        suites: isComercial(row.Tipo || row.tipo) ? '' : (row.Suites || row.suites || ''),
        vagas: isComercial(row.Tipo || row.tipo) ? '' : (row.Vagas || row.vagas || ''),
        banheiros: isComercial(row.Tipo || row.tipo) ? '' : (row.Banheiros || row.banheiros || ''),
        area_min: row.Area_min || row.area_min || '',
        area_max: row.Area_max || row.area_max || '',
        valorMin: row.Valor_min || row.valor_min || '',
        valorMax: row.Valor_max || row.valor_max || '',
        observacoes: row.Observacoes || row.observacoes || '',
        segmento: isComercial(row.Tipo || row.tipo) ? 'comercial' : 'residencial',
        perfilIA: {
          tipo: row.Tipo || row.tipo || '',
          intencao: normalizarTransacao(row.Transacao || row.transacao || row['Transação'] || ''),
          bairro: row.Bairro || row.bairro || '',
          cidade: row.Cidade || row.cidade || '',
          estado: row.Estado || row.estado || '',
          quartos: isComercial(row.Tipo || row.tipo) ? '' : (row.Quartos || row.quartos || ''),
          suites: isComercial(row.Tipo || row.tipo) ? '' : (row.Suites || row.suites || row['Suítes'] || ''),
          vagas: isComercial(row.Tipo || row.tipo) ? '' : (row.Vagas || row.vagas || ''),
          banheiros: isComercial(row.Tipo || row.tipo) ? '' : (row.Banheiros || row.banheiros || ''),
          areaMin: row.Area_min || row.area_min || '',
          areaMax: row.Area_max || row.area_max || '',
          valorMax: row.Valor_max || row.valor_max || row['Valor_(R$)'] || row['Valor (R$)'] || '',
          valorMin: row.Valor_min || row.valor_min || '',
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

    if (novas.length === 0) {
      console.log('Nenhuma lead nova para importar.');
      process.exit(0);
    }

    const todas = [...existentes, ...novas];
    await salvarTodosLeads(todas);
    console.log(`✅ ${novas.length} leads importadas com sucesso.`);


    process.exit(0);
  } catch (e) {
    console.error('Erro ao importar leads:', e.message);
    process.exit(1);
  }
}

run();
