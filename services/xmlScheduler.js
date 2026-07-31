/**
 * services/xmlScheduler.js
 * Conecta users.xmlUrl → xml-feeds.json → syncXmlFeeds()
 * Roda a cada 1h, reimporta XMLs que passaram 24h sem sync.
 */

const fs   = require('fs');
const path = require('path');
const { syncXmlFeeds } = require('./xmlSync');
const { consumir } = require('./creditos');

function getDataDir() {
  return process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
}

function dataPath(file) {
  return path.join(getDataDir(), file);
}

async function sincronizarFeedsComUsers() {
  try {
    let users = [];
    try {
      const { lerUsuarios } = require('./salvarUsuario');
      users = await lerUsuarios();
    } catch(e) {
      users = fs.existsSync(dataPath('users.json'))
        ? JSON.parse(fs.readFileSync(dataPath('users.json'), 'utf8'))
        : [];
    }

    const feedsPath = dataPath('xml-feeds.json');
    const feedsExistentes = fs.existsSync(feedsPath)
      ? JSON.parse(fs.readFileSync(feedsPath, 'utf8'))
      : [];

    const mapaExistentes = {};
    feedsExistentes.forEach(f => { mapaExistentes[f.userId] = f; });

    const feedsAtualizados = [];

    users.forEach(u => {
      const uid = u.id || u.userId;
      if (!u.xmlUrl) return;

      feedsAtualizados.push({
        userId: uid,
        url: u.xmlUrl,
        lastSyncAt: mapaExistentes[uid]?.lastSyncAt || null,
        lastResult: mapaExistentes[uid]?.lastResult || null
      });
    });

    fs.writeFileSync(feedsPath, JSON.stringify(feedsAtualizados, null, 2));
    console.log(`[xmlScheduler] ${feedsAtualizados.length} feeds sincronizados com users.json`);
    return feedsAtualizados;
  } catch(e) {
    console.error('[xmlScheduler] Erro ao sincronizar feeds:', e.message);
    return [];
  }
}

async function rodarSync() {
  try {
    await sincronizarFeedsComUsers();
    await syncXmlFeeds();
  } catch(e) {
    console.error('[xmlScheduler] Erro no sync:', e.message);
  }
}

function iniciarScheduler() {
  console.log('[xmlScheduler] ⏱️ XML scheduler iniciado — sync pesado (reimporta XML) travado pra rodar só de madrugada, às 3h (horário de Brasília)');

  // O sync reimporta o XML inteiro de cada feed vencido (pode ser 1000+ imóveis)
  // e le a tabela imoveis inteira pra memoria — pesado o suficiente pra evitar
  // rodar em horario de pico. Antes rodava a cada 1h, o dia todo, espalhado
  // conforme o horario que cada corretor cadastrou o feed originalmente.
  function _proximo3hBR(agora) {
    const hojeSP = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    let alvo = new Date(hojeSP + 'T03:00:00-03:00');
    if (alvo <= agora) {
      const amanhaSP = new Date(alvo.getTime() + 24*60*60*1000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      alvo = new Date(amanhaSP + 'T03:00:00-03:00');
    }
    return alvo;
  }
  const _agora = new Date();
  const _msAte3h = _proximo3hBR(_agora) - _agora;
  setTimeout(() => {
    rodarSync();
    setInterval(rodarSync, 24 * 60 * 60 * 1000);
  }, _msAte3h);
}

module.exports = { iniciarScheduler, sincronizarFeedsComUsers, rodarSync };
