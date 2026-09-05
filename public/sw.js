const CACHE = 'match-v1';
const STATIC = ['/', '/app/feed', '/app/mapa', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// Motor de Retenção, Fase 7 — Notification Engine, tier "urgente" (ver
// CLAUDE.md). Payload sempre vem do servidor via web-push, nunca gerado
// no próprio client — o texto já reflete um evento real (Fase 2/9).
self.addEventListener('push', e => {
  let dados = {};
  try { dados = e.data ? e.data.json() : {}; } catch (err) { dados = { titulo: 'MatchImóveis', corpo: e.data ? e.data.text() : '' }; }
  const titulo = dados.titulo || 'MatchImóveis';
  const opcoes = {
    body: dados.corpo || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: dados.url || '/app/resumo' }
  };
  e.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app/resumo';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const c of clientList) { if (c.url.includes(url) && 'focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
