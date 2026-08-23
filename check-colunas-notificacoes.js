// Diagnóstico read-only — confirma se a tabela `notificacoes` no banco real
// tem as colunas que services/notificacoes/criarNotificacao.js tenta gravar
// (prioridade, status, user_id, acao, link, created_at) além das que
// setupDB.js declara na CREATE TABLE original (usuario_id, lida, criada_em,
// dados). Se as colunas do 2º sistema não existirem, toda notificação de
// transição de workflow de visita (services/workflow/atualizarWorkflowVisita.js,
// único chamador de criarNotificacao()) falha silenciosa — o erro cai no
// catch e só aparece no log do Render, sem quebrar o resto do fluxo.
// Rodar no Render Shell: node check-colunas-notificacoes.js
const { query, dbOk } = require('./services/db');

const COLUNAS_ESPERADAS_SETUPDB = ['id', 'tipo', 'titulo', 'mensagem', 'usuario_id', 'lida', 'lead_id', 'imovel_id', 'visita_id', 'criada_em', 'dados'];
const COLUNAS_ESPERADAS_CRIARNOTIFICACAO = ['id', 'tipo', 'titulo', 'mensagem', 'prioridade', 'status', 'user_id', 'lead_id', 'visita_id', 'imovel_id', 'acao', 'link', 'created_at'];

(async () => {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  const { rows } = await query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'notificacoes'
    ORDER BY ordinal_position
  `);

  if (!rows.length) {
    console.log('Tabela "notificacoes" não existe no banco.');
    process.exit(0);
  }

  console.log('=== Colunas reais da tabela notificacoes ===');
  console.table(rows.map(r => ({ coluna: r.column_name, tipo: r.data_type, aceita_null: r.is_nullable, default: r.column_default })));

  const colunasReais = new Set(rows.map(r => r.column_name));

  console.log('\n=== Checagem contra setupDB.js (services/salvarNotificacao.js) ===');
  COLUNAS_ESPERADAS_SETUPDB.forEach(c => {
    console.log(colunasReais.has(c) ? `  ✅ ${c}` : `  ❌ FALTA: ${c}`);
  });

  console.log('\n=== Checagem contra services/notificacoes/criarNotificacao.js ===');
  const faltando = [];
  COLUNAS_ESPERADAS_CRIARNOTIFICACAO.forEach(c => {
    const tem = colunasReais.has(c);
    console.log(tem ? `  ✅ ${c}` : `  ❌ FALTA: ${c}`);
    if (!tem) faltando.push(c);
  });

  console.log('\n=== Resultado ===');
  if (faltando.length) {
    console.log(`criarNotificacao() vai FALHAR — faltam ${faltando.length} coluna(s): ${faltando.join(', ')}`);
    console.log('Toda notificação de transição de workflow de visita (atualizarWorkflowVisita.js) está caindo no catch silenciosamente.');
  } else {
    console.log('Todas as colunas existem — criarNotificacao() funciona normalmente, a pendência estava desatualizada.');
  }

  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
