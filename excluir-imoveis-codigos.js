// Exclui os imóveis com os códigos abaixo (id_externo/id_original/id_interno/
// codigo_imovel — qualquer um desses campos que bater) — pedido do Renato
// (ago/2026). Mostra o que encontrou antes de excluir, pra conferência.
// Roda manual no Render Shell:
//   node excluir-imoveis-codigos.js
const { query, dbOk } = require('./services/db');

const CODIGOS = [
  'APS277','BIACC335','CAPCESAR02','CAPLHP204','CAPRAFA038','CAPVAZ046',
  'DAVRAF002','DAVRAF021','DAVRAF022','DAVRAF026',
  'DMYALTOS','DMYCAP102','DMYCAP223','DMYCAP246','DMYCAP35','DMYCAP37','DMYCAP38',
  'DMYCAP389','DMYCAP48','DMYCAP556','DMYCAP605','DMYCAP66','DMYCAP69','DMYCAP74',
  'DMYCAP77','DMYCAP8','DMYCAP85','DMYCAP88','DMYCAP95','DMYCAP96',
  'DMYNEXT','DMYWIRE','GIH101'
];

(async () => {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  const { rows } = await query(`
    SELECT id, id_externo, id_original, id_interno, codigo_imovel, titulo, codigo_usuario, status
    FROM imoveis
    WHERE id_externo = ANY($1) OR id_original = ANY($1) OR id_interno = ANY($1) OR codigo_imovel = ANY($1)
  `, [CODIGOS]);

  console.log('=== IMÓVEIS ENCONTRADOS (', rows.length, 'de', CODIGOS.length, 'códigos ) ===');
  console.table(rows.map(r => ({
    id: r.id, codigo_usuario: r.codigo_usuario,
    id_externo: r.id_externo, codigo_imovel: r.codigo_imovel,
    titulo: (r.titulo || '').substring(0, 40), status: r.status
  })));

  const codigosAchados = new Set();
  rows.forEach(r => { [r.id_externo, r.id_original, r.id_interno, r.codigo_imovel].forEach(c => c && codigosAchados.add(c)); });
  const naoAchados = CODIGOS.filter(c => !codigosAchados.has(c));
  if (naoAchados.length) console.log('\n⚠️ Códigos não encontrados na base:', naoAchados.join(', '));

  if (!rows.length) { console.log('\nNada pra excluir.'); process.exit(0); }

  const ids = rows.map(r => r.id);
  const del = await query('DELETE FROM imoveis WHERE id = ANY($1)', [ids]);
  console.log('\n✅ Excluídos:', del.rowCount, 'imóve(is).');
  process.exit(0);
})();
