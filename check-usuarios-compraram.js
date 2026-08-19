// Lista quem realmente comprou créditos pelo Mercado Pago (não é a proxy
// "saldo > 1000" usada nos funis de campanha — aqui é o registro de verdade
// de cada transação de crédito com motivo de compra paga).
// Roda manual no Render Shell:
//   node check-usuarios-compraram.js
//
// Cada corretor guarda o histórico de créditos em dados.matchCoinsTransacoes
// (JSONB, 1 entrada por adicionarCreditos() chamado) — motivos que são
// compra de verdade via Mercado Pago: combo_leads_promo (combo em
// /pagamento/criar-plano), combo_demanda (combo comprado em /demanda),
// recarga_mp (recarga avulsa). Bônus (indicação, onboarding, revenda de
// sub-admin) usam outros motivos e ficam de fora de propósito.
const { query, dbOk } = require('./services/db');

(async () => {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  const { rows } = await query(`
    SELECT u.codigo_usuario, u.nome, u.email, u.telefone,
      t->>'motivo' AS motivo,
      (t->>'quantidade')::numeric AS creditos,
      (t->>'data')::timestamptz AS data_compra
    FROM usuarios u,
      jsonb_array_elements(COALESCE(u.dados->'matchCoinsTransacoes', '[]'::jsonb)) AS t
    WHERE t->>'motivo' IN ('combo_leads_promo','combo_demanda','recarga_mp')
    ORDER BY data_compra DESC
  `);

  console.log('=== TODAS AS COMPRAS (mais recente primeiro) ===');
  console.log('Total de transações pagas:', rows.length);
  console.table(rows.map(r => ({
    codigo_usuario: r.codigo_usuario,
    nome: r.nome,
    telefone: r.telefone,
    motivo: r.motivo,
    creditos: r.creditos,
    data: r.data_compra ? new Date(r.data_compra).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''
  })));

  // Resumo por usuário — quantas vezes comprou, total de créditos, 1ª e última compra.
  const porUsuario = {};
  for (const r of rows) {
    const k = r.codigo_usuario;
    if (!porUsuario[k]) porUsuario[k] = { nome: r.nome, telefone: r.telefone, compras: 0, creditos: 0, primeira: r.data_compra, ultima: r.data_compra };
    porUsuario[k].compras++;
    porUsuario[k].creditos += Number(r.creditos) || 0;
    if (r.data_compra < porUsuario[k].primeira) porUsuario[k].primeira = r.data_compra;
    if (r.data_compra > porUsuario[k].ultima) porUsuario[k].ultima = r.data_compra;
  }
  const resumo = Object.entries(porUsuario)
    .map(([codigo, v]) => ({
      codigo_usuario: codigo, nome: v.nome, telefone: v.telefone,
      qtd_compras: v.compras, total_creditos: v.creditos,
      primeira_compra: new Date(v.primeira).toLocaleDateString('pt-BR'),
      ultima_compra: new Date(v.ultima).toLocaleDateString('pt-BR')
    }))
    .sort((a, b) => b.total_creditos - a.total_creditos);

  console.log('\n=== RESUMO POR USUÁRIO (', resumo.length, 'usuário(s) únicos compraram) ===');
  console.table(resumo);

  process.exit(0);
})();
