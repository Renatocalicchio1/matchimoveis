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
  console.log('[xmlScheduler] ⏱️ XML 24h scheduler iniciado');

  // roda imediatamente na inicialização
  rodarSync();

  // verifica a cada 1h
  setInterval(rodarSync, 60 * 60 * 1000);
}

module.exports = { iniciarScheduler, sincronizarFeedsComUsers, rodarSync };
