// Service Worker — La Délicieuse Diète
// Trois responsabilités :
//   1. Notifications push (clients : suivi de commande ; équipe : nouvelles commandes)
//   2. Installabilité PWA (iPhone/iPad compris : les notifications web n'y existent que pour un site installé)
//   3. Cache : fichiers à nom unique servis depuis le cache, pages en réseau d'abord avec repli hors-ligne

const CACHE_VERSION = 'ld-pwa-v3';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;   // page d'accueil et fichiers de base, remplacés à chaque version
const ASSET_CACHE = `${CACHE_VERSION}-assets`;  // /assets/* : nom unique par version, donc jamais périmé
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`; // images et autres fichiers, plafonné
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon.png', '/icons/icon-192.png'];
const RUNTIME_MAX_ENTRIES = 60;

// ── Installation : met en cache l'app shell minimal ────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // best-effort — ne bloque jamais l'installation du SW
  );
  self.skipWaiting();
});

// ── Activation : supprime les caches des anciennes versions ────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

function remember(cacheName, request, response) {
  if (!response || !response.ok || response.type === 'opaque') return;
  const clone = response.clone();
  caches.open(cacheName)
    .then((cache) => cache.put(request, clone))
    .then(() => (cacheName === RUNTIME_CACHE ? trim(cacheName, RUNTIME_MAX_ENTRIES) : undefined))
    .catch(() => {});
}

// ── Fetch ───────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // laisse passer les requêtes tierces
  if (url.pathname.startsWith('/api/')) return;     // jamais de cache sur les données dynamiques
  if (url.pathname.startsWith('/socket.io/')) return; // temps réel : requêtes longues, jamais interceptées
  if (url.pathname === '/sw.js') return;            // le navigateur vérifie lui-même les mises à jour du worker

  // Fichiers du site à nom unique (hash) : le cache est toujours bon, aucune requête réseau au 2e passage.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => { remember(ASSET_CACHE, request, response); return response; }))
    );
    return;
  }

  // Pages : réseau d'abord (toujours à jour), repli sur la copie en cache hors connexion.
  // Images et autres fichiers : même principe, avec un cache plafonné pour ne pas grossir sans fin.
  const isPage = request.mode === 'navigate';
  event.respondWith(
    fetch(request)
      .then((response) => {
        remember(isPage ? SHELL_CACHE : RUNTIME_CACHE, request, response);
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (isPage) {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        throw new Error('network-and-cache-miss');
      })
  );
});

// ── Notifications push ──────────────────────────────────────────────────────────
// Chaque push DOIT afficher une notification : Safari (iPhone) retire l'abonnement d'un site qui reçoit des push
// « silencieux ». Même un message illisible produit donc une notification générique.
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); } catch { data = { body: event.data.text() }; }
  }

  const title = data.title || 'La Délicieuse Diète';
  const options = {
    body: data.body || 'Nouvelle notification.',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Même tag = la nouvelle notification remplace la précédente (une seule par commande) au lieu de s'empiler.
    // `renotify` fait sonner à nouveau malgré le remplacement.
    ...(data.tag ? { tag: data.tag, renotify: true } : {}),
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Un lien ne doit jamais sortir du site : on ne suit que les chemins relatifs (« /mon-compte », « /admin/commandes »).
function safeTarget(raw) {
  try {
    const target = new URL(raw || '/', self.location.origin);
    return target.origin === self.location.origin ? target.href : self.location.origin + '/';
  } catch {
    return self.location.origin + '/';
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safeTarget(event.notification.data && event.notification.data.url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      // Appli déjà ouverte (cas courant sur iPhone, où l'icône ouvre la même fenêtre) : on la ramène devant et on y navigue.
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        await open.focus();
        if ('navigate' in open && open.url !== target) {
          try { await open.navigate(target); } catch { /* repli : l'ouverture se fait sans navigation */ }
        }
        return;
      }
      await self.clients.openWindow(target);
    })
  );
});
