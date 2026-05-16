const fs = require('fs');
const { searchQuintoAndar } = require('./services/quintoandar');
const { findTopMatches } = require('./services/matcher');

const DATA_FILE = 'data.json';

function load() {
  return fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : [];
}
function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function originValido(item) {
  const o = item.origin || {};
  return o.extractionStatus === 'ok' && o.bairro && o.tipo && o.cidade && o.area_m2 && o.quartos !== undefined;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const data = load();
  const pendentes = data.filter(item => {
    if (!originValido(item)) return false;
    if (item.matchUnificado && item.matchUnificadoAt) return false;
    return true;
  });

  console.log(`\n🔍 LEADS PARA MATCH: ${pendentes.length} de ${data.length}\n`);

  let processados = 0;

  for (const item of pendentes) {
    const origin = item.origin;
    processados++;
    console.log(`\n[${processados}/${pendentes.length}] LEAD: ${item.nome || item.clientName}`);
    console.log(`  BAIRRO: ${origin.bairro} | TIPO: ${origin.tipo} | VALOR: R$ ${origin.valor_imovel}`);

    try {
      // Busca QuintoAndar
      const quintoAndarResults = await searchQuintoAndar(origin);

      // Match com Rankim + QuintoAndar
      const matches = findTopMatches(origin, quintoAndarResults);

      item.matches = matches;
      item.matchCount = matches.length;
      item.bestScore = matches[0] ? matches[0].score : 0;
      item.matchedAt = new Date().toISOString();
      item.matchUnificado = true;
      item.matchUnificadoAt = new Date().toISOString();
      item.matchFontes = ['rankim', 'quintoandar'];

      console.log(`  ✅ ${matches.length} matches encontrados`);
      save(data);
    } catch(e) {
      console.log('  ❌ ERRO:', e.message);
    }

    // Pausa entre leads para não sobrecarregar
    await sleep(3000);
  }

  console.log(`\n✅ CONCLUÍDO: ${processados} leads processados`);
})();
