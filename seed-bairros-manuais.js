// Seed manual de bairros — pra cidades onde a busca automática (OSM/Nominatim
// e/ou dados internos) não deu conta e o Renato mandou a lista real/oficial
// direto (ex: Praia Grande/SP, ago/2026, bairros oficiais + balneários).
// fonte='manual' — mais confiável que qualquer scrape, prioridade máxima.
//
// Extensível: sempre que o Renato mandar a lista de bairros de outra cidade,
// adicionar uma entrada nova em SEEDS abaixo, no mesmo formato, e rodar de
// novo (idempotente, ON CONFLICT DO NOTHING).
//
// Roda manual no Render Shell:
//   node seed-bairros-manuais.js
const { query, dbOk } = require('./services/db');

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// chave: "uf|cidade" (cidade sem acento, minúscula — mesmo padrão da tabela localidades)
const SEEDS = {
  'sp|praia grande': [
    // Bairros oficiais
    'canto do forte', 'boqueirao', 'guilhermina', 'aviacao', 'campo da aviacao',
    'maracana', 'caicara', 'florida', 'solemar', 'melvi', 'anhanguera',
    'antartica', 'vila antartica', 'gloria', 'imperador',
    // Balneários e loteamentos
    'balneario esmeralda', 'balneario florida', 'balneario maracana', 'balneario pires',
    'jardim anhanguera', 'jardim imperador', 'jardim melvi', 'jardim princesa',
    'jardim real', 'jardim solemar', 'cidade da crianca', 'cidade ocian',
    'itaguai', 'japura',
  ],
};

async function run() {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  let totalNovos = 0;
  for (const chave of Object.keys(SEEDS)) {
    const [uf, cidade] = chave.split('|');
    const bairros = SEEDS[chave];
    let novos = 0;
    for (const bairroBruto of bairros) {
      const bairro = norm(bairroBruto);
      if (bairro.length < 3) continue;
      try {
        const ins = await query(
          `INSERT INTO localidades(bairro,cidade,estado,fonte) VALUES($1,$2,$3,'manual') ON CONFLICT DO NOTHING`,
          [bairro, cidade, uf]
        );
        if (ins.rowCount > 0) { novos++; totalNovos++; }
      } catch (e) { console.error(`erro inserindo ${bairro}/${cidade}/${uf}:`, e.message); }
    }
    console.log(`[${cidade}/${uf}] ${novos} bairro(s) novo(s) de ${bairros.length} na lista`);
  }

  console.log('\n=== CONCLUÍDO ===');
  console.log('Total de bairros novos inseridos:', totalNovos);
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
