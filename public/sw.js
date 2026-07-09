// Service Worker — La Délicieuse Diète
// Deux responsabilités distinctes dans ce fichier :
//   1. Notifications push (existant, inchangé)
//   2. Installabilité PWA + cache minimal de l'app shell pour un chargement plus rapide
//      et une tolérance basique au hors-ligne (nécessaire aux critères d'installation).

const CACHE_VERSION = 'ld-pwa-v1';
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon.png'];

// ── Installation : met en cache l'app shell minimal ────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // best-effort — ne bloque jamais l'installation du SW
  );
  self.skipWaiting();
});

// ── Activation : nettoie les anciennes versions de cache ───────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch : réseau en priorité, repli sur le cache (navigation hors-ligne + assets) ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // laisse passer les requêtes tierces (API, images externes…)
  if (url.pathname.startsWith('/api/')) return; // jamais de cache sur les données dynamiques

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        throw new Error('network-and-cache-miss');
      })
  );
});

// ── Notifications push (existant) ──────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'La Délicieuse Diète', body: event.data.text(), url: '/' }; }

  const options = {
    body:    data.body    ?? '',
    icon:    '/favicon.ico',
    badge:   '/favicon.ico',
    vibrate: [200, 100, 200],
    data:    { url: data.url ?? '/' },
  };
  event.waitUntil(self.registration.showNotification(data.title ?? 'La Délicieuse Diète', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(clients.openWindow(url));
});
