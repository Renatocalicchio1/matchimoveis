const fs = require('fs');
const { searchQuintoAndar } = require('./services/quintoandar');
const { passaFiltros, normalizeTipo, normBairro } = require('./services/matchquintoandarcorreto');

const DATA_FILE = './data.json';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function scoreMatch(origin, c) {
  let score = 0;
  const valor = c.valor_imovel || c.valor || 0;
  const baseValor = origin.valor_imovel || origin.valor || 0;
  const area = c.area_m2 || c.area || 0;
  const baseArea = origin.area_m2 || origin.area || 0;
  if (baseValor > 0 && valor < baseValor) { score += 50; score += Math.round(((baseValor - valor) / baseValor) * 20); }
  if (area > baseArea) score += 30;
  if ((c.quartos || 0) > (origin.quartos || 0)) score += 20;
  if ((c.suites || 0) >= (origin.suites || 0)) score += 15; else score += 5;
  if ((c.vagas || 0) >= (origin.vagas || 0)) score += 15; else score += 5;
  return score;
}

(async () => {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const leads = Array.isArray(raw) ? raw : (raw.results || []);
  const pendentes = leads.filter(l => l.extractionStatus === 'ok' && !l.matchQuintoAndarStatus);
  console.log('Leads para match QuintoAndar:', pendentes.length);

  let ok = 0, semMatch = 0, erro = 0;

  for (let i = 0; i < pendentes.length; i++) {
    const lead = pendentes[i];
    process.stdout.write('[' + (i+1) + '/' + pendentes.length + '] ' + lead.nome + ' (' + lead.bairro + ') ... ');
    try {
      lead.matchQuintoAndarStatus = 'processando';
      const candidatos = await searchQuintoAndar(lead);
      const filtrados = candidatos.filter(c => passaFiltros(lead, c));
      const scored = filtrados.map(c => ({ ...c, score: scoreMatch(lead, c), bestScore: scoreMatch(lead, c) }));
      scored.sort((a, b) => b.score - a.score);
      const top8 = scored.slice(0, 8);

      // Adiciona aos matches existentes sem duplicar
      const existentes = lead.matchesBase || [];
      const idsExistentes = new Set(existentes.map(m => m.idExterno || m.id || m.id_anuncio));
      const novos = top8.filter(m => !idsExistentes.has(m.id_anuncio || m.id));
      lead.matchesBase = [...existentes, ...novos];
      lead.matchCountBase = lead.matchesBase.length;
      lead.matchQuintoAndarStatus = 'ok';
      lead.matchQuintoAndarAt = new Date().toISOString();

      if (novos.length > 0) { ok++; console.log(novos.length + ' matches QA'); }
      else { semMatch++; console.log('sem match'); }

      // Salva a cada 5 leads
      if ((i + 1) % 5 === 0) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(leads, null, 2));
        console.log('--- Salvo ---');
      }
      await sleep(2000);
    } catch(e) {
      erro++;
      lead.matchQuintoAndarStatus = 'erro';
      console.log('ERRO: ' + e.message);
    }
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(leads, null, 2));
  console.log('\nConcluido! ok:' + ok + ' semMatch:' + semMatch + ' erro:' + erro);
  process.exit(0);
})();
