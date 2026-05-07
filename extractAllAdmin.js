const fs = require('fs');
const { extractProperty } = require('./services/extratorcorreto-ajustado.js');
const DATA_FILE = './data.json';
const LOTE = 10;
const LIMITE = 400;

async function main() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const leads = Array.isArray(raw) ? raw : (raw.results || []);

  const { norm } = require('./matchBaseInterna.js');
  const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));
  const imoveisArr = Array.isArray(imoveis) ? imoveis : (imoveis.imoveis || []);
  const bairrosBase = new Set(imoveisArr.map(i => norm(i.bairro)).filter(Boolean));

  const pendentes = leads.filter(l =>
    l.userId === 'imobiliaria-47991919191' && l.url && l.url.includes('imovelweb') &&
    l.extractionStatus !== 'ok' && l.bairro && bairrosBase.has(norm(l.bairro))
  ).slice(0, LIMITE);

  console.log('Total para extrair: ' + pendentes.length);
  let ok = 0, removidosIndisponiveis = 0, removidosSemBairro = 0, erro = 0;
  const idsRemover = new Set();

  for (let i = 0; i < pendentes.length; i++) {
    const lead = pendentes[i];
    const temBairro = lead.bairro && lead.bairro.trim().length > 2;
    process.stdout.write('[' + (i+1) + '/' + pendentes.length + '] ' + lead.nome + ' (' + lead.bairro + ') ... ');
    try {
      const r = await extractProperty({ url: lead.url }, lead.origin || {});
      if (r.indisponivel) {
        idsRemover.add(lead.id || lead.url);
        removidosIndisponiveis++;
        console.log('REMOVIDA - indisponivel');
        continue;
      }
      if (!temBairro && r.bairro && r.bairro.trim().length > 2) lead.bairro = r.bairro;
      if (!lead.bairro || lead.bairro.trim().length <= 2) {
        idsRemover.add(lead.id || lead.url);
        removidosSemBairro++;
        console.log('REMOVIDA - sem bairro');
        continue;
      }
      lead.tipo         = r.tipo         || lead.tipo      || '';
      lead.area_m2      = r.area_m2      || lead.area_m2   || 0;
      lead.quartos      = r.quartos      || lead.quartos   || 0;
      lead.suites       = r.suites       || lead.suites    || 0;
      lead.banheiros    = r.banheiros    || lead.banheiros || 0;
      lead.vagas        = r.vagas        || lead.vagas     || 0;
      lead.valor_imovel = r.valor_imovel || lead.valor_imovel || 0;
      lead.logradouro   = r.logradouro   || lead.logradouro || '';
      lead.indisponivel = false;
      lead.extractionStatus = 'ok';
      ok++;
      console.log('OK - tipo:' + lead.tipo + ' | q:' + lead.quartos + ' | area:' + lead.area_m2 + ' | v:' + lead.valor_imovel);
    } catch(e) {
      erro++;
      console.log('ERRO: ' + e.message);
    }
    if ((i + 1) % LOTE === 0) {
      // Salva o array ORIGINAL que tem as referências atualizadas
      const filtrado = leads.filter(l => !idsRemover.has(l.id || l.url));
      fs.writeFileSync(DATA_FILE, JSON.stringify(filtrado, null, 2));
      console.log('--- Lote salvo | ok:' + ok + ' indisp:' + removidosIndisponiveis + ' semBairro:' + removidosSemBairro + ' ---');
    }
  }

  // Salva final com o array original
  const filtrado = leads.filter(l => !idsRemover.has(l.id || l.url));
  fs.writeFileSync(DATA_FILE, JSON.stringify(filtrado, null, 2));
  console.log('\nok:' + ok + ' indisp:' + removidosIndisponiveis + ' semBairro:' + removidosSemBairro + ' erro:' + erro);
  console.log('Total restante:', filtrado.length);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
