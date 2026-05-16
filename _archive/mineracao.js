const fs = require('fs');
const { searchQuintoAndar } = require('./services/quintoandar');
const { searchRemax } = require('./services/remax');
const { searchOLX } = require('./services/olx');

const MINERACAO_FILE = 'mineracao.json';
const DATA_FILE = 'data.json';
const PAUSA_ENTRE_BUSCAS = 3000;
const PAUSA_ENTRE_RODADAS = 60000;

function loadMineracao() {
  if (!fs.existsSync(MINERACAO_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(MINERACAO_FILE, 'utf8')); }
  catch (e) { return []; }
}

function saveMineracao(data) {
  fs.writeFileSync(MINERACAO_FILE, JSON.stringify(data, null, 2));
}

function loadLeads() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return []; }
}

function chave(imovel) {
  if (imovel.url) return imovel.url;
  return [imovel.fonte, imovel.bairro, imovel.tipo, imovel.valor_imovel || imovel.valor, imovel.area_m2 || imovel.area].join('|');
}

function normalizar(imovel, fonte) {
  return {
    fonte:        fonte || imovel.fonte || 'desconhecido',
    url:          imovel.url || '',
    tipo:         imovel.tipo || '',
    bairro:       imovel.bairro || '',
    cidade:       imovel.cidade || 'São Paulo',
    estado:       imovel.estado || 'SP',
    valor_imovel: imovel.valor_imovel || imovel.valor || 0,
    area_m2:      imovel.area_m2 || imovel.area || 0,
    quartos:      imovel.quartos || 0,
    suites:       imovel.suites || 0,
    banheiros:    imovel.banheiros || 0,
    vagas:        imovel.vagas || 0,
    telefone:     imovel.telefone || '',
    anunciante:   imovel.anunciante || imovel.tipoAnunciante || '',
    titulo:       imovel.titulo || '',
    mineradoEm:   new Date().toISOString()
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function extrairPerfis(leads) {
  const vistos = new Set();
  const perfis = [];
  for (const lead of leads) {
    const o = lead.origin;
    if (!o || o.extractionStatus !== 'ok') continue;
    if (!o.bairro || !o.tipo) continue;
    const key = `${o.tipo}|${o.bairro}|${o.cidade || 'São Paulo'}`;
    if (vistos.has(key)) continue;
    vistos.add(key);
    perfis.push({
      tipo: o.tipo, bairro: o.bairro, cidade: o.cidade || 'São Paulo',
      estado: o.estado || 'SP', valor_imovel: o.valor_imovel || 0,
      area_m2: o.area_m2 || 0, quartos: o.quartos || 0,
      suites: o.suites || 0, banheiros: o.banheiros || 0, vagas: o.vagas || 0
    });
  }
  return perfis;
}

async function minerarRodada(perfis, mineracao) {
  const indicesPorChave = new Map(mineracao.map((m, i) => [chave(m), i]));
  let novos = 0, atualizados = 0;

  for (let i = 0; i < perfis.length; i++) {
    const perfil = perfis[i];
    console.log(`\n[${i+1}/${perfis.length}] Minerando: ${perfil.tipo} | ${perfil.bairro}`);

    const [qa, re, olx] = await Promise.allSettled([
      searchQuintoAndar(perfil),
      searchRemax(perfil),
      searchOLX(perfil)
    ]);

    const resultados = [
      ...(qa.status  === 'fulfilled' ? qa.value.map(c  => normalizar(c, 'quintoandar')) : []),
      ...(re.status  === 'fulfilled' ? re.value.map(c  => normalizar(c, 'remax'))       : []),
      ...(olx.status === 'fulfilled' ? olx.value.map(c => normalizar(c, 'olx'))         : [])
    ];

    if (qa.status  === 'rejected') console.log('  ⚠️  QA erro:',  qa.reason?.message);
    if (re.status  === 'rejected') console.log('  ⚠️  RE erro:',  re.reason?.message);
    if (olx.status === 'rejected') console.log('  ⚠️  OLX erro:', olx.reason?.message);

    console.log(`  📦 QA:${qa.status==='fulfilled'?qa.value.length:0} REMAX:${re.status==='fulfilled'?re.value.length:0} OLX:${olx.status==='fulfilled'?olx.value.length:0}`);

    for (const imovel of resultados) {
      const k = chave(imovel);
      if (indicesPorChave.has(k)) {
        const idx = indicesPorChave.get(k);
        if (imovel.telefone && !mineracao[idx].telefone) {
          mineracao[idx].telefone = imovel.telefone;
          mineracao[idx].atualizadoEm = new Date().toISOString();
          atualizados++;
        }
      } else {
        mineracao.push(imovel);
        indicesPorChave.set(k, mineracao.length - 1);
        novos++;
      }
    }

    saveMineracao(mineracao);
    if (i < perfis.length - 1) await sleep(PAUSA_ENTRE_BUSCAS);
  }
  return { novos, atualizados };
}

(async () => {
  console.log('🚀 MINERAÇÃO CONTÍNUA INICIADA — Ctrl+C para parar\n');
  let rodada = 1;

  while (true) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🔄 RODADA ${rodada} — ${new Date().toLocaleString('pt-BR')}`);
    console.log('='.repeat(50));

    const leads     = loadLeads();
    const mineracao = loadMineracao();
    const perfis    = extrairPerfis(leads);

    console.log(`📊 Leads: ${leads.length} | Minerados: ${mineracao.length} | Perfis únicos: ${perfis.length}`);

    if (perfis.length > 0) {
      const { novos, atualizados } = await minerarRodada(perfis, mineracao);
      console.log(`\n✅ RODADA ${rodada} — ➕ Novos: ${novos} | 🔄 Atualizados: ${atualizados} | 🏠 Total: ${loadMineracao().length}`);
    }

    rodada++;
    console.log(`\n⏳ Aguardando 60s...`);
    await sleep(PAUSA_ENTRE_RODADAS);
  }
})();
