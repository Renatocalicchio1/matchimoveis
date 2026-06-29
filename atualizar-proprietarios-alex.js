const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const mapa = JSON.parse(fs.readFileSync('/tmp/mapa-alex.json', 'utf8'));
console.log('Mapa carregado:', Object.keys(mapa).length);

async function run() {
  const { rows } = await pool.query("SELECT id, dados FROM imoveis WHERE user_id='ALE-DU2K'");
  console.log('Imóveis ALE-DU2K:', rows.length);

  let vinculados = 0, semFoto = 0, semCruz = 0;

  for (const im of rows) {
    const dados = im.dados || {};
    const fotos = dados.fotos || [];
    if (!fotos.length) { semFoto++; continue; }

    const match = fotos[0].match(/fotos\/(\d+)\//);
    if (!match) { semFoto++; continue; }

    const codImo = match[1];
    const prop = mapa[codImo];
    if (!prop) { semCruz++; continue; }

    await pool.query(
      "UPDATE imoveis SET dados = dados || jsonb_build_object('proprietario',$1::jsonb) WHERE id=$2",
      [JSON.stringify({ ...prop, status: 'vinculado' }), im.id]
    );
    vinculados++;
  }

  console.log('✅ Vinculados:', vinculados);
  console.log('❌ Sem foto:', semFoto);
  console.log('❌ Sem cruzamento:', semCruz);
  await pool.end();
}

run().catch(console.error);
