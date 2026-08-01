// Corrige retroativamente estado/cidade/bairro já gravados no banco (imóveis
// cadastrados/importados antes da normalização entrar em services/salvarImovel.js)
// Rodar uma vez no Render Shell: node normalizar-localidades-imoveis.js
const { query } = require('./services/db');
const { normalizarEstadoBR, normalizarNomeLocalidade } = require('./services/salvarImovel');

async function main() {
  const { rows } = await query('SELECT id, estado, cidade, bairro FROM imoveis');
  console.log('Total de imóveis:', rows.length);

  let alterados = 0;
  for (const r of rows) {
    const estadoNovo = normalizarEstadoBR(r.estado);
    const cidadeNova = normalizarNomeLocalidade(r.cidade);
    const bairroNovo = normalizarNomeLocalidade(r.bairro);
    if (estadoNovo === (r.estado || '') && cidadeNova === (r.cidade || '') && bairroNovo === (r.bairro || '')) continue;
    await query('UPDATE imoveis SET estado=$1, cidade=$2, bairro=$3 WHERE id=$4', [estadoNovo, cidadeNova, bairroNovo, r.id]);
    alterados++;
  }
  console.log('Imóveis corrigidos:', alterados);
  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); process.exit(1); });
