// Motor de Retenção, Fase 7 — Notification Engine, push do zero (ver
// CLAUDE.md). sw.js antes só fazia cache offline — zero listener de push,
// zero chave VAPID, zero tabela de inscrição. Chaves VAPID via env var
// (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY) — precisam ser adicionadas no
// Render pelo Renato antes do envio funcionar de verdade; sem elas, as
// funções abaixo não quebram nada, só não enviam (log de aviso 1x).
const webpush = require('web-push');
const { getPool, dbOk } = require('./db');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
let _vapidConfigurado = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails('mailto:contato@matchimoveis.online', VAPID_PUBLIC, VAPID_PRIVATE);
    _vapidConfigurado = true;
  } catch (e) { console.error('[push] VAPID inválido:', e.message); }
} else {
  console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas — push desativado até serem adicionadas no ambiente.');
}

let _tabelaPronta = false;
async function _garantirTabela() {
  if (_tabelaPronta || !dbOk()) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      usuario_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_usuario ON push_subscriptions(usuario_id)`);
  _tabelaPronta = true;
}

function chavePublica() { return VAPID_PUBLIC; }

async function inscrever(usuarioId, subscription) {
  if (!usuarioId || !subscription || !subscription.endpoint) return false;
  try {
    await _garantirTabela();
    if (!dbOk()) return false;
    await getPool().query(
      `INSERT INTO push_subscriptions (usuario_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
       ON CONFLICT (endpoint) DO UPDATE SET usuario_id = EXCLUDED.usuario_id`,
      [String(usuarioId), subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );
    return true;
  } catch (e) { console.error('[push] inscrever', e.message); return false; }
}

async function desinscrever(endpoint) {
  if (!endpoint || !dbOk()) return;
  try { await getPool().query(`DELETE FROM push_subscriptions WHERE endpoint=$1`, [endpoint]); }
  catch (e) { console.error('[push] desinscrever', e.message); }
}

// Envia pra TODAS as inscrições do usuário (pode ter mais de 1 aparelho).
// Inscrição inválida/expirada (410/404) é removida automaticamente.
async function enviarPush(usuarioId, { titulo, corpo, url }) {
  if (!_vapidConfigurado || !usuarioId || !dbOk()) return;
  try {
    await _garantirTabela();
    const r = await getPool().query(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE usuario_id=$1`, [String(usuarioId)]);
    const payload = JSON.stringify({ titulo, corpo, url });
    await Promise.all(r.rows.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await desinscrever(sub.endpoint);
        else console.error('[push] envio', sub.endpoint, e.message);
      }
    }));
  } catch (e) { console.error('[push] enviarPush', e.message); }
}

module.exports = { chavePublica, inscrever, desinscrever, enviarPush };
