const fs = require('fs');
const { searchQuintoAndar } = require('./services/quintoandar');
const { findTopMatches } = require('./services/matcher');

const file = 'data.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

function key(m) {
  return String(m.url || m.id_anuncio_quintoandar || m.id_anuncio_remax || m.id_anuncio || '').trim();
}

(async () => {
  let perfis = 0;
  let novosTotal = 0;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const origin = item.origin || {};

    if (origin.extractionStatus !== 'ok') continue;
    if (origin.cidade !== 'São Paulo' || origin.estado !== 'SP') continue;

    perfis++;

    console.log('\\n============================');
    console.log('REPROCESSANDO ID:', i, origin.bairro, origin.tipo, origin.quartos);

    const atuais = Array.isArray(item.matches) ? item.matches : [];
    const existentes = new Set(atuais.map(key).filter(Boolean));

    const candidatos = await searchQuintoAndar(origin);
    const novosMatches = findTopMatches(origin, candidatos, 8)
      .filter(m => {
        const k = key(m);
        return k && !existentes.has(k);
      });

    if (novosMatches.length) {
      item.matches = atuais.concat(novosMatches).map((m, idx) => ({
        ...m,
        rank: idx + 1
      }));

      item.matchCount = item.matches.length;
      item.bestScore = Math.max(...item.matches.map(m => Number(m.score || 0)));
      item.matchedAt = new Date().toISOString();

      novosTotal += novosMatches.length;
      fs.writeFileSync(file, JSON.stringify(data, null, 2));

      console.log('NOVOS MATCHES:', novosMatches.length);
      console.log('TOTAL AGORA:', item.matches.length);
    } else {
      console.log('NOVOS MATCHES: 0');
    }
  }

  console.log('\\n============================');
  console.log('PERFIS REPROCESSADOS:', perfis);
  console.log('NOVOS MATCHES ADICIONADOS:', novosTotal);
  console.log('============================');
})();
