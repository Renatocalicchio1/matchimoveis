// Preenche `localidades` com bairro/cidade/estado que JÁ EXISTEM dentro do
// próprio banco — imoveis (cadastro/importação real de portal), leads
// (perfil_ia extraído da conversa/planilha) e interessados_portal (lista
// importada em /admin/interessados, usada pela busca de /demanda). É mais
// confiável que raspar o OpenStreetMap (que tem buraco pra cidade média/
// pequena — ver completar-bairros-faltantes.js) porque é dado real que
// corretor/portal já digitou, e é instantâneo (só SQL, sem API externa).
// Idempotente (ON CONFLICT DO NOTHING) — pode rodar de novo quando quiser
// pra pegar imóvel/lead novo que entrou desde a última vez.
// Roda manual no Render Shell:
//   node preencher-localidades-com-dados-internos.js
const { query, dbOk } = require('./services/db');

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

const ESTADOS_BR = [
  ['ac','Acre'],['al','Alagoas'],['ap','Amapá'],['am','Amazonas'],['ba','Bahia'],['ce','Ceará'],
  ['df','Distrito Federal'],['es','Espírito Santo'],['go','Goiás'],['ma','Maranhão'],['mt','Mato Grosso'],
  ['ms','Mato Grosso do Sul'],['mg','Minas Gerais'],['pa','Pará'],['pb','Paraíba'],['pr','Paraná'],
  ['pe','Pernambuco'],['pi','Piauí'],['rj','Rio de Janeiro'],['rn','Rio Grande do Norte'],['rs','Rio Grande do Sul'],
  ['ro','Rondônia'],['rr','Roraima'],['sc','Santa Catarina'],['sp','São Paulo'],['se','Sergipe'],['to','Tocantins']
];
const SIGLA_POR_CHAVE = {};
ESTADOS_BR.forEach(([sigla, nome]) => {
  SIGLA_POR_CHAVE[norm(sigla)] = sigla;
  SIGLA_POR_CHAVE[norm(nome)] = sigla;
});

// Fontes de estado/cidade/bairro já usadas no sistema — cada uma com sua
// própria forma de guardar o campo (coluna solta ou dentro de JSONB).
const FONTES = [
  {
    nome: 'imoveis',
    sql: `SELECT DISTINCT estado, cidade, bairro FROM imoveis
          WHERE estado IS NOT NULL AND estado != '' AND cidade IS NOT NULL AND cidade != '' AND bairro IS NOT NULL AND bairro != ''`
  },
  {
    nome: 'leads (perfil_ia)',
    sql: `SELECT DISTINCT perfil_ia->>'estado' AS estado, perfil_ia->>'cidade' AS cidade, perfil_ia->>'bairro' AS bairro FROM leads
          WHERE COALESCE(perfil_ia->>'estado','') != '' AND COALESCE(perfil_ia->>'cidade','') != '' AND COALESCE(perfil_ia->>'bairro','') != ''`
  },
  {
    nome: 'interessados_portal',
    sql: `SELECT DISTINCT estado, cidade, bairro FROM interessados_portal
          WHERE estado IS NOT NULL AND estado != '' AND cidade IS NOT NULL AND cidade != '' AND bairro IS NOT NULL AND bairro != ''`
  }
];

async function run() {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  let totalLidos = 0;
  let totalNovos = 0;
  const vistos = new Set(); // evita re-tentar o mesmo trio já processado nessa rodada (as 3 fontes se sobrepõem bastante)

  for (const fonte of FONTES) {
    let rows;
    try {
      const r = await query(fonte.sql);
      rows = r.rows;
    } catch (e) {
      console.log(`[${fonte.nome}] não deu pra ler (tabela/coluna pode não existir): ${e.message} — pulando essa fonte`);
      continue;
    }
    console.log(`[${fonte.nome}] ${rows.length} combinação(ões) estado/cidade/bairro distinta(s) encontrada(s)`);
    totalLidos += rows.length;
    let novosDestaFonte = 0;

    for (const row of rows) {
      const uf = SIGLA_POR_CHAVE[norm(row.estado)];
      const cidade = norm(row.cidade);
      const bairro = norm(row.bairro);
      if (!uf || !cidade || !bairro || bairro.length < 3) continue;
      const chave = uf + '|' + cidade + '|' + bairro;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      try {
        const ins = await query(`INSERT INTO localidades(bairro,cidade,estado,fonte) VALUES($1,$2,$3,'interno') ON CONFLICT DO NOTHING`, [bairro, cidade, uf]);
        if (ins.rowCount > 0) { totalNovos++; novosDestaFonte++; }
      } catch (e) {}
    }
    console.log(`[${fonte.nome}] ${novosDestaFonte} bairro(s) novo(s) adicionado(s) em localidades`);
  }

  console.log('\n=== CONCLUÍDO ===');
  console.log('Total de linhas lidas nas 3 fontes:', totalLidos);
  console.log('Combinações únicas processadas:', vistos.size);
  console.log('Bairros novos inseridos em localidades:', totalNovos);
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
