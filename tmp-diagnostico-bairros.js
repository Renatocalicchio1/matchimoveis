// Script de diagnóstico — SOMENTE LEITURA. Rodar no Render Shell:
// node tmp-diagnostico-bairros.js
// Investiga por que /admin/demanda mostra poucos bairros pra Balneário
// Camboriú/Itajaí/Camboriú (SC): compara o que está de fato no banco
// (interessados_portal, últimos 90 dias) com o que a função
// listarBairrosComLead() (services/buscaDemanda.js) realmente devolve —
// se algum bairro real "sumir" nessa comparação, é bug de normalização
// (nome de cidade grafado diferente, etc), não falta de dado.
const { query } = require('./services/db');
const { listarBairrosComLead, listarCidadesComLead } = require('./services/buscaDemanda');

function norm(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

const ESTADO = 'SC';
const CIDADES = ['Balneário Camboriú', 'Itajaí', 'Camboriú'];

(async () => {
  console.log('=== Cidades de SC que o sistema reconhece (últimos 90 dias) ===');
  const cidades = await listarCidadesComLead(ESTADO);
  console.log(cidades);

  for (const cidade of CIDADES) {
    console.log('\n\n========== ' + cidade + ' ==========');

    console.log('\n-- Bairros crus no banco (interessados_portal, últimos 90 dias, cidade LIKE) --');
    const { rows: brutos } = await query(`
      SELECT bairro, cidade, estado, COUNT(*)::int as total, MAX(COALESCE(data_lead, criado_em)) as mais_recente
      FROM interessados_portal
      WHERE COALESCE(data_lead, criado_em) >= NOW() - INTERVAL '90 days'
        AND unaccent(LOWER(cidade)) LIKE '%' || unaccent(LOWER($1)) || '%'
      GROUP BY bairro, cidade, estado
      ORDER BY total DESC
    `, [cidade]).catch(async (e) => {
      console.log('(unaccent indisponível, tentando sem ele:', e.message, ')');
      return query(`
        SELECT bairro, cidade, estado, COUNT(*)::int as total, MAX(COALESCE(data_lead, criado_em)) as mais_recente
        FROM interessados_portal
        WHERE COALESCE(data_lead, criado_em) >= NOW() - INTERVAL '90 days'
          AND LOWER(cidade) LIKE '%' || LOWER($1) || '%'
        GROUP BY bairro, cidade, estado
        ORDER BY total DESC
      `, [cidade]);
    });
    console.table(brutos.map(r => ({ bairro: r.bairro, cidade: r.cidade, estado: r.estado, total: r.total })));

    console.log('\n-- O que listarBairrosComLead(estado, cidade) devolve de fato --');
    const viaFuncao = await listarBairrosComLead(ESTADO, cidade);
    console.log(viaFuncao);

    const chavesBrutos = new Set(brutos.filter(r => r.bairro).map(r => norm(r.bairro)));
    const chavesFuncao = new Set(viaFuncao.map(b => norm(b)));
    const faltando = [...chavesBrutos].filter(k => !chavesFuncao.has(k));
    if (faltando.length) {
      console.log('\n⚠️  Bairros que EXISTEM no banco mas NÃO aparecem via listarBairrosComLead:', faltando);
    } else {
      console.log('\n✅ Nenhum bairro do banco está sumindo na função — a lista batendo com o que existe de fato.');
    }

    const semBairro = brutos.filter(r => !r.bairro).reduce((s, r) => s + r.total, 0);
    if (semBairro) console.log('\nℹ️  ' + semBairro + ' linha(s) dessa cidade sem bairro preenchido (não aparecem em nenhum lugar).');
  }

  console.log('\n\nFeito. Nenhum dado foi alterado (script somente leitura).');
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
