const XLSX = require('xlsx');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { salvarTodosLeads } = require('./services/salvarLead');
const { query: _q } = require('./services/db');

const filePath = process.argv[2];
const userId = process.argv[3] || '';

if (!filePath) { console.error('Arquivo não informado'); process.exit(1); }

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
        quartos: row.Quartos || row.quartos || '',
        suites: row.Suites || row.suites || '',
        vagas: row.Vagas || row.vagas || '',
        banheiros: row.Banheiros || row.banheiros || '',
        area_min: row.Area_min || row.area_min || '',
        area_max: row.Area_max || row.area_max || '',
        valorMin: row.Valor_min || row.valor_min || '',
        valorMax: row.Valor_max || row.valor_max || '',
        observacoes: row.Observacoes || row.observacoes || '',
        perfilIA: {
          tipo: row.Tipo || row.tipo || '',
          intencao: row.Transacao || row.transacao || '',
          bairro: row.Bairro || row.bairro || '',
          cidade: row.Cidade || row.cidade || '',
          estado: row.Estado || row.estado || '',
          quartos: row.Quartos || row.quartos || '',
          valorMax: row.Valor_max || row.valor_max || '',
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
