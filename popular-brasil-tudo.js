const { Client } = require('pg');
const DB_URL = 'postgresql://matchimoveis_db_user:ilVX3VfEMGkPsb6njTT8ADvwAaZt4PpZ@dpg-d85o5r3rjlhs73a5ggrg-a/matchimoveis_db';
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Conectado!');

  // Busca todos municípios IBGE
  const res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
  const municipios = await res.json();
  console.log('municípios IBGE:', municipios.length);

  let totalBairros = 0;
  let i = 0;

  for (const m of municipios) {
    i++;
    try {
      const cidade = norm(m.nome);
      const uf = m.microrregiao?.mesorregiao?.UF?.sigla?.toLowerCase();
      const estado = m.microrregiao?.mesorregiao?.UF?.nome || '';
      if (!uf) continue;

      // Insere cidade
      await client.query(`INSERT INTO localidades(bairro,cidade,estado,fonte) VALUES(NULL,$1,$2,'ibge') ON CONFLICT DO NOTHING`, [cidade, uf]);

      // Busca bairros OSM
      await sleep(1100);
      const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(m.nome)}&state=${encodeURIComponent(estado)}&country=Brazil&format=json&limit=50&featureType=neighbourhood`;
      const r = await fetch(url, { headers: { 'User-Agent': 'MatchImoveis/1.0 contato@matchimoveis.com.br' } });
      const bairros = await r.json();

      let n = 0;
      for (const b of bairros) {
        const nome = norm(b.display_name.split(',')[0]);
        if (nome.length < 3) continue;
        try {
          await client.query(`INSERT INTO localidades(bairro,cidade,estado,fonte) VALUES($1,$2,$3,'osm') ON CONFLICT DO NOTHING`, [nome, cidade, uf]);
          n++; totalBairros++;
        } catch(e) {}
      }

      if (i % 50 === 0) console.log(`[${i}/${municipios.length}] ${cidade}/${uf} | bairros sessao: ${totalBairros}`);
    } catch(e) { console.error(`[${i}] erro:`, e.message); }
  }

  const total = await client.query('SELECT COUNT(*) FROM localidades WHERE bairro IS NOT NULL');
  console.log('\n=== CONCLUÍDO ===');
  console.log('total bairros:', total.rows[0].count);
  await client.end();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
