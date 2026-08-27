// Funil das duas campanhas (email pra corretor + captação de proprietário) —
// roda manual no Render Shell:
//   node check-funil-campanhas.js
// Mostra enviado -> abriu -> clicou -> cadastrou em número absoluto e %,
// tanto sobre o total enviado quanto sobre a etapa anterior — isso separa
// se o buraco é "abriu mas não clicou" (problema de copy/CTA do e-mail) ou
// "clicou mas não cadastrou" (problema de fricção no formulário/página).
const { query, dbOk } = require('./services/db');
const { BONUS_CADASTRO } = require('./services/creditos');

function _pct(n, base) { return base > 0 ? (n / base * 100).toFixed(1) + '%' : '—'; }

function _imprimeFunil(titulo, etapas) {
  console.log('\n=== ' + titulo + ' ===');
  const total = etapas[0].valor;
  let anterior = null;
  for (const e of etapas) {
    const pctTotal = _pct(e.valor, total);
    const pctAnterior = anterior != null ? _pct(e.valor, anterior) : '—';
    console.log(
      e.nome.padEnd(28),
      String(e.valor).padStart(6),
      ' | % do total enviado: ' + pctTotal.padStart(6),
      ' | % da etapa anterior: ' + pctAnterior.padStart(6)
    );
    anterior = e.valor;
  }
}

(async () => {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  // ── Campanha Email (corretor) ──────────────────────────────────────────
  const { rows: emailRows } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE enviado_em IS NOT NULL OR status = 'enviado')::int AS enviados,
      COUNT(*) FILTER (WHERE aberto_em IS NOT NULL)::int AS abertos,
      COUNT(*) FILTER (WHERE clicado_em IS NOT NULL)::int AS clicados,
      COUNT(*) FILTER (WHERE LOWER(email) IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != ''))::int AS cadastrados,
      COUNT(*) FILTER (WHERE LOWER(email) IN (SELECT LOWER(email) FROM usuarios WHERE COALESCE(match_coins_total,0) > ${BONUS_CADASTRO}))::int AS comprados,
      COUNT(*) FILTER (WHERE wa_manual_enviado_em IS NOT NULL)::int AS wa_manual_enviado
    FROM campanha_contatos
  `);
  const e = emailRows[0];
  _imprimeFunil('CAMPANHA EMAIL (corretor)', [
    { nome: 'Enviados', valor: e.enviados },
    { nome: 'Abriram', valor: e.abertos },
    { nome: 'Clicaram no link', valor: e.clicados },
    { nome: 'Cadastraram (viraram conta)', valor: e.cadastrados },
    { nome: 'Compraram combo', valor: e.comprados },
  ]);
  console.log('WhatsApp manual enviado (fallback):', e.wa_manual_enviado);

  // ── Campanha Captação (proprietário) ───────────────────────────────────
  const { rows: capRows } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE enviado_em IS NOT NULL)::int AS enviados,
      COUNT(*) FILTER (WHERE aberto_em IS NOT NULL)::int AS abertos,
      COUNT(*) FILTER (WHERE clicado_em IS NOT NULL)::int AS clicados,
      COUNT(*) FILTER (WHERE iniciou_cadastro_em IS NOT NULL)::int AS iniciaram_cadastro,
      COUNT(*) FILTER (WHERE imovel_captado_id IS NOT NULL)::int AS captaram_imovel,
      COUNT(*) FILTER (WHERE bonus_captacao_pago_em IS NOT NULL)::int AS finalizaram,
      COUNT(*) FILTER (WHERE wa_manual_enviado_em IS NOT NULL)::int AS wa_manual_enviado
    FROM campanha_captacao_envios
  `);
  const c = capRows[0];
  _imprimeFunil('CAMPANHA CAPTAÇÃO (proprietário)', [
    { nome: 'Enviados', valor: c.enviados },
    { nome: 'Abriram', valor: c.abertos },
    { nome: 'Clicaram no link', valor: c.clicados },
    { nome: 'Iniciaram cadastro do imóvel', valor: c.iniciaram_cadastro },
    { nome: 'Captaram (imóvel criado)', valor: c.captaram_imovel },
    { nome: 'Finalizaram (bônus pago)', valor: c.finalizaram },
  ]);
  console.log('WhatsApp manual enviado (fallback):', c.wa_manual_enviado);

  console.log('\n(comparar "% da etapa anterior" entre Abriram->Clicaram e Clicaram->Cadastraram/Iniciaram pra achar onde está o maior buraco)');
  process.exit(0);
})();
