// Diagnóstico read-only pro piloto de páginas de SEO por bairro/cidade
// (ago/2026) — mede quantos bairros/cidades já têm estoque real suficiente
// pra virar página indexável hoje, usando a MESMA regra de visibilidade e
// normalização que o /portal já usa em produção (imovelVisivelPublico,
// normalizarEstadoBR/CidadeBR/BairroBR), pra não inventar critério novo.
// Rodar no Render Shell: node levantar-bairros-cidades-seo.js
const { lerImoveis, imovelVisivelPublico, normalizarEstadoBR, normalizarCidadeBR, normalizarBairroBR } = require('./services/salvarImovel');

function chave(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function bucket(contagens, limites) {
  const total = contagens.length;
  const linhas = limites.map(lim => `  >= ${String(lim).padStart(3)} imóveis: ${contagens.filter(n => n >= lim).length}`);
  return `  total com >=1: ${total}\n` + linhas.join('\n');
}

(async () => {
  console.log('Lendo imóveis...');
  const todos = await lerImoveis(null);
  // Mesmo filtro do /portal (GET /portal, server.js): status ativo/visível +
  // dedup por id_externo (mesma listagem repetida por >1 corretor da rede
  // conta 1 vez só, senão infla o número de páginas "reais" possíveis).
  const visiveis = todos.filter(i => i.status !== 'inativo' && i.status !== 'excluido' && imovelVisivelPublico(i));
  const vistos = new Set();
  const dedupados = visiveis.filter(i => {
    const ext = String(i.idExterno || i.id_externo || '').trim();
    if (!ext) return true;
    if (vistos.has(ext)) return false;
    vistos.add(ext);
    return true;
  });
  console.log(`Total imóveis no banco: ${todos.length}`);
  console.log(`Visíveis publicamente (com foto + valor mínimo): ${visiveis.length}`);
  console.log(`Depois de tirar duplicata de rede (mesmo id_externo): ${dedupados.length}\n`);

  const porBairro = {}; // chave = estado|cidade|bairro -> {count, estado, cidade, bairro}
  const porCidade = {}; // chave = estado|cidade -> {count, estado, cidade}

  dedupados.forEach(i => {
    const estado = normalizarEstadoBR(i.estado);
    const cidade = normalizarCidadeBR(estado, i.cidade);
    const bairro = normalizarBairroBR(cidade, i.bairro);
    if (!estado || !cidade) return;

    const kCidade = chave(estado) + '|' + chave(cidade);
    if (!porCidade[kCidade]) porCidade[kCidade] = { count: 0, estado, cidade };
    porCidade[kCidade].count++;

    if (!bairro) return;
    const kBairro = kCidade + '|' + chave(bairro);
    if (!porBairro[kBairro]) porBairro[kBairro] = { count: 0, estado, cidade, bairro };
    porBairro[kBairro].count++;
  });

  const cidades = Object.values(porCidade).sort((a, b) => b.count - a.count);
  const bairros = Object.values(porBairro).sort((a, b) => b.count - a.count);

  console.log(`=== CIDADES (${cidades.length} distintas com >=1 imóvel) ===`);
  console.log(bucket(cidades.map(c => c.count), [50, 30, 20, 10, 5, 3, 1]));
  console.log('\nTop 30 cidades:');
  cidades.slice(0, 30).forEach(c => console.log(`  ${String(c.count).padStart(4)}  ${c.cidade}/${c.estado}`));

  console.log(`\n=== BAIRROS (${bairros.length} distintos com >=1 imóvel) ===`);
  console.log(bucket(bairros.map(b => b.count), [50, 30, 20, 10, 5, 3, 1]));
  console.log('\nTop 30 bairros:');
  bairros.slice(0, 30).forEach(b => console.log(`  ${String(b.count).padStart(4)}  ${b.bairro} — ${b.cidade}/${b.estado}`));

  console.log('\nDone.');
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
