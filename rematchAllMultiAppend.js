const fs = require('fs');
const { searchQuintoAndar } = require('./services/quintoandar');
const { searchRemax } = require('./services/remax');
const { findTopMatches } = require('./services/matcher');

const file = 'data.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

function key(m) {
  return String(
    m.url ||
    m.id_anuncio_quintoandar ||
    m.id_anuncio_remax ||
    m.id_anuncio ||
    ''
  ).trim();
}

async function safeSearch(label, fn, origin) {
  try {
    console.log(`BUSCANDO ${label}...`);
    const result = await fn(origin);
    console.log(`${label} CANDIDATOS:`, result.length);
    return result;
  } catch (e) {
    console.log(`ERRO ${label}:`, e.message);
    return [];
  }
}

(async () => {
  let perfis = 0;
  let novosTotal = 0;
  let novosQuinto = 0;
  let novosRemax = 0;

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

    const candidatosQuinto = await safeSearch('QUINTOANDAR', searchQuintoAndar, origin);
    const candidatosRemax = await safeSearch('REMAX', searchRemax, origin);

    const matchesQuinto = findTopMatches(origin, candidatosQuinto, 8).map(m => ({
      ...m,
      fonte: m.fonte || 'QuintoAndar'
    }));

    const matchesRemax = findTopMatches(origin, candidatosRemax, 8).map(m => ({
      ...m,
      fonte: m.fonte || 'REMAX'
    }));

    const candidatosNovos = [...matchesQuinto, ...matchesRemax]
      .filter(m => {
        const k = key(m);
        return k && !existentes.has(k);
      });

    if (candidatosNovos.length) {
      item.matches = atuais.concat(candidatosNovos)
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
        .map((m, idx) => ({
          ...m,
          rank: idx + 1
        }));

      item.matchCount = item.matches.length;
      item.bestScore = Math.max(...item.matches.map(m => Number(m.score || 0)));
      item.matchedAt = new Date().toISOString();

      fs.writeFileSync(file, JSON.stringify(data, null, 2));

      const addQuinto = candidatosNovos.filter(m => m.fonte === 'QuintoAndar').length;
      const addRemax = candidatosNovos.filter(m => m.fonte === 'REMAX').length;

      novosTotal += candidatosNovos.length;
      novosQuinto += addQuinto;
      novosRemax += addRemax;

      console.log('NOVOS MATCHES:', candidatosNovos.length);
      console.log('NOVOS QUINTOANDAR:', addQuinto);
      console.log('NOVOS REMAX:', addRemax);
      console.log('TOTAL AGORA:', item.matches.length);
    } else {
      console.log('NOVOS MATCHES: 0');
    }
  }

  console.log('\\n============================');
  console.log('PERFIS REPROCESSADOS:', perfis);
  console.log('NOVOS MATCHES ADICIONADOS:', novosTotal);
  console.log('NOVOS QUINTOANDAR:', novosQuinto);
  console.log('NOVOS REMAX:', novosRemax);
  console.log('============================');
})();
