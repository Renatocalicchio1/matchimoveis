// Completa bairros faltantes na tabela `localidades` — roda só nas cidades
// que já existem na base (importadas por popular-brasil-tudo.js) mas ainda
// não têm NENHUM bairro associado. A 1ª rodada (popular-brasil-tudo.js)
// buscou bairro de todo município do Brasil no OpenStreetMap, mas cidade
// média/pequena costuma ter pouco (ou nenhum) bairro mapeado lá — cliente
// reportou isso ao tentar escolher "Praia Grande" no widget de área de
// atuação e não achar bairro nenhum (ago/2026).
//
// Idempotente e retomável: usa ON CONFLICT DO NOTHING e sempre reconsulta
// "quem ainda não tem bairro" no banco antes de cada rodada — se cair no
// meio (rede, timeout do shell etc.), é só rodar de novo, ele pula quem já
// ganhou bairro na tentativa anterior e continua de onde parou.
//
// ⚠️ Demora — respeita o limite de 1 req/seg do Nominatim (mesma regra do
// script original), então são ~1.1s por cidade sem bairro. Se tiver
// milhares de cidades faltando, conta várias dezenas de minutos rodando.
// Roda manual no Render Shell:
//   node completar-bairros-faltantes.js
const { query, dbOk } = require('./services/db');

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Nominatim exige o nome completo do estado (não sigla) no parâmetro
// "state=" — mesmo mapa sigla→nome já usado em services/distribuicaoAreaAtuacao.js.
const SIGLA_PARA_NOME = {
  ac: 'Acre', al: 'Alagoas', ap: 'Amapá', am: 'Amazonas', ba: 'Bahia', ce: 'Ceará',
  df: 'Distrito Federal', es: 'Espírito Santo', go: 'Goiás', ma: 'Maranhão',
  mt: 'Mato Grosso', ms: 'Mato Grosso do Sul', mg: 'Minas Gerais', pa: 'Pará',
  pb: 'Paraíba', pr: 'Paraná', pe: 'Pernambuco', pi: 'Piauí', rj: 'Rio de Janeiro',
  rn: 'Rio Grande do Norte', rs: 'Rio Grande do Sul', ro: 'Rondônia', rr: 'Roraima',
  sc: 'Santa Catarina', sp: 'São Paulo', se: 'Sergipe', to: 'Tocantins'
};

async function run() {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  const { rows: faltando } = await query(`
    SELECT DISTINCT l1.cidade, l1.estado
    FROM localidades l1
    WHERE NOT EXISTS (
      SELECT 1 FROM localidades l2
      WHERE l2.cidade = l1.cidade AND l2.estado = l1.estado AND l2.bairro IS NOT NULL
    )
    ORDER BY l1.estado, l1.cidade
  `);
  console.log('Cidades sem bairro cadastrado:', faltando.length);
  if (!faltando.length) {
    console.log('Nada a fazer — todas as cidades da base já têm pelo menos 1 bairro (ou a base ainda está vazia).');
    process.exit(0);
  }

  let totalBairros = 0;
  let cidadesComBairroNovo = 0;
  let i = 0;

  // Busca 1x; se vier vazio (0 bairro), tenta de novo depois de uma pausa
  // maior — parte das cidades que ficam de fora na 1ª tentativa é falha
  // passageira do Nominatim (bloqueio/instabilidade momentânea, já visto
  // logo no início de uma rodada anterior), não ausência real do dado.
  async function buscarBairros(cidade, nomeEstado) {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(cidade)}&state=${encodeURIComponent(nomeEstado)}&country=Brazil&format=json&limit=50&featureType=neighbourhood`;
    const r = await fetch(url, { headers: { 'User-Agent': 'MatchImoveis/1.0 contato@matchimoveis.com.br' } });
    const d = await r.json();
    return Array.isArray(d) ? d : null;
  }

  for (const row of faltando) {
    i++;
    const cidade = row.cidade;
    const uf = row.estado;
    const nomeEstado = SIGLA_PARA_NOME[uf] || uf;
    try {
      await sleep(1100);
      let bairros = await buscarBairros(cidade, nomeEstado);
      if (bairros === null) {
        console.log(`[${i}/${faltando.length}] ${cidade}/${uf} — resposta inesperada do Nominatim, pulando`);
        continue;
      }
      if (!bairros.length) {
        // 2ª tentativa com pausa maior (3s) — cobre bloqueio/instabilidade
        // momentânea sem precisar rodar o script inteiro de novo.
        await sleep(3000);
        bairros = await buscarBairros(cidade, nomeEstado);
        if (bairros === null) bairros = [];
      }

      let n = 0;
      for (const b of bairros) {
        const nome = norm((b.display_name || '').split(',')[0]);
        if (nome.length < 3) continue;
        try {
          await query(`INSERT INTO localidades(bairro,cidade,estado,fonte) VALUES($1,$2,$3,'osm') ON CONFLICT DO NOTHING`, [nome, cidade, uf]);
          n++; totalBairros++;
        } catch (e) {}
      }
      if (n > 0) cidadesComBairroNovo++;
      if (i % 25 === 0 || n > 0) {
        console.log(`[${i}/${faltando.length}] ${cidade}/${uf} — ${n} bairro(s) novo(s) | total sessão: ${totalBairros} bairro(s) em ${cidadesComBairroNovo} cidade(s)`);
      }
    } catch (e) {
      console.error(`[${i}/${faltando.length}] erro em ${cidade}/${uf}:`, e.message);
    }
  }

  console.log('\n=== CONCLUÍDO ===');
  console.log('Cidades verificadas nessa rodada:', faltando.length);
  console.log('Cidades que ganharam bairro novo:', cidadesComBairroNovo);
  console.log('Total de bairros novos adicionados:', totalBairros);
  console.log('Se ainda sobrou cidade sem bairro (Nominatim genuinamente não tem essa informação mapeada), rodar de novo não muda nada pra ela — a base do OpenStreetMap é que não tem esse dado.');
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
