const CACHE = 'jidelnicek-v2edbd7a';
const SHELL = [
  '/jidelnicek/',
  '/jidelnicek/index.html',
  '/jidelnicek/app.css',
  '/jidelnicek/js/app.js',
  '/jidelnicek/js/state.js',
  '/jidelnicek/js/helpers.js',
  '/jidelnicek/js/config.js',
  '/jidelnicek/js/modals.js',
  '/jidelnicek/js/render/nav.js',
  '/jidelnicek/js/render/day.js',
  '/jidelnicek/js/render/week.js',
  '/jidelnicek/js/render/recipes.js',
  '/jidelnicek/js/render/menu.js',
  '/jidelnicek/manifest.json',
  '/jidelnicek/icons/icon.svg',
  '/jidelnicek/shared/cnfd.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Pass through: API calls, GitHub raw content, fonts
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

  // Cache-first for app shell (same origin)
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
  }
});
