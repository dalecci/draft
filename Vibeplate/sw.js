// Vibrant Resonance — service worker: app shell cached for offline use.
const CACHE = 'vr-shell-v23';
const SHELL = [
  './', 'index.html', 'css/app.css', 'icon.svg', 'manifest.webmanifest',
  'js/kb-data.js', 'js/audio-engine.js', 'js/sync.js', 'js/brain.js', 'js/brain-ai.js',
  'js/player.js', 'js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // never intercept the AI API or other hosts
  if (url.pathname.startsWith('/api/')) return; // network only — sync layer handles offline
  if (e.request.method !== 'GET') return;
  // Network-first so updates land, cache fallback so offline works.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
