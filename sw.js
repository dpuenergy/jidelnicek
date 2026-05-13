const CACHE = 'jidelnicek-v11x';

// Soubory předem cachované při instalaci (malé, stabilní)
const PRECACHE = [
  '/jidelnicek/manifest.json',
  '/jidelnicek/icons/icon.svg',
];

// JS/CSS — network-first (vždy čerstvé, cache jako fallback offline)
const JS_CSS = /\.(js|css)(\?.*)?$/;
// Velká data — cache-first (390 KB, mění se jen při novém plánu)
const BIG_DATA = /\/shared\/(cnfd|index)\.json(\?.*)?$/;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_ACTIVATED' })))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Pass through: external API calls, fonts
  if (
    url.hostname === 'api.anthropic.com' ||
    url.hostname === 'api.github.com' ||
    url.hostname === 'raw.githubusercontent.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'world.openfoodfacts.org'
  ) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // Velká data (cnfd.json, index.json) — cache-first, aktualizuje se na pozadí
  if (BIG_DATA.test(path)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // JS a CSS — network-first (čerstvý kód), fallback cache při offline
  if (JS_CSS.test(path)) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Vše ostatní (HTML, manifest, ikony) — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      });
    })
  );
});
