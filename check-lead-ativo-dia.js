// Diagnóstico do job lead_ativo_dia (services/jobCreditos.js →
// debitarLeadsAtivos(), roda 2h da madrugada + 1x no boot, ver
// iniciarJobCreditos()). Só LÊ o banco, não debita nem altera nada.
// Roda manual no Render Shell:
//   node check-lead-ativo-dia.js
//
// Confere 2 coisas pra cada usuário ativo:
// 1. dados.ultimoDebitoLeadsAtivos bate com "hoje" (SP) — prova que o job
//    rodou e marcou a trava de idempotência.
// 2. Existe uma transação real em dados.matchCoinsTransacoes com motivo
//    "N leads ativos" na data de hoje — prova que o débito de fato foi
//    persistido (a marca de (1) e a transação de (2) são gravadas em pontos
//    diferentes de debitarLeadsAtivos(); se só (1) bater e (2) não, o job
//    rodou mas não gravou transação — normalmente porque a conta não tinha
//    lead ativa naquele dia, o que é esperado, não é bug).
const { query, dbOk } = require('./services/db');

(async () => {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  const { rows } = await query(`
    SELECT codigo_usuario, nome, ativo,
      dados->>'ultimoDebitoLeadsAtivos' AS ultimo_debito,
      match_coins,
      (
        SELECT jsonb_agg(t)
        FROM jsonb_array_elements(COALESCE(dados->'matchCoinsTransacoes','[]'::jsonb)) t
        WHERE t->>'motivo' LIKE '%leads ativos%'
          AND (t->>'data')::date = $1::date
      ) AS transacoes_hoje
    FROM usuarios
    WHERE ativo IS NOT FALSE
    ORDER BY nome
  `, [hoje]);

  console.log('=== lead_ativo_dia — diagnóstico do dia', hoje, '(America/Sao_Paulo) ===\n');

  const marcadosHoje = rows.filter(r => r.ultimo_debito === hoje);
  const naoMarcados = rows.filter(r => r.ultimo_debito !== hoje);
  const comTransacao = rows.filter(r => r.transacoes_hoje && r.transacoes_hoje.length);

  console.log('Usuários ativos:', rows.length);
  console.log('Com ultimoDebitoLeadsAtivos =', hoje, ':', marcadosHoje.length);
  console.log('SEM marca de hoje (job não passou por eles ainda):', naoMarcados.length);
  console.log('Com transação de débito "leads ativos" registrada hoje:', comTransacao.length);
  console.log('');

  if (naoMarcados.length) {
    console.log('--- Contas SEM ultimoDebitoLeadsAtivos de hoje (investigar) ---');
    console.table(naoMarcados.map(r => ({
      codigo_usuario: r.codigo_usuario,
      nome: r.nome,
      ultimo_debito: r.ultimo_debito || '(nunca)',
      match_coins: r.match_coins
    })));
  }

  console.log('--- Transações de débito "leads ativos" registradas hoje ---');
  const linhas = [];
  for (const r of comTransacao) {
    for (const t of r.transacoes_hoje) {
      linhas.push({
        codigo_usuario: r.codigo_usuario,
        nome: r.nome,
        motivo: t.motivo,
        debitado: t.quantidade,
        saldo_apos: t.saldoApos,
        data: t.data
      });
    }
  }
  console.table(linhas);

  if (marcadosHoje.length === 0) {
    console.log('\n⚠️  Nenhuma conta com ultimoDebitoLeadsAtivos de hoje — o job pode não ter rodado ainda hoje (roda 2h da madrugada) ou não rodou desde o último deploy/restart.');
  } else if (comTransacao.length === 0) {
    console.log('\n⚠️  Job marcou ultimoDebitoLeadsAtivos em', marcadosHoje.length, 'conta(s) mas NENHUMA transação de débito foi gravada — ou nenhuma conta tem lead ativa hoje (possível, mas checar), ou o débito está falhando silenciosamente (ver log [jobCreditos] no Render por volta das 2h).');
  } else {
    console.log('\n✅ Job rodou e debitou de verdade hoje —', comTransacao.length, 'conta(s) com transação registrada.');
  }

  process.exit(0);
})();
