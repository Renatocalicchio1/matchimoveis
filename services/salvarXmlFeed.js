const { query, dbOk } = require('./db');
const fs = require('fs');
const path = require('path');

function feedsPath() {
  const DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
  return path.join(DIR, 'xml-feeds.json');
}

async function lerFeeds(userId) {
  if (await dbOk()) {
    try {
      const sql = userId
        ? 'SELECT * FROM xml_feeds WHERE user_id=$1 ORDER BY criado_em DESC'
        : 'SELECT * FROM xml_feeds ORDER BY criado_em DESC';
      const res = await query(sql, userId ? [userId] : []);
      return res.rows.map(r => ({
        userId: r.user_id, url: r.url, tipo: r.tipo,
        portal: r.portal, arquivo: r.arquivo,
        lastSyncAt: r.last_sync_at, total: r.total,
        lastResult: r.last_result, ativo: r.ativo
      }));
    } catch(e) { console.error('[lerFeeds PG]', e.message); }
  }
  const todos = fs.existsSync(feedsPath()) ? JSON.parse(fs.readFileSync(feedsPath(),'utf8')) : [];
  return userId ? todos.filter(f => f.userId === userId) : todos;
}

async function salvarFeed(feed) {
  if (await dbOk()) {
    try {
      await query(`
        INSERT INTO xml_feeds (user_id, url, tipo, portal, arquivo, last_sync_at, total, last_result, ativo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (user_id, url) DO UPDATE SET
          last_sync_at=EXCLUDED.last_sync_at, total=EXCLUDED.total,
          last_result=EXCLUDED.last_result, ativo=EXCLUDED.ativo,
          arquivo=EXCLUDED.arquivo
      `, [feed.userId, feed.url, feed.tipo||'importado', feed.portal||null,
          feed.arquivo||null, feed.lastSyncAt||null, feed.total||0,
          feed.lastResult||null, feed.ativo!==false]);
      return feed;
    } catch(e) { console.error('[salvarFeed PG]', e.message); }
  }
  const todos = fs.existsSync(feedsPath()) ? JSON.parse(fs.readFileSync(feedsPath(),'utf8')) : [];
  const idx = todos.findIndex(f => f.userId===feed.userId && f.url===feed.url);
  if (idx>=0) todos[idx] = {...todos[idx],...feed};
  else todos.push(feed);
  fs.writeFileSync(feedsPath(), JSON.stringify(todos,null,2));
  return feed;
}

async function removerFeed(userId, url) {
  if (await dbOk()) {
    try {
      await query('DELETE FROM xml_feeds WHERE user_id=$1 AND url=$2', [userId, url]);
      return true;
    } catch(e) { console.error('[removerFeed PG]', e.message); }
  }
  const todos = fs.existsSync(feedsPath()) ? JSON.parse(fs.readFileSync(feedsPath(),'utf8')) : [];
  const novos = todos.filter(f => !(f.userId===userId && f.url===url));
  fs.writeFileSync(feedsPath(), JSON.stringify(novos,null,2));
  return true;
}

module.exports = { lerFeeds, salvarFeed, removerFeed };
