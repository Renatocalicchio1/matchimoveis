const fs = require('fs');
const { searchQuintoAndar } = require('./services/quintoandar');
const { searchRemax } = require('./services/remax');
const { searchOLX } = require('./services/olx');
const { findTopMatches } = require('./services/matcher');

const DATA_FILE = 'data.json';

function load() {
  return fs.existsSync(DATA_FILE)
    ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    : [];
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function originValido(item) {
  const o = item.origin || {};
  return (
    o.extractionStatus === 'ok' &&
    o.bairro &&
    o.tipo &&
    o.cidade &&
    o.area_m2 &&
    o.quartos !== undefined &&
    o.quartos !== null
  );
}

(async () => {
  const data = load();

  // Filtra apenas leads com origin válido
  const pendentes = data.filter(item => {
    if (!originValido(item)) return false;

    // Pula se já tem match unificado completo
    if (item.matchUnificado && item.matchUnificadoAt) {
      console.log('⏭️  JÁ TEM MATCH UNIFICADO:', item.origin?.bairro, item.origin?.tipo);
      return false;
    }

    return true;
  });

  console.log(`\n🔍 LEADS PARA MATCH UNIFICADO: ${pendentes.length} de ${data.length} total\n`);

  let processados = 0;
  let erros = 0;

  for (let i = 0; i < pendentes.length; i++) {
    const item = pendentes[i];
    const origin = item.origin;

    console.log(`\n============================`);
    console.log(`[${i + 1}/${pendentes.length}] LEAD: ${item.nome || item.id}`);
    console.log(`  BAIRRO: ${origin.bairro}`);
    console.log(`  TIPO:   ${origin.tipo}`);
    console.log(`  VALOR:  R$ ${origin.valor_imovel?.toLocaleString('pt-BR') || '?'}`);
    console.log(`  ÁREA:   ${origin.area_m2} m²`);
    console.log(`  QTOS:   ${origin.quartos}`);

    try {
      // Busca nas 3 fontes em paralelo
      const [qa, re, olx] = await Promise.allSettled([
        searchQuintoAndar(origin),
        searchRemax(origin),
        searchOLX(origin)
      ]);

      const candidatosQA  = qa.status  === 'fulfilled' ? qa.value  : [];
      const candidatosRe  = re.status  === 'fulfilled' ? re.value  : [];
      const candidatosOLX = olx.status === 'fulfilled' ? olx.value : [];

      if (qa.status  === 'rejected') console.log('  ⚠️  QuintoAndar erro:', qa.reason?.message);
      if (re.status  === 'rejected') console.log('  ⚠️  RE/MAX erro:',      re.reason?.message);
      if (olx.status === 'rejected') console.log('  ⚠️  OLX erro:',         olx.reason?.message);

      console.log(`  📊 Candidatos — QA: ${candidatosQA.length} | REMAX: ${candidatosRe.length} | OLX: ${candidatosOLX.length}`);

      // Marca a fonte de cada candidato
      const todos = [
        ...candidatosQA.map(c  => ({ ...c, fonte: c.fonte || 'quintoandar' })),
        ...candidatosRe.map(c  => ({ ...c, fonte: c.fonte || 'remax' })),
        ...candidatosOLX.map(c => ({ ...c, fonte: c.fonte || 'olx' }))
      ];

      // Passa tudo pelo motor de match (filtra + score + top 8)
      const matches = findTopMatches(origin, todos);

      // Salva no lead
      item.matches          = matches;
      item.matchCount       = matches.length;
      item.bestScore        = matches.length ? matches[0].score : 0;
      item.matchUnificado   = true;
      item.matchUnificadoAt = new Date().toISOString();

      // Contagem por fonte
      item.matchFontes = {
        quintoandar: matches.filter(m => m.fonte === 'quintoandar').length,
        remax:       matches.filter(m => m.fonte === 'remax').length,
        olx:         matches.filter(m => m.fonte === 'olx').length,
        rankim:      matches.filter(m => m.fonte === 'rankim').length
      };

      console.log(`  ✅ MATCHES: ${matches.length} (QA: ${item.matchFontes.quintoandar} | REMAX: ${item.matchFontes.remax} | OLX: ${item.matchFontes.olx} | BASE: ${item.matchFontes.rankim})`);
      if (matches.length) console.log(`  🏆 MELHOR SCORE: ${matches[0].score} — ${matches[0].bairro} | ${matches[0].fonte}`);

      processados++;
      save(data);

    } catch (e) {
      console.log('  ❌ ERRO GERAL:', e.message);
      erros++;
    }

    // Pausa entre leads para não sobrecarregar scrapers
    if (i < pendentes.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\n=============================');
  console.log('🚀 MATCH UNIFICADO FINALIZADO');
  console.log(`  ✅ Processados: ${processados}`);
  console.log(`  ❌ Erros:       ${erros}`);
  console.log(`  📦 Total base:  ${data.length}`);
  console.log('=============================\n');
})();
