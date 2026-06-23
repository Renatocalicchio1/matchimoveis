'use strict';
const { query } = require('./services/db');

const BAIRROS_SP = {
  'itaim bibi': [-23.5837, -46.6750],
  'vila andrade': [-23.6667, -46.7333],
  'vila mariana': [-23.5889, -46.6389],
  'moema': [-23.6028, -46.6639],
  'brooklin': [-23.6167, -46.6833],
  'pinheiros': [-23.5617, -46.6833],
  'jardins': [-23.5667, -46.6667],
  'higienopolis': [-23.5472, -46.6611],
  'perdizes': [-23.5333, -46.6667],
  'lapa': [-23.5167, -46.7000],
  'morumbi': [-23.6167, -46.7167],
  'campo belo': [-23.6167, -46.6667],
  'tatuape': [-23.5389, -46.5722],
  'santana': [-23.5028, -46.6278],
  'bela vista': [-23.5583, -46.6444],
  'consolacao': [-23.5556, -46.6611],
  'cerqueira cesar': [-23.5611, -46.6639],
  'chacara california': [-23.6167, -46.7000],
  'jabaquara': [-23.6389, -46.6444],
  'saude': [-23.6167, -46.6333],
  'ipiranga': [-23.5944, -46.6083],
  'alto da lapa': [-23.5278, -46.7333],
  'barra funda': [-23.5278, -46.6611],
  'vila madalena': [-23.5500, -46.6917],
  'pompeia': [-23.5278, -46.6833],
  'santa cecilia': [-23.5389, -46.6500],
  'republica': [-23.5444, -46.6444],
  'centro': [-23.5489, -46.6388],
  'liberdade': [-23.5583, -46.6333],
  'cambuci': [-23.5722, -46.6278],
  'aclimacao': [-23.5722, -46.6444],
  'vila olimpia': [-23.5972, -46.6833],
  'osasco': [-23.5328, -46.7919],
  'guarulhos': [-23.4628, -46.5333],
  'barueri': [-23.5053, -46.8761],
  'santo andre': [-23.6639, -46.5283],
};

function norm(s) {
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}

async function geocodificar(cep) {
  try {
    const r = await fetch('https://viacep.com.br/ws/'+cep+'/json/');
    const d = await r.json();
    if (d.erro) return null;
    const coords = BAIRROS_SP[norm(d.bairro)];
    if (coords) return { lat: coords[0], lng: coords[1] };
    if (d.localidade === 'Sao Paulo' || d.localidade === 'São Paulo') return { lat: -23.5489, lng: -46.6388 };
    return null;
  } catch(e) { return null; }
}

async function run() {
  const r = await query("SELECT id, cep FROM imoveis WHERE cep IS NOT NULL AND cep != '' AND (latitude IS NULL OR longitude IS NULL) LIMIT 500");
  console.log('Imoveis:', r.rows.length);
  let ok = 0;
  for (const row of r.rows) {
    const cep = row.cep.replace(/\D/g,'');
    if (!cep || cep.length < 8) continue;
    const coords = await geocodificar(cep);
    if (coords) {
      await query('UPDATE imoveis SET latitude=$1, longitude=$2 WHERE id=$3', [coords.lat, coords.lng, row.id]);
      ok++;
      process.stdout.write('v');
    } else {
      process.stdout.write('.');
    }
    await new Promise(r => setTimeout(r, 150));
  }
  console.log('\nTotal: '+ok+'/'+r.rows.length);
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
