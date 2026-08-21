// Diagnóstico: por que a distribuição por área de atuação retornou 0 leads?
// Roda manual no Render Shell:
//   node check-distribuicao-area.js
// Mostra separadamente as duas pontas (interessados elegíveis x corretores
// com área de atuação cadastrada) pra achar em qual delas está vazio, ou se
// as regiões só não estão batendo (grafia diferente de estado/cidade).
const { query, dbOk } = require('./services/db');

function _norm(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
// interessados_portal.estado guarda nome completo ("São Paulo"), perfil do
// corretor guarda sigla ("SP") — precisa converter pro mesmo formato antes
// de comparar (mesmo fix aplicado em services/distribuicaoAreaAtuacao.js).
const _SIGLA_PARA_NOME_ESTADO = {'ac':'acre','al':'alagoas','ap':'amapa','am':'amazonas','ba':'bahia','ce':'ceara','df':'distrito federal','es':'espirito santo','go':'goias','ma':'maranhao','mt':'mato grosso','ms':'mato grosso do sul','mg':'minas gerais','pa':'para','pb':'paraiba','pr':'parana','pe':'pernambuco','pi':'piaui','rj':'rio de janeiro','rn':'rio grande do norte','rs':'rio grande do sul','ro':'rondonia','rr':'roraima','sc':'santa catarina','sp':'sao paulo','se':'sergipe','to':'tocantins'};
function _normEstado(s) {
  const n = _norm(s);
  return _SIGLA_PARA_NOME_ESTADO[n] || n;
}

(async () => {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  const { rows: interessados } = await query(`
    SELECT estado, cidade, bairro, COUNT(*)::int AS total
    FROM interessados_portal
    WHERE COALESCE(data_lead, criado_em) >= NOW() - INTERVAL '7 days'
      AND estado IS NOT NULL AND estado != '' AND cidade IS NOT NULL AND cidade != ''
    GROUP BY estado, cidade, bairro
    ORDER BY total DESC
    LIMIT 30
  `);
  console.log('=== INTERESSADOS ELEGÍVEIS (últimos 7 dias, top 30 por estado/cidade/bairro) ===');
  console.log('Total de combinações estado+cidade+bairro:', interessados.length);
  console.table(interessados);

  const { rows: totalInteressados } = await query(`
    SELECT COUNT(*)::int AS total FROM interessados_portal
    WHERE COALESCE(data_lead, criado_em) >= NOW() - INTERVAL '7 days'
  `);
  console.log('Total de interessados elegíveis (7 dias):', totalInteressados[0].total);

  // ago/2026: área de atuação virou multi-cidade (areaAtuacaoCidades, array)
  // — lê os dois formatos (novo array + antigo areaAtuacaoCidade string) pra
  // não mostrar diagnóstico errado em conta que não resalvou o perfil ainda.
  const { rows: corretores } = await query(`
    SELECT codigo_usuario, ativo, match_coins,
      dados->>'areaAtuacaoEstado' AS area_estado,
      dados->'areaAtuacaoCidades' AS area_cidades,
      dados->>'areaAtuacaoCidade' AS area_cidade_legado,
      dados->'areaAtuacaoBairros' AS area_bairros
    FROM usuarios
    WHERE COALESCE(dados->>'areaAtuacaoEstado', '') != ''
       OR COALESCE(dados->>'areaAtuacaoCidade', '') != ''
       OR (jsonb_typeof(dados->'areaAtuacaoCidades') = 'array' AND jsonb_array_length(dados->'areaAtuacaoCidades') > 0)
    ORDER BY codigo_usuario
  `);
  const corretoresComCidades = corretores.map(c => {
    let cidades = Array.isArray(c.area_cidades) ? c.area_cidades.filter(Boolean) : [];
    if (!cidades.length && c.area_cidade_legado) cidades = [c.area_cidade_legado];
    return { ...c, cidades };
  });
  console.log('\n=== CORRETORES COM ÁREA DE ATUAÇÃO CADASTRADA (qualquer campo preenchido) ===');
  console.log('Total:', corretoresComCidades.length);
  console.table(corretoresComCidades.map(c => ({
    codigo_usuario: c.codigo_usuario,
    ativo: c.ativo,
    match_coins: c.match_coins,
    area_estado: c.area_estado,
    area_cidades: c.cidades.join(', '),
    area_bairros: Array.isArray(c.area_bairros) ? c.area_bairros.map(b => typeof b === 'object' ? (b.bairro + ' (' + b.cidade + ')') : b).join(', ') : c.area_bairros
  })));

  // Cruzamento normalizado — pra cada corretor, mostra se ALGUMA das
  // cidades dele bate com alguma linha de interessados elegíveis.
  console.log('\n=== CRUZAMENTO (normalizado, minúsculo/sem acento) ===');
  const regioesInteressados = new Set(interessados.map(i => _normEstado(i.estado) + '|' + _norm(i.cidade)));
  for (const c of corretoresComCidades) {
    const estadoN = _normEstado(c.area_estado);
    const bateCom = c.cidades.filter(cid => regioesInteressados.has(estadoN + '|' + _norm(cid)));
    console.log(
      c.codigo_usuario, '->', c.area_estado, '/', c.cidades.join(', ') || '(nenhuma cidade)',
      '| ativo:', c.ativo, '| saldo:', c.match_coins,
      '| bate com algum interessado elegível?', bateCom.length ? 'SIM (' + bateCom.join(', ') + ')' : 'não'
    );
  }
  process.exit(0);
})();
